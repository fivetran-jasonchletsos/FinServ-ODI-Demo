"""
FRED — Fivetran Connector SDK
=============================
Pulls macro time series from the St. Louis Fed's FRED API.

Endpoints (base https://api.stlouisfed.org/fred/):
  - /series?series_id=...
  - /series/observations?series_id=...&observation_start=...

Tables: series, observations.

ODI angle: macro series land as Iceberg tables in the FinServ-ODI-Demo
managed S3 lake, joinable to SEC EDGAR fundamentals and CFPB complaints.
"""
from __future__ import annotations

import time
from datetime import datetime, timezone, timedelta
from typing import Iterator

import requests
from fivetran_connector_sdk import Connector, Operations as op, Logging as log


FRED_BASE = "https://api.stlouisfed.org/fred"
HTTP_TIMEOUT = 30
RATE_SLEEP = 0.4  # FRED allows ~120 req/min; stay well under.

DEFAULT_SERIES = "DGS10,DGS2,FEDFUNDS,CPIAUCSL,UNRATE,GDP,DGS30,T10Y2Y,UMCSENT,HOUST"
DEFAULT_LOOKBACK_YEARS = 5


# ---------------------------------------------------------------------------
# HTTP helper — single retry on 429 per spec
# ---------------------------------------------------------------------------

def _get(url: str, params: dict) -> dict | None:
    for attempt in (1, 2):
        try:
            resp = requests.get(url, params=params, timeout=HTTP_TIMEOUT)
        except requests.exceptions.RequestException as exc:
            log.warning(f"Request error {url}: {exc}")
            if attempt == 2:
                return None
            time.sleep(2)
            continue

        if resp.status_code == 429:
            log.warning(f"429 from FRED, sleeping 10s")
            time.sleep(10)
            continue
        if resp.status_code == 400:
            log.warning(f"400 from FRED params={params}: {resp.text[:200]}")
            return None
        if resp.status_code >= 400:
            log.warning(f"HTTP {resp.status_code} from FRED: {resp.text[:200]}")
            return None
        return resp.json()
    return None


# ---------------------------------------------------------------------------
# Schema
# ---------------------------------------------------------------------------

def schema(configuration: dict) -> list[dict]:
    return [
        {"table": "series", "primary_key": ["series_id"]},
        {"table": "observations", "primary_key": ["series_id", "date"]},
    ]


# ---------------------------------------------------------------------------
# Sync helpers
# ---------------------------------------------------------------------------

def fetch_series_metadata(series_id: str, api_key: str) -> dict | None:
    data = _get(f"{FRED_BASE}/series",
                {"series_id": series_id, "api_key": api_key, "file_type": "json"})
    if not data:
        return None
    items = data.get("seriess") or []
    if not items:
        return None
    s = items[0]
    return {
        "series_id": s.get("id", series_id),
        "title": s.get("title", ""),
        "units": s.get("units", ""),
        "frequency": s.get("frequency", ""),
        "seasonal_adjustment": s.get("seasonal_adjustment", ""),
        "observation_start": s.get("observation_start", ""),
        "observation_end": s.get("observation_end", ""),
        "notes": (s.get("notes") or "")[:4000],
        "category": s.get("frequency_short", ""),
    }


def fetch_observations(series_id: str, api_key: str, since: str) -> Iterator[dict]:
    offset = 0
    limit = 100000
    while True:
        data = _get(f"{FRED_BASE}/series/observations", {
            "series_id": series_id,
            "api_key": api_key,
            "file_type": "json",
            "observation_start": since,
            "limit": limit,
            "offset": offset,
            "sort_order": "asc",
        })
        if not data:
            return
        obs = data.get("observations") or []
        for o in obs:
            raw = o.get("value")
            if raw in (None, "", "."):
                value = None
            else:
                try:
                    value = float(raw)
                except (ValueError, TypeError):
                    value = None
            yield {
                "series_id": series_id,
                "date": o.get("date", ""),
                "value": value,
            }
        if len(obs) < limit:
            return
        offset += limit
        time.sleep(RATE_SLEEP)


# ---------------------------------------------------------------------------
# update()
# ---------------------------------------------------------------------------

def update(configuration: dict, state: dict):
    api_key = configuration.get("api_key")
    if not api_key:
        raise RuntimeError("configuration.api_key is required for FRED")

    raw = configuration.get("series_seed") or DEFAULT_SERIES
    series_ids = [s.strip() for s in raw.split(",") if s.strip()]
    log.info(f"FRED sync — {len(series_ids)} series: {series_ids}")

    state = state or {}
    last_obs: dict = state.get("last_obs_date", {}) or {}
    default_since = (datetime.now(timezone.utc)
                     - timedelta(days=365 * DEFAULT_LOOKBACK_YEARS)).strftime("%Y-%m-%d")

    total_obs = 0
    for sid in series_ids:
        log.info(f"Fetching FRED metadata for {sid}")
        meta = fetch_series_metadata(sid, api_key)
        if meta:
            yield op.upsert("series", meta)
        time.sleep(RATE_SLEEP)

        since = last_obs.get(sid) or default_since
        log.info(f"Fetching observations for {sid} since {since}")
        max_date = since
        count = 0
        for obs in fetch_observations(sid, api_key, since):
            yield op.upsert("observations", obs)
            count += 1
            total_obs += 1
            if obs["date"] > max_date:
                max_date = obs["date"]
            if count % 500 == 0:
                last_obs[sid] = max_date
                state["last_obs_date"] = last_obs
                yield op.checkpoint(state)

        last_obs[sid] = max_date
        state["last_obs_date"] = last_obs
        yield op.checkpoint(state)
        log.info(f"{sid}: {count} obs synced (through {max_date})")
        time.sleep(RATE_SLEEP)

    log.info(f"FRED complete — total observations={total_obs}")


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------
connector = Connector(update=update, schema=schema)

if __name__ == "__main__":
    connector.debug()
