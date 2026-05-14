"""
CFPB Consumer Complaints — Fivetran Connector SDK
=================================================
Pulls consumer complaints from the CFPB public Socrata-style API.

Endpoint:
  https://www.consumerfinance.gov/data-research/consumer-complaints/search/api/v1/
  ?date_received_min=YYYY-MM-DD&format=json&size=100&frm=<offset>

Tables: complaints.

ODI angle: complaints land as an Iceberg table in the FinServ-ODI-Demo
managed S3 lake; dbt joins against SEC EDGAR `companies` for issuer-level
complaint rollups.
"""
from __future__ import annotations

import time
from datetime import datetime, timezone, timedelta
from typing import Iterator

import requests
from fivetran_connector_sdk import Connector, Operations as op, Logging as log


CFPB_BASE = ("https://www.consumerfinance.gov/data-research/"
             "consumer-complaints/search/api/v1/")
HTTP_TIMEOUT = 30
PAGE_SIZE = 100
MAX_RECORDS = 5000
RATE_SLEEP = 0.3


# ---------------------------------------------------------------------------
# HTTP helper — single retry on 429 per spec
# ---------------------------------------------------------------------------

def _get(params: dict) -> dict | None:
    for attempt in (1, 2):
        try:
            resp = requests.get(CFPB_BASE, params=params, timeout=HTTP_TIMEOUT)
        except requests.exceptions.RequestException as exc:
            log.warning(f"Request error CFPB: {exc}")
            if attempt == 2:
                return None
            time.sleep(2)
            continue

        if resp.status_code == 429:
            log.warning("429 from CFPB, sleeping 10s")
            time.sleep(10)
            continue
        if resp.status_code >= 400:
            log.warning(f"HTTP {resp.status_code} from CFPB: {resp.text[:200]}")
            return None
        try:
            return resp.json()
        except ValueError:
            log.warning("CFPB returned non-JSON response")
            return None
    return None


# ---------------------------------------------------------------------------
# Schema
# ---------------------------------------------------------------------------

def schema(configuration: dict) -> list[dict]:
    return [
        {"table": "complaints", "primary_key": ["complaint_id"]},
    ]


# ---------------------------------------------------------------------------
# Field extraction
# ---------------------------------------------------------------------------

def _extract(hit: dict) -> dict:
    """Flatten an Elasticsearch hit (_source) to our schema."""
    src = hit.get("_source", hit) or {}
    narrative = src.get("complaint_what_happened") or ""
    return {
        "complaint_id": str(src.get("complaint_id", hit.get("_id", ""))),
        "date_received": src.get("date_received", ""),
        "product": src.get("product", ""),
        "sub_product": src.get("sub_product", ""),
        "issue": src.get("issue", ""),
        "sub_issue": src.get("sub_issue", ""),
        "company": src.get("company", ""),
        "company_response": src.get("company_response", ""),
        "consumer_consent_provided": src.get("consumer_consent_provided", ""),
        "state": src.get("state", ""),
        "zip_code": src.get("zip_code", ""),
        "has_narrative": bool(narrative),
        "complaint_narrative": narrative[:8000],
        "timely_response": (src.get("timely") in ("Yes", True, "true")),
        "consumer_disputed": src.get("consumer_disputed", ""),
        "date_sent_to_company": src.get("date_sent_to_company", ""),
        "submitted_via": src.get("submitted_via", ""),
        "tags": src.get("tags", "") or "",
    }


# ---------------------------------------------------------------------------
# update()
# ---------------------------------------------------------------------------

def update(configuration: dict, state: dict):
    lookback_days = int(configuration.get("lookback_days", "365"))
    company_filter = (configuration.get("company_filter") or "").strip()

    state = state or {}
    last_date = state.get("last_date_received")

    if last_date:
        since = last_date
        log.info(f"CFPB incremental sync since {since}")
    else:
        since_dt = datetime.now(timezone.utc) - timedelta(days=lookback_days)
        since = since_dt.strftime("%Y-%m-%d")
        log.info(f"CFPB initial sync — lookback {lookback_days}d (since {since})")

    offset = 0
    emitted = 0
    max_date = last_date or since

    while emitted < MAX_RECORDS:
        params = {
            "date_received_min": since,
            "format": "json",
            "size": PAGE_SIZE,
            "frm": offset,
            "sort": "created_date_asc",
            "no_aggs": "true",
        }
        if company_filter:
            params["company"] = company_filter

        log.info(f"CFPB GET frm={offset} size={PAGE_SIZE}")
        data = _get(params)
        if not data:
            break

        # API may return {"hits": {"hits": [...]}}  (Elasticsearch shape)
        # or a top-level list.
        hits_block = data.get("hits") if isinstance(data, dict) else None
        if isinstance(hits_block, dict):
            hits = hits_block.get("hits") or []
        elif isinstance(data, list):
            hits = data
        else:
            hits = []

        if not hits:
            log.info("No more CFPB hits.")
            break

        for hit in hits:
            row = _extract(hit)
            if not row["complaint_id"]:
                continue
            if row["date_received"] and row["date_received"] > max_date:
                max_date = row["date_received"]
            yield op.upsert("complaints", row)
            emitted += 1
            if emitted >= MAX_RECORDS:
                break

        if emitted % 500 == 0 and emitted > 0:
            state["last_date_received"] = max_date
            yield op.checkpoint(state)

        if len(hits) < PAGE_SIZE:
            break
        offset += PAGE_SIZE
        time.sleep(RATE_SLEEP)

    state["last_date_received"] = max_date
    yield op.checkpoint(state)
    log.info(f"CFPB complete — emitted={emitted} max_date={max_date}")


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------
connector = Connector(update=update, schema=schema)

if __name__ == "__main__":
    connector.debug()
