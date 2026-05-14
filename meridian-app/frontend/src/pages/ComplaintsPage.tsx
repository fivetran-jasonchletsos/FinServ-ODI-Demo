import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
} from 'recharts';
import { api, formatNumber } from '../api/queries';
import type { Complaint } from '../types';
import Sparkline from '../components/Sparkline';

export default function ComplaintsPage() {
  const [complaints, setComplaints] = useState<Complaint[]>([]);
  const [loading, setLoading] = useState(true);
  const [product, setProduct] = useState<string | null>(null);
  const [state, setState] = useState<string | null>(null);
  const [topic, setTopic] = useState<string | null>(null);

  useEffect(() => {
    api.getComplaints().then((r) => setComplaints(r.complaints)).finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    return complaints.filter((c) => {
      if (product && c.product !== product) return false;
      if (state && c.state !== state) return false;
      if (topic && c.topic_cluster !== topic) return false;
      return true;
    });
  }, [complaints, product, state, topic]);

  const productOptions = useMemo(() => {
    return Array.from(new Set(complaints.map((c) => c.product))).sort();
  }, [complaints]);

  const stateOptions = useMemo(() => {
    return Array.from(new Set(complaints.map((c) => c.state).filter(Boolean) as string[])).sort();
  }, [complaints]);

  const topicData = useMemo(() => {
    const counts = new Map<string, number>();
    for (const c of filtered) {
      const k = c.topic_cluster ?? 'Uncategorized';
      counts.set(k, (counts.get(k) ?? 0) + 1);
    }
    return Array.from(counts.entries())
      .map(([t, count]) => ({ topic: t, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 12);
  }, [filtered]);

  // Last-12-months series derived from date_received for sparklines.
  const monthlySeries = useMemo(() => {
    const counts = new Map<string, { total: number; timely: number }>();
    for (const c of filtered) {
      if (!c.date_received) continue;
      const key = c.date_received.slice(0, 7); // YYYY-MM
      const bucket = counts.get(key) ?? { total: 0, timely: 0 };
      bucket.total += 1;
      if (c.timely_response === true) bucket.timely += 1;
      counts.set(key, bucket);
    }
    const keys = Array.from(counts.keys()).sort();
    const tail = keys.slice(-12);
    const totals = tail.map((k) => counts.get(k)!.total);
    const timelyRates = tail.map((k) => {
      const b = counts.get(k)!;
      return b.total ? (b.timely / b.total) * 100 : 0;
    });
    return { totals, timelyRates };
  }, [filtered]);

  const summary = useMemo(() => {
    const total = filtered.length;
    const timely = filtered.filter((c) => c.timely_response === true).length;
    const timelyRate = total ? (timely / total) * 100 : 0;
    const byProduct = new Map<string, number>();
    for (const c of filtered) byProduct.set(c.product, (byProduct.get(c.product) ?? 0) + 1);
    const topProductEntry = Array.from(byProduct.entries()).sort((a, b) => b[1] - a[1])[0];
    const topProduct = topProductEntry?.[0] ?? '—';
    const topProductShare = total && topProductEntry ? (topProductEntry[1] / total) * 100 : 0;
    // Real QoQ delta: last 3 months vs prior 3 months from the monthly series
    const m = monthlySeries.totals;
    let qoq: number | null = null;
    if (m.length >= 6) {
      const recent = m.slice(-3).reduce((s, v) => s + v, 0);
      const prior = m.slice(-6, -3).reduce((s, v) => s + v, 0);
      if (prior > 0) qoq = ((recent - prior) / prior) * 100;
    }
    // Timely-response trend: last 3 months vs prior 3 months (pp)
    const t = monthlySeries.timelyRates;
    let timelyTrendPp: number | null = null;
    if (t.length >= 6) {
      const recent = t.slice(-3).reduce((s, v) => s + v, 0) / 3;
      const prior = t.slice(-6, -3).reduce((s, v) => s + v, 0) / 3;
      timelyTrendPp = recent - prior;
    }
    return { total, timelyRate, topProduct, topProductShare, qoq, timelyTrendPp };
  }, [filtered, monthlySeries]);

  const recent = useMemo(() => {
    return [...filtered]
      .sort((a, b) => (b.date_received ?? '').localeCompare(a.date_received ?? ''))
      .slice(0, 100);
  }, [filtered]);

  const topicOptions = useMemo(() => {
    return Array.from(new Set(complaints.map((c) => c.topic_cluster).filter(Boolean) as string[])).sort();
  }, [complaints]);

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
      <header className="mb-6 border-b border-[var(--hairline)] pb-4">
        <div className="eyebrow mb-1">Consumer Risk</div>
        <h1 className="font-serif text-3xl font-semibold tracking-tight text-[var(--ink-strong)]">Complaint radar</h1>
        <p className="text-sm text-[var(--ink-muted)] mt-1 max-w-3xl">
          CFPB consumer-complaint flow, attributed to public issuers where the company normalization
          resolved. A leading indicator of regulatory exposure and brand risk.
        </p>
      </header>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <Tile
          label="Complaints · QoQ"
          value={formatNumber(summary.total)}
          delta={summary.qoq}
          deltaSuffix="%"
          deltaInvert
          hint="last 3-mo vs. prior 3-mo"
          sparkValues={monthlySeries.totals}
          sparkStroke="var(--navy-deep)"
        />
        <Tile
          label="Timely response"
          value={`${summary.timelyRate.toFixed(1)}%`}
          tone={summary.timelyRate >= 95 ? 'bull' : summary.timelyRate >= 85 ? 'caution' : 'bear'}
          delta={summary.timelyTrendPp}
          deltaSuffix="pp"
          hint="trailing 3-mo trend"
          sparkValues={monthlySeries.timelyRates}
          sparkStroke={summary.timelyRate >= 95 ? 'var(--bull)' : summary.timelyRate >= 85 ? 'var(--gold)' : 'var(--bear)'}
        />
        <Tile
          label="Top product share"
          value={`${summary.topProductShare.toFixed(0)}%`}
          hint={summary.topProduct}
          tone={summary.topProductShare >= 50 ? 'caution' : 'neutral'}
        />
        <Tile
          label="Issuers in stream"
          value={formatNumber(new Set(filtered.map((c) => c.cik).filter(Boolean)).size)}
          hint="distinct CIKs attributed"
        />
      </div>

      {/* Filter chips */}
      <div className="flex flex-wrap gap-2 mb-6 items-center">
        <Chip label="Product" value={product} options={productOptions} onChange={setProduct} />
        <Chip label="State" value={state} options={stateOptions} onChange={setState} />
        <Chip label="Topic" value={topic} options={topicOptions} onChange={setTopic} />
        {(product || state || topic) && (
          <button
            onClick={() => { setProduct(null); setState(null); setTopic(null); }}
            className="text-xs text-[var(--gold-dim)] hover:text-[var(--ink-strong)] font-medium"
          >
            Clear all
          </button>
        )}
      </div>

      <section className="research-card overflow-hidden mb-6">
        <header className="research-card-header flex items-center justify-between">
          <div>
            <div className="eyebrow">Distribution</div>
            <h2 className="font-serif text-lg font-semibold text-[var(--ink-strong)] mt-0.5">Where the complaint volume concentrates</h2>
            <p className="text-xs text-[var(--ink-muted)] mt-0.5">Topic clusters, ranked by count. Click a bar to filter the stream.</p>
          </div>
          <span className="text-xs text-[var(--ink-soft)] tabular">{topicData.length} clusters</span>
        </header>
        <div className="p-4" style={{ height: Math.max(180, topicData.length * 28 + 40) }}>
          {loading ? (
            <div className="h-full flex items-center justify-center text-sm text-[var(--ink-soft)]">Loading…</div>
          ) : topicData.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={topicData}
                layout="vertical"
                margin={{ top: 4, right: 64, left: 8, bottom: 4 }}
              >
                <CartesianGrid stroke="#ebe6d8" horizontal={false} />
                <XAxis type="number" tick={{ fill: '#6b7280', fontSize: 11 }} stroke="#d9d3c4" axisLine={false} tickLine={false} />
                <YAxis
                  type="category"
                  dataKey="topic"
                  tick={{ fill: '#4b5563', fontSize: 11 }}
                  stroke="#d9d3c4"
                  axisLine={false}
                  tickLine={false}
                  width={170}
                />
                <Tooltip cursor={{ fill: 'rgba(11,37,69,0.04)' }} contentStyle={{ background: '#fff', border: '1px solid #d9d3c4', fontSize: 12 }} />
                <Bar
                  dataKey="count"
                  radius={[0, 2, 2, 0]}
                  onClick={(d: any) => setTopic(d?.topic ?? null)}
                  cursor="pointer"
                  label={{ position: 'right', fill: '#4b5563', fontSize: 11, formatter: (v: number) => formatNumber(v) }}
                  barSize={18}
                >
                  {topicData.map((d, i) => (
                    <Cell key={i} fill={d.topic === topic ? '#b91c1c' : '#0b2545'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-full flex items-center justify-center text-sm text-[var(--ink-soft)]">No complaints match the filters.</div>
          )}
        </div>
      </section>

      <section className="research-card overflow-hidden">
        <header className="research-card-header flex items-center justify-between">
          <div>
            <div className="eyebrow">Stream</div>
            <h2 className="font-serif text-lg font-semibold text-[var(--ink-strong)] mt-0.5">Recent complaints</h2>
          </div>
          <span className="text-xs text-[var(--ink-soft)] tabular">{formatNumber(recent.length)} shown · {formatNumber(filtered.length)} total</span>
        </header>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm tabular">
            <thead className="text-[10px] uppercase tracking-wider text-[var(--ink-soft)] bg-[var(--paper-deep)]">
              <tr>
                <th className="px-4 py-2 text-left font-semibold">Date</th>
                <th className="px-4 py-2 text-left font-semibold">Company</th>
                <th className="px-4 py-2 text-left font-semibold">Product</th>
                <th className="px-4 py-2 text-left font-semibold">Issue</th>
                <th className="px-4 py-2 text-left font-semibold">Sub-issue</th>
                <th className="px-4 py-2 text-left font-semibold">State</th>
                <th className="px-4 py-2 text-right font-semibold">Narrative</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--hairline-soft)]">
              {recent.map((c) => (
                <tr key={c.complaint_id} className="hover:bg-[var(--paper-deep)]">
                  <td className="px-4 py-2 text-[var(--ink)] font-medium">{c.date_received}</td>
                  <td className="px-4 py-2">
                    {c.cik ? (
                      <Link to={`/companies/${encodeURIComponent(c.cik)}`} className="text-[var(--gold-dim)] hover:text-[var(--ink-strong)] font-medium">
                        {c.company_normalized ?? c.company}
                      </Link>
                    ) : (
                      <span className="text-[var(--ink-muted)]">{c.company}</span>
                    )}
                  </td>
                  <td className="px-4 py-2 text-[var(--ink-muted)] text-xs">{c.product}</td>
                  <td className="px-4 py-2 text-[var(--ink-muted)] text-xs">{c.issue}</td>
                  <td className="px-4 py-2 text-[var(--ink-soft)] text-xs">{c.sub_issue ?? '—'}</td>
                  <td className="px-4 py-2 ticker text-[11px] text-[var(--ink-muted)]">{c.state ?? '—'}</td>
                  <td className="px-4 py-2 text-right">
                    {c.has_narrative ? <span className="status-pill gold">Yes</span> : <span className="text-xs text-[var(--ink-soft)]">—</span>}
                  </td>
                </tr>
              ))}
              {recent.length === 0 && !loading && (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center text-sm text-[var(--ink-soft)]">No complaints match the active filters.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function Tile({
  label, value, tone, small, sparkValues, sparkStroke, delta, deltaSuffix = '%', deltaInvert, hint,
}: {
  label: string; value: string; tone?: 'bull' | 'bear' | 'caution' | 'neutral'; small?: boolean;
  sparkValues?: number[]; sparkStroke?: string;
  delta?: number | null; deltaSuffix?: string; deltaInvert?: boolean; hint?: string;
}) {
  const color = tone === 'bull' ? 'var(--bull)' : tone === 'bear' ? 'var(--bear)' : tone === 'caution' ? 'var(--caution)' : 'var(--ink-strong)';
  // For complaint counts, rising is bad: invert color.
  const deltaUp = delta != null && delta >= 0;
  const deltaGood = deltaInvert ? !deltaUp : deltaUp;
  const deltaColor = delta == null ? 'var(--ink-soft)' : deltaGood ? 'var(--bull)' : 'var(--bear)';
  return (
    <div className="quote-tile">
      <div className="quote-tile-label">{label}</div>
      <div className="mt-0.5 flex items-baseline gap-2">
        <div className={`quote-tile-value ${small ? 'text-base' : ''}`} style={{ color, marginTop: 0 }}>{value}</div>
        {delta != null && (
          <span className="text-[11px] font-semibold tabular" style={{ color: deltaColor }}>
            {delta >= 0 ? '+' : ''}{delta.toFixed(1)}{deltaSuffix}
          </span>
        )}
      </div>
      {sparkValues && sparkValues.length >= 2 && (
        <div className="mt-1">
          <Sparkline values={sparkValues} width={120} height={22} stroke={sparkStroke ?? 'var(--gold)'} fill="none" strokeWidth={1.25} />
        </div>
      )}
      {hint && <div className="mt-1 text-[10.5px] text-[var(--ink-soft)] truncate">{hint}</div>}
    </div>
  );
}

function Chip({ label, value, options, onChange }: { label: string; value: string | null; options: string[]; onChange: (v: string | null) => void }) {
  return (
    <label className="inline-flex items-center gap-1.5 text-xs bg-white border border-[var(--hairline)] rounded-sm px-2 py-1">
      <span className="text-[var(--ink-soft)] uppercase font-semibold tracking-wider">{label}</span>
      <select
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value || null)}
        className="bg-transparent text-[var(--ink-strong)] focus:outline-none"
      >
        <option value="">All</option>
        {options.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    </label>
  );
}

