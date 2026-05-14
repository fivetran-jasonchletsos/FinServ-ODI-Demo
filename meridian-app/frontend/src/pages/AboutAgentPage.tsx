import { useNavigate } from 'react-router-dom';

const INTENTS = [
  {
    name: 'rising_complaints',
    label: 'Rising complaints',
    pattern: '/(rising|increas|jump|spike).+(complaint|cfpb)/i',
    example: 'Companies with rising complaints',
    body: 'Ranks issuers by CFPB complaint velocity. Elevated flow is a leading indicator of regulatory action.',
  },
  {
    name: 'revenue_growth',
    label: 'Revenue growth',
    pattern: '/(growth|rev|revenue|grow)/i',
    example: 'Top 10 by revenue growth',
    body: 'Sorts the universe by trailing-twelve-month revenue growth YoY. Highest-momentum names rise to the top.',
  },
  {
    name: 'weak_macro',
    label: 'Weak macro exposure',
    pattern: '/(weak|stress|inversion|rate|yield)/i',
    example: 'Financials with weak macro exposure',
    body: 'Filters to the Financials sector and sorts by composite risk score — the names most exposed to a curve inversion or credit-cycle inflection.',
  },
  {
    name: 'eight_k_events',
    label: '8-K event cadence',
    pattern: '/(8-?k|event|filing)/i',
    example: 'Companies with most 8-K events',
    body: 'Ranks by EDGAR filing count over the trailing twelve months. Heavy filing cadence often signals material developments.',
  },
  {
    name: 'risk_score',
    label: 'Composite risk score',
    pattern: '/(risk|highest.+risk|risky)/i',
    example: 'Highest risk score in Financials',
    body: 'Ranks the universe by Meridian\'s composite risk score, blending complaint velocity, revenue trend, 8-K cadence, and sector macro overlay.',
  },
  {
    name: 'sector_filter',
    label: 'Sector filter',
    pattern: 'Matches any GICS sector name',
    example: 'Show me Technology companies',
    body: 'Detects a sector reference (Financials, Technology, Healthcare, etc.) and returns members sorted by market cap.',
  },
];

export default function AboutAgentPage() {
  const navigate = useNavigate();
  return (
    <div>
      <section className="bg-[var(--navy-deep)] text-white border-b-4 border-[var(--gold)]">
        <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8 py-14">
          <div className="inline-flex items-center gap-2 rounded-sm bg-white/10 backdrop-blur-sm px-3 py-1 text-xs font-semibold uppercase tracking-wider mb-5" style={{ color: 'var(--gold-bright)' }}>
            Portfolio AI
          </div>
          <h1 className="font-serif text-4xl sm:text-5xl font-semibold tracking-tight max-w-3xl">
            Skip the BI tool. Ask the universe.
          </h1>
          <p className="mt-5 text-lg text-white/75 max-w-2xl leading-relaxed">
            A natural-language layer on top of the same gold-layer tables the rest of the demo uses.
            Type a question — get back a ranked table, a short summary, and clickable rows that open
            the issuer file.
          </p>
          <button
            onClick={() => navigate('/agent')}
            className="mt-8 inline-flex items-center gap-2 rounded-sm px-6 py-3 text-base font-semibold shadow-lg"
            style={{ background: 'var(--gold)', color: 'var(--navy-deep)' }}
          >
            Open the agent <span aria-hidden>→</span>
          </button>
        </div>
      </section>

      <section className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8 py-14">
        <h2 className="font-serif text-2xl font-semibold text-[var(--ink-strong)] mb-3">How it works</h2>
        <div className="space-y-4 text-[var(--ink)] leading-relaxed">
          <p>
            The agent runs entirely client-side over the published JSON snapshot of the gold-layer
            Iceberg tables. A small intent classifier recognizes six patterns over the question, then
            executes the matching aggregation in your browser.
          </p>
          <p>
            No backend, no API key required for the rules tier. Flip the <em>Ask Claude</em> toggle and
            paste a key for richer reasoning over the same snapshot summary — Claude sees only the
            aggregated JSON, never raw rows.
          </p>
        </div>

        <h2 className="font-serif text-2xl font-semibold text-[var(--ink-strong)] mt-12 mb-4">The six rule-based intents</h2>
        <div className="space-y-3">
          {INTENTS.map((it) => (
            <article key={it.name} className="research-card p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="font-serif text-lg font-semibold text-[var(--ink-strong)]">{it.label}</h3>
                  <p className="mt-1 text-sm text-[var(--ink-muted)] leading-relaxed">{it.body}</p>
                </div>
                <span className="layer-chip gold shrink-0">{it.name}</span>
              </div>
              <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                <div>
                  <div className="text-[10px] font-semibold uppercase tracking-wider text-[var(--ink-soft)] mb-1">Pattern</div>
                  <code className="font-mono text-[11px] bg-[var(--paper-deep)] px-2 py-1 rounded border border-[var(--hairline)] inline-block">{it.pattern}</code>
                </div>
                <div>
                  <div className="text-[10px] font-semibold uppercase tracking-wider text-[var(--ink-soft)] mb-1">Try</div>
                  <button
                    onClick={() => navigate(`/agent?q=${encodeURIComponent(it.example)}`)}
                    className="text-[var(--gold-dim)] hover:text-[var(--ink-strong)] font-medium"
                  >
                    "{it.example}" →
                  </button>
                </div>
              </div>
            </article>
          ))}
        </div>

        <h2 className="font-serif text-2xl font-semibold text-[var(--ink-strong)] mt-12 mb-3">Claude mode</h2>
        <p className="text-[var(--ink)] leading-relaxed">
          When enabled, questions are sent to Claude with a structured summary of the snapshot
          (totals by sector, market-cap aggregates, risk-bucket histogram). The system prompt
          casts Claude as a senior Meridian analyst — measured tone, no hype, no invented numbers.
          The API key lives only in your browser's localStorage under{' '}
          <code className="font-mono text-xs bg-[var(--paper-deep)] px-1.5 py-0.5 rounded border border-[var(--hairline)]">meridian-odi:anthropic-api-key</code>.
        </p>
      </section>
    </div>
  );
}
