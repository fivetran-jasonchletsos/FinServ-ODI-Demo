# Connectors — FinServ-ODI-Demo

Three custom Fivetran Connector SDK pipelines feeding the Meridian Capital
Open Data Infrastructure (ODI) demo. Each lands raw records in the S3
managed lake as Iceberg tables; Athena and dbt consume them downstream.

| Directory      | Source                          | Auth          | Headline tables                    | Incremental key |
|----------------|---------------------------------|---------------|------------------------------------|-----------------|
| `sec_edgar/`   | SEC EDGAR submissions + XBRL    | User-Agent    | companies, filings, xbrl_facts     | `last_filing_date_by_cik` |
| `fred/`        | FRED (St. Louis Fed)            | API key       | series, observations               | `last_obs_date[series_id]` |
| `cfpb/`        | CFPB Consumer Complaints        | none          | complaints                         | `last_date_received` |

Each connector follows the same shape as
`jason_chletsos/jason_chletsos_ebay_lots/connector.py`:

- `schema(configuration)` returning table specs
- `update(configuration, state)` yielding `op.upsert(...)` and `op.checkpoint(...)`
- `connector = Connector(update=update, schema=schema)` at module scope
- `connector.debug()` under `if __name__ == "__main__":`

## Shared seed

`sp500_tickers.csv` — top 50 S&P 500 tickers with CIKs, consumed by
`sec_edgar/connector.py`. Edit and re-run to expand coverage.

## Running locally

```bash
cd connectors/sec_edgar         # (or fred / cfpb)
cp configuration.example.json configuration.json
# edit configuration.json with your secrets
pip install -r requirements.txt
python connector.py             # invokes connector.debug()
```

The Fivetran SDK debug runner writes a local `warehouse.db` so you can
inspect emitted records before deploying.

## Deploying to Fivetran

The Fivetran CLI is bundled with `fivetran-connector-sdk`. From each
connector directory:

```bash
fivetran deploy \
  --api-key       "$FIVETRAN_API_KEY" \
  --destination   "$FIVETRAN_DESTINATION_NAME" \
  --connection    sec_edgar_meridian \
  --configuration configuration.json
```

Repeat per directory (changing `--connection`) for `fred` and `cfpb`.
The destination should be the S3 Iceberg managed-lake destination
provisioned for the demo so tables land directly in the open-format lake.

## ODI mapping

| Connector  | Iceberg schema    | Athena consumer queries / dbt models                              |
|------------|-------------------|--------------------------------------------------------------------|
| sec_edgar  | `raw_sec_edgar`   | `dim_companies`, `fct_filings`, `fct_xbrl_facts`                  |
| fred       | `raw_fred`        | `dim_macro_series`, `fct_macro_obs`                                |
| cfpb       | `raw_cfpb`        | `stg_complaints`, `fct_issuer_complaint_pressure`                  |

## Conventions

- HTTP timeout 30s, single retry on HTTP 429
- Snake_case table and column names; no `_iceberg` suffix (the destination
  handles the open table format)
- `configuration.json` is gitignored at every connector — commit only
  `configuration.example.json`
- Each connector stays under 250 lines and is self-contained
