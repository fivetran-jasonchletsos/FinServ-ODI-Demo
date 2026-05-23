/*
 * WizardVisuals — hero visualizations for the dbt-wizard pages.
 * Ported from Healthcare-EPIC-Snowflake-Demo for Altavest Capital buy-side demo.
 *
 * Components:
 *   LineagePanel         — live-evolving lineage graph for WizardLivePage
 *   BuildCompleteSummary — 4-pane summary for build-complete panel
 *
 * Zero-dep SVG and CSS. Aligned with the Altavest navy/gold palette.
 */

import { useMemo } from 'react';
import type { WizardScenario } from './wizardTypes';

// ─────────────────────────────────────────────────────────────────────────
// Vendor / accent tokens — aligned with Altavest FinServ palette
// ─────────────────────────────────────────────────────────────────────────

const C = {
  fivetran: '#0073EA',
  iceberg:  '#7C3AED',
  dbt:      '#FF694A',
  snow:     '#29B5E8',
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
            color: C.iceberg, background: `${C.iceberg}12`, border: `1px solid ${C.iceberg}55`,
            fontSize: 10, padding: '3px 8px', fontWeight: 700,
          }}>
            snowflake-resolved
          </span>
        </div>
        <span className="font-mono" style={{ color: 'var(--ink-soft)', fontSize: 12 }}>
          {nodes.filter((n) => n.kind === 'silver').length} gold upstream → 1 new gold
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
          <text x="2" y="12" fill={C.inkDim} style={{ fontSize: 2.6, letterSpacing: '0.2em', fontFamily: '"JetBrains Mono", monospace' }}>GOLD UPSTREAM</text>
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
  if (complete) return 'New gold table is live · downstream consumers see it on next read';
  if (step >= 6) return 'Materialized · Snowflake Iceberg written to gold schema';
  if (step >= 5) return 'Schema YAML written · column tests + uniqueness asserted';
  if (step >= 4) return 'Worker authoring · model file emerging in repo';
  if (step >= 3) return 'Worker validating proposed grain against gold upstream tables';
  if (step >= 2) return 'Summary confirming schema · join keys · null rates';
  if (step >= 1) return 'Explorer found candidate gold upstream models';
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
      accent: C.iceberg,
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

