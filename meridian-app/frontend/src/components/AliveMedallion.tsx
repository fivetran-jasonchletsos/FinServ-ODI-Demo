// AliveMedallion — three-container Databricks-style lakehouse diagram.
//
// HTML chrome (group containers, source cards, engine chips, roles) wraps
// an SVG inset that owns the cylinder geometry, particle flow, and the
// dbt writer arrow. Result: real typography, real vendor logos, responsive
// reflow, dotted borders that don't pixel-crawl.
//
// Three zones: SOURCES (where it lives) / DATA LAKEHOUSE (where it becomes
// useful, with Glue catalog as visible hub) / CONSUMERS (engines + roles).

import { useEffect, useState, type CSSProperties } from 'react';

// ─── Public types ───────────────────────────────────────────────────────────

export type NodeStatus = 'healthy' | 'caution' | 'alert';

export interface SourceNode {
  id: string;
  label: string;     // "Epic Clarity EHR"
  sub: string;       // "SQL Server CDC · 8 tables"
  logo?: VendorLogo;
  freshness?: string;          // "47s ago"
  status?: NodeStatus;
  streaming?: boolean;
  lagP99?: string;
  pipelineUrl?: string;   // when set, source card renders an "Open in Fivetran" chip
}

export interface LayerStat {
  tables: number;
  rows: number;
  bytes: number;
  trend?: number[];
}

export interface EngineNode {
  name: string;
  active?: boolean;
  logo?: VendorLogo;
}

export type VendorLogo =
  | 'snowflake' | 'fivetran' | 'dbt' | 'iceberg' | 'glue'
  | 'oracle'    | 'sqlserver'| 'hl7'  | 'cms'
  | 'sec'       | 'fred'     | 'cfpb' | 'naic' | 'noaa'
  | 'athena'    | 'duckdb'   | 'trino'| 'spark'
  | 'great_expectations';

export interface ConsumerRole {
  label: string;     // "Clinicians"
  sub?: string;      // "outcomes, alerts"
}

interface Props {
  sources: SourceNode[];
  bronze: LayerStat;
  silver: LayerStat;
  gold: LayerStat;
  engines: EngineNode[];
  /** Human roles served by the gold layer — Riley's "who uses it" row. */
  roles?: ConsumerRole[];
  /** Brand accent for "live" pulse + active states. Default: gold. */
  accent?: string;
  /** Caption under the engine chip row. */
  enginesCaption?: string;
}

// =============================================================================

export function AliveMedallion({
  sources, bronze, silver, gold, engines,
  roles = [
    { label: 'Clinicians', sub: 'outcomes & alerts' },
    { label: 'Finance',    sub: 'cost & utilization' },
    { label: 'Operations', sub: 'throughput & SLA' },
    { label: 'Analysts',   sub: 'self-serve insight' },
  ],
  accent = '#b8975c',
  enginesCaption = 'All five read the same data — no copies, no rebuilds per tool.',
}: Props) {
  // Pulse engine highlight every 1.6s
  const [activeIdx, setActiveIdx] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setActiveIdx((i) => (i + 1) % Math.max(engines.length, 1)), 1600);
    return () => clearInterval(id);
  }, [engines.length]);

  return (
    <div className="alive-medallion">
      <style>{CSS}</style>

      <div className="am-grid">

        {/* ═══════════════ SOURCES ═══════════════ */}
        <section className="am-zone am-zone-sources">
          <header className="am-eyebrow">
            <span className="am-eyebrow-title">SOURCES</span>
            <span className="am-eyebrow-sub">where it lives</span>
          </header>

          <div className="am-source-stack">
            {sources.map((s) => {
              // Streaming sources get a live-green dot. Batch / CDC sources get
              // a neutral slate dot — a green dot on a batch source falsely
              // implies real-time freshness.
              const statusColor =
                s.status === 'alert' ? '#dc2626'
                : s.status === 'caution' ? '#d97706'
                : s.streaming ? '#0d9488'
                : '#94a3b8';
              return (
                <article key={s.id} className="am-source-card">
                  <div className="am-source-logo">
                    {s.logo && <VendorMark kind={s.logo} size={28} />}
                  </div>
                  <div className="am-source-body">
                    <div className="am-source-row1">
                      <span className="am-source-label">{s.label}</span>
                      {s.streaming && <span className="am-pill am-pill-stream">STREAM</span>}
                    </div>
                    <div className="am-source-sub">{s.sub}</div>
                    {s.freshness && (
                      <div className="am-source-meta">
                        <span className="am-live-dot" style={{ background: statusColor }} />
                        <span className="am-source-fresh">{s.freshness}</span>
                        {s.lagP99 && <span className="am-source-lag">p99 {s.lagP99}</span>}
                      </div>
                    )}
                    {s.pipelineUrl && (
                      <a
                        className="am-source-pipeline"
                        href={s.pipelineUrl}
                        target="_blank"
                        rel="noreferrer"
                      >
                        <VendorMark kind="fivetran" size={12} />
                        <span>Open in Fivetran</span>
                        <span aria-hidden>↗</span>
                      </a>
                    )}
                  </div>
                </article>
              );
            })}
          </div>

          <footer className="am-zone-footer">
            <VendorMark kind="fivetran" size={20} />
            <span>CDC + batch via Fivetran <span style={{ color: '#9ca3af' }}>·</span> Market data streams via Kinesis</span>
          </footer>
        </section>

        {/* ═══════════════ DATA LAKEHOUSE ═══════════════ */}
        <section className="am-zone am-zone-lakehouse">
          <header className="am-eyebrow">
            <span className="am-eyebrow-title">DATA LAKEHOUSE</span>
            <span className="am-eyebrow-sub">where it becomes useful</span>
          </header>

          <div className="am-glue-hub">
            <VendorMark kind="iceberg" size={20} />
            <div className="am-glue-stack">
              <span className="am-glue-primary">Governed Catalog · Apache Iceberg</span>
              <span className="am-glue-attr">AWS Glue</span>
            </div>
            <span className="am-pulse-dot" style={{ background: accent }} />
          </div>

          <div className="am-medallion-row">
            <MedallionColumn label="BRONZE" sub="raw"             tone="bronze" stat={bronze} />
            <MedallionColumn label="SILVER" sub="cleaned"         tone="silver" stat={silver} />
            <MedallionColumn label="GOLD"   sub="metrics & marts" tone="gold"   stat={gold}   />
          </div>

          <CylinderFlowSVG accent={accent} />

          <footer className="am-lakehouse-footer">
            <span className="am-dbt-chip">
              <VendorMark kind="dbt" size={14} />
              dbt on Snowflake compute · commits Silver + Gold as Iceberg snapshots
            </span>
            <span className="am-dbt-chip am-gx-chip">
              <VendorMark kind="great_expectations" size={14} />
              Great Expectations validates Bronze before Silver promotion
            </span>
            <span className="am-lake-truth">One set of files · ACID · time-travel</span>
          </footer>
        </section>

        {/* ═══════════════ CONSUMERS ═══════════════ */}
        <section className="am-zone am-zone-consumers">
          <header className="am-eyebrow">
            <span className="am-eyebrow-title">CONSUMERS</span>
            <span className="am-eyebrow-sub">who reads it</span>
          </header>

          <div className="am-engines-block">
            <div className="am-engines-label">Query engines</div>
            <div className="am-engine-chips">
              {engines.map((e, i) => {
                const isActive = activeIdx === i;
                const isPrimary = !!e.active;
                return (
                  <div
                    key={e.name}
                    className={`am-engine-chip${isPrimary ? ' is-primary' : ''}${isActive ? ' is-glow' : ''}`}
                    style={isActive ? { boxShadow: `0 0 0 2px ${accent}33` } : undefined}
                  >
                    {e.logo && <VendorMark kind={e.logo} size={14} />}
                    <span>{e.name}</span>
                    {isPrimary && <span className="am-engine-dot" style={{ background: accent }} />}
                  </div>
                );
              })}
            </div>
            <p className="am-engines-caption">{enginesCaption}</p>
          </div>

          <div className="am-engines-divider" />

          <div className="am-hipaa-band">
            <span className="am-hipaa-title">Governed delivery</span>
            <span className="am-hipaa-detail">SOC 2 · SOX · row-level access · column masking</span>
          </div>

          <div className="am-roles-block">
            <div className="am-engines-label">Served to</div>
            <div className="am-role-grid">
              {roles.map((r) => (
                <div key={r.label} className="am-role-card">
                  <div className="am-role-label">{r.label}</div>
                  {r.sub && <div className="am-role-sub">{r.sub}</div>}
                </div>
              ))}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

// ─── Medallion column (HTML label + sub above cylinder SVG slot) ────────────

function MedallionColumn({
  label, sub, tone, stat,
}: {
  label: string; sub: string;
  tone: 'bronze' | 'silver' | 'gold';
  stat: LayerStat;
}) {
  return (
    <div className={`am-medallion-col am-medallion-${tone}`}>
      <div className="am-medallion-head">
        <div className="am-medallion-label">{label}</div>
        <div className="am-medallion-sub">{sub}</div>
      </div>
      <div className="am-medallion-cyl-slot">
        <CylinderSVG tone={tone} tables={stat.tables} />
      </div>
      <div className="am-medallion-stats">
        <div className="am-medallion-rows">{formatNum(stat.rows)} rows</div>
        <div className="am-medallion-bytes">{formatBytes(stat.bytes)}</div>
      </div>
    </div>
  );
}

// ─── Cylinder (own SVG so each sits inside its HTML column) ─────────────────

function CylinderSVG({
  tone, tables,
}: { tone: 'bronze' | 'silver' | 'gold'; tables: number }) {
  const TONES = {
    bronze: { top: '#c97a3a', mid: '#a55a26', dark: '#7a3d10', stroke: '#5e2e0a' },
    silver: { top: '#d4d8de', mid: '#a0a6ae', dark: '#777d86', stroke: '#5b6068' },
    gold:   { top: '#ffe082', mid: '#f6c849', dark: '#c79b1f', stroke: '#946f0c' },
  }[tone];

  const W = 140, H = 150;
  const cx = W / 2;
  const rx = 50;
  const ry = 14;
  const topY = 18;
  const bottomY = H - 16;
  const bodyH = bottomY - topY;

  const sidePath = [
    `M ${cx - rx} ${topY}`,
    `L ${cx - rx} ${bottomY}`,
    `A ${rx} ${ry} 0 0 0 ${cx + rx} ${bottomY}`,
    `L ${cx + rx} ${topY}`,
    'Z',
  ].join(' ');

  const gradId = `cyl2-${tone}`;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" height="100%" preserveAspectRatio="xMidYMid meet">
      <defs>
        <linearGradient id={gradId} x1="0" x2="1" y1="0" y2="0">
          <stop offset="0%"   stopColor={TONES.dark} />
          <stop offset="35%"  stopColor={TONES.mid} />
          <stop offset="60%"  stopColor={TONES.top} />
          <stop offset="100%" stopColor={TONES.dark} />
        </linearGradient>
      </defs>
      <path d={sidePath} fill={`url(#${gradId})`} stroke={TONES.stroke} strokeWidth="1.2" />
      <ellipse cx={cx} cy={topY + bodyH / 3}     rx={rx} ry={ry} fill="none" stroke={TONES.stroke} strokeWidth="0.9" opacity="0.55" />
      <ellipse cx={cx} cy={topY + (bodyH * 2)/3} rx={rx} ry={ry} fill="none" stroke={TONES.stroke} strokeWidth="0.9" opacity="0.55" />
      <ellipse cx={cx} cy={topY} rx={rx} ry={ry} fill={TONES.top} stroke={TONES.stroke} strokeWidth="1.2" />
      <ellipse cx={cx - rx * 0.3} cy={topY - ry * 0.2} rx={rx * 0.45} ry={ry * 0.35} fill="#ffffff" opacity="0.35" />
      <text x={cx} y={topY + bodyH / 2 + 6} textAnchor="middle" fontSize="32" fontWeight="800" fill="#0b1220" opacity="0.92" style={{ fontFamily: '"JetBrains Mono", monospace' }}>{tables}</text>
      <text x={cx} y={topY + bodyH / 2 + 22} textAnchor="middle" fontSize="8.5" fontWeight="700" fill="#0b1220" opacity="0.5" letterSpacing="1.6">TABLES</text>
    </svg>
  );
}

// ─── Particle flow between cylinder columns (absolute-positioned SVG) ───────

function CylinderFlowSVG({ accent }: { accent: string }) {
  const W = 600, H = 30;
  return (
    <svg className="am-flow-svg" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden>
      <defs>
        <linearGradient id="am-flow-grad" x1="0" x2="1" y1="0" y2="0">
          <stop offset="0%"   stopColor="#b45309" stopOpacity="0.6" />
          <stop offset="50%"  stopColor="#a0a6ae" stopOpacity="0.6" />
          <stop offset="100%" stopColor="#b8975c" stopOpacity="0.7" />
        </linearGradient>
      </defs>
      <line x1="0" y1={H / 2} x2={W} y2={H / 2} stroke="url(#am-flow-grad)" strokeWidth="1.4" />
      {[0, 0.5, 1.0, 1.5].map((delay) => (
        <circle key={delay} r="3.2" fill={accent} opacity="0">
          <animate attributeName="cx" values={`0;${W}`} dur="2.6s" begin={`${delay}s`} repeatCount="indefinite" />
          <animate attributeName="cy" values={`${H / 2};${H / 2}`} dur="2.6s" repeatCount="indefinite" />
          <animate attributeName="opacity" values="0;1;1;0" dur="2.6s" begin={`${delay}s`} repeatCount="indefinite" />
        </circle>
      ))}
    </svg>
  );
}

// ─── Vendor logo marks ──────────────────────────────────────────────────────

function VendorMark({ kind, size = 20 }: { kind: VendorLogo; size?: number }) {
  const s: CSSProperties = { display: 'inline-block', overflow: 'visible', flexShrink: 0 };
  const common = { width: size, height: size, viewBox: '0 0 24 24', preserveAspectRatio: 'xMidYMid meet' as const, style: s, 'aria-hidden': true };
  switch (kind) {
    case 'snowflake':
      return (
        <svg {...common}>
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
        <svg {...common}>
          <rect width="24" height="24" rx="5" fill="#0073EA" />
          <path d="M6 8h12M6 12h8M6 16h5" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" />
        </svg>
      );
    case 'dbt':
      return (
        <svg {...common}>
          <rect width="24" height="24" rx="5" fill="#FF694A" />
          <text x="12" y="16" textAnchor="middle" fontSize="11" fontWeight="900" fill="#ffffff">dbt</text>
        </svg>
      );
    case 'iceberg':
      return (
        <svg {...common}>
          <path d="M12 3l4 7-4 -1-4 1z" fill="#5fb3a1" />
          <path d="M3 19l9-6 9 6z" fill="#2c6e87" />
          <path d="M3 19l9-2 9 2v2H3z" fill="#1d4e89" />
        </svg>
      );
    case 'glue':
      return (
        <svg {...common}>
          <rect width="24" height="24" rx="5" fill="#7a3d8c" />
          <path d="M7 6 L17 6 L17 11 L14 11 L14 18 L10 18 L10 11 L7 11 Z" fill="#ffffff" />
        </svg>
      );
    case 'oracle':
      return (
        <svg {...common}>
          <rect width="24" height="24" rx="5" fill="#c74634" />
          <text x="12" y="15.5" textAnchor="middle" fontSize="6.2" fontWeight="800" fill="#ffffff" letterSpacing="0.4" fontFamily="Helvetica, Arial, sans-serif">ORACLE</text>
        </svg>
      );
    case 'sqlserver':
      return (
        <svg {...common}>
          <rect width="24" height="24" rx="5" fill="#a91d22" />
          <text x="12" y="15.5" textAnchor="middle" fontSize="6" fontWeight="800" fill="#ffffff" letterSpacing="0.2" fontFamily="Helvetica, Arial, sans-serif">MS SQL</text>
        </svg>
      );
    case 'hl7':
      return (
        <svg {...common}>
          <rect width="24" height="24" rx="5" fill="#c8102e" />
          <text x="12" y="16" textAnchor="middle" fontSize="9" fontWeight="900" fill="#ffffff" fontFamily="Helvetica, Arial, sans-serif">HL7</text>
        </svg>
      );
    case 'cms':
      return (
        <svg {...common}>
          <rect width="24" height="24" rx="5" fill="#1d4ed8" />
          <text x="12" y="16" textAnchor="middle" fontSize="9" fontWeight="900" fill="#ffffff" fontFamily="Helvetica, Arial, sans-serif">CMS</text>
        </svg>
      );
    case 'sec':
      return <svg {...common}><rect width="24" height="24" rx="5" fill="#0b2545" /><text x="12" y="16" textAnchor="middle" fontSize="9" fontWeight="900" fill="#ffffff">SEC</text></svg>;
    case 'fred':
      return <svg {...common}><rect width="24" height="24" rx="5" fill="#16a34a" /><text x="12" y="16" textAnchor="middle" fontSize="9" fontWeight="900" fill="#ffffff">FRED</text></svg>;
    case 'cfpb':
      return <svg {...common}><rect width="24" height="24" rx="5" fill="#7c3aed" /><text x="12" y="16" textAnchor="middle" fontSize="9" fontWeight="900" fill="#ffffff">CFPB</text></svg>;
    case 'naic':
      return <svg {...common}><rect width="24" height="24" rx="5" fill="#5b21b6" /><text x="12" y="16" textAnchor="middle" fontSize="8.5" fontWeight="900" fill="#ffffff">NAIC</text></svg>;
    case 'noaa':
      return <svg {...common}><rect width="24" height="24" rx="5" fill="#0369a1" /><text x="12" y="16" textAnchor="middle" fontSize="8.5" fontWeight="900" fill="#ffffff">NOAA</text></svg>;
    case 'athena':
      return <svg {...common}><rect width="24" height="24" rx="5" fill="#ff9900" /><text x="12" y="16" textAnchor="middle" fontSize="9" fontWeight="900" fill="#ffffff">Ath</text></svg>;
    case 'duckdb':
      return <svg {...common}><rect width="24" height="24" rx="5" fill="#fff100" /><text x="12" y="16" textAnchor="middle" fontSize="9" fontWeight="900" fill="#0b1220">DD</text></svg>;
    case 'trino':
      return <svg {...common}><rect width="24" height="24" rx="5" fill="#dd00a1" /><text x="12" y="16" textAnchor="middle" fontSize="9" fontWeight="900" fill="#ffffff">Tr</text></svg>;
    case 'spark':
      return <svg {...common}><rect width="24" height="24" rx="5" fill="#e25a1c" /><text x="12" y="16" textAnchor="middle" fontSize="9" fontWeight="900" fill="#ffffff">Sp</text></svg>;
    case 'great_expectations':
      return (
        <svg {...common}>
          <rect width="24" height="24" rx="5" fill="#ff6310" />
          <text x="12" y="16" textAnchor="middle" fontSize="8" fontWeight="900" fill="#ffffff" letterSpacing="0.3" fontFamily="Helvetica, Arial, sans-serif">GX</text>
        </svg>
      );
  }
}

// ─── Formatters ─────────────────────────────────────────────────────────────

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

// ─── Styles ─────────────────────────────────────────────────────────────────

const CSS = `
.alive-medallion {
  --am-ink: #0b1220;
  --am-ink-2: #4b5563;
  --am-ink-3: #6b7280;
  --am-rule: #d9d3c4;
  --am-rule-2: #e8e4d8;
  --am-bg: #fafaf7;
  --am-card: #ffffff;
  --am-accent: #b8975c;
  --am-bronze: #b45309;
  --am-silver: #6b7280;
  --am-gold: #b8975c;
  font-family: -apple-system, BlinkMacSystemFont, "Inter", "Segoe UI", sans-serif;
  color: var(--am-ink);
}

.am-grid {
  display: grid;
  grid-template-columns: 1fr 1.4fr 1fr;
  gap: 24px;
  align-items: stretch;
}

@media (max-width: 1100px) {
  .am-grid { grid-template-columns: 1fr; }
}

.am-zone {
  position: relative;
  background: var(--am-card);
  border: 1.5px dashed var(--am-rule);
  border-radius: 8px;
  padding: 18px 18px 14px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.am-zone-lakehouse {
  background: linear-gradient(180deg, #fdfbf3 0%, #fff 100%);
  border-style: solid;
  border-color: var(--am-rule);
}

.am-eyebrow {
  display: flex;
  align-items: baseline;
  gap: 10px;
  padding-bottom: 8px;
  border-bottom: 1px solid var(--am-rule-2);
}
.am-eyebrow-title {
  font-family: "Crimson Pro", Georgia, serif;
  font-size: 16px;
  font-weight: 600;
  letter-spacing: 2px;
  color: var(--am-ink);
}
.am-eyebrow-sub {
  font-size: 10.5px;
  letter-spacing: 0.06em;
  text-transform: lowercase;
  color: var(--am-ink-3);
  font-style: italic;
}

/* SOURCES */
.am-source-stack { display: flex; flex-direction: column; gap: 10px; flex: 1; }
.am-source-card {
  display: grid;
  grid-template-columns: 36px 1fr;
  gap: 12px;
  padding: 10px 12px;
  background: #ffffff;
  border: 1px solid var(--am-rule-2);
  border-radius: 6px;
  align-items: start;
}
.am-source-logo { padding-top: 2px; }
.am-source-row1 { display: flex; align-items: center; gap: 8px; justify-content: space-between; }
.am-source-label {
  font-size: 13px;
  font-weight: 700;
  color: var(--am-ink);
}
.am-source-sub {
  font-size: 10.5px;
  color: var(--am-ink-2);
  margin-top: 2px;
  line-height: 1.35;
}
.am-source-meta {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 6px;
  font-family: "JetBrains Mono", "SF Mono", monospace;
  font-size: 9.5px;
  color: var(--am-ink);
}
.am-source-lag { color: var(--am-ink-3); margin-left: auto; }
.am-source-pipeline {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  margin-top: 6px;
  padding-top: 6px;
  border-top: 1px dashed var(--am-rule-2);
  font-size: 10px;
  font-weight: 600;
  color: var(--am-ink);
  text-decoration: none;
}
.am-source-pipeline:hover {
  color: var(--am-ink);
  text-decoration: underline;
}
.am-live-dot {
  width: 6px; height: 6px; border-radius: 50%;
  animation: am-pulse 1.6s ease-in-out infinite;
}

.am-pill {
  display: inline-block;
  font-size: 8.5px;
  font-weight: 800;
  letter-spacing: 0.08em;
  padding: 2px 6px;
  border-radius: 3px;
  font-family: "JetBrains Mono", "SF Mono", monospace;
}
.am-pill-stream { background: #0d9488; color: #fff; }
.am-pill-hipaa { background: #f4f4ef; color: var(--am-ink); border: 1px solid var(--am-rule); }

.am-zone-footer {
  display: flex;
  align-items: center;
  gap: 8px;
  padding-top: 10px;
  margin-top: auto;
  border-top: 1px solid var(--am-rule-2);
  font-size: 10.5px;
  color: var(--am-ink-2);
}
.am-zone-footer-quiet { font-size: 10px; color: var(--am-ink-3); }

/* LAKEHOUSE */
.am-glue-hub {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  background: #0b2545;
  color: #d4af75;
  border-radius: 5px;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.04em;
}
.am-glue-stack { flex: 1; display: flex; flex-direction: column; gap: 1px; }
.am-glue-primary {
  font-family: "Crimson Pro", Georgia, serif;
  font-size: 13px;
  font-weight: 700;
  letter-spacing: 0.04em;
  color: #f4eedb;
}
.am-glue-attr {
  font-family: "JetBrains Mono", "SF Mono", monospace;
  font-size: 9px;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: #b8975c;
  opacity: 0.85;
}
.am-pulse-dot {
  width: 7px; height: 7px; border-radius: 50%;
  box-shadow: 0 0 8px currentColor;
  animation: am-pulse 1.8s ease-in-out infinite;
}

.am-medallion-row {
  display: grid;
  grid-template-columns: 1fr 1fr 1fr;
  gap: 8px;
  position: relative;
}

.am-medallion-col {
  display: flex;
  flex-direction: column;
  background: #ffffff;
  border: 1px solid var(--am-rule-2);
  border-top: 3px solid var(--am-bronze);
  border-radius: 5px;
  padding: 10px 8px 12px;
  text-align: center;
  min-height: 220px;
}
.am-medallion-bronze { border-top-color: #b45309; }
.am-medallion-silver { border-top-color: #6b7280; }
.am-medallion-gold   { border-top-color: #b8975c; }

.am-medallion-head { margin-bottom: 4px; }
.am-medallion-label {
  font-family: "Crimson Pro", Georgia, serif;
  font-size: 14px;
  font-weight: 700;
  letter-spacing: 2.2px;
}
.am-medallion-sub {
  font-size: 9.5px;
  color: var(--am-ink-3);
  letter-spacing: 0.04em;
  text-transform: uppercase;
}
.am-medallion-cyl-slot {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 120px;
  padding: 4px 0;
}
.am-medallion-stats { margin-top: 4px; }
.am-medallion-rows {
  font-family: "JetBrains Mono", "SF Mono", monospace;
  font-size: 11.5px;
  font-weight: 700;
  color: var(--am-ink);
}
.am-medallion-bytes {
  font-family: "JetBrains Mono", "SF Mono", monospace;
  font-size: 9.5px;
  color: var(--am-ink-3);
}

.am-flow-svg {
  display: block;
  width: 100%;
  height: 24px;
  margin: -6px 0 0;
}

.am-lakehouse-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding-top: 10px;
  border-top: 1px solid var(--am-rule-2);
  font-size: 10.5px;
  color: var(--am-ink-2);
  flex-wrap: wrap;
}
.am-dbt-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-weight: 600;
  color: var(--am-ink);
}
.am-gx-chip {
  color: var(--am-ink);
}
.am-lake-truth {
  font-family: "JetBrains Mono", "SF Mono", monospace;
  font-size: 9.5px;
  color: var(--am-ink-3);
  letter-spacing: 0.03em;
}

/* CONSUMERS */
.am-engines-block { display: flex; flex-direction: column; gap: 8px; }
.am-engines-label {
  font-size: 9.5px;
  font-weight: 700;
  letter-spacing: 0.12em;
  color: var(--am-ink-3);
  text-transform: uppercase;
}
.am-engine-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.am-engine-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 5px 9px;
  background: #ffffff;
  border: 1px solid var(--am-rule-2);
  border-radius: 999px;
  font-size: 10.5px;
  font-weight: 600;
  color: var(--am-ink-2);
  transition: box-shadow 0.4s, transform 0.2s;
}
.am-engine-chip.is-primary {
  background: #0b1220;
  color: #fff;
  border-color: var(--am-accent);
}
.am-engine-dot {
  width: 5px; height: 5px; border-radius: 50%;
}
.am-engines-caption {
  font-size: 10.5px;
  line-height: 1.45;
  color: var(--am-ink-2);
  margin: 4px 0 0;
}

.am-engines-divider {
  height: 1px;
  background: var(--am-rule-2);
  margin: 6px 0;
}

.am-hipaa-band {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 9px 12px;
  background: #f4f4ef;
  border: 1px solid var(--am-rule);
  border-left: 3px solid #0b2545;
  border-radius: 4px;
  margin-bottom: 4px;
}
.am-hipaa-title {
  font-family: "Crimson Pro", Georgia, serif;
  font-size: 11.5px;
  font-weight: 700;
  letter-spacing: 0.06em;
  color: var(--am-ink);
}
.am-hipaa-detail {
  font-family: "JetBrains Mono", "SF Mono", monospace;
  font-size: 9.5px;
  color: var(--am-ink-2);
  letter-spacing: 0.02em;
}

.am-roles-block { display: flex; flex-direction: column; gap: 8px; flex: 1; }
.am-role-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 6px;
}
.am-role-card {
  background: #ffffff;
  border: 1px solid var(--am-rule-2);
  border-left: 3px solid var(--am-accent);
  border-radius: 4px;
  padding: 8px 10px;
}
.am-role-label {
  font-size: 11.5px;
  font-weight: 700;
  color: var(--am-ink);
}
.am-role-sub {
  font-size: 9.5px;
  color: var(--am-ink-3);
  margin-top: 2px;
}

@keyframes am-pulse {
  0%, 100% { opacity: 0.4; }
  50% { opacity: 1; }
}
`;
