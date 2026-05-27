import { useMemo, useState } from 'react';
import ReplicationPipelinesCard, { type PipelineRow } from '../components/ReplicationPipelinesCard';

type FailureKey = 'connectors' | 'snowflake_iceberg' | 'dbt' | 'snowflake';

interface LayerState {
  ok: boolean;
  status: string;
  detail: string;
  failureDetail?: string;
}

export default function PipelinePage() {
  const [failures, setFailures] = useState<Set<FailureKey>>(new Set());

  const toggle = (k: FailureKey) =>
    setFailures((prev) => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });

  const layers: Record<FailureKey, LayerState> = useMemo(() => {
    const f = failures;
    return {
      connectors: f.has('connectors')
        ? { ok: false, status: 'sync failed', detail: 'Fivetran custom connectors — SEC EDGAR, FRED, CFPB.', failureDetail: 'Simulated: FRED API rate-limit hit on macro_observations sync. Retry scheduled in 15m.' }
        : { ok: true, status: 'on schedule', detail: '3 Fivetran custom connectors (SEC EDGAR, FRED, CFPB). Last sync 4h ago. Next sync in 2h.' },
      snowflake_iceberg: f.has('snowflake_iceberg')
        ? { ok: false, status: 'commit failed', detail: 'Snowflake Open Catalog — Iceberg REST endpoint', failureDetail: 'Simulated: Snowflake Open Catalog returned 503 during last Iceberg commit. Table snapshot uncommitted.' }
        : { ok: true, status: 'committed', detail: 'Snowflake Open Catalog (Iceberg REST). 14 tables across bronze · silver · gold.' },
      dbt: f.has('dbt')
        ? { ok: false, status: 'run failed', detail: 'dbt build — risk signal model in the gold layer', failureDetail: 'Simulated: model compilation failed. Test "unique_cik" returned 4 failures in the silver companies table.' }
        : { ok: true, status: 'last run passed', detail: 'dbt build completed 3h ago. 8 staging + 4 silver + 6 gold models passed all tests.' },
      snowflake: f.has('snowflake')
        ? { ok: false, status: 'query failed', detail: 'Snowflake compute — XS warehouse', failureDetail: 'Simulated: warehouse suspend/resume cycle exceeded timeout. Retry after warehouse resumes.' }
        : { ok: true, status: 'operational', detail: 'Snowflake XS warehouse altavest_odi. Iceberg external table reads. Avg query 1.2s.' },
    };
  }, [failures]);

  const demoMode = failures.size > 0;
  const anyDown = !Object.values(layers).every((l) => l.ok);

  // Synthesize per-connector replication rows for the dark monitoring console.
  // The real Altavest pipeline runs 3 Fivetran custom connectors; throughput +
  // lag values here are illustrative — they walk a presenter through the
  // observability surface without requiring the Fivetran Platform Connector.
  const connectorsDown = failures.has('connectors');
  const pipelineRows: PipelineRow[] = useMemo(() => {
    const mkSeries = (base: number, jitter: number, trend: number) => {
      const points: number[] = [];
      for (let i = 0; i < 24; i++) {
        const seasonal = Math.sin((i / 24) * Math.PI * 2) * jitter * 0.5;
        const drift = trend * (i / 23);
        const noise = ((i * 9301 + 49297) % 233280) / 233280 - 0.5; // deterministic
        points.push(Math.max(0, base + seasonal + drift + noise * jitter));
      }
      return {
        points,
        current: points[points.length - 1],
        min: Math.min(...points),
        max: Math.max(...points),
      };
    };
    return [
      {
        id: 'sec_edgar_filings',
        name: 'SEC EDGAR filings',
        schema: 'sec_edgar_filings',
        service: 'connector_sdk',
        sync_state: 'scheduled',
        failed_at: null,
        paused: false,
        dashboard_url: '',
        destination: 'Snowflake',
        source_db: 'SEC EDGAR REST',
        rows_synced_total: 84210,
        throughput_24h: mkSeries(420, 180, 60),
        lag_24h: mkSeries(45, 25, -5),
      },
      {
        id: 'fred_macro_series',
        name: 'FRED macro series',
        schema: 'fred_macro_series',
        service: 'connector_sdk',
        sync_state: connectorsDown ? 'failed' : 'scheduled',
        failed_at: connectorsDown ? new Date().toISOString() : null,
        paused: false,
        dashboard_url: '',
        destination: 'Snowflake',
        source_db: 'FRED API',
        rows_synced_total: 13455,
        throughput_24h: mkSeries(95, 40, connectorsDown ? -70 : 10),
        lag_24h: mkSeries(connectorsDown ? 320 : 30, 20, connectorsDown ? 600 : 0),
      },
      {
        id: 'cfpb_complaints',
        name: 'CFPB consumer complaints',
        schema: 'cfpb_complaints',
        service: 'connector_sdk',
        sync_state: 'scheduled',
        failed_at: null,
        paused: false,
        dashboard_url: '',
        destination: 'Snowflake',
        source_db: 'CFPB API',
        rows_synced_total: 9770,
        throughput_24h: mkSeries(140, 50, 20),
        lag_24h: mkSeries(60, 30, 5),
      },
    ];
  }, [connectorsDown]);

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
      <header className="mb-6 border-b border-[var(--hairline)] pb-4">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <div className="eyebrow mb-1">Pipeline Health</div>
            <h1 className="font-serif text-3xl font-semibold tracking-tight text-[var(--ink-strong)]">End-to-end status</h1>
            <p className="text-sm text-[var(--ink-muted)] mt-1 max-w-3xl leading-relaxed">
              Live posture of every layer that produces the Altavest research surface: Fivetran custom connectors,
              the Snowflake Open Catalog Iceberg lake, dbt medallion transformations, and the Snowflake query engine.
              Toggle <em>Simulate failure</em> on any layer to walk through observability and incident response patterns.
            </p>
          </div>
          <a
            href="https://fivetran.com/dashboard/connectors/mercy_individualism"
            target="_blank"
            rel="noopener noreferrer"
            className="shrink-0 inline-flex items-center gap-2 rounded-sm border border-[var(--gold)] bg-[var(--gold-bg)] px-4 py-2 text-[12px] font-semibold uppercase tracking-wider text-[var(--gold-dim)] hover:bg-[var(--gold)] hover:text-[var(--navy-deep)] transition-colors"
          >
            Open in Fivetran
            <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
              <polyline points="15 3 21 3 21 9" />
              <line x1="10" y1="14" x2="21" y2="3" />
            </svg>
          </a>
        </div>
      </header>

      <div
        className={`rounded-sm border p-4 flex items-start gap-3 ${
          !anyDown
            ? 'bg-[var(--bull-bg)] border-emerald-200'
            : 'bg-[var(--bear-bg)] border-rose-200'
        }`}
      >
        <span className={`mt-1 inline-block h-2.5 w-2.5 rounded-full ${!anyDown ? 'bg-[var(--bull)]' : 'bg-[var(--bear)]'} animate-pulse`} />
        <div className="flex-1">
          <div className={`text-[10px] font-semibold uppercase tracking-[0.12em] ${!anyDown ? 'text-[var(--bull)]' : 'text-[var(--bear)]'}`}>
            {!anyDown ? 'All systems operational' : 'Action required'}
          </div>
          <div className={`mt-0.5 text-sm ${!anyDown ? 'text-emerald-900' : 'text-rose-900'}`}>
            {!anyDown
              ? 'Every layer of the pipeline is healthy. Data is flowing end-to-end.'
              : 'One or more layers reported a failure — see the affected card below.'}
          </div>
        </div>
      </div>

      {demoMode && (
        <div className="mt-4 rounded-sm border border-amber-200 bg-[var(--caution-bg)] px-4 py-3 flex items-start justify-between gap-3">
          <div className="text-sm text-[var(--ink)]">
            <span className="font-semibold text-[var(--caution)]">Demo mode active</span>
            <span className="text-[var(--ink-muted)]"> — {failures.size} {failures.size === 1 ? 'layer is' : 'layers are'} showing simulated failures. The real pipeline is unaffected.</span>
          </div>
          <button
            onClick={() => setFailures(new Set())}
            className="shrink-0 rounded-sm border border-amber-300 bg-white hover:bg-[var(--caution-bg)] text-[var(--caution)] text-xs font-semibold px-3 py-1.5"
          >
            Restore all
          </button>
        </div>
      )}

      {/* Replication pipelines monitoring console — at-a-glance summary of
          every Fivetran connector with throughput + lag sparklines. */}
      <div className="mt-6 p-1.5 rounded-2xl bg-gradient-to-br from-slate-900 to-neutral-900 shadow-xl">
        <ReplicationPipelinesCard pipelines={pipelineRows} />
      </div>

      <Section n={1} title="Fivetran custom connectors" layer={layers.connectors} sim={failures.has('connectors')} onSim={() => toggle('connectors')}>
        <dt className="text-[10px] uppercase tracking-[0.08em] text-[var(--ink-soft)] font-semibold">Connectors</dt>
        <dd className="font-mono text-xs flex flex-wrap gap-2">
          {[
            'sec_edgar_filings',
            'fred_macro_series',
            'cfpb_complaints',
          ].map((label) => (
            <span
              key={label}
              className="text-[var(--gold-dim)]"
            >
              {label}
            </span>
          ))}
        </dd>
        <KV k="Runtime" v="Fivetran Connector SDK (Python)" />
        <KV k="Frequency" v="Every 6 hours" />
        <KV k="Destination" v="Snowflake (via Fivetran)" />
      </Section>

      <Section n={2} title="Snowflake Open Catalog (Iceberg)" layer={layers.snowflake_iceberg} sim={failures.has('snowflake_iceberg')} onSim={() => toggle('snowflake_iceberg')}>
        <KV k="Catalog" v="Snowflake Open Catalog (Iceberg REST endpoint)" />
        <KV k="Tables" v="14 across bronze · silver · gold" />
        <KV k="Format" v="Apache Iceberg v2 · Parquet files · ZSTD compression" />
        <KV k="Standard" v="Open table format — engine-agnostic, Snowflake-native" />
      </Section>

      <Section n={3} title="dbt medallion build" layer={layers.dbt} sim={failures.has('dbt')} onSim={() => toggle('dbt')}>
        <KV k="Project" v="altavest_odi" mono />
        <KV k="Adapter" v="dbt-snowflake (Iceberg-native)" mono />
        <KV k="Models" v="8 staging · 4 silver · 6 gold" />
        <KV k="Trigger" v="Cron 04:00, 10:00, 16:00, 22:00 UTC — post-connector-sync" />
      </Section>

      <Section n={4} title="Snowflake query engine" layer={layers.snowflake} sim={failures.has('snowflake')} onSim={() => toggle('snowflake')}>
        <KV k="Warehouse" v="altavest_odi (XS)" mono />
        <KV k="Engine" v="Snowflake — Iceberg external tables, dynamic tables" />
        <KV k="Snapshot export" v="scripts/build_snapshot.py → /public/data/*.json" />
        <KV k="Auth" v="Key-pair auth · ACCOUNTADMIN-delegated role" />
      </Section>

      <div className="mt-8 research-card p-4 text-xs text-[var(--ink-soft)] leading-relaxed">
        Live pipeline metadata appears once{' '}
        <code className="font-mono bg-[var(--paper-deep)] px-1.5 py-0.5 rounded border border-[var(--hairline)]">scripts/build_pipeline_status.py</code>{' '}
        runs against the Fivetran and Snowflake APIs. Until then this page shows the configured topology so demo
        presenters can walk through each layer manually.
      </div>
    </div>
  );
}

function Section({
  n, title, layer, children, sim, onSim,
}: {
  n: number;
  title: string;
  layer: LayerState;
  children: React.ReactNode;
  sim: boolean;
  onSim: () => void;
}) {
  return (
    <section className="mt-5 research-card overflow-hidden">
      <header className={`px-5 py-3.5 border-b border-[var(--hairline-soft)] flex items-start justify-between gap-3 ${layer.ok ? 'bg-gradient-to-b from-white to-[var(--bull-bg)]' : 'bg-gradient-to-b from-white to-[var(--bear-bg)]'}`}>
        <div className="flex items-start gap-3">
          <span
            className="inline-flex items-center justify-center h-8 w-8 rounded-sm font-serif font-semibold text-white text-sm shadow-sm shrink-0"
            style={{ background: layer.ok ? 'var(--navy-deep)' : 'var(--bear)' }}
          >
            {n}
          </span>
          <div className="min-w-0">
            <div className="font-serif font-semibold text-[var(--ink-strong)]">{title}</div>
            <div className="text-xs text-[var(--ink-muted)] mt-0.5">{layer.detail}</div>
          </div>
        </div>
        <span className={`status-pill shrink-0 ${layer.ok ? 'bull' : 'bear'}`}>{layer.status}</span>
      </header>
      <dl className="p-5 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3 text-sm">
        {children}
      </dl>
      {layer.failureDetail && (
        <div className="mx-5 mb-4 rounded-sm border border-rose-200 bg-[var(--bear-bg)] text-[var(--bear)] text-xs p-3 flex items-start gap-2">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4 mt-0.5 shrink-0">
            <path d="M12 9v4M12 17h.01M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
          </svg>
          <span><span className="font-semibold uppercase tracking-wider text-[10px]">Incident detail:</span> <span className="text-[var(--ink)]">{layer.failureDetail}</span></span>
        </div>
      )}
      <footer className="px-5 py-2.5 border-t border-[var(--hairline-soft)] bg-[var(--paper-deep)] flex justify-end">
        <button
          onClick={onSim}
          className={`inline-flex items-center gap-1.5 rounded-sm px-3 py-1 text-[11px] font-semibold uppercase tracking-wider border transition-colors ${
            sim
              ? 'bg-[var(--caution-bg)] hover:bg-amber-100 border-amber-300 text-[var(--caution)]'
              : 'bg-white hover:bg-[var(--bear-bg)] border-[var(--hairline)] hover:border-rose-300 text-[var(--ink-muted)] hover:text-[var(--bear)]'
          }`}
        >
          {sim ? 'Restore layer' : 'Simulate failure'}
        </button>
      </footer>
    </section>
  );
}

function KV({ k, v, mono }: { k: string; v: string; mono?: boolean }) {
  return (
    <>
      <dt className="text-[10px] uppercase tracking-[0.08em] text-[var(--ink-soft)] font-semibold">{k}</dt>
      <dd className={`text-[var(--ink-strong)] ${mono ? 'font-mono text-xs break-all' : ''}`}>{v}</dd>
    </>
  );
}
