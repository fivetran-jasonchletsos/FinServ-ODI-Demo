import NLQueryPanel from '../components/NLQueryPanel';

export default function AskPage() {
  return (
    <div className="px-4 sm:px-6 lg:px-8 py-10 lg:py-14">
      <div className="mx-auto max-w-6xl mb-10">
        <p className="font-mono text-[10px] uppercase tracking-[0.3em]" style={{ color: 'var(--gold)' }}>
          Ask the data — dbt-wizard natural language
        </p>
        <h1 className="mt-2 text-3xl sm:text-4xl font-semibold tracking-tight leading-tight" style={{ color: 'var(--navy-deep)' }}>
          One open lake. Many engines — even the LLM.
        </h1>
        <p className="mt-3 max-w-3xl leading-relaxed" style={{ color: 'var(--ink-muted)' }}>
          The dbt-wizard reads the same Snowflake gold tables that back every
          dashboard on this site. No copy, no separate AI data product, no
          vendor-controlled gateway — the lake is the contract; the agent is
          one more engine that plugs in.
        </p>
      </div>
      <NLQueryPanel />
    </div>
  );
}
