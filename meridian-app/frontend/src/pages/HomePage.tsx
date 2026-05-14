import { useEffect, useMemo, useState } from 'react';
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

// Period-over-period delta on the last bucket vs. the trailing average of the prior buckets.
function pctDelta(values: number[]): number | null {
  if (values.length < 4) return null;
  const last = values[values.length - 1];
  const prior = values.slice(0, -1);
  const avg = prior.reduce((s, v) => s + v, 0) / prior.length;
  if (!avg) return null;
  return ((last - avg) / avg) * 100;
}

export default function HomePage() {
  const navigate = useNavigate();
  const [stats, setStats] = useState<SummaryStats | null>(null);
  const [allCompanies, setAllCompanies] = useState<Company[]>([]);
  const [topCompanies, setTopCompanies] = useState<Company[]>([]);
  const [filingsSpark, setFilingsSpark] = useState<number[]>([]);
  const [complaintsSpark, setComplaintsSpark] = useState<number[]>([]);

  useEffect(() => {
    api.getSummary().then(setStats).catch(() => {});
    api.searchCompanies({ limit: 200000 }).then((r) => {
      setAllCompanies(r.results);
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

  // CFO-level rollups
  const exec = useMemo(() => {
    if (allCompanies.length === 0) return null;
    const aum = allCompanies.reduce((s, c) => s + (c.market_cap ?? 0), 0);
    const high = allCompanies.filter((c) => c.risk_bucket === 'high').length;
    const elevated = allCompanies.filter((c) => c.risk_bucket === 'elevated').length;
    const sorted = [...allCompanies].sort((a, b) => (b.market_cap ?? 0) - (a.market_cap ?? 0));
    const top10 = sorted.slice(0, 10);
    const top10Cap = top10.reduce((s, c) => s + (c.market_cap ?? 0), 0);
    const concentration = aum ? (top10Cap / aum) * 100 : 0;
    const growers = allCompanies.filter((c) => (c.revenue_growth_yoy ?? 0) > 0).length;
    const totalWithGrowth = allCompanies.filter((c) => c.revenue_growth_yoy != null).length;
    const breadth = totalWithGrowth ? (growers / totalWithGrowth) * 100 : 0;
    return { aum, high, elevated, concentration, breadth, top10Name: top10[0]?.ticker ?? '—', total: allCompanies.length };
  }, [allCompanies]);

  const filingsDelta = pctDelta(filingsSpark);
  const complaintsDelta = pctDelta(complaintsSpark);

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
                  <Stat label="Coverage" value={stats ? formatNumber(stats.total_companies) : '—'} hint="public issuers" />
                  <Stat
                    label="Filings · MoM"
                    value={stats ? formatNumber(stats.total_filings) : '—'}
                    hint="vs. prior 11-mo avg"
                    sparkValues={filingsSpark}
                    sparkStroke="var(--navy-deep)"
                    delta={filingsDelta}
                  />
                  <Stat label="Macro series" value={stats ? formatNumber(stats.total_macro_series) : '—'} hint="FRED" />
                  <Stat
                    label="Complaints · MoM"
                    value={stats ? formatNumber(stats.total_complaints) : '—'}
                    hint="vs. prior 11-mo avg"
                    sparkValues={complaintsSpark}
                    sparkStroke="var(--gold-dim)"
                    delta={complaintsDelta}
                  />
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

      {/* Executive brief — CFO read of the panel in 30 seconds */}
      <section className="mx-auto max-w-7xl px-4 pt-12 pb-2 sm:px-6 lg:px-8">
        <div className="mb-5 flex items-end justify-between border-b border-[var(--hairline)] pb-3">
          <div>
            <div className="eyebrow mb-1">Executive Brief</div>
            <h2 className="font-serif text-2xl sm:text-3xl font-semibold text-[var(--ink-strong)] tracking-tight">
              The panel in four numbers
            </h2>
            <p className="text-sm text-[var(--ink-muted)] mt-1">
              Coverage AUM, top-10 concentration, breadth of revenue growers, and the count of issuers in the elevated/high risk tier.
            </p>
          </div>
          <button
            onClick={() => navigate('/holdings?risk=high')}
            className="text-sm font-semibold text-[var(--gold-dim)] hover:text-[var(--ink-strong)] whitespace-nowrap"
          >
            Open high-risk list →
          </button>
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <ExecTile
            label="Coverage AUM"
            value={exec ? formatCurrencyShort(exec.aum) : '—'}
            sub={exec ? `${formatNumber(exec.total)} issuers · market cap` : ''}
          />
          <ExecTile
            label="Top-10 concentration"
            value={exec ? `${exec.concentration.toFixed(0)}%` : '—'}
            sub={exec ? `${exec.top10Name} leads` : ''}
            tone={exec && exec.concentration > 35 ? 'caution' : 'neutral'}
          />
          <ExecTile
            label="Revenue growers"
            value={exec ? `${exec.breadth.toFixed(0)}%` : '—'}
            sub={exec ? 'of issuers with positive YoY' : ''}
            tone={exec && exec.breadth < 50 ? 'bear' : exec && exec.breadth >= 65 ? 'bull' : 'neutral'}
          />
          <ExecTile
            label="Elevated / High risk"
            value={exec ? `${exec.elevated + exec.high}` : '—'}
            sub={exec ? `${exec.high} high · ${exec.elevated} elevated` : ''}
            tone={exec && exec.high > 0 ? 'bear' : 'neutral'}
            onClick={() => navigate('/holdings?risk=high')}
          />
        </div>
      </section>

      {/* Three pillars */}
      <section className="bg-[var(--paper)] border-y border-[var(--hairline)] mt-10">
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

function Stat({ label, value, hint, sparkValues, sparkStroke, delta }: { label: string; value: string; hint: string; sparkValues?: number[]; sparkStroke?: string; delta?: number | null }) {
  const deltaColor = delta == null ? 'var(--ink-soft)' : delta >= 0 ? 'var(--bull)' : 'var(--bear)';
  return (
    <div className="px-5 py-4">
      <div className="text-[10.5px] font-semibold text-[var(--ink-soft)] uppercase tracking-[0.08em]">{label}</div>
      <div className="mt-1 flex items-baseline gap-2">
        <div className="font-serif text-2xl font-semibold text-[var(--ink-strong)] leading-none tabular">{value}</div>
        {delta != null && (
          <span className="text-[11px] font-semibold tabular" style={{ color: deltaColor }}>
            {delta >= 0 ? '+' : ''}{delta.toFixed(0)}%
          </span>
        )}
      </div>
      {sparkValues && sparkValues.length >= 2 && (
        <div className="mt-1.5">
          <Sparkline values={sparkValues} width={100} height={18} stroke={sparkStroke ?? 'var(--gold)'} fill="none" strokeWidth={1.25} />
        </div>
      )}
      <div className="mt-1 text-[11px] text-[var(--ink-soft)]">{hint}</div>
    </div>
  );
}

function ExecTile({ label, value, sub, tone, onClick }: { label: string; value: string; sub?: string; tone?: 'bull' | 'bear' | 'caution' | 'neutral'; onClick?: () => void }) {
  const color =
    tone === 'bull' ? 'var(--bull)' :
    tone === 'bear' ? 'var(--bear)' :
    tone === 'caution' ? 'var(--caution)' :
    'var(--ink-strong)';
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag
      onClick={onClick}
      className={`research-card px-5 py-4 text-left ${onClick ? 'hover:border-[var(--gold)] transition-colors cursor-pointer' : ''}`}
    >
      <div className="text-[10.5px] font-semibold text-[var(--ink-soft)] uppercase tracking-[0.08em]">{label}</div>
      <div className="mt-1 font-serif text-3xl font-semibold leading-none tabular" style={{ color }}>{value}</div>
      {sub && <div className="mt-1.5 text-[11px] text-[var(--ink-soft)]">{sub}</div>}
    </Tag>
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
