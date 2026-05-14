// ============================================================
// Shared types — mirror the gold-layer dbt models on Athena/Iceberg.
//
//   gold.dim_companies            (from SEC EDGAR + manual S&P 500 seed)
//   gold.fct_filings              (10-K / 10-Q / 8-K events)
//   gold.fct_macro_observations   (FRED time series)
//   gold.fct_complaints           (CFPB consumer complaints)
//   gold.fct_company_risk_signal  (cross-source risk score)
// ============================================================

export interface SummaryStats {
  total_companies: number;
  total_filings: number;
  total_complaints: number;
  total_macro_series: number;
  total_macro_observations: number;
  bronze_rows: number;
  silver_rows: number;
  gold_rows: number;
  iceberg_table_count: number;
  s3_bytes: number;
  last_sync_at: string | null;
  generated_at?: string;
  source?: 'live' | 'demo';
}

export type Sector =
  | 'Financials'
  | 'Technology'
  | 'Healthcare'
  | 'Consumer Discretionary'
  | 'Consumer Staples'
  | 'Energy'
  | 'Industrials'
  | 'Materials'
  | 'Utilities'
  | 'Real Estate'
  | 'Communication Services';

export type RiskBucket = 'low' | 'moderate' | 'elevated' | 'high';

export interface Company {
  cik: string;
  ticker: string;
  name: string;
  sector: Sector | null;
  industry: string | null;
  exchange: string | null;
  market_cap: number | null;
  employees: number | null;
  hq_city: string | null;
  hq_state: string | null;
  description: string | null;

  revenue_ttm: number | null;
  net_income_ttm: number | null;
  total_assets: number | null;
  total_liabilities: number | null;
  revenue_growth_yoy: number | null;
  net_margin: number | null;

  risk_score: number;
  risk_bucket: RiskBucket;
  complaint_velocity: number;
  filings_count_ttm: number;

  last_filing_date: string | null;
  last_complaint_date: string | null;
}

export interface CompaniesResponse {
  count: number;
  results: Company[];
}

export interface Filing {
  accession_no: string;
  cik: string;
  ticker: string;
  company_name: string;
  form_type: string;
  filing_date: string;
  period_of_report: string | null;
  filing_url: string | null;
  items: string[] | null;
  primary_topic: string | null;
  word_count: number | null;
}

export interface FilingsResponse {
  cik?: string;
  filings: Filing[];
}

export interface MacroSeries {
  series_id: string;
  title: string;
  units: string;
  frequency: string;
  category: 'rates' | 'inflation' | 'employment' | 'growth' | 'sector' | 'other';
  latest_value: number;
  latest_date: string;
  prior_value: number | null;
  yoy_change: number | null;
  observations_count: number;
}

export interface MacroObservation {
  series_id: string;
  date: string;
  value: number;
}

export interface MacroResponse {
  series: MacroSeries[];
}

export interface MacroSeriesDetail {
  series: MacroSeries;
  observations: MacroObservation[];
}

export interface Complaint {
  complaint_id: string;
  date_received: string;
  product: string;
  sub_product: string | null;
  issue: string;
  sub_issue: string | null;
  company: string;
  company_normalized: string | null;
  cik: string | null;
  state: string | null;
  zip_prefix: string | null;
  consumer_consent: boolean;
  has_narrative: boolean;
  narrative_summary: string | null;
  resolution: string | null;
  timely_response: boolean | null;
  consumer_disputed: boolean | null;
  topic_cluster: string | null;
}

export interface ComplaintsResponse {
  complaints: Complaint[];
  summary?: {
    total: number;
    by_product: Record<string, number>;
    by_topic: Record<string, number>;
    timely_response_rate: number;
  };
}

export interface CompanyDetail extends Company {
  filings: Filing[];
  complaints: Complaint[];
  related_macro_series: MacroSeries[];
  risk_factors: string[];
  ai_summary: string | null;
}

export interface SectorRollup {
  sector: Sector;
  company_count: number;
  median_revenue_growth: number;
  total_complaints: number;
  avg_risk_score: number;
  top_macro_correlations: { series_id: string; corr: number }[];
}

// ============================================================
// ODI architecture metadata — used by the Architecture page
// ============================================================

export interface IcebergTable {
  database: 'bronze' | 'silver' | 'gold';
  table: string;
  rows: number;
  bytes: number;
  partitions: string[];
  source_system: 'sec_edgar' | 'fred' | 'cfpb' | 'derived';
  last_updated_at: string;
  schema_columns: number;
}

export interface QueryEngine {
  name: 'Athena' | 'DuckDB' | 'Trino' | 'Spark' | 'Snowflake';
  status: 'active' | 'available' | 'demo';
  description: string;
  sample_query: string;
}

export interface PipelineLayerStats {
  layer: 'connector' | 'bronze' | 'silver' | 'gold';
  rows_in: number;
  rows_out: number;
  tables: number;
  last_run: string;
  status: 'ok' | 'running' | 'failed';
}
