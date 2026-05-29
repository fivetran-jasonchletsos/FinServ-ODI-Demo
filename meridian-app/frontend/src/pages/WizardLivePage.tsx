/*
 * WizardLivePage — dbt-wizard live-build playback for Altavest Capital.
 *
 * Architecture: step rail + sub-agent narration panel + SQL panel + YAML panel
 * + Play/Pause/Speed controls. Ported from Healthcare-EPIC-Snowflake-Demo.
 *
 * Aesthetic: dark terminal surface (navy). Fits a 1728x1117 laptop with no page scroll.
 * Layout locked by calc(100dvh - 440px) on the two main panels.
 * Autoscroll uses direct scrollTop assignment — NOT scrollIntoView.
 */

import React from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import AgentAvatar from '../components/AgentAvatar';
import { wizardDataUrl } from '../components/wizardTypes';
import type { WizardAgent, AgentId, BuildEvent, WizardScenario } from '../components/wizardTypes';
import { LineagePanel, BuildCompleteSummary } from '../components/WizardVisuals';

// Timing constants — scale by speed control.
const NARR_TYPE_MS = 14;
const CODE_TYPE_MS = 4;
const POST_NARR_DELAY_MS = 550;
const POST_CODE_DELAY_MS = 350;
const SPEEDS = [1, 2, 4] as const;

interface RevealState {
  cursor: number;
  narrTyped: number;
  codeTyped: number;
  sqlSoFar: string;
  yamlSoFar: string;
  sideEffects: string[];
}

const INITIAL: RevealState = {
  cursor: 0,
  narrTyped: 0,
  codeTyped: 0,
  sqlSoFar: '',
  yamlSoFar: '',
  sideEffects: [],
};

const STEP_DEFS = [
  { label: 'Discovery',            who: 'Explorer',     tools: 'status, search',          insight: '4 gold candidates'    },
  { label: 'Schema Understanding', who: 'Summary',      tools: 'describe, lineage',       insight: '16 cols · 0 null keys'},
  { label: 'Data Inspection',      who: 'Worker',       tools: 'warehouse, dbt_show',     insight: 'XS warehouse slice'   },
  { label: 'Model Creation',       who: 'Worker',       tools: 'file edits, model gen',   insight: 'SQL authored'         },
  { label: 'Test Authoring',       who: 'Verification', tools: 'describe, dbt_show',      insight: '7 tests + uniqueness' },
  { label: 'Materialization',      who: 'Worker + Ver', tools: 'dbt_run, lineage',        insight: '312 rows · iceberg'   },
];

// Agent accent colors aligned with Altavest palette
const AGENT_STEP_COLOR: Record<string, string> = {
  explorer:     '#0d9488',
  summary:      '#7c3aed',
  worker:       '#be185d',
  verification: '#145e36',
  system:       '#5a6c84',
};

export default function WizardLivePage() {
  const location = useLocation();
  const questionFromNav: string | undefined = (location.state as { question?: string } | null)?.question;

  const [agents, setAgents]     = useState<WizardAgent[]>([]);
  const [scenario, setScenario] = useState<WizardScenario | null>(null);
  const [events, setEvents]     = useState<BuildEvent[]>([]);
  const [state, setState]       = useState<RevealState>(INITIAL);
  const [playing, setPlaying]   = useState(true);
  const [speed, setSpeed]       = useState<typeof SPEEDS[number]>(1);
  const [complete, setComplete] = useState(false);

  const narrBottomRef = useRef<HTMLDivElement | null>(null);
  const codeBottomRef  = useRef<HTMLDivElement | null>(null);
  const yamlBottomRef  = useRef<HTMLDivElement | null>(null);
  const narrPanelRef = useRef<HTMLDivElement | null>(null);
  const codePanelRef = useRef<HTMLPreElement | null>(null);
  const yamlPanelRef = useRef<HTMLPreElement | null>(null);

  // Load playback data
  useEffect(() => {
    Promise.all([
      fetch(wizardDataUrl('agents.json')).then(r => { if (!r.ok) throw new Error(`agents.json ${r.status}`); return r.json(); }),
      fetch(wizardDataUrl('scenario.json')).then(r => { if (!r.ok) throw new Error(`scenario.json ${r.status}`); return r.json(); }),
      fetch(wizardDataUrl('build_script.json')).then(r => { if (!r.ok) throw new Error(`build_script.json ${r.status}`); return r.json(); }),
    ]).then(([a, s, b]) => {
      setAgents(a.agents);
      setScenario(s);
      setEvents(b.events);
    }).catch(() => {});
  }, []);

  const agentById = useMemo(() => {
    const m: Record<string, WizardAgent> = {};
    for (const a of agents) m[a.id] = a;
    return m;
  }, [agents]);

  const currentEvent: BuildEvent | undefined = events[state.cursor];
  const totalSteps = useMemo(() => {
    if (events.length === 0) return 6;
    return Math.max(...events.map(e => e.step));
  }, [events]);

  // Phase machine: type narration → type code (if any) → advance
  useEffect(() => {
    if (!playing || !currentEvent) {
      if (events.length > 0 && state.cursor >= events.length && !complete) {
        setComplete(true);
      }
      return;
    }
    // Phase 1: type narration
    if (state.narrTyped < currentEvent.body.length) {
      const id = setTimeout(() => {
        setState(s => ({ ...s, narrTyped: s.narrTyped + 1 }));
      }, Math.max(2, Math.floor(NARR_TYPE_MS / speed)));
      return () => clearTimeout(id);
    }
    // Phase 2: type code if any
    const code = currentEvent.code_append ?? '';
    if (code.length > 0 && state.codeTyped < code.length) {
      const id = setTimeout(() => {
        setState(s => {
          const nextTyped = s.codeTyped + 1;
          const charsToAdd = code.slice(s.codeTyped, nextTyped);
          if (currentEvent.code_target === 'yaml') {
            return { ...s, codeTyped: nextTyped, yamlSoFar: s.yamlSoFar + charsToAdd };
          }
          return { ...s, codeTyped: nextTyped, sqlSoFar: s.sqlSoFar + charsToAdd };
        });
      }, Math.max(1, Math.floor(CODE_TYPE_MS / speed)));
      return () => clearTimeout(id);
    }
    // Phase 3: commit side effect + advance cursor
    const postDelay = code.length > 0 ? POST_CODE_DELAY_MS : POST_NARR_DELAY_MS;
    const id = setTimeout(() => {
      setState(s => {
        const next: RevealState = { ...s, cursor: s.cursor + 1, narrTyped: 0, codeTyped: 0 };
        if (currentEvent.side_effect) {
          next.sideEffects = [currentEvent.side_effect, ...s.sideEffects].slice(0, 8);
        }
        return next;
      });
    }, Math.max(80, Math.floor(postDelay / speed)));
    return () => clearTimeout(id);
  }, [playing, speed, currentEvent, state.narrTyped, state.codeTyped, state.cursor, events.length, complete]);

  // Autoscroll panels by setting scrollTop directly — never scroll the window.
  useEffect(() => {
    const el = narrPanelRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [state.cursor, state.narrTyped]);
  useEffect(() => {
    const el = codePanelRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [state.sqlSoFar]);
  useEffect(() => {
    const el = yamlPanelRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [state.yamlSoFar]);

  const reset = () => { setState(INITIAL); setComplete(false); setPlaying(true); };
  const cycleSpeed = () => { const i = SPEEDS.indexOf(speed); setSpeed(SPEEDS[(i + 1) % SPEEDS.length]); };

  if (!scenario || agents.length === 0 || events.length === 0) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-12">
        <div className="eyebrow">dbt-wizard live build</div>
        <p className="text-[var(--ink-muted)] mt-2 font-mono text-sm">Loading build playback...</p>
      </div>
    );
  }

  const currentStep      = currentEvent?.step ?? totalSteps;
  const currentStepLabel = currentEvent?.step_label ?? 'Materialization';
  const activeAgentId: AgentId | undefined =
    currentEvent && state.narrTyped < currentEvent.body.length ? currentEvent.from : undefined;

  const visibleNarr = events.slice(0, Math.min(state.cursor + 1, events.length)).map((e, idx) => {
    const isCurrent = idx === state.cursor;
    const body = isCurrent ? e.body.slice(0, state.narrTyped) : e.body;
    return { e, body, isCurrent };
  });

  const displayQuestion = questionFromNav ?? scenario.question;

  return (
    <div className="wizard-terminal mx-auto max-w-[1640px] px-4 py-4 sm:px-6 lg:px-8">

      {/* ── Control bar ── */}
      <div
        className="mb-3 px-4 py-2.5 flex flex-wrap items-center justify-between gap-3 sticky top-20 z-20"
        style={{
          background: 'var(--card)',
          border: '1px solid var(--hairline)',
          borderLeft: '4px solid var(--gold)',
          borderRadius: '0.25rem',
          boxShadow: '0 2px 8px rgba(11,39,68,0.08)',
        }}
      >
        <div className="flex items-center gap-3 flex-wrap">
          <span
            className="status-pill"
            style={{
              display: 'inline-flex', alignItems: 'center', gap: '0.45rem', fontSize: 12, padding: '4px 10px', fontWeight: 700,
              background: 'rgba(184,151,92,0.10)', color: 'var(--gold)', border: '1px solid rgba(184,151,92,0.35)',
            }}
          >
            <span
              style={{
                display: 'inline-block', width: 8, height: 8, borderRadius: 999,
                background: 'var(--gold)',
                animation: complete ? 'none' : 'signal-pulse 1.8s ease-in-out infinite',
              }}
            />
            {complete ? 'Build Complete' : 'Build Active'}
          </span>
          <span className="eyebrow" style={{ fontSize: 12 }}>{scenario.request_id}</span>
          <span className="font-mono" style={{ color: 'var(--ink-muted)', fontSize: 13 }}>
            Step{' '}
            <span style={{ color: 'var(--gold)', fontWeight: 700 }}>{currentStep}/{totalSteps}</span>
            <span className="mx-2" style={{ color: 'var(--ink-soft)' }}>·</span>
            <span style={{ color: 'var(--ink)' }}>{currentStepLabel}</span>
          </span>
          <div
            aria-hidden
            style={{
              width: 160, height: 6, borderRadius: 999,
              background: 'var(--paper-deep)', overflow: 'hidden',
              border: '1px solid var(--hairline)',
            }}
          >
            <div
              style={{
                width: `${Math.min(100, Math.max(0, Math.round(((complete ? events.length : state.cursor) / Math.max(1, events.length)) * 100)))}%`,
                height: '100%',
                background: complete ? 'var(--bull)' : 'var(--gold)',
                transition: 'width 220ms ease, background 200ms ease',
              }}
            />
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            className="inline-flex items-center gap-1.5 rounded-sm font-semibold border transition-colors"
            style={{ background: 'var(--paper-deep)', borderColor: 'var(--hairline)', color: 'var(--ink)', padding: '7px 14px', fontSize: 13 }}
            onClick={() => setPlaying(p => !p)}
            disabled={complete}
          >
            {playing ? 'Pause' : 'Play'}
          </button>
          <button
            className="inline-flex items-center gap-1.5 rounded-sm font-semibold border transition-colors"
            style={{ background: 'var(--paper-deep)', borderColor: 'var(--hairline)', color: 'var(--ink)', padding: '7px 14px', fontSize: 13 }}
            onClick={cycleSpeed}
          >
            {speed}x
          </button>
          <button
            className="inline-flex items-center gap-1.5 rounded-sm font-semibold border transition-colors"
            style={{ background: 'var(--paper-deep)', borderColor: 'var(--hairline)', color: 'var(--ink)', padding: '7px 14px', fontSize: 13 }}
            onClick={reset}
          >
            Restart
          </button>
          <Link
            to="/scenario"
            className="inline-flex items-center gap-1.5 rounded-sm font-semibold border transition-colors"
            style={{ background: 'var(--paper-deep)', borderColor: 'var(--hairline)', color: 'var(--ink)', padding: '7px 14px', fontSize: 13 }}
          >
            Back
          </Link>
        </div>
      </div>

      {/* ── Question + metric target (compact single row) ── */}
      <div
        className="mb-3 px-4 py-2.5 research-card border-l-4 flex items-center gap-5 flex-wrap"
        style={{ borderLeftColor: 'var(--gold)' }}
      >
        <div className="min-w-0 flex-shrink" style={{ flex: '1 1 460px' }}>
          <div className="eyebrow" style={{ fontSize: 10, marginBottom: 2, color: 'var(--gold)' }}>
            Equity Research · {scenario.timezone_label} · {scenario.requested_by}
          </div>
          <p
            className="font-serif font-medium text-[var(--ink-strong)] leading-snug truncate"
            style={{ fontSize: 16 }}
            title={displayQuestion}
          >
            "{displayQuestion}"
          </p>
        </div>
        <div className="font-mono text-[var(--ink-muted)] shrink-0" style={{ fontSize: 11 }}>
          Target: <span style={{ color: 'var(--gold)', fontWeight: 700 }}>{scenario.metric_code}</span>
        </div>
      </div>

      {/* ── Step rail (compact single-line) ── */}
      <div className="mb-3 grid gap-1.5" style={{ gridTemplateColumns: 'repeat(6, minmax(0, 1fr))' }}>
        {STEP_DEFS.map((s, idx) => {
          const num    = idx + 1;
          const done   = currentStep > num || (currentStep === num && complete);
          const active = currentStep === num && !complete;
          const accentColor = active
            ? 'var(--gold)'
            : done
            ? 'var(--bull)'
            : 'var(--hairline)';
          return (
            <div
              key={s.label}
              className="research-card px-2.5 py-2 flex flex-col gap-0.5"
              style={{
                borderLeft: `4px solid ${accentColor}`,
                background: active
                  ? 'rgba(184,151,92,0.06)'
                  : done
                  ? 'rgba(20,94,54,0.06)'
                  : 'var(--paper-deep)',
              }}
              title={`${s.who} · ${s.tools}`}
            >
              <div
                className="font-mono font-bold flex items-center gap-1.5"
                style={{
                  fontSize: 10, letterSpacing: '0.04em',
                  color: active ? 'var(--gold)' : done ? 'var(--bull)' : 'var(--ink-soft)',
                }}
              >
                <span>STEP {String(num).padStart(2, '0')}</span>
                <span style={{ opacity: 0.6 }}>·</span>
                <span>{done ? 'DONE' : active ? 'NOW' : 'WAIT'}</span>
              </div>
              <div className="font-semibold text-[var(--ink-strong)] truncate" style={{ fontSize: 13, lineHeight: 1.15 }}>
                {s.label}
              </div>
              <div
                className="font-mono truncate"
                style={{
                  fontSize: 10, lineHeight: 1.25,
                  color: active ? 'var(--gold)' : done ? 'var(--bull)' : 'var(--ink-soft)',
                  opacity: done || active ? 0.95 : 0.55,
                }}
                title={s.insight}
              >
                {s.insight}
              </div>
            </div>
          );
        })}
      </div>

      <div
        className="grid gap-4"
        style={{ gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1.25fr)' }}
      >

        {/* ── LEFT: Sub-agent narration ── */}
        <section
          className="research-card flex flex-col lg:!h-[calc(100dvh-440px)]"
          style={{ minHeight: 'max(60vh, 300px)' }}
        >
          <header
            className="px-5 py-3 border-b flex items-center justify-between"
            style={{ borderColor: 'var(--hairline)' }}
          >
            <div>
              <div className="eyebrow" style={{ fontSize: 11 }}>Sub-agent narration</div>
              <div className="font-mono mt-0.5 text-[var(--ink-muted)]" style={{ fontSize: 12 }}>
                {scenario.company} · dbt-wizard live build
              </div>
            </div>
            <div className="flex items-center gap-2">
              {agents.map(a => (
                <AgentAvatar key={a.id} agent={a} active={activeAgentId === a.id} size={36} />
              ))}
            </div>
          </header>

          <div
            ref={narrPanelRef}
            className="px-5 py-4 overflow-y-auto flex-1"
            style={{ background: 'var(--paper)', overscrollBehavior: 'contain', fontSize: 14, lineHeight: 1.55 }}
          >
            {visibleNarr.map((m, idx) => {
              const a     = agentById[m.e.from];
              const color = a?.color ?? AGENT_STEP_COLOR[m.e.from] ?? '#0d9488';
              const isTyping = m.isCurrent && playing && state.narrTyped < m.e.body.length;
              return (
                <div
                  key={idx}
                  data-wizard-card="narr"
                  style={{
                    borderLeft: `3px solid ${color}`,
                    paddingLeft: 12,
                    borderTopRightRadius: 4,
                    borderBottomRightRadius: 4,
                    marginBottom: 10,
                    border: `1px solid var(--hairline-soft)`,
                    borderLeftColor: color,
                    borderLeftWidth: 3,
                  }}
                >
                  <div style={{ display: 'flex', gap: 12, padding: '12px 14px 12px 0' }}>
                    <div style={{ paddingTop: 2, flexShrink: 0 }}>
                      <AgentAvatar agent={a} active={isTyping} size={40} />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div className="flex items-center gap-2 flex-wrap mb-1.5">
                        <span
                          className="font-mono font-semibold"
                          style={{ color, fontSize: 13, letterSpacing: '0.02em' }}
                        >
                          {a?.name ?? m.e.from}
                        </span>
                        <span
                          className="status-pill"
                          style={{
                            fontSize: 10, padding: '2px 7px', fontWeight: 700,
                            background: 'rgba(184,151,92,0.10)', color: 'var(--gold)',
                            border: '1px solid rgba(184,151,92,0.35)',
                          }}
                        >
                          STEP {m.e.step}
                        </span>
                        <span className="font-mono text-[var(--ink-soft)]" style={{ fontSize: 11 }}>
                          {m.e.step_label}
                        </span>
                      </div>
                      <div
                        className={isTyping ? 'wizard-chat-bubble wizard-chat-cursor' : 'wizard-chat-bubble'}
                        style={{ color: 'var(--ink)', fontSize: 14.5, lineHeight: 1.55 }}
                      >
                        {m.body}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
            <div ref={narrBottomRef} />
          </div>
        </section>

        {/* ── RIGHT: Live code panels ── */}
        <section className="flex flex-col gap-3 lg:!h-[calc(100dvh-440px)]" style={{ minHeight: 'max(60vh, 300px)' }}>

          {/* SQL panel */}
          <div className="research-card flex flex-col" style={{ flex: '1.7 1 0' }}>
            <header
              className="px-5 py-3 border-b flex items-center justify-between"
              style={{ borderColor: 'var(--hairline)' }}
            >
              <div className="flex items-center gap-3 flex-wrap min-w-0">
                <div className="eyebrow font-mono" style={{ fontSize: 11, letterSpacing: '0.02em' }}>
                  models/gold/fct_regional_bank_macro_attribution_daily.sql
                </div>
                <span
                  className="layer-chip"
                  style={{
                    color: '#be185d', background: 'rgba(190,24,93,0.07)',
                    border: '1px solid rgba(190,24,93,0.3)',
                    fontSize: 10, padding: '3px 8px', fontWeight: 700, whiteSpace: 'nowrap',
                  }}
                >
                  Worker authoring
                </span>
              </div>
              <span className="font-mono text-[var(--ink-soft)]" style={{ fontSize: 12, whiteSpace: 'nowrap' }}>
                {state.sqlSoFar.length.toLocaleString()} chars
              </span>
            </header>
            <pre
              ref={codePanelRef}
              className="flex-1"
              style={{
                fontFamily: '"JetBrains Mono", monospace',
                fontSize: 14, lineHeight: 1.6,
                background: '#0b1829', color: '#e8edf8',
                border: 'none', margin: 0, padding: '1.25rem',
                overflowX: 'auto', overflowY: 'auto',
                whiteSpace: 'pre', tabSize: 2,
                overscrollBehavior: 'contain',
                borderBottomLeftRadius: '0.25rem',
                borderBottomRightRadius: '0.25rem',
              }}
            >
              {state.sqlSoFar.length === 0 ? (
                <span style={{ color: '#5a7099' }}>{'-- waiting for Worker to begin authoring...'}</span>
              ) : (
                <SyntaxSql
                  text={state.sqlSoFar}
                  cursor={
                    currentEvent?.code_target === 'sql' &&
                    state.codeTyped > 0 &&
                    state.codeTyped < (currentEvent.code_append?.length ?? 0)
                  }
                />
              )}
              <div ref={codeBottomRef} />
            </pre>
          </div>

          {/* YAML panel */}
          <div className="research-card flex flex-col" style={{ flex: '1 1 0' }}>
            <header
              className="px-5 py-3 border-b flex items-center justify-between"
              style={{ borderColor: 'var(--hairline)' }}
            >
              <div className="flex items-center gap-3 flex-wrap min-w-0">
                <div className="eyebrow font-mono" style={{ fontSize: 11, letterSpacing: '0.02em' }}>
                  models/gold/fct_regional_bank_macro_attribution_daily.yml
                </div>
                <span
                  className="layer-chip"
                  style={{
                    color: '#145e36', background: 'rgba(20,94,54,0.07)',
                    border: '1px solid rgba(20,94,54,0.3)',
                    fontSize: 10, padding: '3px 8px', fontWeight: 700, whiteSpace: 'nowrap',
                  }}
                >
                  Verification authoring
                </span>
              </div>
              <span className="font-mono text-[var(--ink-soft)]" style={{ fontSize: 12, whiteSpace: 'nowrap' }}>
                {state.yamlSoFar.length.toLocaleString()} chars
              </span>
            </header>
            <pre
              ref={yamlPanelRef}
              className="flex-1"
              style={{
                fontFamily: '"JetBrains Mono", monospace',
                fontSize: 14, lineHeight: 1.6,
                background: '#0b1829', color: '#e8edf8',
                border: 'none', margin: 0, padding: '1.25rem',
                overflowX: 'auto', overflowY: 'auto',
                whiteSpace: 'pre', tabSize: 2,
                overscrollBehavior: 'contain',
                borderBottomLeftRadius: '0.25rem',
                borderBottomRightRadius: '0.25rem',
              }}
            >
              {state.yamlSoFar.length === 0 ? (
                <span style={{ color: '#5a7099' }}>{'# waiting for Verification (step 5)...'}</span>
              ) : (
                <SyntaxYaml
                  text={state.yamlSoFar}
                  cursor={
                    currentEvent?.code_target === 'yaml' &&
                    state.codeTyped > 0 &&
                    state.codeTyped < (currentEvent.code_append?.length ?? 0)
                  }
                />
              )}
              <div ref={yamlBottomRef} />
            </pre>
          </div>

        </section>
      </div>

      {/* ── Full-width lineage panel ── */}
      <div className="mt-3">
        <LineagePanel
          currentStep={currentStep}
          complete={complete}
          scenario={scenario}
        />
      </div>

      {/* ── Full-width tool side effects ticker (compact) ── */}
      <div className="research-card mt-2 px-3 py-2 flex items-center gap-3">
        <div className="eyebrow shrink-0" style={{ fontSize: 10 }}>tool calls</div>
        {state.sideEffects.length === 0 ? (
          <div className="font-mono text-[var(--ink-soft)]" style={{ fontSize: 11.5 }}>Awaiting first tool call...</div>
        ) : (
          <ul className="flex items-center gap-x-4 gap-y-1 flex-wrap min-w-0">
            {state.sideEffects.slice(0, 4).map((s, i) => (
              <li
                key={`${s}-${i}`}
                className="flex items-center gap-1.5 font-mono text-[var(--ink)] truncate"
                style={{ fontSize: 11.5, maxWidth: '32ch' }}
                title={s}
              >
                <span
                  style={{
                    display: 'inline-block', width: 7, height: 7, borderRadius: 999, flexShrink: 0,
                    background: i === 0 ? 'var(--gold)' : 'var(--ink-soft)',
                    animation: i === 0 ? 'signal-pulse 1.8s ease-in-out infinite' : 'none',
                  }}
                />
                <span className="truncate">{s}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* ── Build complete: 4-pane summary ── */}
      {complete && (
        <div
          className="mt-6 research-card p-5"
          style={{
            borderLeft: '5px solid var(--bull)',
            background: 'rgba(20,94,54,0.06)',
          }}
        >
          <div className="flex items-baseline justify-between flex-wrap gap-3 mb-1">
            <div className="flex items-baseline gap-3 flex-wrap">
              <div
                className="status-pill shrink-0"
                style={{
                  display: 'inline-flex', fontSize: 12, padding: '4px 10px', fontWeight: 700,
                  background: 'rgba(20,94,54,0.12)', color: 'var(--bull)',
                  border: '1px solid rgba(20,94,54,0.35)',
                }}
              >
                Build Complete
              </div>
              <span className="eyebrow" style={{ fontSize: 11 }}>{scenario.request_id} · {scenario.company}</span>
            </div>
            <Link
              to="/outcome"
              className="inline-flex items-center gap-2 rounded-sm font-semibold transition-colors"
              style={{
                background: 'var(--navy-deep)', color: '#fff',
                padding: '10px 18px', fontSize: 13,
              }}
            >
              See the outcome
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <path d="M5 12h14M13 5l7 7-7 7" />
              </svg>
            </Link>
          </div>
          <BuildCompleteSummary
            seconds={scenario.build_room_seconds}
            modelCode={scenario.metric_code}
            rows={312}
            columnTests={7}
            combinationTests={1}
          />
        </div>
      )}

      {/* Inline styles for wizard-specific primitives */}
      <style>{`
        @keyframes signal-pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.28; }
        }

        /* ── Terminal aesthetic ── */
        .wizard-terminal {
          --t-bg:       #0a1424;
          --t-surface:  #0f1f36;
          --t-elev:     #142844;
          --t-line:     #1f3559;
          --t-line-soft:#15294a;
          --t-text:     #e6edf8;
          --t-text-dim: #b6c6dd;
          --t-text-soft:#7a90b3;
          --t-accent:   #d4af75;
          --t-accent-2: #a78bfa;
          --t-ok:       #4ade80;
          --t-warn:     #fb923c;
          background: var(--t-bg);
          color: var(--t-text);
          font-family: "JetBrains Mono", ui-monospace, monospace;
          border-radius: 10px;
          border: 1px solid var(--t-line);
          padding-top: 28px;
          position: relative;
          margin-top: 4px;
          margin-bottom: 12px;
          box-shadow: 0 18px 40px -22px rgba(0, 0, 0, 0.55);
        }
        /* Window chrome — traffic lights + filename */
        .wizard-terminal::before {
          content: '';
          position: absolute;
          top: 0; left: 0; right: 0;
          height: 28px;
          background: linear-gradient(180deg, #0d1c33, #0a1424);
          border-bottom: 1px solid var(--t-line);
          border-top-left-radius: 9px;
          border-top-right-radius: 9px;
        }
        .wizard-terminal::after {
          content: 'altavest-capital/wizard-live · dbt-wizard';
          position: absolute;
          top: 0; left: 0; right: 0;
          height: 28px;
          display: flex;
          align-items: center;
          font-size: 11.5px;
          font-family: "JetBrains Mono", monospace;
          background:
            radial-gradient(circle at 14px 14px, #ff5f57 5px, transparent 5.5px),
            radial-gradient(circle at 30px 14px, #febc2e 5px, transparent 5.5px),
            radial-gradient(circle at 46px 14px, #28c940 5px, transparent 5.5px);
          color: var(--t-text-dim);
          text-indent: 64px;
          letter-spacing: 0.02em;
          pointer-events: none;
        }
        .wizard-terminal > * { position: relative; z-index: 1; }

        /* Override the light card base inside the terminal */
        .wizard-terminal .research-card {
          background: var(--t-surface) !important;
          border-color: var(--t-line) !important;
          color: var(--t-text);
          box-shadow: none;
        }
        .wizard-terminal .research-card header,
        .wizard-terminal .research-card > .border-b {
          border-color: var(--t-line) !important;
          background: var(--t-elev);
        }
        /* Inner narration scroll surface */
        .wizard-terminal .research-card > div[style*="background: var(--paper)"] {
          background: var(--t-bg) !important;
        }
        /* Narration chat cards */
        .wizard-terminal [data-wizard-card="narr"] {
          background: var(--t-elev) !important;
          border-color: var(--t-line-soft) !important;
          color: var(--t-text) !important;
        }
        .wizard-terminal [data-wizard-card="narr"] .wizard-chat-bubble {
          color: var(--t-text) !important;
        }
        .wizard-terminal [data-wizard-card="narr"] .font-mono {
          color: var(--t-text-dim) !important;
        }
        /* Generic text recolor */
        .wizard-terminal h1,
        .wizard-terminal h2,
        .wizard-terminal h3,
        .wizard-terminal p,
        .wizard-terminal span,
        .wizard-terminal div,
        .wizard-terminal li {
          color: inherit;
        }
        .wizard-terminal .text-\\[var\\(--ink\\)\\],
        .wizard-terminal [style*="color: var(--ink)"] { color: var(--t-text) !important; }
        .wizard-terminal .text-\\[var\\(--ink-strong\\)\\],
        .wizard-terminal [style*="color: var(--ink-strong)"] { color: var(--t-text) !important; }
        .wizard-terminal .text-\\[var\\(--ink-muted\\)\\],
        .wizard-terminal [style*="color: var(--ink-muted)"] { color: var(--t-text-dim) !important; }
        .wizard-terminal .text-\\[var\\(--ink-soft\\)\\],
        .wizard-terminal [style*="color: var(--ink-soft)"] { color: var(--t-text-soft) !important; }
        .wizard-terminal [style*="color: var(--gold)"] { color: var(--t-accent) !important; }

        /* Status pills: dim on dark */
        .wizard-terminal .status-pill,
        .wizard-terminal .layer-chip {
          background: rgba(212,175,117,0.12) !important;
          border-color: rgba(212,175,117,0.35) !important;
          color: var(--t-accent) !important;
        }
        /* Buttons on dark */
        .wizard-terminal button,
        .wizard-terminal a[class*="rounded-sm"] {
          background: var(--t-elev) !important;
          color: var(--t-text) !important;
          border-color: var(--t-line) !important;
        }
        .wizard-terminal button:hover,
        .wizard-terminal a[class*="rounded-sm"]:hover {
          background: var(--t-line) !important;
          border-color: var(--t-accent) !important;
        }
        /* Eyebrow */
        .wizard-terminal .eyebrow {
          color: var(--t-accent) !important;
          opacity: 0.85;
        }
        /* Step rail active/done tiles */
        .wizard-terminal .research-card[style*="rgba(184,151,92"] {
          background: rgba(212,175,117,0.10) !important;
        }
        .wizard-terminal .research-card[style*="rgba(20,94,54"] {
          background: rgba(74,222,128,0.10) !important;
        }
        .wizard-terminal .research-card[style*="var(--paper-deep)"] {
          background: var(--t-surface) !important;
        }
        /* Code panels */
        .wizard-terminal pre {
          background: var(--t-bg) !important;
          border-top: 1px solid var(--t-line);
          color: #d6e3f6 !important;
        }
        /* Question banner */
        .wizard-terminal .research-card.border-l-4 {
          border-left-color: var(--t-accent) !important;
        }
        /* Progress bar background */
        .wizard-terminal div[style*="background: var(--paper-deep)"] {
          background: var(--t-elev) !important;
          border-color: var(--t-line) !important;
        }
        /* Avatar chip */
        .wizard-terminal .wizard-agent-avatar {
          background: rgba(10,20,36,0.6) !important;
          border-color: rgba(120,150,200,0.35) !important;
        }
        .wizard-terminal .wizard-agent-avatar[data-active="true"] {
          background: var(--t-bg) !important;
        }
        .wizard-chat-bubble {
          font-family: "JetBrains Mono", monospace;
          font-size: 14px;
          line-height: 1.6;
          white-space: pre-wrap;
          word-break: break-word;
          color: var(--ink);
        }
        .wizard-terminal .wizard-chat-bubble {
          color: var(--t-text) !important;
        }
        .wizard-chat-cursor::after {
          content: '▌';
          display: inline-block;
          margin-left: 2px;
          color: var(--gold, #d4af75);
          animation: cursor-blink 0.9s steps(2, start) infinite;
        }
        .wizard-terminal .wizard-chat-cursor::after {
          color: var(--t-accent) !important;
        }
        @keyframes cursor-blink {
          to { visibility: hidden; }
        }
        .wizard-code-cursor::after {
          content: '▌';
          color: var(--gold, #d4af75);
          animation: cursor-blink 0.9s steps(2, start) infinite;
        }
        .wtok-kw    { color: #79b8ff; font-weight: 600; }
        .wtok-str   { color: #4ade80; }
        .wtok-com   { color: #7a8fa8; font-style: italic; }
        .wtok-num   { color: #f59e0b; }
        .wtok-jinja { color: #e879b8; font-weight: 600; }
      `}</style>
    </div>
  );
}

// ─── Syntax highlighting (regex-based, dark panel) ───────────────────────────

const SQL_KEYWORDS = new Set([
  'with', 'as', 'select', 'from', 'where', 'and', 'or', 'on', 'left', 'right',
  'inner', 'outer', 'join', 'group', 'by', 'order', 'desc', 'asc', 'when', 'then',
  'else', 'end', 'case', 'true', 'false', 'null', 'distinct', 'nullif', 'count',
  'sum', 'max', 'min', 'avg', 'dateadd', 'current_date', 'is', 'not', 'over',
  'partition', 'round', 'coalesce', 'nullif', 'date_trunc',
]);

function SyntaxSql({ text, cursor }: { text: string; cursor: boolean }) {
  const lines = text.split('\n');
  return (
    <>
      {lines.map((line, li) => (
        <span key={li}>{tokenizeSqlLine(line)}{li < lines.length - 1 && '\n'}</span>
      ))}
      {cursor && <span className="wizard-code-cursor" />}
    </>
  );
}

function tokenizeSqlLine(line: string): React.ReactNode[] {
  const trimmed = line.trimStart();
  if (trimmed.startsWith('--')) {
    return [<span key="c" className="wtok-com">{line}</span>];
  }
  const parts: React.ReactNode[] = [];
  const re = /(\{\{[^}]*\}\})|('[^']*')|(\b\d+(?:\.\d+)?\b)|(\b[a-zA-Z_][a-zA-Z0-9_]*\b)|(\s+)|([^\s'\w{]+)/g;
  let m: RegExpExecArray | null;
  let idx = 0;
  let key = 0;
  while ((m = re.exec(line)) !== null) {
    if (m.index > idx) parts.push(line.slice(idx, m.index));
    if (m[1]) {
      parts.push(<span key={key++} className="wtok-jinja">{m[1]}</span>);
    } else if (m[2]) {
      parts.push(<span key={key++} className="wtok-str">{m[2]}</span>);
    } else if (m[3]) {
      parts.push(<span key={key++} className="wtok-num">{m[3]}</span>);
    } else if (m[4]) {
      const word = m[4];
      if (SQL_KEYWORDS.has(word.toLowerCase())) {
        parts.push(<span key={key++} className="wtok-kw">{word}</span>);
      } else {
        parts.push(word);
      }
    } else if (m[5]) {
      parts.push(m[5]);
    } else {
      parts.push(m[6] ?? '');
    }
    idx = re.lastIndex;
  }
  if (idx < line.length) parts.push(line.slice(idx));
  return parts;
}

function SyntaxYaml({ text, cursor }: { text: string; cursor: boolean }) {
  const lines = text.split('\n');
  return (
    <>
      {lines.map((line, i) => {
        const isComment = line.trimStart().startsWith('#');
        if (isComment) {
          return <span key={i} className="wtok-com">{line}{i < lines.length - 1 && '\n'}</span>;
        }
        const colonIdx = line.indexOf(':');
        if (colonIdx > 0 && !line.trimStart().startsWith('-')) {
          const indent = line.slice(0, line.length - line.trimStart().length);
          const keyPart = line.slice(indent.length, colonIdx);
          const rest = line.slice(colonIdx);
          return (
            <span key={i}>
              {indent}
              <span className="wtok-kw">{keyPart}</span>
              {rest}
              {i < lines.length - 1 && '\n'}
            </span>
          );
        }
        return <span key={i}>{line}{i < lines.length - 1 && '\n'}</span>;
      })}
      {cursor && <span className="wizard-code-cursor" />}
    </>
  );
}
