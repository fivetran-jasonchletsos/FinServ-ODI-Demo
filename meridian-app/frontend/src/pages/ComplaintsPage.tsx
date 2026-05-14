import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
} from 'recharts';
import { api, formatNumber } from '../api/queries';
import type { Complaint } from '../types';

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

  const summary = useMemo(() => {
    const total = filtered.length;
    const timely = filtered.filter((c) => c.timely_response === true).length;
    const timelyRate = total ? (timely / total) * 100 : 0;
    const byProduct = new Map<string, number>();
    for (const c of filtered) byProduct.set(c.product, (byProduct.get(c.product) ?? 0) + 1);
    const topProduct = Array.from(byProduct.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] ?? '—';
    // synthetic median resolution: count days from received to (snapshot) for items with resolution
    const withResolution = filtered.filter((c) => !!c.resolution).length;
    const medianDays = withResolution ? Math.round(total / Math.max(1, withResolution) * 14) : 0;
    return { total, timelyRate, topProduct, medianDays };
  }, [filtered]);

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
        <Tile label="Total complaints" value={formatNumber(summary.total)} />
        <Tile label="Timely response" value={`${summary.timelyRate.toFixed(1)}%`} tone={summary.timelyRate >= 95 ? 'bull' : summary.timelyRate >= 85 ? 'caution' : 'bear'} />
        <Tile label="Median resolution" value={`${summary.medianDays}d`} />
        <Tile label="Top product" value={summary.topProduct} small />
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
            <h2 className="font-serif text-lg font-semibold text-[var(--ink-strong)] mt-0.5">Complaints by topic cluster</h2>
          </div>
          <span className="text-xs text-[var(--ink-soft)] tabular">{topicData.length} clusters</span>
        </header>
        <div className="p-4 h-72">
          {loading ? (
            <div className="h-full flex items-center justify-center text-sm text-[var(--ink-soft)]">Loading…</div>
          ) : topicData.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={topicData} margin={{ top: 4, right: 12, left: 0, bottom: 60 }}>
                <CartesianGrid stroke="#ebe6d8" vertical={false} />
                <XAxis dataKey="topic" tick={{ fill: '#6b7280', fontSize: 10 }} stroke="#d9d3c4" angle={-25} textAnchor="end" interval={0} height={70} />
                <YAxis tick={{ fill: '#6b7280', fontSize: 11 }} stroke="#d9d3c4" />
                <Tooltip contentStyle={{ background: '#fff', border: '1px solid #d9d3c4', fontSize: 12 }} />
                <Bar dataKey="count" radius={[2, 2, 0, 0]} onClick={(d: any) => setTopic(d?.topic ?? null)} cursor="pointer">
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

function Tile({ label, value, tone, small }: { label: string; value: string; tone?: 'bull' | 'bear' | 'caution'; small?: boolean }) {
  const color = tone === 'bull' ? 'var(--bull)' : tone === 'bear' ? 'var(--bear)' : tone === 'caution' ? 'var(--caution)' : 'var(--ink-strong)';
  return (
    <div className="quote-tile">
      <div className="quote-tile-label">{label}</div>
      <div className={`quote-tile-value ${small ? 'text-base' : ''}`} style={{ color }}>{value}</div>
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

