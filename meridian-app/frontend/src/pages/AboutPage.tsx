export default function AboutPage() {
  return (
    <div className="mx-auto max-w-4xl px-4 py-12 sm:px-6 lg:px-8">
      <header className="mb-8">
        <div className="eyebrow mb-1">ODI Reference Architecture</div>
        <h1 className="font-serif text-3xl font-semibold tracking-tight text-[var(--ink-strong)]">About Meridian Capital</h1>
        <p className="mt-3 text-[var(--ink-muted)] leading-relaxed">
          Meridian Capital is a reference build that demonstrates how a buy-side research desk can be
          powered entirely by Fivetran's Open Data Infrastructure — Fivetran custom connectors landing
          public-domain finance data directly into a customer-owned Apache Iceberg lake on S3, with dbt
          building the analytics layer and AWS Athena serving the query workload.
        </p>
      </header>

      <section className="mt-10">
        <h2 className="font-serif text-2xl font-semibold text-[var(--ink-strong)] border-b border-[var(--hairline)] pb-2 mb-4">What this demo shows</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {PILLARS.map((p) => (
            <div key={p.title} className="research-card p-5">
              <div className="layer-chip gold inline-flex mb-3">{p.tag}</div>
              <h3 className="font-serif text-lg font-semibold text-[var(--ink-strong)]">{p.title}</h3>
              <p className="mt-1 text-sm text-[var(--ink-muted)] leading-relaxed">{p.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mt-10">
        <h2 className="font-serif text-2xl font-semibold text-[var(--ink-strong)] border-b border-[var(--hairline)] pb-2 mb-4">Tech stack</h2>
        <div className="research-card p-5">
          <ul className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3 text-sm">
            {STACK.map((s) => (
              <li key={s.name} className="flex items-start gap-3">
                <div className="layer-chip silver shrink-0 mt-0.5">{s.layer}</div>
                <div className="min-w-0">
                  <div className="font-serif font-semibold text-[var(--ink-strong)]">{s.name}</div>
                  <div className="text-xs text-[var(--ink-muted)]">{s.note}</div>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="mt-10">
        <h2 className="font-serif text-2xl font-semibold text-[var(--ink-strong)] border-b border-[var(--hairline)] pb-2 mb-4">Data sources</h2>
        <div className="space-y-3">
          {DATA_SOURCES.map((s) => (
            <article key={s.title} className="research-card p-5">
              <div className="flex items-start gap-3">
                <span className="layer-chip bronze shrink-0">Source</span>
                <div className="min-w-0">
                  <h3 className="font-serif text-lg font-semibold text-[var(--ink-strong)]">{s.title}</h3>
                  <p className="mt-1 text-sm text-[var(--ink-muted)] leading-relaxed">{s.description}</p>
                  <div className="mt-2 text-xs text-[var(--ink-soft)]">
                    <span className="font-semibold uppercase tracking-wider text-[10px]">Provides:</span> {s.provides}
                  </div>
                </div>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="mt-10">
        <h2 className="font-serif text-2xl font-semibold text-[var(--ink-strong)] border-b border-[var(--hairline)] pb-2 mb-4">ODI vs MDS</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="research-card p-5">
            <div className="eyebrow mb-2">Traditional MDS</div>
            <h3 className="font-serif text-lg font-semibold text-[var(--ink-strong)]">Warehouse-centric</h3>
            <ul className="mt-3 space-y-2 text-sm text-[var(--ink-muted)]">
              <li>• Single proprietary warehouse owns storage <em>and</em> compute</li>
              <li>• Data exits via expensive egress / replication</li>
              <li>• Compute engine choice locked to vendor roadmap</li>
              <li>• Customer pays for storage twice (lake + warehouse)</li>
              <li>• Schema evolution is vendor-managed</li>
            </ul>
          </div>
          <div className="research-card p-5" style={{ borderColor: 'var(--gold)' }}>
            <div className="eyebrow mb-2" style={{ color: 'var(--gold-dim)' }}>Open Data Infrastructure</div>
            <h3 className="font-serif text-lg font-semibold text-[var(--ink-strong)]">Open lake-centric</h3>
            <ul className="mt-3 space-y-2 text-sm text-[var(--ink)]">
              <li>• Customer owns the storage layer (S3 + Iceberg)</li>
              <li>• Any compute engine — Athena, Trino, Snowflake, Spark, DuckDB</li>
              <li>• Catalog is open (Glue / Nessie / Polaris)</li>
              <li>• Pay once for storage; swap compute as workloads evolve</li>
              <li>• Schema evolution is in the Iceberg spec, vendor-neutral</li>
            </ul>
          </div>
        </div>
      </section>

      <section className="mt-10 rounded-sm bg-[var(--paper-deep)] border border-[var(--hairline)] p-5 text-sm text-[var(--ink)]">
        <div className="eyebrow mb-2" style={{ color: 'var(--caution)' }}>Disclaimer</div>
        <p className="text-[var(--ink-muted)] leading-relaxed">
          <strong className="text-[var(--ink-strong)]">All data shown is synthetic or sampled from public sources</strong>{' '}
          (SEC EDGAR, FRED, CFPB) and aggregated for demonstration purposes. Meridian Capital is a fictional
          asset manager. No portion of this site constitutes investment advice or a recommendation.
        </p>
      </section>
    </div>
  );
}

const PILLARS = [
  {
    tag: 'Pillar 1',
    title: 'Customer-owned storage',
    body: 'All ingested data lands in the customer\'s S3 bucket as Apache Iceberg tables. Fivetran writes; the customer reads with any engine.',
  },
  {
    tag: 'Pillar 2',
    title: 'Open table format',
    body: 'Iceberg v2 provides ACID transactions, schema evolution, time-travel queries, and partition evolution — no vendor lock-in on table layout.',
  },
  {
    tag: 'Pillar 3',
    title: 'Any compute engine',
    body: 'Athena queries the same files dbt writes. Add Snowflake, Trino, or DuckDB without re-ingesting a single row. Compute is a pluggable layer.',
  },
];

const STACK = [
  { layer: 'Ingest',     name: 'Fivetran custom connectors', note: 'SEC EDGAR · FRED · CFPB · built with the Connector SDK.' },
  { layer: 'Storage',    name: 'Amazon S3',                  note: 'meridian-odi-lake bucket holds bronze · silver · gold prefixes.' },
  { layer: 'Format',     name: 'Apache Iceberg v2',          note: 'Parquet files, ZSTD-compressed, Glue catalog.' },
  { layer: 'Catalog',    name: 'AWS Glue Data Catalog',      note: 'Iceberg REST + table-level access control.' },
  { layer: 'Transform',  name: 'dbt-athena',                 note: 'Iceberg-native materializations · 18 tested models.' },
  { layer: 'Query',      name: 'AWS Athena',                 note: 'Engine v3 (Trino) — serverless, Iceberg-aware.' },
  { layer: 'Frontend',   name: 'React 19 + Vite + Tailwind v4', note: 'Static SPA on GitHub Pages, reads JSON snapshot.' },
  { layer: 'Charts',     name: 'Recharts',                   note: 'Composable charts for macro time-series + complaints.' },
];

const DATA_SOURCES = [
  {
    title: 'SEC EDGAR',
    description: 'The U.S. Securities and Exchange Commission\'s public filing system. We pull company facts, 10-K / 10-Q / 8-K filings, and basic financials for every public issuer in scope.',
    provides: 'Company master · filings stream · revenue / net income / total assets',
  },
  {
    title: 'FRED — Federal Reserve Economic Data',
    description: 'The St. Louis Fed\'s open macro database. We track rates (DGS10, FEDFUNDS, T10Y2Y), inflation (CPIAUCSL), employment, growth, and sector indices.',
    provides: 'Macro time-series · YoY change · category tagging',
  },
  {
    title: 'CFPB Consumer Complaint Database',
    description: 'The Consumer Financial Protection Bureau\'s public complaint stream. We normalize the company field to CIK to attribute complaints to public issuers.',
    provides: 'Complaint stream · product / issue cluster · timely-response rate',
  },
];
