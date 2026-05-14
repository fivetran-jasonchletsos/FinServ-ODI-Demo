# SEC EDGAR Connector

Fivetran Connector SDK pipeline that pulls company facts and filings from the
SEC EDGAR public API for the FinServ-ODI-Demo (Meridian Capital).

## What it syncs

| Table        | PK                                            | Source endpoint |
|--------------|-----------------------------------------------|-----------------|
| `companies`  | `cik`                                         | `/submissions/CIK{cik}.json` |
| `filings`    | `accession_no`                                | `/submissions/CIK{cik}.json` (recent block) |
| `xbrl_facts` | (`cik`, `concept`, `period_end`, `form`)      | `/api/xbrl/companyconcept/CIK{cik}/us-gaap/{concept}.json` |

Concepts pulled per company: `Revenues`, `NetIncomeLoss`, `Assets`,
`Liabilities`, `StockholdersEquity`, `CashAndCashEquivalentsAtCarryingValue`,
`EarningsPerShareBasic`.

Top 50 S&P 500 tickers are seeded from `../sp500_tickers.csv`.

## Configuration

`configuration.json` (gitignored):

```json
{
  "user_agent": "Meridian Capital ODI Demo (research@meridiancapital-demo.com)",
  "ticker_seed_path": "",
  "cik_limit": "50"
}
```

`user_agent` is **required** — SEC blocks anonymous traffic. Format:
`<entity name> (<contact email>)`.

`ticker_seed_path` empty falls back to `../sp500_tickers.csv`.

## Run locally

```bash
pip install -r requirements.txt
python connector.py
```

This invokes `connector.debug()` and emits SDK logs.

## Incremental state

`state['last_filing_date_by_cik'][cik]` = latest filingDate seen for that CIK.
Subsequent syncs only emit filings with `filing_date > last_filing_date`.

## Rate limits

SEC allows 10 req/sec per IP. Connector sleeps ~120ms between calls to stay
well under that, and retries once on HTTP 429.

## ODI angle

Lands directly in the demo's S3 managed lake as three Iceberg tables —
`raw_sec_edgar.companies`, `raw_sec_edgar.filings`, `raw_sec_edgar.xbrl_facts` —
queryable from Athena and joined with FRED / CFPB feeds in the dbt layer.
