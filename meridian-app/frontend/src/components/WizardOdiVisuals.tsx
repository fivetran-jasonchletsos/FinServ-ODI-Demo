/*
 * WizardVisuals — hero visualizations for the dbt-wizard pages.
 * Adapted from Healthcare-EPIC-Snowflake-Demo for Verity Insurance.
 *
 * Components:
 *   WizardPipelineFlow   — 4-stage animated pipeline (Fivetran → Snowflake → dbt-wizard → reads it)
 *   LineagePanel         — live-evolving lineage graph for WizardLivePage
 *   WizardHub            — hub-and-spoke radial for the 4 sub-agents
 *   BuildCompleteSummary — 4-pane summary for build-complete panel
 *   ModelRegistry        — grouped view of dbt project models with new one highlighted
 *   LiveBuildThumbnail   — auto-playing preview for the "Watch live build" CTA
 *
 * Zero-dep SVG and CSS. Aligned with Verity Insurance navy/gold palette.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import type { WizardScenario } from './wizardTypes';

// ─────────────────────────────────────────────────────────────────────────
// Vendor / accent tokens — aligned with Verity Insurance palette
// ─────────────────────────────────────────────────────────────────────────

const C = {
  fivetran: '#0073EA',
  snow:     '#29B5E8',
  dbt:      '#FF694A',
  teal:     '#0d9488',
  violet:   '#7c3aed',
  rose:     '#be185d',
  green:    '#145e36',
  navy:     '#0b2744',
  paper:    '#f8fafb',
  ink:      '#1e2a3b',
  inkDim:   '#5a6c84',
  bull:     '#145e36',
};

// ─────────────────────────────────────────────────────────────────────────
// WizardPipelineFlow — Hero pipeline for OdiDbtWizardPage
// ─────────────────────────────────────────────────────────────────────────

type Stage = {
  key: string;
  layer: string;
  vendor: string;
  stat: string;
  color: string;
  icon: string;
};

const PIPELINE_STAGES: Stage[] = [
  { key: 'src',  layer: 'Sources',       vendor: 'Oracle PAS + Claims DB', stat: 'Oracle 19c + SQL Server · CDC', color: C.inkDim,   icon: 'P' },
  { key: 'ft',   layer: 'Ingestion',     vendor: 'Fivetran',                stat: '750+ connectors · Snowflake',  color: C.fivetran, icon: 'F' },
  { key: 'snow', layer: 'Compute',       vendor: 'Snowflake',               stat: 'XS warehouse · auto-suspend',  color: C.snow,     icon: 'S' },
  { key: 'dbt',  layer: 'Build-time AI', vendor: 'dbt Labs + dbt-wizard',   stat: '4 sub-agents · 90s/model',    color: C.dbt,      icon: 'W' },
  { key: 'read', layer: 'Reads it',      vendor: 'Snowflake reads it',      stat: 'same account · no copy',      color: C.teal,     icon: 'R' },
];

export function WizardPipelineFlow() {
  return (
    <div className="wiz-flow relative">
      <div className="grid grid-cols-1 md:grid-cols-9 gap-3 md:gap-2 items-stretch">
        {PIPELINE_STAGES.map((stage, i) => (
          <FragmentRow key={stage.key} stage={stage} isLast={i === PIPELINE_STAGES.length - 1} idx={i} />
        ))}
      </div>
      <style>{`
        .wiz-flow .wiz-stage {
          position: relative;
          border: 1px solid var(--hairline);
          border-radius: 6px;
          padding: 14px 14px 12px;
          background: var(--card);
          transition: transform 220ms ease, border-color 200ms ease, box-shadow 220ms ease;
          height: 100%;
          display: flex;
          flex-direction: column;
          gap: 8px;
        }
        .wiz-flow .wiz-stage:hover {
          transform: translateY(-2px);
          border-color: var(--accent, ${C.teal});
          box-shadow: 0 14px 30px -18px rgba(11, 39, 68, 0.35);
        }
        .wiz-particle {
          display: block;
          width: 6px;
          height: 6px;
          border-radius: 9999px;
          background: linear-gradient(180deg, #99f6e4 0%, ${C.teal} 100%);
          box-shadow: 0 0 8px ${C.teal}cc;
          left: 0;
          animation: wizParticle 2.6s ease-in-out infinite;
        }
        @keyframes wizParticle {
          0%   { left: 0;    opacity: 0; }
          12%  {              opacity: 1; }
          88%  {              opacity: 1; }
          100% { left: calc(100% - 6px); opacity: 0; }
        }
        @media (prefers-reduced-motion: reduce) {
          .wiz-particle { animation: none; }
        }
      `}</style>
    </div>
  );
}

function FragmentRow({ stage, isLast, idx }: { stage: Stage; isLast: boolean; idx: number }) {
  return (
    <>
      <div className="md:col-span-1">
        <div className="wiz-stage" style={{ ['--accent' as string]: stage.color } as React.CSSProperties}>
          <div className="flex items-center gap-2.5">
            <div
              className="shrink-0 rounded-md flex items-center justify-center font-mono font-bold"
              style={{
                width: 36,
                height: 36,
                color: stage.color,
                background: `${stage.color}1a`,
                border: `1px solid ${stage.color}55`,
                fontSize: 14,
              }}
            >
              {stage.icon}
            </div>
            <div className="min-w-0">
              <div className="font-mono text-[9.5px] uppercase tracking-[0.18em]" style={{ color: C.inkDim }}>
                {stage.layer}
              </div>
              <div className="font-serif font-semibold text-[13px] leading-tight truncate" style={{ color: C.ink }}>
                {stage.vendor}
              </div>
            </div>
          </div>
          <div className="font-mono text-[10px] leading-snug mt-auto" style={{ color: C.inkDim }}>
            {stage.stat}
          </div>
        </div>
      </div>
      {!isLast && (
        <div className="md:col-span-1 flex md:flex-col items-center justify-center" aria-hidden>
          <div className="hidden md:flex relative w-full h-7 items-center">
            <div
              className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-px"
              style={{ background: `linear-gradient(90deg, ${C.teal}00, ${C.teal}77, ${C.teal}00)` }}
            />
            <span
              className="wiz-particle absolute top-1/2 -translate-y-1/2"
              style={{ animationDelay: `${idx * 0.45}s` }}
            />
          </div>
          <div className="md:hidden flex items-center justify-center w-full py-1">
            <svg width="14" height="20" viewBox="0 0 14 20" fill="none" aria-hidden>
              <path d="M7 1 L7 17 M1 11 L7 17 L13 11" stroke={`${C.teal}aa`} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
        </div>
      )}
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// WizardHub — hub-and-spoke radial showing 4 sub-agents around dbt-wizard
// ─────────────────────────────────────────────────────────────────────────

type AgentSpoke = {
  code: string;
  name: string;
  tools: string;
  blurb: string;
  color: string;
  angle: number;
};

const SPOKES: AgentSpoke[] = [
  { code: 'EX', name: 'Explorer',     tools: 'status · search',      blurb: 'Maps what exists',     color: C.teal,   angle: -135 },
  { code: 'SM', name: 'Summary',      tools: 'describe · lineage',   blurb: 'Documents the schema', color: C.violet, angle: -45  },
  { code: 'WK', name: 'Worker',       tools: 'warehouse · dbt_show', blurb: 'Authors the SQL',      color: C.rose,   angle:  45  },
  { code: 'VR', name: 'Verification', tools: 'test · docs',           blurb: 'Tests and tags',      color: C.bull,   angle:  135 },
];

export function WizardHub({ size = 540 }: { size?: number }) {
  const cx = size / 2;
  const cy = size / 2;
  const r  = size * 0.30;
  return (
    <div className="research-card p-5">
      <div className="eyebrow mb-2">Four sub-agents · one loop</div>
      <h3 className="font-serif text-lg font-semibold mb-3" style={{ color: C.ink }}>
        dbt-wizard authors a model the way an actuarial engineer would
      </h3>
      <svg viewBox={`0 0 ${size} ${size}`} className="w-full h-auto" role="img" aria-label="dbt-wizard sub-agent wheel">
        {[1, 0.7, 0.4].map((rel) => (
          <circle key={rel} cx={cx} cy={cy} r={r * rel}
                  fill="none"
                  stroke={`${C.navy}1a`}
                  strokeWidth="1" />
        ))}
        {SPOKES.map((s) => {
          const rad = (s.angle * Math.PI) / 180;
          const x = cx + Math.cos(rad) * r;
          const y = cy + Math.sin(rad) * r;
          return (
            <g key={s.code}>
              <line x1={cx} y1={cy} x2={x} y2={y}
                    stroke={`${s.color}55`} strokeWidth="1.5" />
              <circle cx={x} cy={y} r={26}
                      fill={`${s.color}1a`}
                      stroke={s.color} strokeWidth="2" />
              <text x={x} y={y + 4} textAnchor="middle"
                    fill={s.color}
                    style={{ fontSize: 13, fontWeight: 800, fontFamily: '"JetBrains Mono", monospace' }}>
                {s.code}
              </text>
            </g>
          );
        })}
        {/* Center */}
        <circle cx={cx} cy={cy} r="56"
                fill={`${C.dbt}1a`}
                stroke={C.dbt} strokeWidth="2" />
        <text x={cx} y={cy - 4} textAnchor="middle"
              fill={C.dbt}
              style={{ fontSize: 13, fontWeight: 800, letterSpacing: '0.12em', fontFamily: '"JetBrains Mono", monospace' }}>
          DBT-WIZARD
        </text>
        <text x={cx} y={cy + 12} textAnchor="middle"
              fill={C.inkDim}
              style={{ fontSize: 9.5, letterSpacing: '0.18em' }}>
          BUILD-TIME AI
        </text>
        {/* Spoke labels */}
        {SPOKES.map((s) => {
          const rad = (s.angle * Math.PI) / 180;
          const lx = cx + Math.cos(rad) * (r + 70);
          const ly = cy + Math.sin(rad) * (r + 50);
          const anchor =
            Math.abs(Math.cos(rad)) < 0.2 ? 'middle' :
            Math.cos(rad) > 0 ? 'start' : 'end';
          return (
            <g key={s.name}>
              <text x={lx} y={ly - 8} textAnchor={anchor}
                    fill={s.color}
                    style={{ fontSize: 13, fontWeight: 700 }}>
                {s.name}
              </text>
              <text x={lx} y={ly + 6} textAnchor={anchor}
                    fill={C.ink}
                    style={{ fontSize: 11 }}>
                {s.blurb}
              </text>
              <text x={lx} y={ly + 20} textAnchor={anchor}
                    fill={C.inkDim}
                    style={{ fontSize: 10, letterSpacing: '0.06em', fontFamily: '"JetBrains Mono", monospace' }}>
                {s.tools}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// LineagePanel — live-evolving lineage graph for WizardLivePage
// ─────────────────────────────────────────────────────────────────────────

type LineageNodeKind = 'silver' | 'gold-new' | 'gold-existing';
type LineageNode = {
  id: string;
  label: string;
  kind: LineageNodeKind;
  x: number;
  y: number;
};

type LineageEdge = { from: string; to: string };

export function LineagePanel({
  currentStep,
  complete,
  scenario,
}: {
  currentStep: number;
  complete: boolean;
  scenario: WizardScenario | null;
}) {
  const nodes: LineageNode[] = useMemo(() => {
    const upstream = scenario?.upstream_models ?? [];
    const silvers: LineageNode[] = upstream.slice(0, 4).map((u, i) => ({
      id: u.model,
      label: u.model.replace(/^gold\./, ''),
      kind: 'silver',
      x: 18,
      y: 18 + i * 22,
    }));
    const gold: LineageNode = {
      id: scenario?.metric_code ?? 'gold.new',
      label: (scenario?.metric_code ?? 'gold.new').replace(/^gold\./, ''),
      kind: 'gold-new',
      x: 82,
      y: 48,
    };
    return [...silvers, gold];
  }, [scenario]);

  const edges: LineageEdge[] = useMemo(() => {
    const silvers = nodes.filter((n) => n.kind === 'silver');
    const gold    = nodes.find((n) => n.kind === 'gold-new');
    if (!gold) return [];
    return silvers.map((s) => ({ from: s.id, to: gold.id }));
  }, [nodes]);

  const nodeOpacity = (n: LineageNode): number => {
    if (n.kind === 'silver') return currentStep >= 1 ? 1 : 0.05;
    if (n.kind === 'gold-new') return currentStep >= 4 ? 1 : currentStep >= 3 ? 0.35 : 0.05;
    return 1;
  };
  const edgeOpacity = (): number => (currentStep >= 2 ? 1 : 0.0);
  const goldStateClass = complete
    ? 'lineage-gold-live'
    : currentStep >= 6
      ? 'lineage-gold-live'
      : currentStep >= 5
        ? 'lineage-gold-tested'
        : currentStep >= 4
          ? 'lineage-gold-built'
          : 'lineage-gold-pending';

  return (
    <div className="research-card flex flex-col" style={{ minHeight: 220 }}>
      <header className="px-5 py-3 border-b flex items-center justify-between" style={{ borderColor: 'var(--hairline)' }}>
        <div className="flex items-center gap-3 flex-wrap min-w-0">
          <div className="eyebrow font-mono" style={{ fontSize: 11, letterSpacing: '0.02em' }}>
            Lineage · building live
          </div>
          <span className="layer-chip" style={{
            color: C.snow, background: `${C.snow}12`, border: `1px solid ${C.snow}55`,
            fontSize: 10, padding: '3px 8px', fontWeight: 700,
          }}>
            snowflake-resolved
          </span>
        </div>
        <span className="font-mono" style={{ color: 'var(--ink-soft)', fontSize: 12 }}>
          {nodes.filter((n) => n.kind === 'silver').length} gold → 1 new gold
        </span>
      </header>
      <div className="flex-1 relative" style={{ minHeight: 180, padding: '14px 14px 12px' }}>
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="w-full h-full" role="img" aria-label="Live model lineage">
          {edges.map((e, i) => {
            const a = nodes.find((n) => n.id === e.from);
            const b = nodes.find((n) => n.id === e.to);
            if (!a || !b) return null;
            return (
              <g key={i}>
                <path
                  d={`M ${a.x + 7} ${a.y} C ${(a.x + b.x) / 2} ${a.y}, ${(a.x + b.x) / 2} ${b.y}, ${b.x - 7} ${b.y}`}
                  fill="none"
                  stroke={C.teal}
                  strokeWidth="0.45"
                  strokeDasharray="1 1.2"
                  opacity={edgeOpacity()}
                  style={{ transition: 'opacity 600ms ease' }}
                />
              </g>
            );
          })}
          {nodes.map((n) => {
            const fill = n.kind === 'silver' ? '#cfd6e0' : `${C.teal}`;
            const stroke = n.kind === 'silver' ? '#94a3b8' : (currentStep >= 6 || complete) ? C.bull : C.teal;
            return (
              <g key={n.id} opacity={nodeOpacity(n)} style={{ transition: 'opacity 700ms ease' }}>
                <rect
                  x={n.x - 7} y={n.y - 3.5}
                  width="14" height="7"
                  rx="1" ry="1"
                  fill={fill}
                  stroke={stroke}
                  strokeWidth="0.4"
                  className={n.kind === 'gold-new' ? goldStateClass : ''}
                />
                <text
                  x={n.x} y={n.y + 1.2}
                  textAnchor="middle"
                  fill={n.kind === 'silver' ? C.ink : '#fff'}
                  style={{ fontSize: 2.6, fontFamily: '"JetBrains Mono", monospace', fontWeight: 700 }}
                >
                  {truncate(n.label, 22)}
                </text>
              </g>
            );
          })}
          <text x="2" y="12" fill={C.inkDim} style={{ fontSize: 2.6, letterSpacing: '0.2em', fontFamily: '"JetBrains Mono", monospace' }}>GOLD IN</text>
          <text x="98" y="12" textAnchor="end" fill={C.inkDim} style={{ fontSize: 2.6, letterSpacing: '0.2em', fontFamily: '"JetBrains Mono", monospace' }}>GOLD NEW</text>
        </svg>
        <div className="absolute left-3 bottom-2 right-3 flex items-center justify-between font-mono" style={{ fontSize: 11, color: 'var(--ink-muted)' }}>
          <span>{stepCaption(currentStep, complete)}</span>
          <span style={{ color: complete ? C.bull : C.teal }}>
            {complete ? '● live in snowflake' : currentStep >= 4 ? '◐ materializing' : currentStep >= 2 ? '◐ joins validated' : '○ discovering'}
          </span>
        </div>
      </div>
      <style>{`
        .lineage-gold-pending { filter: grayscale(0.5); }
        .lineage-gold-built  { animation: lineageBuilt 1.2s ease-out 1; }
        .lineage-gold-tested { animation: lineageTested 1.2s ease-out 1; }
        .lineage-gold-live   { animation: lineageLive 1.4s ease-in-out infinite alternate; }
        @keyframes lineageBuilt {
          0%   { transform-origin: center; transform: scale(0.6); filter: brightness(1.6); }
          100% { transform: scale(1);   filter: brightness(1); }
        }
        @keyframes lineageTested {
          0%, 100% { filter: brightness(1); }
          50%      { filter: brightness(1.4); }
        }
        @keyframes lineageLive {
          0%   { filter: drop-shadow(0 0 1px ${C.bull}88); }
          100% { filter: drop-shadow(0 0 2.5px ${C.bull}); }
        }
      `}</style>
    </div>
  );
}

function truncate(s: string, max: number): string {
  return s.length > max ? s.slice(0, max - 1) + '…' : s;
}

function stepCaption(step: number, complete: boolean): string {
  if (complete) return 'New gold table is live · Reserves Committee has the answer';
  if (step >= 6) return 'Materialized · Snowflake table written to gold schema';
  if (step >= 5) return 'Schema YAML written · column tests + uniqueness asserted';
  if (step >= 4) return 'Worker authoring · model file emerging in repo';
  if (step >= 3) return 'Worker validating proposed grain against gold tables';
  if (step >= 2) return 'Summary confirming schema · join keys · null rates';
  if (step >= 1) return 'Explorer found candidate gold tables';
  return 'Awaiting Explorer to map upstream candidates';
}

// ─────────────────────────────────────────────────────────────────────────
// BuildCompleteSummary
// ─────────────────────────────────────────────────────────────────────────

type SummaryStat = { label: string; value: string; sub?: string };

export function BuildCompleteSummary({
  seconds,
  modelCode,
  rows = 312,
  columnTests = 7,
  combinationTests = 1,
}: {
  seconds: number;
  modelCode: string;
  rows?: number;
  columnTests?: number;
  combinationTests?: number;
}) {
  const panels: { title: string; stats: SummaryStat[]; accent: string }[] = [
    {
      title: 'Time saved',
      accent: C.teal,
      stats: [
        { label: 'dbt-wizard build', value: `${seconds}s` },
        { label: 'Manual equivalent', value: '3–5 days' },
        { label: 'Speedup', value: `≈ ${Math.round((3 * 24 * 3600) / seconds)}×` },
      ],
    },
    {
      title: 'Model file',
      accent: C.rose,
      stats: [
        { label: 'Path', value: modelCode.replace('gold.', 'models/gold/'), sub: '.sql' },
        { label: 'Layer', value: 'gold' },
        { label: 'Materialization', value: 'table · Snowflake' },
      ],
    },
    {
      title: 'Tests written',
      accent: C.bull,
      stats: [
        { label: 'Column tests', value: `${columnTests}` },
        { label: 'Combination uniqueness', value: `${combinationTests}` },
        { label: 'Schema contract', value: 'enforced' },
      ],
    },
    {
      title: 'Lineage delta',
      accent: C.snow,
      stats: [
        { label: 'Upstream refs', value: '4 gold' },
        { label: 'Downstream readers', value: 'auto-discover' },
        { label: 'Snowflake snapshot', value: `+${rows.toLocaleString()} rows` },
      ],
    },
  ];
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mt-3">
      {panels.map((p) => (
        <div key={p.title} className="research-card p-4" style={{ borderTop: `3px solid ${p.accent}` }}>
          <div className="font-mono uppercase tracking-[0.18em]" style={{ fontSize: 10, color: p.accent }}>
            {p.title}
          </div>
          <div className="mt-3 space-y-2">
            {p.stats.map((s) => (
              <div key={s.label}>
                <div className="font-mono" style={{ fontSize: 9.5, color: 'var(--ink-soft)', letterSpacing: '0.12em', textTransform: 'uppercase' }}>
                  {s.label}
                </div>
                <div className="font-serif font-semibold" style={{ fontSize: 16, color: 'var(--ink-strong)', lineHeight: 1.2 }}>
                  {s.value}
                  {s.sub ? <span className="font-mono" style={{ fontSize: 11, color: 'var(--ink-muted)' }}>{s.sub}</span> : null}
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// ModelRegistry — Insurance dbt model layout
// ─────────────────────────────────────────────────────────────────────────

type RegistryGroup = { layer: string; color: string; total: number; sample: string[]; };

const REGISTRY: RegistryGroup[] = [
  { layer: 'bronze', color: C.fivetran, total: 8,  sample: ['stg_oracle_pas__policy', 'stg_oracle_pas__premium', 'stg_claims__claim', 'stg_claims__payment', 'stg_naic__filings'] },
  { layer: 'silver', color: '#94a3b8',  total: 4,  sample: ['int_policy_spine', 'int_claim_enriched', 'int_cat_event_xref', 'int_carrier_financials'] },
  { layer: 'gold',   color: C.teal,    total: 9,  sample: ['fct_claim', 'dim_policy', 'fct_premium', 'dim_peril', 'mart_carrier_risk'] },
];

export function ModelRegistry({ newModelCode }: { newModelCode: string }) {
  const newLabel = newModelCode.replace(/^gold\./, '');
  return (
    <div className="research-card p-5">
      <div className="eyebrow mb-2">Model registry · 22 total</div>
      <h3 className="font-serif text-lg font-semibold mb-3" style={{ color: C.ink }}>
        Where the new model lands
      </h3>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {REGISTRY.map((g) => (
          <div key={g.layer} className="research-card p-3" style={{ borderTop: `3px solid ${g.color}` }}>
            <div className="flex items-baseline justify-between mb-2">
              <span className="font-mono uppercase tracking-[0.16em]" style={{ fontSize: 10, color: g.color, fontWeight: 700 }}>
                {g.layer}
              </span>
              <span className="font-mono" style={{ fontSize: 10, color: 'var(--ink-soft)' }}>
                {g.total} models
              </span>
            </div>
            <ul className="space-y-1">
              {g.sample.map((m) => (
                <li key={m} className="font-mono truncate" style={{ fontSize: 11, color: 'var(--ink-muted)' }}>
                  {m}
                </li>
              ))}
              {g.layer === 'gold' ? (
                <li
                  className="font-mono truncate registry-new"
                  style={{
                    fontSize: 11,
                    color: C.dbt,
                    fontWeight: 700,
                  }}
                  title={newModelCode}
                >
                  + {newLabel}
                </li>
              ) : null}
            </ul>
          </div>
        ))}
      </div>
      <p className="mt-3 font-mono" style={{ fontSize: 11, color: 'var(--ink-soft)' }}>
        Every column-level test, lineage edge, and ownership tag travels with the new model.
        Downstream consumers — cat-loss dashboards, reserves briefs, reinsurance pricing feeds — pick it up on next read.
      </p>
      <style>{`
        .registry-new {
          animation: regNewIn 1.6s ease-out 1;
          background: linear-gradient(90deg, ${C.dbt}26 0%, ${C.dbt}00 100%);
          padding: 2px 4px;
          border-radius: 2px;
        }
        @keyframes regNewIn {
          0%   { transform: translateX(-8px); opacity: 0; }
          100% { transform: translateX(0);    opacity: 1; }
        }
      `}</style>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// LiveBuildThumbnail — Insurance-adapted preview
// ─────────────────────────────────────────────────────────────────────────

const FRAMES = [
  { agent: 'EXPLORER',     color: C.teal,   line1: 'dbt search "cat wind severity tier-2"', line2: 'found 4 gold candidates' },
  { agent: 'WORKER',       color: C.rose,   line1: 'authoring fct_cat_wind_severity_….sql', line2: 'dbt_show ran on XS warehouse' },
  { agent: 'VERIFICATION', color: C.bull,   line1: 'dbt test --select +new',                line2: '9 tests passed · materialized' },
];

export function LiveBuildThumbnail() {
  const [i, setI] = useState(0);
  const timer = useRef<number | null>(null);

  useEffect(() => {
    timer.current = window.setInterval(() => {
      setI((x) => (x + 1) % FRAMES.length);
    }, 2200);
    return () => { if (timer.current) clearInterval(timer.current); };
  }, []);

  const f = FRAMES[i];
  return (
    <div
      className="live-thumb"
      aria-hidden
      style={{
        background: '#0b1424',
        border: `1px solid ${C.teal}55`,
        borderRadius: 6,
        padding: '14px 16px',
        fontFamily: '"JetBrains Mono", monospace',
        color: '#e8edf8',
        minHeight: 92,
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      <div className="flex items-center gap-2 mb-2">
        <span
          style={{
            display: 'inline-block', width: 8, height: 8, borderRadius: 999,
            background: f.color, animation: 'signal-pulse 1.6s ease-in-out infinite',
          }}
        />
        <span style={{ color: f.color, fontWeight: 700, fontSize: 11, letterSpacing: '0.16em' }}>{f.agent}</span>
        <span style={{ color: '#5a7099', fontSize: 11, marginLeft: 'auto' }}>
          {i + 1}/{FRAMES.length}
        </span>
      </div>
      <div style={{ fontSize: 13, color: '#9cb3d2' }}>$ {f.line1}</div>
      <div style={{ fontSize: 13, color: '#cbe0d3', marginTop: 2 }}>&#8627; {f.line2}</div>
    </div>
  );
}

// Need React in scope for JSX
import React from 'react';
