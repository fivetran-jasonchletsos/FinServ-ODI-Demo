import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../api/queries';
import { answer, askClaude, getApiKey, setApiKey, type AgentResponse } from '../agent';
import type { Company } from '../types';

const SUGGESTED = [
  'Companies with rising complaints',
  'Top 10 by revenue growth',
  'Financials with weak macro exposure',
  'Yield curve inversion impact',
  'Companies with most 8-K events',
  'Highest risk score in Financials',
];

export default function AgentPage() {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [history, setHistory] = useState<{ q: string; r: AgentResponse; error?: string; pending?: boolean }[]>([]);
  const [useClaude, setUseClaude] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [apiKeyInput, setApiKeyInput] = useState('');
  const [hasKey, setHasKey] = useState(false);
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const autoAskedRef = useRef<string | null>(null);

  useEffect(() => {
    api.searchCompanies({ limit: 100000 })
      .then((r) => setCompanies(r.results))
      .finally(() => setLoading(false));
    setHasKey(!!getApiKey());
  }, []);

  const ask = async (question: string) => {
    const text = question.trim();
    if (!text || loading) return;
    setQ('');
    if (useClaude && hasKey) {
      const idx = history.length;
      setHistory((h) => [...h, { q: text, r: { intent: 'pending', source: 'claude', summary: 'Asking Claude…' }, pending: true }]);
      try {
        const prior = history[history.length - 1]?.r.summary;
        const r = await askClaude(text, companies, prior);
        setHistory((h) => h.map((entry, i) => (i === idx ? { q: text, r } : entry)));
      } catch (err: any) {
        const fallback = answer(text, companies);
        const message = err?.message ?? String(err);
        setHistory((h) => h.map((entry, i) => (i === idx ? { q: text, r: fallback, error: message } : entry)));
      }
    } else {
      setHistory((h) => [...h, { q: text, r: answer(text, companies) }]);
    }
  };

  useEffect(() => {
    const preset = searchParams.get('q');
    if (!preset || loading || autoAskedRef.current === preset) return;
    autoAskedRef.current = preset;
    ask(preset);
    setSearchParams({}, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, searchParams]);

  const saveKey = () => { setApiKey(apiKeyInput || null); setHasKey(!!apiKeyInput); setShowSettings(false); setApiKeyInput(''); };
  const clearKey = () => { setApiKey(null); setHasKey(false); setUseClaude(false); };

  return (
    <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6 lg:px-8">
      <header className="mb-6">
        <div className="eyebrow mb-1" style={{ color: 'var(--gold-dim)' }}>Portfolio AI</div>
        <div className="flex items-start justify-between gap-4">
          <h1 className="font-serif text-3xl font-semibold tracking-tight text-[var(--ink-strong)]">Research AI</h1>
          <Link to="/about-agent" className="hidden sm:inline-flex shrink-0 items-center gap-1 text-sm font-medium text-[var(--gold-dim)] hover:text-[var(--ink-strong)]">
            How it works <span aria-hidden>→</span>
          </Link>
        </div>
        <p className="text-sm text-[var(--ink-muted)] mt-2 max-w-2xl">
          Ask plain-English questions about the portfolio universe. Local rules answer instantly off the
          snapshot; flip on Claude mode for richer reasoning over the same JSON.
        </p>
      </header>

      <div className="research-card overflow-hidden">
        <div className="research-card-header flex items-center justify-between">
          <div className="flex items-center gap-3 text-sm">
            <span className="text-[var(--ink-muted)]">Mode:</span>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="radio" checked={!useClaude} onChange={() => setUseClaude(false)} className="accent-amber-600" />
              <span className="font-medium text-[var(--ink)]">Local rules</span>
              <span className="text-xs text-[var(--ink-soft)]">(always on)</span>
            </label>
            <label className={`flex items-center gap-2 cursor-pointer ${!hasKey ? 'opacity-50' : ''}`}>
              <input type="radio" checked={useClaude} onChange={() => hasKey && setUseClaude(true)} disabled={!hasKey} className="accent-amber-600" />
              <span className="font-medium text-[var(--ink)]">Ask Claude</span>
              {!hasKey && <span className="text-xs text-[var(--ink-soft)]">(needs API key)</span>}
            </label>
          </div>
          <button onClick={() => setShowSettings(!showSettings)} className="text-xs text-[var(--ink-muted)] hover:text-[var(--ink-strong)]">
            ⚙ Settings
          </button>
        </div>

        {showSettings && (
          <div className="border-b border-[var(--hairline-soft)] px-4 py-4 bg-[var(--caution-bg)] text-sm border-t border-amber-200">
            <p className="text-[var(--caution)] mb-3">
              Paste your Anthropic API key to enable Claude mode. Stored only in this browser's localStorage.
            </p>
            <div className="flex flex-col sm:flex-row gap-2">
              <input
                type="password"
                value={apiKeyInput}
                onChange={(e) => setApiKeyInput(e.target.value)}
                placeholder={hasKey ? '••••••••••••••• (key saved)' : 'sk-ant-api03-...'}
                className="flex-1 rounded-sm border border-[var(--hairline)] px-3 py-2 text-sm font-mono"
              />
              <button onClick={saveKey} className="rounded-sm text-white text-sm font-medium px-4 py-2" style={{ background: 'var(--navy-deep)' }}>Save</button>
              {hasKey && (
                <button onClick={clearKey} className="rounded-sm border border-[var(--hairline)] text-[var(--ink)] hover:bg-[var(--paper-deep)] text-sm px-3 py-2">Clear</button>
              )}
            </div>
          </div>
        )}

        <form onSubmit={(e: FormEvent) => { e.preventDefault(); ask(q); }} className="px-4 py-4 flex flex-col sm:flex-row gap-2">
          <input
            type="text"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={loading ? 'Loading snapshot…' : 'Ask in plain English'}
            className="flex-1 rounded-sm border border-[var(--hairline)] bg-white px-4 py-3 text-sm focus:border-[var(--gold)] focus:outline-none"
            disabled={loading}
          />
          <button
            type="submit"
            disabled={loading || !q.trim()}
            className="rounded-sm text-white text-sm font-semibold px-5 py-3 disabled:opacity-40 disabled:cursor-not-allowed"
            style={{ background: 'var(--navy-deep)' }}
          >
            Ask
          </button>
        </form>

        <div className="px-4 pb-4 flex flex-wrap gap-2">
          {SUGGESTED.map((s) => (
            <button
              key={s}
              onClick={() => ask(s)}
              disabled={loading}
              className="text-xs rounded-sm border border-[var(--hairline)] bg-[var(--paper-deep)] hover:bg-white hover:border-[var(--gold)] hover:text-[var(--gold-dim)] text-[var(--ink-muted)] px-3 py-1.5 transition-colors"
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-6 space-y-4">
        {history.length === 0 && !loading && (
          <div className="research-card border-dashed p-8 text-center text-sm text-[var(--ink-muted)]">
            Ask a question to see how the agent reasons over the snapshot.
          </div>
        )}
        {[...history].reverse().map((h, i) => {
          const isClaude = h.r.source === 'claude';
          return (
            <article key={history.length - i} className="research-card overflow-hidden">
              <header className="research-card-header flex items-start justify-between gap-3">
                <div>
                  <div className="eyebrow">Question</div>
                  <div className="mt-0.5 font-serif text-base font-semibold text-[var(--ink-strong)]">{h.q}</div>
                </div>
                {isClaude ? (
                  <span className="status-pill gold shrink-0">Claude</span>
                ) : (
                  <span className="status-pill neutral shrink-0">Rules</span>
                )}
              </header>
              <div className="p-4 text-sm">
                {h.error && (
                  <div className="mb-3 rounded-sm bg-[var(--bear-bg)] text-[var(--bear)] px-3 py-2 text-xs border border-rose-200">
                    Claude error — falling back to local rules. {h.error}
                  </div>
                )}
                <p className={`whitespace-pre-wrap leading-relaxed ${h.pending ? 'text-[var(--ink-soft)] animate-pulse' : 'text-[var(--ink)]'}`}>{h.r.summary}</p>
                {h.r.table && h.r.table.rows.length > 0 && (
                  <div className="mt-4 overflow-x-auto -mx-2 px-2">
                    <table className="min-w-full text-xs tabular">
                      <thead className="bg-[var(--paper-deep)] uppercase tracking-wider text-[var(--ink-soft)]">
                        <tr>{h.r.table.columns.map((c) => <th key={c} className="px-3 py-2 text-left whitespace-nowrap font-medium">{c}</th>)}</tr>
                      </thead>
                      <tbody className="divide-y divide-[var(--hairline-soft)]">
                        {h.r.table.rows.map((row, ri) => (
                          <tr
                            key={ri}
                            className={h.r.companyIds?.[ri] ? 'cursor-pointer hover:bg-[var(--paper-deep)]' : ''}
                            onClick={() => {
                              const id = h.r.companyIds?.[ri];
                              if (id) navigate(`/companies/${encodeURIComponent(id)}`);
                            }}
                          >
                            {row.map((cell, ci) => <td key={ci} className="px-3 py-2 whitespace-nowrap">{cell}</td>)}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {h.r.companyIds && <div className="mt-2 text-[11px] text-[var(--ink-soft)]">Tip: click a row to open the issuer.</div>}
                  </div>
                )}
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}
