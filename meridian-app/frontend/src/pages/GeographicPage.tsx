// Geographic Intelligence — branch-network + regional risk surface.
//
// Story: Meridian Capital is a mid-size wealth + retail bank. CEO/CFO levers
// on this page are branch ROA, regional NIM, lending concentration / CRE
// exposure, deposit beta and advisor productivity. Data is synthetic but
// deterministic across renders — every number derives from a small handful
// of branch facts so the demo never drifts.

import { useEffect, useMemo, useState } from 'react';
import { CircleMarker, MapContainer, TileLayer, Tooltip, useMap } from 'react-leaflet';
import L from 'leaflet';
import { formatCurrencyShort, formatNumber, formatPercent } from '../api/queries';

L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

// ─── Synthetic branch network ───────────────────────────────────────────────
// 12 branches across the eastern half of the US — deterministic figures.
// `deposits` and `loans` are in USD; `nim_bps` is regional net-interest-margin
// in basis points; `cre_pct` is commercial-real-estate share of the loan
// book at that branch (policy cap = 18%).

interface Branch {
  id: string;
  name: string;
  msa: string;
  state: string;
  lat: number;
  lng: number;
  deposits: number;       // total deposit base
  loans: number;          // total loan book
  cre_pct: number;        // CRE share of loan book (0..1)
  nim_bps: number;        // regional NIM, basis points
  advisors: number;       // wealth advisors on-site
  wealth_aum: number;     // wealth management AUM at this branch
  roa_bps: number;        // branch return on assets, basis points
  deposit_beta: number;   // 0..1 — share of rate moves passed to depositors
  cost_to_serve: number;  // $ per account per year
  households: number;     // retail + wealth households
  est_yr: number;
}

const BRANCHES: Branch[] = [
  { id: 'BR-NYC-MID',  name: 'Park Avenue Flagship',     msa: 'New York–Newark, NY–NJ', state: 'NY', lat: 40.7589, lng: -73.9740, deposits: 4_820_000_000, loans: 3_140_000_000, cre_pct: 0.27, nim_bps: 286, advisors: 38, wealth_aum: 6_900_000_000, roa_bps: 142, deposit_beta: 0.62, cost_to_serve: 412, households: 11_400, est_yr: 1923 },
  { id: 'BR-BOS-FIN',  name: 'Back Bay Wealth Center',   msa: 'Boston–Cambridge, MA',    state: 'MA', lat: 42.3505, lng: -71.0743, deposits: 2_310_000_000, loans: 1_480_000_000, cre_pct: 0.19, nim_bps: 301, advisors: 22, wealth_aum: 3_750_000_000, roa_bps: 156, deposit_beta: 0.58, cost_to_serve: 388, households: 6_900, est_yr: 1948 },
  { id: 'BR-PHL-CC',   name: 'Center City Branch',       msa: 'Philadelphia, PA–NJ–DE',  state: 'PA', lat: 39.9526, lng: -75.1652, deposits: 1_180_000_000, loans:   820_000_000, cre_pct: 0.16, nim_bps: 274, advisors: 12, wealth_aum: 1_240_000_000, roa_bps: 128, deposit_beta: 0.51, cost_to_serve: 364, households: 4_800, est_yr: 1962 },
  { id: 'BR-DC-DUP',   name: 'Dupont Circle Branch',     msa: 'Washington, DC–MD–VA',    state: 'DC', lat: 38.9097, lng: -77.0433, deposits: 1_640_000_000, loans:   980_000_000, cre_pct: 0.21, nim_bps: 268, advisors: 14, wealth_aum: 1_980_000_000, roa_bps: 119, deposit_beta: 0.66, cost_to_serve: 401, households: 5_200, est_yr: 1971 },
  { id: 'BR-CHI-LOOP', name: 'Loop Financial Center',    msa: 'Chicago–Naperville, IL',  state: 'IL', lat: 41.8847, lng: -87.6273, deposits: 2_960_000_000, loans: 2_140_000_000, cre_pct: 0.31, nim_bps: 259, advisors: 26, wealth_aum: 3_200_000_000, roa_bps: 104, deposit_beta: 0.69, cost_to_serve: 426, households: 8_100, est_yr: 1955 },
  { id: 'BR-ATL-BUC',  name: 'Buckhead Branch',          msa: 'Atlanta–Sandy Springs, GA', state: 'GA', lat: 33.8484, lng: -84.3781, deposits: 1_420_000_000, loans: 1_180_000_000, cre_pct: 0.23, nim_bps: 312, advisors: 16, wealth_aum: 1_640_000_000, roa_bps: 148, deposit_beta: 0.49, cost_to_serve: 342, households: 5_600, est_yr: 1989 },
  { id: 'BR-MIA-BRI',  name: 'Brickell Wealth Office',   msa: 'Miami–Fort Lauderdale, FL', state: 'FL', lat: 25.7617, lng: -80.1918, deposits: 1_980_000_000, loans: 1_790_000_000, cre_pct: 0.34, nim_bps: 295, advisors: 19, wealth_aum: 2_410_000_000, roa_bps: 137, deposit_beta: 0.71, cost_to_serve: 397, households: 6_200, est_yr: 1991 },
  { id: 'BR-CLT-UPT',  name: 'Uptown Charlotte Branch',  msa: 'Charlotte, NC–SC',        state: 'NC', lat: 35.2271, lng: -80.8431, deposits:   980_000_000, loans:   810_000_000, cre_pct: 0.18, nim_bps: 304, advisors: 11, wealth_aum:   910_000_000, roa_bps: 144, deposit_beta: 0.53, cost_to_serve: 358, households: 4_100, est_yr: 1998 },
  { id: 'BR-PIT-DOW',  name: 'Downtown Pittsburgh',      msa: 'Pittsburgh, PA',          state: 'PA', lat: 40.4406, lng: -79.9959, deposits:   720_000_000, loans:   540_000_000, cre_pct: 0.14, nim_bps: 278, advisors:  8, wealth_aum:   620_000_000, roa_bps: 124, deposit_beta: 0.46, cost_to_serve: 339, households: 3_400, est_yr: 1908 },
  { id: 'BR-MIN-NIC',  name: 'Nicollet Mall Branch',     msa: 'Minneapolis–St. Paul, MN', state: 'MN', lat: 44.9778, lng: -93.2650, deposits:   860_000_000, loans:   660_000_000, cre_pct: 0.17, nim_bps: 289, advisors: 10, wealth_aum:   780_000_000, roa_bps: 138, deposit_beta: 0.48, cost_to_serve: 351, households: 3_800, est_yr: 1976 },
  { id: 'BR-NSH-MUS',  name: 'Music Row Branch',         msa: 'Nashville–Davidson, TN',  state: 'TN', lat: 36.1627, lng: -86.7816, deposits:   640_000_000, loans:   590_000_000, cre_pct: 0.26, nim_bps: 318, advisors:  9, wealth_aum:   560_000_000, roa_bps: 151, deposit_beta: 0.44, cost_to_serve: 327, households: 3_100, est_yr: 2004 },
  { id: 'BR-RAL-NHL',  name: 'North Hills Branch',       msa: 'Raleigh–Cary, NC',        state: 'NC', lat: 35.8474, lng: -78.6371, deposits:   540_000_000, loans:   470_000_000, cre_pct: 0.20, nim_bps: 308, advisors:  7, wealth_aum:   440_000_000, roa_bps: 146, deposit_beta: 0.45, cost_to_serve: 331, households: 2_700, est_yr: 2009 },
];

// Top wealth clients per branch — synthetic anonymized handles, scaled to AUM.
function topClientsFor(b: Branch): { handle: string; aum: number; advisor: string }[] {
  const handles = ['Hawthorne Family Office', 'Aldridge Trust', 'Brennan Holdings', 'Wexford LP', 'Calloway Foundation'];
  const advisors = ['M. Okafor', 'J. Pereira', 'A. Sokolova', 'D. Nakamura', 'R. Patel'];
  const shares = [0.18, 0.12, 0.09, 0.07, 0.05];
  return handles.map((h, i) => ({
    handle: h,
    aum: Math.round(b.wealth_aum * shares[i]),
    advisor: advisors[(i + b.id.charCodeAt(3)) % advisors.length],
  }));
}

const CRE_POLICY_CAP = 0.18;       // CRE share of book — concentration policy
const DEPOSIT_BETA_WARN = 0.65;    // above this, flight-risk is elevated
const ROA_PEER_MEDIAN = 132;       // peer-bank median branch ROA, bps
const ROA_PEER_TOP = 158;          // peer-bank top-quartile branch ROA, bps

// ─── Page ───────────────────────────────────────────────────────────────────

type MapMode = 'deposits' | 'loans' | 'roa' | 'cre';
const MODE_META: Record<MapMode, { short: string; label: string; lever: string }> = {
  deposits: { short: 'Deposits',  label: 'Deposit base by branch',         lever: 'Funding cost · regional NIM' },
  loans:    { short: 'Loan Book', label: 'Total loans outstanding',        lever: 'Credit yield · charge-off exposure' },
  roa:      { short: 'ROA',       label: 'Branch return on assets (bps)',  lever: 'Operating leverage · branch P&L' },
  cre:      { short: 'CRE %',     label: 'CRE share of loan book',         lever: 'Concentration risk vs. policy cap' },
};

export default function GeographicPage() {
  const [mode, setMode] = useState<MapMode>('deposits');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setLoaded(true), 50);
    return () => clearTimeout(t);
  }, []);

  const selected = selectedId ? BRANCHES.find((b) => b.id === selectedId) ?? null : null;

  // ─── Aggregates ──────────────────────────────────────────────────────────
  const totals = useMemo(() => {
    const deposits = BRANCHES.reduce((s, b) => s + b.deposits, 0);
    const loans = BRANCHES.reduce((s, b) => s + b.loans, 0);
    const aum = BRANCHES.reduce((s, b) => s + b.wealth_aum, 0);
    const households = BRANCHES.reduce((s, b) => s + b.households, 0);
    const advisors = BRANCHES.reduce((s, b) => s + b.advisors, 0);
    // Asset-weighted regional ROA in bps
    const roa = BRANCHES.reduce((s, b) => s + b.roa_bps * (b.deposits + b.loans), 0)
              / BRANCHES.reduce((s, b) => s + (b.deposits + b.loans), 0);
    // Dollar value at risk from CRE concentration above policy cap.
    const creBreach = BRANCHES.reduce((s, b) => {
      const breachShare = Math.max(0, b.cre_pct - CRE_POLICY_CAP);
      return s + breachShare * b.loans;
    }, 0);
    // Approx deposit flight risk dollars: branches above beta warning,
    // weighted by share of deposits above warning threshold.
    const flightRisk = BRANCHES.reduce((s, b) => {
      if (b.deposit_beta <= DEPOSIT_BETA_WARN) return s;
      return s + b.deposits * (b.deposit_beta - DEPOSIT_BETA_WARN);
    }, 0);
    return { deposits, loans, aum, households, advisors, roa, creBreach, flightRisk };
  }, []);

  // ─── Color / size ramps ──────────────────────────────────────────────────
  const valueFor = (b: Branch): number =>
    mode === 'deposits' ? b.deposits :
    mode === 'loans'    ? b.loans :
    mode === 'roa'      ? b.roa_bps :
    b.cre_pct;

  const ramp = mode === 'cre'
    ? ['#dcfce7', '#a7f3d0', '#fde68a', '#fdba74', '#fca5a5']  // green → red on CRE
    : ['#dbeafe', '#bfdbfe', '#93c5fd', '#3b82f6', '#1d4ed8']; // navy ramp

  const breakpoints = useMemo(() => {
    const vs = BRANCHES.map(valueFor).sort((a, b) => a - b);
    return [0.2, 0.4, 0.6, 0.8].map((q) => vs[Math.min(vs.length - 1, Math.floor(q * vs.length))]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  const colorFor = (b: Branch): string => {
    const v = valueFor(b);
    if (v < breakpoints[0]) return ramp[0];
    if (v < breakpoints[1]) return ramp[1];
    if (v < breakpoints[2]) return ramp[2];
    if (v < breakpoints[3]) return ramp[3];
    return ramp[4];
  };

  const maxDeposits = Math.max(...BRANCHES.map((b) => b.deposits));
  const radiusFor = (b: Branch) => 9 + 18 * Math.sqrt(b.deposits / maxDeposits);

  // Worst CRE breach branch — pulses on the map.
  const outlier = useMemo(() => {
    return [...BRANCHES].sort((a, b) => {
      const ba = Math.max(0, a.cre_pct - CRE_POLICY_CAP) * a.loans;
      const bb = Math.max(0, b.cre_pct - CRE_POLICY_CAP) * b.loans;
      return bb - ba;
    })[0];
  }, []);

  // Ranked regional opportunities / risks table.
  const opportunities = useMemo(() => {
    type Row = { kind: 'risk' | 'upside' | 'flight'; branch: Branch; dollars: number; headline: string; detail: string };
    const rows: Row[] = [];
    for (const b of BRANCHES) {
      // CRE concentration breach
      const breach = Math.max(0, b.cre_pct - CRE_POLICY_CAP);
      if (breach > 0) {
        rows.push({
          kind: 'risk',
          branch: b,
          dollars: breach * b.loans,
          headline: `${b.msa} · CRE concentration ${(b.cre_pct * 100).toFixed(0)}% — ${(breach * 100).toFixed(0)} pts over policy`,
          detail: `${formatCurrencyShort(breach * b.loans)} of loan book sits above the 18% CRE cap.`,
        });
      }
      // Deposit beta flight risk
      if (b.deposit_beta > DEPOSIT_BETA_WARN) {
        const dollars = b.deposits * (b.deposit_beta - DEPOSIT_BETA_WARN);
        rows.push({
          kind: 'flight',
          branch: b,
          dollars,
          headline: `${b.msa} · deposit beta ${b.deposit_beta.toFixed(2)} — flight-risk elevated`,
          detail: `${formatCurrencyShort(dollars)} of deposits price-sensitive above 65 bps beta.`,
        });
      }
      // Wealth upside — high AUM-per-advisor signals capacity to add advisors.
      const aumPerAdvisor = b.wealth_aum / b.advisors;
      if (aumPerAdvisor > 165_000_000 && b.advisors < 25) {
        const upside = aumPerAdvisor * 0.08;   // 8% revenue lift per new advisor seat
        rows.push({
          kind: 'upside',
          branch: b,
          dollars: upside,
          headline: `${b.msa} · advisor productivity ${formatCurrencyShort(aumPerAdvisor)} per seat`,
          detail: `Adding 1 senior advisor models ${formatCurrencyShort(upside)} in marginal book revenue.`,
        });
      }
    }
    return rows.sort((a, b) => b.dollars - a.dollars);
  }, []);

  // ─── Render ──────────────────────────────────────────────────────────────
  return (
    <div className="bg-[var(--paper)] min-h-[calc(100vh-4rem)]">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8 space-y-5">

        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3 border-b border-[var(--hairline)] pb-4">
          <div>
            <div className="eyebrow mb-1">Branch Network · Regional Intelligence</div>
            <h1 className="font-serif text-2xl sm:text-3xl font-semibold text-[var(--ink-strong)] tracking-tight">
              Geographic Intelligence
            </h1>
            <p className="text-xs text-[var(--ink-muted)] mt-1 max-w-2xl">
              {formatNumber(BRANCHES.length)} branches across {new Set(BRANCHES.map((b) => b.state)).size} states.
              Click any branch on the map to drill into deposits, loan mix, NIM,
              advisor productivity and concentration risk.
            </p>
          </div>
          <ModePills mode={mode} setMode={setMode} />
        </div>

        {/* Auto-narrative card */}
        <div className="research-card p-5" style={{ borderColor: 'var(--gold)', borderLeftWidth: 4 }}>
          <div className="flex items-start gap-4 flex-wrap">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1.5">
                <span className="status-pill gold">Cortex · auto-summary</span>
                <span className="text-[10px] uppercase tracking-wider text-[var(--ink-soft)] font-semibold">
                  Refreshed {loaded ? 'just now' : '…'}
                </span>
              </div>
              <p className="text-sm leading-relaxed text-[var(--ink-strong)]">
                <span className="font-mono font-semibold text-[var(--bear)]">{formatCurrencyShort(totals.creBreach)}</span>{' '}
                of the loan book sits above Meridian&apos;s 18% CRE concentration policy,
                concentrated in{' '}
                <span className="font-serif font-semibold">{outlier.msa.split(',')[0]}</span> ({outlier.id}) where CRE
                share is{' '}
                <span className="font-mono font-semibold text-[var(--bear)]">{(outlier.cre_pct * 100).toFixed(0)}%</span>.
                Asset-weighted regional ROA prints{' '}
                <span className="font-mono font-semibold text-[var(--bull)]">{Math.round(totals.roa)} bps</span>,
                {totals.roa >= ROA_PEER_MEDIAN ? ' above ' : ' below '}
                peer median of {ROA_PEER_MEDIAN} bps. Approx{' '}
                <span className="font-mono font-semibold text-[var(--caution)]">{formatCurrencyShort(totals.flightRisk)}</span>{' '}
                in deposits sit at branches with deposit beta above 0.65 — price-sensitive funding to monitor.
              </p>
            </div>
            <div className="shrink-0 rounded-sm border border-[var(--gold)] bg-[var(--gold-bg)] px-4 py-3 min-w-[160px]">
              <div className="text-[10px] uppercase tracking-wider font-semibold text-[var(--gold-dim)]">
                Capital at risk
              </div>
              <div className="font-serif text-2xl font-semibold tabular text-[var(--bear)] mt-0.5">
                {formatCurrencyShort(totals.creBreach + totals.flightRisk)}
              </div>
              <div className="text-[10px] text-[var(--ink-muted)] mt-0.5">
                CRE breach + flight-risk pool
              </div>
            </div>
          </div>
        </div>

        {/* KPI strip */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <KpiTile
            label="Deposit base"
            value={formatCurrencyShort(totals.deposits)}
            peerPctile={68}
            footer={`${formatNumber(totals.households)} households · ${formatNumber(totals.advisors)} advisors`}
            lever="Funding cost / regional NIM"
          />
          <KpiTile
            label="Loan book outstanding"
            value={formatCurrencyShort(totals.loans)}
            peerPctile={54}
            footer={`L/D ratio ${(totals.loans / totals.deposits * 100).toFixed(0)}%`}
            lever="Credit yield × charge-off rate"
          />
          <KpiTile
            label="Branches in network"
            value={formatNumber(BRANCHES.length)}
            peerPctile={42}
            footer={`Wealth AUM ${formatCurrencyShort(totals.aum)}`}
            lever="Branch ROA × cost-to-serve"
          />
          <KpiTile
            label="Regional ROA"
            value={`${Math.round(totals.roa)} bps`}
            peerPctile={pctileForRoa(totals.roa)}
            footer={`Peer median ${ROA_PEER_MEDIAN} bps · top-Q ${ROA_PEER_TOP} bps`}
            lever="Operating leverage · branch P&L"
            tone={totals.roa >= ROA_PEER_TOP ? 'bull' : totals.roa >= ROA_PEER_MEDIAN ? 'neutral' : 'caution'}
          />
        </div>

        {/* Map + intelligence panel */}
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
          {/* LEFT — map (60%) */}
          <div className="lg:col-span-3 research-card overflow-hidden">
            <div className="research-card-header flex items-center justify-between gap-3 flex-wrap">
              <div>
                <div className="eyebrow">Branch network · {MODE_META[mode].short}</div>
                <div className="font-serif text-base font-semibold text-[var(--ink-strong)] mt-0.5">
                  {selected ? selected.name : MODE_META[mode].label}
                  {selected && (
                    <span className="text-[var(--ink-soft)] font-normal text-sm ml-2">
                      · {selected.msa}
                    </span>
                  )}
                </div>
              </div>
              {selected && (
                <button
                  onClick={() => setSelectedId(null)}
                  className="rounded-sm border border-[var(--hairline)] bg-white hover:bg-[var(--paper-deep)] text-[var(--ink)] text-xs font-medium px-3 py-1.5"
                >
                  ← All branches
                </button>
              )}
            </div>

            <div className="relative" style={{ height: 480 }}>
              <MapContainer
                center={[38.8, -84.0]}
                zoom={5}
                minZoom={4}
                scrollWheelZoom
                style={{ height: '100%', width: '100%' }}
              >
                <TileLayer
                  attribution='&copy; OpenStreetMap &copy; CARTO'
                  url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
                  subdomains="abcd"
                  maxZoom={19}
                />
                <FlyToSelected branch={selected} branches={BRANCHES} />

                {/* Outlier pulse — sits behind the dot */}
                {!selected && (
                  <CircleMarker
                    center={[outlier.lat, outlier.lng]}
                    radius={radiusFor(outlier) + 12}
                    pathOptions={{
                      color: 'var(--bear)',
                      weight: 1.5,
                      fillColor: 'transparent',
                      fillOpacity: 0,
                      className: 'geo-outlier-pulse',
                      dashArray: '4 3',
                    } as L.PathOptions}
                    interactive={false}
                  />
                )}

                {BRANCHES.map((b) => {
                  const isSel = selectedId === b.id;
                  const isOutlier = outlier.id === b.id;
                  return (
                    <CircleMarker
                      key={b.id}
                      center={[b.lat, b.lng]}
                      radius={radiusFor(b)}
                      pathOptions={{
                        color: isOutlier ? 'var(--bear)' : 'var(--navy-deep)',
                        weight: isOutlier ? 1.4 : 0.6,
                        fillColor: colorFor(b),
                        fillOpacity: isSel ? 0.95 : 0.82,
                      }}
                      eventHandlers={{ click: () => setSelectedId(b.id) }}
                    >
                      {/* Permanent label — always visible — deposits + advisors */}
                      <Tooltip
                        permanent
                        direction="right"
                        offset={[radiusFor(b) + 2, 0]}
                        opacity={1}
                        className="geo-permanent-label"
                      >
                        <div className="text-[10px] leading-tight tabular">
                          <div className="font-serif font-semibold text-[var(--ink-strong)]">
                            {b.state} · {formatCurrencyShort(b.deposits)}
                          </div>
                          <div className="text-[var(--ink-soft)]">
                            {b.advisors} advisors
                          </div>
                        </div>
                      </Tooltip>
                    </CircleMarker>
                  );
                })}
              </MapContainer>

              <style>{`
                @keyframes geo-pulse-ring {
                  0%   { stroke-opacity: 0.7; }
                  70%  { stroke-opacity: 0;   }
                  100% { stroke-opacity: 0;   }
                }
                .geo-outlier-pulse {
                  animation: geo-pulse-ring 1.8s ease-out infinite;
                }
                .leaflet-tooltip.geo-permanent-label {
                  background: rgba(255, 255, 255, 0.94);
                  border: 1px solid var(--hairline);
                  box-shadow: 0 2px 6px rgba(11, 37, 69, 0.08);
                  border-radius: 3px;
                  padding: 3px 6px;
                  color: var(--ink-strong);
                  white-space: nowrap;
                }
                .leaflet-tooltip.geo-permanent-label:before { display: none; }
              `}</style>
            </div>

            {/* Color legend */}
            <div className="px-4 py-3 border-t border-[var(--hairline-soft)] bg-[var(--paper-deep)]">
              <div className="flex items-center justify-between mb-1.5">
                <div className="text-[10px] uppercase tracking-wider font-semibold text-[var(--ink-soft)]">
                  {MODE_META[mode].label} · quintile bands
                </div>
                <div className="text-[10px] text-[var(--ink-soft)] tabular">
                  Bubble size = deposits · {MODE_META[mode].lever}
                </div>
              </div>
              <div className="flex items-stretch gap-0.5 text-[10px] tabular">
                {ramp.map((color, i) => {
                  const lo = i === 0 ? null : breakpoints[i - 1];
                  const hi = i === 4 ? null : breakpoints[i];
                  const fmt = (v: number) =>
                    mode === 'deposits' || mode === 'loans'
                      ? formatCurrencyShort(v)
                      : mode === 'roa'
                      ? `${Math.round(v)} bps`
                      : `${(v * 100).toFixed(0)}%`;
                  return (
                    <div key={i} className="flex-1 flex flex-col items-stretch">
                      <div className="h-3 rounded-sm" style={{ background: color }} />
                      <div className="mt-1 text-center text-[var(--ink-muted)] tabular">
                        {lo === null ? '< ' : `${fmt(lo)} – `}
                        {hi === null ? `${fmt(breakpoints[3])}+` : fmt(hi)}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* RIGHT — intelligence panel (40%) */}
          <div className="lg:col-span-2">
            {selected ? (
              <BranchDetailPanel branch={selected} onClose={() => setSelectedId(null)} />
            ) : (
              <DefaultPanel branches={BRANCHES} onPick={setSelectedId} outlier={outlier} />
            )}
          </div>
        </div>

        {/* Top regional opportunities & risks */}
        <div className="research-card overflow-hidden">
          <div className="research-card-header">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div>
                <div className="eyebrow">Cortex · regional opportunities & risks</div>
                <div className="font-serif text-lg font-semibold text-[var(--ink-strong)] mt-0.5">
                  Top regional levers — sized by dollars at stake
                </div>
              </div>
              <div className="text-[10px] uppercase tracking-wider text-[var(--ink-soft)] font-semibold">
                {opportunities.length} signals
              </div>
            </div>
          </div>
          <ul className="divide-y divide-[var(--hairline-soft)]">
            {opportunities.slice(0, 8).map((o, i) => {
              const max = opportunities[0]?.dollars ?? 1;
              const pct = o.dollars / max;
              const palette = o.kind === 'upside'
                ? { dot: 'var(--bull)', bar: 'var(--bull)', pill: 'bull', label: 'Upside' }
                : o.kind === 'flight'
                ? { dot: 'var(--caution)', bar: 'var(--caution)', pill: 'caution', label: 'Flight risk' }
                : { dot: 'var(--bear)', bar: 'var(--bear)', pill: 'bear', label: 'Concentration' };
              return (
                <li key={i}>
                  <button
                    onClick={() => setSelectedId(o.branch.id)}
                    className="w-full text-left px-5 py-3.5 hover:bg-[var(--paper-deep)] transition-colors"
                  >
                    <div className="flex items-baseline gap-3">
                      <span className="font-serif text-2xl text-[var(--ink-soft)] tabular leading-none w-6 text-right shrink-0">
                        {i + 1}
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-baseline justify-between gap-2 flex-wrap">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className={`status-pill ${palette.pill}`}>{palette.label}</span>
                            <span className="font-serif font-semibold text-[var(--ink-strong)] text-sm">
                              {o.headline}
                            </span>
                          </div>
                          <span className="font-mono tabular text-sm font-semibold text-[var(--ink-strong)]">
                            {formatCurrencyShort(o.dollars)}
                          </span>
                        </div>
                        <div className="mt-1.5 h-1.5 rounded-full bg-[var(--paper-deep)] overflow-hidden">
                          <div
                            className="h-full rounded-full"
                            style={{ width: `${pct * 100}%`, background: palette.bar, opacity: 0.8 }}
                          />
                        </div>
                        <div className="mt-1 text-[11px] text-[var(--ink-muted)] tabular">
                          {o.detail} · <span className="font-mono">{o.branch.id}</span>
                        </div>
                      </div>
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>

        {/* Provenance strip */}
        <ProvenanceStrip
          branches={BRANCHES.length}
          households={totals.households}
        />
      </div>
    </div>
  );
}

// ─── Mode pills ─────────────────────────────────────────────────────────────

function ModePills({ mode, setMode }: { mode: MapMode; setMode: (m: MapMode) => void }) {
  return (
    <div className="inline-flex items-center gap-0.5 rounded-sm border border-[var(--hairline)] bg-white p-0.5">
      {(Object.keys(MODE_META) as MapMode[]).map((m) => {
        const active = mode === m;
        return (
          <button
            key={m}
            onClick={() => setMode(m)}
            className={`px-3 py-1.5 rounded text-xs font-semibold transition-colors ${
              active
                ? 'bg-[var(--navy-deep)] text-white'
                : 'text-[var(--ink-muted)] hover:text-[var(--ink-strong)] hover:bg-[var(--paper-deep)]'
            }`}
            aria-pressed={active}
          >
            {MODE_META[m].short}
          </button>
        );
      })}
    </div>
  );
}

// ─── KPI tile ───────────────────────────────────────────────────────────────

function KpiTile({
  label, value, peerPctile, footer, lever, tone,
}: {
  label: string;
  value: string;
  peerPctile: number; // 0..100 — higher = better
  footer: string;
  lever: string;
  tone?: 'bull' | 'caution' | 'bear' | 'neutral';
}) {
  const valueColor =
    tone === 'bull' ? 'var(--bull)' :
    tone === 'caution' ? 'var(--caution)' :
    tone === 'bear' ? 'var(--bear)' :
    'var(--ink-strong)';
  return (
    <div className="research-card p-4 flex flex-col gap-2.5">
      <div className="flex items-baseline justify-between gap-2">
        <div className="text-[10px] uppercase tracking-wider font-semibold text-[var(--ink-soft)]">
          {label}
        </div>
        <div className="text-[10px] font-mono tabular text-[var(--ink-soft)]">
          p{peerPctile}
        </div>
      </div>
      <div className="font-serif text-2xl font-semibold tabular leading-none" style={{ color: valueColor }}>
        {value}
      </div>
      <PeerBand position={peerPctile} />
      <div className="text-[11px] text-[var(--ink-muted)] tabular">{footer}</div>
      <div className="text-[10px] uppercase tracking-wider font-semibold text-[var(--gold-dim)] border-t border-[var(--hairline-soft)] pt-1.5">
        Lever · {lever}
      </div>
    </div>
  );
}

function PeerBand({ position }: { position: number }) {
  const p = Math.max(0, Math.min(100, position));
  return (
    <div className="relative" style={{ height: 14 }}>
      <div className="absolute left-0 right-0 rounded-full overflow-hidden border border-[var(--hairline)] flex" style={{ top: 4, height: 6 }}>
        <div style={{ flex: 25, background: 'var(--bear-bg)' }} />
        <div style={{ flex: 50, background: 'var(--caution-bg)' }} />
        <div style={{ flex: 25, background: 'var(--bull-bg)' }} />
      </div>
      <div
        className="absolute rounded-sm shadow-sm"
        style={{ left: `calc(${p}% - 1.5px)`, top: 0, width: 3, height: 14, background: 'var(--ink-strong)' }}
      />
    </div>
  );
}

// ─── Branch detail panel ────────────────────────────────────────────────────

function BranchDetailPanel({ branch: b, onClose }: { branch: Branch; onClose: () => void }) {
  const ld = b.loans / b.deposits;
  const aumPerAdvisor = b.wealth_aum / b.advisors;
  const creBreach = Math.max(0, b.cre_pct - CRE_POLICY_CAP);
  const flightDollars = b.deposit_beta > DEPOSIT_BETA_WARN
    ? b.deposits * (b.deposit_beta - DEPOSIT_BETA_WARN) : 0;
  const clients = topClientsFor(b);

  return (
    <div className="research-card overflow-hidden">
      <div className="research-card-header flex items-start justify-between gap-3">
        <div>
          <div className="eyebrow">Branch Intelligence</div>
          <div className="font-serif text-lg font-semibold text-[var(--ink-strong)] tracking-tight mt-0.5">
            {b.name}
          </div>
          <div className="text-xs text-[var(--ink-muted)] mt-0.5">
            <span className="font-mono">{b.id}</span> · {b.msa} · est. {b.est_yr}
          </div>
        </div>
        <button
          onClick={onClose}
          className="text-[var(--ink-soft)] hover:text-[var(--ink-strong)] text-lg leading-none p-1"
          aria-label="Close"
        >
          ×
        </button>
      </div>

      <div className="p-4 space-y-4">
        {/* Mini stats */}
        <div className="grid grid-cols-2 gap-2.5">
          <MiniStat label="Deposit base" value={formatCurrencyShort(b.deposits)} />
          <MiniStat label="Loan book" value={formatCurrencyShort(b.loans)} />
          <MiniStat label="Wealth AUM" value={formatCurrencyShort(b.wealth_aum)} />
          <MiniStat label="L/D ratio" value={`${(ld * 100).toFixed(0)}%`} />
          <MiniStat
            label="Regional NIM"
            value={`${b.nim_bps} bps`}
            tone={b.nim_bps >= 300 ? 'bull' : b.nim_bps >= 270 ? 'neutral' : 'caution'}
          />
          <MiniStat
            label="Branch ROA"
            value={`${b.roa_bps} bps`}
            tone={b.roa_bps >= ROA_PEER_TOP ? 'bull' : b.roa_bps >= ROA_PEER_MEDIAN ? 'neutral' : 'caution'}
          />
        </div>

        {/* Loan composition */}
        <div>
          <div className="text-[10px] uppercase tracking-wider font-semibold text-[var(--ink-soft)] mb-1.5">
            Loan composition
          </div>
          <LoanMixBar b={b} />
          <div className="mt-2 flex items-center justify-between text-[10px] text-[var(--ink-soft)] tabular">
            <span>CRE {(b.cre_pct * 100).toFixed(0)}%</span>
            <span style={{ color: creBreach > 0 ? 'var(--bear)' : 'var(--ink-soft)' }}>
              Policy cap 18% {creBreach > 0 && `· +${(creBreach * 100).toFixed(0)} pts breach`}
            </span>
          </div>
        </div>

        {/* Risk + flight */}
        {(creBreach > 0 || flightDollars > 0) && (
          <div className="rounded-sm border px-3 py-2.5"
            style={{ borderColor: 'var(--bear)', background: 'var(--bear-bg)' }}>
            <div className="text-[10px] uppercase tracking-wider font-semibold text-[var(--bear)] mb-1">
              Risk concentration
            </div>
            <ul className="text-[11px] text-[var(--ink-strong)] space-y-1 tabular">
              {creBreach > 0 && (
                <li>
                  CRE share {(b.cre_pct * 100).toFixed(0)}% — <span className="font-mono font-semibold">{formatCurrencyShort(creBreach * b.loans)}</span> over policy cap.
                </li>
              )}
              {flightDollars > 0 && (
                <li>
                  Deposit beta {b.deposit_beta.toFixed(2)} — <span className="font-mono font-semibold">{formatCurrencyShort(flightDollars)}</span> price-sensitive funding.
                </li>
              )}
            </ul>
          </div>
        )}

        {/* Advisor productivity */}
        <div>
          <div className="text-[10px] uppercase tracking-wider font-semibold text-[var(--ink-soft)] mb-1.5">
            Advisor productivity
          </div>
          <div className="grid grid-cols-3 gap-2.5">
            <MiniStat label="Advisors" value={`${b.advisors}`} />
            <MiniStat label="AUM / advisor" value={formatCurrencyShort(aumPerAdvisor)} />
            <MiniStat label="Cost-to-serve" value={`$${b.cost_to_serve}/yr`} />
          </div>
        </div>

        {/* Top wealth clients */}
        <div>
          <div className="text-[10px] uppercase tracking-wider font-semibold text-[var(--ink-soft)] mb-1.5">
            Top wealth relationships · this branch
          </div>
          <ul className="space-y-1.5">
            {clients.map((c, i) => {
              const max = clients[0].aum;
              const pct = c.aum / max;
              return (
                <li key={c.handle} className="text-xs">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="text-[var(--ink-strong)] truncate">
                      <span className="font-mono text-[var(--ink-soft)] mr-1.5">{i + 1}.</span>
                      {c.handle}
                      <span className="text-[var(--ink-soft)] ml-1.5">· {c.advisor}</span>
                    </span>
                    <span className="font-mono tabular text-[var(--ink-muted)] shrink-0">
                      {formatCurrencyShort(c.aum)}
                    </span>
                  </div>
                  <div className="mt-1 h-1 rounded-full bg-[var(--paper-deep)] overflow-hidden">
                    <div className="h-full rounded-full" style={{ width: `${pct * 100}%`, background: 'var(--gold)', opacity: 0.85 }} />
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </div>
  );
}

function LoanMixBar({ b }: { b: Branch }) {
  // Synthetic composition — fixed shape, normalized so CRE matches branch fact.
  const cre = b.cre_pct;
  const resi = 0.34;
  const ci = 0.28 + (1 - cre - resi - 0.12 - 0.06);  // residual after others
  const auto = 0.06;
  const cards = 0.06;
  const other = Math.max(0, 1 - (cre + resi + ci + auto + cards));
  const segs = [
    { label: 'CRE', pct: cre, color: cre > CRE_POLICY_CAP ? 'var(--bear)' : 'var(--gold)' },
    { label: 'Resi', pct: resi, color: 'var(--navy)' },
    { label: 'C&I', pct: Math.max(0, ci), color: 'var(--teal)' },
    { label: 'Auto', pct: auto, color: 'var(--silver)' },
    { label: 'Cards', pct: cards, color: 'var(--caution)' },
    { label: 'Other', pct: other, color: 'var(--ink-soft)' },
  ];
  return (
    <div>
      <div className="flex h-3 rounded-sm overflow-hidden border border-[var(--hairline)]">
        {segs.map((s) => (
          <div key={s.label} title={`${s.label} ${(s.pct * 100).toFixed(0)}%`}
            style={{ flex: Math.max(0.5, s.pct * 100), background: s.color }} />
        ))}
      </div>
      <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-[10px] tabular">
        {segs.map((s) => (
          <span key={s.label} className="inline-flex items-center gap-1 text-[var(--ink-muted)]">
            <span className="inline-block h-2 w-2 rounded-sm" style={{ background: s.color }} />
            {s.label} {(s.pct * 100).toFixed(0)}%
          </span>
        ))}
      </div>
    </div>
  );
}

function MiniStat({ label, value, tone }: { label: string; value: string; tone?: 'bull' | 'caution' | 'bear' | 'neutral' }) {
  const color =
    tone === 'bull' ? 'var(--bull)' :
    tone === 'caution' ? 'var(--caution)' :
    tone === 'bear' ? 'var(--bear)' :
    'var(--ink-strong)';
  return (
    <div className="rounded-sm border border-[var(--hairline)] bg-white px-2.5 py-2">
      <div className="text-[9px] uppercase tracking-wider font-semibold text-[var(--ink-soft)]">{label}</div>
      <div className="mt-0.5 font-serif text-base font-semibold tabular leading-tight" style={{ color }}>{value}</div>
    </div>
  );
}

// ─── Default-state right-panel (no branch selected) ─────────────────────────

function DefaultPanel({ branches, onPick, outlier }: { branches: Branch[]; onPick: (id: string) => void; outlier: Branch }) {
  const ranked = useMemo(
    () => [...branches].sort((a, b) => b.deposits - a.deposits).slice(0, 6),
    [branches],
  );
  return (
    <div className="research-card overflow-hidden">
      <div className="research-card-header">
        <div className="eyebrow">Branch Intelligence · default</div>
        <div className="font-serif text-lg font-semibold text-[var(--ink-strong)] mt-0.5">
          Largest branches by deposits
        </div>
        <div className="text-xs text-[var(--ink-muted)] mt-0.5">
          Pulsing branch on the map ({outlier.id}) is the highest CRE-concentration breach.
          Click any row or marker to drill into the branch P&amp;L.
        </div>
      </div>
      <ol className="divide-y divide-[var(--hairline-soft)]">
        {ranked.map((b, i) => {
          const max = ranked[0].deposits;
          const pct = b.deposits / max;
          const flight = b.deposit_beta > DEPOSIT_BETA_WARN;
          return (
            <li key={b.id}>
              <button
                onClick={() => onPick(b.id)}
                className="w-full text-left px-5 py-3 hover:bg-[var(--paper-deep)] transition-colors"
              >
                <div className="flex items-baseline gap-3">
                  <div className="font-serif text-xl text-[var(--ink-soft)] tabular leading-none w-5 text-right shrink-0">
                    {i + 1}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline justify-between gap-2 flex-wrap">
                      <div>
                        <span className="font-mono text-[10px] text-[var(--ink-soft)] mr-1.5">{b.state}</span>
                        <span className="font-serif font-semibold text-[var(--ink-strong)] text-sm">{b.name}</span>
                      </div>
                      <span className="font-mono tabular text-sm font-semibold text-[var(--ink-strong)]">
                        {formatCurrencyShort(b.deposits)}
                      </span>
                    </div>
                    <div className="mt-1 h-1 rounded-full bg-[var(--paper-deep)] overflow-hidden">
                      <div className="h-full rounded-full" style={{ width: `${pct * 100}%`, background: 'var(--navy-soft)', opacity: 0.85 }} />
                    </div>
                    <div className="mt-1 flex items-center justify-between text-[10px] text-[var(--ink-soft)] tabular">
                      <span>{b.advisors} advisors · ROA {b.roa_bps} bps · NIM {b.nim_bps} bps</span>
                      {flight && <span style={{ color: 'var(--caution)' }}>β {b.deposit_beta.toFixed(2)}</span>}
                    </div>
                  </div>
                </div>
              </button>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

// ─── Provenance strip ───────────────────────────────────────────────────────

function ProvenanceStrip({ branches, households }: { branches: number; households: number }) {
  return (
    <div className="research-card px-4 py-2.5 flex flex-wrap items-center gap-x-5 gap-y-1 text-[11px] tabular">
      <span className="layer-chip gold">Gold · branch_geo_mart</span>
      <span className="text-[var(--ink-soft)]">
        <span className="font-semibold text-[var(--ink-strong)]">Fivetran</span> · core-banking + wealth CRM CDC
      </span>
      <span className="text-[var(--ink-soft)]">
        <span className="font-semibold text-[var(--ink-strong)]">Snowflake</span> · regional rollups, peer benchmarks
      </span>
      <span className="text-[var(--ink-soft)]">
        {formatNumber(branches)} branches · {formatNumber(households)} households
      </span>
      <span className="text-[var(--ink-soft)] ml-auto">Freshness 6 min ago</span>
    </div>
  );
}

// ─── Map helpers ────────────────────────────────────────────────────────────

function FlyToSelected({ branch, branches }: { branch: Branch | null; branches: Branch[] }) {
  const map = useMap();
  useEffect(() => {
    if (branch) {
      map.flyTo([branch.lat, branch.lng], 8, { duration: 0.8 });
    } else {
      const bounds = L.latLngBounds(branches.map((b) => [b.lat, b.lng] as [number, number]));
      map.flyToBounds(bounds, { padding: [40, 60], maxZoom: 6, duration: 0.8 });
    }
  }, [branch?.id, branches.length, map]);
  return null;
}

// ─── helpers ────────────────────────────────────────────────────────────────

function pctileForRoa(roaBps: number): number {
  // Map ROA bps onto a 0..100 peer percentile, anchored on the peer-median /
  // top-quartile constants above.
  if (roaBps >= ROA_PEER_TOP) return Math.min(95, 75 + (roaBps - ROA_PEER_TOP) / 2);
  if (roaBps >= ROA_PEER_MEDIAN) return 50 + ((roaBps - ROA_PEER_MEDIAN) / (ROA_PEER_TOP - ROA_PEER_MEDIAN)) * 25;
  return Math.max(5, 50 - (ROA_PEER_MEDIAN - roaBps) * 1.2);
}

// Unused — kept exportable in case the page is extended.
export { BRANCHES };

// Suppress unused-percent helper import if not used elsewhere.
void formatPercent;
