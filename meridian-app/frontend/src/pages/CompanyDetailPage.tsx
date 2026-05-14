import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts';
import { api, formatCurrencyShort, formatNumber, formatPercent } from '../api/queries';
import type { CompanyDetail, RiskBucket, MacroObservation } from '../types';
import WatchlistButton from '../components/WatchlistButton';

function riskTone(bucket: RiskBucket): { cls: string; label: string; color: string } {
  switch (bucket) {
    case 'low':      return { cls: 'bull',    label: 'Low risk',      color: '#15803d' };
    case 'moderate': return { cls: 'neutral', label: 'Moderate risk', color: '#1d4e89' };
    case 'elevated': return { cls: 'caution', label: 'Elevated risk', color: '#b45309' };
    case 'high':     return { cls: 'bear',    label: 'High risk',     color: '#b91c1c' };
  }
}

interface RiskComponent {
  label: string;
  value: number;       // 0-100
  tone: 'bull' | 'bear' | 'caution';
  detail: string;
}

function deriveRiskComponents(c: CompanyDetail): RiskComponent[] {
  const complaintVel = c.complaint_velocity;
  const complaintScore = Math.min(100, complaintVel * 2);
  const complaintTone: RiskComponent['tone'] = complaintScore > 60 ? 'bear' : complaintScore > 30 ? 'caution' : 'bull';

  const growth = c.revenue_growth_yoy ?? 0;
  const revScore = Math.max(0, Math.min(100, 50 - growth * 2));
  const revTone: RiskComponent['tone'] = growth < -5 ? 'bear' : growth < 2 ? 'caution' : 'bull';

  const filings = c.filings_count_ttm;
  const filingScore = Math.min(100, filings * 8);
  const filingTone: RiskComponent['tone'] = filingScore > 60 ? 'bear' : filingScore > 30 ? 'caution' : 'bull';

  const sectorScore = c.sector === 'Financials' ? 70 : c.sector === 'Real Estate' ? 60 : 35;
  const sectorTone: RiskComponent['tone'] = sectorScore > 60 ? 'caution' : 'bull';

  return [
    { label: 'Complaint velocity', value: complaintScore, tone: complaintTone, detail: `${complaintVel} CFPB complaints/quarter on average.` },
    { label: 'Revenue trend',      value: revScore,       tone: revTone,       detail: `Revenue ${growth >= 0 ? 'growing' : 'contracting'} ${formatPercent(growth)} YoY.` },
    { label: '8-K event cadence',  value: filingScore,    tone: filingTone,    detail: `${filings} filings in the trailing twelve months.` },
    { label: 'Sector macro',       value: sectorScore,    tone: sectorTone,    detail: `${c.sector ?? 'Sector unknown'} exposure to rate cycle and credit conditions.` },
  ];
}

export default function CompanyDetailPage() {
  const { cik = '' } = useParams();
  const [company, setCompany] = useState<CompanyDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [macroObs, setMacroObs] = useState<MacroObservation[]>([]);

  useEffect(() => {
    setLoading(true);
    api.getCompany(cik)
      .then(async (c) => {
        setCompany(c);
        // Try to load one related macro series for the overlay chart
        const seriesId = c.related_macro_series?.[0]?.series_id;
        if (seriesId) {
          try {
            const detail = await api.getMacroSeries(seriesId);
            setMacroObs(detail.observations.slice(-60));
          } catch { /* ignore */ }
        }
      })
      .catch(() => setCompany(null))
      .finally(() => setLoading(false));
  }, [cik]);

  const complaintsByTopic = useMemo(() => {
    if (!company) return [];
    const counts = new Map<string, number>();
    for (const cp of company.complaints) {
      const topic = cp.topic_cluster ?? 'Uncategorized';
      counts.set(topic, (counts.get(topic) ?? 0) + 1);
    }
    return Array.from(counts.entries())
      .map(([topic, count]) => ({ topic, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);
  }, [company]);

  if (loading || !company) {
    return <div className="mx-auto max-w-7xl px-4 py-20 text-center text-[var(--ink-soft)]">Loading research file…</div>;
  }

  const tone = riskTone(company.risk_bucket);
  const components = deriveRiskComponents(company);
  const recentComplaints = company.complaints.slice(0, 8);

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <nav className="text-xs text-[var(--ink-soft)] mb-4 flex items-center gap-1.5">
        <Link to="/" className="hover:text-[var(--ink-strong)]">Home</Link>
        <span aria-hidden>/</span>
        <Link to="/holdings" className="hover:text-[var(--ink-strong)]">Holdings</Link>
        <span aria-hidden>/</span>
        <span className="ticker text-[var(--ink-muted)]">{company.ticker}</span>
      </nav>

      {/* Hero banner — navy with gold left border */}
      <header
        className="rounded-sm overflow-hidden shadow-sm border-l-4"
        style={{ background: 'var(--navy-deep)', borderLeftColor: 'var(--gold)' }}
      >
        <div className="px-6 py-6 flex flex-col lg:flex-row lg:items-start lg:justify-between gap-6 text-white">
          <div className="min-w-0">
            <div className="flex items-center gap-3 flex-wrap">
              <span className="ticker text-2xl text-[var(--gold-bright)]">{company.ticker}</span>
              <span className="text-[10px] font-mono text-white/60 tracking-tight">CIK {company.cik}</span>
              <span className={`status-pill ${tone.cls}`}>{tone.label}</span>
            </div>
            <h1 className="mt-1 font-serif text-3xl sm:text-4xl font-semibold tracking-tight text-white">
              {company.name}
            </h1>
            <p className="mt-2 text-sm text-white/70">
              {[company.sector, company.industry, company.exchange, company.hq_city && company.hq_state
                ? `${company.hq_city}, ${company.hq_state}`
                : company.hq_state ?? null].filter(Boolean).join(' · ')}
            </p>
            {company.description && (
              <p className="mt-3 max-w-3xl text-sm text-white/75 leading-relaxed line-clamp-3">{company.description}</p>
            )}
          </div>

          <div className="shrink-0 w-full lg:w-auto">
            <div className="grid grid-cols-3 gap-2 lg:gap-3">
              <BannerStat label="Market Cap" value={formatCurrencyShort(company.market_cap)} />
              <BannerStat label="Revenue (TTM)" value={formatCurrencyShort(company.revenue_ttm)} />
              <BannerStat
                label="Risk Score"
                value={company.risk_score.toFixed(0)}
                accent={tone.color}
              />
            </div>
            <div className="mt-3 flex items-center justify-end">
              <WatchlistButton cik={company.cik} />
            </div>
          </div>
        </div>
      </header>

      <div className="mt-6 grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Section A — Risk Signal */}
        <section className="research-card overflow-hidden lg:col-span-2">
          <header className="research-card-header flex items-center justify-between">
            <div>
              <div className="eyebrow">Section A</div>
              <h2 className="font-serif text-lg font-semibold text-[var(--ink-strong)] mt-0.5">Risk signal decomposition</h2>
            </div>
            <span className="text-xs text-[var(--ink-soft)]">Composite score {company.risk_score.toFixed(1)} / 100</span>
          </header>
          <div className="p-5 space-y-4">
            {components.map((c) => (
              <RiskBar key={c.label} component={c} />
            ))}
          </div>
        </section>

        {/* Section B — Recent Filings */}
        <section className="research-card overflow-hidden lg:col-span-2">
          <header className="research-card-header flex items-center justify-between">
            <div>
              <div className="eyebrow">Section B</div>
              <h2 className="font-serif text-lg font-semibold text-[var(--ink-strong)] mt-0.5">Recent EDGAR filings</h2>
            </div>
            <span className="text-xs text-[var(--ink-soft)] tabular">{company.filings.length} on file</span>
          </header>
          {company.filings.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm tabular">
                <thead className="text-[10px] uppercase tracking-wider text-[var(--ink-soft)] bg-[var(--paper-deep)]">
                  <tr>
                    <th className="px-4 py-2 text-left font-semibold">Date</th>
                    <th className="px-4 py-2 text-left font-semibold">Form</th>
                    <th className="px-4 py-2 text-left font-semibold">Period</th>
                    <th className="px-4 py-2 text-left font-semibold">Topic</th>
                    <th className="px-4 py-2 text-right font-semibold">Words</th>
                    <th className="px-4 py-2 text-right font-semibold">EDGAR</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--hairline-soft)]">
                  {company.filings.slice(0, 25).map((f) => (
                    <tr key={f.accession_no} className="hover:bg-[var(--paper-deep)]">
                      <td className="px-4 py-2 text-[var(--ink)] font-medium">{f.filing_date}</td>
                      <td className="px-4 py-2"><span className="layer-chip silver">{f.form_type}</span></td>
                      <td className="px-4 py-2 text-[var(--ink-muted)] text-xs">{f.period_of_report ?? '—'}</td>
                      <td className="px-4 py-2 text-[var(--ink-muted)] text-xs">{f.primary_topic ?? '—'}</td>
                      <td className="px-4 py-2 text-right text-[var(--ink-muted)]">{formatNumber(f.word_count)}</td>
                      <td className="px-4 py-2 text-right">
                        {f.filing_url ? (
                          <a
                            href={f.filing_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs text-[var(--gold-dim)] hover:text-[var(--ink-strong)] font-medium"
                          >
                            View ↗
                          </a>
                        ) : <span className="text-xs text-[var(--ink-soft)]">—</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="p-5 text-sm text-[var(--ink-soft)]">No filings on file in the snapshot.</p>
          )}
        </section>

        {/* Section C — Complaint Radar */}
        <section className="research-card overflow-hidden">
          <header className="research-card-header">
            <div className="eyebrow">Section C</div>
            <h2 className="font-serif text-lg font-semibold text-[var(--ink-strong)] mt-0.5">Complaint radar</h2>
            <p className="text-xs text-[var(--ink-muted)] mt-1">CFPB consumer complaints attributed to this issuer.</p>
          </header>
          {complaintsByTopic.length > 0 ? (
            <div className="p-4">
              <div className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={complaintsByTopic} layout="vertical" margin={{ top: 4, right: 16, left: 8, bottom: 4 }}>
                    <CartesianGrid stroke="#ebe6d8" horizontal={false} />
                    <XAxis type="number" tick={{ fill: '#6b7280', fontSize: 11 }} stroke="#d9d3c4" />
                    <YAxis type="category" dataKey="topic" tick={{ fill: '#4b5563', fontSize: 11 }} stroke="#d9d3c4" width={120} />
                    <Tooltip contentStyle={{ background: '#fff', border: '1px solid #d9d3c4', fontSize: 12 }} />
                    <Bar dataKey="count" fill="#b8975c" radius={[0, 2, 2, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              {recentComplaints.length > 0 && (
                <ul className="mt-4 divide-y divide-[var(--hairline-soft)] text-sm">
                  {recentComplaints.map((cp) => (
                    <li key={cp.complaint_id} className="py-2 flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-[var(--ink)] truncate"><span className="font-medium">{cp.product}</span> · <span className="text-[var(--ink-muted)] text-xs">{cp.topic_cluster ?? '—'}</span></div>
                        <div className="text-[11px] text-[var(--ink-soft)]">{cp.date_received} · {cp.issue}</div>
                      </div>
                      {cp.has_narrative && <span className="status-pill gold shrink-0">Narrative</span>}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ) : (
            <p className="p-5 text-sm text-[var(--ink-soft)]">No CFPB complaints linked to this issuer.</p>
          )}
        </section>

        {/* Section D — Macro Overlay */}
        <section className="research-card overflow-hidden">
          <header className="research-card-header">
            <div className="eyebrow">Section D</div>
            <h2 className="font-serif text-lg font-semibold text-[var(--ink-strong)] mt-0.5">Macro overlay</h2>
            <p className="text-xs text-[var(--ink-muted)] mt-1">
              {company.related_macro_series?.[0]
                ? `${company.related_macro_series[0].title} alongside revenue context.`
                : 'No related FRED series identified for this issuer.'}
            </p>
          </header>
          {macroObs.length > 0 ? (
            <div className="p-4 h-64">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={macroObs} margin={{ top: 4, right: 16, left: 0, bottom: 4 }}>
                  <CartesianGrid stroke="#ebe6d8" />
                  <XAxis dataKey="date" tick={{ fill: '#6b7280', fontSize: 11 }} stroke="#d9d3c4" />
                  <YAxis tick={{ fill: '#6b7280', fontSize: 11 }} stroke="#d9d3c4" />
                  <Tooltip contentStyle={{ background: '#fff', border: '1px solid #d9d3c4', fontSize: 12 }} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Line type="monotone" dataKey="value" name={company.related_macro_series?.[0]?.series_id ?? 'value'} stroke="#0b2545" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="p-8 text-center text-sm text-[var(--ink-soft)]">
              {company.related_macro_series && company.related_macro_series.length > 0
                ? 'Macro series identified but no observations in snapshot.'
                : 'Add a FRED correlation to surface macro context.'}
            </div>
          )}
        </section>

        {/* Section E — AI Summary */}
        {(company.ai_summary || (company.risk_factors && company.risk_factors.length > 0)) && (
          <section
            className="rounded-sm overflow-hidden lg:col-span-2"
            style={{ background: 'var(--gold-bg)', border: '1px solid #ebd9a3' }}
          >
            <header className="px-5 pt-4 pb-2">
              <div className="eyebrow" style={{ color: 'var(--gold-dim)' }}>Section E</div>
              <h2 className="font-serif text-lg font-semibold text-[var(--ink-strong)] mt-0.5">Research summary</h2>
            </header>
            <div className="px-5 pb-5">
              {company.ai_summary && (
                <blockquote
                  className="font-serif text-base leading-relaxed text-[var(--ink-strong)] border-l-2 pl-4 py-1"
                  style={{ borderColor: 'var(--gold)' }}
                >
                  {company.ai_summary}
                </blockquote>
              )}
              {company.risk_factors && company.risk_factors.length > 0 && (
                <div className="mt-4">
                  <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--gold-dim)] mb-2">Risk factors</div>
                  <div className="flex flex-wrap gap-2">
                    {company.risk_factors.map((rf, i) => (
                      <span
                        key={i}
                        className="inline-flex items-center rounded-sm px-2.5 py-1 text-xs font-medium bg-white text-[var(--ink)] border border-[var(--hairline)]"
                      >
                        {rf}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}

function BannerStat({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div className="rounded-sm bg-white/10 border border-white/15 px-3 py-2 min-w-[7.5rem]">
      <div className="text-[9.5px] font-semibold text-white/60 uppercase tracking-wider">{label}</div>
      <div
        className="mt-0.5 font-serif text-xl font-semibold tabular leading-none"
        style={{ color: accent ?? 'var(--gold-bright)' }}
      >
        {value}
      </div>
    </div>
  );
}

function RiskBar({ component }: { component: RiskComponent }) {
  const colors = {
    bull:    'var(--bull)',
    bear:    'var(--bear)',
    caution: 'var(--caution)',
  } as const;
  const bg = {
    bull:    'var(--bull-bg)',
    bear:    'var(--bear-bg)',
    caution: 'var(--caution-bg)',
  } as const;
  return (
    <div>
      <div className="flex items-baseline justify-between text-sm mb-1.5">
        <div className="font-medium text-[var(--ink-strong)]">{component.label}</div>
        <div className="tabular font-serif font-semibold" style={{ color: colors[component.tone] }}>
          {Math.round(component.value)}
        </div>
      </div>
      <div className="h-2 rounded-full overflow-hidden" style={{ background: bg[component.tone] }}>
        <div
          className="h-full rounded-full"
          style={{ width: `${Math.max(2, Math.min(100, component.value))}%`, background: colors[component.tone] }}
        />
      </div>
      <p className="mt-1 text-xs text-[var(--ink-muted)]">{component.detail}</p>
    </div>
  );
}
