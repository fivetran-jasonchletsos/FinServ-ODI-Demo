import { useEffect, useMemo, useState } from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import { api, formatNumber, formatPercent } from '../api/queries';
import type { MacroSeries, MacroObservation } from '../types';

const HIGHLIGHTS = ['DGS10', 'T10Y2Y', 'CPIAUCSL', 'FEDFUNDS'];

function categoryColor(cat: MacroSeries['category']): string {
  switch (cat) {
    case 'rates': return '#0b2545';
    case 'inflation': return '#b45309';
    case 'employment': return '#15803d';
    case 'growth': return '#1d4e89';
    case 'sector': return '#b8975c';
    default: return '#6b7280';
  }
}

export default function MacroPage() {
  const [series, setSeries] = useState<MacroSeries[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [observations, setObservations] = useState<MacroObservation[]>([]);
  const [loadingSeries, setLoadingSeries] = useState(true);
  const [loadingObs, setLoadingObs] = useState(false);

  useEffect(() => {
    api.getMacro().then((r) => {
      setSeries(r.series);
      const preferred = r.series.find((s) => s.series_id === 'DGS10') ?? r.series[0];
      if (preferred) setSelectedId(preferred.series_id);
    }).finally(() => setLoadingSeries(false));
  }, []);

  useEffect(() => {
    if (!selectedId) return;
    setLoadingObs(true);
    api.getMacroSeries(selectedId)
      .then((d) => setObservations(d.observations.slice(-60)))
      .catch(() => setObservations([]))
      .finally(() => setLoadingObs(false));
  }, [selectedId]);

  const highlights = useMemo(() => {
    return HIGHLIGHTS
      .map((id) => series.find((s) => s.series_id === id))
      .filter((s): s is MacroSeries => !!s);
  }, [series]);

  const selected = useMemo(
    () => series.find((s) => s.series_id === selectedId),
    [series, selectedId],
  );

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
      <header className="mb-6 border-b border-[var(--hairline)] pb-4">
        <div className="eyebrow mb-1">Macroeconomic</div>
        <h1 className="font-serif text-3xl font-semibold tracking-tight text-[var(--ink-strong)]">Macro briefing</h1>
        <p className="text-sm text-[var(--ink-muted)] mt-1 max-w-3xl">
          Federal Reserve Economic Data (FRED) series materialized in the gold layer. Use these to
          frame the macro backdrop against holdings exposure and sector rollups.
        </p>
      </header>

      {/* Highlight tiles */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-8">
        {loadingSeries
          ? Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="quote-tile animate-pulse">
                <div className="quote-tile-label">Loading…</div>
                <div className="quote-tile-value text-[var(--ink-soft)]">—</div>
              </div>
            ))
          : highlights.map((s) => <HighlightTile key={s.series_id} series={s} onSelect={() => setSelectedId(s.series_id)} active={s.series_id === selectedId} />)}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Series picker */}
        <aside className="lg:col-span-4 research-card overflow-hidden">
          <header className="research-card-header">
            <div className="eyebrow">Series</div>
            <h2 className="font-serif text-base font-semibold text-[var(--ink-strong)] mt-0.5">FRED universe</h2>
          </header>
          <div className="max-h-[28rem] overflow-y-auto divide-y divide-[var(--hairline-soft)]">
            {series.map((s) => (
              <button
                key={s.series_id}
                onClick={() => setSelectedId(s.series_id)}
                className={`w-full text-left px-4 py-3 hover:bg-[var(--paper-deep)] transition-colors ${
                  s.series_id === selectedId ? 'bg-[var(--gold-bg)]' : ''
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="ticker text-[12px] text-[var(--ink-strong)]">{s.series_id}</div>
                    <div className="text-xs text-[var(--ink-muted)] line-clamp-1 mt-0.5">{s.title}</div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="tabular text-sm font-serif font-semibold text-[var(--ink-strong)]">{s.latest_value.toFixed(2)}</div>
                    {s.yoy_change !== null && (
                      <div className={`tabular text-[11px] font-semibold ${s.yoy_change >= 0 ? 'text-[var(--bull)]' : 'text-[var(--bear)]'}`}>
                        {formatPercent(s.yoy_change)}
                      </div>
                    )}
                  </div>
                </div>
              </button>
            ))}
            {series.length === 0 && !loadingSeries && (
              <div className="p-4 text-sm text-[var(--ink-soft)]">No FRED series in snapshot.</div>
            )}
          </div>
        </aside>

        {/* Chart panel */}
        <section className="lg:col-span-8 research-card overflow-hidden">
          <header className="research-card-header flex items-center justify-between gap-4">
            <div className="min-w-0">
              <div className="eyebrow">{selected?.category ?? 'Series'}</div>
              <h2 className="font-serif text-lg font-semibold text-[var(--ink-strong)] mt-0.5 truncate">
                {selected ? selected.title : 'Select a series'}
              </h2>
              <p className="text-xs text-[var(--ink-muted)] mt-0.5">
                {selected ? `${selected.units} · ${selected.frequency} · ${formatNumber(selected.observations_count)} obs` : '—'}
              </p>
            </div>
            {selected && (
              <div className="text-right shrink-0">
                <div className="quote-tile-label">Latest</div>
                <div className="quote-tile-value">{selected.latest_value.toFixed(2)}</div>
                <div className="text-xs text-[var(--ink-muted)] mt-0.5">{selected.latest_date}</div>
              </div>
            )}
          </header>
          <div className="p-4 h-80">
            {loadingObs ? (
              <div className="h-full flex items-center justify-center text-sm text-[var(--ink-soft)]">Loading observations…</div>
            ) : observations.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={observations} margin={{ top: 4, right: 16, left: 0, bottom: 4 }}>
                  <CartesianGrid stroke="#ebe6d8" />
                  <XAxis dataKey="date" tick={{ fill: '#6b7280', fontSize: 11 }} stroke="#d9d3c4" />
                  <YAxis tick={{ fill: '#6b7280', fontSize: 11 }} stroke="#d9d3c4" />
                  <Tooltip contentStyle={{ background: '#fff', border: '1px solid #d9d3c4', fontSize: 12 }} />
                  <Line type="monotone" dataKey="value" stroke="#b8975c" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-sm text-[var(--ink-soft)]">
                {selected ? 'No observations in snapshot for this series.' : 'Pick a series to chart.'}
              </div>
            )}
          </div>
        </section>
      </div>

      {/* Why this matters */}
      <section
        className="mt-8 rounded-sm p-5"
        style={{ background: 'var(--gold-bg)', border: '1px solid #ebd9a3' }}
      >
        <div className="eyebrow mb-2" style={{ color: 'var(--gold-dim)' }}>Research note</div>
        <h3 className="font-serif text-lg font-semibold text-[var(--ink-strong)] mb-2">Why this matters</h3>
        <p className="font-serif text-base leading-relaxed text-[var(--ink)]">
          Rate path and curve shape are the dominant drivers of multiple expansion across the portfolio. A
          persistently inverted 2s10s historically precedes credit-cycle inflection points, weighing
          disproportionately on Financials net-interest margins and on rate-sensitive Real Estate and
          Utilities cash flows. Pair this view with the holdings risk score on the{' '}
          <code className="font-mono text-xs bg-white px-1.5 py-0.5 rounded border border-[var(--hairline)]">/holdings</code> view
          to identify issuers whose composite signal is co-moving with the macro regime.
        </p>
      </section>
    </div>
  );
}

function HighlightTile({ series, onSelect, active }: { series: MacroSeries; onSelect: () => void; active: boolean }) {
  const yoy = series.yoy_change;
  const yoyClass = yoy === null ? 'text-[var(--ink-soft)]' : yoy >= 0 ? 'text-[var(--bull)]' : 'text-[var(--bear)]';
  return (
    <button
      onClick={onSelect}
      className={`quote-tile text-left transition-colors ${active ? 'ring-2 ring-[var(--gold)]' : 'hover:border-[var(--gold)]'}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="quote-tile-label">{series.series_id}</div>
        <span
          className="text-[9px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded-sm"
          style={{ background: '#fff', color: categoryColor(series.category), border: `1px solid ${categoryColor(series.category)}33` }}
        >
          {series.category}
        </span>
      </div>
      <div className="quote-tile-value">{series.latest_value.toFixed(2)}</div>
      <div className="mt-1 flex items-center justify-between text-xs">
        <span className="text-[var(--ink-soft)] truncate">{series.title}</span>
        {yoy !== null && <span className={`font-semibold tabular ${yoyClass}`}>{formatPercent(yoy)}</span>}
      </div>
    </button>
  );
}
