import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, formatCurrencyShort, formatPercent } from '../api/queries';
import * as watchlist from '../watchlist';
import type { Company, RiskBucket } from '../types';

function riskPillClass(bucket: RiskBucket): string {
  switch (bucket) {
    case 'low': return 'bull';
    case 'moderate': return 'neutral';
    case 'elevated': return 'caution';
    case 'high': return 'bear';
  }
}

export default function WatchlistPage() {
  const [ids, setIds] = useState<string[]>([]);
  const [companies, setCompanies] = useState<Record<string, Company>>({});

  useEffect(() => watchlist.subscribe(setIds), []);

  useEffect(() => {
    let cancelled = false;
    api.searchCompanies({ limit: 100000 }).then((r) => {
      if (cancelled) return;
      const m: Record<string, Company> = {};
      for (const c of r.results) m[c.cik] = c;
      setCompanies(m);
    });
    return () => { cancelled = true; };
  }, []);

  const items = ids.map((id) => ({ id, c: companies[id] })).filter((x) => x.c);

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 lg:px-8">
      <header className="mb-6">
        <div className="eyebrow mb-1">Saved</div>
        <h1 className="font-serif text-3xl font-semibold tracking-tight text-[var(--ink-strong)]">Watchlist</h1>
        <p className="text-sm text-[var(--ink-muted)] mt-1">
          {ids.length === 0
            ? "You haven't saved any issuers yet."
            : `${ids.length} ${ids.length === 1 ? 'issuer' : 'issuers'} saved in this browser.`}
        </p>
      </header>

      {ids.length === 0 ? (
        <div className="research-card p-10 text-center border-dashed">
          <div className="font-serif text-lg font-semibold text-[var(--ink-strong)]">Nothing here yet.</div>
          <p className="text-sm text-[var(--ink-muted)] mt-1">
            Open any company and click <strong>"Add to watchlist"</strong> in the hero banner.
          </p>
          <Link
            to="/holdings"
            className="mt-4 inline-block rounded-sm text-white text-sm font-semibold px-4 py-2"
            style={{ background: 'var(--navy-deep)' }}
          >
            Browse holdings
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {items.map(({ id, c }) => {
            const growth = c.revenue_growth_yoy;
            const growthClass = growth === null || growth === undefined
              ? 'text-[var(--ink-soft)]'
              : growth >= 0 ? 'text-[var(--bull)]' : 'text-[var(--bear)]';
            return (
              <Link
                key={id}
                to={`/companies/${encodeURIComponent(id)}`}
                className="block research-card hover:border-[var(--gold)] transition-colors group"
              >
                <div className="px-5 pt-4 pb-3 border-b border-[var(--hairline-soft)] flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="ticker text-sm text-[var(--ink-strong)] truncate">{c.ticker}</div>
                    <div className="mt-1 font-serif font-semibold text-[var(--ink-strong)] truncate group-hover:underline underline-offset-2">
                      {c.name}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={(e) => { e.preventDefault(); e.stopPropagation(); watchlist.remove(id); }}
                    className="text-xs text-[var(--ink-soft)] hover:text-[var(--bear)] shrink-0"
                    aria-label="Remove from watchlist"
                  >
                    ✕
                  </button>
                </div>
                <div className="px-5 py-3 flex items-center justify-between gap-2">
                  <div className="text-xs text-[var(--ink-muted)]">
                    {c.sector ?? '—'}{c.hq_state ? ` · ${c.hq_state}` : ''}
                  </div>
                  <span className={`status-pill ${riskPillClass(c.risk_bucket)}`}>{c.risk_bucket}</span>
                </div>
                <div className="px-5 pb-4 flex items-baseline justify-between">
                  <span className="font-serif text-xl font-semibold text-[var(--ink-strong)] tabular">
                    {formatCurrencyShort(c.market_cap)}
                    <span className="ml-1 text-xs font-sans font-medium text-[var(--ink-soft)]">mkt cap</span>
                  </span>
                  <span className={`text-xs tabular font-semibold ${growthClass}`}>
                    {growth === null || growth === undefined ? '—' : formatPercent(growth)}
                  </span>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
