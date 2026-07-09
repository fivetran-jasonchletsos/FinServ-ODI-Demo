// components/ProductStageRail.tsx
// Four-stage badge strip showing the real NewCo product-UI pipeline order,
// left to right. Ported identically across Clarity / Verity / Altavest.

const STAGES = [
  { label: 'Connections',     sub: 'Source connectors' },
  { label: 'Destinations',    sub: 'Iceberg lakehouse (MDLS)' },
  { label: 'Transformations', sub: 'dbt Labs + dbt-wizard' },
  { label: 'Activations',     sub: 'Reverse-ETL, native' },
] as const;

export default function ProductStageRail({ accent = '#0e7490' }: { accent?: string }) {
  return (
    <div className="mb-5 flex flex-wrap items-stretch gap-2" role="list" aria-label="NewCo product pipeline stages">
      {STAGES.map((s, i) => (
        <div key={s.label} className="flex items-center gap-2" role="listitem">
          <div className="rounded-sm border px-3 py-2" style={{ borderColor: 'var(--hairline)', background: 'var(--paper-deep, #f4efe2)' }}>
            <div className="text-[9.5px] font-bold uppercase tracking-wider" style={{ color: s.label === 'Activations' ? accent : 'var(--ink-soft)' }}>
              {s.label}
            </div>
            <div className="text-[10.5px] text-[var(--ink-muted)] mt-0.5 whitespace-nowrap">{s.sub}</div>
          </div>
          {i < STAGES.length - 1 && (
            <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 shrink-0" fill="none" stroke="var(--ink-soft)" strokeWidth="2.5" strokeLinecap="round">
              <path d="M5 12h14M13 5l7 7-7 7" />
            </svg>
          )}
        </div>
      ))}
    </div>
  );
}
