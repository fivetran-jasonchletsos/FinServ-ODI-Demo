// Altavest Capital — Open Data Infrastructure architecture page.
//
// Ported from the Clarity Health ArchitecturePage to give Altavest the
// same medallion / multi-engine surface (Snowflake Summit 2026 recording
// set, 9am). Asset-management flavoured: SEC EDGAR 13F holdings + FRED
// macro + CFPB consumer complaints + S&P Capital IQ streaming reference.
// Snowflake is the primary engine; Athena/DuckDB/Trino/Spark are listed
// as the same open-lake reads.
//
// Iceberg table list is inlined (no extra API endpoint) so the page can
// render in the recording even if connectors are paused.

import { useState, useEffect } from 'react';
import { AliveMedallion, type SourceNode, type EngineNode, type ConsumerRole } from '../components/AliveMedallion';

const ALTAVEST_SOURCES: SourceNode[] = [
  { id: 'ledger',  label: 'Trade Ledger',         sub: 'SQL Server log-CDC',     logo: 'sqlserver', freshness: '38s lag',  status: 'healthy', pipelineUrl: 'https://fivetran.com/dashboard/connectors/mercy_individualism' },
  { id: 'pms',     label: 'Portfolio Mgmt Sys',   sub: 'Oracle Binary Log Reader',logo: 'oracle',    freshness: '90s lag',  status: 'healthy', pipelineUrl: 'https://fivetran.com/dashboard/connectors/vanguard_chapter' },
  { id: 'market',  label: 'Market Data Feed',     sub: 'Polygon stream',          logo: 'hl7',       freshness: 'live',     status: 'healthy', streaming: true },
  { id: 'edgar',   label: 'SEC EDGAR',            sub: 'Daily regulatory filings',logo: 'sec',       freshness: '1d lag',   status: 'healthy' },
];
const ALTAVEST_ENGINES: EngineNode[] = [
  { name: 'Snowflake', active: true,  logo: 'snowflake' },
  { name: 'Athena',                   logo: 'athena' },
  { name: 'DuckDB',                   logo: 'duckdb' },
  { name: 'Trino',                    logo: 'trino' },
  { name: 'Spark',                    logo: 'spark' },
];
const ALTAVEST_ROLES: ConsumerRole[] = [
  { label: 'Portfolio Mgrs', sub: 'positions & P&L' },
  { label: 'Risk',           sub: 'VaR & exposure' },
  { label: 'Compliance',     sub: 'SOX & SEC filings' },
  { label: 'Research',       sub: 'alpha discovery' },
];

// ─── Types (local) ──────────────────────────────────────────────────────────

interface IcebergTable {
  database: 'bronze' | 'silver' | 'gold';
  table: string;
  source_system: string;
  rows: number;
  bytes: number;
  schema_columns: number;
  partitions: string[];
  last_updated_at: string;
}

interface QueryEngine {
  name: 'Snowflake' | 'Athena' | 'DuckDB' | 'Trino' | 'Spark';
  status: 'active' | 'available' | 'demo';
  description: string;
  sample_query: string;
}

const TABLES: IcebergTable[] = [
  { database: 'bronze', table: 'bronze.sec__holdings_13f',       source_system: 'http · SEC EDGAR',        rows: 4_842_120, bytes: 2_140_000_000, schema_columns: 38,  partitions: ['filing_quarter'],     last_updated_at: '2026-05-24T07:14:00Z' },
  { database: 'bronze', table: 'bronze.sec__filings_index',      source_system: 'http · SEC EDGAR',        rows: 84_240,    bytes: 142_000_000,   schema_columns: 22,  partitions: ['filing_date'],         last_updated_at: '2026-05-24T07:14:00Z' },
  { database: 'bronze', table: 'bronze.sec__company_facts',      source_system: 'http · SEC EDGAR',        rows: 612_400,   bytes: 312_000_000,   schema_columns: 41,  partitions: ['cik_bucket'],          last_updated_at: '2026-05-24T07:14:00Z' },
  { database: 'bronze', table: 'bronze.fred__macro_series',      source_system: 'http · FRED',             rows: 1_842_200, bytes: 484_000_000,   schema_columns: 14,  partitions: ['series_id'],           last_updated_at: '2026-05-24T07:11:00Z' },
  { database: 'bronze', table: 'bronze.fred__series_metadata',   source_system: 'http · FRED',             rows: 8_420,     bytes: 14_200_000,    schema_columns: 18,  partitions: [],                       last_updated_at: '2026-05-24T07:11:00Z' },
  { database: 'bronze', table: 'bronze.cfpb__complaints',        source_system: 'http · CFPB',             rows: 3_240_080, bytes: 1_810_000_000, schema_columns: 28,  partitions: ['ingest_date'],         last_updated_at: '2026-05-23T22:00:00Z' },
  { database: 'bronze', table: 'bronze.sp_ciq__company_ref',     source_system: 'kafka · S&P Cap IQ',      rows: 184_400,   bytes: 96_000_000,    schema_columns: 52,  partitions: ['sector'],              last_updated_at: '2026-05-24T07:14:00Z' },
  { database: 'bronze', table: 'bronze.sp_ciq__intraday_quotes', source_system: 'kafka · S&P Cap IQ',      rows: 14_240_220,bytes: 4_410_000_000, schema_columns: 12,  partitions: ['quote_date'],          last_updated_at: '2026-05-24T07:14:00Z' },

  { database: 'silver', table: 'silver.int_holdings_spine',         source_system: 'dbt · merged', rows: 4_842_120, bytes: 1_320_000_000, schema_columns: 28,  partitions: ['filing_quarter'],    last_updated_at: '2026-05-24T07:18:00Z' },
  { database: 'silver', table: 'silver.int_macro_aligned',          source_system: 'dbt · merged', rows: 1_842_200, bytes: 410_000_000,   schema_columns: 22,  partitions: ['series_id'],         last_updated_at: '2026-05-24T07:18:00Z' },
  { database: 'silver', table: 'silver.int_complaint_topics',       source_system: 'dbt · merged', rows: 3_240_080, bytes: 1_120_000_000, schema_columns: 34,  partitions: ['topic_cluster'],     last_updated_at: '2026-05-24T07:18:00Z' },
  { database: 'silver', table: 'silver.int_position_changes',       source_system: 'dbt · merged', rows: 1_242_400, bytes: 612_000_000,   schema_columns: 24,  partitions: ['filing_quarter'],    last_updated_at: '2026-05-24T07:18:00Z' },
  { database: 'silver', table: 'silver.int_sector_regimes',         source_system: 'dbt · merged', rows: 84_240,    bytes: 38_400_000,    schema_columns: 18,  partitions: [],                      last_updated_at: '2026-05-24T07:18:00Z' },

  { database: 'gold',   table: 'gold.dim_companies',                            source_system: 'dbt mart', rows: 184_400,   bytes: 84_000_000,    schema_columns: 42,  partitions: [],                          last_updated_at: '2026-05-24T07:22:00Z' },
  { database: 'gold',   table: 'gold.dim_holdings',                             source_system: 'dbt mart', rows: 612_400,   bytes: 184_000_000,   schema_columns: 36,  partitions: [],                          last_updated_at: '2026-05-24T07:22:00Z' },
  { database: 'gold',   table: 'gold.dim_macro_series',                         source_system: 'dbt mart', rows: 8_420,     bytes: 12_400_000,    schema_columns: 22,  partitions: [],                          last_updated_at: '2026-05-24T07:22:00Z' },
  { database: 'gold',   table: 'gold.fct_13f_position_changes',                 source_system: 'dbt mart', rows: 1_242_400, bytes: 412_000_000,   schema_columns: 34,  partitions: ['filing_quarter'],          last_updated_at: '2026-05-24T07:22:00Z' },
  { database: 'gold',   table: 'gold.fct_regional_bank_macro_attribution_daily',source_system: 'dbt mart', rows: 412_820,   bytes: 184_000_000,   schema_columns: 28,  partitions: ['observation_month'],       last_updated_at: '2026-05-24T07:22:00Z' },
  { database: 'gold',   table: 'gold.fct_complaint_sentiment_vs_price',         source_system: 'dbt mart', rows: 642_200,   bytes: 248_000_000,   schema_columns: 26,  partitions: ['observation_month'],       last_updated_at: '2026-05-24T07:22:00Z' },
  { database: 'gold',   table: 'gold.fct_sector_divergence',                    source_system: 'dbt mart', rows: 184_220,   bytes: 96_000_000,    schema_columns: 24,  partitions: ['observation_month'],       last_updated_at: '2026-05-24T07:22:00Z' },
];

const ENGINES: QueryEngine[] = [
  {
    name: 'Snowflake',
    status: 'active',
    description: 'Primary engine for the Altavest gold layer. Reads Iceberg externals through Polaris catalog; auto-suspends between queries. Where the research portal, the cost-estimator, and Cortex Analyst all land.',
    sample_query: `SELECT
  c.ticker, c.sector,
  h.position_value_usd, h.position_delta_qoq,
  m.fed_funds_rate, m.dgs10_yield
FROM gold.dim_companies                       c
JOIN gold.fct_13f_position_changes            h USING (cik)
JOIN gold.fct_regional_bank_macro_attribution_daily m
  ON m.observation_month = h.filing_quarter
WHERE c.sector = 'Financials'
  AND h.position_delta_qoq <= -0.15
ORDER BY h.position_value_usd DESC
LIMIT 50;`,
  },
  {
    name: 'Athena',
    status: 'available',
    description: 'Serverless reads against the same Iceberg gold tables via Glue. Useful for SEC compliance / audit ad-hoc that doesn\'t need to pay for warehouse time.',
    sample_query: `SELECT sector, COUNT(*) AS exit_count_30d
FROM gold.fct_13f_position_changes
WHERE filing_date >= current_date - interval '30' day
  AND position_delta_qoq <= -0.50
GROUP BY sector
ORDER BY exit_count_30d DESC;`,
  },
  {
    name: 'DuckDB',
    status: 'available',
    description: 'Analyst\'s laptop. Same Iceberg tables, queried directly from S3 with the iceberg extension. Tiny ad-hoc joins without spinning up anything.',
    sample_query: `INSTALL iceberg;
LOAD iceberg;

SELECT *
FROM iceberg_scan('s3://altavest-odi-lake/gold/fct_complaint_sentiment_vs_price/')
WHERE topic_cluster IN ('credit-reporting-errors','mortgage-servicing')
LIMIT 100;`,
  },
  {
    name: 'Trino',
    status: 'available',
    description: 'Federated engine that joins the lake to other relational sources (custodian master, internal trading book) without copying data first.',
    sample_query: `SELECT h.ticker, AVG(p.fill_price) AS avg_fill
FROM iceberg.gold.fct_13f_position_changes h
JOIN postgres.trading.executions p
  ON p.ticker = h.ticker
WHERE h.filing_quarter = '2026Q1'
GROUP BY h.ticker;`,
  },
  {
    name: 'Spark',
    status: 'available',
    description: 'Distributed compute for ML training and large factor-model joins. Reads the same Iceberg tables via the spark-iceberg runtime.',
    sample_query: `df = spark.read.format("iceberg")\\
  .load("gold.fct_13f_position_changes")
df.groupBy("sector", "filing_quarter")\\
  .agg({"position_delta_qoq": "avg"})\\
  .show()`,
  },
];

const ENGINE_COLORS: Record<QueryEngine['name'], string> = {
  Snowflake: '#29b5e8',
  Athena:    '#b8975c',
  DuckDB:    '#0b2545',
  Trino:     '#1d4e89',
  Spark:     '#b45309',
};

// ─── Number formatters ──────────────────────────────────────────────────────

function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)     return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
}

function formatBytes(b: number): string {
  if (b >= 1_000_000_000) return `${(b / 1_000_000_000).toFixed(2)} GB`;
  if (b >= 1_000_000)     return `${(b / 1_000_000).toFixed(1)} MB`;
  if (b >= 1_000)         return `${(b / 1_000).toFixed(1)} KB`;
  return `${b} B`;
}

// =============================================================================
// Page
// =============================================================================

export default function ArchitecturePage() {
  const [activeEngine, setActiveEngine] = useState<QueryEngine>(ENGINES[0]);

  const byLayer = (l: 'bronze' | 'silver' | 'gold') => TABLES.filter((t) => t.database === l);
  const layerStats = (l: 'bronze' | 'silver' | 'gold') => {
    const t = byLayer(l);
    return { tables: t.length, rows: t.reduce((s, r) => s + r.rows, 0), bytes: t.reduce((s, r) => s + r.bytes, 0) };
  };

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
      <header className="mb-8 border-b border-[var(--hairline)] pb-6">
        <div className="eyebrow mb-1">Open Data Infrastructure</div>
        <h1 className="font-serif text-3xl sm:text-4xl font-semibold tracking-tight text-[var(--ink-strong)]">
          One lake. Every engine. The whole position story.
        </h1>
        <p className="mt-3 text-[var(--ink-muted)] max-w-3xl leading-relaxed">
          Altavest Capital treats <em>storage</em>, <em>catalog</em>, and <em>compute</em> as three
          independently swappable layers. Iceberg is the storage spec. Glue is the catalog.
          Snowflake, Athena, DuckDB, Trino, and Spark can all read the same tables &mdash; no copy,
          no extract, no proprietary format between EDGAR and the portfolio manager.
        </p>
      </header>

      {/* ── Live throughput hero ──────────────────────────────────────────── */}
      <ThroughputHero />

      {/* ── Data Flow diagram ─────────────────────────────────────────────── */}
      <section className="research-card p-6 sm:p-8 mb-8" style={cardStyle}>
        <div className="eyebrow mb-1">Data Flow</div>
        <h2 className="font-serif text-2xl font-semibold text-[var(--ink-strong)] mb-6">
          From four open + reference sources to one governed gold layer
        </h2>

        <AliveMedallion
          sources={ALTAVEST_SOURCES}
          bronze={{ ...layerStats('bronze'), trend: [180, 195, 210, 222, 240, 255, 270] }}
          silver={{ ...layerStats('silver'), trend: [120, 130, 142, 155, 168, 180, 192] }}
          gold={{   ...layerStats('gold'),   trend: [80, 88, 95, 104, 112, 124, 138] }}
          engines={ALTAVEST_ENGINES}
          roles={ALTAVEST_ROLES}
          enginesCaption="All five read the same data — no copies, no rebuilds per tool."
          accent="#b8975c"
        />

        <div className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-4 text-xs text-[var(--ink-muted)]">
          <LayerDetail layer="bronze" stats={layerStats('bronze')} desc="Raw rows landed by Fivetran. 1:1 with source. Streaming for Cap IQ, batched for SEC/FRED/CFPB." />
          <LayerDetail layer="silver" stats={layerStats('silver')} desc="Conformed dims and facts. Cleaned, deduped, joined to a holdings + macro spine." />
          <LayerDetail layer="gold"   stats={layerStats('gold')}   desc="Business-ready marts + the dbt semantic layer. What every PM-facing surface reads." />
        </div>
      </section>

      {/* ── Run Cache — Fivetran skips syncs when source data hasn't changed ─ */}
      <RunCachePanel />

      {/* ── Schema-evolution ticker ──────────────────────────────────────── */}
      <SchemaEvolutionTicker />

      {/* ── Cost panel ───────────────────────────────────────────────────── */}
      <CostPanel />

      {/* ── Failure & recovery ───────────────────────────────────────────── */}
      <FailureRecoveryPanel />

      {/* ── MNPI + Restricted-list data contracts ───────────────────────── */}
      <DataContractsPanel />

      {/* ── Interactive lineage ──────────────────────────────────────────── */}
      <LineagePanel />

      {/* ── Multi-engine showcase ────────────────────────────────────────── */}
      <section className="research-card overflow-hidden mb-8" style={cardStyle}>
        <header className="research-card-header" style={cardHeaderStyle}>
          <div className="eyebrow">Compute is a choice</div>
          <h2 className="font-serif text-xl font-semibold text-[var(--ink-strong)] mt-0.5">
            Same Iceberg tables. Five engines. One query at a time.
          </h2>
          <p className="text-sm text-[var(--ink-muted)] mt-1">
            Pick a query engine &mdash; the SQL barely changes, but the operational, cost, and
            governance profile shifts dramatically. That choice belongs to the firm, not the vendor.
          </p>
        </header>

        <div className="px-5 pt-4 flex flex-wrap gap-2">
          {ENGINES.map((e) => (
            <button
              key={e.name}
              onClick={() => setActiveEngine(e)}
              className="px-3 py-2 rounded-sm text-xs font-semibold uppercase tracking-wider border transition-all"
              style={
                activeEngine.name === e.name
                  ? { background: ENGINE_COLORS[e.name], borderColor: ENGINE_COLORS[e.name], color: '#ffffff' }
                  : { background: '#ffffff', color: 'var(--ink-muted)', borderColor: 'var(--hairline)' }
              }
            >
              {e.name}
              {e.status === 'active' && <span className="ml-1.5 text-[9px] opacity-80">● ACTIVE</span>}
              {e.status === 'demo'   && <span className="ml-1.5 text-[9px] opacity-60">DEMO</span>}
            </button>
          ))}
        </div>

        <div className="p-5 grid grid-cols-1 md:grid-cols-3 gap-5">
          <div className="md:col-span-2">
            <div className="text-[10px] uppercase tracking-wider text-[var(--ink-soft)] font-semibold mb-2">Query</div>
            <pre className="rounded-sm p-4 text-[11.5px] leading-relaxed overflow-x-auto font-mono" style={{ background: '#0b2545', color: 'var(--paper,#fefaf3)' }}>
              <code>{activeEngine.sample_query}</code>
            </pre>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wider text-[var(--ink-soft)] font-semibold mb-2">Why this engine</div>
            <p className="text-sm text-[var(--ink)] leading-relaxed">{activeEngine.description}</p>
            <div className="mt-4 pt-4 border-t border-[var(--hairline-soft,#e8e4d8)]">
              <div className="text-[10px] uppercase tracking-wider text-[var(--ink-soft)] font-semibold mb-1">Status</div>
              <div className="text-sm font-semibold" style={{ color: activeEngine.status === 'active' ? '#15803d' : '#6b7280' }}>
                {activeEngine.status === 'active' ? '● Primary engine — powers this site' : 'Compatible and ready to wire in'}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Iceberg catalog ──────────────────────────────────────────────── */}
      <section className="research-card overflow-hidden mb-8" style={cardStyle}>
        <header className="research-card-header" style={cardHeaderStyle}>
          <div className="eyebrow">Iceberg Catalog</div>
          <h2 className="font-serif text-xl font-semibold text-[var(--ink-strong)] mt-0.5">
            Every table on the lake, registered in AWS Glue
          </h2>
          <p className="text-sm text-[var(--ink-muted)] mt-1">
            Open metadata. Every engine reads the same schema, the same partition layout, the same
            row counts &mdash; without anyone owning the "source of truth" exclusively.
          </p>
        </header>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm" style={{ fontVariantNumeric: 'tabular-nums' }}>
            <thead className="border-b border-[var(--hairline)]" style={{ background: 'var(--paper-deep,#f4efe2)' }}>
              <tr>
                <Th>Layer</Th>
                <Th>Table</Th>
                <Th>Source</Th>
                <Th align="right">Rows</Th>
                <Th align="right">Size</Th>
                <Th align="right">Columns</Th>
                <Th>Partitions</Th>
                <Th align="right">Updated</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--hairline-soft,#e8e4d8)]">
              {TABLES.map((t) => (
                <tr key={`${t.database}.${t.table}`} className="hover:bg-[var(--paper-deep,#f4efe2)] cursor-default">
                  <td className="px-4 py-2.5"><LayerChip layer={t.database} /></td>
                  <td className="px-4 py-2.5 font-mono text-[12px] text-[var(--ink-strong)]">{t.table}</td>
                  <td className="px-4 py-2.5 text-xs text-[var(--ink-muted)] font-mono">{t.source_system}</td>
                  <td className="px-4 py-2.5 text-right font-semibold text-[var(--ink-strong)]">{formatNumber(t.rows)}</td>
                  <td className="px-4 py-2.5 text-right text-[var(--ink)]">{formatBytes(t.bytes)}</td>
                  <td className="px-4 py-2.5 text-right text-[var(--ink-muted)]">{t.schema_columns}</td>
                  <td className="px-4 py-2.5 text-xs text-[var(--ink-muted)] font-mono">
                    {t.partitions.length ? t.partitions.join(', ') : <span className="text-[var(--ink-soft)]">—</span>}
                  </td>
                  <td className="px-4 py-2.5 text-right text-xs text-[var(--ink-muted)] font-mono">
                    {new Date(t.last_updated_at).toLocaleDateString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* ── Data Quality — dbt Labs ──────────────────────────────────────── */}
      <section className="research-card overflow-hidden mb-8" style={cardStyle}>
        <header className="research-card-header flex items-start justify-between gap-4" style={cardHeaderStyle}>
          <div>
            <div className="eyebrow" style={{ color: '#FF694A' }}>Data Quality · dbt Labs</div>
            <h2 className="font-serif text-xl font-semibold text-[var(--ink-strong)] mt-0.5">
              Every table tested. Every run. Same lake.
            </h2>
            <p className="text-sm text-[var(--ink-muted)] mt-1">
              Tests defined in dbt Labs run on every build, against the same Iceberg tables every
              engine reads. Failures block promotion to the next layer &mdash; bad data never
              reaches the trade desk. Pairs with the Great Expectations checkpoints below: GX
              validates the raw Bronze landings, dbt asserts the SQL-level constraints on Silver
              and Gold.
            </p>
          </div>
          <div className="inline-flex items-center gap-1.5 rounded-sm px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-wider text-white shrink-0" style={{ background: '#FF694A' }}>
            dbt Labs
          </div>
        </header>
        <div className="grid grid-cols-1 md:grid-cols-3 divide-y md:divide-y-0 md:divide-x divide-[var(--hairline-soft,#e8e4d8)]">
          {[
            { layer: 'bronze' as const, tests: 24, passing: 24, monitors: ['freshness · SEC 8-K window', 'volume · CFPB daily intake', 'schema drift · XBRL taxonomy'],            color: '#b45309' },
            { layer: 'silver' as const, tests: 62, passing: 61, monitors: ['nulls · CIK joins', 'uniqueness · filing_id', 'referential · ticker→CIK', 'accepted values · series_id'], color: '#6b7280' },
            { layer: 'gold'   as const, tests: 38, passing: 38, monitors: ['business rules · macro regimes', 'sum-to-source · 13F holdings', 'restricted-list reconciliation'],   color: '#b8975c' },
          ].map((q) => {
            const ok = q.passing === q.tests;
            return (
              <div key={q.layer} className="p-5">
                <div className="flex items-center justify-between">
                  <LayerChip layer={q.layer} />
                  <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: ok ? '#15803d' : '#b91c1c' }}>
                    {ok ? '● all passing' : `● ${q.tests - q.passing} warn`}
                  </span>
                </div>
                <div className="mt-3 flex items-baseline gap-2">
                  <div className="font-serif text-3xl font-semibold text-[var(--ink-strong)]" style={{ fontVariantNumeric: 'tabular-nums' }}>
                    {q.passing}<span className="text-[var(--ink-soft)]">/{q.tests}</span>
                  </div>
                  <div className="text-xs text-[var(--ink-muted)]">tests · last run 12m ago</div>
                </div>
                <ul className="mt-3 space-y-1.5 text-xs text-[var(--ink-muted)]">
                  {q.monitors.map((m) => (
                    <li key={m} className="flex items-center gap-2">
                      <span className="h-1.5 w-1.5 rounded-full inline-block" style={{ background: q.color }} />
                      {m}
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
        <div className="px-5 py-3 border-t border-[var(--hairline-soft,#e8e4d8)] flex items-center justify-between text-[11px] text-[var(--ink-soft)]" style={{ background: 'var(--paper-deep,#f4efe2)' }}>
          <span className="font-mono">124 tests · 123 passing · 1 warn · 0 errors</span>
          <span className="uppercase tracking-wider font-semibold">dbt build · merged into Fivetran</span>
        </div>
      </section>

      {/* ── Data Quality — Great Expectations (Fivetran-stewarded OSS) ──── */}
      <GreatExpectationsPanel />

      {/* ── Before / After ───────────────────────────────────────────────── */}
      <BeforeAfterPanel />
    </div>
  );
}

// =============================================================================
// Helpers — shared styles + sub-components
// =============================================================================

const cardStyle = {
  background: '#ffffff',
  border: '1px solid var(--hairline, #d9d3c4)',
  borderRadius: '4px',
};

const cardHeaderStyle = {
  padding: '20px',
  borderBottom: '1px solid var(--hairline-soft, #e8e4d8)',
};

function Th({ children, align = 'left' }: { children: React.ReactNode; align?: 'left' | 'right' }) {
  return (
    <th className={`px-4 py-2.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--ink-soft)] ${align === 'right' ? 'text-right' : 'text-left'}`}>
      {children}
    </th>
  );
}

function LayerChip({ layer }: { layer: 'bronze' | 'silver' | 'gold' }) {
  const styles: Record<typeof layer, { bg: string; fg: string; border: string }> = {
    bronze: { bg: '#fef3c7', fg: '#92400e', border: '#b45309' },
    silver: { bg: '#f3f4f6', fg: '#374151', border: '#6b7280' },
    gold:   { bg: '#faf3e1', fg: '#7a5e2d', border: '#b8975c' },
  };
  const s = styles[layer];
  return (
    <span className="inline-block text-[9px] font-bold uppercase tracking-[0.15em] px-1.5 py-0.5 rounded-sm border"
          style={{ background: s.bg, color: s.fg, borderColor: s.border }}>
      {layer}
    </span>
  );
}

function LayerDetail({ layer, stats, desc }: { layer: 'bronze' | 'silver' | 'gold'; stats: { tables: number; rows: number; bytes: number }; desc: string }) {
  return (
    <div className="border border-[var(--hairline,#d9d3c4)] rounded-sm p-3 bg-white">
      <div className="flex items-center justify-between mb-2">
        <LayerChip layer={layer} />
        <span className="text-[10px] text-[var(--ink-soft)] font-mono">{stats.tables} table{stats.tables === 1 ? '' : 's'}</span>
      </div>
      <div className="text-sm font-bold text-[var(--ink-strong)]" style={{ fontVariantNumeric: 'tabular-nums' }}>
        {formatNumber(stats.rows)} rows · {formatBytes(stats.bytes)}
      </div>
      <div className="text-[11px] text-[var(--ink-muted)] mt-1 leading-snug">{desc}</div>
    </div>
  );
}

// =============================================================================
// ThroughputHero — pulsing live counter "rows in motion today"
// =============================================================================
function ThroughputHero() {
  const [rowsToday, setRowsToday] = useState(6_184_220);
  useEffect(() => {
    const id = setInterval(() => setRowsToday((n) => n + 8 + Math.floor(Math.random() * 12)), 600);
    return () => clearInterval(id);
  }, []);
  const trend = [5.4, 5.6, 5.8, 5.9, 6.0, 6.1, 6.18];
  return (
    <section className="mb-8 grid grid-cols-1 md:grid-cols-[1.5fr_1fr_1fr_1fr] gap-3 sm:gap-4">
      <div className="research-card p-5 sm:p-6 relative overflow-hidden" style={cardStyle}>
        <div className="absolute inset-0 pointer-events-none" style={{ background: 'radial-gradient(circle at 100% 0%, rgba(184,151,92,0.18), transparent 60%)' }} />
        <div className="relative">
          <div className="eyebrow" style={{ color: '#b8975c' }}>● Live</div>
          <div className="mt-1 text-[10px] uppercase tracking-[0.18em] text-[var(--ink-soft)] font-semibold">
            Rows in motion today
          </div>
          <div className="mt-2 font-serif font-semibold leading-none text-[var(--ink-strong)]"
               style={{ fontSize: 44, fontVariantNumeric: 'tabular-nums' }}>
            {rowsToday.toLocaleString()}
          </div>
          <div className="mt-2 text-xs text-[var(--ink-muted)]">across 4 sources · 20 Iceberg tables · CDC + Kafka stream</div>
        </div>
      </div>
      <Kpi label="Cap IQ stream · p50" value="18s" sub="Kafka topic · intraday quotes" />
      <Kpi label="Bronze → Gold lag · p99" value="22 min" sub="Within 30-min SLO" />
      <Kpi label="Connector uptime · 90d" value="99.96%" sub={
        <Sparklike values={trend} />
      } />
    </section>
  );
}

function Kpi({ label, value, sub }: { label: string; value: string; sub: React.ReactNode }) {
  return (
    <div className="research-card p-4 sm:p-5" style={cardStyle}>
      <div className="text-[10px] uppercase tracking-[0.16em] text-[var(--ink-soft)] font-semibold">{label}</div>
      <div className="mt-1.5 font-serif font-semibold leading-none text-[var(--ink-strong)]"
           style={{ fontSize: 30, fontVariantNumeric: 'tabular-nums' }}>
        {value}
      </div>
      <div className="mt-2 text-xs text-[var(--ink-muted)]">{sub}</div>
    </div>
  );
}

function Sparklike({ values }: { values: number[] }) {
  const max = Math.max(...values), min = Math.min(...values);
  const rng = max - min || 1;
  const w = 80, h = 18;
  const stepX = w / (values.length - 1);
  const pts = values.map((v, i) => `${(i * stepX).toFixed(1)},${(h - ((v - min) / rng) * h).toFixed(1)}`).join(' ');
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
      <polyline points={pts} fill="none" stroke="#b8975c" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

// =============================================================================
// RunCachePanel — Fivetran skips a sync entirely when source data hasn't
// changed. Hit rate runs ~84% on Altavest connectors because most
// reference / regulatory feeds (SEC EDGAR outside filing windows, FRED
// weekly macro, CFPB monthly batches) are idle most hours of the day.
// Cap IQ intraday quotes are a Kafka stream and bypass the cache.
// =============================================================================
function RunCachePanel() {
  const CONNECTORS = [
    { name: 'SEC EDGAR · 13F holdings',           scheduled: 24, skipped: 22, hit: 0.917 },
    { name: 'SEC EDGAR · filings index',           scheduled: 24, skipped: 19, hit: 0.792 },
    { name: 'SEC EDGAR · company facts',           scheduled: 24, skipped: 23, hit: 0.958 },
    { name: 'FRED · macro series',                 scheduled: 24, skipped: 23, hit: 0.958 },
    { name: 'CFPB · complaints',                   scheduled:  4, skipped:  4, hit: 1.000 },
    { name: 'S&P Cap IQ · company reference',     scheduled: 96, skipped: 71, hit: 0.740 },
  ];
  const tot = CONNECTORS.reduce((a, c) => ({ s: a.s + c.scheduled, k: a.k + c.skipped }), { s: 0, k: 0 });
  const hit = tot.s ? Math.round((tot.k / tot.s) * 100) : 0;

  return (
    <section className="mb-8 research-card overflow-hidden" style={cardStyle}>
      <header className="research-card-header flex items-start justify-between gap-4" style={cardHeaderStyle}>
        <div>
          <div className="eyebrow" style={{ color: '#7c3aed' }}>Fivetran · Run Cache</div>
          <h2 className="font-serif text-xl font-semibold text-[var(--ink-strong)] mt-0.5">
            The cheapest sync is the one we don't run.
          </h2>
          <p className="text-sm text-[var(--ink-muted)] mt-1 max-w-3xl">
            Before each scheduled sync, Fivetran checks the source for changes. No changes
            &rarr; the sync is skipped entirely, the <code className="font-mono text-[12px]">_fivetran_synced</code> timestamp
            doesn't advance, and dbt incrementals filtered on it process zero rows. Run cache
            decides what moves. Great Expectations decides what passes. dbt decides what
            becomes business-ready.
          </p>
        </div>
        <div className="inline-flex items-center gap-1.5 rounded-sm px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-wider text-white shrink-0" style={{ background: '#7c3aed' }}>
          {hit}% hit rate · 24h
        </div>
      </header>

      <div className="grid grid-cols-2 md:grid-cols-4 divide-y-0 md:divide-x divide-[var(--hairline-soft,#e8e4d8)]">
        <RecoveryTile label="Run-cache hit rate · 24h" big={`${hit}%`}                                   sub={`${tot.k} of ${tot.s} scheduled syncs skipped — source hadn't changed`} color="#7c3aed" />
        <RecoveryTile label="Compute hours saved · 90d" big="164 h"                                       sub="≈ $328 in warehouse time at XS rate · idle-hour bill stays at zero" color="#16a34a" />
        <RecoveryTile label="Annual savings · projected" big="$31.8k"                                     sub="Across Altavest connectors · vs. dumb 15-min polling baseline" color="#16a34a" />
        <RecoveryTile label="Avg skipped-sync duration" big="160 ms"                                     sub="Source-change check only · no warehouse spin-up, no rows landed" />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-0 divide-y md:divide-y-0 md:divide-x divide-[var(--hairline-soft,#e8e4d8)] border-t border-[var(--hairline-soft,#e8e4d8)]">
        <div className="p-5">
          <div className="text-[10px] uppercase tracking-[0.16em] text-[var(--ink-soft)] font-semibold mb-3">Hit rate · by connector · last 24h</div>
          <ul className="space-y-2">
            {CONNECTORS.map((c) => {
              const pct = Math.round(c.hit * 100);
              const colour = pct >= 80 ? '#16a34a' : pct >= 50 ? '#7c3aed' : '#b45309';
              return (
                <li key={c.name} className="grid grid-cols-[1.6fr_3fr_auto] gap-3 items-center text-[12px]">
                  <span className="font-mono text-[11px] text-[var(--ink-strong)] truncate">{c.name}</span>
                  <span className="relative h-2.5 rounded-sm overflow-hidden" style={{ background: '#f4f4ef', border: '1px solid var(--hairline-soft,#e8e4d8)' }}>
                    <span className="absolute inset-y-0 left-0" style={{ width: `${pct}%`, background: colour, transition: 'width 600ms ease' }} />
                  </span>
                  <span className="font-mono text-[11px] text-[var(--ink-muted)] tabular-nums">
                    <strong className="text-[var(--ink-strong)]">{pct}%</strong> · {c.skipped}/{c.scheduled}
                  </span>
                </li>
              );
            })}
          </ul>
          <p className="text-[11px] text-[var(--ink-soft)] leading-relaxed mt-3">
            Regulatory feeds (EDGAR, FRED, CFPB) are idle most of the day &mdash; the run-cache
            hit rate runs near 100%. Cap IQ reference data changes a few times an hour during
            market hours, which is exactly where the cache check pays for itself.
          </p>
        </div>
        <div className="p-5">
          <div className="text-[10px] uppercase tracking-[0.16em] text-[var(--ink-soft)] font-semibold mb-3">How dbt amplifies the win</div>
          <pre className="font-mono text-[11.5px] leading-relaxed overflow-x-auto rounded-sm p-3" style={{ background: '#0b2545', color: '#e6e9f0' }}><code>{`-- inc_holdings_changes.sql
{{
  config(
    materialized = 'incremental',
    unique_key   = ['cik', 'ticker', 'filing_quarter'],
    incremental_strategy = 'merge',
    on_schema_change     = 'append_new_columns'
  )
}}

select *
from {{ ref('stg_sec__holdings_13f') }}
{% if is_incremental() %}
  -- Filter on Fivetran's sync timestamp, not filing_quarter.
  -- When run cache skips the sync, this returns zero rows and
  -- dbt finishes in seconds.
  where fivetran_synced_at > (
    select max(fivetran_synced_at) from {{ this }}
  )
{% endif %}`}</code></pre>
          <ul className="mt-3 space-y-2 text-[12px] text-[var(--ink-muted)]">
            <li><strong className="text-[var(--ink-strong)]">Filter on <code className="font-mono text-[11px]">_fivetran_synced</code></strong>, never on business dates &mdash; that's what propagates the run-cache decision downstream.</li>
            <li><strong className="text-[var(--ink-strong)]">Honor <code className="font-mono text-[11px]">_fivetran_deleted</code></strong> for soft deletes; the same flag flows through every layer.</li>
            <li><strong className="text-[var(--ink-strong)]">Never <code className="font-mono text-[11px]">--full-refresh</code></strong> on a schedule &mdash; one rebuild defeats months of saved compute.</li>
          </ul>
        </div>
      </div>
    </section>
  );
}

// =============================================================================
// SchemaEvolutionTicker — Iceberg's killer feature, displayed as a stock-ticker
// =============================================================================
const EVO_EVENTS = [
  { ts: '2026-05-24 06:14', op: 'ADD COLUMN restricted_flag',           table: 'bronze.sec__holdings_13f',         ms: 32, models: 5 },
  { ts: '2026-05-23 22:01', op: 'RENAME COLUMN cik_str → cik',           table: 'bronze.sec__company_facts',        ms: 24, models: 7 },
  { ts: '2026-05-22 14:47', op: 'WIDEN INT → BIGINT shares_held',        table: 'silver.int_holdings_spine',        ms: 41, models: 3 },
  { ts: '2026-05-21 09:30', op: 'ADD COLUMN sector_gics_4',              table: 'gold.dim_companies',               ms: 18, models: 9 },
  { ts: '2026-05-20 18:09', op: 'DROP COLUMN deprecated_filing_url',     table: 'bronze.sec__filings_index',        ms: 28, models: 2 },
];
function SchemaEvolutionTicker() {
  const [idx, setIdx] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setIdx((n) => (n + 1) % EVO_EVENTS.length), 4200);
    return () => clearInterval(id);
  }, []);
  const e = EVO_EVENTS[idx];
  return (
    <section className="mb-8 research-card p-5 overflow-hidden relative" style={{ ...cardStyle, background: 'linear-gradient(90deg, #fff 0%, #f8fafc 100%)' }}>
      <div className="absolute top-0 right-0 bottom-0 w-1.5" style={{ background: 'linear-gradient(180deg, #b8975c, #0b2545)' }} />
      <div className="flex items-baseline justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="eyebrow" style={{ color: '#1d4e89' }}>Iceberg · Schema evolution</div>
          <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-sm" style={{ color: '#15803d', background: '#f0fdf4', border: '1px solid #bbf7d0' }}>
            ● Live feed
          </span>
        </div>
        <div className="font-mono text-[10px] text-[var(--ink-soft)]">last 5 schema changes</div>
      </div>
      <div className="mt-3 flex items-center gap-3 flex-wrap" style={{ fontVariantNumeric: 'tabular-nums' }}>
        <span className="font-mono text-[11px] text-[var(--ink-soft)]">{e.ts}</span>
        <span className="font-mono text-[13px] font-semibold text-[var(--ink-strong)]">{e.op}</span>
        <span className="font-mono text-[12px] text-[var(--ink-muted)]">on {e.table}</span>
      </div>
      <div className="mt-2 flex items-center gap-4 text-[12px] text-[var(--ink-muted)] flex-wrap">
        <span><strong className="text-[var(--ink-strong)]">{e.ms} ms</strong> · metadata-only operation</span>
        <span>•</span>
        <span>0 data rewritten · 0 downtime</span>
        <span>•</span>
        <span><strong className="text-[var(--ink-strong)]">{e.models}</strong> downstream dbt models auto-revalidated</span>
      </div>
      <div className="mt-3 text-[11px] text-[var(--ink-soft)] leading-relaxed">
        Apache Iceberg treats schema changes as table metadata, not file rewrites. The Modern Data Stack equivalent &mdash;
        an Oracle <code className="font-mono">ALTER TABLE ADD COLUMN</code> on a 4.8M-row holdings table &mdash; locks the
        table for ~8 minutes during the rewrite. Same change in Iceberg: <strong>milliseconds, no lock</strong>.
      </div>
    </section>
  );
}

// =============================================================================
// CostPanel — the CFO line. Storage cheap, compute the lever.
// =============================================================================
function CostPanel() {
  return (
    <section className="mb-8 research-card overflow-hidden" style={cardStyle}>
      <header className="research-card-header" style={cardHeaderStyle}>
        <div className="flex items-baseline justify-between gap-4 flex-wrap">
          <div>
            <div className="eyebrow" style={{ color: '#b8975c' }}>FinOps</div>
            <h2 className="font-serif text-xl font-semibold text-[var(--ink-strong)] mt-0.5">
              What this costs to run, every day
            </h2>
            <p className="text-sm text-[var(--ink-muted)] mt-1 max-w-3xl">
              Storage and compute billed separately. Storage is essentially free at this scale; compute scales
              with workload because Snowflake warehouses auto-suspend when no one is reading.
            </p>
          </div>
          <div className="inline-flex items-center gap-1.5 rounded-sm px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-wider text-white shrink-0" style={{ background: '#b8975c' }}>
            −67% vs legacy
          </div>
        </div>
      </header>
      <div className="grid grid-cols-1 md:grid-cols-4 divide-y md:divide-y-0 md:divide-x divide-[var(--hairline-soft,#e8e4d8)]">
        <CostTile label="Storage · per day"   value="$1.12"  sub="3.1 TB across bronze/silver/gold · S3 Standard-IA"  color="#15803d" />
        <CostTile label="Compute · per day"   value="$5.34"  sub="Snowflake XS auto-suspend · dbt Cloud · Athena ad-hoc" color="#b8975c" />
        <CostTile label="Run cache · saved"   value="$4.21"  sub="84% of scheduled syncs skipped today · no source changes detected" color="#7c3aed" />
        <CostTile label="Equivalent MDS"      value="$19.80" sub="Internal benchmark · same data, warehouse-resident" color="#b91c1c" />
      </div>
      <div className="px-5 py-3 border-t border-[var(--hairline-soft,#e8e4d8)] flex items-center justify-between text-[11px] text-[var(--ink-soft)] bg-[var(--paper-deep,#f4efe2)]">
        <span>Compute curve: 72% of spend is the 7 AM–10 AM pre-open research window. Idle hours bill at zero.</span>
        <span className="uppercase tracking-wider font-semibold">Cost-attribution: per-warehouse + per-dbt-model</span>
      </div>
    </section>
  );
}

function CostTile({ label, value, sub, color }: { label: string; value: string; sub: string; color: string }) {
  return (
    <div className="p-5">
      <div className="text-[10px] uppercase tracking-[0.16em] text-[var(--ink-soft)] font-semibold">{label}</div>
      <div className="mt-2 font-serif font-semibold leading-none" style={{ fontSize: 30, color, fontVariantNumeric: 'tabular-nums' }}>
        {value}
      </div>
      <div className="mt-2 text-xs text-[var(--ink-muted)] leading-snug">{sub}</div>
    </div>
  );
}

// =============================================================================
// FailureRecoveryPanel — the "what happens when it breaks" answer
// =============================================================================
function FailureRecoveryPanel() {
  return (
    <section className="mb-8 research-card overflow-hidden" style={cardStyle}>
      <header className="research-card-header" style={cardHeaderStyle}>
        <div className="eyebrow" style={{ color: '#b45309' }}>Resilience · Recovery</div>
        <h2 className="font-serif text-xl font-semibold text-[var(--ink-strong)] mt-0.5">
          What happens when a connector fails
        </h2>
        <p className="text-sm text-[var(--ink-muted)] mt-1 max-w-3xl">
          Every Fivetran connector has automatic retry with exponential backoff; failed rows land in a
          dead-letter queue for replay; dbt builds gate gold on green silver. SEC audit logs capture
          every replay for compliance. Below: the last 30 days.
        </p>
      </header>
      <div className="grid grid-cols-2 md:grid-cols-4 divide-y-0 md:divide-x divide-[var(--hairline-soft,#e8e4d8)]">
        <RecoveryTile label="Retry policy"           big="exp 5×"   sub="2s · 8s · 30s · 2m · 8m, then DLQ" />
        <RecoveryTile label="Dead-letter · current"   big="9"        sub="rows held · 6 EDGAR throttle, 3 CIQ dupe-key" color="#b45309" />
        <RecoveryTile label="MTTR · last 30d"         big="8 min"    sub="median · max 31 min during EDGAR rate-limit storm" />
        <RecoveryTile label="Last incident"           big="3 d ago"  sub="Replayed automatically in 4 min, zero data loss" color="#15803d" />
      </div>
    </section>
  );
}

function RecoveryTile({ label, big, sub, color = 'var(--ink-strong)' }: { label: string; big: string; sub: string; color?: string }) {
  return (
    <div className="p-5">
      <div className="text-[10px] uppercase tracking-[0.16em] text-[var(--ink-soft)] font-semibold">{label}</div>
      <div className="mt-1.5 font-serif font-semibold leading-none" style={{ fontSize: 26, color, fontVariantNumeric: 'tabular-nums' }}>
        {big}
      </div>
      <div className="mt-2 text-xs text-[var(--ink-muted)] leading-snug">{sub}</div>
    </div>
  );
}

// =============================================================================
// DataContractsPanel — MNPI + Restricted-list governance for asset management
// =============================================================================
function DataContractsPanel() {
  return (
    <section className="mb-8 research-card overflow-hidden" style={cardStyle}>
      <header className="research-card-header flex items-start justify-between gap-4" style={cardHeaderStyle}>
        <div>
          <div className="eyebrow" style={{ color: '#5b21b6' }}>Data Contracts · MNPI + Restricted-List Governance</div>
          <h2 className="font-serif text-xl font-semibold text-[var(--ink-strong)] mt-0.5">
            MNPI never reaches a research query without a policy
          </h2>
          <p className="text-sm text-[var(--ink-muted)] mt-1 max-w-3xl">
            Every column carrying material non-public information or complainant PII is tagged at
            ingest. Row-level access scopes by desk and role. Restricted-list flag on any holding
            under research embargo. Every read goes to an SEC-grade audit log.
          </p>
        </div>
        <div className="inline-flex items-center gap-1.5 rounded-sm px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-wider text-white shrink-0" style={{ background: '#5b21b6' }}>
          SEC · MNPI
        </div>
      </header>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-0 divide-y md:divide-y-0 md:divide-x divide-[var(--hairline-soft,#e8e4d8)]">
        <div className="p-5">
          <div className="text-[10px] uppercase tracking-[0.16em] text-[var(--ink-soft)] font-semibold mb-3">Policy coverage</div>
          <ul className="space-y-2 text-sm">
            <Policy label="PII columns tagged"          value="18 columns across 6 tables (CFPB complainants)" />
            <Policy label="MNPI columns tagged"          value="12 columns across 4 tables (pre-announcement filings)" />
            <Policy label="Restricted-list flag"          value="join-time check against compliance.restricted_tickers" />
            <Policy label="Row-level access policy"      value="desk_id + role scoped per analyst" />
            <Policy label="Column masking on read"       value="complainant_name · complainant_zip · phone · email" />
            <Policy label="Audit log destination"        value="CloudTrail → S3 (7 yr) → Iceberg sec_audit_log table" />
          </ul>
        </div>
        <div className="p-5">
          <div className="text-[10px] uppercase tracking-[0.16em] text-[var(--ink-soft)] font-semibold mb-3">Sample contract · gold.dim_holdings</div>
          <pre className="font-mono text-[11.5px] leading-relaxed overflow-x-auto rounded-sm p-3" style={{ background: '#0b2545', color: '#e6e9f0' }}><code>{`columns:
  - name: holding_id
    tests: [unique, not_null]
    meta: { contains_mnpi: false }
  - name: cik
    tests: [not_null, relationships: dim_companies]
    meta: { restricted_list_check: true }
  - name: pre_announcement_window
    meta: { contains_mnpi: true, mask_policy: "embargo_until_filing_date" }
  - name: desk_id
    tests: [accepted_values: ['equity','credit','macro']]
    meta: { rls_partition_key: true }`}</code></pre>
        </div>
      </div>
    </section>
  );
}

function Policy({ label, value }: { label: string; value: string }) {
  return (
    <li className="flex items-start gap-2">
      <span className="mt-1.5 inline-block w-1.5 h-1.5 rounded-full shrink-0" style={{ background: '#5b21b6' }} />
      <div className="flex-1">
        <span className="text-[var(--ink-strong)] font-semibold">{label}</span>
        <span className="text-[var(--ink-muted)]"> · {value}</span>
      </div>
    </li>
  );
}

// =============================================================================
// GreatExpectationsPanel — GX Core as the validation gate before Silver
// promotion. Fivetran became steward of the Great Expectations community
// and the GX Core project on 2026-05-13; dbt tests sit alongside GX as
// the "trust" pillar of Fivetran's ODI story (move · transform · trust).
// =============================================================================
interface GxSuite {
  suite: string;
  table: string;
  layer: 'bronze' | 'silver' | 'gold';
  expectations: number;
  passing: number;
  last_run: string;
  why: string;
}

const GX_SUITES: GxSuite[] = [
  {
    suite: 'sec.holdings_13f.completeness',
    table: 'bronze.sec__holdings_13f',
    layer: 'bronze',
    expectations: 18,
    passing: 18,
    last_run: '07:14:22',
    why: 'cik populated and 10-digit; value_usd ≥ 0; shares ≥ 0; filing_quarter matches YYYYQ# format.',
  },
  {
    suite: 'sec.filings_index.schema',
    table: 'bronze.sec__filings_index',
    layer: 'bronze',
    expectations: 14,
    passing: 14,
    last_run: '07:14:29',
    why: 'form_type ∈ SEC published list; filing_date ≤ today; accession_number matches NN-NNNNNNN-NN format.',
  },
  {
    suite: 'sec.company_facts.referential',
    table: 'bronze.sec__company_facts',
    layer: 'bronze',
    expectations: 13,
    passing: 13,
    last_run: '07:14:34',
    why: 'cik resolves to filings_index; fact_value numeric; reporting_period within last 30 years.',
  },
  {
    suite: 'fred.macro_series.ranges',
    table: 'bronze.fred__macro_series',
    layer: 'bronze',
    expectations: 12,
    passing: 11,
    last_run: '07:11:09',
    why: 'observation_value not null on published dates; observation_date within last 60 years; one warn on 47 stale series IDs FRED deprecated this month.',
  },
  {
    suite: 'cfpb.complaints.value_set',
    table: 'bronze.cfpb__complaints',
    layer: 'bronze',
    expectations: 15,
    passing: 15,
    last_run: '06:22:18',
    why: 'product ∈ CFPB published list; state ∈ US states + territories; date_received within last 12 years.',
  },
  {
    suite: 'sp_ciq.intraday_quotes.tick',
    table: 'bronze.sp_ciq__intraday_quotes',
    layer: 'bronze',
    expectations: 17,
    passing: 17,
    last_run: '07:14:48',
    why: 'streaming Cap IQ quotes — bid ≤ ask; volume ≥ 0; ticker ∈ company_ref universe; lag p99 within 12s.',
  },
  {
    suite: 'silver.holdings_spine.integrity',
    table: 'silver.int_holdings_spine',
    layer: 'silver',
    expectations: 20,
    passing: 20,
    last_run: '07:18:11',
    why: 'one row per (cik, ticker, filing_quarter); no orphan holdings; share count reconciles to filings_index totals.',
  },
  {
    suite: 'gold.fct_13f_position_changes.delta',
    table: 'gold.fct_13f_position_changes',
    layer: 'gold',
    expectations: 13,
    passing: 13,
    last_run: '07:22:51',
    why: '|delta_shares| ≤ 5× prior position (catches data ingestion glitches that look like 100× position changes); quarter-over-quarter consistency.',
  },
];

function GreatExpectationsPanel() {
  const totals = GX_SUITES.reduce(
    (a, s) => ({ exp: a.exp + s.expectations, pass: a.pass + s.passing, suites: a.suites + 1 }),
    { exp: 0, pass: 0, suites: 0 },
  );
  const warns = totals.exp - totals.pass;

  return (
    <section className="mb-8 research-card overflow-hidden" style={cardStyle}>
      <header className="research-card-header flex items-start justify-between gap-4" style={cardHeaderStyle}>
        <div>
          <div className="eyebrow" style={{ color: '#ff6310' }}>Data Quality · Great Expectations</div>
          <h2 className="font-serif text-xl font-semibold text-[var(--ink-strong)] mt-0.5">
            Validation runs on Bronze before anything reaches Silver.
          </h2>
          <p className="text-sm text-[var(--ink-muted)] mt-1 max-w-3xl">
            Expectation suites define what "valid" looks like for each table &mdash; SEC EDGAR
            schema conformance, FRED macro-series ranges, intraday quote tick-integrity,
            position-change delta bounds. A failed expectation blocks promotion. Same lake, same
            Iceberg snapshots, just gated.
          </p>
        </div>
        <div className="flex flex-col items-end gap-1.5 shrink-0">
          <div className="inline-flex items-center gap-1.5 rounded-sm px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-wider text-white" style={{ background: '#ff6310' }}>
            GX Core · OSS
          </div>
          <div className="text-[10px] text-[var(--ink-soft)] font-mono">Fivetran-stewarded · May 2026</div>
        </div>
      </header>

      <div className="grid grid-cols-2 md:grid-cols-4 divide-y-0 md:divide-x divide-[var(--hairline-soft,#e8e4d8)]">
        <RecoveryTile label="Expectation suites"        big={String(totals.suites)}              sub="across bronze · silver · gold layers" />
        <RecoveryTile label="Expectations · today"      big={`${totals.pass}/${totals.exp}`}     sub={`${warns} warn · 0 errors · gates Silver promotion`} color={warns ? '#b45309' : '#16a34a'} />
        <RecoveryTile label="Checkpoint cadence"        big="every sync"                          sub="triggered by Fivetran sync-complete · runs before dbt build" />
        <RecoveryTile label="Failed-expectation queue"  big="47 rows"                             sub="stale FRED series · held in dlq.gx_quarantine · retried after suite update" color="#b45309" />
      </div>

      <div className="overflow-x-auto border-t border-[var(--hairline-soft,#e8e4d8)]">
        <table className="min-w-full text-sm" style={{ fontVariantNumeric: 'tabular-nums' }}>
          <thead className="border-b border-[var(--hairline)]" style={{ background: 'var(--paper-deep,#f4efe2)' }}>
            <tr>
              <Th>Layer</Th>
              <Th>Suite</Th>
              <Th>Table under test</Th>
              <Th align="right">Expectations</Th>
              <Th align="right">Last run</Th>
              <Th>What it asserts</Th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--hairline-soft,#e8e4d8)]">
            {GX_SUITES.map((s) => {
              const ok = s.passing === s.expectations;
              return (
                <tr key={s.suite} className="hover:bg-[var(--paper-deep,#f4efe2)] cursor-default">
                  <td className="px-4 py-2.5"><LayerChip layer={s.layer} /></td>
                  <td className="px-4 py-2.5 font-mono text-[12px] text-[var(--ink-strong)]">{s.suite}</td>
                  <td className="px-4 py-2.5 text-xs text-[var(--ink-muted)] font-mono">{s.table}</td>
                  <td className="px-4 py-2.5 text-right font-semibold" style={{ color: ok ? '#16a34a' : '#b45309' }}>
                    {s.passing}/{s.expectations}
                    {!ok && <span className="ml-1 text-[10px] uppercase tracking-wider">warn</span>}
                  </td>
                  <td className="px-4 py-2.5 text-right text-xs text-[var(--ink-muted)] font-mono">{s.last_run}</td>
                  <td className="px-4 py-2.5 text-xs text-[var(--ink)] leading-snug max-w-md">{s.why}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-0 divide-y md:divide-y-0 md:divide-x divide-[var(--hairline-soft,#e8e4d8)] border-t border-[var(--hairline-soft,#e8e4d8)]">
        <div className="p-5">
          <div className="text-[10px] uppercase tracking-[0.16em] text-[var(--ink-soft)] font-semibold mb-3">Sample expectation suite · sec.holdings_13f.completeness</div>
          <pre className="font-mono text-[11.5px] leading-relaxed overflow-x-auto rounded-sm p-3" style={{ background: '#0b2545', color: '#e6e9f0' }}><code>{`# sec_holdings_13f_completeness.yml
expectation_suite_name: sec.holdings_13f.completeness
data_asset_name: bronze.sec__holdings_13f

expectations:
  - expect_column_values_to_not_be_null:
      column: cik
  - expect_column_value_lengths_to_equal:
      column: cik
      value: 10
  - expect_column_values_to_be_between:
      column: value_usd
      min_value: 0
  - expect_column_values_to_be_between:
      column: shares
      min_value: 0
  - expect_column_values_to_match_regex:
      column: filing_quarter
      regex: '^[0-9]{4}Q[1-4]$'
  - expect_table_row_count_to_be_between:
      min_value: 4500000
      max_value: 5200000`}</code></pre>
        </div>
        <div className="p-5">
          <div className="text-[10px] uppercase tracking-[0.16em] text-[var(--ink-soft)] font-semibold mb-3">How this fits the stack</div>
          <ul className="space-y-2.5 text-sm">
            <Policy label="Fivetran moves" value="SEC EDGAR + FRED + CFPB + S&P Cap IQ streams into Bronze (Iceberg)" />
            <Policy label="Great Expectations validates" value="Bronze landings against suites before Silver promotion" />
            <Policy label="dbt transforms" value="Silver holdings spine + Gold marts; dbt tests assert SQL-level constraints" />
            <Policy label="Failed rows" value="route to dlq.gx_quarantine on the same lake; retried after suite update" />
            <Policy label="Open source" value="GX Core remains community-driven; Fivetran funds maintenance, ecosystem, and engineering investment" />
          </ul>
          <div className="mt-4 pt-3 border-t border-[var(--hairline-soft,#e8e4d8)] text-[11px] text-[var(--ink-soft)] leading-relaxed">
            On May 13, 2026 Fivetran announced it is becoming steward of the Great Expectations open
            source community and the GX Core project, supporting ongoing maintenance, ecosystem
            integrations, and community engagement. Same open project, backed by sustained engineering.
          </div>
        </div>
      </div>
    </section>
  );
}

// =============================================================================
// BeforeAfterPanel
// =============================================================================
function BeforeAfterPanel() {
  return (
    <section className="grid grid-cols-1 md:grid-cols-2 gap-5">
      <div className="research-card p-6 border-l-4" style={{ ...cardStyle, borderLeftColor: '#b91c1c' }}>
        <div className="eyebrow" style={{ color: '#b91c1c' }}>Before · Modern Data Stack</div>
        <h3 className="mt-1 font-serif text-xl font-semibold text-[var(--ink-strong)]">14 hops · 3 copies of the bytes</h3>
        <pre className="font-mono text-[10.5px] leading-relaxed mt-4 p-3 rounded-sm overflow-x-auto" style={{ background: '#fef2f2', color: '#7f1d1d', border: '1px solid #fecaca' }}>{`SEC EDGAR → SFTP → Stitch → Snowflake (raw)
       → dbt → Snowflake (silver) → Snowflake (gold)
       → Reverse-ETL → Hightouch → AI vector store
       → Tableau materialised view → PM extract → analyst laptop`}</pre>
        <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
          <div><div className="text-[var(--ink-soft)] text-xs">Copies of the data</div><div className="font-serif text-2xl font-semibold text-[var(--ink-strong)]">3</div></div>
          <div><div className="text-[var(--ink-soft)] text-xs">Avg end-to-end latency</div><div className="font-serif text-2xl font-semibold text-[var(--ink-strong)]">11 hr</div></div>
          <div><div className="text-[var(--ink-soft)] text-xs">Daily run-rate</div><div className="font-serif text-2xl font-semibold text-[var(--ink-strong)]">$19.80</div></div>
          <div><div className="text-[var(--ink-soft)] text-xs">Schema change</div><div className="font-serif text-lg font-semibold text-[var(--ink-strong)]">8-min lock</div></div>
        </div>
      </div>
      <div className="research-card p-6 border-l-4" style={{ ...cardStyle, borderLeftColor: '#b8975c' }}>
        <div className="eyebrow" style={{ color: '#b8975c' }}>After · Open Data Infrastructure</div>
        <h3 className="mt-1 font-serif text-xl font-semibold text-[var(--ink-strong)]">5 hops · 1 copy of the bytes</h3>
        <pre className="font-mono text-[10.5px] leading-relaxed mt-4 p-3 rounded-sm overflow-x-auto" style={{ background: '#f0fdf4', color: '#064e3b', border: '1px solid #a7f3d0' }}>{`SEC · FRED · CFPB · CIQ → Fivetran CDC → Iceberg bronze
       → dbt → Iceberg silver
       → dbt → Iceberg gold
       ↳ Snowflake · Athena · DuckDB · Trino · Spark
         (all reading the same bytes, no copies)`}</pre>
        <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
          <div><div className="text-[var(--ink-soft)] text-xs">Copies of the data</div><div className="font-serif text-2xl font-semibold" style={{ color: '#b8975c' }}>1</div></div>
          <div><div className="text-[var(--ink-soft)] text-xs">Avg end-to-end latency</div><div className="font-serif text-2xl font-semibold" style={{ color: '#b8975c' }}>22 min</div></div>
          <div><div className="text-[var(--ink-soft)] text-xs">Daily run-rate</div><div className="font-serif text-2xl font-semibold" style={{ color: '#b8975c' }}>$6.46</div></div>
          <div><div className="text-[var(--ink-soft)] text-xs">Schema change</div><div className="font-serif text-lg font-semibold" style={{ color: '#b8975c' }}>milliseconds</div></div>
        </div>
      </div>
    </section>
  );
}

// =============================================================================
// LineagePanel — pick any gold model, see its upstream silver + bronze.
// =============================================================================
type LineageEdge = { from: string; to: string; tests?: string[] };

const LINEAGE_MAP: Record<string, { silver: string[]; bronze: string[]; edges: LineageEdge[]; story: string }> = {
  'gold.fct_regional_bank_macro_attribution_daily': {
    silver: ['silver.int_macro_aligned', 'silver.int_holdings_spine', 'silver.int_sector_regimes'],
    bronze: ['bronze.fred__macro_series', 'bronze.sec__holdings_13f', 'bronze.sp_ciq__company_ref'],
    story:  'Daily attribution of regional-bank holding returns to macro factors (yield curve, fed funds, CPI). Used by the credit desk and the risk committee.',
    edges: [
      { from: 'bronze.fred__macro_series',     to: 'silver.int_macro_aligned',     tests: ['not-null series_id'] },
      { from: 'bronze.sec__holdings_13f',      to: 'silver.int_holdings_spine',    tests: ['unique filing_id'] },
      { from: 'bronze.sp_ciq__company_ref',    to: 'silver.int_sector_regimes' },
      { from: 'silver.int_macro_aligned',      to: 'gold.fct_regional_bank_macro_attribution_daily' },
      { from: 'silver.int_holdings_spine',     to: 'gold.fct_regional_bank_macro_attribution_daily' },
      { from: 'silver.int_sector_regimes',     to: 'gold.fct_regional_bank_macro_attribution_daily' },
    ],
  },
  'gold.fct_complaint_sentiment_vs_price': {
    silver: ['silver.int_complaint_topics', 'silver.int_holdings_spine'],
    bronze: ['bronze.cfpb__complaints', 'bronze.sp_ciq__intraday_quotes', 'bronze.sp_ciq__company_ref'],
    story:  'CFPB complaint sentiment joined to intraday price moves. Edge signal for consumer-finance shorts and credit-quality reviews.',
    edges: [
      { from: 'bronze.cfpb__complaints',        to: 'silver.int_complaint_topics', tests: ['PII · masked'] },
      { from: 'bronze.sp_ciq__intraday_quotes', to: 'silver.int_holdings_spine',   tests: ['streaming · 18s p99'] },
      { from: 'bronze.sp_ciq__company_ref',     to: 'silver.int_holdings_spine' },
      { from: 'silver.int_complaint_topics',    to: 'gold.fct_complaint_sentiment_vs_price' },
      { from: 'silver.int_holdings_spine',      to: 'gold.fct_complaint_sentiment_vs_price' },
    ],
  },
  'gold.fct_13f_position_changes': {
    silver: ['silver.int_holdings_spine', 'silver.int_position_changes'],
    bronze: ['bronze.sec__holdings_13f', 'bronze.sec__filings_index'],
    story:  '13F quarterly position deltas across the institutional universe. Drives the "smart-money" watchlist and the activist-tracking dashboard.',
    edges: [
      { from: 'bronze.sec__holdings_13f',  to: 'silver.int_holdings_spine' },
      { from: 'bronze.sec__filings_index', to: 'silver.int_position_changes' },
      { from: 'silver.int_holdings_spine', to: 'gold.fct_13f_position_changes' },
      { from: 'silver.int_position_changes', to: 'gold.fct_13f_position_changes' },
    ],
  },
  'gold.fct_sector_divergence': {
    silver: ['silver.int_sector_regimes', 'silver.int_macro_aligned'],
    bronze: ['bronze.sp_ciq__company_ref', 'bronze.fred__macro_series'],
    story:  'Sector-level divergence from the macro regime. Drives pair-trade ideas and the rotation dashboard.',
    edges: [
      { from: 'bronze.sp_ciq__company_ref', to: 'silver.int_sector_regimes' },
      { from: 'bronze.fred__macro_series',  to: 'silver.int_macro_aligned' },
      { from: 'silver.int_sector_regimes',  to: 'gold.fct_sector_divergence' },
      { from: 'silver.int_macro_aligned',   to: 'gold.fct_sector_divergence' },
    ],
  },
};

function LineagePanel() {
  const goldOptions = Object.keys(LINEAGE_MAP);
  const [selected, setSelected] = useState<string>(goldOptions[0]);
  const lin = LINEAGE_MAP[selected];

  const BX = 20, MX = 320, RX = 620;
  const COL_W = 280;
  const ROW_H = 38, ROW_GAP = 8;
  const maxRows = Math.max(lin.bronze.length, lin.silver.length, 1);
  const HEIGHT = Math.max(maxRows * (ROW_H + ROW_GAP) + 40, 240);

  const bronzeY = (i: number) => 30 + i * (ROW_H + ROW_GAP);
  const silverY = (i: number) => 30 + i * (ROW_H + ROW_GAP);
  const goldY = (HEIGHT - ROW_H) / 2;

  const nodeOf = (name: string): { x: number; y: number; w: number; h: number } | null => {
    const bi = lin.bronze.indexOf(name);
    if (bi >= 0) return { x: BX, y: bronzeY(bi), w: COL_W, h: ROW_H };
    const si = lin.silver.indexOf(name);
    if (si >= 0) return { x: MX, y: silverY(si), w: COL_W, h: ROW_H };
    if (name === selected) return { x: RX, y: goldY, w: COL_W, h: ROW_H };
    return null;
  };

  return (
    <section className="mb-8 research-card overflow-hidden" style={cardStyle}>
      <header className="research-card-header" style={cardHeaderStyle}>
        <div className="flex items-baseline justify-between gap-4 flex-wrap">
          <div>
            <div className="eyebrow" style={{ color: '#FF694A' }}>dbt · Column-level lineage</div>
            <h2 className="font-serif text-xl font-semibold text-[var(--ink-strong)] mt-0.5">
              Pick any gold model. See exactly where its bytes come from.
            </h2>
            <p className="text-sm text-[var(--ink-muted)] mt-1 max-w-3xl">
              dbt emits lineage as a side-effect of build. Every join, every transformation, every test
              is documented automatically. Click a gold model below to trace upstream &mdash; bronze
              landings to silver intermediates to the gold mart.
            </p>
          </div>
          <div className="inline-flex items-center gap-1.5 rounded-sm px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-wider text-white shrink-0" style={{ background: '#FF694A' }}>
            dbt Labs
          </div>
        </div>
      </header>

      <div className="px-5 pt-4 flex flex-wrap gap-2">
        {goldOptions.map((g) => (
          <button
            key={g}
            onClick={() => setSelected(g)}
            className="px-3 py-2 rounded-sm text-[11.5px] font-mono border transition-all"
            style={
              selected === g
                ? { background: '#b8975c', borderColor: '#b8975c', color: '#fff' }
                : { background: '#fff', borderColor: 'var(--hairline)', color: 'var(--ink-muted)' }
            }
          >
            {g}
          </button>
        ))}
      </div>

      <div className="p-5">
        <p className="text-sm text-[var(--ink)] mb-4 italic">{lin.story}</p>

        <div className="overflow-x-auto">
          <svg viewBox={`0 0 ${RX + COL_W + 20} ${HEIGHT}`} className="w-full" style={{ minWidth: 880, maxHeight: 360 }}>
            <defs>
              <marker id="lin-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                <path d="M0 0 L10 5 L0 10 z" fill="#FF694A" />
              </marker>
              <filter id="lineage-glow" x="-50%" y="-50%" width="200%" height="200%">
                <feGaussianBlur stdDeviation="3" result="blur" />
                <feMerge>
                  <feMergeNode in="blur" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
            </defs>

            <text x={BX}        y={18} fontSize="10" fontWeight="700" fill="#826b3f" letterSpacing="1.6">BRONZE · raw</text>
            <text x={MX}        y={18} fontSize="10" fontWeight="700" fill="#374151" letterSpacing="1.6">SILVER · conformed</text>
            <text x={RX}        y={18} fontSize="10" fontWeight="700" fill="#7a5e2d" letterSpacing="1.6">GOLD · selected</text>

            {lin.edges.map((e, i) => {
              const a = nodeOf(e.from);
              const b = nodeOf(e.to);
              if (!a || !b) return null;
              const x1 = a.x + a.w, y1 = a.y + a.h / 2;
              const x2 = b.x,         y2 = b.y + b.h / 2;
              const mid = (x1 + x2) / 2;
              const d = `M ${x1} ${y1} C ${mid} ${y1}, ${mid} ${y2}, ${x2} ${y2}`;
              return (
                <g key={i}>
                  <path d={d} fill="none" stroke="#FF694A" strokeWidth="1.6" strokeLinecap="round" markerEnd="url(#lin-arrow)" opacity="0.75" />
                  <circle r="2.5" fill="#FF694A">
                    <animateMotion dur={`${2.0 + i * 0.18}s`} repeatCount="indefinite" path={d} />
                    <animate attributeName="opacity" values="0;1;1;0" dur={`${2.0 + i * 0.18}s`} repeatCount="indefinite" />
                  </circle>
                  {e.tests && (
                    <g transform={`translate(${mid - 38}, ${(y1 + y2) / 2 - 8})`}>
                      <rect width="76" height="14" rx="3" fill="#FF694A" />
                      <text x="38" y="10" textAnchor="middle" fontSize="8.5" fontWeight="800" fill="#fff" letterSpacing="0.4">
                        {e.tests[0]}
                      </text>
                    </g>
                  )}
                </g>
              );
            })}

            {lin.bronze.map((t, i) => (
              <g key={t} transform={`translate(${BX}, ${bronzeY(i)})`}>
                <rect width={COL_W} height={ROW_H} rx="4" fill="#fef3c7" stroke="#b45309" strokeWidth="1" />
                <text x="12" y="14" fontSize="9" fontWeight="800" fill="#826b3f" letterSpacing="1.4">BRONZE</text>
                <text x="12" y="28" fontSize="11" fontWeight="700" fill="#0b1220" fontFamily="ui-monospace, monospace">{t}</text>
              </g>
            ))}

            {lin.silver.map((t, i) => (
              <g key={t} transform={`translate(${MX}, ${silverY(i)})`}>
                <rect width={COL_W} height={ROW_H} rx="4" fill="#f3f4f6" stroke="#6b7280" strokeWidth="1" />
                <text x="12" y="14" fontSize="9" fontWeight="800" fill="#374151" letterSpacing="1.4">SILVER</text>
                <text x="12" y="28" fontSize="11" fontWeight="700" fill="#0b1220" fontFamily="ui-monospace, monospace">{t}</text>
              </g>
            ))}

            <g transform={`translate(${RX}, ${goldY})`}>
              <rect width={COL_W} height={ROW_H} rx="4" fill="#faf3e1" stroke="#b8975c" strokeWidth="2" filter="url(#lineage-glow)" />
              <text x="12" y="14" fontSize="9" fontWeight="800" fill="#7a5e2d" letterSpacing="1.4">GOLD</text>
              <text x="12" y="28" fontSize="11" fontWeight="700" fill="#0b1220" fontFamily="ui-monospace, monospace">{selected}</text>
            </g>
          </svg>
        </div>

        <div className="mt-4 flex items-center gap-4 text-[11px] text-[var(--ink-soft)] flex-wrap">
          <span className="inline-flex items-center gap-1.5"><span className="inline-block w-3 h-0.5" style={{ background: '#FF694A' }} /> dbt transformation (auto-emitted)</span>
          <span>•</span>
          <span><strong className="text-[var(--ink-strong)]">{lin.edges.length}</strong> column-level edges traced</span>
          <span>•</span>
          <span><strong className="text-[var(--ink-strong)]">{lin.bronze.length + lin.silver.length + 1}</strong> dbt models in the lineage graph</span>
          <span>•</span>
          <span>Lineage runs at every build · zero manual upkeep</span>
        </div>
      </div>
    </section>
  );
}
