# FinServ-ODI-Demo · Meridian Capital

End-to-end demonstration of **Fivetran's Open Data Infrastructure (ODI)** in
a financial-services research-portal setting. Meridian Capital is a fictional
institutional asset manager / IB modeled after Morgan Stanley + UBS; the
data flows are real.

ODI's pitch in one line: **storage, catalog, and compute are independently
swappable open standards** — Iceberg + Glue + (Athena | DuckDB | Trino | Spark | …).
No warehouse vendor in the path. AI agents read the lake directly.

```
   ┌────────────────────────────────────────────────────────────┐
   │  Three public APIs                                         │
   │  SEC EDGAR · FRED · CFPB                                    │
   └────────────────────────────┬───────────────────────────────┘
                                │  3 Fivetran custom connectors (SDK)
                                ▼
   ┌────────────────────────────────────────────────────────────┐
   │  AWS S3 — Apache Iceberg tables in 3 schemas               │
   │    bronze_sec_edgar.{companies, filings, xbrl_facts}        │
   │    bronze_fred.{series, observations}                       │
   │    bronze_cfpb.{complaints}                                 │
   │  Registered in AWS Glue Data Catalog                        │
   └────────────────────────────┬───────────────────────────────┘
                                │  dbt (silver = view, gold = Iceberg)
                                ▼
   ┌────────────────────────────────────────────────────────────┐
   │  Silver — staging + intermediate conformed models           │
   │  Gold   — marts + dbt semantic layer (7 metrics)            │
   │    dim_companies · fct_filings · fct_macro_observations     │
   │    fct_complaints · fct_company_risk_signal · mart_sector   │
   └────────────────────────────┬───────────────────────────────┘
                                │  AWS Athena (engine-of-choice)
                                ▼
   ┌────────────────────────────────────────────────────────────┐
   │  build_snapshot.py — extracts gold layer to JSON            │
   └────────────────────────────┬───────────────────────────────┘
                                ▼
   ┌────────────────────────────────────────────────────────────┐
   │  React + Vite SPA on GitHub Pages                           │
   │  Holdings · Company Detail · Macro · Complaint Radar ·      │
   │  Research AI · ODI Architecture · Pipeline                  │
   └────────────────────────────────────────────────────────────┘
```

## Layout

| Path | What lives there |
|---|---|
| `connectors/` | Three Fivetran Connector SDK projects (SEC EDGAR, FRED, CFPB) |
| `infra/` | Terraform — S3 lake, Glue catalog, IAM roles, Athena workgroup |
| `transform/` | dbt project `finserv_odi` — bronze sources, silver, gold + semantic layer |
| `meridian-app/frontend/` | React + Vite + Tailwind v4 SPA |
| `meridian-app/scripts/` | `build_snapshot.py`, `_synthetic.py` |
| `.github/workflows/` | `deploy.yml` (Pages), `dbt_run.yml` (post-Fivetran-sync) |

## Frontend (the demo surface)

```bash
cd meridian-app/frontend
npm ci
npm run dev    # http://localhost:5173 — reads frontend/public/data/*.json
```

Pages:
- `/` — ODI three-pillar hero + lake snapshot KPI panel
- `/holdings` — Equity universe, search/filter, sortable risk signals
- `/companies/:cik` — Filings, complaint trend, macro overlay, AI summary
- `/macro` — FRED briefing with quote-tiles + series picker
- `/complaints` — CFPB topic radar with cross-filter
- `/agent` — Research AI (rules + Claude opt-in)
- `/architecture` — **The ODI page** — interactive lineage diagram, multi-engine query showcase, table catalog, MDS-vs-ODI comparison
- `/pipeline` — 4-layer status with failure simulator
- `/watchlist` — Saved companies
- `/about` — Reference architecture + tech stack

## Generating the snapshot

```bash
# Synthetic fallback (no AWS credentials required)
cd meridian-app
python scripts/build_snapshot.py
```

Outputs `frontend/public/data/{summary,companies,filings,macro,complaints,iceberg,pipeline}.json`
plus per-company and per-series detail bundles.

With AWS credentials in the environment (`AWS_REGION`, `LAKE_BUCKET`,
`ATHENA_WORKGROUP`), the same script queries the Athena gold layer directly.

## AWS deployment

```bash
cd infra
cp terraform.tfvars.example terraform.tfvars
# Fill in fivetran_external_id + dbt_iam_user_arn
terraform init
terraform plan
terraform apply
```

Provisions ~$5-15/mo of resources: S3 lake bucket (versioned, encrypted),
4 Glue catalog databases (meridian_odi + bronze/silver/gold), Athena
workgroup (engine v3, SSE_S3), and two IAM roles (one for Fivetran's
service account, one for the dbt runner).

## ODI value props the site illustrates

| Pillar | Where in the site |
|---|---|
| **Open storage** | `/architecture` — every table registered in Glue, queryable as Iceberg |
| **Multi-engine** | `/architecture` — five engines + sample SQL each, same tables |
| **Reusable semantics** | `transform/metrics/finserv_metrics.yml` — 7 metrics defined once |
| **AI-ready** | `/agent` — Claude reads gold-layer parquet directly, no warehouse hop |
| **No lock-in** | `/architecture` — MDS vs ODI side-by-side; Snowflake shown as one option, not the path |

## Data sources

| Source | Tables | Coverage |
|---|---|---|
| SEC EDGAR | `companies`, `filings`, `xbrl_facts` | Top 50 S&P 500 issuers, 4 yrs of filings, 7 XBRL concepts |
| FRED | `series`, `observations` | 10 macro series (DGS10/DGS2/FEDFUNDS/CPI/UNRATE/GDP/T10Y2Y/UMCSENT/HOUST/DGS30) |
| CFPB | `complaints` | Up to 5000/sync, paginated, optional company filter |

All three are **public APIs** — no credentials needed for SEC or CFPB,
free key for FRED.

## License

Demonstration code. Not for production trading or research decisions.
Synthetic data unless connected to live AWS resources.
