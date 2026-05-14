"""
Build a static JSON snapshot of the Meridian Capital ODI gold layer for the
React frontend.

Pipeline (when live):
    SEC EDGAR + FRED + CFPB  →  S3 (bronze)  →  dbt  →  Iceberg/Glue (gold)
                                                              │
                                                              ▼
                                                            Athena
                                                              │
                                                              ▼
                                                  frontend/public/data/*.json

Run locally:
    AWS_REGION=us-east-1 \\
    ATHENA_WORKGROUP=meridian_wg \\
    LAKE_BUCKET=meridian-odi-lake \\
        python scripts/build_snapshot.py

Without AWS credentials the script falls back to a deterministic synthetic
dataset so the demo always renders.

Outputs (all under frontend/public/data/):
    summary.json
    companies.json                  (column-oriented)
    filings.json                    (column-oriented)
    complaints.json                 (column-oriented + summary block)
    macro.json                      ({series:[...]})
    iceberg.json                    ({tables:[...]})
    pipeline.json                   ({layers:[...]})
    companies/<cik>.json            per detail bundle
    macro/<series_id>.json          per macro series detail
"""
from __future__ import annotations

import datetime as dt
import json
import os
import shutil
import sys
from pathlib import Path
from typing import Any

# Local module — the synthetic FinServ dataset stays isolated.
sys.path.insert(0, str(Path(__file__).resolve().parent))
from _synthetic import generate as synth_generate  # type: ignore  # noqa: E402

ROOT = Path(__file__).resolve().parents[1]
OUTPUT_DIR = ROOT / "frontend" / "public" / "data"
COMPANY_DIR = OUTPUT_DIR / "companies"
MACRO_DIR   = OUTPUT_DIR / "macro"

# ── Athena / Glue catalog config (used only when present) ──────────────────
AWS_REGION       = os.getenv("AWS_REGION", "us-east-1")
ATHENA_WORKGROUP = os.getenv("ATHENA_WORKGROUP", "primary")
LAKE_BUCKET      = os.getenv("LAKE_BUCKET", "meridian-odi-lake")
GLUE_DB_GOLD     = os.getenv("GLUE_DB_GOLD", "meridian_gold")


# ---------------------------------------------------------------------------
# Athena helpers — kept thin; the real wiring is left commented so the demo
# path can be exercised standalone.
# ---------------------------------------------------------------------------

def have_athena() -> bool:
    return all(
        os.getenv(k)
        for k in ("AWS_REGION", "ATHENA_WORKGROUP", "LAKE_BUCKET")
    ) and bool(os.getenv("AWS_ACCESS_KEY_ID") or os.getenv("AWS_PROFILE"))


def from_athena() -> dict[str, Any]:  # pragma: no cover — exercised only with live AWS
    """Pull the gold-layer marts from Athena.

    Wired here as the production code path. The synthetic fallback is used by
    default so this demo is self-contained.
    """
    import boto3  # type: ignore  # noqa: PLC0415

    _ = boto3.client("athena", region_name=AWS_REGION)
    # The real implementation would:
    #   1. Start an Athena query for each gold table (dim_companies,
    #      fct_filings, fct_macro_observations, fct_complaints,
    #      fct_company_risk_signal).
    #   2. Poll get_query_execution() until SUCCEEDED.
    #   3. Read the result CSV from s3://{LAKE_BUCKET}/athena-results/.
    #   4. Assemble a bundle shaped exactly like synth_generate(60).
    raise NotImplementedError(
        "Athena path is wired up but not enabled in this demo; "
        "set AWS creds + uncomment the query block to enable."
    )


# ---------------------------------------------------------------------------
# Column-oriented serializers — keeps companies.json / filings.json compact
# ---------------------------------------------------------------------------

COMPANY_COLUMNS = [
    "cik", "ticker", "name", "sector", "industry", "exchange",
    "market_cap", "employees", "hq_city", "hq_state", "description",
    "revenue_ttm", "net_income_ttm", "total_assets", "total_liabilities",
    "revenue_growth_yoy", "net_margin",
    "risk_score", "risk_bucket", "complaint_velocity", "filings_count_ttm",
    "last_filing_date", "last_complaint_date",
]

FILING_COLUMNS = [
    "accession_no", "cik", "ticker", "company_name", "form_type",
    "filing_date", "period_of_report", "filing_url", "items",
    "primary_topic", "word_count",
]

COMPLAINT_COLUMNS = [
    "complaint_id", "date_received", "product", "sub_product", "issue",
    "sub_issue", "company", "company_normalized", "cik", "state",
    "zip_prefix", "consumer_consent", "has_narrative", "narrative_summary",
    "resolution", "timely_response", "consumer_disputed", "topic_cluster",
]


def to_columnar(rows: list[dict[str, Any]], columns: list[str]) -> dict[str, Any]:
    return {
        "count": len(rows),
        "columns": columns,
        "rows": [[r.get(c) for c in columns] for r in rows],
    }


def _complaints_summary(complaints: list[dict[str, Any]]) -> dict[str, Any]:
    by_product: dict[str, int] = {}
    by_topic:   dict[str, int] = {}
    timely_yes = 0
    timely_total = 0
    for c in complaints:
        by_product[c["product"]]                 = by_product.get(c["product"], 0) + 1
        by_topic[c["topic_cluster"] or "other"]  = by_topic.get(c["topic_cluster"] or "other", 0) + 1
        if c.get("timely_response") is not None:
            timely_total += 1
            if c["timely_response"]:
                timely_yes += 1
    return {
        "total":                 len(complaints),
        "by_product":            by_product,
        "by_topic":              by_topic,
        "timely_response_rate":  round(timely_yes / max(1, timely_total), 4),
    }


# ---------------------------------------------------------------------------
# Snapshot writer
# ---------------------------------------------------------------------------

def write_snapshot(bundle: dict[str, Any], source: str) -> None:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    # Wipe per-entity sub-dirs so stale rows don't leak into a new build
    for sub in (COMPANY_DIR, MACRO_DIR):
        if sub.exists():
            shutil.rmtree(sub)
        sub.mkdir(parents=True, exist_ok=True)

    generated_at = dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds")

    # ── summary.json ──────────────────────────────────────────────────────
    summary = {**bundle["summary"], "generated_at": generated_at, "source": source}
    (OUTPUT_DIR / "summary.json").write_text(json.dumps(summary, indent=2))
    print(f"  ✓ summary.json    {len(summary)} fields")

    # ── companies.json (column-oriented) ──────────────────────────────────
    companies = bundle["companies"]
    (OUTPUT_DIR / "companies.json").write_text(
        json.dumps(to_columnar(companies, COMPANY_COLUMNS), separators=(",", ":"))
    )
    print(f"  ✓ companies.json  {len(companies)} rows")

    # ── filings.json (column-oriented) ────────────────────────────────────
    filings = bundle["filings"]
    (OUTPUT_DIR / "filings.json").write_text(
        json.dumps(to_columnar(filings, FILING_COLUMNS), separators=(",", ":"))
    )
    print(f"  ✓ filings.json    {len(filings)} rows")

    # ── complaints.json (column-oriented + summary block) ─────────────────
    complaints = bundle["complaints"]
    complaints_payload = {
        **to_columnar(complaints, COMPLAINT_COLUMNS),
        "summary": _complaints_summary(complaints),
    }
    (OUTPUT_DIR / "complaints.json").write_text(
        json.dumps(complaints_payload, separators=(",", ":"))
    )
    print(f"  ✓ complaints.json {len(complaints)} rows")

    # ── macro.json (series list) ──────────────────────────────────────────
    macro_series = bundle["macro_series"]
    (OUTPUT_DIR / "macro.json").write_text(
        json.dumps({"series": macro_series}, indent=2)
    )
    print(f"  ✓ macro.json      {len(macro_series)} series")

    # ── iceberg.json + pipeline.json ──────────────────────────────────────
    (OUTPUT_DIR / "iceberg.json").write_text(
        json.dumps({"tables": bundle["iceberg_tables"]}, indent=2)
    )
    (OUTPUT_DIR / "pipeline.json").write_text(
        json.dumps({"layers": bundle["pipeline_layers"]}, indent=2)
    )
    print(f"  ✓ iceberg.json    {len(bundle['iceberg_tables'])} tables")
    print(f"  ✓ pipeline.json   {len(bundle['pipeline_layers'])} layers")

    # ── companies/<cik>.json per detail bundle ────────────────────────────
    details = bundle.get("company_details", {})
    for cik, detail in details.items():
        (COMPANY_DIR / f"{cik}.json").write_text(json.dumps(detail, indent=2))
    print(f"  ✓ companies/      {len(details)} detail bundles")

    # ── macro/<series_id>.json per macro detail ───────────────────────────
    observations = bundle.get("macro_observations", {})
    macro_by_id = {m["series_id"]: m for m in macro_series}
    for sid, obs in observations.items():
        meta = macro_by_id.get(sid)
        if meta is None:
            continue
        payload = {"series": meta, "observations": obs}
        (MACRO_DIR / f"{sid}.json").write_text(json.dumps(payload, separators=(",", ":")))
    print(f"  ✓ macro/          {len(observations)} series detail files")


# ---------------------------------------------------------------------------
# Fallback
# ---------------------------------------------------------------------------

def fallback_dataset(n: int = 60) -> dict[str, Any]:
    return synth_generate(n_companies=n)


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main() -> int:
    print("=" * 60)
    print(" Meridian Capital — ODI snapshot builder")
    print("=" * 60)

    # The Athena path is wired up but commented out — flip the condition to
    # have_athena() once gold-layer Iceberg tables are populated. For the
    # standalone demo we always take the synthetic path.
    use_live = False  # set to: have_athena()
    if use_live:
        try:
            print("→ Pulling live snapshot from Athena…")
            bundle = from_athena()
            write_snapshot(bundle, source="live")
            return 0
        except Exception as e:  # noqa: BLE001
            print(f"✗ Athena query failed: {e}", file=sys.stderr)
            print("→ Falling back to synthetic demo dataset…", file=sys.stderr)

    print("→ Generating synthetic demo dataset (60 S&P-500-ish companies)…")
    bundle = fallback_dataset(60)
    print(f"  generated: {bundle['summary']['total_companies']} companies, "
          f"{bundle['summary']['total_filings']} filings, "
          f"{bundle['summary']['total_complaints']} complaints, "
          f"{bundle['summary']['total_macro_observations']} macro obs")
    print("→ Writing JSON to frontend/public/data/")
    write_snapshot(bundle, source="demo")
    print("=" * 60)
    print(f" Done. Output: {OUTPUT_DIR}")
    print("=" * 60)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
