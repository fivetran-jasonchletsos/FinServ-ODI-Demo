import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { api, formatCurrencyShort, formatNumber, formatPercent } from '../api/queries';
import type { Company, Sector, RiskBucket } from '../types';

const SECTORS: Sector[] = [
  'Financials', 'Technology', 'Healthcare', 'Consumer Discretionary',
  'Consumer Staples', 'Energy', 'Industrials', 'Materials',
  'Utilities', 'Real Estate', 'Communication Services',
];

const RISK_BUCKETS: RiskBucket[] = ['low', 'moderate', 'elevated', 'high'];

type SortKey = 'mkt_cap' | 'rev_growth' | 'complaints' | 'risk';

const SORT_LABELS: Record<SortKey, string> = {
  mkt_cap: 'Market Cap',
  rev_growth: 'Rev Growth',
  complaints: 'Complaints',
  risk: 'Risk Score',
};

function riskPillClass(bucket: RiskBucket): string {
  switch (bucket) {
    case 'low': return 'bull';
    case 'moderate': return 'neutral';
    case 'elevated': return 'caution';
    case 'high': return 'bear';
  }
}

export default function HoldingsPage() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [q, setQ] = useState(params.get('q') ?? '');
  const [sector, setSector] = useState(params.get('sector') ?? '');
  const [state, setState] = useState(params.get('state') ?? '');
  const [risk, setRisk] = useState(params.get('risk') ?? '');
  const [results, setResults] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);
  const [sort, setSort] = useState<SortKey>('mkt_cap');

  useEffect(() => {
    setLoading(true);
    api
      .searchCompanies({
        q: params.get('q') ?? undefined,
        sector: params.get('sector') ?? undefined,
        state: params.get('state') ?? undefined,
        risk: params.get('risk') ?? undefined,
        limit: 1000,
      })
      .then((r) => setResults(r.results))
      .finally(() => setLoading(false));
  }, [params]);

  const sorted = useMemo(() => {
    const copy = [...results];
    copy.sort((a, b) => {
      if (sort === 'mkt_cap') return (b.market_cap ?? 0) - (a.market_cap ?? 0);
      if (sort === 'rev_growth') return (b.revenue_growth_yoy ?? -Infinity) - (a.revenue_growth_yoy ?? -Infinity);
      if (sort === 'complaints') return b.complaint_velocity - a.complaint_velocity;
      return b.risk_score - a.risk_score;
    });
    return copy;
  }, [results, sort]);

  const applyFilters = (e: React.FormEvent) => {
    e.preventDefault();
    const next: Record<string, string> = {};
    if (q.trim()) next.q = q.trim();
    if (sector) next.sector = sector;
    if (state.trim()) next.state = state.trim();
    if (risk) next.risk = risk;
    setParams(next);
  };

  const clearFilters = () => {
    setQ(''); setSector(''); setState(''); setRisk('');
    setParams({});
  };

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
      <div className="flex items-end justify-between mb-6 border-b border-[var(--hairline)] pb-4">
        <div>
          <div className="eyebrow mb-1">Equity Universe</div>
          <h1 className="font-serif text-3xl font-semibold tracking-tight text-[var(--ink-strong)]">Holdings</h1>
          <p className="text-sm text-[var(--ink-muted)] mt-1 max-w-2xl">
            Search the{' '}
            <code className="font-mono text-xs bg-[var(--paper-deep)] px-1.5 py-0.5 rounded border border-[var(--hairline)]">gold.dim_companies</code>{' '}
            mart joined with{' '}
            <code className="font-mono text-xs bg-[var(--paper-deep)] px-1.5 py-0.5 rounded border border-[var(--hairline)]">gold.fct_company_risk_signal</code>{' '}
            for cross-source risk and growth metrics.
          </p>
        </div>
        <div className="text-sm text-[var(--ink-soft)] tabular shrink-0">
          {loading ? 'Searching…' : (
            <>
              <span className="font-serif font-semibold text-xl text-[var(--ink-strong)]">{sorted.length}</span>{' '}
              {sorted.length === 1 ? 'issuer' : 'issuers'}
            </>
          )}
        </div>
      </div>

      <form onSubmit={applyFilters} className="research-card p-4 grid grid-cols-1 md:grid-cols-12 gap-3 mb-6">
        <div className="md:col-span-4">
          <label className="block text-[10px] font-semibold text-[var(--ink-soft)] uppercase tracking-wider mb-1">Ticker · Name · CIK</label>
          <input
            type="text"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="e.g. JPM"
            className="w-full rounded-sm border border-[var(--hairline)] bg-white px-3 py-2 text-sm focus:border-[var(--gold)] focus:outline-none"
          />
        </div>
        <div className="md:col-span-3">
          <label className="block text-[10px] font-semibold text-[var(--ink-soft)] uppercase tracking-wider mb-1">Sector</label>
          <select
            value={sector}
            onChange={(e) => setSector(e.target.value)}
            className="w-full rounded-sm border border-[var(--hairline)] bg-white px-3 py-2 text-sm focus:border-[var(--gold)] focus:outline-none"
          >
            <option value="">All sectors</option>
            {SECTORS.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <div className="md:col-span-1">
          <label className="block text-[10px] font-semibold text-[var(--ink-soft)] uppercase tracking-wider mb-1">State</label>
          <input
            type="text"
            value={state}
            onChange={(e) => setState(e.target.value.toUpperCase())}
            placeholder="CA"
            maxLength={2}
            className="w-full rounded-sm border border-[var(--hairline)] bg-white px-3 py-2 text-sm uppercase font-mono focus:border-[var(--gold)] focus:outline-none"
          />
        </div>
        <div className="md:col-span-2">
          <label className="block text-[10px] font-semibold text-[var(--ink-soft)] uppercase tracking-wider mb-1">Risk</label>
          <select
            value={risk}
            onChange={(e) => setRisk(e.target.value)}
            className="w-full rounded-sm border border-[var(--hairline)] bg-white px-3 py-2 text-sm focus:border-[var(--gold)] focus:outline-none"
          >
            <option value="">Any</option>
            {RISK_BUCKETS.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
        </div>
        <div className="md:col-span-2 flex items-end gap-2">
          <button
            type="submit"
            className="flex-1 rounded-sm text-white text-sm font-semibold px-4 py-2"
            style={{ background: 'var(--navy-deep)' }}
          >
            Apply
          </button>
          <button
            type="button"
            onClick={clearFilters}
            className="rounded-sm border border-[var(--hairline)] hover:bg-[var(--paper-deep)] text-[var(--ink-muted)] text-sm px-3 py-2"
          >
            Clear
          </button>
        </div>
      </form>

      <div className="flex items-center justify-between mb-3">
        <div className="text-[10px] font-semibold text-[var(--ink-soft)] uppercase tracking-wider">Sort by</div>
        <div className="inline-flex gap-0.5 rounded-sm border border-[var(--hairline)] bg-white p-0.5 text-xs">
          {(Object.keys(SORT_LABELS) as SortKey[]).map((key) => (
            <button
              key={key}
              onClick={() => setSort(key)}
              className={`px-3 py-1.5 rounded font-medium ${sort === key ? 'bg-[var(--paper-deep)] text-[var(--ink-strong)]' : 'text-[var(--ink-soft)] hover:text-[var(--ink)]'}`}
            >
              {SORT_LABELS[key]} ↓
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="research-card p-12 text-center text-[var(--ink-soft)]">Loading…</div>
      ) : sorted.length === 0 ? (
        <div className="research-card p-12 text-center">
          <div className="text-[var(--ink-strong)] font-medium">No holdings match your filters.</div>
          <button onClick={clearFilters} className="mt-3 text-sm text-[var(--gold-dim)] hover:text-[var(--ink-strong)] font-medium">
            Clear filters →
          </button>
        </div>
      ) : (
        <div className="research-card overflow-x-auto">
          <table className="min-w-full text-sm tabular">
            <thead className="bg-[var(--paper-deep)] border-b border-[var(--hairline)]">
              <tr>
                <Th>Ticker</Th>
                <Th>Name</Th>
                <Th>Sector</Th>
                <Th align="right">Mkt Cap</Th>
                <Th align="right">Rev YoY</Th>
                <Th align="right">Complaints/Q</Th>
                <Th align="right">Risk</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--hairline-soft)]">
              {sorted.map((c) => {
                const growth = c.revenue_growth_yoy;
                const growthClass = growth === null || growth === undefined
                  ? 'text-[var(--ink-soft)]'
                  : growth >= 0 ? 'text-[var(--bull)]' : 'text-[var(--bear)]';
                return (
                  <tr
                    key={c.cik}
                    onClick={() => navigate(`/companies/${encodeURIComponent(c.cik)}`)}
                    className="cursor-pointer hover:bg-[var(--paper-deep)] transition-colors"
                  >
                    <td className="px-4 py-2.5 ticker text-[var(--ink-strong)]">{c.ticker}</td>
                    <td className="px-4 py-2.5">
                      <div className="font-serif font-semibold text-[var(--ink-strong)]">{c.name}</div>
                      <div className="text-[10px] text-[var(--ink-soft)] font-mono">CIK {c.cik}</div>
                    </td>
                    <td className="px-4 py-2.5 text-[var(--ink-muted)] text-xs">{c.sector ?? '—'}</td>
                    <td className="px-4 py-2.5 text-right font-semibold text-[var(--ink-strong)]">{formatCurrencyShort(c.market_cap)}</td>
                    <td className={`px-4 py-2.5 text-right font-semibold ${growthClass}`}>
                      {growth === null || growth === undefined ? '—' : (
                        <span className="inline-flex items-center gap-0.5">
                          <span aria-hidden>{growth >= 0 ? '▲' : '▼'}</span>
                          {formatPercent(growth)}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-right text-[var(--ink)]">{formatNumber(c.complaint_velocity)}</td>
                    <td className="px-4 py-2.5 text-right">
                      <span className={`status-pill ${riskPillClass(c.risk_bucket)}`}>{c.risk_score.toFixed(0)} · {c.risk_bucket}</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
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
