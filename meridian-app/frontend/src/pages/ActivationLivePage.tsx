/*
 * ActivationLivePage — NewCo Activations live-sync playback for Altavest Capital.
 *
 * Architecture: step rail + sub-agent narration panel + single code panel
 * (routes both SQL and JSON code_targets through it) + Play/Pause/Speed
 * controls. Sibling to WizardLivePage.tsx, but plays back a reverse-ETL
 * sync run instead of a dbt build, and lands on a Destination Confirmation
 * payoff table instead of the dbt-wizard "See the outcome" hop.
 *
 * Content is local TS consts (ACTIVATION_SCENARIO / ACTIVATION_AGENTS /
 * ACTIVATION_SCRIPT / ACTIVATION_RECORDS) — no fetch, no public/data JSON.
 *
 * Aesthetic: dark terminal surface (navy), matching wizard-live. Autoscroll
 * uses direct scrollTop assignment — NOT scrollIntoView.
 */

import React from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import AgentAvatar from '../components/AgentAvatar';
import type {
  ActivationAgent,
  ActivationEvent,
  ActivationScenario,
  ActivationRecord,
  ActivationAgentId,
} from '../components/activationTypes';

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
  codeSoFar: string;
  sideEffects: string[];
}

const INITIAL: RevealState = {
  cursor: 0,
  narrTyped: 0,
  codeTyped: 0,
  codeSoFar: '',
  sideEffects: [],
};

const STEP_DEFS = [
  { label: 'Segment Definition',       who: 'Segment', tools: 'gold query',       insight: '7 rows matched'      },
  { label: 'Field Mapping',            who: 'Mapper',  tools: 'schema map',       insight: '5 fields mapped'     },
  { label: 'Sync Preview',             who: 'Mapper',  tools: 'diff preview',     insight: '7 upsert · 0 skip'   },
  { label: 'API Push',                 who: 'Sync',    tools: 'REST push',        insight: '7 records sent'      },
  { label: 'Destination Confirmation', who: 'Sync',    tools: 'destination read', insight: '7 landed · 0 errors' },
];

// Agent accent colors — distinct from the dbt-wizard palette, cyan-forward
// to tie back to the Activations accent (#0e7490) used across ArchitecturePage.
const AGENT_STEP_COLOR: Record<string, string> = {
  segment: '#0e7490',
  mapper:  '#7c3aed',
  sync:    '#b45309',
  system:  '#5a6c84',
};

// ─── Local content (no fetch — see file header) ────────────────────────────

const ACTIVATION_AGENTS: ActivationAgent[] = [
  {
    id: 'segment',
    name: 'Segment',
    code: 'SEG',
    color: AGENT_STEP_COLOR.segment,
    role: 'Watches gold.dim_holdings for the restricted_list_check transition',
    tools: ['gold query', 'change detection'],
  },
  {
    id: 'mapper',
    name: 'Mapper',
    code: 'MAP',
    color: AGENT_STEP_COLOR.mapper,
    role: 'Maps gold columns onto Bloomberg AIM compliance_rule fields',
    tools: ['schema map', 'diff preview'],
  },
  {
    id: 'sync',
    name: 'Sync',
    code: 'SYN',
    color: AGENT_STEP_COLOR.sync,
    role: 'Pushes the mapped payload into AIM and confirms it landed',
    tools: ['REST push', 'destination read'],
  },
];

const ACTIVATION_SCENARIO: ActivationScenario = {
  company: 'Altavest Capital',
  request_id: 'ACT-2026-0709-EQ-014',
  requested_by: 'Compliance Ops',
  requested_at: '2026-07-09T06:14:04-04:00',
  timezone_label: 'ET',
  question: 'Get this restricted-list determination into AIM before the desk opens.',
  source_model: 'gold.dim_holdings',
  destination_system: 'Bloomberg AIM',
  destination_object: 'compliance_rule',
  sync_mode: 'upsert',
  record_count: 7,
  build_room_seconds: 97,
};

const ACTIVATION_SCRIPT: ActivationEvent[] = [
  {
    from: 'segment',
    step: 1,
    step_label: 'Segment Definition',
    body: "Compliance just made a restriction call — a CIK's restricted_list_check flipped false to true in gold.dim_holdings four seconds ago, scoped to the equity desk. That's the exact condition I'm watching for: a join-time compliance check resolving against compliance.restricted_tickers, not a stale batch flag. 7 holdings match across equity, credit, and macro.",
    side_effect: 'gold.dim_holdings queried · 7 rows matched restricted_list_check=true',
    code_target: 'sql',
    code_append: `select
  h.cik,
  h.ticker,
  h.desk_id,
  h.restricted_list_check,
  h.pre_announcement_window
from gold.dim_holdings h
where h.restricted_list_check = true
  and h._fivetran_synced >= dateadd('minute', -5, current_timestamp())
order by h.desk_id, h.ticker;`,
  },
  {
    from: 'mapper',
    step: 2,
    step_label: 'Field Mapping',
    body: "Here's the problem every buy-side desk lives with: that determination is worthless until it's inside the order system actually blocking trades. Today that means a compliance analyst exports a spreadsheet, emails it, and a trader keys it into Bloomberg AIM by hand — three to six hours of exposure. I'm mapping ticker, CIK, desk scope, and the embargo window straight onto AIM's compliance_rule fields.",
    side_effect: '5 fields mapped · cik→external_id, ticker→symbol, desk_id→desk_scope',
    code_target: 'json',
    code_append: `{
  "source_model": "gold.dim_holdings",
  "destination": "Bloomberg AIM · compliance_rule",
  "sync_mode": "upsert",
  "field_map": {
    "cik": "security.external_id",
    "ticker": "security.symbol",
    "restricted_list_check": "compliance_rule.restriction_status",
    "desk_id": "compliance_rule.desk_scope",
    "pre_announcement_window": "compliance_rule.effective_through"
  }
}`,
  },
  {
    from: 'mapper',
    step: 3,
    step_label: 'Sync Preview',
    body: 'Previewing the diff before anything pushes: 7 holdings need restriction_status upserted in AIM, 0 skipped — none of these have already landed. desk_scope carries equity, credit, and macro so the pre-trade block applies exactly where compliance intended, not firm-wide.',
    side_effect: 'diff computed · 7 upsert · 0 skip',
    code_target: 'json',
    code_append: `{
  "matched_rows": 7,
  "upsert": 7,
  "skip": 0,
  "sample_diff": [
    { "external_id": "0000320193", "symbol": "AAPL", "desk_scope": "equity", "restriction_status": "none → active" },
    { "external_id": "0000019617", "symbol": "JPM",  "desk_scope": "credit", "restriction_status": "none → active" }
  ]
}`,
  },
  {
    from: 'sync',
    step: 4,
    step_label: 'API Push',
    body: 'Pushing now. No export, no re-key, no analyst in the loop — just a REST call straight into AIM’s pre-trade compliance rule table, carrying restriction_status, desk_scope, and effective_through so the embargo actually expires when the filing does.',
    side_effect: 'POST /aim/compliance_rules · 7 records · 202 accepted',
    code_target: 'json',
    code_append: `POST https://aim.bloomberg.net/api/v1/compliance_rules:batchUpsert
{
  "records": [
    {
      "security.external_id": "0000320193",
      "security.symbol": "AAPL",
      "compliance_rule.desk_scope": "equity",
      "compliance_rule.restriction_status": "active",
      "compliance_rule.effective_through": "embargo_until_filing_date"
    }
  ],
  "record_count": 7
}`,
  },
  {
    from: 'sync',
    step: 5,
    step_label: 'Destination Confirmation',
    body: 'Confirmed landed. Gold refreshed at 06:14:04 ET; AIM shows the restriction live at 06:15:41 ET — 97 seconds, not 3 to 6 hours. A trader opening this ticker right now hits a hard pre-trade block, with the desk scope and embargo window attached — and nobody had to touch a spreadsheet.',
    side_effect: 'AIM compliance_rule confirmed · 7 landed · 0 errors · 97s gold-to-block',
  },
];

const ACTIVATION_RECORDS: ActivationRecord[] = [
  { key: '0000320193', fields: { Ticker: 'AAPL', Desk: 'equity', Restriction: 'active', 'Embargo Until': '2026-07-16' }, status: 'created' },
  { key: '0000034088', fields: { Ticker: 'XOM',  Desk: 'equity', Restriction: 'active', 'Embargo Until': '2026-07-14' }, status: 'created' },
  { key: '0000019617', fields: { Ticker: 'JPM',  Desk: 'credit', Restriction: 'active', 'Embargo Until': '2026-07-20' }, status: 'created' },
  { key: '0000886982', fields: { Ticker: 'GS',   Desk: 'credit', Restriction: 'active', 'Embargo Until': '2026-07-18' }, status: 'updated' },
  { key: '0001318605', fields: { Ticker: 'TSLA', Desk: 'equity', Restriction: 'active', 'Embargo Until': '2026-07-22' }, status: 'created' },
  { key: '0000070858', fields: { Ticker: 'BAC',  Desk: 'macro',  Restriction: 'active', 'Embargo Until': '2026-07-15' }, status: 'updated' },
  { key: '0000078003', fields: { Ticker: 'PFE',  Desk: 'macro',  Restriction: 'active', 'Embargo Until': '2026-07-19' }, status: 'created' },
];

// ─── Destination confirmation payoff table ─────────────────────────────────

function DestinationConfirmationTable({ scenario, records }: { scenario: ActivationScenario; records: ActivationRecord[] }) {
  const cols = Object.keys(records[0]?.fields ?? {});
  return (
    <div className="mt-4 research-card overflow-hidden" style={{ borderLeft: '4px solid #0e7490' }}>
      <header className="px-5 py-3 border-b flex items-center justify-between" style={{ borderColor: 'var(--hairline)' }}>
        <div>
          <div className="eyebrow" style={{ fontSize: 11, color: '#0e7490' }}>Landed in {scenario.destination_system}</div>
          <div className="font-mono text-[12px] text-[var(--ink-muted)] mt-0.5">{scenario.destination_object} · {scenario.sync_mode}</div>
        </div>
        <span className="font-mono text-[12px]" style={{ color: '#0e7490' }}>
          {records.filter(r => r.status !== 'skipped').length} of {records.length} shown
        </span>
      </header>
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="border-b border-[var(--hairline)]" style={{ background: 'var(--paper-deep,#f4efe2)' }}>
            <tr>
              <th className="px-4 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-[var(--ink-soft)]">CIK</th>
              {cols.map(c => (
                <th key={c} className="px-4 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-[var(--ink-soft)]">{c}</th>
              ))}
              <th className="px-4 py-2 text-right text-[10px] font-semibold uppercase tracking-wider text-[var(--ink-soft)]">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--hairline-soft,#e8e4d8)]">
            {records.map(r => (
              <tr key={r.key}>
                <td className="px-4 py-2 font-mono text-[12px] text-[var(--ink-strong)]">{r.key}</td>
                {cols.map(c => <td key={c} className="px-4 py-2 text-[12px] text-[var(--ink)]">{r.fields[c]}</td>)}
                <td className="px-4 py-2 text-right">
                  <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: r.status === 'skipped' ? '#b45309' : '#16a34a' }}>
                    {r.status === 'skipped' ? '● skip' : `● ${r.status}`}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Page ───────────────────────────────────────────────────────────────────

export default function ActivationLivePage() {
  const [events] = useState<ActivationEvent[]>(ACTIVATION_SCRIPT);
  const scenario = ACTIVATION_SCENARIO;
  const agents = ACTIVATION_AGENTS;
  const records = ACTIVATION_RECORDS;

  const [state, setState]       = useState<RevealState>(INITIAL);
  const [playing, setPlaying]   = useState(true);
  const [speed, setSpeed]       = useState<typeof SPEEDS[number]>(1);
  const [complete, setComplete] = useState(false);

  const narrPanelRef = useRef<HTMLDivElement | null>(null);
  const codePanelRef = useRef<HTMLPreElement | null>(null);
  const narrBottomRef = useRef<HTMLDivElement | null>(null);
  const codeBottomRef  = useRef<HTMLDivElement | null>(null);

  const agentById = useMemo(() => {
    const m: Record<string, ActivationAgent> = {};
    for (const a of agents) m[a.id] = a;
    return m;
  }, [agents]);

  const currentEvent: ActivationEvent | undefined = events[state.cursor];
  const totalSteps = useMemo(() => {
    if (events.length === 0) return 5;
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
          return { ...s, codeTyped: nextTyped, codeSoFar: s.codeSoFar + charsToAdd };
        });
      }, Math.max(1, Math.floor(CODE_TYPE_MS / speed)));
      return () => clearTimeout(id);
    }
    // Phase 3: commit side effect + advance cursor (reset code panel for next artifact)
    const postDelay = code.length > 0 ? POST_CODE_DELAY_MS : POST_NARR_DELAY_MS;
    const id = setTimeout(() => {
      setState(s => {
        const next: RevealState = { ...s, cursor: s.cursor + 1, narrTyped: 0, codeTyped: 0, codeSoFar: '' };
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
  }, [state.codeSoFar]);

  const reset = () => { setState(INITIAL); setComplete(false); setPlaying(true); };
  const cycleSpeed = () => { const i = SPEEDS.indexOf(speed); setSpeed(SPEEDS[(i + 1) % SPEEDS.length]); };

  const currentStep      = currentEvent?.step ?? totalSteps;
  const currentStepLabel = currentEvent?.step_label ?? 'Destination Confirmation';
  const activeAgentId: ActivationAgentId | undefined =
    currentEvent && state.narrTyped < currentEvent.body.length ? currentEvent.from : undefined;

  const visibleNarr = events.slice(0, Math.min(state.cursor + 1, events.length)).map((e, idx) => {
    const isCurrent = idx === state.cursor;
    const body = isCurrent ? e.body.slice(0, state.narrTyped) : e.body;
    return { e, body, isCurrent };
  });

  const codeLabel = currentEvent?.code_target === 'sql'
    ? 'models/gold/dim_holdings.sql'
    : 'activation_mapping.json';
  const codeBadge = currentEvent?.code_target === 'sql' ? 'Segment authoring' : 'Mapper / Sync authoring';

  return (
    <div className="activation-terminal mx-auto max-w-[1640px] px-4 py-4 sm:px-6 lg:px-8">

      {/* ── Control bar ── */}
      <div
        className="mb-3 px-4 py-2.5 flex flex-wrap items-center justify-between gap-3 sticky top-20 z-20"
        style={{
          background: 'var(--card)',
          border: '1px solid var(--hairline)',
          borderLeft: '4px solid #0e7490',
          borderRadius: '0.25rem',
          boxShadow: '0 2px 8px rgba(11,39,68,0.08)',
        }}
      >
        <div className="flex items-center gap-3 flex-wrap">
          <span
            className="status-pill"
            style={{
              display: 'inline-flex', alignItems: 'center', gap: '0.45rem', fontSize: 12, padding: '4px 10px', fontWeight: 700,
              background: 'rgba(14,116,144,0.10)', color: '#0e7490', border: '1px solid rgba(14,116,144,0.35)',
            }}
          >
            <span
              style={{
                display: 'inline-block', width: 8, height: 8, borderRadius: 999,
                background: '#0e7490',
                animation: complete ? 'none' : 'signal-pulse 1.8s ease-in-out infinite',
              }}
            />
            {complete ? 'Sync Complete' : 'Sync Active'}
          </span>
          <span className="eyebrow" style={{ fontSize: 12 }}>{scenario.request_id}</span>
          <span className="font-mono" style={{ color: 'var(--ink-muted)', fontSize: 13 }}>
            Step{' '}
            <span style={{ color: '#0e7490', fontWeight: 700 }}>{currentStep}/{totalSteps}</span>
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
                background: complete ? 'var(--bull)' : '#0e7490',
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
            to="/architecture"
            className="inline-flex items-center gap-1.5 rounded-sm font-semibold border transition-colors"
            style={{ background: 'var(--paper-deep)', borderColor: 'var(--hairline)', color: 'var(--ink)', padding: '7px 14px', fontSize: 13 }}
          >
            Back
          </Link>
        </div>
      </div>

      {/* ── Question + destination (compact single row) ── */}
      <div
        className="mb-3 px-4 py-2.5 research-card border-l-4 flex items-center gap-5 flex-wrap"
        style={{ borderLeftColor: '#0e7490' }}
      >
        <div className="min-w-0 flex-shrink" style={{ flex: '1 1 460px' }}>
          <div className="eyebrow" style={{ fontSize: 10, marginBottom: 2, color: '#0e7490' }}>
            Compliance Ops · {scenario.timezone_label} · {scenario.requested_by}
          </div>
          <p
            className="font-serif font-medium text-[var(--ink-strong)] leading-snug truncate"
            style={{ fontSize: 16 }}
            title={scenario.question}
          >
            "{scenario.question}"
          </p>
        </div>
        <div className="font-mono text-[var(--ink-muted)] shrink-0" style={{ fontSize: 11 }}>
          Destination: <span style={{ color: '#0e7490', fontWeight: 700 }}>{scenario.destination_system} · {scenario.destination_object}</span>
        </div>
      </div>

      {/* ── Step rail (compact single-line, 5 steps) ── */}
      <div className="mb-3 grid gap-1.5" style={{ gridTemplateColumns: 'repeat(5, minmax(0, 1fr))' }}>
        {STEP_DEFS.map((s, idx) => {
          const num    = idx + 1;
          const done   = currentStep > num || (currentStep === num && complete);
          const active = currentStep === num && !complete;
          const accentColor = active
            ? '#0e7490'
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
                  ? 'rgba(14,116,144,0.06)'
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
                  color: active ? '#0e7490' : done ? 'var(--bull)' : 'var(--ink-soft)',
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
                  color: active ? '#0e7490' : done ? 'var(--bull)' : 'var(--ink-soft)',
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
                {scenario.company} · NewCo Activations live sync
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
              const color = a?.color ?? AGENT_STEP_COLOR[m.e.from] ?? '#0e7490';
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
                            background: 'rgba(14,116,144,0.10)', color: '#0e7490',
                            border: '1px solid rgba(14,116,144,0.35)',
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

        {/* ── RIGHT: Single code panel — routes sql + json code_targets ── */}
        <section className="flex flex-col gap-3 lg:!h-[calc(100dvh-440px)]" style={{ minHeight: 'max(60vh, 300px)' }}>
          <div className="research-card flex flex-col flex-1">
            <header
              className="px-5 py-3 border-b flex items-center justify-between"
              style={{ borderColor: 'var(--hairline)' }}
            >
              <div className="flex items-center gap-3 flex-wrap min-w-0">
                <div className="eyebrow font-mono" style={{ fontSize: 11, letterSpacing: '0.02em' }}>
                  {codeLabel}
                </div>
                <span
                  className="layer-chip"
                  style={{
                    color: '#0e7490', background: 'rgba(14,116,144,0.07)',
                    border: '1px solid rgba(14,116,144,0.3)',
                    fontSize: 10, padding: '3px 8px', fontWeight: 700, whiteSpace: 'nowrap',
                  }}
                >
                  {codeBadge}
                </span>
              </div>
              <span className="font-mono text-[var(--ink-soft)]" style={{ fontSize: 12, whiteSpace: 'nowrap' }}>
                {state.codeSoFar.length.toLocaleString()} chars
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
              {state.codeSoFar.length === 0 ? (
                <span style={{ color: '#5a7099' }}>{'-- waiting for the next artifact...'}</span>
              ) : currentEvent?.code_target === 'sql' ? (
                <SyntaxSql
                  text={state.codeSoFar}
                  cursor={state.codeTyped > 0 && state.codeTyped < (currentEvent.code_append?.length ?? 0)}
                />
              ) : (
                <SyntaxJson
                  text={state.codeSoFar}
                  cursor={
                    currentEvent?.code_target === 'json' &&
                    state.codeTyped > 0 &&
                    state.codeTyped < (currentEvent.code_append?.length ?? 0)
                  }
                />
              )}
              <div ref={codeBottomRef} />
            </pre>
          </div>
        </section>
      </div>

      {/* ── Full-width tool side effects ticker (compact) ── */}
      <div className="research-card mt-3 px-3 py-2 flex items-center gap-3">
        <div className="eyebrow shrink-0" style={{ fontSize: 10 }}>tool calls</div>
        {state.sideEffects.length === 0 ? (
          <div className="font-mono text-[var(--ink-soft)]" style={{ fontSize: 11.5 }}>Awaiting first tool call...</div>
        ) : (
          <ul className="flex items-center gap-x-4 gap-y-1 flex-wrap min-w-0">
            {state.sideEffects.slice(0, 4).map((s, i) => (
              <li
                key={`${s}-${i}`}
                className="flex items-center gap-1.5 font-mono text-[var(--ink)] truncate"
                style={{ fontSize: 11.5, maxWidth: '36ch' }}
                title={s}
              >
                <span
                  style={{
                    display: 'inline-block', width: 7, height: 7, borderRadius: 999, flexShrink: 0,
                    background: i === 0 ? '#0e7490' : 'var(--ink-soft)',
                    animation: i === 0 ? 'signal-pulse 1.8s ease-in-out infinite' : 'none',
                  }}
                />
                <span className="truncate">{s}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* ── Sync complete: destination confirmation payoff ── */}
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
                Sync Complete
              </div>
              <span className="eyebrow" style={{ fontSize: 11 }}>{scenario.request_id} · {scenario.company}</span>
            </div>
            <div className="flex items-center gap-3 flex-wrap">
              <span className="font-mono text-[var(--ink-muted)]" style={{ fontSize: 12 }}>
                <strong style={{ color: 'var(--bull)' }}>{scenario.build_room_seconds}s</strong> gold-to-block · not 3–6 hours
              </span>
              <Link
                to="/architecture"
                className="inline-flex items-center gap-2 rounded-sm font-semibold transition-colors"
                style={{
                  background: 'var(--navy-deep)', color: '#fff',
                  padding: '10px 18px', fontSize: 13,
                }}
              >
                Back to architecture
                <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                  <path d="M5 12h14M13 5l7 7-7 7" />
                </svg>
              </Link>
            </div>
          </div>
          <DestinationConfirmationTable scenario={scenario} records={records} />
        </div>
      )}

      {/* Inline styles for activation-specific primitives */}
      <style>{`
        @keyframes signal-pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.28; }
        }

        /* ── Terminal aesthetic ── */
        .activation-terminal {
          --t-bg:       #0a1424;
          --t-surface:  #0f1f36;
          --t-elev:     #142844;
          --t-line:     #1f3559;
          --t-line-soft:#15294a;
          --t-text:     #e6edf8;
          --t-text-dim: #b6c6dd;
          --t-text-soft:#7a90b3;
          --t-accent:   #22d3ee;
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
        .activation-terminal::before {
          content: '';
          position: absolute;
          top: 0; left: 0; right: 0;
          height: 28px;
          background: linear-gradient(180deg, #0d1c33, #0a1424);
          border-bottom: 1px solid var(--t-line);
          border-top-left-radius: 9px;
          border-top-right-radius: 9px;
        }
        .activation-terminal::after {
          content: 'altavest-capital/activations-live · NewCo Activations';
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
        .activation-terminal > * { position: relative; z-index: 1; }

        /* Override the light card base inside the terminal */
        .activation-terminal .research-card {
          background: var(--t-surface) !important;
          border-color: var(--t-line) !important;
          color: var(--t-text);
          box-shadow: none;
        }
        .activation-terminal .research-card header,
        .activation-terminal .research-card > .border-b {
          border-color: var(--t-line) !important;
          background: var(--t-elev);
        }
        /* Inner narration scroll surface */
        .activation-terminal .research-card > div[style*="background: var(--paper)"] {
          background: var(--t-bg) !important;
        }
        /* Narration chat cards */
        .activation-terminal [data-wizard-card="narr"] {
          background: var(--t-elev) !important;
          border-color: var(--t-line-soft) !important;
          color: var(--t-text) !important;
        }
        .activation-terminal [data-wizard-card="narr"] .wizard-chat-bubble {
          color: var(--t-text) !important;
        }
        .activation-terminal [data-wizard-card="narr"] .font-mono {
          color: var(--t-text-dim) !important;
        }
        /* Generic text recolor */
        .activation-terminal h1,
        .activation-terminal h2,
        .activation-terminal h3,
        .activation-terminal p,
        .activation-terminal span,
        .activation-terminal div,
        .activation-terminal li {
          color: inherit;
        }
        .activation-terminal .text-\\[var\\(--ink\\)\\],
        .activation-terminal [style*="color: var(--ink)"] { color: var(--t-text) !important; }
        .activation-terminal .text-\\[var\\(--ink-strong\\)\\],
        .activation-terminal [style*="color: var(--ink-strong)"] { color: var(--t-text) !important; }
        .activation-terminal .text-\\[var\\(--ink-muted\\)\\],
        .activation-terminal [style*="color: var(--ink-muted)"] { color: var(--t-text-dim) !important; }
        .activation-terminal .text-\\[var\\(--ink-soft\\)\\],
        .activation-terminal [style*="color: var(--ink-soft)"] { color: var(--t-text-soft) !important; }
        .activation-terminal [style*="color: #0e7490"] { color: var(--t-accent) !important; }

        /* Status pills: dim on dark */
        .activation-terminal .status-pill,
        .activation-terminal .layer-chip {
          background: rgba(34,211,238,0.12) !important;
          border-color: rgba(34,211,238,0.35) !important;
          color: var(--t-accent) !important;
        }
        /* Buttons on dark */
        .activation-terminal button,
        .activation-terminal a[class*="rounded-sm"] {
          background: var(--t-elev) !important;
          color: var(--t-text) !important;
          border-color: var(--t-line) !important;
        }
        .activation-terminal button:hover,
        .activation-terminal a[class*="rounded-sm"]:hover {
          background: var(--t-line) !important;
          border-color: var(--t-accent) !important;
        }
        /* Eyebrow */
        .activation-terminal .eyebrow {
          color: var(--t-accent) !important;
          opacity: 0.85;
        }
        /* Step rail active/done tiles */
        .activation-terminal .research-card[style*="rgba(14,116,144"] {
          background: rgba(34,211,238,0.10) !important;
        }
        .activation-terminal .research-card[style*="rgba(20,94,54"] {
          background: rgba(74,222,128,0.10) !important;
        }
        .activation-terminal .research-card[style*="var(--paper-deep)"] {
          background: var(--t-surface) !important;
        }
        /* Code panels */
        .activation-terminal pre {
          background: var(--t-bg) !important;
          border-top: 1px solid var(--t-line);
          color: #d6e3f6 !important;
        }
        /* Question banner */
        .activation-terminal .research-card.border-l-4 {
          border-left-color: var(--t-accent) !important;
        }
        /* Progress bar background */
        .activation-terminal div[style*="background: var(--paper-deep)"] {
          background: var(--t-elev) !important;
          border-color: var(--t-line) !important;
        }
        /* Avatar chip */
        .activation-terminal .wizard-agent-avatar {
          background: rgba(10,20,36,0.6) !important;
          border-color: rgba(120,150,200,0.35) !important;
        }
        .activation-terminal .wizard-agent-avatar[data-active="true"] {
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
        .activation-terminal .wizard-chat-bubble {
          color: var(--t-text) !important;
        }
        .wizard-chat-cursor::after {
          content: '▌';
          display: inline-block;
          margin-left: 2px;
          color: #0e7490;
          animation: cursor-blink 0.9s steps(2, start) infinite;
        }
        .activation-terminal .wizard-chat-cursor::after {
          color: var(--t-accent) !important;
        }
        @keyframes cursor-blink {
          to { visibility: hidden; }
        }
        .wizard-code-cursor::after {
          content: '▌';
          color: #0e7490;
          animation: cursor-blink 0.9s steps(2, start) infinite;
        }
        .wtok-kw    { color: #79b8ff; font-weight: 600; }
        .wtok-str   { color: #4ade80; }
        .wtok-com   { color: #7a8fa8; font-style: italic; }
        .wtok-num   { color: #f59e0b; }
        .wtok-jinja { color: #e879b8; font-weight: 600; }
        .wtok-key   { color: #79b8ff; font-weight: 600; }
      `}</style>
    </div>
  );
}

// ─── Syntax highlighting (regex-based, dark panel) ───────────────────────────

const SQL_KEYWORDS = new Set([
  'with', 'as', 'select', 'from', 'where', 'and', 'or', 'on', 'left', 'right',
  'inner', 'outer', 'join', 'group', 'by', 'order', 'desc', 'asc', 'when', 'then',
  'else', 'end', 'case', 'true', 'false', 'null', 'distinct', 'nullif', 'count',
  'sum', 'max', 'min', 'avg', 'dateadd', 'current_date', 'current_timestamp', 'is', 'not', 'over',
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

// Lightweight JSON/REST-payload highlighter — same regex-driven approach as
// tokenizeSqlLine. Handles quoted keys (before a colon), string values,
// numbers/booleans/null, and leaves everything else (braces, the REST
// request line) as plain text.
function SyntaxJson({ text, cursor }: { text: string; cursor: boolean }) {
  const lines = text.split('\n');
  return (
    <>
      {lines.map((line, i) => (
        <span key={i}>{tokenizeJsonLine(line)}{i < lines.length - 1 && '\n'}</span>
      ))}
      {cursor && <span className="wizard-code-cursor" />}
    </>
  );
}

function tokenizeJsonLine(line: string): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  const re = /("(?:[^"\\]|\\.)*")(\s*:)?|(\btrue\b|\bfalse\b|\bnull\b)|(-?\b\d+(?:\.\d+)?\b)/g;
  let m: RegExpExecArray | null;
  let idx = 0;
  let key = 0;
  while ((m = re.exec(line)) !== null) {
    if (m.index > idx) parts.push(line.slice(idx, m.index));
    if (m[1]) {
      const isKey = Boolean(m[2]);
      parts.push(<span key={key++} className={isKey ? 'wtok-key' : 'wtok-str'}>{m[1]}</span>);
      if (m[2]) parts.push(m[2]);
    } else if (m[3]) {
      parts.push(<span key={key++} className="wtok-kw">{m[3]}</span>);
    } else if (m[4]) {
      parts.push(<span key={key++} className="wtok-num">{m[4]}</span>);
    }
    idx = re.lastIndex;
  }
  if (idx < line.length) parts.push(line.slice(idx));
  return parts;
}
