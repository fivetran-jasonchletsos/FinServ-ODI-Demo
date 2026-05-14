# FRED Connector

Fivetran Connector SDK pipeline that pulls macro time series from the
St. Louis Fed FRED API for the FinServ-ODI-Demo (Meridian Capital).

## What it syncs

| Table         | PK                       | Source endpoint |
|---------------|--------------------------|-----------------|
| `series`      | `series_id`              | `/fred/series` |
| `observations`| (`series_id`, `date`)    | `/fred/series/observations` |

Default series: 10Y/2Y/30Y treasuries, Fed Funds, CPI, unemployment, GDP,
2s10s spread, consumer sentiment, housing starts.

## Configuration

Requires a free FRED API key — register at
<https://fred.stlouisfed.org/docs/api/api_key.html>.

`configuration.json` (gitignored):

```json
{
  "api_key": "REPLACE_WITH_FRED_API_KEY",
  "series_seed": "DGS10,DGS2,FEDFUNDS,CPIAUCSL,UNRATE,GDP,DGS30,T10Y2Y,UMCSENT,HOUST"
}
```

## Run locally

```bash
pip install -r requirements.txt
python connector.py
```

## Incremental state

`state['last_obs_date'][series_id]` holds the latest observation date emitted
for each series. New syncs use that as `observation_start`. Initial sync
backfills 5 years of history.

## ODI angle

Lands as `raw_fred.series` + `raw_fred.observations` Iceberg tables in the
S3 managed lake. Athena queries can pivot the long-form `observations` and
join treasury yields against SEC fundamentals for rate-sensitivity analysis.
