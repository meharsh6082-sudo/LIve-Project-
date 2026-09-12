"""
Pulls the daily mandi (agricultural market) price dataset from data.gov.in,
which republishes the government's AGMARKNET data as a free JSON API.

Dataset: "Current Daily Price of Various Commodities for Various Markets (Mandi)"
Resource ID: 9ef84268-d588-465a-a308-a864a43d0070

Get your own free key at https://data.gov.in (Sign Up -> My Account -> API keys)
and set it as DATA_GOV_IN_API_KEY before starting the server.
"""
import asyncio
import os

from curl_cffi import requests

RESOURCE_ID = "9ef84268-d588-465a-a308-a864a43d0070"
BASE_URL = f"https://api.data.gov.in/resource/{RESOURCE_ID}"

def _to_float(val):
    try:
        return float(val)
    except (TypeError, ValueError):
        return None


async def fetch_mandi_prices(states: list[str] | None = None,
                              commodities: list[str] | None = None,
                              limit: int = 100) -> list[dict]:
    api_key = os.getenv("DATA_GOV_IN_API_KEY")
    if not api_key:
        raise RuntimeError(
            "DATA_GOV_IN_API_KEY is not configured; get a free key from data.gov.in"
        )
    params = {
        "api-key": api_key,
        "format": "json",
        "limit": str(limit),
    }
    # data.gov.in supports filters like filters[state.keyword]=Rajasthan
    if states:
        params["filters[state.keyword]"] = states[0]
    if commodities:
        params["filters[commodity.keyword]"] = commodities[0]

    def request_data():
        resp = requests.get(
            BASE_URL,
            params=params,
            timeout=30,
            impersonate="chrome",
        )
        resp.raise_for_status()
        return resp.json()

    data = await asyncio.to_thread(request_data)

    records = data.get("records", [])
    rows = []
    for rec in records:
        rows.append({
            "state": rec.get("state"),
            "district": rec.get("district"),
            "market": rec.get("market"),
            "commodity": rec.get("commodity"),
            "variety": rec.get("variety") or "-",
            "min_price": _to_float(rec.get("min_price")),
            "max_price": _to_float(rec.get("max_price")),
            "modal_price": _to_float(rec.get("modal_price")),
            "arrival_date": rec.get("arrival_date"),
        })
    return [r for r in rows if r["commodity"] and r["modal_price"] is not None]


async def fetch_all_configured(state_list: list[str], commodity_list: list[str]) -> list[dict]:
    """
    The API only lets us filter by one state/commodity per call, so to build
    a varied board we fan out across a configured watchlist and merge results.
    """
    all_rows = []
    for state in state_list or [None]:
        rows = await fetch_mandi_prices(states=[state] if state else None, limit=50)
        all_rows.extend(rows)
    if commodity_list:
        for commodity in commodity_list:
            rows = await fetch_mandi_prices(commodities=[commodity], limit=20)
            all_rows.extend(rows)
    # de-dupe by (market, commodity, variety)
    seen = {}
    for r in all_rows:
        key = (r["market"], r["commodity"], r["variety"])
        seen[key] = r
    return list(seen.values())
