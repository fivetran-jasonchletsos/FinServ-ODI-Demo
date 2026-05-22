"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api/queries';
import {
  seedCompanies,
  buildGraph,
  relatedFor,
  type GraphNode,
  type GraphEdge,
} from '../lib/related';
import type { Company } from '../types';

// ---------------------------------------------------------------------------
// Sector color palette (navy-gold institutional theme)
// ---------------------------------------------------------------------------
const SECTOR_COLORS: Record<string, string> = {
  'Financials':             '#0b2545',
  'Technology':             '#1d4e89',
  'Healthcare':             '#0369a1',
  'Consumer Discretionary': '#b45309',
  'Consumer Staples':       '#166534',
  'Energy':                 '#7c2d12',
  'Industrials':            '#374151',
  'Materials':              '#1e3a5f',
  'Utilities':              '#4338ca',
  'Real Estate':            '#92400e',
  'Communication Services': '#1d4e89',
  'unknown':                '#6b7280',
};

function sectorColor(sector: string): string {
  return SECTOR_COLORS[sector] ?? '#6b7280';
}

// ---------------------------------------------------------------------------
// Force simulation (no external library)
// ---------------------------------------------------------------------------
type Vec2 = { x: number; y: number };

function runSimulation(
  nodes: GraphNode[],
  edges: GraphEdge[],
  width: number,
  height: number,
  onTick: (positions: Vec2[]) => void,
  onDone: (positions: Vec2[]) => void,
) {
  const n   = nodes.length;
  const pos: Vec2[] = nodes.map(() => ({
    x: width  / 2 + (Math.random() - 0.5) * Math.min(width, height) * 0.5,
    y: height / 2 + (Math.random() - 0.5) * Math.min(width, height) * 0.5,
  }));
  const vel: Vec2[] = nodes.map(() => ({ x: 0, y: 0 }));

  const idToIdx = new Map(nodes.map((nd, i) => [nd.id, i]));
  const adj = new Map<string, { target: number; score: number }[]>();
  for (const e of edges) {
    const si = idToIdx.get(e.source);
    const ti = idToIdx.get(e.target);
    if (si == null || ti == null) continue;
    if (!adj.has(e.source)) adj.set(e.source, []);
    if (!adj.has(e.target)) adj.set(e.target, []);
    adj.get(e.source)!.push({ target: ti, score: e.score });
    adj.get(e.target)!.push({ target: si, score: e.score });
  }

  const REPEL    = 4200;
  const SPRING_K = 0.045;
  const REST_LEN = 150;
  const CENTER_G = 0.007;
  const DAMP     = 0.84;

  let alpha = 1.0;
  let frame = 0;
  let rafId: number;

  function tick() {
    alpha *= 0.993;
    const cx = width  / 2;
    const cy = height / 2;

    for (let i = 0; i < n; i++) {
      let fx = 0;
      let fy = 0;

      for (let j = 0; j < n; j++) {
        if (i === j) continue;
        const dx   = pos[i].x - pos[j].x;
        const dy   = pos[i].y - pos[j].y;
        const dist2 = dx * dx + dy * dy + 1;
        const dist  = Math.sqrt(dist2);
        const str   = REPEL / dist2;
        fx += (dx / dist) * str;
        fy += (dy / dist) * str;
      }

      for (const { target: j, score } of adj.get(nodes[i].id) ?? []) {
        const dx      = pos[j].x - pos[i].x;
        const dy      = pos[j].y - pos[i].y;
        const dist    = Math.sqrt(dx * dx + dy * dy) + 0.01;
        const stretch = dist - REST_LEN * (1 - score * 0.35);
        fx += (dx / dist) * SPRING_K * stretch;
        fy += (dy / dist) * SPRING_K * stretch;
      }

      fx += (cx - pos[i].x) * CENTER_G;
      fy += (cy - pos[i].y) * CENTER_G;

      vel[i].x = (vel[i].x + fx * alpha) * DAMP;
      vel[i].y = (vel[i].y + fy * alpha) * DAMP;
      pos[i].x = Math.max(24, Math.min(width  - 24, pos[i].x + vel[i].x));
      pos[i].y = Math.max(24, Math.min(height - 24, pos[i].y + vel[i].y));
    }

    frame++;
    if (frame % 4 === 0) onTick([...pos.map((p) => ({ ...p }))]);

    if (alpha > 0.01 && frame < 700) {
      rafId = requestAnimationFrame(tick);
    } else {
      onDone([...pos.map((p) => ({ ...p }))]);
    }
  }

  rafId = requestAnimationFrame(tick);
  return () => cancelAnimationFrame(rafId);
}

// ---------------------------------------------------------------------------
// Canvas renderer
// ---------------------------------------------------------------------------
const NODE_R     = 9;
const NODE_R_SEL = 14;
const NODE_R_HOV = 11;

function drawGraph(
  ctx: CanvasRenderingContext2D,
  nodes: GraphNode[],
  edges: GraphEdge[],
  positions: Vec2[],
  idToIdx: Map<string, number>,
  selectedId: string | null,
  hoveredId: string | null,
  dpr: number,
) {
  const W = ctx.canvas.width  / dpr;
  const H = ctx.canvas.height / dpr;
  ctx.save();
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, W, H);

  // Background
  ctx.fillStyle = '#0b1a2e';
  ctx.fillRect(0, 0, W, H);

  // Edges
  for (const e of edges) {
    const si = idToIdx.get(e.source);
    const ti = idToIdx.get(e.target);
    if (si == null || ti == null) continue;
    const sp = positions[si];
    const tp = positions[ti];
    if (!sp || !tp) continue;

    const highlighted =
      e.source === selectedId || e.target === selectedId ||
      e.source === hoveredId  || e.target === hoveredId;

    ctx.beginPath();
    ctx.moveTo(sp.x, sp.y);
    ctx.lineTo(tp.x, tp.y);
    if (highlighted) {
      ctx.strokeStyle = `rgba(184,151,92,${0.25 + e.score * 0.45})`;
      ctx.lineWidth   = 1 + e.score * 2;
    } else {
      ctx.strokeStyle = `rgba(184,151,92,${0.03 + e.score * 0.07})`;
      ctx.lineWidth   = 0.4 + e.score;
    }
    ctx.stroke();
  }

  const special = new Set([selectedId, hoveredId].filter(Boolean) as string[]);

  const drawNode = (node: GraphNode, i: number) => {
    const p   = positions[i];
    if (!p) return;
    const isSel = node.id === selectedId;
    const isHov = node.id === hoveredId;
    const r     = isSel ? NODE_R_SEL : isHov ? NODE_R_HOV : NODE_R;
    const color = sectorColor(node.primarySector);

    if (isSel) {
      ctx.beginPath();
      ctx.arc(p.x, p.y, r + 9, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(184,151,92,0.15)';
      ctx.fill();
    }

    ctx.beginPath();
    ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();

    // Ticker label inside node for selected/hovered
    if (isSel || isHov) {
      const ticker = node.company.ticker ?? node.id.slice(-4);
      ctx.font      = `700 ${isSel ? 10 : 9}px 'JetBrains Mono', 'Courier New', monospace`;
      ctx.fillStyle = '#e8d5a3';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(ticker, p.x, p.y);
      ctx.textBaseline = 'alphabetic';

      const label = node.company.name.length > 22 ? node.company.name.slice(0, 20) + '…' : node.company.name;
      ctx.font      = `500 9px 'JetBrains Mono', 'Courier New', monospace`;
      ctx.fillStyle = isSel ? '#e8d5a3' : 'rgba(232,213,163,0.65)';
      ctx.fillText(label, p.x, p.y + r + 13);
    } else {
      // tiny ticker always visible
      ctx.font      = `600 7px 'JetBrains Mono', 'Courier New', monospace`;
      ctx.fillStyle = 'rgba(255,255,255,0.7)';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(node.company.ticker ?? '', p.x, p.y);
      ctx.textBaseline = 'alphabetic';
    }

    // Ring
    ctx.beginPath();
    ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
    ctx.strokeStyle = isSel
      ? '#e8d5a3'
      : isHov
      ? 'rgba(232,213,163,0.6)'
      : 'rgba(232,213,163,0.18)';
    ctx.lineWidth = isSel ? 2 : 1;
    ctx.stroke();
  };

  nodes.forEach((node, i) => { if (!special.has(node.id)) drawNode(node, i); });
  nodes.forEach((node, i) => { if (special.has(node.id))  drawNode(node, i); });

  ctx.restore();
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------
export default function RelatedPage() {
  const navigate   = useNavigate();
  const canvasRef  = useRef<HTMLCanvasElement>(null);
  const posRef     = useRef<Vec2[]>([]);
  const rafRef     = useRef<number>(0);
  const dragging   = useRef<{ startX: number; startY: number; tx: number; ty: number } | null>(null);

  const [positions,  setPositions]  = useState<Vec2[]>([]);
  const [simDone,    setSimDone]     = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [hoveredId,  setHoveredId]  = useState<string | null>(null);
  const [transform,  setTransform]  = useState({ x: 0, y: 0, scale: 1 });
  const [loading,    setLoading]    = useState(true);
  const [companies,  setCompanies]  = useState<Company[]>([]);
  const [size, setSize] = useState({ w: 900, h: 680 });

  // Load companies and seed engine
  useEffect(() => {
    api.searchCompanies({ limit: 1000 }).then((r) => {
      seedCompanies(r.results);
      setCompanies(r.results);
      setLoading(false);
    });
  }, []);

  const { nodes, edges } = useMemo(() => {
    if (companies.length === 0) return { nodes: [], edges: [] };
    return buildGraph();
  }, [companies]);

  const idToIdx = useMemo(
    () => new Map(nodes.map((n, i) => [n.id, i])),
    [nodes],
  );

  // Canvas sizing
  useEffect(() => {
    function measure() {
      const el = canvasRef.current?.parentElement;
      if (el) setSize({ w: el.clientWidth, h: Math.min(el.clientWidth * 0.74, 700) });
    }
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, []);

  // Simulation
  useEffect(() => {
    if (nodes.length === 0 || size.w < 100) return;
    setSimDone(false);
    const cleanup = runSimulation(
      nodes, edges, size.w, size.h,
      (pos) => { posRef.current = pos; setPositions([...pos]); },
      (pos) => { posRef.current = pos; setPositions([...pos]); setSimDone(true); },
    );
    return cleanup;
  }, [nodes, edges, size.w, size.h]);

  // Render loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || posRef.current.length === 0) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;

    canvas.width  = size.w * dpr;
    canvas.height = size.h * dpr;
    canvas.style.width  = `${size.w}px`;
    canvas.style.height = `${size.h}px`;

    cancelAnimationFrame(rafRef.current);

    function frame() {
      if (!ctx) return;
      const lW = canvas!.width  / dpr;
      const lH = canvas!.height / dpr;
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.scale(dpr, dpr);
      ctx.fillStyle = '#0b1a2e';
      ctx.fillRect(0, 0, lW, lH);
      ctx.translate(transform.x + lW / 2, transform.y + lH / 2);
      ctx.scale(transform.scale, transform.scale);
      ctx.translate(-lW / 2, -lH / 2);
      drawGraph(ctx, nodes, edges, posRef.current, idToIdx, selectedId, hoveredId, 1);
      ctx.restore();
      rafRef.current = requestAnimationFrame(frame);
    }

    rafRef.current = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(rafRef.current);
  }, [positions, selectedId, hoveredId, transform, size, nodes, edges, idToIdx]);

  // Interaction helpers
  const toCanvas = useCallback((clientX: number, clientY: number, canvas: HTMLCanvasElement): Vec2 => {
    const rect = canvas.getBoundingClientRect();
    const lx   = clientX - rect.left;
    const ly   = clientY - rect.top;
    const cx   = size.w / 2;
    const cy   = size.h / 2;
    return {
      x: (lx - cx - transform.x) / transform.scale + cx,
      y: (ly - cy - transform.y) / transform.scale + cy,
    };
  }, [size, transform]);

  const nearestNode = useCallback((cx: number, cy: number): GraphNode | null => {
    let best: GraphNode | null = null;
    let bestDist = 22;
    posRef.current.forEach((p, i) => {
      if (!p) return;
      const d = Math.hypot(p.x - cx, p.y - cy);
      if (d < bestDist) { bestDist = d; best = nodes[i]; }
    });
    return best;
  }, [nodes]);

  function onMouseMove(e: React.MouseEvent<HTMLCanvasElement>) {
    if (dragging.current) {
      const dx = e.clientX - dragging.current.startX;
      const dy = e.clientY - dragging.current.startY;
      setTransform((t) => ({ ...t, x: dragging.current!.tx + dx, y: dragging.current!.ty + dy }));
      return;
    }
    const canvas = canvasRef.current;
    if (!canvas) return;
    const { x, y } = toCanvas(e.clientX, e.clientY, canvas);
    const node = nearestNode(x, y);
    setHoveredId(node?.id ?? null);
    canvas.style.cursor = node ? 'pointer' : 'grab';
  }

  function onMouseDown(e: React.MouseEvent<HTMLCanvasElement>) {
    dragging.current = { startX: e.clientX, startY: e.clientY, tx: transform.x, ty: transform.y };
  }

  function onMouseUp(e: React.MouseEvent<HTMLCanvasElement>) {
    const moved = dragging.current
      ? Math.hypot(e.clientX - dragging.current.startX, e.clientY - dragging.current.startY) > 4
      : false;
    dragging.current = null;
    if (!moved) {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const { x, y } = toCanvas(e.clientX, e.clientY, canvas);
      const node = nearestNode(x, y);
      setSelectedId(node?.id ?? null);
    }
  }

  function onWheel(e: React.WheelEvent<HTMLCanvasElement>) {
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.1 : 0.9;
    setTransform((t) => ({
      ...t,
      scale: Math.max(0.25, Math.min(5, t.scale * factor)),
    }));
  }

  const selectedNode      = selectedId ? nodes.find((n) => n.id === selectedId) ?? null : null;
  const selectedNeighbors = selectedId ? relatedFor(selectedId) : [];

  if (loading) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-20 text-center text-[var(--ink-soft)]">
        Loading company universe…
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
      {/* Page header */}
      <header className="mb-5">
        <div className="text-[10px] font-semibold uppercase tracking-[0.25em] text-[var(--gold-dim)] mb-1">
          Similarity Network
        </div>
        <h1 className="font-serif text-2xl sm:text-3xl font-semibold text-[var(--ink-strong)]">
          Related Companies
        </h1>
        <p className="mt-1.5 text-sm text-[var(--ink-soft)] max-w-2xl">
          Force-directed map of the {nodes.length}-company research universe. Edges connect
          holdings that share GICS sector, sub-industry, market-cap band, and factor exposure.
          Drag to pan, scroll to zoom, click any node to inspect.
        </p>
        <p className="mt-1 text-xs text-[var(--ink-soft)]">
          {nodes.length} companies, {edges.length} similarity edges
          {simDone ? ' — settled' : ' — settling…'}
        </p>
      </header>

      <div
        className="rounded-sm overflow-hidden border"
        style={{ borderColor: 'rgba(184,151,92,0.2)' }}
      >
        <div className="flex flex-col lg:flex-row">
          {/* Canvas */}
          <div className="flex-1 min-w-0 relative" style={{ background: '#0b1a2e', minHeight: `${size.h}px` }}>
            <canvas
              ref={canvasRef}
              onMouseMove={onMouseMove}
              onMouseDown={onMouseDown}
              onMouseUp={onMouseUp}
              onMouseLeave={() => { setHoveredId(null); dragging.current = null; }}
              onWheel={onWheel}
              style={{ display: 'block', cursor: 'grab', userSelect: 'none' }}
            />
            {!simDone && (
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <p className="text-[10px] font-mono uppercase tracking-[0.3em] text-[rgba(232,213,163,0.4)] animate-pulse">
                  Calculating similarity graph…
                </p>
              </div>
            )}

            {/* Sector legend */}
            <div className="absolute bottom-3 left-3 flex flex-wrap gap-x-3 gap-y-1 max-w-xs">
              {Object.entries(SECTOR_COLORS).filter(([s]) => s !== 'unknown').map(([sector, color]) => (
                <span key={sector} className="flex items-center gap-1">
                  <span
                    className="inline-block rounded-full shrink-0"
                    style={{ width: 8, height: 8, background: color }}
                  />
                  <span
                    className="text-[9px] font-mono uppercase tracking-[0.18em]"
                    style={{ color: 'rgba(232,213,163,0.45)' }}
                  >
                    {sector}
                  </span>
                </span>
              ))}
            </div>
          </div>

          {/* Side panel */}
          <aside
            className="w-full lg:w-80 border-t lg:border-t-0 lg:border-l flex-none overflow-y-auto"
            style={{ borderColor: 'rgba(184,151,92,0.2)', maxHeight: `${size.h + 80}px`, background: 'var(--paper)' }}
          >
            {selectedNode ? (
              <div className="p-5">
                {/* Company header */}
                <div className="flex items-center gap-2 mb-1">
                  <span
                    className="h-3 w-3 rounded-full shrink-0"
                    style={{ background: sectorColor(selectedNode.primarySector) }}
                  />
                  <span className="ticker text-lg font-bold text-[var(--ink-strong)]">
                    {selectedNode.company.ticker}
                  </span>
                  <span
                    className="text-[9px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded-sm"
                    style={{ background: 'var(--paper-deep)', color: 'var(--ink-muted)' }}
                  >
                    {selectedNode.company.risk_bucket}
                  </span>
                </div>
                <h2 className="font-serif text-base font-semibold text-[var(--ink-strong)] leading-tight">
                  {selectedNode.company.name}
                </h2>
                <p className="text-[11px] text-[var(--ink-muted)] mt-0.5">
                  {selectedNode.company.sector}
                  {selectedNode.company.industry ? ` — ${selectedNode.company.industry}` : ''}
                </p>
                {selectedNode.company.hq_city && (
                  <p className="text-[11px] text-[var(--ink-soft)] mt-0.5">
                    {selectedNode.company.hq_city}, {selectedNode.company.hq_state}
                  </p>
                )}

                <Link
                  to={`/companies/${selectedNode.id}`}
                  className="mt-3 inline-block text-[10px] font-semibold uppercase tracking-[0.2em] text-[var(--gold-dim)] border px-3 py-1.5 rounded-sm hover:bg-[var(--gold-bg)] transition-colors"
                  style={{ borderColor: 'rgba(184,151,92,0.4)' }}
                >
                  Open research file
                </Link>

                {/* Top-8 neighbors */}
                <div className="mt-5 border-t pt-4" style={{ borderColor: 'var(--hairline)' }}>
                  <div className="text-[9px] font-semibold uppercase tracking-[0.28em] text-[var(--ink-muted)] mb-2">
                    Top {selectedNeighbors.length} related holdings
                  </div>
                  <ol className="space-y-1">
                    {selectedNeighbors.map((nb) => (
                      <li key={nb.cik}>
                        <button
                          onClick={() => setSelectedId(nb.cik)}
                          className="w-full text-left px-2 py-1.5 border-l-2 border-[var(--hairline)] hover:border-[var(--gold)] hover:bg-[var(--paper-deep)] transition-colors rounded-r-sm"
                        >
                          <div className="flex justify-between items-baseline gap-2">
                            <span className="ticker text-sm text-[var(--ink-strong)] font-semibold">
                              {nb.company.ticker}
                            </span>
                            <span
                              className="text-[9px] font-mono tabular shrink-0"
                              style={{ color: 'var(--gold-dim)' }}
                            >
                              {Math.round(nb.score * 100)}%
                            </span>
                          </div>
                          <p className="text-[11px] text-[var(--ink-muted)] truncate">{nb.company.name}</p>
                          <p className="text-[9px] font-mono uppercase tracking-[0.15em] text-[var(--ink-soft)] truncate mt-0.5">
                            {nb.why}
                          </p>
                        </button>
                      </li>
                    ))}
                  </ol>
                </div>

                {/* Methodology note */}
                <div className="mt-5 border-t pt-4 text-[11px] leading-relaxed text-[var(--ink-soft)]" style={{ borderColor: 'var(--hairline)' }}>
                  Similarity scored over GICS sector, sub-industry, market-cap band,
                  geographic region, risk bucket, and factor exposure (value, momentum,
                  quality, defensive, growth). Top-8 neighbors per company.
                  In production: <span className="text-[var(--gold-dim)] font-mono">CORTEX.EMBED_TEXT_768</span>.
                </div>
              </div>
            ) : (
              <div className="p-5 space-y-3">
                <div className="text-[10px] font-semibold uppercase tracking-[0.28em] text-[var(--ink-muted)]">
                  Click any node to explore
                </div>
                <p className="text-sm text-[var(--ink-soft)] leading-relaxed">
                  Each node is a holding in the Altavest research universe. Edges connect
                  the most similar companies by sector, sub-industry, market-cap band,
                  factor exposure, and risk classification. Clusters form by sector;
                  cross-sector edges surface factor and risk commonalities.
                </p>
                <p className="text-[11px] font-mono text-[var(--ink-soft)]">
                  {nodes.length} companies · {edges.length} edges
                </p>
                <div className="pt-3 border-t" style={{ borderColor: 'var(--hairline)' }}>
                  <Link
                    to="/holdings"
                    className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[var(--gold-dim)] hover:text-[var(--ink-strong)] transition-colors"
                  >
                    Browse full holdings table
                  </Link>
                </div>
              </div>
            )}
          </aside>
        </div>
      </div>

      {/* Bottom: instruction bar */}
      <div className="mt-3 text-[10px] font-mono text-[var(--ink-soft)] flex flex-wrap gap-4">
        <span>Drag to pan</span>
        <span>Scroll to zoom</span>
        <span>Click a node to inspect</span>
        <span>Click a neighbor to jump</span>
        <span
          className="ml-auto cursor-pointer text-[var(--gold-dim)] hover:text-[var(--ink-strong)] transition-colors"
          onClick={() => navigate('/holdings')}
        >
          Holdings table
        </span>
      </div>
    </div>
  );
}
