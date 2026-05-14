# AGENTS.md

Operator guide for future Claude sessions and the Meridian team. Keep brief.

## Repo layout

| Dir | What |
|---|---|
| `connectors/` | Three Fivetran Connector SDK projects: `sec_edgar/`, `fred/`, `cfpb/`. Each has `connector.py` + `configuration.json` + `requirements.txt`. |
| `infra/` | Terraform — S3 lake bucket, Glue catalog DBs, IAM (Fivetran + dbt), Athena workgroup. |
| `transform/` | dbt project `finserv_odi` on Athena/Iceberg. Layers: `models/bronze` (sources only), `models/silver` (stg + int), `models/gold` (facts/dims/marts + semantic layer in `metrics/`). |
| `meridian-app/frontend/` | React + Vite + Tailwind v4 SPA. **Off-limits to backend agents** — another agent owns the UI. |
| `meridian-app/scripts/` | `build_snapshot.py` (Athena → JSON), `_synthetic.py` (deterministic fallback when AWS isn't configured). |
| `scripts/deploy.sh` | One-shot orchestrator: terraform → fivetran → dbt → snapshot → build → push. Supports `--skip=infra,fivetran,dbt,snapshot,build,push`. |

## Run the demo locally (no creds)

```bash
cd meridian-app/frontend && npm ci && npm run dev
```

The committed snapshot under `frontend/public/data/` already covers 30
companies + 10 macro series + complaints + filings. The full site works.

## Regenerate the snapshot

```bash
cd meridian-app && python scripts/build_snapshot.py
```

With AWS creds (`AWS_REGION`, `LAKE_BUCKET`, `ATHENA_WORKGROUP`) it queries
the gold layer; without, it falls back to `_synthetic.py` (seed=42, stable).

## Adding a 4th data source

1. `cp -r connectors/fred connectors/<new_source>` and rewrite `connector.py` against the new API. Keep `schema()` flat — Iceberg likes it.
2. Add a bronze source block + a `silver/stg_<new>__*.sql` staging model. Mirror the field-rename pattern used by the existing stg files.
3. If it joins to companies, add an intermediate xref in `silver/int_*.sql` (see `int_complaint_company_xref.sql`).
4. Surface in `gold/` as a fact or a column on `mart_sector_health` / `fct_company_risk_signal`.
5. Extend `build_snapshot.py` to write the new JSON; update the frontend data contract.

## Athena/Presto SQL gotchas (already audited clean)

- `date_add('day', -90, current_date)` — not `DATE_DIFF(end, start)`.
- `current_date` / `current_timestamp` — no parentheses.
- `cast(x as double)` — no `::` syntax.
- `to_unixtime(ts)` — no `extract(epoch from ...)`.
- Partition spec `bucket(8, cik)` and `year(date_col)` are Athena 3 / Iceberg.

## ODI talking points the site supports

| Pillar | Page |
|---|---|
| Open storage (Iceberg in S3, Glue-cataloged) | `/architecture` |
| Multi-engine (Athena, DuckDB, Trino, Spark, Snowflake-as-option) | `/architecture` |
| Reusable semantics (one metric definition, many consumers) | `transform/metrics/finserv_metrics.yml` |
| AI-ready (Claude reads parquet directly, no warehouse hop) | `/agent` |
| No lock-in (MDS vs ODI comparison) | `/architecture` |

## Guardrails

Never commit secrets/real `.tfvars`. Don't reformat dbt SQL. Frontend belongs to another agent.
