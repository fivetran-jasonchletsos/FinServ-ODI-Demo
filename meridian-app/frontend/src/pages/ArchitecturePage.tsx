import { useEffect, useState } from 'react';
import { api, formatBytes, formatNumber } from '../api/queries';
import type { IcebergTable, QueryEngine } from '../types';

const ENGINES: QueryEngine[] = [
  {
    name: 'Athena',
    status: 'active',
    description: 'Primary serverless engine for ad-hoc + dbt-driven transforms. Pay per query. No infrastructure to manage.',
    sample_query: `SELECT cik, ticker, risk_score
FROM gold.fct_company_risk_signal
WHERE risk_bucket IN ('elevated','high')
ORDER BY risk_score DESC
LIMIT 25;`,
  },
  {
    name: 'DuckDB',
    status: 'available',
    description: 'Engineer\'s laptop. Same Iceberg tables, queried directly from S3 with the iceberg extension.',
    sample_query: `INSTALL iceberg;
LOAD iceberg;

SELECT *
FROM iceberg_scan('s3://meridian-finserv-odi-lake/gold/fct_complaints/')
WHERE topic_cluster = 'credit-reporting-errors'
LIMIT 100;`,
  },
  {
    name: 'Trino',
    status: 'available',
    description: 'Federated query engine. Useful for joining the lake to other relational sources without copying data.',
    sample_query: `SELECT c.ticker, AVG(o.value) AS yield_avg
FROM gold.fct_company_risk_signal c
JOIN gold.fct_macro_observations o
  ON o.series_id = 'DGS10'
WHERE c.sector = 'Financials'
GROUP BY c.ticker;`,
  },
  {
    name: 'Spark',
    status: 'available',
    description: 'Distributed compute for ML training and large-scale joins. Reads the same Iceberg tables via the spark-iceberg runtime.',
    sample_query: `df = spark.read.format("iceberg")\\
  .load("gold.fct_complaints")
df.groupBy("topic_cluster").count().show()`,
  },
  {
    name: 'Snowflake',
    status: 'demo',
    description: 'External tables can point at the same Iceberg lake — useful if a stakeholder team is Snowflake-resident. Not the primary engine here.',
    sample_query: `CREATE EXTERNAL TABLE gold_complaints
LOCATION = '@meridian_lake/gold/fct_complaints/'
FILE_FORMAT = (TYPE = PARQUET)
AUTO_REFRESH = TRUE;`,
  },
];

const ENGINE_COLORS: Record<QueryEngine['name'], string> = {
  Athena: '#b8975c',
  DuckDB: '#0b2545',
  Trino: '#1d4e89',
  Spark: '#b45309',
  Snowflake: '#0f766e',
};

export default function ArchitecturePage() {
  const [tables, setTables] = useState<IcebergTable[]>([]);
  const [activeEngine, setActiveEngine] = useState<QueryEngine>(ENGINES[0]);
  const [hoveredLayer, setHoveredLayer] = useState<'bronze' | 'silver' | 'gold' | null>(null);

  useEffect(() => {
    api.getIcebergTables().then(setTables).catch(() => {});
  }, []);

  const byLayer = (l: 'bronze' | 'silver' | 'gold') => tables.filter((t) => t.database === l);
  const layerStats = (l: 'bronze' | 'silver' | 'gold') => {
    const t = byLayer(l);
    return { tables: t.length, rows: t.reduce((s, r) => s + r.rows, 0), bytes: t.reduce((s, r) => s + r.bytes, 0) };
  };

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
      <header className="mb-8 border-b border-[var(--hairline)] pb-6">
        <div className="eyebrow mb-1">Open Data Infrastructure</div>
        <h1 className="font-serif text-3xl sm:text-4xl font-semibold tracking-tight text-[var(--ink-strong)]">
          One lake. Every engine. Full control.
        </h1>
        <p className="mt-3 text-[var(--ink-muted)] max-w-3xl leading-relaxed">
          Meridian's data plane treats <em>storage</em>, <em>catalog</em>, and <em>compute</em> as
          three independently swappable layers. Iceberg is the storage spec. Glue is the catalog.
          Athena, DuckDB, Trino, Spark, and even Snowflake can all read the same tables — no copy,
          no extract, no proprietary format in the way.
        </p>
      </header>

      {/* The diagram */}
      <section className="research-card p-6 sm:p-8 mb-8">
        <div className="eyebrow mb-1">Data Flow</div>
        <h2 className="font-serif text-2xl font-semibold text-[var(--ink-strong)] mb-6">
          From three public APIs to one governed surface
        </h2>

        <ArchitectureDiagram
          onLayerHover={setHoveredLayer}
          hoveredLayer={hoveredLayer}
          layerStats={layerStats}
        />

        <div className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-4 text-xs text-[var(--ink-muted)]">
          <LayerDetail layer="bronze" stats={layerStats('bronze')} desc="Raw rows landed by the Fivetran custom connectors. 1:1 with source." />
          <LayerDetail layer="silver" stats={layerStats('silver')} desc="Conformed dims and facts. Cleaned, deduped, joined to a date spine." />
          <LayerDetail layer="gold" stats={layerStats('gold')} desc="Business-ready marts + the dbt semantic layer. What the frontend and AI read." />
        </div>
      </section>

      {/* Multi-engine showcase */}
      <section className="research-card overflow-hidden mb-8">
        <header className="research-card-header">
          <div className="eyebrow">Compute is a Choice</div>
          <h2 className="font-serif text-xl font-semibold text-[var(--ink-strong)] mt-0.5">
            Same Iceberg tables. Five engines. One query at a time.
          </h2>
          <p className="text-sm text-[var(--ink-muted)] mt-1">
            Pick a query engine — the SQL changes barely, but the operational, cost, and
            governance profile shifts dramatically. That choice belongs to the team, not the vendor.
          </p>
        </header>

        <div className="px-5 pt-4 flex flex-wrap gap-2">
          {ENGINES.map((e) => (
            <button
              key={e.name}
              onClick={() => setActiveEngine(e)}
              className={`px-3 py-2 rounded-sm text-xs font-semibold uppercase tracking-wider border transition-all ${
                activeEngine.name === e.name
                  ? 'bg-[var(--navy-deep)] text-white border-[var(--navy-deep)]'
                  : 'bg-white text-[var(--ink-muted)] border-[var(--hairline)] hover:border-[var(--gold)] hover:text-[var(--ink-strong)]'
              }`}
              style={activeEngine.name === e.name ? { background: ENGINE_COLORS[e.name], borderColor: ENGINE_COLORS[e.name] } : undefined}
            >
              {e.name}
              {e.status === 'active' && <span className="ml-1.5 text-[9px] opacity-80">● ACTIVE</span>}
              {e.status === 'demo' && <span className="ml-1.5 text-[9px] opacity-60">DEMO</span>}
            </button>
          ))}
        </div>

        <div className="p-5 grid grid-cols-1 md:grid-cols-3 gap-5">
          <div className="md:col-span-2">
            <div className="text-[10px] uppercase tracking-wider text-[var(--ink-soft)] font-semibold mb-2">Query</div>
            <pre className="bg-[var(--navy-deep)] text-[var(--paper)] rounded-sm p-4 text-[11.5px] leading-relaxed overflow-x-auto font-mono">
              <code>{activeEngine.sample_query}</code>
            </pre>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wider text-[var(--ink-soft)] font-semibold mb-2">Why this engine</div>
            <p className="text-sm text-[var(--ink)] leading-relaxed">{activeEngine.description}</p>
            <div className="mt-4 pt-4 border-t border-[var(--hairline-soft)]">
              <div className="text-[10px] uppercase tracking-wider text-[var(--ink-soft)] font-semibold mb-1">Status</div>
              <div className={`text-sm font-semibold ${
                activeEngine.status === 'active' ? 'text-[var(--bull)]' :
                activeEngine.status === 'demo' ? 'text-[var(--ink-soft)]' :
                'text-[var(--gold-dim)]'
              }`}>
                {activeEngine.status === 'active' ? '● Primary engine — powers this site' :
                 activeEngine.status === 'demo' ? 'Compatible but not configured' :
                 'Compatible and ready to wire in'}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Open table inventory */}
      <section className="research-card overflow-hidden">
        <header className="research-card-header">
          <div className="eyebrow">Iceberg Catalog</div>
          <h2 className="font-serif text-xl font-semibold text-[var(--ink-strong)] mt-0.5">
            Every table on the lake, registered in AWS Glue
          </h2>
          <p className="text-sm text-[var(--ink-muted)] mt-1">
            Open metadata. Every engine reads the same schema, the same partition layout, the same
            row counts — without anyone owning the "source of truth" exclusively.
          </p>
        </header>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm tabular">
            <thead className="bg-[var(--paper-deep)] border-b border-[var(--hairline)]">
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
            <tbody className="divide-y divide-[var(--hairline-soft)]">
              {tables.length === 0
                ? Array.from({ length: 4 }).map((_, i) => (
                    <tr key={i}>
                      {Array.from({ length: 8 }).map((_, j) => (
                        <td key={j} className="px-4 py-3"><div className="h-3 bg-[var(--paper-deep)] rounded animate-pulse" /></td>
                      ))}
                    </tr>
                  ))
                : tables.map((t) => (
                    <tr key={`${t.database}.${t.table}`} className="hover:bg-[var(--paper-deep)] cursor-default">
                      <td className="px-4 py-2.5"><span className={`layer-chip ${t.database}`}>{t.database}</span></td>
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

      {/* Data Quality — powered by dbt Labs */}
      <section className="research-card overflow-hidden mt-8">
        <header className="research-card-header flex items-start justify-between gap-4">
          <div>
            <div className="eyebrow" style={{ color: '#FF694A' }}>Data Quality · dbt Labs</div>
            <h2 className="font-serif text-xl font-semibold text-[var(--ink-strong)] mt-0.5">
              Every filing tested. Every macro release. Same lake.
            </h2>
            <p className="text-sm text-[var(--ink-muted)] mt-1">
              Tests defined in dbt Labs run on every build, against the same Iceberg tables every
              analyst and AI agent reads. Failures block promotion to the next layer — bad data
              never reaches the watchlist.
            </p>
          </div>
          <div className="inline-flex items-center gap-1.5 rounded-sm px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-wider text-white shrink-0" style={{ background: '#FF694A' }}>
            dbt Labs
          </div>
        </header>
        <div className="grid grid-cols-1 md:grid-cols-3 divide-y md:divide-y-0 md:divide-x divide-[var(--hairline-soft)]">
          {[
            { layer: 'bronze', tests: 22, passing: 22, monitors: ['freshness · SEC 8-K window', 'volume · CFPB daily intake', 'schema drift · XBRL taxonomy'], color: '#b45309' },
            { layer: 'silver', tests: 54, passing: 53, monitors: ['nulls · CIK joins', 'uniqueness · filing_id', 'referential · ticker→CIK', 'accepted values · FRED series_id'], color: '#6b7280' },
            { layer: 'gold',   tests: 29, passing: 29, monitors: ['business rules · macro regimes', 'complaint volume reconciliation', 'sum-to-source · holdings'], color: '#b8975c' },
          ].map((q) => {
            const ok = q.passing === q.tests;
            return (
              <div key={q.layer} className="p-5">
                <div className="flex items-center justify-between">
                  <span className={`layer-chip ${q.layer}`}>{q.layer}</span>
                  <span className={`text-[10px] font-bold uppercase tracking-wider ${ok ? 'text-[var(--bull)]' : 'text-[var(--bear)]'}`}>
                    {ok ? '● all passing' : `● ${q.tests - q.passing} failing`}
                  </span>
                </div>
                <div className="mt-3 flex items-baseline gap-2">
                  <div className="font-serif text-3xl font-semibold text-[var(--ink-strong)] tabular">{q.passing}<span className="text-[var(--ink-soft)]">/{q.tests}</span></div>
                  <div className="text-xs text-[var(--ink-muted)]">tests · last run 8m ago</div>
                </div>
                <ul className="mt-3 space-y-1.5 text-xs text-[var(--ink-muted)]">
                  {q.monitors.map((m) => (
                    <li key={m} className="flex items-center gap-2">
                      <span className="h-1.5 w-1.5 rounded-full" style={{ background: q.color }} />
                      {m}
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
        <div className="px-5 py-3 border-t border-[var(--hairline-soft)] flex items-center justify-between text-[11px] text-[var(--ink-soft)] bg-[var(--paper-deep)]">
          <span className="font-mono">105 tests · 104 passing · 1 warn · 0 errors</span>
          <span className="uppercase tracking-wider font-semibold">dbt build · merged into Fivetran</span>
        </div>
      </section>

      {/* Lineage — source to consumer */}
      <section className="research-card overflow-hidden mt-8">
        <header className="research-card-header">
          <div className="eyebrow" style={{ color: '#FF694A' }}>Lineage · dbt Labs</div>
          <h2 className="font-serif text-xl font-semibold text-[var(--ink-strong)] mt-0.5">
            Filing to thesis. Audited at every hop.
          </h2>
          <p className="text-sm text-[var(--ink-muted)] mt-1">
            Column-level lineage from SEC EDGAR, FRED, and CFPB through every dbt transformation,
            into every downstream consumer — research notebooks, AI agents, regulatory artifacts.
            PII markers on every edge that touches complainant identifiers.
          </p>
        </header>
        <div className="p-5 overflow-x-auto">
          <svg viewBox="0 0 980 220" className="w-full" style={{ minWidth: 820 }}>
            <defs>
              <marker id="lineageArrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                <path d="M0 0 L10 5 L0 10 z" fill="#6b7280" />
              </marker>
              <marker id="piiArrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                <path d="M0 0 L10 5 L0 10 z" fill="#b45309" />
              </marker>
            </defs>

            {/* Sources */}
            {[
              { x: 10, y: 30,  label: 'SEC EDGAR · filings', pii: false },
              { x: 10, y: 110, label: 'CFPB · complaints', pii: true },
            ].map((s, i) => (
              <g key={i}>
                <rect x={s.x} y={s.y} width="180" height="56" rx="4" fill="#ffffff" stroke="#d9d3c4" />
                <text x={s.x + 12} y={s.y + 18} fontSize="9" fontWeight="800" fill="#826b3f" letterSpacing="1.4">SOURCE</text>
                <text x={s.x + 12} y={s.y + 36} fontSize="11" fontWeight="700" fill="#0b1220">{s.label}</text>
                {s.pii && (
                  <g transform={`translate(${s.x + 130}, ${s.y + 8})`}>
                    <rect x="0" y="0" width="36" height="14" rx="2" fill="#fef3c7" stroke="#b45309" />
                    <text x="18" y="10" fontSize="8" fontWeight="800" fill="#b45309" textAnchor="middle" letterSpacing="0.5">PII</text>
                  </g>
                )}
              </g>
            ))}

            {/* Bronze */}
            {[
              { y: 30,  label: 'bronze.sec_filings' },
              { y: 110, label: 'bronze.cfpb_complaints' },
            ].map((b, i) => (
              <g key={i}>
                <rect x="220" y={b.y} width="140" height="56" rx="4" fill="#fef3c7" stroke="#b45309" />
                <text x="290" y={b.y + 22} fontSize="9" fontWeight="800" fill="#826b3f" textAnchor="middle" letterSpacing="1.4">BRONZE</text>
                <text x="290" y={b.y + 40} fontSize="11" fontWeight="700" fill="#0b1220" textAnchor="middle">{b.label}</text>
              </g>
            ))}

            {/* Silver */}
            <g>
              <rect x="400" y="70" width="160" height="76" rx="4" fill="#f3f4f6" stroke="#6b7280" />
              <text x="480" y="92" fontSize="9" fontWeight="800" fill="#374151" textAnchor="middle" letterSpacing="1.4">SILVER</text>
              <text x="480" y="112" fontSize="11" fontWeight="700" fill="#0b1220" textAnchor="middle">int_company_signals</text>
              <text x="480" y="128" fontSize="9" fill="#6b7280" textAnchor="middle">deduped · joined · conformed</text>
            </g>

            {/* Gold */}
            <g>
              <rect x="600" y="70" width="170" height="76" rx="4" fill="#faf3e1" stroke="#b8975c" />
              <text x="685" y="92" fontSize="9" fontWeight="800" fill="#826b3f" textAnchor="middle" letterSpacing="1.4">GOLD</text>
              <text x="685" y="112" fontSize="11" fontWeight="700" fill="#0b1220" textAnchor="middle">fct_watchlist_signal</text>
              <text x="685" y="128" fontSize="9" fill="#826b3f" textAnchor="middle">business-ready · semantic</text>
            </g>

            {/* Consumers */}
            {[
              { y: 26,  label: 'Athena (research)' },
              { y: 78,  label: 'DuckDB notebook' },
              { y: 130, label: 'AI Analyst' },
              { y: 182, label: 'SEC artifact' },
            ].map((c, i) => (
              <g key={i}>
                <rect x="810" y={c.y} width="160" height="36" rx="4" fill="#ffffff" stroke="#0b2545" />
                <text x="890" y={c.y + 22} fontSize="11" fontWeight="700" fill="#0b2545" textAnchor="middle">{c.label}</text>
              </g>
            ))}

            {/* Arrows source → bronze (PII on CFPB only) */}
            <line x1="190" y1="58" x2="220" y2="58" stroke="#6b7280" strokeWidth="1.8" markerEnd="url(#lineageArrow)" />
            <line x1="190" y1="138" x2="220" y2="138" stroke="#b45309" strokeWidth="1.8" markerEnd="url(#piiArrow)" />

            {/* bronze → silver (dbt labs) */}
            <line x1="360" y1="58" x2="400" y2="100" stroke="#FF694A" strokeWidth="2" markerEnd="url(#lineageArrow)" />
            <line x1="360" y1="138" x2="400" y2="115" stroke="#FF694A" strokeWidth="2" markerEnd="url(#lineageArrow)" />
            <g transform="translate(362, 80)">
              <rect x="0" y="0" width="44" height="13" rx="2" fill="#FF694A" />
              <text x="22" y="10" fontSize="8.5" fontWeight="800" fill="#ffffff" textAnchor="middle" letterSpacing="0.3">dbt labs</text>
            </g>

            {/* silver → gold (dbt labs) */}
            <line x1="560" y1="108" x2="600" y2="108" stroke="#FF694A" strokeWidth="2" markerEnd="url(#lineageArrow)" />
            <g transform="translate(563, 96)">
              <rect x="0" y="0" width="44" height="13" rx="2" fill="#FF694A" />
              <text x="22" y="10" fontSize="8.5" fontWeight="800" fill="#ffffff" textAnchor="middle" letterSpacing="0.3">dbt labs</text>
            </g>

            {/* gold → consumers */}
            {[44, 96, 148, 200].map((cy, i) => (
              <line key={i} x1="770" y1="108" x2="810" y2={cy} stroke="#b8975c" strokeWidth="1.5" markerEnd="url(#lineageArrow)" />
            ))}
          </svg>
        </div>
        <div className="px-5 py-3 border-t border-[var(--hairline-soft)] flex items-center justify-between text-[11px] text-[var(--ink-soft)] bg-[var(--paper-deep)]">
          <span className="inline-flex items-center gap-2">
            <span className="inline-block w-3 h-0.5" style={{ background: '#b45309' }} /> PII edge
            <span className="ml-3 inline-block w-3 h-0.5" style={{ background: '#FF694A' }} /> dbt Labs transformation
            <span className="ml-3 inline-block w-3 h-0.5" style={{ background: '#b8975c' }} /> Iceberg read
          </span>
          <span className="uppercase tracking-wider font-semibold font-mono">column-level · auto-emitted by dbt Labs</span>
        </div>
      </section>

      {/* ODI vs MDS comparison */}
      <section className="mt-8 grid grid-cols-1 md:grid-cols-2 gap-5">
        <div className="research-card p-6 border-l-4" style={{ borderLeftColor: 'var(--ink-soft)' }}>
          <div className="eyebrow" style={{ color: 'var(--ink-soft)' }}>Modern Data Stack</div>
          <h3 className="mt-1 font-serif text-xl font-semibold text-[var(--ink-strong)]">Warehouse at the center</h3>
          <ul className="mt-4 space-y-2.5 text-sm text-[var(--ink-muted)]">
            {[
              'Proprietary internal table format',
              'Warehouse vendor controls storage + compute',
              'Schema changes require migrations',
              'AI access requires copying to another store',
              'Lock-in by design; switching is a multi-quarter project',
            ].map((s) => (
              <li key={s} className="flex items-start gap-2"><span className="text-[var(--ink-soft)] mt-0.5">▸</span><span>{s}</span></li>
            ))}
          </ul>
        </div>
        <div className="research-card p-6 border-l-4" style={{ borderLeftColor: 'var(--gold)' }}>
          <div className="eyebrow">Open Data Infrastructure</div>
          <h3 className="mt-1 font-serif text-xl font-semibold text-[var(--ink-strong)]">Standards at the center</h3>
          <ul className="mt-4 space-y-2.5 text-sm text-[var(--ink)]">
            {[
              'Apache Iceberg — open table spec, multi-engine native',
              'Storage (S3) and compute (Athena, etc.) decoupled, billed separately',
              'Schema evolution is a table operation, not a migration',
              'AI agents read the lake directly via Glue catalog',
              'Engines are interchangeable. Lock-in is an architectural choice — and you didn\'t make it.',
            ].map((s) => (
              <li key={s} className="flex items-start gap-2"><span className="text-[var(--gold)] mt-0.5">●</span><span>{s}</span></li>
            ))}
          </ul>
        </div>
      </section>
    </div>
  );
}

function Th({ children, align = 'left' }: { children: React.ReactNode; align?: 'left' | 'right' }) {
  return (
    <th className={`px-4 py-2.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--ink-soft)] ${align === 'right' ? 'text-right' : 'text-left'}`}>
      {children}
    </th>
  );
}

function LayerDetail({ layer, stats, desc }: { layer: 'bronze' | 'silver' | 'gold'; stats: { tables: number; rows: number; bytes: number }; desc: string }) {
  return (
    <div className="border border-[var(--hairline)] rounded-sm p-3 bg-white">
      <div className="flex items-center justify-between mb-2">
        <span className={`layer-chip ${layer}`}>{layer}</span>
        <span className="text-[10px] text-[var(--ink-soft)] font-mono">{stats.tables} table{stats.tables === 1 ? '' : 's'}</span>
      </div>
      <div className="text-sm font-bold text-[var(--ink-strong)] tabular">{formatNumber(stats.rows)} rows · {formatBytes(stats.bytes)}</div>
      <div className="text-[11px] text-[var(--ink-muted)] mt-1 leading-snug">{desc}</div>
    </div>
  );
}

// =============================================================================
// Interactive ODI architecture diagram — SVG, pure react-driven
// =============================================================================

function ArchitectureDiagram({
  hoveredLayer, onLayerHover, layerStats,
}: {
  hoveredLayer: 'bronze' | 'silver' | 'gold' | null;
  onLayerHover: (l: 'bronze' | 'silver' | 'gold' | null) => void;
  layerStats: (l: 'bronze' | 'silver' | 'gold') => { tables: number; rows: number; bytes: number };
}) {
  return (
    <div className="overflow-x-auto">
      <svg viewBox="0 0 960 360" className="w-full" style={{ minWidth: 760 }}>
        <defs>
          <linearGradient id="bronzeGrad" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="#fed7aa" />
            <stop offset="100%" stopColor="#b45309" />
          </linearGradient>
          <linearGradient id="silverGrad" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="#f8fafc" />
            <stop offset="100%" stopColor="#6b7280" />
          </linearGradient>
          <linearGradient id="goldGrad" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="#faf3e1" />
            <stop offset="100%" stopColor="#b8975c" />
          </linearGradient>
          <marker id="arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
            <path d="M0 0 L10 5 L0 10 z" fill="#6b7280" />
          </marker>
        </defs>

        {/* Sources */}
        {[
          { y: 30,  label: 'SEC EDGAR',  sub: 'Filings · XBRL · companies' },
          { y: 120, label: 'FRED',       sub: 'Macroeconomic time series' },
          { y: 210, label: 'CFPB',       sub: 'Consumer complaints + text' },
        ].map((s, i) => (
          <g key={i} transform={`translate(20, ${s.y})`}>
            <rect width="160" height="68" rx="4" fill="#ffffff" stroke="#d9d3c4" strokeWidth="1" />
            <text x="12" y="20" fill="#826b3f" fontSize="10" fontWeight="700" letterSpacing="1.4">SOURCE</text>
            <text x="12" y="40" fill="#0b1220" fontSize="14" fontWeight="700">{s.label}</text>
            <text x="12" y="56" fill="#4b5563" fontSize="10">{s.sub}</text>
          </g>
        ))}

        {/* Fivetran connectors band */}
        <g transform="translate(210, 30)">
          <rect width="100" height="248" rx="4" fill="#0b2545" />
          <text x="50" y="125" fill="#d4af75" fontSize="11" fontWeight="800" letterSpacing="1.6" textAnchor="middle" transform="rotate(-90 50 125)">
            FIVETRAN CDC
          </text>
        </g>

        {/* Arrows source → fivetran */}
        {[64, 154, 244].map((y) => (
          <line key={y} x1="180" y1={y} x2="210" y2={y} stroke="#6b7280" strokeWidth="1.5" markerEnd="url(#arrow)" />
        ))}

        {/* Layers */}
        {(['bronze', 'silver', 'gold'] as const).map((layer, idx) => {
          const x = 340 + idx * 170;
          const s = layerStats(layer);
          const isHover = hoveredLayer === layer;
          const grad = `url(#${layer}Grad)`;
          return (
            <g key={layer} transform={`translate(${x}, 30)`}
               onMouseEnter={() => onLayerHover(layer)}
               onMouseLeave={() => onLayerHover(null)}
               style={{ cursor: 'pointer' }}>
              <rect width="150" height="248" rx="4" fill={grad}
                    stroke={isHover ? '#0b2545' : '#d9d3c4'}
                    strokeWidth={isHover ? 2 : 1} />
              <text x="75" y="36" textAnchor="middle" fill="#0b1220" fontSize="14" fontWeight="800" letterSpacing="1.6">
                {layer.toUpperCase()}
              </text>
              <text x="75" y="58" textAnchor="middle" fill="#0b1220" fontSize="10" opacity="0.7">
                {layer === 'bronze' ? 'raw landings' : layer === 'silver' ? 'conformed' : 'business-ready'}
              </text>
              <text x="75" y="120" textAnchor="middle" fill="#0b1220" fontSize="32" fontWeight="800">
                {s.tables}
              </text>
              <text x="75" y="138" textAnchor="middle" fill="#0b1220" fontSize="10" opacity="0.7" letterSpacing="1">
                TABLES
              </text>
              <text x="75" y="178" textAnchor="middle" fill="#0b1220" fontSize="11" fontWeight="700">
                {formatNumber(s.rows)} rows
              </text>
              <text x="75" y="194" textAnchor="middle" fill="#0b1220" fontSize="10" opacity="0.75">
                {formatBytes(s.bytes)}
              </text>
              <text x="75" y="228" textAnchor="middle" fill="#0b1220" fontSize="9" letterSpacing="1" fontWeight="700" opacity="0.6">
                ICEBERG · GLUE
              </text>
            </g>
          );
        })}

        {/* Arrows between layers */}
        <line x1="310" y1="154" x2="340" y2="154" stroke="#6b7280" strokeWidth="1.5" markerEnd="url(#arrow)" />
        <line x1="490" y1="154" x2="510" y2="154" stroke="#FF694A" strokeWidth="1.8" markerEnd="url(#arrow)" />
        <line x1="660" y1="154" x2="680" y2="154" stroke="#FF694A" strokeWidth="1.8" markerEnd="url(#arrow)" />

        {/* dbt labs label on the bronze→silver arrow */}
        <g transform="translate(495, 145)">
          <rect x="-2" y="-12" width="48" height="14" rx="3" fill="#FF694A" stroke="#FF694A" />
          <text x="22" y="-1" textAnchor="middle" fontSize="9" fontWeight="800" fill="#ffffff" letterSpacing="0.5">dbt labs</text>
        </g>

        {/* dbt labs label on the silver→gold arrow */}
        <g transform="translate(665, 145)">
          <rect x="-2" y="-12" width="48" height="14" rx="3" fill="#FF694A" stroke="#FF694A" />
          <text x="22" y="-1" textAnchor="middle" fontSize="9" fontWeight="800" fill="#ffffff" letterSpacing="0.5">dbt labs</text>
        </g>

        {/* Engines fan out from gold */}
        <g transform="translate(830, 30)">
          {['Athena', 'DuckDB', 'Trino', 'Spark'].map((e, i) => {
            const y = 14 + i * 56;
            const color = ENGINE_COLORS[e as QueryEngine['name']] ?? '#475569';
            return (
              <g key={e}>
                <rect x="0" y={y} width="110" height="40" rx="4" fill="#ffffff" stroke={color} strokeWidth="1.5" />
                <text x="55" y={y + 19} textAnchor="middle" fill="#0b1220" fontSize="13" fontWeight="700">{e}</text>
                <text x="55" y={y + 32} textAnchor="middle" fill="#6b7280" fontSize="9" letterSpacing="1">
                  {e === 'Athena' ? '● ACTIVE' : 'AVAILABLE'}
                </text>
              </g>
            );
          })}
        </g>

        {/* Arrows from gold to engines */}
        {[34, 90, 146, 202].map((dy) => (
          <line key={dy} x1="800" y1="154" x2="830" y2={dy + 20} stroke="#b8975c" strokeWidth="1.2" markerEnd="url(#arrow)" />
        ))}
      </svg>
    </div>
  );
}
