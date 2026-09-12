"""
Pulls near-real-time quotes via yfinance (wraps Yahoo Finance — free, no key,
but unofficial, so treat it as "near live", not exchange-grade). Works for
NSE (.NS suffix), BSE (.BO suffix), and global tickers/indices as-is.
"""
import asyncio
import yfinance as yf


def _fetch_one(symbol: str) -> dict | None:
    try:
        ticker = yf.Ticker(symbol)
        info = ticker.fast_info
        # fast_info is a dict-like object, but only its camelCase keys work
        # with .get(); the reliable way to read it is via attribute access.
        price = info.last_price
        prev_close = info.previous_close
        if price is None:
            return None
        change_pct = ((price - prev_close) / prev_close * 100) if prev_close else 0.0
        return {
            "symbol": symbol,
            "name": symbol.replace(".NS", "").replace(".BO", "").replace("^", ""),
            "price": round(float(price), 2),
            "day_open": round(float(info.open or price), 2),
            "day_high": round(float(info.day_high or price), 2),
            "day_low": round(float(info.day_low or price), 2),
            "change_pct": round(change_pct, 2),
            "volume": int(info.last_volume or 0),
            "currency": info.currency or "INR",
        }
    except Exception:
        return None


async def fetch_stock_prices(symbols: list[str]) -> list[dict]:
    loop = asyncio.get_event_loop()
    results = await asyncio.gather(
        *[loop.run_in_executor(None, _fetch_one, s) for s in symbols]
    )
    return [r for r in results if r]


def _fetch_history(symbol: str, period: str = "1mo") -> list[dict]:
    try:
        history = yf.Ticker(symbol).history(period=period, interval="1d", auto_adjust=False)
        return [
            {"date": index.strftime("%Y-%m-%d"), "close": round(float(row["Close"]), 2)}
            for index, row in history.iterrows()
            if row.get("Close") is not None
        ]
    except Exception:
        return []


async def fetch_stock_history(symbol: str, period: str = "1mo") -> list[dict]:
    return await asyncio.to_thread(_fetch_history, symbol, period)
