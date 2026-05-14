# CFPB Connector

Fivetran Connector SDK pipeline that pulls consumer complaints from the
Consumer Financial Protection Bureau's public API for the FinServ-ODI-Demo
(Meridian Capital).

## What it syncs

| Table        | PK             | Source endpoint |
|--------------|----------------|-----------------|
| `complaints` | `complaint_id` | `consumerfinance.gov/.../search/api/v1/` |

Per-row columns: date_received, product, sub_product, issue, sub_issue,
company, company_response, consumer_consent_provided, state, zip_code,
has_narrative, complaint_narrative, timely_response, consumer_disputed,
date_sent_to_company, submitted_via, tags.

## Configuration

No API key required. `configuration.json` (gitignored):

```json
{
  "lookback_days": "365",
  "company_filter": ""
}
```

`company_filter` empty fetches all companies; set to e.g. `"WELLS FARGO & COMPANY"`
to narrow to one issuer.

## Run locally

```bash
pip install -r requirements.txt
python connector.py
```

## Incremental state

`state['last_date_received']` = max `date_received` emitted; subsequent
syncs use that as `date_received_min`. To bound demo sync time, each run
caps at 5,000 complaints.

## ODI angle

Lands as `raw_cfpb.complaints` in the S3 managed lake (Iceberg). dbt
downstream joins on company name -> SEC EDGAR companies to produce an
issuer-level "complaint pressure" model alongside FRED macro inputs.

The optional `companies_complaints_rollup` table from the spec is
intentionally left to dbt — kept the connector single-table for clarity.
