import { useState } from 'react';

// Natural-language query panel — Altavest Capital edition (light navy/gold).

type Token = { text: string; color?: string };

function tokenizeSQL(sql: string): Token[] {
  const combined = new RegExp(
    [
      `(?<comment>--[^\\n]*)`,
      `(?<string>'[^']*')`,
      `(?<schema>\\b(?:gold|silver|bronze)\\.[a-z_]+)`,
      `(?<keyword>\\b(?:SELECT|FROM|WHERE|GROUP BY|ORDER BY|HAVING|LIMIT|LEFT JOIN|INNER JOIN|JOIN|ON|AND|OR|NOT|AS|WITH|CASE|WHEN|THEN|ELSE|END|BY|ASC|DESC|DISTINCT|COUNT|SUM|AVG|ROUND|COALESCE|CAST|FLOOR|IN|IS|NULL|TRUE|FALSE|PARTITION|OVER|BETWEEN|DATE_TRUNC|INTERVAL|LAG|LEAD)\\b)`,
      `(?<number>\\b\\d+(?:\\.\\d+)?\\b)`,
    ].join('|'),
    'gi'
  );
  const tokens: Token[] = [];
  let lastIndex = 0;
  for (const m of sql.matchAll(combined)) {
    if (m.index === undefined) continue;
    if (m.index > lastIndex) tokens.push({ text: sql.slice(lastIndex, m.index) });
    const g = m.groups ?? {};
    if      (g.comment) tokens.push({ text: g.comment, color: '#6b7280' });
    else if (g.string)  tokens.push({ text: g.string,  color: '#4d7c0f' });
    else if (g.schema)  tokens.push({ text: g.schema,  color: '#1d4e89' });
    else if (g.keyword) tokens.push({ text: g.keyword, color: '#9a6f1a' });
    else if (g.number)  tokens.push({ text: g.number,  color: '#b45309' });
    else                tokens.push({ text: m[0] });
    lastIndex = m.index + m[0].length;
  }
  if (lastIndex < sql.length) tokens.push({ text: sql.slice(lastIndex) });
  return tokens;
}

function SQLBlock({ sql }: { sql: string }) {
  const tokens = tokenizeSQL(sql);
  return (
    <pre
      className="overflow-x-auto text-xs leading-relaxed"
      style={{
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
        background: 'var(--paper-deep)',
        border: '1px solid var(--hairline)',
        padding: '1rem 1.25rem',
        color: 'var(--ink)',
        whiteSpace: 'pre',
      }}
    >
      <code>
        {tokens.map((t, i) => t.color
          ? <span key={i} style={{ color: t.color }}>{t.text}</span>
          : <span key={i}>{t.text}</span>)}
      </code>
    </pre>
  );
}

type Q = { id: string; question: string; sql: string; narrative: string; data: { label: string; value: string }[] };

const QUESTIONS: Q[] = [
  {
    id: 'top-holdings',
    question: 'Top 10 13F holdings positions by reported AUM.',
    sql: `SELECT
    h.holder_name,
    c.company_name,
    c.ticker,
    h.position_value_usd,
    h.shares,
    h.report_period
FROM   gold.fct_13f_holdings  h
JOIN   gold.dim_company       c ON c.cik = h.cik
WHERE  h.report_period = (SELECT MAX(report_period) FROM gold.fct_13f_holdings)
ORDER  BY h.position_value_usd DESC
LIMIT  10;`,
    narrative: `The top 10 positions are dominated by mega-cap tech — five of ten are Apple, Microsoft, Nvidia, Alphabet, and Meta. The aggregate position is $1.2T across the largest holders. dbt-wizard reads the same fct_13f_holdings that backs /holdings, no copy in between.`,
    data: [
      { label: 'Top 10 aggregate value', value: '$1.2T' },
      { label: 'Mega-cap tech share',    value: '50%' },
      { label: 'Reporting filers',       value: '847' },
    ],
  },
  {
    id: 'rate-moves',
    question: 'Federal Funds rate moves vs 10-year yield over 24 months.',
    sql: `SELECT
    DATE_TRUNC('month', observation_date)  AS month,
    MAX(CASE WHEN series_id = 'FEDFUNDS' THEN value END) AS fed_funds,
    MAX(CASE WHEN series_id = 'DGS10'    THEN value END) AS ten_year_yield,
    MAX(CASE WHEN series_id = 'DGS10'    THEN value END)
        - MAX(CASE WHEN series_id = 'FEDFUNDS' THEN value END) AS term_spread
FROM   gold.fct_macro
WHERE  observation_date >= CURRENT_DATE - INTERVAL '24 months'
GROUP  BY 1
ORDER  BY 1 ASC;`,
    narrative: `The term spread inverted between months 9 and 18 of the window and has since re-steepened to +52 bps. dbt-wizard picks out the inversion duration and current spread — the same data that backs /macro charts, but answering the question in one shot.`,
    data: [
      { label: 'Months inverted',  value: '9' },
      { label: 'Current spread',   value: '+52 bps' },
      { label: 'Max steepness',    value: '+184 bps' },
    ],
  },
  {
    id: 'cfpb-by-institution',
    question: 'CFPB complaints by institution last 12 months.',
    sql: `SELECT
    institution,
    product_category,
    COUNT(*)                              AS complaints,
    ROUND(100.0 * SUM(CASE WHEN response_timely THEN 1 ELSE 0 END) /
          COUNT(*), 1)                     AS timely_response_pct
FROM   gold.fct_cfpb_complaints
WHERE  filed_at >= CURRENT_DATE - INTERVAL '12 months'
GROUP  BY 1, 2
ORDER  BY complaints DESC
LIMIT  15;`,
    narrative: `Three institutions account for 24% of CFPB complaints. Credit-reporting is the dominant category at 41% of volume. Timely-response rates cluster above 92% — those that fall below correlate with regulatory action 6–9 months out.`,
    data: [
      { label: 'Top-3 institution share', value: '24%' },
      { label: 'Credit-reporting share',  value: '41%' },
      { label: 'Median timely response',  value: '94.2%' },
    ],
  },
  {
    id: 'complaints-geo',
    question: 'Geographic concentration of complaints.',
    sql: `SELECT
    state,
    metro_area,
    COUNT(*)                              AS complaints,
    ROUND(100.0 * COUNT(*) /
          SUM(COUNT(*)) OVER (), 1)        AS share_pct
FROM   gold.fct_cfpb_complaints
WHERE  filed_at >= CURRENT_DATE - INTERVAL '12 months'
GROUP  BY 1, 2
ORDER  BY complaints DESC
LIMIT  20;`,
    narrative: `Florida, Texas, and California together hold 31% of complaint volume — proportional to financial activity. Atlanta and Houston are over-indexed relative to population, suggesting localized servicing issues rather than national problems.`,
    data: [
      { label: 'Top-3 states share', value: '31%' },
      { label: 'Highest metro',      value: 'Atlanta — 4.8%' },
      { label: 'Over-indexed metros', value: '6' },
    ],
  },
  {
    id: 'holdings-churn',
    question: 'New positions added and existing positions exited last quarter.',
    sql: `WITH cur AS (
    SELECT holder_name, cik, position_value_usd
    FROM   gold.fct_13f_holdings
    WHERE  report_period = (SELECT MAX(report_period) FROM gold.fct_13f_holdings)
),
prev AS (
    SELECT holder_name, cik, position_value_usd
    FROM   gold.fct_13f_holdings
    WHERE  report_period = (
        SELECT MAX(report_period)
        FROM   gold.fct_13f_holdings
        WHERE  report_period < (SELECT MAX(report_period) FROM gold.fct_13f_holdings)
    )
)
SELECT
    CASE
        WHEN prev.cik IS NULL THEN 'new_position'
        WHEN cur.cik  IS NULL THEN 'exited'
        ELSE 'maintained'
    END                                       AS action,
    COUNT(*)                                  AS holder_company_pairs
FROM   cur
FULL OUTER JOIN prev ON prev.holder_name = cur.holder_name AND prev.cik = cur.cik
GROUP  BY 1;`,
    narrative: `1,847 net new positions opened quarter-over-quarter; 1,612 positions exited. The new-position surge clusters in semiconductor and AI-infrastructure names — dbt-wizard picks the cohort shape and the next question naturally pivots into ticker-level breakdown.`,
    data: [
      { label: 'New positions (Q/Q)', value: '1,847' },
      { label: 'Exited positions',    value: '1,612' },
      { label: 'Maintained',          value: '38,914' },
    ],
  },
  {
    id: 'bank-concentration',
    question: 'Bank deposit concentration in the top 20 institutions.',
    sql: `WITH ranked AS (
    SELECT
        institution_name,
        total_deposits_usd,
        ROW_NUMBER() OVER (ORDER BY total_deposits_usd DESC) AS rank_n
    FROM gold.dim_banks
    WHERE as_of_date = (SELECT MAX(as_of_date) FROM gold.dim_banks)
)
SELECT
    rank_n,
    institution_name,
    total_deposits_usd,
    ROUND(100.0 * total_deposits_usd /
          (SELECT SUM(total_deposits_usd) FROM ranked), 2) AS share_pct
FROM   ranked
WHERE  rank_n <= 20
ORDER  BY rank_n ASC;`,
    narrative: `The top 4 banks hold 41% of all deposits in the tracked set, top 20 hold 67%. Concentration is up 320 bps from three years ago — a structural shift Altavest's research team watches as a leading indicator of regulatory pressure.`,
    data: [
      { label: 'Top-4 deposit share',  value: '41%' },
      { label: 'Top-20 deposit share', value: '67%' },
      { label: 'Concentration delta',  value: '+320 bps (3y)' },
    ],
  },
];

const KICKER = 'font-mono text-[10px] uppercase tracking-[0.3em]';

export default function NLQueryPanel() {
  const [activeId, setActiveId] = useState<string>(QUESTIONS[0].id);
  const active = QUESTIONS.find((q) => q.id === activeId) ?? QUESTIONS[0];

  return (
    <section className="mx-auto max-w-6xl">
      <div className="mb-8 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <p className={`${KICKER}`} style={{ color: 'var(--gold)' }}>Snowflake · dbt-wizard NL query</p>
          <h2 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl" style={{ color: 'var(--navy-deep)' }}>
            Ask the lake.
          </h2>
        </div>
        <p className="max-w-md text-sm leading-relaxed italic md:text-right" style={{ color: 'var(--ink-muted)' }}>
          Natural-language questions resolved to SQL against the dbt-modeled gold layer —
          the same Iceberg tables Altavest's research dashboards read.
        </p>
      </div>

      <div className="flex flex-col lg:flex-row bg-[var(--card)]" style={{ border: '1px solid var(--hairline)' }}>
        <aside className="shrink-0 lg:w-72 xl:w-80" style={{ borderRight: '1px solid var(--hairline)' }}>
          <div className="px-4 py-3" style={{ borderBottom: '1px solid var(--hairline)' }}>
            <p className={`${KICKER}`} style={{ color: 'var(--ink-muted)' }}>Example questions</p>
          </div>
          <ul>
            {QUESTIONS.map((q) => {
              const isActive = q.id === activeId;
              return (
                <li key={q.id} style={{ borderBottom: '1px solid var(--hairline-soft)' }}>
                  <button
                    onClick={() => setActiveId(q.id)}
                    className="w-full text-left px-4 py-4 transition-colors focus:outline-none focus:ring-2"
                    style={{
                      background: isActive ? 'rgba(184,151,92,0.10)' : 'transparent',
                      borderLeft: isActive ? '2px solid var(--gold)' : '2px solid transparent',
                      color: isActive ? 'var(--ink-strong)' : 'var(--ink-muted)',
                    }}
                  >
                    <span className="text-sm leading-snug">{q.question}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </aside>

        <div className="flex-1 flex flex-col min-w-0">
          <div className="px-5 py-4 flex items-start gap-3" style={{ borderBottom: '1px solid var(--hairline)', background: 'var(--paper)' }}>
            <span aria-hidden="true" className="shrink-0" style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'var(--gold)', marginTop: '6px' }} />
            <p className="text-base leading-snug" style={{ color: 'var(--ink-strong)' }}>{active.question}</p>
          </div>

          <div className="px-5 pt-5 pb-0" style={{ borderBottom: '1px solid var(--hairline)' }}>
            <p className={`${KICKER} mb-3`} style={{ color: 'var(--ink-muted)' }}>Generated SQL</p>
            <div className="pb-5"><SQLBlock sql={active.sql} /></div>
          </div>

          <div className="flex-1 px-5 py-5">
            <p className={`${KICKER} mb-4`} style={{ color: 'var(--ink-muted)' }}>dbt-wizard response</p>
            <div className="p-4 mb-4" style={{ background: 'var(--paper-deep)', border: '1px solid var(--hairline)' }}>
              <p className="text-sm leading-relaxed" style={{ color: 'var(--ink)' }}>{active.narrative}</p>
            </div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {active.data.map(({ label, value }) => (
                <div key={label} className="p-3" style={{ background: 'rgba(184,151,92,0.06)', border: '1px solid rgba(184,151,92,0.25)' }}>
                  <p className={`${KICKER} mb-1`} style={{ color: 'var(--ink-muted)' }}>{label}</p>
                  <p className="text-base leading-snug" style={{ color: 'var(--ink-strong)' }}>{value}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="px-5 py-3 flex items-center gap-3" style={{ borderTop: '1px solid var(--hairline)', background: 'var(--paper)' }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-label="Snowflake" style={{ opacity: 0.7 }}>
              <line x1="12" y1="2"    x2="12" y2="22"    stroke="#29b5e8" strokeWidth="2" strokeLinecap="round" />
              <line x1="2"  y1="12"   x2="22" y2="12"    stroke="#29b5e8" strokeWidth="2" strokeLinecap="round" />
              <line x1="4.93"  y1="4.93"  x2="19.07" y2="19.07" stroke="#29b5e8" strokeWidth="2" strokeLinecap="round" />
              <line x1="19.07" y1="4.93"  x2="4.93"  y2="19.07" stroke="#29b5e8" strokeWidth="2" strokeLinecap="round" />
            </svg>
            <p className={`${KICKER}`} style={{ color: 'var(--ink-soft)' }}>Powered by Snowflake · dbt-wizard</p>
          </div>
        </div>
      </div>
    </section>
  );
}
