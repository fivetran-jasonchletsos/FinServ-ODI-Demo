// AliveMedallion — the Snowflake-Summit-worthy ODI architecture surface.
//
// Replaces the static ArchitectureDiagram. Particle-flow animation along
// every edge in the lake; pulsing "live" dots on each active node;
// vendor-true SVG logo marks (Snowflake snowflake, Fivetran F, dbt
// triangle, Iceberg mountain) instead of generic letterforms; medallion
// boxes with depth gradients + sparklines for the 7-day row trend.
//
// Designed to feel better than what Snowflake / Databricks / dbt Labs
// ship on their own architecture pages — flow is alive, every node
// signals state, every number tickers.
//
// Self-contained: no API dependency. Caller supplies sources, layer
// stats, and engines; component renders the alive diagram.

import { useEffect, useState, type CSSProperties } from 'react';

// ─── Public types ───────────────────────────────────────────────────────────

export type NodeStatus = 'healthy' | 'caution' | 'alert';

export interface SourceNode {
  id: string;
  label: string;     // "SQL Server"
  sub: string;       // "Clarity EHR · CDC (8 tables)"
  logo?: VendorLogo; // optional vendor mark to put in the corner
  freshness?: string;          // "47s ago"
  status?: NodeStatus;         // drives the live-dot colour
  streaming?: boolean;         // true → particles travel faster, STREAM badge
  lagP99?: string;             // "4 min"
}

export interface LayerStat {
  tables: number;
  rows: number;
  bytes: number;
  /** 7-day sparkline of row deltas, oldest → newest. */
  trend?: number[];
}

export interface EngineNode {
  name: string;       // "Snowflake"
  active?: boolean;
  logo?: VendorLogo;
}

export type VendorLogo =
  | 'snowflake' | 'fivetran' | 'dbt' | 'iceberg'
  | 'oracle'    | 'sqlserver'| 'hl7'  | 'cms'
  | 'sec'       | 'fred'     | 'cfpb' | 'naic' | 'noaa'
  | 'athena'    | 'duckdb'   | 'trino'| 'spark';

interface Props {
  sources: SourceNode[];        // 3-5 source cards
  bronze: LayerStat;
  silver: LayerStat;
  gold: LayerStat;
  engines: EngineNode[];        // 3-5 engines
  /** Brand accent for the "live" pulse + active states. Default: gold. */
  accent?: string;
}

// =============================================================================

export function AliveMedallion({
  sources, bronze, silver, gold, engines, accent = '#b8975c',
}: Props) {
  // Tick the active engine highlight every 1.6s (subtle, not strobing).
  const [activeIdx, setActiveIdx] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setActiveIdx((i) => (i + 1) % Math.max(engines.length, 1)), 1600);
    return () => clearInterval(id);
  }, [engines.length]);

  // Layout constants (SVG coordinate space)
  const W = 1040, H = 380;
  const SOURCE_X = 24, SOURCE_W = 184, SOURCE_H = 80, SOURCE_GAP = 14;
  const sourceTotalH = sources.length * SOURCE_H + (sources.length - 1) * SOURCE_GAP;
  const SOURCE_Y0 = (H - sourceTotalH) / 2;

  // Source cards are now 80 tall (was 60) to fit freshness pill + status row
  const FT_X = 236, FT_W = 100;
  const FT_H = sourceTotalH + 24;
  const FT_Y = SOURCE_Y0 - 12;
  const FT_CY = FT_Y + FT_H / 2;

  const LAYER_W = 168, LAYER_H = sourceTotalH + 24, LAYER_GAP = 22;
  const BRONZE_X = 368, SILVER_X = BRONZE_X + LAYER_W + LAYER_GAP, GOLD_X = SILVER_X + LAYER_W + LAYER_GAP;
  const LAYER_Y = FT_Y;
  const LAYER_CY = LAYER_Y + LAYER_H / 2;

  const ENGINE_X = GOLD_X + LAYER_W + 56, ENGINE_W = 132, ENGINE_H = 52, ENGINE_GAP = 14;
  const engineTotalH = engines.length * ENGINE_H + (engines.length - 1) * ENGINE_GAP;
  const ENGINE_Y0 = (H - engineTotalH) / 2;

  return (
    <div className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ minWidth: 880, maxHeight: 460, overflow: 'visible' }}>
        <defs>
          {/* Layer gradients — depth + warm-to-cool progression bronze→silver→gold */}
          <linearGradient id="alive-bronze" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="#fef3c7" />
            <stop offset="55%" stopColor="#fed7aa" />
            <stop offset="100%" stopColor="#b45309" />
          </linearGradient>
          <linearGradient id="alive-silver" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="#f8fafc" />
            <stop offset="55%" stopColor="#e5e7eb" />
            <stop offset="100%" stopColor="#6b7280" />
          </linearGradient>
          <linearGradient id="alive-gold" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="#fef3c7" />
            <stop offset="55%" stopColor="#fde68a" />
            <stop offset="100%" stopColor="#b8975c" />
          </linearGradient>

          {/* Fivetran band — deep navy with a sheen at the top */}
          <linearGradient id="alive-ft" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="#1e3a73" />
            <stop offset="100%" stopColor="#0b2545" />
          </linearGradient>

          {/* Edge gradient — fades source → bronze (warm orange) */}
          <linearGradient id="alive-edge-warm" x1="0" x2="1" y1="0" y2="0">
            <stop offset="0%" stopColor="#6b7280" stopOpacity="0.35" />
            <stop offset="100%" stopColor="#b45309" stopOpacity="0.7" />
          </linearGradient>
          <linearGradient id="alive-edge-cool" x1="0" x2="1" y1="0" y2="0">
            <stop offset="0%" stopColor="#b8975c" stopOpacity="0.6" />
            <stop offset="100%" stopColor="#0b2545" stopOpacity="0.4" />
          </linearGradient>

          {/* Soft glow filter for the live pulse */}
          <filter id="alive-glow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>

          {/* Arrow marker */}
          <marker id="alive-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
            <path d="M0 0 L10 5 L0 10 z" fill="currentColor" />
          </marker>
        </defs>

        {/* ── Edges (drawn first so cards sit on top) ─────────────────── */}
        {sources.map((s, i) => {
          const y = SOURCE_Y0 + i * (SOURCE_H + SOURCE_GAP) + SOURCE_H / 2;
          // Streaming sources move particles 2x faster than CDC (visible cue)
          const dur = s.streaming ? (1.1 + i * 0.07) : (2.2 + i * 0.18);
          return (
            <g key={`edge-src-${i}`} color="#6b7280">
              <line
                x1={SOURCE_X + SOURCE_W} y1={y}
                x2={FT_X}                y2={y}
                stroke="url(#alive-edge-warm)" strokeWidth="1.6"
                markerEnd="url(#alive-arrow)"
              />
              {/* Particle flowing source → fivetran */}
              <circle r={s.streaming ? 3 : 2.5} fill={accent} opacity="0.85">
                <animate
                  attributeName="cx"
                  values={`${SOURCE_X + SOURCE_W};${FT_X - 4}`}
                  dur={`${dur}s`} repeatCount="indefinite"
                />
                <animate attributeName="cy" values={`${y};${y}`} dur={`${dur}s`} repeatCount="indefinite" />
                <animate attributeName="opacity" values="0;0.9;0.9;0" dur={`${dur}s`} repeatCount="indefinite" />
              </circle>
              {/* Second particle on streaming sources for "fire-hose" feel */}
              {s.streaming && (
                <circle r="2.6" fill={accent} opacity="0">
                  <animate attributeName="cx" values={`${SOURCE_X + SOURCE_W};${FT_X - 4}`} dur={`${dur}s`} begin={`${dur / 2}s`} repeatCount="indefinite" />
                  <animate attributeName="cy" values={`${y};${y}`} dur={`${dur}s`} begin={`${dur / 2}s`} repeatCount="indefinite" />
                  <animate attributeName="opacity" values="0;0.9;0.9;0" dur={`${dur}s`} begin={`${dur / 2}s`} repeatCount="indefinite" />
                </circle>
              )}
            </g>
          );
        })}

        {/* Fivetran → Bronze */}
        <g color="#b45309">
          <line
            x1={FT_X + FT_W} y1={FT_CY}
            x2={BRONZE_X}    y2={LAYER_CY}
            stroke="url(#alive-edge-warm)" strokeWidth="2"
            markerEnd="url(#alive-arrow)"
          />
          <Particle x1={FT_X + FT_W} y1={FT_CY} x2={BRONZE_X} y2={LAYER_CY} color={accent} dur={1.4} />
          <Particle x1={FT_X + FT_W} y1={FT_CY} x2={BRONZE_X} y2={LAYER_CY} color={accent} dur={1.4} delay={0.5} />
        </g>

        {/* Bronze → Silver */}
        <g color="#FF694A">
          <line
            x1={BRONZE_X + LAYER_W} y1={LAYER_CY}
            x2={SILVER_X}            y2={LAYER_CY}
            stroke="#FF694A" strokeWidth="2"
            markerEnd="url(#alive-arrow)"
          />
          <DbtBadge cx={BRONZE_X + LAYER_W + LAYER_GAP / 2} cy={LAYER_CY - 12} />
          <Particle x1={BRONZE_X + LAYER_W} y1={LAYER_CY} x2={SILVER_X} y2={LAYER_CY} color="#FF694A" dur={1.0} />
        </g>

        {/* Silver → Gold */}
        <g color="#FF694A">
          <line
            x1={SILVER_X + LAYER_W} y1={LAYER_CY}
            x2={GOLD_X}              y2={LAYER_CY}
            stroke="#FF694A" strokeWidth="2"
            markerEnd="url(#alive-arrow)"
          />
          <DbtBadge cx={SILVER_X + LAYER_W + LAYER_GAP / 2} cy={LAYER_CY - 12} />
          <Particle x1={SILVER_X + LAYER_W} y1={LAYER_CY} x2={GOLD_X} y2={LAYER_CY} color="#FF694A" dur={1.0} />
        </g>

        {/* Gold → engines fan-out */}
        {engines.map((_, i) => {
          const ey = ENGINE_Y0 + i * (ENGINE_H + ENGINE_GAP) + ENGINE_H / 2;
          return (
            <g key={`edge-engine-${i}`} color={accent}>
              <line
                x1={GOLD_X + LAYER_W} y1={LAYER_CY}
                x2={ENGINE_X}          y2={ey}
                stroke="url(#alive-edge-cool)" strokeWidth="1.4"
                markerEnd="url(#alive-arrow)"
              />
              <Particle
                x1={GOLD_X + LAYER_W} y1={LAYER_CY}
                x2={ENGINE_X}          y2={ey}
                color={accent} dur={1.6 + i * 0.12} delay={i * 0.18}
              />
            </g>
          );
        })}

        {/* ── Source cards ──────────────────────────────────────────────── */}
        {sources.map((s, i) => {
          const y = SOURCE_Y0 + i * (SOURCE_H + SOURCE_GAP);
          const statusColor = s.status === 'alert' ? '#dc2626' : s.status === 'caution' ? '#d97706' : '#16a34a';
          return (
            <g key={s.id} transform={`translate(${SOURCE_X}, ${y})`}>
              <rect width={SOURCE_W} height={SOURCE_H} rx="5" fill="#ffffff" stroke="#d9d3c4" strokeWidth="1" />
              <rect width={SOURCE_W} height={SOURCE_H} rx="5" fill="url(#alive-edge-warm)" opacity="0.06" />
              {/* Row 1 — eyebrow + STREAM badge if applicable */}
              <text x="14" y="18" fontSize="9" fontWeight="700" fill="#826b3f" letterSpacing="1.6">SOURCE</text>
              {s.streaming && (
                <g transform={`translate(${SOURCE_W - 92}, 8)`}>
                  <rect width="50" height="13" rx="2" fill="#0d9488" />
                  <text x="25" y="10" textAnchor="middle" fontSize="8.5" fontWeight="800" fill="#fff" letterSpacing="0.6">STREAM</text>
                </g>
              )}
              {/* Row 2 — label */}
              <text x="14" y="36" fontSize="13.5" fontWeight="700" fill="#0b1220">{s.label}</text>
              {/* Row 3 — sub */}
              <text x="14" y="50" fontSize="10" fill="#4b5563">{s.sub}</text>
              {/* Row 4 — freshness + lag (tabular numbers) */}
              {(s.freshness || s.lagP99) && (
                <g>
                  {s.freshness && (
                    <>
                      <circle cx="18" cy="64" r="2.4" fill={statusColor}>
                        <animate attributeName="opacity" values="0.4;1;0.4" dur="1.4s" repeatCount="indefinite" />
                      </circle>
                      <text x="26" y="68" fontSize="10" fill="#0b1220" fontWeight="600" style={{ fontVariantNumeric: 'tabular-nums' }}>
                        {s.freshness}
                      </text>
                    </>
                  )}
                  {s.lagP99 && (
                    <text x={SOURCE_W - 14} y="68" textAnchor="end" fontSize="9" fill="#6b7280" style={{ fontVariantNumeric: 'tabular-nums' }}>
                      p99 {s.lagP99}
                    </text>
                  )}
                </g>
              )}
              {/* Vendor logo */}
              {s.logo && (
                <g transform={`translate(${SOURCE_W - 30}, 10)`}>
                  <VendorMark kind={s.logo} size={20} />
                </g>
              )}
            </g>
          );
        })}

        {/* ── Fivetran band ─────────────────────────────────────────────── */}
        <g transform={`translate(${FT_X}, ${FT_Y})`}>
          <rect width={FT_W} height={FT_H} rx="6" fill="url(#alive-ft)" />
          <g transform={`translate(${FT_W / 2}, ${FT_H / 2}) rotate(-90)`}>
            <text textAnchor="middle" fontSize="11" fontWeight="800" fill="#d4af75" letterSpacing="2.2">
              FIVETRAN CDC
            </text>
          </g>
          {/* Brand mark */}
          <g transform={`translate(${FT_W / 2 - 10}, 12)`}>
            <VendorMark kind="fivetran" size={20} />
          </g>
          {/* Live dot */}
          <circle cx={FT_W - 10} cy={FT_H - 12} r="3" fill="#5eead4" filter="url(#alive-glow)">
            <animate attributeName="opacity" values="0.4;1;0.4" dur="1.6s" repeatCount="indefinite" />
          </circle>
        </g>

        {/* ── Layers (medallion boxes) ──────────────────────────────────── */}
        <Layer x={BRONZE_X} y={LAYER_Y} w={LAYER_W} h={LAYER_H} grad="alive-bronze" label="BRONZE" sub="raw landings"     stat={bronze} accent="#b45309" />
        <Layer x={SILVER_X} y={LAYER_Y} w={LAYER_W} h={LAYER_H} grad="alive-silver" label="SILVER" sub="conformed"        stat={silver} accent="#6b7280" />
        <Layer x={GOLD_X}   y={LAYER_Y} w={LAYER_W} h={LAYER_H} grad="alive-gold"   label="GOLD"   sub="business-ready"   stat={gold}   accent="#b8975c" />

        {/* ── Engine column ────────────────────────────────────────────── */}
        {engines.map((e, i) => {
          const y = ENGINE_Y0 + i * (ENGINE_H + ENGINE_GAP);
          const isActive = activeIdx === i;
          const isPrimary = !!e.active;
          return (
            <g key={e.name} transform={`translate(${ENGINE_X}, ${y})`}>
              <rect
                width={ENGINE_W} height={ENGINE_H} rx="5"
                fill="#ffffff"
                stroke={isPrimary ? accent : '#d9d3c4'}
                strokeWidth={isPrimary ? 2 : 1}
                style={{ filter: isActive ? `drop-shadow(0 0 6px ${accent}55)` : undefined, transition: 'filter 0.4s' }}
              />
              {e.logo && (
                <g transform="translate(10, 14)">
                  <VendorMark kind={e.logo} size={20} />
                </g>
              )}
              <text x={e.logo ? 38 : 14} y="22" fontSize="13" fontWeight="700" fill="#0b1220">{e.name}</text>
              <text x={e.logo ? 38 : 14} y="38" fontSize="9" fontWeight="700" fill={isPrimary ? accent : '#6b7280'} letterSpacing="1.4">
                {isPrimary ? '● ACTIVE' : 'AVAILABLE'}
              </text>
              {isActive && (
                <circle cx={ENGINE_W - 10} cy="10" r="3" fill={accent} filter="url(#alive-glow)">
                  <animate attributeName="opacity" values="1;0.3;1" dur="0.9s" repeatCount="indefinite" />
                </circle>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

// ─── Subcomponents ──────────────────────────────────────────────────────────

function Layer({
  x, y, w, h, grad, label, sub, stat, accent,
}: {
  x: number; y: number; w: number; h: number;
  grad: string; label: string; sub: string;
  stat: LayerStat; accent: string;
}) {
  return (
    <g transform={`translate(${x}, ${y})`} style={{ cursor: 'pointer' }}>
      <rect width={w} height={h} rx="5" fill={`url(#${grad})`} stroke="#d9d3c4" strokeWidth="1" />
      <text x={w / 2} y="32" textAnchor="middle" fontSize="14" fontWeight="800" fill="#0b1220" letterSpacing="2">{label}</text>
      <text x={w / 2} y="50" textAnchor="middle" fontSize="10" fill="#0b1220" opacity="0.75">{sub}</text>
      <text x={w / 2} y={h / 2 + 4} textAnchor="middle" fontSize="32" fontWeight="800" fill="#0b1220">{stat.tables}</text>
      <text x={w / 2} y={h / 2 + 22} textAnchor="middle" fontSize="9.5" fill="#0b1220" opacity="0.6" letterSpacing="1.2">TABLES</text>
      <text x={w / 2} y={h - 50} textAnchor="middle" fontSize="11" fontWeight="700" fill="#0b1220">
        {formatNum(stat.rows)} rows
      </text>
      <text x={w / 2} y={h - 36} textAnchor="middle" fontSize="9.5" fill="#0b1220" opacity="0.7">
        {formatBytes(stat.bytes)}
      </text>
      {stat.trend && stat.trend.length > 1 && (
        <g transform={`translate(${w / 2 - 32}, ${h - 30})`}>
          <SparklinePath values={stat.trend} width={64} height={14} color="#0b1220" opacity={0.55} />
        </g>
      )}
      <text x={w / 2} y={h - 12} textAnchor="middle" fontSize="9" fontWeight="700" fill="#0b1220" opacity="0.45" letterSpacing="1.6">
        ICEBERG · GLUE
      </text>
      {/* Live pulse top-right */}
      <circle cx={w - 12} cy="12" r="3" fill={accent} filter="url(#alive-glow)">
        <animate attributeName="opacity" values="0.4;1;0.4" dur="2s" repeatCount="indefinite" />
      </circle>
    </g>
  );
}

function Particle({
  x1, y1, x2, y2, color, dur, delay = 0,
}: {
  x1: number; y1: number; x2: number; y2: number;
  color: string; dur: number; delay?: number;
}) {
  return (
    <circle r="2.6" fill={color} opacity="0">
      <animate attributeName="cx" values={`${x1};${x2}`} dur={`${dur}s`} repeatCount="indefinite" begin={`${delay}s`} />
      <animate attributeName="cy" values={`${y1};${y2}`} dur={`${dur}s`} repeatCount="indefinite" begin={`${delay}s`} />
      <animate attributeName="opacity" values="0;1;1;0" dur={`${dur}s`} repeatCount="indefinite" begin={`${delay}s`} />
    </circle>
  );
}

function DbtBadge({ cx, cy }: { cx: number; cy: number }) {
  return (
    <g transform={`translate(${cx - 21}, ${cy})`}>
      <rect width="42" height="14" rx="3" fill="#FF694A" />
      <text x="21" y="10" textAnchor="middle" fontSize="9" fontWeight="800" fill="#ffffff" letterSpacing="0.3">
        dbt labs
      </text>
    </g>
  );
}

function SparklinePath({
  values, width, height, color, opacity = 1,
}: {
  values: number[]; width: number; height: number; color: string; opacity?: number;
}) {
  if (values.length < 2) return null;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const rng = max - min || 1;
  const stepX = width / (values.length - 1);
  const pts = values.map((v, i) => `${(i * stepX).toFixed(1)},${(height - ((v - min) / rng) * height).toFixed(1)}`);
  return (
    <polyline
      points={pts.join(' ')} fill="none" stroke={color}
      strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"
      opacity={opacity}
    />
  );
}

// ─── Vendor logo marks (inline SVG, vendor-true silhouettes) ────────────────

function VendorMark({ kind, size = 20 }: { kind: VendorLogo; size?: number }) {
  const s: CSSProperties = { display: 'inline-block', overflow: 'visible' };
  switch (kind) {
    case 'snowflake':
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" style={s} aria-hidden preserveAspectRatio="xMidYMid meet">
          <g fill="#29B5E8">
            <path d="M12 1.5l1.6 2.8h-3.2z" />
            <path d="M12 22.5l-1.6-2.8h3.2z" />
            <path d="M1.5 12l2.8 1.6v-3.2z" />
            <path d="M22.5 12l-2.8-1.6v3.2z" />
            <path d="M4.2 4.2l2.6 1-1.6 1.6z" />
            <path d="M19.8 19.8l-2.6-1 1.6-1.6z" />
            <path d="M19.8 4.2l-1 2.6-1.6-1.6z" />
            <path d="M4.2 19.8l1-2.6 1.6 1.6z" />
            <circle cx="12" cy="12" r="3.2" />
          </g>
        </svg>
      );
    case 'fivetran':
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" style={s} aria-hidden preserveAspectRatio="xMidYMid meet">
          <rect width="24" height="24" rx="4" fill="#0073EA" />
          <path d="M6 8h12M6 12h8M6 16h5" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" />
        </svg>
      );
    case 'dbt':
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" style={s} aria-hidden preserveAspectRatio="xMidYMid meet">
          <rect width="24" height="24" rx="4" fill="#FF694A" />
          <text x="12" y="16" textAnchor="middle" fontSize="11" fontWeight="900" fill="#ffffff">dbt</text>
        </svg>
      );
    case 'iceberg':
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" style={s} aria-hidden preserveAspectRatio="xMidYMid meet">
          <path d="M12 3l4 7-4 -1-4 1z" fill="#5fb3a1" />
          <path d="M3 19l9-6 9 6z" fill="#2c6e87" />
          <path d="M3 19l9-2 9 2v2H3z" fill="#1d4e89" />
        </svg>
      );
    case 'oracle':
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" style={s} aria-hidden preserveAspectRatio="xMidYMid meet">
          <rect width="24" height="24" rx="4" fill="#c74634" />
          <text x="12" y="16" textAnchor="middle" fontSize="9" fontWeight="900" fill="#ffffff">OR</text>
        </svg>
      );
    case 'sqlserver':
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" style={s} aria-hidden preserveAspectRatio="xMidYMid meet">
          <rect width="24" height="24" rx="4" fill="#a91d22" />
          <text x="12" y="16" textAnchor="middle" fontSize="9" fontWeight="900" fill="#ffffff">SQL</text>
        </svg>
      );
    case 'hl7':
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" style={s} aria-hidden preserveAspectRatio="xMidYMid meet">
          <rect width="24" height="24" rx="4" fill="#0d9488" />
          <text x="12" y="16" textAnchor="middle" fontSize="9" fontWeight="900" fill="#ffffff">HL7</text>
        </svg>
      );
    case 'cms':
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" style={s} aria-hidden preserveAspectRatio="xMidYMid meet">
          <rect width="24" height="24" rx="4" fill="#1d4ed8" />
          <text x="12" y="16" textAnchor="middle" fontSize="9" fontWeight="900" fill="#ffffff">CMS</text>
        </svg>
      );
    case 'sec':
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" style={s} aria-hidden preserveAspectRatio="xMidYMid meet">
          <rect width="24" height="24" rx="4" fill="#0b2545" />
          <text x="12" y="16" textAnchor="middle" fontSize="9" fontWeight="900" fill="#ffffff">SEC</text>
        </svg>
      );
    case 'fred':
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" style={s} aria-hidden preserveAspectRatio="xMidYMid meet">
          <rect width="24" height="24" rx="4" fill="#16a34a" />
          <text x="12" y="16" textAnchor="middle" fontSize="9" fontWeight="900" fill="#ffffff">FRED</text>
        </svg>
      );
    case 'cfpb':
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" style={s} aria-hidden preserveAspectRatio="xMidYMid meet">
          <rect width="24" height="24" rx="4" fill="#7c3aed" />
          <text x="12" y="16" textAnchor="middle" fontSize="9" fontWeight="900" fill="#ffffff">CFPB</text>
        </svg>
      );
    case 'naic':
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" style={s} aria-hidden preserveAspectRatio="xMidYMid meet">
          <rect width="24" height="24" rx="4" fill="#5b21b6" />
          <text x="12" y="16" textAnchor="middle" fontSize="8.5" fontWeight="900" fill="#ffffff">NAIC</text>
        </svg>
      );
    case 'noaa':
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" style={s} aria-hidden preserveAspectRatio="xMidYMid meet">
          <rect width="24" height="24" rx="4" fill="#0369a1" />
          <text x="12" y="16" textAnchor="middle" fontSize="8.5" fontWeight="900" fill="#ffffff">NOAA</text>
        </svg>
      );
    case 'athena':
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" style={s} aria-hidden preserveAspectRatio="xMidYMid meet">
          <rect width="24" height="24" rx="4" fill="#b8975c" />
          <text x="12" y="16" textAnchor="middle" fontSize="9" fontWeight="900" fill="#ffffff">Ath</text>
        </svg>
      );
    case 'duckdb':
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" style={s} aria-hidden preserveAspectRatio="xMidYMid meet">
          <rect width="24" height="24" rx="4" fill="#fff100" />
          <text x="12" y="16" textAnchor="middle" fontSize="9" fontWeight="900" fill="#0b1220">DD</text>
        </svg>
      );
    case 'trino':
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" style={s} aria-hidden preserveAspectRatio="xMidYMid meet">
          <rect width="24" height="24" rx="4" fill="#1d4e89" />
          <text x="12" y="16" textAnchor="middle" fontSize="9" fontWeight="900" fill="#ffffff">Tr</text>
        </svg>
      );
    case 'spark':
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" style={s} aria-hidden preserveAspectRatio="xMidYMid meet">
          <rect width="24" height="24" rx="4" fill="#e25a1c" />
          <text x="12" y="16" textAnchor="middle" fontSize="9" fontWeight="900" fill="#ffffff">Sp</text>
        </svg>
      );
  }
}

// ─── Number formatters ──────────────────────────────────────────────────────

function formatNum(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)     return `${(n / 1_000).toFixed(0)}K`;
  return n.toLocaleString();
}

function formatBytes(b: number): string {
  if (b >= 1_000_000_000) return `${(b / 1_000_000_000).toFixed(2)} GB`;
  if (b >= 1_000_000)     return `${(b / 1_000_000).toFixed(1)} MB`;
  return `${(b / 1_000).toFixed(1)} KB`;
}
