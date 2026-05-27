// ============================================================
// Meridian Research AI — local rules tier + optional Claude tier.
// Pattern mirrors the sheetz/healthcare demo agents but adapted
// for the FinServ-ODI dataset (Company-level reasoning over the
// gold-layer fct_company_risk_signal mart).
// ============================================================

import type { Company, Sector } from './types';

export interface AgentResponse {
  intent: string;
  summary: string;
  source: 'rules' | 'claude';
  table?: { columns: string[]; rows: (string | number)[][] };
  companyIds?: string[];
}

const KEY = 'meridian-odi:anthropic-api-key';

export function getApiKey() {
  try { return localStorage.getItem(KEY); } catch { return null; }
}
export function setApiKey(k: string | null) {
  try {
    if (k?.trim()) localStorage.setItem(KEY, k.trim());
    else localStorage.removeItem(KEY);
  } catch {}
}

function fmtMoney(n: number | null | undefined): string {
  if (n === null || n === undefined || Number.isNaN(n)) return '—';
  const abs = Math.abs(n);
  if (abs >= 1_000_000_000_000) return `$${(n / 1_000_000_000_000).toFixed(2)}T`;
  if (abs >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(1)}B`;
  if (abs >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  return `$${Math.round(n)}`;
}

function fmtPct(n: number | null | undefined): string {
  if (n === null || n === undefined || Number.isNaN(n)) return '—';
  return `${n >= 0 ? '+' : ''}${n.toFixed(1)}%`;
}

const SECTORS: Sector[] = [
  'Financials', 'Technology', 'Healthcare', 'Consumer Discretionary',
  'Consumer Staples', 'Energy', 'Industrials', 'Materials',
  'Utilities', 'Real Estate', 'Communication Services',
];

const intents: Array<{
  name: string;
  pattern: RegExp;
  handler: (m: RegExpMatchArray, cos: Company[]) => AgentResponse;
}> = [
  {
    name: 'rising_complaints',
    pattern: /(rising|increas|jump|spike|surge).+(complaint|cfpb)|(complaint|cfpb).+(rising|increas|jump|spike|surge)/i,
    handler: (_, cos) => {
      const hits = [...cos].sort((a, b) => b.complaint_velocity - a.complaint_velocity).slice(0, 25);
      return {
        intent: 'rising_complaints',
        source: 'rules',
        summary: `Top ${hits.length} issuers by CFPB complaint velocity. Elevated complaint flow is a leading indicator of regulatory action and is correlated historically with multiple-compression in financials.`,
        table: {
          columns: ['Ticker', 'Name', 'Sector', 'Complaints/Q', 'Risk'],
          rows: hits.map((c) => [c.ticker, c.name, c.sector ?? '—', c.complaint_velocity, c.risk_bucket]),
        },
        companyIds: hits.map((c) => c.cik),
      };
    },
  },
  {
    name: 'revenue_growth',
    pattern: /(revenue\s+growth|rev\s+growth|growth|grow|fastest.+grow)/i,
    handler: (_, cos) => {
      const hits = [...cos]
        .filter((c) => c.revenue_growth_yoy !== null)
        .sort((a, b) => (b.revenue_growth_yoy ?? -Infinity) - (a.revenue_growth_yoy ?? -Infinity))
        .slice(0, 25);
      return {
        intent: 'revenue_growth',
        source: 'rules',
        summary: `Top ${hits.length} holdings by revenue growth YoY (TTM). These are the highest-conviction momentum names in the universe.`,
        table: {
          columns: ['Ticker', 'Name', 'Sector', 'Rev (TTM)', 'YoY'],
          rows: hits.map((c) => [c.ticker, c.name, c.sector ?? '—', fmtMoney(c.revenue_ttm), fmtPct(c.revenue_growth_yoy)]),
        },
        companyIds: hits.map((c) => c.cik),
      };
    },
  },
  {
    name: 'weak_macro',
    pattern: /(weak.+macro|stress|inversion|yield\s+curve|rate\s+sensitiv|financial.+(rate|yield|macro))/i,
    handler: (_, cos) => {
      const hits = cos
        .filter((c) => c.sector === 'Financials')
        .sort((a, b) => b.risk_score - a.risk_score)
        .slice(0, 25);
      return {
        intent: 'weak_macro',
        source: 'rules',
        summary: `${hits.length} Financials-sector issuers ranked by composite risk score. With the curve inverted and credit spreads widening, the highest-scored names face the greatest NIM and credit-cost pressure.`,
        table: {
          columns: ['Ticker', 'Name', 'Mkt Cap', 'Risk Score', 'Bucket'],
          rows: hits.map((c) => [c.ticker, c.name, fmtMoney(c.market_cap), c.risk_score.toFixed(1), c.risk_bucket]),
        },
        companyIds: hits.map((c) => c.cik),
      };
    },
  },
  {
    name: 'eight_k_events',
    pattern: /(8-?k|material\s+event|event-driven|filing.+(activity|frequency)|most.+filing)/i,
    handler: (_, cos) => {
      const hits = [...cos].sort((a, b) => b.filings_count_ttm - a.filings_count_ttm).slice(0, 25);
      return {
        intent: 'eight_k_events',
        source: 'rules',
        summary: `Top ${hits.length} companies by EDGAR filing activity (TTM). A heavy 8-K cadence often signals corporate actions, leadership change, or material developments worth investigating.`,
        table: {
          columns: ['Ticker', 'Name', 'Sector', 'Filings (TTM)', 'Last Filing'],
          rows: hits.map((c) => [c.ticker, c.name, c.sector ?? '—', c.filings_count_ttm, c.last_filing_date ?? '—']),
        },
        companyIds: hits.map((c) => c.cik),
      };
    },
  },
  {
    name: 'risk_score',
    pattern: /(highest.+risk|risky|risk\s+score|risk\s+bucket|elevated.+risk|high.+risk)/i,
    handler: (_, cos) => {
      const hits = [...cos].sort((a, b) => b.risk_score - a.risk_score).slice(0, 25);
      return {
        intent: 'risk_score',
        source: 'rules',
        summary: `Top ${hits.length} holdings by composite risk score. The score blends complaint velocity, revenue trend, 8-K cadence, and sector macro overlay.`,
        table: {
          columns: ['Ticker', 'Name', 'Sector', 'Risk Score', 'Bucket'],
          rows: hits.map((c) => [c.ticker, c.name, c.sector ?? '—', c.risk_score.toFixed(1), c.risk_bucket]),
        },
        companyIds: hits.map((c) => c.cik),
      };
    },
  },
];

function detectSector(q: string): Sector | null {
  const lower = q.toLowerCase();
  for (const s of SECTORS) {
    if (lower.includes(s.toLowerCase())) return s;
  }
  if (/\b(bank|financial|insurer)\b/.test(lower)) return 'Financials';
  if (/\b(tech|software|semi)\b/.test(lower)) return 'Technology';
  if (/\b(pharma|biotech|medical)\b/.test(lower)) return 'Healthcare';
  if (/\boil|gas\b/.test(lower)) return 'Energy';
  return null;
}

export function answer(question: string, companies: Company[]): AgentResponse {
  const q = question.trim();
  if (!q) return { intent: 'empty', source: 'rules', summary: 'Ask me something — try one of the suggestions.' };

  for (const intent of intents) {
    const m = q.match(intent.pattern);
    if (m) return intent.handler(m, companies);
  }

  // Sector filter fallback before substring match
  const sector = detectSector(q);
  if (sector) {
    const hits = companies.filter((c) => c.sector === sector).sort((a, b) => (b.market_cap ?? 0) - (a.market_cap ?? 0)).slice(0, 25);
    return {
      intent: 'sector_filter',
      source: 'rules',
      summary: `${hits.length} ${sector} holdings, sorted by market cap.`,
      table: {
        columns: ['Ticker', 'Name', 'Mkt Cap', 'Rev YoY', 'Risk'],
        rows: hits.map((c) => [c.ticker, c.name, fmtMoney(c.market_cap), fmtPct(c.revenue_growth_yoy), c.risk_bucket]),
      },
      companyIds: hits.map((c) => c.cik),
    };
  }

  const lower = q.toLowerCase();
  const hits = companies.filter(
    (c) =>
      c.name.toLowerCase().includes(lower) ||
      c.ticker.toLowerCase().includes(lower) ||
      c.cik.toLowerCase().includes(lower) ||
      (c.industry ?? '').toLowerCase().includes(lower),
  );
  if (hits.length > 0) {
    return {
      intent: 'substring_match',
      source: 'rules',
      summary: `${hits.length} companies match "${q}".`,
      table: {
        columns: ['Ticker', 'Name', 'Sector', 'Mkt Cap', 'Risk'],
        rows: hits.slice(0, 25).map((c) => [c.ticker, c.name, c.sector ?? '—', fmtMoney(c.market_cap), c.risk_bucket]),
      },
      companyIds: hits.slice(0, 25).map((c) => c.cik),
    };
  }

  return {
    intent: 'no_match',
    source: 'rules',
    summary: `No local rule matched "${q}". Try one of the suggestions, or enable Claude mode for richer reasoning over the snapshot.`,
  };
}

// ---------------------------------------------------------------------------
// Claude opt-in path

function summarizeForClaude(companies: Company[]) {
  const total = companies.length;
  const totalMktCap = companies.reduce((s, c) => s + (c.market_cap ?? 0), 0);
  const totalRev = companies.reduce((s, c) => s + (c.revenue_ttm ?? 0), 0);
  const totalComplaints = companies.reduce((s, c) => s + c.complaint_velocity, 0);
  const totalFilings = companies.reduce((s, c) => s + c.filings_count_ttm, 0);

  const bySector: Record<string, { count: number; mkt_cap: number; avg_risk: number }> = {};
  for (const c of companies) {
    const k = c.sector ?? 'Unknown';
    const row = bySector[k] ?? { count: 0, mkt_cap: 0, avg_risk: 0 };
    row.count += 1;
    row.mkt_cap += c.market_cap ?? 0;
    row.avg_risk += c.risk_score;
    bySector[k] = row;
  }
  for (const k of Object.keys(bySector)) {
    bySector[k].avg_risk = Math.round((bySector[k].avg_risk / bySector[k].count) * 10) / 10;
  }

  const riskHist: Record<string, number> = { low: 0, moderate: 0, elevated: 0, high: 0 };
  for (const c of companies) riskHist[c.risk_bucket] = (riskHist[c.risk_bucket] ?? 0) + 1;

  return {
    total_companies: total,
    total_market_cap_usd: totalMktCap,
    total_revenue_ttm_usd: totalRev,
    total_complaints_velocity: totalComplaints,
    total_filings_ttm: totalFilings,
    by_sector: bySector,
    risk_bucket_histogram: riskHist,
  };
}

const SYSTEM = `You are a senior research analyst at Altavest Capital, a buy-side institutional asset manager.
You reason over a snapshot of the firm's portfolio universe sourced from SEC EDGAR, FRED, and CFPB,
materialized in an Apache Iceberg gold layer and exported to a gold layer.

Voice: institutional, measured, no hype. Reference specific data points from the JSON summary.
Format dollars as $12.3B / $4.5M and percentages with one decimal (e.g. +3.2%).
Never invent tickers, names, or numbers. If a question can't be answered from the snapshot, say so.
Keep responses concise — bullet points or a short paragraph, not essays.`;

export async function askClaude(
  question: string,
  companies: Company[],
  recentSummary?: string,
): Promise<AgentResponse> {
  const key = getApiKey();
  if (!key) {
    return { intent: 'claude_no_key', source: 'claude', summary: 'Add your Anthropic API key in Settings to enable Claude mode.' };
  }
  const summary = summarizeForClaude(companies);
  const userContent = [
    `Snapshot summary (JSON):\n\`\`\`json\n${JSON.stringify(summary)}\n\`\`\``,
    recentSummary ? `Prior context: ${recentSummary}` : '',
    `Question: ${question}`,
  ].filter(Boolean).join('\n\n');

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': key,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 800,
      system: SYSTEM,
      messages: [{ role: 'user', content: userContent }],
    }),
  });
  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`Claude ${res.status}: ${detail.slice(0, 200)}`);
  }
  const payload = await res.json();
  const text: string = payload?.content?.find((c: any) => c.type === 'text')?.text ?? '(no response)';
  return { intent: 'claude', source: 'claude', summary: text };
}
