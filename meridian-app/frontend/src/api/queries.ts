// ============================================================
// API helpers — read static JSON snapshots built by
// scripts/build_snapshot.py from Athena/Iceberg gold layer.
// ============================================================

import type {
  SummaryStats,
  CompaniesResponse,
  Company,
  CompanyDetail,
  Filing,
  FilingsResponse,
  MacroResponse,
  MacroSeriesDetail,
  MacroObservation,
  ComplaintsResponse,
  Complaint,
  IcebergTable,
  PipelineLayerStats,
} from '../types';

export type DataSource = 'live' | 'demo';

let lastSource: DataSource = 'demo';
let snapshotGeneratedAt: string | null = null;
const listeners = new Set<(s: DataSource) => void>();

function setSource(s: DataSource) {
  if (s === lastSource) return;
  lastSource = s;
  listeners.forEach((l) => l(s));
}

export function subscribeSource(fn: (s: DataSource) => void): () => void {
  listeners.add(fn);
  fn(lastSource);
  return () => listeners.delete(fn);
}

export function getSnapshotTime(): string | null {
  return snapshotGeneratedAt;
}

const BASE = import.meta.env.BASE_URL.replace(/\/$/, '');

async function fetchJson<T>(path: string): Promise<T> {
  const url = `${BASE}${path}`;
  const res = await fetch(url, { cache: 'no-cache' });
  if (!res.ok) throw new Error(`Failed to fetch ${url}: ${res.status}`);
  return (await res.json()) as T;
}

let summaryCache: SummaryStats | null = null;
let companiesCache: CompaniesResponse | null = null;
let macroCache: MacroResponse | null = null;
let complaintsCache: ComplaintsResponse | null = null;
let filingsCache: Filing[] | null = null;
let icebergCache: IcebergTable[] | null = null;
let pipelineCache: PipelineLayerStats[] | null = null;

async function loadSummary(): Promise<SummaryStats> {
  if (summaryCache) return summaryCache;
  const data = await fetchJson<SummaryStats>('/data/summary.json');
  if (data.generated_at) snapshotGeneratedAt = data.generated_at;
  if (data.source) setSource(data.source);
  summaryCache = data;
  return data;
}

async function loadCompanies(): Promise<CompaniesResponse> {
  if (companiesCache) return companiesCache;
  const raw = await fetchJson<any>('/data/companies.json');
  let results: Company[];
  if (Array.isArray(raw.rows) && Array.isArray(raw.columns)) {
    const cols: string[] = raw.columns;
    results = raw.rows.map((row: any[]) => {
      const obj: Record<string, any> = {};
      for (let i = 0; i < cols.length; i++) obj[cols[i]] = row[i];
      return obj as Company;
    });
  } else {
    results = raw.results ?? [];
  }
  companiesCache = { count: raw.count ?? results.length, results };
  return companiesCache;
}

async function loadFilings(): Promise<Filing[]> {
  if (filingsCache) return filingsCache;
  const raw = await fetchJson<any>('/data/filings.json');
  let results: Filing[];
  if (Array.isArray(raw.rows) && Array.isArray(raw.columns)) {
    const cols: string[] = raw.columns;
    results = raw.rows.map((row: any[]) => {
      const obj: Record<string, any> = {};
      for (let i = 0; i < cols.length; i++) obj[cols[i]] = row[i];
      return obj as Filing;
    });
  } else {
    results = raw.filings ?? raw.results ?? [];
  }
  filingsCache = results;
  return results;
}

async function loadMacro(): Promise<MacroResponse> {
  if (macroCache) return macroCache;
  macroCache = await fetchJson<MacroResponse>('/data/macro.json');
  return macroCache;
}

async function loadComplaints(): Promise<ComplaintsResponse> {
  if (complaintsCache) return complaintsCache;
  const raw = await fetchJson<any>('/data/complaints.json');
  let complaints: Complaint[];
  if (Array.isArray(raw.rows) && Array.isArray(raw.columns)) {
    const cols: string[] = raw.columns;
    complaints = raw.rows.map((row: any[]) => {
      const obj: Record<string, any> = {};
      for (let i = 0; i < cols.length; i++) obj[cols[i]] = row[i];
      return obj as Complaint;
    });
  } else {
    complaints = raw.complaints ?? [];
  }
  complaintsCache = { complaints, summary: raw.summary };
  return complaintsCache;
}

async function loadIceberg(): Promise<IcebergTable[]> {
  if (icebergCache) return icebergCache;
  const data = await fetchJson<{ tables: IcebergTable[] }>('/data/iceberg.json');
  icebergCache = data.tables;
  return icebergCache;
}

async function loadPipeline(): Promise<PipelineLayerStats[]> {
  if (pipelineCache) return pipelineCache;
  const data = await fetchJson<{ layers: PipelineLayerStats[] }>('/data/pipeline.json');
  pipelineCache = data.layers;
  return pipelineCache;
}

const companyDetailCache = new Map<string, Promise<CompanyDetail>>();

async function loadCompanyDetail(cik: string): Promise<CompanyDetail> {
  if (companyDetailCache.has(cik)) return companyDetailCache.get(cik)!;
  const p = (async () => {
    const safe = cik.replace(/\//g, '_');
    try {
      const bundle = await fetchJson<{ company: CompanyDetail }>(`/data/companies/${encodeURIComponent(safe)}.json`);
      return bundle.company;
    } catch {
      return synthesizeCompanyDetail(cik);
    }
  })();
  companyDetailCache.set(cik, p);
  return p;
}

async function synthesizeCompanyDetail(cik: string): Promise<CompanyDetail> {
  const all = await loadCompanies();
  const c = all.results.find((r) => r.cik === cik);
  if (!c) throw new Error(`Company ${cik} not in snapshot.`);
  const allFilings = await loadFilings();
  const allComplaints = await loadComplaints();
  const filings = allFilings.filter((f) => f.cik === cik).slice(0, 25);
  const complaints = allComplaints.complaints.filter((c2) => c2.cik === cik).slice(0, 25);
  return {
    ...c,
    filings,
    complaints,
    related_macro_series: [],
    risk_factors: [],
    ai_summary: null,
  };
}

const macroDetailCache = new Map<string, Promise<MacroSeriesDetail>>();

async function loadMacroSeriesDetail(seriesId: string): Promise<MacroSeriesDetail> {
  if (macroDetailCache.has(seriesId)) return macroDetailCache.get(seriesId)!;
  const p = (async () => {
    try {
      return await fetchJson<MacroSeriesDetail>(`/data/macro/${encodeURIComponent(seriesId)}.json`);
    } catch {
      const all = await loadMacro();
      const series = all.series.find((s) => s.series_id === seriesId);
      if (!series) throw new Error(`Series ${seriesId} not in snapshot.`);
      return { series, observations: [] as MacroObservation[] };
    }
  })();
  macroDetailCache.set(seriesId, p);
  return p;
}

export const api = {
  getSummary: () => loadSummary(),

  searchCompanies: async (params: {
    q?: string;
    sector?: string;
    state?: string;
    risk?: string;
    limit?: number;
  }) => {
    const all = await loadCompanies();
    let results = all.results;
    if (params.q) {
      const q = params.q.toLowerCase();
      results = results.filter(
        (c) =>
          c.name.toLowerCase().includes(q) ||
          c.ticker.toLowerCase().includes(q) ||
          c.cik.toLowerCase().includes(q) ||
          (c.industry ?? '').toLowerCase().includes(q),
      );
    }
    if (params.sector) results = results.filter((c) => c.sector === params.sector);
    if (params.state) {
      const s = params.state.toUpperCase();
      results = results.filter((c) => (c.hq_state ?? '').toUpperCase() === s);
    }
    if (params.risk) results = results.filter((c) => c.risk_bucket === params.risk);
    if (params.limit) results = results.slice(0, params.limit);
    return { count: results.length, results };
  },

  getCompany: (cik: string) => loadCompanyDetail(cik),
  getFilings: async (cik?: string): Promise<FilingsResponse> => {
    const all = await loadFilings();
    return { cik, filings: cik ? all.filter((f) => f.cik === cik) : all };
  },
  getMacro: () => loadMacro(),
  getMacroSeries: (seriesId: string) => loadMacroSeriesDetail(seriesId),
  getComplaints: () => loadComplaints(),
  getIcebergTables: () => loadIceberg(),
  getPipelineStats: () => loadPipeline(),
};

export function formatCurrency(n: number | null | undefined): string {
  if (n === null || n === undefined || Number.isNaN(n)) return '—';
  return new Intl.NumberFormat('en-US', {
    style: 'currency', currency: 'USD', maximumFractionDigits: 0,
  }).format(n);
}

export function formatCurrencyShort(n: number | null | undefined): string {
  if (n === null || n === undefined || Number.isNaN(n)) return '—';
  const abs = Math.abs(n);
  if (abs >= 1_000_000_000_000) return `$${(n / 1_000_000_000_000).toFixed(2)}T`;
  if (abs >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(abs >= 100_000_000_000 ? 0 : 1)}B`;
  if (abs >= 1_000_000) return `$${(n / 1_000_000).toFixed(abs >= 100_000_000 ? 0 : 1)}M`;
  if (abs >= 1_000) return `$${Math.round(n / 1_000)}k`;
  return `$${Math.round(n)}`;
}

export function formatBytes(n: number | null | undefined): string {
  if (n === null || n === undefined || Number.isNaN(n)) return '—';
  const abs = Math.abs(n);
  if (abs >= 1024 ** 4) return `${(n / 1024 ** 4).toFixed(2)} TB`;
  if (abs >= 1024 ** 3) return `${(n / 1024 ** 3).toFixed(2)} GB`;
  if (abs >= 1024 ** 2) return `${(n / 1024 ** 2).toFixed(1)} MB`;
  if (abs >= 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${n} B`;
}

export function formatNumber(n: number | null | undefined): string {
  if (n === null || n === undefined || Number.isNaN(n)) return '—';
  return new Intl.NumberFormat('en-US').format(n);
}

export function formatPercent(n: number | null | undefined, digits = 1): string {
  if (n === null || n === undefined || Number.isNaN(n)) return '—';
  return `${n >= 0 ? '+' : ''}${n.toFixed(digits)}%`;
}

export function formatBps(n: number | null | undefined): string {
  if (n === null || n === undefined || Number.isNaN(n)) return '—';
  const bps = Math.round(n * 100);
  return `${bps >= 0 ? '+' : ''}${bps} bps`;
}
