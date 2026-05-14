import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, formatBytes, formatCurrencyShort, formatNumber } from '../api/queries';
import type { SummaryStats, Company } from '../types';
import Sparkline from '../components/Sparkline';

function monthlyCounts(dates: (string | null | undefined)[], months = 12): number[] {
  const buckets = new Map<string, number>();
  for (const d of dates) {
    if (!d) continue;
    const key = d.slice(0, 7);
    buckets.set(key, (buckets.get(key) ?? 0) + 1);
  }
  const keys = Array.from(buckets.keys()).sort();
  return keys.slice(-months).map((k) => buckets.get(k)!);
}

export default function HomePage() {
  const navigate = useNavigate();
  const [stats, setStats] = useState<SummaryStats | null>(null);
  const [topCompanies, setTopCompanies] = useState<Company[]>([]);
  const [filingsSpark, setFilingsSpark] = useState<number[]>([]);
  const [complaintsSpark, setComplaintsSpark] = useState<number[]>([]);

  useEffect(() => {
    api.getSummary().then(setStats).catch(() => {});
    api.searchCompanies({ limit: 200000 }).then((r) => {
      const sorted = [...r.results].sort((a, b) => b.risk_score - a.risk_score).slice(0, 6);
      setTopCompanies(sorted);
    }).catch(() => {});
    api.getFilings().then((r) => {
      setFilingsSpark(monthlyCounts(r.filings.map((f) => f.filing_date)));
    }).catch(() => {});
    api.getComplaints().then((r) => {
      setComplaintsSpark(monthlyCounts(r.complaints.map((c) => c.date_received)));
    }).catch(() => {});
  }, []);

  return (
    <>
      {/* Institutional hero — navy with gold accent rule */}
      <section className="bg-[var(--navy-deep)] text-white relative overflow-hidden">
        {/* Subtle diagonal pattern overlay */}
        <div className="absolute inset-0 opacity-[0.06] pointer-events-none" aria-hidden style={{
          backgroundImage: 'repeating-linear-gradient(135deg, transparent 0 28px, rgba(212,175,117,0.5) 28px 29px)',
        }} />
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-16 sm:py-24 relative">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-end">
            <div className="lg:col-span-7">
              <div className="eyebrow-light mb-4">Meridian Capital · Open Data Infrastructure</div>
              <h1 className="font-serif text-4xl sm:text-6xl font-semibold text-white leading-[0.98] tracking-tight">
                One lake.<br />
                <span className="text-[var(--gold-bright)]">Every engine.</span><br />
                Full control.
              </h1>
              <p className="mt-6 text-base sm:text-lg text-white/75 max-w-2xl leading-relaxed">
                Research-desk intelligence that no longer lives behind a warehouse. Public filings,
                macroeconomic context, and consumer signals — landed once in open Iceberg tables on S3,
                queried by Athena, governed in Glue, ready for AI agents the moment they arrive.
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <button
                  onClick={() => navigate('/holdings')}
                  className="inline-flex items-center gap-2 rounded-sm font-semibold text-sm text-[var(--navy-deep)] px-5 py-3 shadow-lg hover:opacity-95 transition-opacity"
                  style={{ background: 'var(--gold)' }}
                >
                  Open the desk <span aria-hidden>→</span>
                </button>
                <button
                  onClick={() => navigate('/architecture')}
                  className="inline-flex items-center gap-2 rounded-sm font-semibold text-sm text-white bg-white/5 border border-white/20 px-5 py-3 hover:bg-white/10 transition-colors"
                >
                  See the ODI architecture <span aria-hidden>→</span>
                </button>
              </div>
            </div>

            <div className="lg:col-span-5">
              <div className="bg-white text-[var(--ink)] rounded-sm border border-[var(--hairline)] shadow-xl overflow-hidden">
                <div className="px-5 py-3 border-b border-[var(--hairline)] flex items-center justify-between bg-[var(--paper-deep)]">
                  <div className="eyebrow">Lake Snapshot</div>
                  <div className="text-[10px] font-semibold text-[var(--ink-soft)] uppercase tracking-wider">Athena · Iceberg</div>
                </div>
                <div className="grid grid-cols-2 divide-x divide-y divide-[var(--hairline-soft)] tabular">
                  <Stat label="Companies" value={stats ? formatNumber(stats.total_companies) : '—'} hint="From SEC EDGAR XBRL" />
                  <Stat label="Filings" value={stats ? formatNumber(stats.total_filings) : '—'} hint="10-K / 10-Q / 8-K" sparkValues={filingsSpark} sparkStroke="var(--navy-deep)" />
                  <Stat label="Macro series" value={stats ? formatNumber(stats.total_macro_series) : '—'} hint="From FRED" />
                  <Stat label="Complaints" value={stats ? formatNumber(stats.total_complaints) : '—'} hint="From CFPB consumer database" sparkValues={complaintsSpark} sparkStroke="var(--gold-dim)" />
                </div>
                <div className="px-5 py-3 border-t border-[var(--hairline)] flex items-center justify-between text-[11px] text-[var(--ink-soft)] bg-[var(--paper-deep)]">
                  <span className="inline-flex items-center gap-1.5">
                    <span className="h-1.5 w-1.5 rounded-full bg-[var(--bull)] animate-pulse" />
                    {stats ? formatBytes(stats.s3_bytes) : '—'} in S3 · {stats?.iceberg_table_count ?? '—'} Iceberg tables
                  </span>
                  <button onClick={() => navigate('/pipeline')} className="font-semibold hover:text-[var(--ink-strong)] uppercase tracking-wider">
                    Inspect →
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Three pillars */}
      <section className="bg-[var(--paper)] border-y border-[var(--hairline)]">
        <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
          <div className="max-w-3xl mb-12">
            <div className="eyebrow mb-2">The ODI Difference</div>
            <h2 className="font-serif text-3xl sm:text-4xl font-semibold text-[var(--ink-strong)] tracking-tight">
              Not another warehouse migration.<br />
              An <span className="italic">architectural</span> choice.
            </h2>
            <p className="mt-3 text-[var(--ink-muted)] leading-relaxed">
              The modern data stack put a warehouse in the center. ODI puts <em>open standards</em> in
              the center — and lets the warehouse, the lakehouse, and the AI agent share one source
              of truth without lock-in.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            <Pillar
              eyebrow="01 · Open storage"
              title="Apache Iceberg on S3"
              copy="Every row lands in an open table format. Read by Athena today, Trino tomorrow, DuckDB on a laptop — same bytes, no extraction."
              tones={['bronze', 'silver', 'gold']}
            />
            <Pillar
              eyebrow="02 · Multi-engine"
              title="Any compute. Same data."
              copy="Athena for ad-hoc, dbt for governed transforms, Spark for ML, Snowflake external tables if you must — engines come and go, the lake stays."
              tones={['silver', 'gold', 'bronze']}
            />
            <Pillar
              eyebrow="03 · AI-ready"
              title="Lake-native, not warehouse-proxied"
              copy="Claude reads Iceberg parquet directly through the Glue catalog. No copy, no ETL hop, no warehouse round-trip — just one governed surface."
              tones={['gold', 'silver', 'bronze']}
            />
          </div>
        </div>
      </section>

      {/* Top risk signals */}
      <section className="mx-auto max-w-7xl px-4 py-14 sm:px-6 lg:px-8">
        <div className="flex items-end justify-between mb-6 border-b border-[var(--hairline)] pb-4">
          <div>
            <div className="eyebrow mb-1">Cross-Source Signal</div>
            <h2 className="font-serif text-2xl sm:text-3xl font-semibold text-[var(--ink-strong)]">
              Highest risk in the panel
            </h2>
            <p className="text-sm text-[var(--ink-muted)] mt-1 max-w-2xl">
              Risk score derived from{' '}
              <span className="layer-chip gold ml-0.5">gold.fct_company_risk_signal</span>{' '}
              — a single dbt model that blends complaint velocity, financial deterioration, recent 8-K
              activity, and sector macro stress.
            </p>
          </div>
          <button onClick={() => navigate('/holdings')} className="text-sm font-semibold text-[var(--gold-dim)] hover:text-[var(--ink-strong)] whitespace-nowrap">
            Browse all →
          </button>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {topCompanies.length === 0
            ? Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="research-card p-5 animate-pulse h-44" />
              ))
            : topCompanies.map((c) => <CompanyCard key={c.cik} c={c} onClick={() => navigate(`/companies/${encodeURIComponent(c.cik)}`)} />)}
        </div>
      </section>

      {/* Data lineage strip */}
      <section className="bg-white border-y border-[var(--hairline)]">
        <div className="mx-auto max-w-7xl px-4 py-14 sm:px-6 lg:px-8">
          <div className="max-w-2xl mb-10">
            <div className="eyebrow mb-2">Provenance</div>
            <h2 className="font-serif text-2xl sm:text-3xl font-semibold text-[var(--ink-strong)] tracking-tight">
              Three sources. One lake. Every chart traces back.
            </h2>
            <p className="mt-2 text-sm sm:text-base text-[var(--ink-muted)] leading-relaxed">
              Every number on this site originates in one of three public APIs and is governed
              end-to-end. No spreadsheets, no scraping, no warehouse vendor in the path.
            </p>
          </div>
          <ol className="grid grid-cols-1 md:grid-cols-5 gap-3 sm:gap-4">
            {[
              { tag: '01', label: 'Sources', desc: 'SEC EDGAR · FRED · CFPB. Three public APIs, three Fivetran custom connectors.', accent: 'bronze' as const },
              { tag: '02', label: 'Ingest', desc: 'Fivetran writes raw bronze tables to S3 as Apache Iceberg via the AWS Glue Catalog.', accent: 'bronze' as const },
              { tag: '03', label: 'Transform', desc: 'dbt builds silver (conformed) → gold (business-ready) marts on Athena.', accent: 'silver' as const },
              { tag: '04', label: 'Serve', desc: 'Athena queries gold-layer Iceberg tables. Same SQL would run on Trino or DuckDB.', accent: 'gold' as const },
              { tag: '05', label: 'Reason', desc: 'AI agent reads gold-layer parquet directly through Glue. No warehouse hop required.', accent: 'gold' as const },
            ].map((s) => (
              <li key={s.tag} className="research-card p-4 hover:border-[var(--gold)] transition-colors">
                <div className="text-[10px] font-mono font-bold text-[var(--gold-dim)] tracking-wider">{s.tag}</div>
                <div className="mt-1 font-serif text-base font-semibold text-[var(--ink-strong)]">{s.label}</div>
                <p className="mt-2 text-xs text-[var(--ink-muted)] leading-relaxed">{s.desc}</p>
                <div className="mt-3"><span className={`layer-chip ${s.accent}`}>{s.accent}</span></div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* Closing principle */}
      <section className="bg-[var(--navy-deep)] text-white border-t border-[var(--hairline)]">
        <div className="mx-auto max-w-5xl px-4 py-16 sm:px-6 lg:px-8 text-center">
          <div className="eyebrow-light mb-3">Design Principles</div>
          <p className="font-serif text-2xl sm:text-3xl text-white leading-snug">
            "Lock-in is an architectural choice.<br />
            <span className="text-[var(--gold-bright)]">So is openness.</span>"
          </p>
          <p className="mt-4 text-sm text-white/70 max-w-2xl mx-auto">
            Meridian Capital chose ODI because it gives the desk control over storage, compute,
            cost, and shared context — and because the AI agents that come next will demand
            governed access to the lake, not a serial-port pipe through the warehouse.
          </p>
        </div>
      </section>
    </>
  );
}

function Stat({ label, value, hint, sparkValues, sparkStroke }: { label: string; value: string; hint: string; sparkValues?: number[]; sparkStroke?: string }) {
  return (
    <div className="px-5 py-4">
      <div className="text-[10.5px] font-semibold text-[var(--ink-soft)] uppercase tracking-[0.08em]">{label}</div>
      <div className="mt-1 font-serif text-2xl font-semibold text-[var(--ink-strong)] leading-none">{value}</div>
      {sparkValues && sparkValues.length >= 2 && (
        <div className="mt-1.5">
          <Sparkline values={sparkValues} width={100} height={18} stroke={sparkStroke ?? 'var(--gold)'} fill={sparkStroke ?? 'var(--gold)'} strokeWidth={1.25} />
        </div>
      )}
      <div className="mt-1 text-[11px] text-[var(--ink-soft)]">{hint}</div>
    </div>
  );
}

function Pillar({ eyebrow, title, copy, tones }: { eyebrow: string; title: string; copy: string; tones: ('bronze' | 'silver' | 'gold')[] }) {
  return (
    <div className="research-card p-6 hover:border-[var(--gold)] transition-colors">
      <div className="eyebrow mb-2">{eyebrow}</div>
      <h3 className="font-serif text-xl font-semibold text-[var(--ink-strong)] tracking-tight">{title}</h3>
      <p className="mt-3 text-sm text-[var(--ink-muted)] leading-relaxed">{copy}</p>
      <div className="mt-4 flex flex-wrap gap-1.5">
        {tones.map((t) => <span key={t} className={`layer-chip ${t}`}>{t}</span>)}
      </div>
    </div>
  );
}

function CompanyCard({ c, onClick }: { c: Company; onClick: () => void }) {
  const tone =
    c.risk_bucket === 'high' ? 'bear' : c.risk_bucket === 'elevated' ? 'caution' : c.risk_bucket === 'moderate' ? 'neutral' : 'bull';
  return (
    <button onClick={onClick} className="text-left research-card hover:border-[var(--gold)] transition-colors group">
      <div className="px-5 pt-4 pb-3 border-b border-[var(--hairline-soft)] flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="ticker text-[11px] text-[var(--gold-dim)]">{c.ticker}</div>
          <div className="mt-0.5 font-serif font-semibold text-[var(--ink-strong)] truncate group-hover:underline underline-offset-2">
            {c.name}
          </div>
          <div className="text-[11px] text-[var(--ink-muted)] mt-0.5 truncate">{c.sector ?? '—'}</div>
        </div>
        <span className={`status-pill ${tone}`}>{c.risk_bucket}</span>
      </div>
      <div className="px-5 py-3 grid grid-cols-3 gap-3 text-xs">
        <div>
          <div className="text-[10px] uppercase tracking-wider text-[var(--ink-soft)] font-semibold">Risk</div>
          <div className="mt-0.5 font-bold text-[var(--ink-strong)] tabular">{Math.round(c.risk_score)}</div>
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-wider text-[var(--ink-soft)] font-semibold">Mkt Cap</div>
          <div className="mt-0.5 font-bold text-[var(--ink-strong)] tabular">{formatCurrencyShort(c.market_cap)}</div>
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-wider text-[var(--ink-soft)] font-semibold">Cmplts/Q</div>
          <div className="mt-0.5 font-bold text-[var(--ink-strong)] tabular">{formatNumber(c.complaint_velocity)}</div>
        </div>
      </div>
    </button>
  );
}
