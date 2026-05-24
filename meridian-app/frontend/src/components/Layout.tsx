import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useEffect, useRef, useState } from 'react';
import { api, getSnapshotTime, subscribeSource, type DataSource } from '../api/queries';
import * as watchlist from '../watchlist';
import PacSync from './PacSync';
import HelpTour from './HelpTour';

// Konami code: ↑ ↑ ↓ ↓ ← → ← → B A — unlocks the SpaceSync/PacSync easter egg.
const KONAMI = ['arrowup', 'arrowup', 'arrowdown', 'arrowdown', 'arrowleft', 'arrowright', 'arrowleft', 'arrowright', 'b', 'a'];

// Canonical 3-group nav order, shared across Clarity / Verity / Altavest:
//   1. Narrative (Home → Scenario → Live → Outcome)
//   2. Persona pages (industry-specific)
//   3. ODI plumbing (Architecture → Pipeline → Wizard → About)
// A vertical divider renders before /architecture so the two groups read
// as separate clusters without crowding the bar.
const NAV_ITEMS: [string, string][] = [
  // — narrative —
  ['/', 'Home'],
  ['/scenario', 'Scenario'],
  ['/wizard-live', 'Live'],
  ['/outcome', 'Outcome'],
  // — persona —
  ['/holdings', 'Holdings'],
  ['/related', 'Related'],
  ['/macro', 'Macro'],
  ['/complaints', 'Complaint Radar'],
  ['/geography', 'Geographic'],
  ['/agent', 'Research AI'],
  // — ODI plumbing —
  ['/architecture', 'ODI Architecture'],
  ['/pipeline', 'Pipeline'],
  ['/dbt-wizard', 'Wizard'],
  ['/about', 'About'],
];

const NAV_DIVIDER_BEFORE = new Set(['/architecture']);

const DEMOS = [
  { key: 'tax-assessment', name: 'Allegheny County Tax', industry: 'Public sector · Property assessment', url: 'https://fivetran-jasonchletsos.github.io/tax-assessment-databricks-demo/', accent: '#dc2626' },
  { key: 'healthcare',     name: 'Clarity Health',         industry: 'Healthcare · Clinical analytics',     url: 'https://fivetran-jasonchletsos.github.io/Healthcare-EPIC-Snowflake-Demo/', accent: '#0d9488' },
  { key: 'finserv',        name: 'Altavest Capital',     industry: 'Financial Services · Wealth & banking', url: 'https://fivetran-jasonchletsos.github.io/FinServ-ODI-Demo/', accent: '#1d4ed8' },
  { key: 'insurance',     name: 'Verity Insurance',           industry: 'Insurance · Policies, claims, reinsurance', url: 'https://fivetran-jasonchletsos.github.io/Insurance-ODI-Demo/', accent: '#0369a1' },
  { key: 'media',          name: 'Lighthouse Media',     industry: 'Media · Audience intelligence',       url: 'https://fivetran-jasonchletsos.github.io/Media-ODI-Demo/', accent: '#7c3aed' },
  { key: 'retail',         name: 'Storefront Analytics', industry: 'Retail & e-commerce',                  url: 'https://fivetran-jasonchletsos.github.io/RetailEcom-ODI-Demo/', accent: '#ea580c' },
  { key: 'techsaas',       name: 'SaaS Pulse',           industry: 'Tech · SaaS analytics',                url: 'https://fivetran-jasonchletsos.github.io/TechSaaS-ODI-Demo/', accent: '#059669' },
  { key: 'supplychain',    name: 'Manifest',             industry: 'Supply chain · Logistics',             url: 'https://fivetran-jasonchletsos.github.io/SupplyChain-ODI-Demo/', accent: '#0891b2' },
  { key: 'lifesci',        name: 'Cohort',               industry: 'Life sciences · Clinical research',    url: 'https://fivetran-jasonchletsos.github.io/LifeSci-ODI-Demo/', accent: '#be185d' },
  { key: 'mission-control', name: 'Mission Control', industry: 'Admin · Governance + observability', url: 'https://fivetran-jasonchletsos.github.io/ODI-Mission-Control/', accent: '#22d3ee' },
];
const CURRENT_DEMO = 'finserv';

export default function Layout() {
  const [source, setSource] = useState<DataSource>('demo');
  const [snapshotAt, setSnapshotAt] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [mobileOpen, setMobileOpen] = useState(false);
  const [watchCount, setWatchCount] = useState(0);
  const [easterEggOpen, setEasterEggOpen] = useState(false);
  const konamiBufferRef = useRef<string[]>([]);
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    const unsub = subscribeSource(setSource);
    api.getSummary().finally(() => setSnapshotAt(getSnapshotTime())).catch(() => {});
    const wsub = watchlist.subscribe((ids) => setWatchCount(ids.length));
    return () => { unsub(); wsub(); };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName?.toLowerCase();
      if (tag === 'input' || tag === 'textarea' || (e.target as HTMLElement)?.isContentEditable) return;
      const key = e.key.toLowerCase();
      const buf = konamiBufferRef.current;
      buf.push(key);
      if (buf.length > KONAMI.length) buf.shift();
      if (buf.length === KONAMI.length && buf.every((k, i) => k === KONAMI[i])) {
        konamiBufferRef.current = [];
        setEasterEggOpen(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => { setMobileOpen(false); }, [location.pathname]);

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const q = query.trim();
    navigate(q ? `/holdings?q=${encodeURIComponent(q)}` : '/holdings');
    setMobileOpen(false);
  };

  return (
    <div className="min-h-full flex flex-col bg-[var(--paper)]">
      <div className="institutional-rail" />

      {/* Dark navy header — Wall Street prime-broker portal feel */}
      <header className="bg-[var(--navy-deep)] text-white sticky top-0 z-30">
        <div className="mx-auto max-w-7xl px-3 sm:px-6 lg:px-8">
          <div className="flex h-16 sm:h-20 items-center justify-between gap-2 sm:gap-6">
            <Link to="/" className="flex items-center gap-3 shrink-0 min-w-0 group">
              <div className="h-10 w-10 rounded-sm flex items-center justify-center" style={{ background: 'var(--gold)' }}>
                <MeridianMark className="h-6 w-6 text-[var(--navy-deep)]" />
              </div>
              <div className="leading-tight min-w-0">
                <div className="font-serif font-semibold text-lg sm:text-xl tracking-tight truncate">
                  Altavest Capital
                </div>
                <div className="mt-0.5 text-[10px] sm:text-[11px] font-medium uppercase tracking-[0.18em] text-[var(--gold-bright)]">
                  Research & Risk Intelligence
                </div>
              </div>
            </Link>

            <form onSubmit={onSubmit} className="hidden md:flex flex-1 max-w-md relative">
              <span className="absolute inset-y-0 left-3 flex items-center text-white/50 pointer-events-none">
                <SearchIcon className="h-4 w-4" />
              </span>
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Ticker, CIK, company name…"
                className="flex-1 rounded-sm bg-white/10 border border-white/15 pl-9 pr-3 py-2 text-sm text-white placeholder:text-white/40 focus:bg-white/15 focus:border-[var(--gold)] focus:outline-none"
              />
            </form>

            <nav className="hidden lg:flex items-center gap-0.5 text-sm">
              {NAV_ITEMS.map(([to, label]) => (
                <span key={to} className="contents">
                  {NAV_DIVIDER_BEFORE.has(to) && (
                    <span aria-hidden className="mx-2 h-5 w-px self-center" style={{ background: 'rgba(255,255,255,0.18)' }} />
                  )}
                  <NavLink
                    to={to}
                    end={to === '/'}
                    className={({ isActive }) =>
                      `relative px-2.5 py-2 font-medium tracking-tight transition-colors text-[13px] whitespace-nowrap ${
                        isActive ? 'text-[var(--gold-bright)]' : 'text-white/80 hover:text-white'
                      }`
                    }
                  >
                    {({ isActive }) => (
                      <>
                        {label}
                        {isActive && (
                          <span className="absolute left-2.5 right-2.5 -bottom-[1px] h-[2px]" style={{ background: 'var(--gold)' }} />
                        )}
                      </>
                    )}
                  </NavLink>
                </span>
              ))}
            </nav>

            <div className="flex items-center gap-1 sm:gap-2">
              <button
                onClick={() => navigate('/watchlist')}
                className="relative inline-flex h-9 w-9 items-center justify-center rounded-sm text-white/80 hover:text-white hover:bg-white/10"
                aria-label="Watchlist"
                title="Watchlist"
              >
                <svg viewBox="0 0 24 24" className="h-5 w-5" fill={watchCount > 0 ? 'var(--gold)' : 'none'} stroke="currentColor" strokeWidth="1.75" strokeLinejoin="round">
                  <path d="M12 17.27 18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z" />
                </svg>
                {watchCount > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 h-4 min-w-4 px-1 inline-flex items-center justify-center rounded-full bg-[var(--gold)] text-[10px] font-extrabold text-[var(--navy-deep)]">
                    {watchCount}
                  </span>
                )}
              </button>
              <DemoSwitcher source={source} snapshotAt={snapshotAt} />
              <button
                type="button"
                onClick={() => setMobileOpen((o) => !o)}
                aria-label={mobileOpen ? 'Close menu' : 'Open menu'}
                className="lg:hidden h-9 w-9 inline-flex items-center justify-center rounded-sm text-white/80 hover:bg-white/10"
              >
                <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
                  {mobileOpen ? <path strokeLinecap="round" d="M6 6l12 12M18 6L6 18" /> : <path strokeLinecap="round" d="M4 7h16M4 12h16M4 17h16" />}
                </svg>
              </button>
            </div>
          </div>

          {mobileOpen && (
            <div className="lg:hidden pb-4 border-t border-white/10 pt-3 space-y-3">
              <form onSubmit={onSubmit} className="md:hidden flex relative">
                <span className="absolute inset-y-0 left-3 flex items-center text-white/50">
                  <SearchIcon className="h-4 w-4" />
                </span>
                <input
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Ticker, CIK, name…"
                  className="flex-1 rounded-sm bg-white/10 border border-white/15 pl-9 pr-3 py-2 text-sm text-white placeholder:text-white/40"
                />
              </form>
              <nav className="grid grid-cols-2 gap-1 text-sm">
                {NAV_ITEMS.map(([to, label]) => (
                  <NavLink
                    key={to}
                    to={to}
                    end={to === '/'}
                    className={({ isActive }) =>
                      `px-3 py-2 rounded-sm text-center font-medium border ${
                        isActive
                          ? 'bg-[var(--gold)] text-[var(--navy-deep)] border-[var(--gold)]'
                          : 'border-white/15 text-white/80 hover:bg-white/10'
                      }`
                    }
                  >
                    {label}
                  </NavLink>
                ))}
              </nav>
              <div className="pt-3 border-t border-white/10">
                <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--gold-bright)] mb-2">
                  Switch demo
                </div>
                <div className="grid grid-cols-1 gap-1">
                  {DEMOS.map((d) => {
                    const current = d.key === CURRENT_DEMO;
                    const inner = (
                      <div className="flex items-center gap-2.5">
                        <span className="h-2 w-2 rounded-full shrink-0" style={{ background: d.accent }} />
                        <div className="flex-1 min-w-0">
                          <div className="text-[13px] font-semibold text-white truncate">{d.name}</div>
                          <div className="text-[11px] text-white/55 truncate">{d.industry}</div>
                        </div>
                        {current && (
                          <span className="text-[9px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded-sm bg-[var(--gold)]/20 text-[var(--gold-bright)] border border-[var(--gold)]/40">
                            Current
                          </span>
                        )}
                      </div>
                    );
                    return current ? (
                      <div key={d.key} className="px-3 py-2 rounded-sm border border-white/15 opacity-70">
                        {inner}
                      </div>
                    ) : (
                      <a
                        key={d.key}
                        href={d.url}
                        className="px-3 py-2 rounded-sm border border-white/15 hover:bg-white/10"
                      >
                        {inner}
                      </a>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </div>
      </header>

      {/* Ticker tape — real-time macro indicator strip */}
      <div
        className="ticker-tape border-b bg-[var(--navy-deep)]"
        style={{ borderColor: 'rgba(184,151,92,0.25)', height: '28px', display: 'flex', alignItems: 'center' }}
      >
        <div className="ticker-tape-inner text-[10px] font-mono font-medium tracking-wider" style={{ color: 'rgba(212,175,117,0.75)' }}>
          {[
            'FED FUNDS 5.25–5.50',
            'DGS10 4.28',
            'T10Y2Y −0.41 ▼',
            'CPIAUCSL 3.2% YoY',
            'UNRATE 3.9%',
            'GDP +2.8% QoQ',
            'ICEBERG · 14 TABLES · S3',
            'ATHENA ENGINE V3 · ACTIVE',
            'dbt BUILD PASSED · 104/105',
            'CFPB COMPLAINTS · 9.8K',
            'SEC EDGAR · 84K FILINGS',
            'BRONZE → SILVER → GOLD',
            'FED FUNDS 5.25–5.50',
            'DGS10 4.28',
            'T10Y2Y −0.41 ▼',
            'CPIAUCSL 3.2% YoY',
            'UNRATE 3.9%',
            'GDP +2.8% QoQ',
            'ICEBERG · 14 TABLES · S3',
            'ATHENA ENGINE V3 · ACTIVE',
            'dbt BUILD PASSED · 104/105',
            'CFPB COMPLAINTS · 9.8K',
            'SEC EDGAR · 84K FILINGS',
            'BRONZE → SILVER → GOLD',
          ].map((item, i) => (
            <span key={i} className="mx-6">{item}</span>
          ))}
        </div>
      </div>

      <main className="flex-1">
        <Outlet />
      </main>

      <footer className="border-t border-[var(--hairline)] bg-[var(--navy-deep)] text-white/80 mt-16">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-10 grid grid-cols-1 md:grid-cols-3 gap-8 text-sm">
          <div>
            <div className="flex items-center gap-2 mb-3">
              <div className="h-7 w-7 rounded-sm flex items-center justify-center" style={{ background: 'var(--gold)' }}>
                <MeridianMark className="h-4 w-4 text-[var(--navy-deep)]" />
              </div>
              <div className="font-serif font-semibold text-white">Altavest Capital</div>
            </div>
            <p className="leading-relaxed text-white/60">
              Research &amp; risk intelligence portal built on Fivetran Open Data Infrastructure.
              Synthetic data — for ODI architecture demonstration only.
            </p>
            <a
              href={`${import.meta.env.BASE_URL || '/'}Altavest-Capital-3min-Demo-Runbook.pdf`}
              download
              className="mt-3 inline-flex items-center gap-2 rounded-sm border border-white/20 bg-white/5 px-2.5 py-1.5 text-[11px] font-semibold text-white/80 hover:border-[var(--gold)] hover:text-white transition-colors"
            >
              <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <path d="M14 2v6h6" />
                <path d="M12 18v-6" /><path d="M9 15l3 3 3-3" />
              </svg>
              3-min demo runbook (PDF)
            </a>
          </div>
          <div>
            <div className="eyebrow-light mb-2">Data Pipeline</div>
            <p className="leading-relaxed text-white/70">
              SEC EDGAR · FRED · CFPB → Fivetran connectors → S3 + Apache Iceberg → dbt
              (bronze / silver / gold) → Snowflake → static JSON snapshot
            </p>
          </div>
          <div>
            <div className="eyebrow-light mb-2">Open Standards</div>
            <p className="leading-relaxed text-white/70">
              Apache Iceberg · Snowflake Open Catalog · ANSI SQL · dbt semantic layer.
              Any compute engine. No lock-in.
            </p>
          </div>
        </div>
        <div className="border-t border-white/10">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-3 text-[11px] text-white/50 flex flex-col sm:flex-row gap-1 sm:items-center sm:justify-between">
            <div>© 2026 Altavest Capital ODI Demo · Fivetran Open Data Infrastructure</div>
            <div>Snapshot {snapshotAt ? new Date(snapshotAt).toLocaleString() : '—'}</div>
          </div>
        </div>
      </footer>

      {easterEggOpen && <PacSync onClose={() => setEasterEggOpen(false)} />}

      <HelpTour />
    </div>
  );
}

function DemoSwitcher({ source }: { source: DataSource; snapshotAt: string | null }) {
  const live = source === 'live';
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div ref={wrapRef} className="relative hidden sm:block">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        title={live ? 'Live Athena query on Iceberg gold layer · Switch demo' : 'Static snapshot · Switch demo'}
        className={`inline-flex items-center gap-1.5 rounded-sm px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider border transition-colors ${
          live
            ? 'bg-emerald-500/15 text-emerald-200 border-emerald-400/30 hover:bg-emerald-500/25'
            : 'bg-[var(--gold)]/20 text-[var(--gold-bright)] border-[var(--gold)]/40 hover:bg-[var(--gold)]/30'
        }`}
      >
        <span className={`h-1.5 w-1.5 rounded-full ${live ? 'bg-emerald-300' : 'bg-[var(--gold-bright)]'} animate-pulse`} />
        {live ? 'Athena · live' : 'Snapshot'}
        <svg viewBox="0 0 24 24" className={`h-3 w-3 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full mt-2 w-[280px] rounded-sm border border-[var(--hairline)] bg-white shadow-xl z-40 overflow-hidden"
        >
          <div className="px-3 pt-3 pb-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--ink-muted,#64748b)] border-b border-[var(--hairline)]">
            Switch demo
          </div>
          <div className="py-1">
            {DEMOS.map((d) => {
              const current = d.key === CURRENT_DEMO;
              const inner = (
                <div className="flex items-center gap-2.5 px-3 py-2">
                  <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ background: d.accent }} />
                  <div className="flex-1 min-w-0">
                    <div className="text-[13px] font-semibold text-[var(--ink,#0f172a)] truncate">{d.name}</div>
                    <div className="text-[11px] text-slate-500 truncate">{d.industry}</div>
                  </div>
                  {current && (
                    <span className="text-[9px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded-sm bg-slate-100 text-slate-600 border border-slate-200">
                      Current
                    </span>
                  )}
                </div>
              );
              return current ? (
                <div key={d.key} className="opacity-60 cursor-default">{inner}</div>
              ) : (
                <a
                  key={d.key}
                  href={d.url}
                  className="block hover:bg-slate-50 transition-colors"
                  onClick={() => setOpen(false)}
                >
                  {inner}
                </a>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function SearchIcon({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      <circle cx="11" cy="11" r="7" />
      <path d="m21 21-4.3-4.3" />
    </svg>
  );
}

// Meridian compass-rose mark (the firm's logo glyph)
function MeridianMark({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 3 L12 21 M3 12 L21 12" />
      <path d="M12 12 L6 6 L9 12 Z" fill="currentColor" stroke="none" opacity="0.7" />
      <path d="M12 12 L18 18 L15 12 Z" fill="currentColor" stroke="none" opacity="0.7" />
    </svg>
  );
}
