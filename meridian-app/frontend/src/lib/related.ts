// Related-companies similarity engine for Altavest Capital research universe.
//
// Computes a top-K nearest-neighbor list for each company using weighted
// feature overlap over GICS sector, sub-industry, market-cap band,
// geographic region, risk-signal tags, and factor exposure.
// Runs once at module init (build-time equivalent in a static SPA) and
// caches results so every subsequent call is O(1).

import type { Company } from '../types';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type RelatedNeighbor = {
  cik: string;
  company: Company;
  score: number;    // 0..1 normalized
  why: string;      // human-readable reason shown in the panel
  sharedDimensions: string[];
};

// ---------------------------------------------------------------------------
// Weights  (sector + sub-industry highest, then cap band, then factors)
// ---------------------------------------------------------------------------
const W_SECTOR       = 1.8;  // same GICS sector
const W_INDUSTRY     = 2.4;  // same sub-industry (strongest signal)
const W_CAP_BAND     = 1.2;  // same market-cap tier
const W_REGION       = 0.6;  // same geographic region
const W_RISK_BUCKET  = 0.5;  // same risk classification
const W_FACTOR       = 0.8;  // shared factor exposure tags

const W_MAX = W_SECTOR + W_INDUSTRY + W_CAP_BAND + W_REGION + W_RISK_BUCKET + W_FACTOR;

const K = 8;  // neighbors per company

// ---------------------------------------------------------------------------
// Feature derivation from the Company record
// ---------------------------------------------------------------------------

/** Four-tier market-cap band following standard institutional conventions. */
function capBand(mc: number | null): string {
  if (!mc) return 'unknown';
  if (mc >= 200_000_000_000) return 'mega';   // $200B+
  if (mc >= 10_000_000_000)  return 'large';  // $10B – $200B
  if (mc >= 2_000_000_000)   return 'mid';    // $2B – $10B
  return 'small';                             // < $2B
}

/** Broad geographic region derived from HQ state. */
function geoRegion(state: string | null): string {
  if (!state) return 'unknown';
  const s = state.toUpperCase();
  if (['NY', 'NJ', 'CT', 'MA', 'PA', 'RI', 'NH', 'VT', 'ME', 'DE', 'MD', 'DC'].includes(s)) return 'northeast';
  if (['FL', 'GA', 'NC', 'SC', 'VA', 'AL', 'MS', 'TN', 'KY', 'WV', 'AR', 'LA'].includes(s)) return 'southeast';
  if (['IL', 'OH', 'MI', 'IN', 'WI', 'MN', 'MO', 'IA', 'KS', 'NE', 'SD', 'ND'].includes(s)) return 'midwest';
  if (['TX', 'OK', 'NM', 'CO', 'AZ'].includes(s)) return 'south_central';
  if (['CA', 'WA', 'OR', 'NV', 'UT', 'ID', 'MT', 'WY', 'AK', 'HI'].includes(s)) return 'west';
  return 'other';
}

/**
 * Factor exposure tags inferred from sector + fundamentals.
 * In production these would come from a quant factor model (Barra, Axioma, etc.).
 * Here we assign heuristic labels so the similarity signal has substance.
 */
function factorTags(c: Company): string[] {
  const tags: string[] = [];
  const growth = c.revenue_growth_yoy ?? 0;
  const margin = c.net_margin ?? 0;
  const risk   = c.risk_score ?? 50;

  // Value: low P/E proxy — large cap + thin margin in cyclical sectors
  const valueSectors = ['Financials', 'Energy', 'Utilities', 'Materials', 'Industrials', 'Real Estate'];
  if (valueSectors.includes(c.sector ?? '') && growth < 0.08) tags.push('value');

  // Momentum: strong recent revenue growth
  if (growth > 0.12) tags.push('momentum');

  // Quality: healthy margin, lower risk
  if (margin > 0.10 && risk < 45) tags.push('quality');

  // Defensive: staples / utilities / healthcare
  const defensiveSectors = ['Consumer Staples', 'Utilities', 'Healthcare'];
  if (defensiveSectors.includes(c.sector ?? '')) tags.push('defensive');

  // Growth: tech + comm services with positive top-line expansion
  if (['Technology', 'Communication Services'].includes(c.sector ?? '') && growth > 0.05) tags.push('growth');

  return tags;
}

// ---------------------------------------------------------------------------
// Pairwise scoring
// ---------------------------------------------------------------------------

interface Features {
  cik: string;
  company: Company;
  sector: string;
  industry: string;
  capBand: string;
  region: string;
  riskBucket: string;
  factors: string[];
}

function featurize(c: Company): Features {
  return {
    cik: c.cik,
    company: c,
    sector:     c.sector ?? 'unknown',
    industry:   c.industry ?? 'unknown',
    capBand:    capBand(c.market_cap),
    region:     geoRegion(c.hq_state),
    riskBucket: c.risk_bucket ?? 'unknown',
    factors:    factorTags(c),
  };
}

function jaccardArr(a: string[], b: string[]): { score: number; shared: string[] } {
  if (a.length === 0 || b.length === 0) return { score: 0, shared: [] };
  const setA = new Set(a);
  const shared = b.filter((x) => setA.has(x));
  const union  = new Set([...a, ...b]).size;
  return { score: shared.length / union, shared };
}

function pairScore(a: Features, b: Features): {
  raw: number;
  dims: string[];
} {
  const dims: string[] = [];
  let raw = 0;

  // Sector
  if (a.sector !== 'unknown' && a.sector === b.sector) {
    raw += W_SECTOR;
    dims.push(`${a.sector} sector`);
  }

  // Sub-industry
  if (a.industry !== 'unknown' && a.industry === b.industry) {
    raw += W_INDUSTRY;
    dims.push(a.industry);
  }

  // Cap band
  if (a.capBand !== 'unknown' && a.capBand === b.capBand) {
    raw += W_CAP_BAND;
    dims.push(`${a.capBand}-cap`);
  }

  // Region
  if (a.region !== 'unknown' && a.region === b.region) {
    raw += W_REGION;
    dims.push(a.region.replace('_', ' ') + ' HQ');
  }

  // Risk bucket
  if (a.riskBucket !== 'unknown' && a.riskBucket === b.riskBucket) {
    raw += W_RISK_BUCKET;
    dims.push(`${a.riskBucket} risk`);
  }

  // Factor exposure (Jaccard over tag sets)
  const fc = jaccardArr(a.factors, b.factors);
  if (fc.score > 0) {
    raw += W_FACTOR * fc.score;
    for (const f of fc.shared) dims.push(`${f} factor`);
  }

  return { raw, dims };
}

// ---------------------------------------------------------------------------
// "Why related" label
// ---------------------------------------------------------------------------

function whyLabel(a: Features, b: Features, dims: string[]): string {
  if (a.industry !== 'unknown' && a.industry === b.industry) {
    return `Same sub-industry: ${a.industry}`;
  }
  if (a.sector !== 'unknown' && a.sector === b.sector) {
    if (a.capBand !== 'unknown' && a.capBand === b.capBand) {
      return `${a.sector} — ${a.capBand}-cap`;
    }
    return `${a.sector} sector`;
  }
  if (dims.length > 0) return dims.slice(0, 2).join(', ');
  return 'Similar profile';
}

// ---------------------------------------------------------------------------
// Build top-K cache
// ---------------------------------------------------------------------------

let _cache: Map<string, RelatedNeighbor[]> | null = null;

function build(companies: Company[]): Map<string, RelatedNeighbor[]> {
  const features = companies.map(featurize);
  const result   = new Map<string, RelatedNeighbor[]>();

  for (let i = 0; i < features.length; i++) {
    const a = features[i];
    const scored: { neighbor: RelatedNeighbor; raw: number }[] = [];

    for (let j = 0; j < features.length; j++) {
      if (i === j) continue;
      const b = features[j];
      const { raw, dims } = pairScore(a, b);
      if (raw <= 0) continue;
      const score = Math.min(1, raw / W_MAX);
      scored.push({
        raw,
        neighbor: {
          cik:    b.cik,
          company: b.company,
          score,
          why:   whyLabel(a, b, dims),
          sharedDimensions: dims,
        },
      });
    }

    scored.sort((x, y) => y.raw - x.raw);
    result.set(a.cik, scored.slice(0, K).map((s) => s.neighbor));
  }

  return result;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

let _companies: Company[] = [];

/** Seed the engine with the company catalog. Call once after loading companies.json. */
export function seedCompanies(companies: Company[]): void {
  _companies = companies;
  _cache = null;  // invalidate if re-seeded
}

function getCache(): Map<string, RelatedNeighbor[]> {
  if (!_cache) _cache = build(_companies);
  return _cache;
}

export function relatedFor(cik: string): RelatedNeighbor[] {
  return getCache().get(cik) ?? [];
}

/**
 * Returns all nodes and edges for the full company network graph.
 * Edges are the union of all top-K pairs (undirected, deduplicated).
 */
export type GraphNode = {
  id: string;        // cik
  company: Company;
  primarySector: string;
};

export type GraphEdge = {
  source: string;    // cik
  target: string;    // cik
  score: number;
};

export function buildGraph(): { nodes: GraphNode[]; edges: GraphEdge[] } {
  const cache  = getCache();
  const nodes: GraphNode[] = _companies.map((c) => ({
    id:            c.cik,
    company:       c,
    primarySector: c.sector ?? 'unknown',
  }));

  const seen  = new Set<string>();
  const edges: GraphEdge[] = [];

  for (const [cik, neighbors] of cache.entries()) {
    for (const nb of neighbors) {
      const key = [cik, nb.cik].sort().join('|');
      if (seen.has(key)) continue;
      seen.add(key);
      edges.push({ source: cik, target: nb.cik, score: nb.score });
    }
  }

  return { nodes, edges };
}
