// Altavest Capital — Build-time AI (dbt-wizard) reference page.
//
// Ported from Healthcare-EPIC-Snowflake-Demo's OdiDbtWizardPage so the
// three Snowflake-Summit demos (Clarity / Verity / Altavest) share the
// same shape on /dbt-wizard. Content swapped to an asset-management
// scenario: the research desk asks why regional bank holdings
// underperformed after the macro CPI signal turned negative last
// quarter, and dbt-wizard authors the missing
// gold.fct_regional_bank_macro_attribution_daily model in 87 seconds.
//
// Imports from WizardOdiVisuals (the copy of Verity's wizard
// components) so we don't collide with Altavest's existing
// WizardVisuals exports (LineagePanel / BuildCompleteSummary used by
// WizardLivePage).

import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  WizardPipelineFlow,
  WizardHub,
  ModelRegistry,
  LiveBuildThumbnail,
} from '../components/WizardOdiVisuals';

interface Pillar {
  layer: string;
  vendor: string;
  accent: string;
  what: string;
  inBuild: string;
  tag: string;
}

const PILLARS: Pillar[] = [
  {
    layer: 'Ingestion + MDLS',
    vendor: 'Fivetran',
    accent: '#0073EA',
    tag: 'connectors',
    what: '750+ managed connectors plus a custom Connector SDK for the long tail. Lands every source into Managed Data Lake Service as Apache Iceberg, in customer-owned S3.',
    inBuild: 'Altavest pulls SEC EDGAR 13F holdings (quarterly filings), FRED macro series (daily), CFPB consumer-complaint database (weekly), and S&P Capital IQ company reference data into one shared Iceberg lake. Same lake. Same governance. Different cadences.',
  },
  {
    layer: 'Open Lake',
    vendor: 'Iceberg on S3',
    accent: '#7C3AED',
    tag: 'storage',
    what: 'Open table format. Customer-owned storage. Snapshot isolation, schema evolution, time travel, multi-engine reads. The bytes belong to the desk, not the engine.',
    inBuild: 'When dbt-wizard\'s Worker sub-agent materializes the new gold.fct_regional_bank_macro_attribution_daily table, it writes Parquet files into the gold S3 prefix. No second copy. No publish step. Athena, Snowflake, Trino, DuckDB and Spark all resolve the new asset on their next read — the analyst\'s laptop and the production warehouse read the same bytes.',
  },
  {
    layer: 'Medallion + Build-time AI',
    vendor: 'dbt Labs + dbt-wizard',
    accent: '#FF694A',
    tag: 'transform',
    what: 'Bronze, silver, gold transformations with declarative SQL. Lineage, tests, freshness SLAs, semantic models. dbt-wizard adds four sub-agents that author new models into the project using the same tools an analytics engineer uses.',
    inBuild: 'The research desk asks why regional-bank holdings underperformed when the macro CPI signal turned negative last quarter. No gold model attributes (holding × macro signal × consumer sentiment × week) at the daily grain. dbt-wizard\'s Explorer runs status and search, Summary runs describe and lineage, Worker runs warehouse and dbt_show then authors the SQL, Verification writes the YAML and runs the tests. Eighty-seven seconds end-to-end.',
  },
  {
    layer: 'Compute over Iceberg',
    vendor: 'Snowflake',
    accent: '#29B5E8',
    tag: 'engine',
    what: 'Reads Iceberg tables directly via external tables and Polaris catalog. Runs the dbt-wizard warehouse for dbt_show and the materialization step. Independently scaled micro-warehouses.',
    inBuild: 'Worker spins up an XS warehouse for the dbt_show slice, validates the proposed daily holding × macro grain against the silver int_holdings and int_macro_signal tables, then materializes the new table to the gold prefix. Total compute footprint: a few seconds of XS warehouse time.',
  },
];

interface Property {
  title: string;
  claim: string;
  proof: string;
}

const PROPERTIES: Property[] = [
  {
    title: 'Speed',
    claim: 'Eighty-seven seconds from question to production model.',
    proof: 'Manual build of the same model: three to five days. The bottleneck is not SQL — it is the round-trip from research-desk question to backlog to scope to author to test to PR. dbt-wizard collapses every step into a single sub-agent chain. The model exists before the next morning\'s research briefing.',
  },
  {
    title: 'Governance',
    claim: 'Every dbt-wizard model gets tests, lineage, and ownership.',
    proof: 'The output is not a SQL snippet pasted into a notebook. It is a dbt model with a schema contract, column-level tests, a combination uniqueness test, declared upstreams, an owner tag, and an ai_built tag. The new attribution table passes the same governance bar every other gold table in the medallion passes — same MNPI flagging, same restricted-list audits.',
  },
  {
    title: 'Reusability',
    claim: 'The new model is a first-class citizen for every downstream consumer.',
    proof: 'Downstream consumers read it on their next pass. The portfolio-attribution dashboard can pin to it. Risk and compliance can join to it. Other dbt models can ref() it. Iceberg readers — Snowflake, Trino, Spark, DuckDB — can all query it. The model is not stuck inside the tool that built it.',
  },
  {
    title: 'Openness',
    claim: 'The model is Iceberg on S3, queryable by any engine.',
    proof: 'No lock-in on the build-time tool. No lock-in on the run-time engine. The bytes sit in Altavest\'s S3 bucket in an open table format. Swap dbt-wizard tomorrow for a different build-time agent and the materialized table still works. Swap Snowflake for Trino and the table still works.',
  },
];

const CANNED_QUESTIONS = [
  'Why did regional bank holdings underperform after the macro CPI signal turned negative last quarter?',
  'Which sectors show the strongest divergence between consumer-complaint sentiment and stock-price trend over the last 13 weeks?',
  'Show 13F position changes by top-25 active managers in regional banks, attributed against the daily macro signal.',
];

export default function OdiDbtWizardPage() {
  const navigate = useNavigate();
  const [question, setQuestion] = useState(CANNED_QUESTIONS[0]);

  return (
    <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
      <header className="mb-10 max-w-3xl">
        <div className="eyebrow mb-1" style={{ color: 'var(--gold-dim)' }}>Build-time AI, Asset-Management Reference</div>
        <h1 className="font-serif text-[2rem] sm:text-[2.4rem] font-semibold tracking-tight text-[var(--ink-strong)]">
          dbt-wizard: the build-time layer
        </h1>
        <p className="mt-3 text-[var(--ink-muted)] leading-relaxed">
          Any downstream consumer can only read gold models that already exist. When the research
          desk asks a question the gold layer does not yet answer, dbt-wizard's four sub-agents
          author the missing model &mdash; tested, lineage-tracked, materialized &mdash; in under
          ninety seconds. Every downstream reader picks it up on its next pass.
        </p>
      </header>

      {/* ── Hero: the ODI pipeline with dbt-wizard at the center ── */}
      <section className="mb-10">
        <div className="research-card p-5 sm:p-6">
          <div className="flex items-baseline justify-between flex-wrap gap-2 mb-4">
            <div className="eyebrow">End-to-end · build to read on the same lake</div>
            <span className="font-mono uppercase tracking-[0.18em]" style={{ fontSize: 10, color: 'var(--ink-soft)' }}>
              hover any stage
            </span>
          </div>
          <WizardPipelineFlow />
          <div className="mt-6 mb-4" style={{ height: 1, background: 'linear-gradient(90deg, transparent 0%, rgba(184,151,92,0.35) 50%, transparent 100%)' }} />
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Stat big="26" small="dbt models · bronze to silver to gold" />
            <Stat big="87s" small="dbt-wizard build · question to production model" />
            <Stat big="3–5 d" small="Manual equivalent · backlog to PR" />
          </div>
        </div>
      </section>

      {/* ── The scenario ── */}
      <section className="mb-12 research-card p-6 border-l-4" style={{ borderLeftColor: 'var(--gold)' }}>
        <div className="eyebrow mb-2" style={{ color: 'var(--gold-dim)' }}>The scenario that motivates this page</div>
        <p className="text-[var(--ink)] leading-relaxed text-lg">
          The research desk asks: <em>&ldquo;Why did regional-bank holdings underperform when the macro
          CPI signal turned negative last quarter?&rdquo;</em> There is no{' '}
          <code className="font-mono text-[12.5px] bg-white border border-[var(--hairline)] px-1.5 py-0.5 rounded">
            gold.fct_regional_bank_macro_attribution_daily
          </code>{' '}
          table. Without <span style={{ color: 'var(--gold-dim)', fontWeight: 700 }}>dbt-wizard</span>, the answer is three to five days away.
          With <span style={{ color: 'var(--gold-dim)', fontWeight: 700 }}>dbt-wizard</span>, the answer is eighty-seven seconds away &mdash;
          and the model is production-grade by the time it exists.
        </p>
      </section>

      {/* ── Four layers, one loop ── */}
      <section className="mb-12">
        <div className="eyebrow mb-2">Four layers. One loop.</div>
        <h2 className="font-serif text-2xl font-semibold text-[var(--ink-strong)] pb-3 mb-6 border-b-2" style={{ borderBottomColor: 'var(--gold-bg)' }}>
          What each layer contributes
        </h2>
        <p className="text-sm text-[var(--ink-muted)] mb-6 max-w-3xl">
          Each layer has a clear job. Pull dbt-wizard out and the research desk&apos;s question does
          not get answered in time. Pull Iceberg out and dbt-wizard&apos;s output is just text. Pull
          Snowflake out and the materialization step has no warehouse. The loop only closes when all
          four hold.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {PILLARS.map((p, i) => (
            <div key={p.vendor} className="research-card relative flex flex-col" style={{ minHeight: '440px', borderTop: `3px solid ${p.accent}` }}>
              <div className="p-5 flex-1 flex flex-col">
                <div className="text-[11px] font-mono uppercase tracking-wider mb-2" style={{ color: 'var(--ink-soft)' }}>
                  0{i + 1} · {p.tag}
                </div>
                <div className="eyebrow mb-1" style={{ color: 'var(--ink-muted)' }}>{p.layer}</div>
                <div className="font-serif text-xl font-semibold mb-4" style={{ color: p.accent }}>{p.vendor}</div>

                <div className="text-[11px] font-mono uppercase tracking-wider mb-1" style={{ color: 'var(--ink-soft)' }}>What it does</div>
                <p className="text-xs leading-relaxed mb-4" style={{ color: 'var(--ink)' }}>{p.what}</p>

                <div className="text-[11px] font-mono uppercase tracking-wider mb-1" style={{ color: 'var(--ink-soft)' }}>At Altavest Capital</div>
                <p className="text-xs leading-relaxed" style={{ color: 'var(--ink-muted)' }}>{p.inBuild}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── The four sub-agents ── */}
      <section className="mb-12" style={{ background: 'var(--paper-deep)', border: '1px solid var(--hairline)', borderRadius: '0.25rem', padding: '1.5rem' }}>
        <div className="eyebrow mb-2">The four sub-agents</div>
        <h2 className="font-serif text-xl font-semibold text-[var(--ink-strong)] mb-4">
          How <span style={{ color: 'var(--gold-dim)' }}>dbt-wizard</span> authors a model in under ninety seconds
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { num: '01', name: 'Explorer',     tools: 'dbt status, dbt search',          job: 'Maps what already exists in the project. Finds upstream silver tables that cover 13F holdings, FRED macro series, CFPB complaint sentiment, and S&P sector classification. Returns a list of candidate joins.' },
            { num: '02', name: 'Summary',      tools: 'dbt describe, dbt lineage',       job: 'Documents the schema and lineage of the candidate tables. Confirms grain, null rates, and CUSIP/CIK join keys. Catches a duplicate-position-on-restatement edge case before the Worker writes a single line of SQL.' },
            { num: '03', name: 'Worker',       tools: 'dbt warehouse, dbt_show, file edit', job: 'Writes the SQL and runs a dbt_show slice. Validates the proposed (holding × macro signal × week) daily grain, checks row counts, and edits the model file into the project.' },
            { num: '04', name: 'Verification', tools: 'dbt test, dbt docs generate',     job: 'Writes the schema YAML, adds uniqueness on (holding_id, observation_date) and not-null tests, runs the full test suite, and confirms the materialized table is queryable. Tags the model ai_built and assigns ownership.' },
          ].map((a) => (
            <div key={a.num} className="research-card p-4" style={{ borderTop: '3px solid var(--gold)' }}>
              <div className="font-mono text-xs text-[var(--ink-soft)] mb-1">{a.num}</div>
              <div className="font-serif text-lg font-semibold text-[var(--ink-strong)] mb-1">{a.name}</div>
              <div className="text-[11px] font-mono uppercase tracking-wider mb-2" style={{ color: 'var(--gold-dim)' }}>{a.tools}</div>
              <p className="text-xs text-[var(--ink-muted)] leading-relaxed">{a.job}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Hub-and-spoke radial ── */}
      <section className="mb-12">
        <WizardHub />
      </section>

      {/* ── Model registry preview ── */}
      <section className="mb-12">
        <ModelRegistry newModelCode="gold.fct_regional_bank_macro_attribution_daily" />
      </section>

      {/* ── Four properties ── */}
      <section className="mb-12">
        <div className="eyebrow mb-2">Four properties</div>
        <h2 className="font-serif text-xl font-semibold text-[var(--ink-strong)] pb-3 mb-6 border-b-2" style={{ borderBottomColor: 'var(--gold-bg)' }}>
          What <span style={{ color: 'var(--gold-dim)' }}>dbt-wizard</span> gives the lake that no other build-time tool can
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {PROPERTIES.map((c, i) => (
            <div key={c.title} className="research-card p-5 border-l-4" style={{ borderLeftColor: 'var(--gold)' }}>
              <div className="flex items-baseline gap-3 mb-2">
                <div className="font-mono text-xs text-[var(--ink-soft)]">0{i + 1}</div>
                <div className="font-serif text-lg font-semibold text-[var(--ink-strong)]">{c.title}</div>
              </div>
              <div className="text-sm font-semibold mb-2" style={{ color: 'var(--gold-dim)' }}>{c.claim}</div>
              <p className="text-sm leading-relaxed text-[var(--ink-muted)]">{c.proof}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Try the live build ── */}
      <section className="mb-12 research-card p-6 border-l-4" style={{ borderLeftColor: 'var(--gold)' }}>
        <div className="grid grid-cols-1 lg:grid-cols-[1fr,320px] gap-6 items-start mb-5">
          <div>
            <div className="eyebrow mb-2" style={{ color: 'var(--gold-dim)' }}>Try the live build</div>
            <h2 className="font-serif text-xl font-semibold text-[var(--ink-strong)] mb-3">
              Watch <span style={{ color: 'var(--gold-dim)' }}>dbt-wizard</span> author the model in real time
            </h2>
            <p className="text-sm text-[var(--ink-muted)] max-w-2xl leading-relaxed">
              Select a question below or write your own, then submit to watch Explorer, Summary,
              Worker, and Verification play out &mdash; narration, SQL, YAML, lineage and all tool
              calls &mdash; live.
            </p>
          </div>
          <div>
            <LiveBuildThumbnail />
          </div>
        </div>

        <div className="flex flex-col gap-2 mb-4">
          {CANNED_QUESTIONS.map((q) => (
            <button
              key={q}
              type="button"
              onClick={() => setQuestion(q)}
              className="text-left rounded-sm px-4 py-3 text-sm border transition-colors"
              style={{
                background: question === q ? 'var(--gold-bg)' : 'var(--paper-deep)',
                borderColor: question === q ? 'var(--gold)' : 'var(--hairline)',
                color: question === q ? 'var(--gold-dim)' : 'var(--ink-muted)',
                fontFamily: '"Crimson Pro", Georgia, serif',
              }}
            >
              {q}
            </button>
          ))}
        </div>

        <div className="mb-4">
          <label className="eyebrow block mb-1.5">Or write your own question</label>
          <textarea
            rows={3}
            value={question}
            onChange={e => setQuestion(e.target.value)}
            className="w-full rounded-sm px-3 py-2 text-sm border resize-none"
            style={{
              background: 'var(--card)',
              borderColor: 'var(--hairline)',
              color: 'var(--ink)',
              fontFamily: '"Crimson Pro", Georgia, serif',
              outline: 'none',
            }}
          />
        </div>

        <button
          type="button"
          disabled={!question.trim()}
          onClick={() => navigate('/wizard-live', { state: { question } })}
          className="inline-flex items-center gap-2 rounded-sm font-semibold text-sm px-5 py-2.5 transition-opacity disabled:opacity-40"
          style={{ background: 'var(--gold)', color: '#fff' }}
        >
          Watch live build
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <path d="M5 12h14M13 5l7 7-7 7" />
          </svg>
        </button>
      </section>

      {/* ── The loop, in one sentence ── */}
      <section className="rounded-sm p-8" style={{ background: 'var(--navy-deep)', color: '#fff' }}>
        <div className="text-xs font-mono uppercase tracking-[0.18em] mb-3 opacity-70">The loop, in one sentence</div>
        <p className="font-serif text-xl sm:text-2xl leading-snug mb-6">
          <span style={{ color: '#0073EA' }}>Fivetran lands it.</span>{' '}
          <span style={{ color: '#FF694A' }}>dbt governs it.</span>{' '}
          <span style={{ color: '#FF694A' }}>dbt-wizard authors it.</span>{' '}
          <span style={{ color: '#d4af75' }}>Iceberg owns it.</span>{' '}
          <span style={{ color: '#29B5E8' }}>Snowflake reads it.</span>
        </p>
        <p className="text-sm opacity-70 max-w-2xl mb-6">
          Build-time AI on the same lake as every downstream reader. dbt-wizard authors the model.
          Any engine that speaks Iceberg reads it. No integration handoff. No second copy of the data.
        </p>
        <div className="flex flex-col sm:flex-row gap-3">
          <Link
            to="/architecture"
            className="inline-flex items-center gap-2 rounded-sm font-semibold text-sm px-5 py-3 shadow-lg hover:opacity-95 transition-opacity"
            style={{ background: 'var(--gold)', color: 'var(--navy-deep)' }}
          >
            See the architecture <span aria-hidden>→</span>
          </Link>
          <Link
            to="/about"
            className="inline-flex items-center gap-2 rounded-sm font-semibold text-sm bg-white/5 border border-white/20 px-5 py-3 hover:bg-white/10 transition-colors"
          >
            Pipeline overview
          </Link>
        </div>
      </section>
    </div>
  );
}

function Stat({ big, small }: { big: string; small: string }) {
  return (
    <div>
      <div className="font-serif font-semibold" style={{ fontSize: 30, color: 'var(--gold-dim)', lineHeight: 1.05, letterSpacing: '-0.01em' }}>
        {big}
      </div>
      <div className="mt-1 font-mono uppercase tracking-[0.16em]" style={{ fontSize: 10.5, color: 'var(--ink-muted)', lineHeight: 1.35 }}>
        {small}
      </div>
    </div>
  );
}
