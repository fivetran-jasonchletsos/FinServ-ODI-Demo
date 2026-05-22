// Dark "Replication pipelines" monitoring card — one row per Fivetran
// connector, with throughput + lag sparklines, status pill, and current
// values. Designed to live above the existing per-layer cards on the
// Pipeline tab as the at-a-glance summary.

import { useEffect, useMemo, useState } from 'react';

export interface PipelineMetricsSeries {
  points: number[];
  current: number;
  min: number;
  max: number;
}

export interface PipelineRow {
  id: string;
  name: string;
  schema: string;
  service: string | null;
  sync_state: string | null;
  failed_at: string | null;
  paused: boolean | null;
  fivetran_id?: string;
  dashboard_url: string;
  // Destination this connector replicates into.
  destination: string;
  // New optional metrics fields populated by build_pipeline_status.py.
  source_db?: string;
  rows_synced_total?: number;
  throughput_24h?: PipelineMetricsSeries;
  lag_24h?: PipelineMetricsSeries;
}

type Health = 'healthy' | 'degraded' | 'failing';

const COLORS: Record<Health, { text: string; bg: string; stroke: string; dot: string }> = {
  healthy:  { text: '#4ade80', bg: 'rgba(34,197,94,0.16)',  stroke: '#22c55e', dot: '#22c55e' },
  degraded: { text: '#fbbf24', bg: 'rgba(245,158,11,0.18)', stroke: '#f59e0b', dot: '#f59e0b' },
  failing:  { text: '#f87171', bg: 'rgba(239,68,68,0.18)',  stroke: '#ef4444', dot: '#ef4444' },
};

function deriveHealth(row: PipelineRow): Health {
  if (row.sync_state === 'failed' || row.failed_at) return 'failing';
  if (row.paused) return 'degraded';
  // Threshold tuning: if lag has been climbing or throughput tanked, call it degraded.
  const lag = row.lag_24h;
  if (lag && lag.current >= 60 && lag.current >= lag.min * 5) return 'degraded';
  const t = row.throughput_24h;
  if (t && t.current < t.max * 0.25 && t.max > 0) return 'degraded';
  return 'healthy';
}

function formatRows(n: number | undefined): string {
  if (!n) return '—';
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1)}B rows`;
  if (n >= 1_000_000)     return `${(n / 1_000_000).toFixed(0)}M rows`;
  if (n >= 1_000)         return `${(n / 1_000).toFixed(1)}k rows`;
  return `${n} rows`;
}

function formatThroughput(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)     return `${(n / 1_000).toFixed(1)}k`;
  return `${Math.round(n)}`;
}

function formatLag(seconds: number): string {
  if (seconds >= 3600)  return `${(seconds / 3600).toFixed(1)}h`;
  if (seconds >= 60)    return `${Math.round(seconds / 60)}m`;
  if (seconds < 10)     return `${seconds.toFixed(1)}s`;
  return `${Math.round(seconds)}s`;
}

function deriveSourceDb(service: string | null): string {
  if (!service) return 'unknown';
  const s = service.toLowerCase();
  if (s === 'connector_sdk') return 'custom python';
  if (s.includes('postgres')) return 'postgres CDC';
  if (s.includes('mysql'))    return 'mysql CDC';
  if (s.includes('kafka'))    return 'kafka';
  return s.replace(/_/g, ' ');
}

// Compact dark-theme inline-SVG sparkline. Stroke + fill use the row's
// health color. Last-point dot shows current state. Values < 2 render as
// a horizontal baseline (so an empty/short series doesn't break layout).
function DarkSparkline({
  values,
  color,
  width = 140,
  height = 32,
}: {
  values: number[];
  color: string;
  width?: number;
  height?: number;
}) {
  if (!values || values.length < 2) {
    return (
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
        <line x1={2} x2={width - 2} y1={height / 2} y2={height / 2}
              stroke={color} strokeOpacity={0.5} strokeWidth={1} strokeDasharray="3 3" />
      </svg>
    );
  }
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const pad = 3;
  const w = width - pad * 2;
  const h = height - pad * 2;
  const pts = values.map((v, i) => {
    const x = pad + (i / (values.length - 1)) * w;
    const y = pad + h - ((v - min) / span) * h;
    return [x, y] as const;
  });
  const path = pts.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)} ${y.toFixed(1)}`).join(' ');
  const fillPath = `${path} L${pts[pts.length - 1][0].toFixed(1)} ${(height - pad).toFixed(1)} L${pts[0][0].toFixed(1)} ${(height - pad).toFixed(1)} Z`;
  const last = pts[pts.length - 1];
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="overflow-visible">
      <path d={fillPath} fill={color} opacity={0.10} />
      <path d={path} fill="none" stroke={color} strokeWidth={1.4} strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={last[0]} cy={last[1]} r={2} fill={color} />
    </svg>
  );
}

// Destination "logo" — a small monochrome glyph. Avoids vendor-logo licensing
// concerns and keeps the row visually compact.
function DestinationGlyph({ name }: { name: string }) {
  const initial = (name || '?').trim().charAt(0).toUpperCase();
  return (
    <span
      className="inline-flex items-center justify-center rounded w-4 h-4 text-[9px] font-bold mx-1.5"
      style={{ background: 'rgba(255,255,255,0.06)', color: '#cbd5e1' }}
      aria-hidden="true"
    >
      {initial}
    </span>
  );
}

export default function ReplicationPipelinesCard({
  pipelines,
  refreshSeconds = 30,
  onRefresh,
}: {
  pipelines: PipelineRow[];
  refreshSeconds?: number;
  onRefresh?: () => void;
}) {
  const [countdown, setCountdown] = useState(refreshSeconds);

  useEffect(() => {
    if (!onRefresh) return;
    const tick = setInterval(() => {
      setCountdown((c) => {
        if (c <= 1) {
          onRefresh();
          return refreshSeconds;
        }
        return c - 1;
      });
    }, 1000);
    return () => clearInterval(tick);
  }, [refreshSeconds, onRefresh]);

  const rows = useMemo(() => pipelines.map((p) => ({ row: p, health: deriveHealth(p) })), [pipelines]);

  return (
    <section
      className="rounded-xl px-6 py-5 shadow-lg"
      style={{ background: '#171717', color: '#f5f5f4', border: '1px solid rgba(255,255,255,0.06)' }}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-6 mb-5">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-semibold tracking-tight">Replication pipelines</h2>
            <span
              className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded"
              style={{ background: 'rgba(255,255,255,0.06)', color: '#a3a3a3', border: '1px solid rgba(255,255,255,0.08)' }}
              title="Throughput and lag are illustrative — real-time metrics require the Fivetran Platform Connector landing log tables in your warehouse."
            >
              illustrative metrics
            </span>
          </div>
          <p className="text-sm mt-1" style={{ color: '#a3a3a3' }}>
            Last 24 hours
            {onRefresh && (
              <>
                {' · '}
                <span title={`Next refresh in ${countdown}s`}>auto-refresh {refreshSeconds}s</span>
              </>
            )}
          </p>
        </div>
        <div className="text-right shrink-0">
          <div className="text-2xl font-semibold tabular-nums leading-none">{pipelines.length}</div>
          <div className="text-xs uppercase tracking-wider mt-1" style={{ color: '#a3a3a3' }}>
            {pipelines.length === 1 ? 'pipeline' : 'pipelines'}
          </div>
        </div>
      </div>

      {/* Column headers */}
      <div
        className="grid items-center gap-4 px-2 py-2 text-[11px] uppercase tracking-wider"
        style={{
          gridTemplateColumns: 'minmax(220px,1.4fr) 110px minmax(190px,1fr) minmax(170px,1fr)',
          color: '#737373',
          borderBottom: '1px solid rgba(255,255,255,0.06)',
        }}
      >
        <div>Pipeline</div>
        <div>Status</div>
        <div>Throughput (rows/s)</div>
        <div>Lag (s)</div>
      </div>

      {/* Rows */}
      <div className="divide-y" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
        {rows.length === 0 && (
          <div className="px-2 py-8 text-center text-sm" style={{ color: '#737373' }}>
            No pipelines configured.
          </div>
        )}
        {rows.map(({ row, health }) => {
          const palette = COLORS[health];
          const sourceDb = row.source_db || deriveSourceDb(row.service);
          const rowsTotal = formatRows(row.rows_synced_total);
          const t = row.throughput_24h;
          const l = row.lag_24h;
          return (
            <div
              key={row.id}
              className="grid items-center gap-4 px-2 py-4"
              style={{
                gridTemplateColumns: 'minmax(220px,1.4fr) 110px minmax(190px,1fr) minmax(170px,1fr)',
                borderTopColor: 'rgba(255,255,255,0.06)',
              }}
            >
              {/* Pipeline */}
              <div className="min-w-0">
                <a
                  href={row.dashboard_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center text-[15px] font-semibold leading-tight hover:underline"
                  style={{ color: '#f5f5f4' }}
                >
                  <span className="truncate">{row.schema || row.id}</span>
                  <DestinationGlyph name={row.destination} />
                  <span style={{ color: '#a3a3a3' }} className="truncate">{row.destination.toLowerCase()}</span>
                </a>
                <div className="text-[12px] mt-1" style={{ color: '#737373' }}>
                  {sourceDb} · {rowsTotal}
                </div>
              </div>

              {/* Status pill */}
              <div>
                <span
                  className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium"
                  style={{ background: palette.bg, color: palette.text }}
                >
                  <span
                    className="inline-block w-1.5 h-1.5 rounded-full"
                    style={{ background: palette.dot }}
                  />
                  {health}
                </span>
              </div>

              {/* Throughput */}
              <div className="flex items-center gap-3">
                <DarkSparkline values={t?.points ?? []} color={palette.stroke} />
                <div className="text-right shrink-0">
                  <div className="text-[15px] font-semibold tabular-nums leading-none">
                    {t ? formatThroughput(t.current) : '—'}
                  </div>
                  <div className="text-[11px] mt-1 tabular-nums" style={{ color: '#737373' }}>
                    {t ? `${formatThroughput(t.min)} – ${formatThroughput(t.max)}` : ''}
                  </div>
                </div>
              </div>

              {/* Lag */}
              <div className="flex items-center gap-3">
                <DarkSparkline values={l?.points ?? []} color={palette.stroke} />
                <div className="text-right shrink-0">
                  <div className="text-[15px] font-semibold tabular-nums leading-none">
                    {l ? formatLag(l.current) : '—'}
                  </div>
                  <div className="text-[11px] mt-1 tabular-nums" style={{ color: '#737373' }}>
                    {l ? `${formatLag(l.min)} – ${formatLag(l.max)}` : ''}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
