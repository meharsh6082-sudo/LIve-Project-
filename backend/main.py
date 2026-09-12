import logging
import os
import re
import base64
import hashlib
import hmac
import time
from pathlib import Path

from fastapi import FastAPI, HTTPException, Query, Request
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, JSONResponse
from apscheduler.schedulers.asyncio import AsyncIOScheduler

from database import init_db, upsert_mandi_rows, upsert_stock_rows, get_mandi, get_mandi_meta, get_stocks, get_database_info, backup_database
from fetchers.mandi import fetch_all_configured
from fetchers.mutual_funds import get_fund_details, search_funds
from fetchers.stocks import fetch_stock_history, fetch_stock_prices

logging.basicConfig(level=logging.INFO)
log = logging.getLogger("live-market")

# --- Watchlists: edit these to change what shows up on the board ---
MANDI_STATES = ["Rajasthan", "Maharashtra", "Uttar Pradesh"]
MANDI_COMMODITIES = ["Onion", "Wheat", "Tomato", "Potato", "Cotton"]

STOCK_SYMBOLS = [
    "^NSEI", "^BSESN",              # Nifty 50, Sensex
    "RELIANCE.NS", "TCS.NS", "INFY.NS",
    "HDFCBANK.NS", "ICICIBANK.NS", "PAYTM.NS", "SUZLON.NS",
    "HCLTECH.NS", "SBIN.NS", "ITC.NS", "MARUTI.NS",
    "ADANIENT.NS", "ADANIPORTS.NS", "APOLLOHOSP.NS", "ASIANPAINT.NS",
    "AXISBANK.NS", "BAJAJFINSV.NS", "BAJFINANCE.NS", "BEL.NS",
    "BHARTIARTL.NS", "BPCL.NS", "BRITANNIA.NS", "CIPLA.NS",
    "COALINDIA.NS", "DIVISLAB.NS", "EICHERMOT.NS", "GRASIM.NS",
    "HEROMOTOCO.NS", "HINDALCO.NS", "HINDUNILVR.NS", "INDUSINDBK.NS",
    "JSWSTEEL.NS", "KOTAKBANK.NS", "LT.NS", "M&M.NS",
    "NESTLEIND.NS", "NTPC.NS", "ONGC.NS", "POWERGRID.NS",
    "SUNPHARMA.NS", "TATACONSUM.NS", "TATASTEEL.NS", "TECHM.NS",
    "TITAN.NS", "TRENT.NS", "ULTRACEMCO.NS", "WIPRO.NS",
]

MANDI_REFRESH_SECONDS = int(os.getenv("MANDI_REFRESH_SECONDS", "3600"))   # daily dataset — no need to hammer it
STOCK_REFRESH_SECONDS = int(os.getenv("STOCK_REFRESH_SECONDS", "15"))

FRONTEND_DIR = Path(__file__).parent.parent / "frontend"
ADMIN_PASSWORD = os.getenv("ADMIN_PASSWORD", "admin123")
ADMIN_SESSION_SECRET = os.getenv("ADMIN_SESSION_SECRET", ADMIN_PASSWORD)
ADMIN_SESSION_MAX_AGE = 8 * 60 * 60

app = FastAPI(title="Live Market Board")
scheduler = AsyncIOScheduler()
runtime_settings = {
    "stock_refresh_seconds": int(os.getenv("STOCK_REFRESH_SECONDS", "15")),
    "mandi_refresh_seconds": int(os.getenv("MANDI_REFRESH_SECONDS", "3600")),
}
source_status = {
    "stocks": {"status": "starting", "last_success": None, "rows": 0},
    "mandi": {"status": "starting", "last_success": None, "rows": 0},
}
admin_logs = []


def _admin_cookie_value():
    timestamp = str(int(time.time()))
    signature = hmac.new(ADMIN_SESSION_SECRET.encode(), timestamp.encode(), hashlib.sha256).hexdigest()
    return base64.urlsafe_b64encode(f"{timestamp}.{signature}".encode()).decode()


def _admin_authenticated(request: Request):
    raw = request.cookies.get("admin_session")
    if not raw:
        return False
    try:
        timestamp, signature = base64.urlsafe_b64decode(raw.encode()).decode().split(".", 1)
        if int(time.time()) - int(timestamp) > ADMIN_SESSION_MAX_AGE:
            return False
        expected = hmac.new(ADMIN_SESSION_SECRET.encode(), timestamp.encode(), hashlib.sha256).hexdigest()
        return hmac.compare_digest(signature, expected)
    except (ValueError, TypeError):
        return False


async def refresh_mandi():
    try:
        rows = await fetch_all_configured(MANDI_STATES, MANDI_COMMODITIES)
        if rows:
            upsert_mandi_rows(rows)
            log.info(f"mandi: refreshed {len(rows)} rows")
            source_status["mandi"] = {"status": "ok", "last_success": time.time(), "rows": len(rows)}
            admin_logs.append({"time": time.time(), "message": f"Mandi refresh completed: {len(rows)} rows"})
    except Exception as e:
        source_status["mandi"]["status"] = "error"
        admin_logs.append({"time": time.time(), "message": f"Mandi refresh failed: {type(e).__name__}"})
        log.warning("mandi refresh failed (%s): %s", type(e).__name__, e)


async def refresh_stocks():
    try:
        rows = await fetch_stock_prices(STOCK_SYMBOLS)
        if rows:
            upsert_stock_rows(rows)
            log.info(f"stocks: refreshed {len(rows)} symbols")
            source_status["stocks"] = {"status": "ok", "last_success": time.time(), "rows": len(rows)}
            admin_logs.append({"time": time.time(), "message": f"Stock refresh completed: {len(rows)} symbols"})
    except Exception as e:
        source_status["stocks"]["status"] = "error"
        admin_logs.append({"time": time.time(), "message": f"Stock refresh failed: {type(e).__name__}"})
        log.warning(f"stock refresh failed: {e}")


@app.on_event("startup")
async def startup():
    init_db()
    await refresh_mandi()
    await refresh_stocks()
    scheduler.add_job(refresh_mandi, "interval", seconds=runtime_settings["mandi_refresh_seconds"], id="mandi")
    scheduler.add_job(refresh_stocks, "interval", seconds=runtime_settings["stock_refresh_seconds"], id="stocks")
    scheduler.start()


@app.get("/api/mandi")
def api_mandi(state: str | None = Query(None), commodity: str | None = Query(None), limit: int = 200):
    return get_mandi(state=state, commodity=commodity, limit=limit)


@app.get("/api/mandi/meta")
def api_mandi_meta():
    return get_mandi_meta()


@app.get("/api/stocks")
def api_stocks():
    return get_stocks()


@app.get("/api/stocks/quote")
async def api_stock_quote(symbol: str = Query(..., min_length=1, max_length=32)):
    normalized = symbol.strip().upper()
    if not re.fullmatch(r"[A-Z0-9^&.-]+", normalized):
        raise HTTPException(status_code=400, detail="Invalid Yahoo Finance symbol")
    rows = await fetch_stock_prices([normalized])
    if not rows:
        raise HTTPException(status_code=404, detail="No quote found for this symbol")
    upsert_stock_rows(rows)
    return rows[0]


@app.get("/api/stocks/history")
async def api_stock_history(symbol: str = Query("^NSEI", min_length=1, max_length=32), period: str = Query("1mo", pattern="^(5d|1mo|3mo|6mo|1y)$")):
    normalized = symbol.strip().upper()
    if not re.fullmatch(r"[A-Z0-9^&.-]+", normalized):
        raise HTTPException(status_code=400, detail="Invalid Yahoo Finance symbol")
    return await fetch_stock_history(normalized, period)


@app.get("/api/health")
def health():
    return {"status": "ok"}


@app.post("/api/admin/login")
async def admin_login(request: Request):
    payload = await request.json()
    if not hmac.compare_digest(str(payload.get("password", "")), ADMIN_PASSWORD):
        raise HTTPException(status_code=401, detail="Incorrect admin password")
    response = JSONResponse({"status": "ok"})
    response.set_cookie("admin_session", _admin_cookie_value(), max_age=ADMIN_SESSION_MAX_AGE, httponly=True, samesite="lax")
    return response


@app.post("/api/admin/logout")
def admin_logout():
    response = JSONResponse({"status": "ok"})
    response.delete_cookie("admin_session")
    return response


def require_admin(request: Request):
    if not _admin_authenticated(request):
        raise HTTPException(status_code=401, detail="Admin authentication required")


@app.get("/api/admin/status")
def api_admin_status(request: Request):
    require_admin(request)
    return {"sources": source_status, "database": get_database_info(), "logs": admin_logs[-30:]}


@app.get("/api/admin/settings")
def api_admin_settings(request: Request):
    require_admin(request)
    return runtime_settings


@app.patch("/api/admin/settings")
async def update_admin_settings(request: Request):
    require_admin(request)
    payload = await request.json()
    stock_seconds = int(payload.get("stock_refresh_seconds", runtime_settings["stock_refresh_seconds"]))
    mandi_seconds = int(payload.get("mandi_refresh_seconds", runtime_settings["mandi_refresh_seconds"]))
    if stock_seconds < 5 or mandi_seconds < 60:
        raise HTTPException(status_code=400, detail="Refresh intervals are too short")
    runtime_settings.update({"stock_refresh_seconds": stock_seconds, "mandi_refresh_seconds": mandi_seconds})
    scheduler.reschedule_job("stocks", trigger="interval", seconds=stock_seconds)
    scheduler.reschedule_job("mandi", trigger="interval", seconds=mandi_seconds)
    admin_logs.append({"time": time.time(), "message": "Backend refresh settings updated"})
    return runtime_settings


@app.post("/api/admin/database/backup")
def api_admin_database_backup(request: Request):
    require_admin(request)
    filename = backup_database()
    admin_logs.append({"time": time.time(), "message": f"Database backup created: {filename}"})
    return {"filename": filename}


@app.get("/api/mutual-funds/search")
async def api_mutual_fund_search(q: str = Query(..., min_length=2, max_length=80)):
    return await search_funds(q)


@app.get("/api/mutual-funds/{scheme_code}")
async def api_mutual_fund_details(scheme_code: int):
    details = await get_fund_details(scheme_code)
    if not details:
        raise HTTPException(status_code=404, detail="Mutual fund scheme not found")
    return details


# --- serve the frontend ---
app.mount("/static", StaticFiles(directory=FRONTEND_DIR), name="static")


@app.get("/")
def index():
    return FileResponse(FRONTEND_DIR / "index.html")


@app.get("/stocks")
def stocks_page():
    return FileResponse(FRONTEND_DIR / "stocks.html")


@app.get("/stocks/{symbol}")
def stock_detail_page(symbol: str):
    if not re.fullmatch(r"[A-Za-z0-9^&.-]+", symbol):
        raise HTTPException(status_code=404, detail="Invalid stock symbol")
    return FileResponse(FRONTEND_DIR / "stock-detail.html")


@app.get("/mandi")
def mandi_page():
    return FileResponse(FRONTEND_DIR / "mandi.html")


@app.get("/commodities/{commodity}")
def commodity_detail_page(commodity: str):
    return FileResponse(FRONTEND_DIR / "commodity-detail.html")


@app.get("/alerts")
def alerts_page():
    return FileResponse(FRONTEND_DIR / "alerts.html")


@app.get("/calendar")
def calendar_page():
    return FileResponse(FRONTEND_DIR / "calendar.html")


@app.get("/help")
def help_page():
    return FileResponse(FRONTEND_DIR / "help.html")


@app.get("/analytics")
def analytics_page():
    return FileResponse(FRONTEND_DIR / "analytics.html")


@app.get("/settings")
def settings_page():
    return FileResponse(FRONTEND_DIR / "settings.html")


@app.get("/mutual-funds")
def mutual_funds_page():
    return FileResponse(FRONTEND_DIR / "mutual-funds.html")


@app.get("/mutual-funds/{scheme_code}")
def mutual_fund_detail_page(scheme_code: int):
    return FileResponse(FRONTEND_DIR / "mutual-fund-detail.html")


@app.get("/portfolio")
def portfolio_page():
    return FileResponse(FRONTEND_DIR / "portfolio.html")


@app.get("/admin")
def admin_page(request: Request):
    page = "admin.html" if _admin_authenticated(request) else "admin-login.html"
    return FileResponse(FRONTEND_DIR / page)
