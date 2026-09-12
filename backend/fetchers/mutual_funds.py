import asyncio
from functools import lru_cache

from curl_cffi import requests

BASE_URL = "https://api.mfapi.in/mf"


def _get_json(url: str):
    response = requests.get(url, timeout=30, impersonate="chrome")
    response.raise_for_status()
    return response.json()


@lru_cache(maxsize=1)
def _fund_list():
    return _get_json(BASE_URL)


async def search_funds(query: str, limit: int = 30):
    query = query.strip().lower()
    if not query:
        return []
    funds = await asyncio.to_thread(_fund_list)
    return [
        {"scheme_code": fund["schemeCode"], "scheme_name": fund["schemeName"]}
        for fund in funds
        if query in fund.get("schemeName", "").lower()
    ][:limit]


async def get_fund_details(scheme_code: int):
    payload = await asyncio.to_thread(_get_json, f"{BASE_URL}/{scheme_code}")
    records = payload.get("data", [])
    metadata = payload.get("meta", {})
    if not records:
        return None
    latest = records[0]
    previous = records[1] if len(records) > 1 else latest
    latest_nav = float(latest["nav"])
    previous_nav = float(previous["nav"])
    change_pct = ((latest_nav - previous_nav) / previous_nav * 100) if previous_nav else 0
    return {
        "meta": metadata,
        "latest": {
            "date": latest["date"],
            "nav": latest_nav,
            "change_pct": round(change_pct, 4),
        },
        "history": [
            {"date": record["date"], "nav": float(record["nav"])}
            for record in records[:365]
        ],
    }
