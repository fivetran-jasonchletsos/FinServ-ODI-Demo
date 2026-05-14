"""
SEC EDGAR — Fivetran Connector SDK
==================================
Pulls company submissions and XBRL facts from SEC EDGAR for S&P 500 issuers.
Tables: companies, filings, xbrl_facts.

ODI angle: lands as Iceberg tables in the FinServ-ODI-Demo managed S3 lake,
queried via Athena alongside FRED macro data and CFPB complaints.
"""
from __future__ import annotations

import csv
import os
import time
from typing import Iterator

import requests
from fivetran_connector_sdk import Connector, Operations as op, Logging as log


SEC_BASE = "https://data.sec.gov"
RATE_SLEEP = 0.12  # SEC fair-access policy: 10 req/sec max
HTTP_TIMEOUT = 30

CONCEPTS = [
    "Revenues", "NetIncomeLoss", "Assets", "Liabilities",
    "StockholdersEquity", "CashAndCashEquivalentsAtCarryingValue",
    "EarningsPerShareBasic",
]


def _get(url: str, headers: dict) -> requests.Response | None:
    """HTTP GET with single retry on 429 / transient errors."""
    for attempt in (1, 2):
        try:
            resp = requests.get(url, headers=headers, timeout=HTTP_TIMEOUT)
        except requests.exceptions.RequestException as exc:
            log.warning(f"Request error {url}: {exc}")
            if attempt == 2:
                return None
            time.sleep(2)
            continue

        if resp.status_code == 429:
            log.warning(f"429 rate-limited on {url}, sleeping 5s")
            time.sleep(5)
            continue
        if resp.status_code == 404:
            log.warning(f"404 not found: {url}")
            return None
        if resp.status_code >= 400:
            log.warning(f"HTTP {resp.status_code} on {url}")
            return None
        return resp
    return None


def load_tickers(configuration: dict) -> list[dict]:
    path = configuration.get("ticker_seed_path") or os.path.join(
        os.path.dirname(os.path.abspath(__file__)), "..", "sp500_tickers.csv"
    )
    limit = int(configuration.get("cik_limit", "50"))
    rows: list[dict] = []
    with open(path, "r", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            cik = (row.get("cik") or "").strip().zfill(10)
            if not cik or cik == "0000000000":
                continue
            rows.append({
                "cik": cik,
                "ticker": row.get("ticker", "").strip(),
                "name": row.get("name", "").strip(),
                "exchange": row.get("exchange", "").strip(),
            })
            if len(rows) >= limit:
                break
    log.info(f"Loaded {len(rows)} tickers (limit={limit}) from {path}")
    return rows


def schema(configuration: dict) -> list[dict]:
    return [
        {"table": "companies", "primary_key": ["cik"]},
        {"table": "filings", "primary_key": ["accession_no"]},
        {"table": "xbrl_facts",
         "primary_key": ["cik", "concept", "period_end", "form"]},
    ]


def sync_submissions(seed: dict, headers: dict, last_filing_dt: str) -> Iterator[tuple]:
    cik = seed["cik"]
    url = f"{SEC_BASE}/submissions/CIK{cik}.json"
    resp = _get(url, headers)
    if not resp:
        return
    data = resp.json()

    addrs = data.get("addresses", {}) or {}
    biz = addrs.get("business", {}) or {}
    company = {
        "cik": cik,
        "ticker": seed.get("ticker") or (data.get("tickers") or [""])[0],
        "name": data.get("name", seed.get("name", "")),
        "sic": data.get("sic", ""),
        "sic_description": data.get("sicDescription", ""),
        "ein": data.get("ein", ""),
        "exchange": (data.get("exchanges") or [seed.get("exchange", "")])[0],
        "hq_address": biz.get("street1", ""),
        "hq_city": biz.get("city", ""),
        "hq_state": biz.get("stateOrCountry", ""),
        "fiscal_year_end": data.get("fiscalYearEnd", ""),
    }
    yield ("companies", company, None)

    recent = (data.get("filings", {}) or {}).get("recent", {}) or {}
    accessions = recent.get("accessionNumber", [])
    forms = recent.get("form", [])
    fdates = recent.get("filingDate", [])
    reports = recent.get("reportDate", [])
    primaries = recent.get("primaryDocument", [])
    items = recent.get("items", [])
    sizes = recent.get("size", [])

    new_max = last_filing_dt
    for i, acc in enumerate(accessions):
        filing_date = fdates[i] if i < len(fdates) else ""
        if last_filing_dt and filing_date and filing_date <= last_filing_dt:
            continue
        if filing_date and filing_date > (new_max or ""):
            new_max = filing_date

        yield ("filings", {
            "cik": cik,
            "ticker": company["ticker"],
            "accession_no": acc,
            "form_type": forms[i] if i < len(forms) else "",
            "filing_date": filing_date,
            "period_of_report": reports[i] if i < len(reports) else "",
            "primary_document": primaries[i] if i < len(primaries) else "",
            "items": items[i] if i < len(items) else "",
            "file_size_bytes": int(sizes[i]) if i < len(sizes) and sizes[i] else 0,
        }, None)

    yield ("_state", None, new_max)


def sync_concept(cik: str, concept: str, headers: dict) -> Iterator[dict]:
    url = f"{SEC_BASE}/api/xbrl/companyconcept/CIK{cik}/us-gaap/{concept}.json"
    resp = _get(url, headers)
    if not resp:
        return
    payload = resp.json()
    taxonomy = payload.get("taxonomy", "us-gaap")
    units = payload.get("units", {}) or {}
    for unit, points in units.items():
        for p in points:
            yield {
                "cik": cik,
                "concept": concept,
                "taxonomy": taxonomy,
                "unit": unit,
                "period_start": p.get("start", ""),
                "period_end": p.get("end", ""),
                "value": float(p.get("val", 0) or 0),
                "form": p.get("form", ""),
                "accession_no": p.get("accn", ""),
                "fiscal_year": int(p.get("fy") or 0),
                "fiscal_period": p.get("fp", ""),
                "filed_date": p.get("filed", ""),
            }


def update(configuration: dict, state: dict):
    ua = configuration.get("user_agent")
    if not ua:
        raise RuntimeError("configuration.user_agent is required (SEC fair-access policy)")
    headers = {"User-Agent": ua, "Accept": "application/json"}

    state = state or {}
    last_by_cik: dict = state.get("last_filing_date_by_cik", {}) or {}

    seeds = load_tickers(configuration)
    total_filings = 0
    total_facts = 0

    for seed in seeds:
        cik = seed["cik"]
        last_dt = last_by_cik.get(cik, "")
        log.info(f"SEC EDGAR sync cik={cik} ticker={seed.get('ticker')} since={last_dt or 'BEGIN'}")

        new_max = last_dt
        for table, row, st in sync_submissions(seed, headers, last_dt):
            if table == "_state":
                if st:
                    new_max = st
                continue
            if table == "filings":
                total_filings += 1
            yield op.upsert(table, row)
        time.sleep(RATE_SLEEP)

        for concept in CONCEPTS:
            for fact in sync_concept(cik, concept, headers):
                yield op.upsert("xbrl_facts", fact)
                total_facts += 1
            time.sleep(RATE_SLEEP)

        if new_max:
            last_by_cik[cik] = new_max
        state["last_filing_date_by_cik"] = last_by_cik
        yield op.checkpoint(state)

    log.info(f"SEC EDGAR complete — filings={total_filings} xbrl_facts={total_facts}")


connector = Connector(update=update, schema=schema)

if __name__ == "__main__":
    connector.debug()
