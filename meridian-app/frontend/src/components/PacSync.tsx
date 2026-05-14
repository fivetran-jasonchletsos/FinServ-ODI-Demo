/* ============================================================
 * PacSync — hidden mini Pac-Man. Trigger: Konami code.
 * Pac-Man is a Fivetran-blue sphere eating data rows in a clinical
 * grid. Ghosts: NULL (red), DUPE (pink), STALE (cyan), DRIFT (orange).
 * Power pellet = "Schema Migration" — ghosts turn blue, run away.
 * ============================================================ */
import { useCallback, useEffect, useRef, useState } from 'react';

const TILE = 22;

// 19 cols × 21 rows. Symbols: # wall, . dot, o power, " " empty,
// P player spawn, G ghost spawn, - ghost door.
const MAZE: string[] = [
  '###################',
  '#........#........#',
  '#o##.###.#.###.##o#',
  '#.................#',
  '#.##.#.#####.#.##.#',
  '#....#...#...#....#',
  '####.### # ###.####',
  '   #.#       #.#   ',
  '####.# ##-## #.####',
  '    .  #GGG#  .    ',
  '####.# ##### #.####',
  '   #.#       #.#   ',
  '####.# ##### #.####',
  '#........#........#',
  '#.##.###.#.###.##.#',
  '#o.#....P.....#..o#',
  '##.#.#.#####.#.#.##',
  '#....#...#...#....#',
  '#.######.#.######.#',
  '#.................#',
  '###################',
];

const COLS = MAZE[0].length;
const ROWS = MAZE.length;
const W = COLS * TILE;
const H = ROWS * TILE;

type Dir = 'up' | 'down' | 'left' | 'right' | 'none';
type CellType = 'wall' | 'dot' | 'power' | 'empty' | 'door';

interface Entity {
  tx: number;     // tile x
  ty: number;     // tile y
  px: number;     // pixel x (sub-tile)
  py: number;     // pixel y
  dir: Dir;
  pendingDir?: Dir;
  speed: number;
}
interface Ghost extends Entity {
  name: 'NULL' | 'DUPE' | 'STALE' | 'DRIFT';
  color: string;
  state: 'chase' | 'frightened' | 'eaten';
  homeTile: { x: number; y: number };
}

const HIGH_SCORE_KEY = 'pac-sync:high-score';
const FRIGHTENED_MS = 7500;
const POINTS_DOT = 10;
const POINTS_POWER = 50;
const POINTS_GHOST = 200;

export default function PacSync({ onClose }: { onClose: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const keysRef = useRef<Record<string, boolean>>({});
  const stateRef = useRef<GameState>(initialState());
  const [, setTick] = useState(0);
  const [phase, setPhase] = useState<'playing' | 'won' | 'lost'>('playing');
  const [score, setScore] = useState(0);
  const [lives, setLives] = useState(3);
  const [highScore, setHighScore] = useState(() => {
    try { return parseInt(localStorage.getItem(HIGH_SCORE_KEY) || '0', 10) || 0; } catch { return 0; }
  });

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'w', 'a', 's', 'd', 'p', 'escape'].includes(k)) e.preventDefault();
      if (k === 'escape') { onClose(); return; }
      if (k === 'p') { stateRef.current.paused = !stateRef.current.paused; return; }
      keysRef.current[k] = true;
      // Apply intended direction immediately
      const dir = keyToDir(k);
      if (dir) stateRef.current.player.pendingDir = dir;
    };
    const up = (e: KeyboardEvent) => { keysRef.current[e.key.toLowerCase()] = false; };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
  }, [onClose]);

  useEffect(() => {
    let last = performance.now();
    const loop = (now: number) => {
      const dt = Math.min(40, now - last) / 16.67;
      last = now;
      const r = step(stateRef.current, dt, {
        onScore: (n) => { stateRef.current.score += n; setScore(stateRef.current.score); },
        onLife: () => {
          stateRef.current.lives -= 1;
          setLives(stateRef.current.lives);
          if (stateRef.current.lives <= 0) {
            stateRef.current.phase = 'lost';
            setPhase('lost');
            persistHigh(stateRef.current.score);
          } else {
            // Reset positions
            resetPositions(stateRef.current);
          }
        },
        onWin: () => {
          stateRef.current.phase = 'won';
          setPhase('won');
          persistHigh(stateRef.current.score);
        },
      });
      void r;
      draw(canvasRef.current, stateRef.current);
      setTick((t) => t + 1);
      if (stateRef.current.phase === 'playing') {
        rafRef.current = requestAnimationFrame(loop);
      } else {
        // Still paint the final frame once
        draw(canvasRef.current, stateRef.current);
      }
    };
    rafRef.current = requestAnimationFrame(loop);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [phase]);

  const persistHigh = (s: number) => {
    setHighScore((prev) => {
      const next = Math.max(prev, s);
      try { localStorage.setItem(HIGH_SCORE_KEY, String(next)); } catch {}
      return next;
    });
  };

  const restart = useCallback(() => {
    stateRef.current = initialState();
    setScore(0); setLives(3); setPhase('playing');
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    let last = performance.now();
    const loop = (now: number) => {
      const dt = Math.min(40, now - last) / 16.67;
      last = now;
      step(stateRef.current, dt, {
        onScore: (n) => { stateRef.current.score += n; setScore(stateRef.current.score); },
        onLife: () => {
          stateRef.current.lives -= 1; setLives(stateRef.current.lives);
          if (stateRef.current.lives <= 0) {
            stateRef.current.phase = 'lost'; setPhase('lost'); persistHigh(stateRef.current.score);
          } else resetPositions(stateRef.current);
        },
        onWin: () => { stateRef.current.phase = 'won'; setPhase('won'); persistHigh(stateRef.current.score); },
      });
      draw(canvasRef.current, stateRef.current);
      setTick((t) => t + 1);
      if (stateRef.current.phase === 'playing') rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
  }, []);

  // Touch controls
  const dpadPress = (dir: Dir) => () => { stateRef.current.player.pendingDir = dir; };

  return (
    <div
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        background: 'rgba(2, 6, 23, 0.88)',
        backdropFilter: 'blur(8px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '20px',
      }}
    >
      <div style={{
        background: '#020617',
        border: '1px solid rgba(99,102,241,0.3)',
        borderRadius: 12,
        boxShadow: '0 0 80px rgba(37, 99, 235, 0.35)',
        padding: 16,
        maxWidth: W + 32,
        width: '100%',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <div>
            <div style={{ fontFamily: 'monospace', fontSize: 11, color: '#60a5fa', letterSpacing: '0.2em', textTransform: 'uppercase' }}>
              ▶ Easter Egg
            </div>
            <div style={{ fontFamily: 'monospace', fontWeight: 800, fontSize: 22, color: '#e2e8f0', letterSpacing: '0.05em' }}>
              PAC<span style={{ color: '#facc15' }}>SYNC</span>
            </div>
          </div>
          <button onClick={onClose} style={{
            background: 'transparent', border: '1px solid rgba(148,163,184,0.3)', color: '#94a3b8',
            padding: '6px 12px', borderRadius: 6, cursor: 'pointer', fontFamily: 'monospace', fontSize: 12,
          }}>ESC</button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6, marginBottom: 10 }}>
          <Stat label="ROWS" value={String(score)} accent="#facc15" />
          <Stat label="HIGH" value={String(highScore)} accent="#22d3ee" />
          <Stat label="LEFT" value={String(stateRef.current.remainingDots)} accent="#3b82f6" />
          <Stat label="LIVES" value={'●'.repeat(Math.max(0, lives)).padEnd(3, '·')} accent={lives <= 1 ? '#ef4444' : '#22c55e'} />
        </div>

        <div style={{ position: 'relative', background: '#000', borderRadius: 6, overflow: 'hidden', border: '1px solid rgba(99,102,241,0.2)' }}>
          <canvas
            ref={canvasRef}
            width={W}
            height={H}
            style={{ display: 'block', width: '100%', maxHeight: '72vh', imageRendering: 'pixelated' }}
          />
          {phase === 'won' && <Overlay tone="win" title="SYNC COMPLETE" subtitle={`All rows ingested. Final: ${score}`} action="Run again" onAction={restart} />}
          {phase === 'lost' && <Overlay tone="lose" title="CONNECTOR PAUSED" subtitle={`Schema drift caught up. Synced ${score} rows.`} action="Resume sync" onAction={restart} />}
        </div>

        <div className="ps-touch" style={{ display: 'none', marginTop: 10, gridTemplateColumns: '1fr 1fr 1fr', gap: 6 }}>
          <div></div>
          <TouchBtn label="▲" onPress={dpadPress('up')} />
          <div></div>
          <TouchBtn label="◀" onPress={dpadPress('left')} />
          <TouchBtn label="▼" onPress={dpadPress('down')} />
          <TouchBtn label="▶" onPress={dpadPress('right')} />
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 10, fontFamily: 'monospace', fontSize: 10, color: '#64748b' }}>
          <span>↑↓←→ / WASD — move · P — pause · ESC — exit</span>
          <span style={{ color: '#475569' }}>v1 · eat clean rows, dodge dirty data</span>
        </div>

        <style>{`
          @media (hover: none) and (pointer: coarse) {
            .ps-touch { display: grid !important; }
          }
        `}</style>
      </div>
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent: string }) {
  return (
    <div style={{ background: '#0f172a', border: '1px solid rgba(99,102,241,0.15)', padding: '6px 8px', borderRadius: 6, fontFamily: 'monospace' }}>
      <div style={{ color: '#475569', fontSize: 9, letterSpacing: '0.15em', fontWeight: 700 }}>{label}</div>
      <div style={{ color: accent, fontSize: 16, fontWeight: 800, letterSpacing: 1 }}>{value}</div>
    </div>
  );
}
function Overlay({ tone, title, subtitle, action, onAction }: { tone: 'win' | 'lose'; title: string; subtitle: string; action: string; onAction: () => void }) {
  return (
    <div style={{
      position: 'absolute', inset: 0, background: 'rgba(2,6,23,0.85)',
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      gap: 12, padding: 20, textAlign: 'center',
    }}>
      <div style={{
        fontFamily: 'monospace', fontWeight: 800, fontSize: 28, letterSpacing: '0.08em',
        color: tone === 'win' ? '#22c55e' : '#ef4444',
        textShadow: tone === 'win' ? '0 0 20px rgba(34,197,94,0.5)' : '0 0 20px rgba(239,68,68,0.5)',
      }}>{title}</div>
      <div style={{ fontFamily: 'monospace', color: '#94a3b8', fontSize: 13 }}>{subtitle}</div>
      <button onClick={onAction} style={{
        marginTop: 8,
        background: tone === 'win' ? '#22c55e' : '#facc15',
        color: '#020617', fontWeight: 800, fontFamily: 'monospace',
        padding: '10px 18px', borderRadius: 6, border: 'none', cursor: 'pointer',
        letterSpacing: '0.1em', textTransform: 'uppercase',
      }}>{action}</button>
    </div>
  );
}
function TouchBtn({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <button onPointerDown={onPress} style={{
      background: '#1e293b', border: '1px solid rgba(99,102,241,0.3)', color: '#e2e8f0',
      padding: '14px 0', borderRadius: 6, fontFamily: 'monospace', fontWeight: 800, fontSize: 18,
      touchAction: 'manipulation', userSelect: 'none',
    }}>{label}</button>
  );
}

// ============================================================
// Game state
// ============================================================

interface GameState {
  grid: CellType[][]; // [row][col]
  player: Entity & { mouthAngle: number };
  ghosts: Ghost[];
  remainingDots: number;
  frightenedUntil: number;
  score: number;
  lives: number;
  phase: 'playing' | 'won' | 'lost';
  paused: boolean;
  invulnerableUntil: number;
  spawn: { player: { x: number; y: number }; ghosts: { x: number; y: number } };
}

function initialState(): GameState {
  const grid: CellType[][] = [];
  let pdX = 0, pdY = 0, gdX = 0, gdY = 0;
  let dots = 0;
  for (let r = 0; r < ROWS; r++) {
    const row: CellType[] = [];
    for (let c = 0; c < COLS; c++) {
      const ch = MAZE[r][c];
      switch (ch) {
        case '#': row.push('wall'); break;
        case '.': row.push('dot'); dots++; break;
        case 'o': row.push('power'); dots++; break;
        case '-': row.push('door'); break;
        case 'P': row.push('empty'); pdX = c; pdY = r; break;
        case 'G': row.push('empty'); gdX = c; gdY = r; break;
        default:  row.push('empty');
      }
    }
    grid.push(row);
  }

  const mkGhost = (name: Ghost['name'], color: string, offsetX: number, homeX: number, homeY: number): Ghost => ({
    name, color,
    tx: gdX + offsetX, ty: gdY,
    px: (gdX + offsetX) * TILE + TILE / 2, py: gdY * TILE + TILE / 2,
    dir: Math.random() < 0.5 ? 'left' : 'right',
    speed: 1.4,
    state: 'chase',
    homeTile: { x: homeX, y: homeY },
  });

  return {
    grid,
    player: {
      tx: pdX, ty: pdY,
      px: pdX * TILE + TILE / 2, py: pdY * TILE + TILE / 2,
      dir: 'none', speed: 1.8, mouthAngle: 0.25,
    },
    ghosts: [
      mkGhost('NULL',  '#ef4444', -1, COLS - 1, 0),         // top-right home
      mkGhost('DUPE',  '#f472b6',  0, 0,        0),         // top-left
      mkGhost('STALE', '#22d3ee',  1, COLS - 1, ROWS - 1),  // bottom-right
      mkGhost('DRIFT', '#fb923c',  0, 0,        ROWS - 1),  // bottom-left  (overlap fine; one tile offset)
    ],
    remainingDots: dots,
    frightenedUntil: 0,
    score: 0,
    lives: 3,
    phase: 'playing',
    paused: false,
    invulnerableUntil: 0,
    spawn: { player: { x: pdX, y: pdY }, ghosts: { x: gdX, y: gdY } },
  };
}

function resetPositions(s: GameState) {
  s.player.tx = s.spawn.player.x;
  s.player.ty = s.spawn.player.y;
  s.player.px = s.spawn.player.x * TILE + TILE / 2;
  s.player.py = s.spawn.player.y * TILE + TILE / 2;
  s.player.dir = 'none';
  s.player.pendingDir = undefined;
  s.ghosts.forEach((g, i) => {
    g.tx = s.spawn.ghosts.x + (i - 1);
    g.ty = s.spawn.ghosts.y;
    g.px = g.tx * TILE + TILE / 2;
    g.py = g.ty * TILE + TILE / 2;
    g.dir = Math.random() < 0.5 ? 'left' : 'right';
    g.state = 'chase';
  });
  s.frightenedUntil = 0;
  s.invulnerableUntil = performance.now() + 1500;
}

function keyToDir(k: string): Dir | null {
  if (k === 'arrowup' || k === 'w') return 'up';
  if (k === 'arrowdown' || k === 's') return 'down';
  if (k === 'arrowleft' || k === 'a') return 'left';
  if (k === 'arrowright' || k === 'd') return 'right';
  return null;
}

function dirVec(d: Dir): { dx: number; dy: number } {
  switch (d) {
    case 'up': return { dx: 0, dy: -1 };
    case 'down': return { dx: 0, dy: 1 };
    case 'left': return { dx: -1, dy: 0 };
    case 'right': return { dx: 1, dy: 0 };
    default: return { dx: 0, dy: 0 };
  }
}

function isPassable(grid: CellType[][], tx: number, ty: number, allowDoor = false): boolean {
  // Tunnel wrap on row index — left/right tunnel rows
  if (ty < 0 || ty >= ROWS) return false;
  if (tx < 0 || tx >= COLS) return true; // tunnel
  const c = grid[ty][tx];
  if (c === 'wall') return false;
  if (c === 'door' && !allowDoor) return false;
  return true;
}

function step(
  s: GameState,
  dt: number,
  cb: { onScore: (n: number) => void; onLife: () => void; onWin: () => void },
) {
  if (s.phase !== 'playing' || s.paused) return;

  // Player movement
  moveEntity(s.player, s.grid, dt, false);
  // Animate mouth
  s.player.mouthAngle = 0.05 + 0.22 * Math.abs(Math.sin(performance.now() / 100));

  // Eat dots
  const ptx = Math.round((s.player.px) / TILE - 0.5);
  const pty = Math.round((s.player.py) / TILE - 0.5);
  if (ptx >= 0 && ptx < COLS && pty >= 0 && pty < ROWS) {
    const cell = s.grid[pty][ptx];
    if (cell === 'dot') {
      s.grid[pty][ptx] = 'empty';
      s.remainingDots -= 1;
      cb.onScore(POINTS_DOT);
    } else if (cell === 'power') {
      s.grid[pty][ptx] = 'empty';
      s.remainingDots -= 1;
      cb.onScore(POINTS_POWER);
      s.frightenedUntil = performance.now() + FRIGHTENED_MS;
      for (const g of s.ghosts) if (g.state !== 'eaten') g.state = 'frightened';
    }
  }

  if (s.remainingDots <= 0) { cb.onWin(); return; }

  // Ghost AI
  const frightened = performance.now() < s.frightenedUntil;
  if (!frightened) {
    for (const g of s.ghosts) if (g.state === 'frightened') g.state = 'chase';
  }
  for (const g of s.ghosts) updateGhost(g, s, frightened);

  // Player vs ghost collisions
  const invuln = performance.now() < s.invulnerableUntil;
  if (!invuln) {
    for (const g of s.ghosts) {
      const dx = g.px - s.player.px;
      const dy = g.py - s.player.py;
      if (dx * dx + dy * dy < (TILE * 0.55) ** 2) {
        if (g.state === 'frightened') {
          cb.onScore(POINTS_GHOST);
          g.state = 'eaten';
          // Send back to ghost house
          g.tx = s.spawn.ghosts.x; g.ty = s.spawn.ghosts.y;
          g.px = g.tx * TILE + TILE / 2; g.py = g.ty * TILE + TILE / 2;
          setTimeout(() => { g.state = 'chase'; }, 1500);
        } else if (g.state === 'chase') {
          cb.onLife();
          return;
        }
      }
    }
  }
}

function moveEntity(e: Entity, grid: CellType[][], dt: number, isGhost: boolean) {
  // Try to apply pending direction at tile center
  const centerX = e.tx * TILE + TILE / 2;
  const centerY = e.ty * TILE + TILE / 2;
  const onCenterX = Math.abs(e.px - centerX) < 0.5;
  const onCenterY = Math.abs(e.py - centerY) < 0.5;

  if (e.pendingDir && onCenterX && onCenterY) {
    const v = dirVec(e.pendingDir);
    if (isPassable(grid, e.tx + v.dx, e.ty + v.dy, isGhost)) {
      e.dir = e.pendingDir;
      e.pendingDir = undefined;
    }
  }

  // Move in current direction; if blocked at tile center, stop
  const v = dirVec(e.dir);
  if (v.dx === 0 && v.dy === 0) return;
  if (onCenterX && onCenterY) {
    // Snap and check next tile
    e.px = centerX; e.py = centerY;
    if (!isPassable(grid, e.tx + v.dx, e.ty + v.dy, isGhost)) {
      e.dir = 'none';
      return;
    }
  }

  e.px += v.dx * e.speed * dt;
  e.py += v.dy * e.speed * dt;

  // Update tile when we cross center
  if (v.dx !== 0) {
    const nextTx = Math.floor((e.px) / TILE);
    if (nextTx !== e.tx && isPassable(grid, nextTx, e.ty, isGhost)) e.tx = nextTx;
  }
  if (v.dy !== 0) {
    const nextTy = Math.floor((e.py) / TILE);
    if (nextTy !== e.ty && isPassable(grid, e.tx, nextTy, isGhost)) e.ty = nextTy;
  }

  // Tunnel wrap (horizontal)
  if (e.px < 0) { e.px = W; e.tx = COLS - 1; }
  if (e.px > W) { e.px = 0; e.tx = 0; }
}

function updateGhost(g: Ghost, s: GameState, frightened: boolean) {
  const dt = 1; // tied to per-frame already in moveEntity
  // Target tile
  const target = (() => {
    if (g.state === 'eaten') return { x: s.spawn.ghosts.x, y: s.spawn.ghosts.y };
    if (frightened) return g.homeTile; // run to corners
    switch (g.name) {
      case 'NULL':  return { x: s.player.tx, y: s.player.ty }; // direct chase
      case 'DUPE': {
        const v = dirVec(s.player.dir);
        return { x: s.player.tx + v.dx * 4, y: s.player.ty + v.dy * 4 };
      }
      case 'STALE': return g.homeTile;
      case 'DRIFT': {
        const dx = g.tx - s.player.tx; const dy = g.ty - s.player.ty;
        const dist = dx * dx + dy * dy;
        return dist < 64 ? g.homeTile : { x: s.player.tx, y: s.player.ty };
      }
    }
  })();

  // At tile centers, pick the best valid direction toward target
  const centerX = g.tx * TILE + TILE / 2;
  const centerY = g.ty * TILE + TILE / 2;
  const onCenterX = Math.abs(g.px - centerX) < 0.5;
  const onCenterY = Math.abs(g.py - centerY) < 0.5;
  if (onCenterX && onCenterY) {
    const opposite = oppositeDir(g.dir);
    const candidates: Dir[] = ['up', 'right', 'down', 'left'];
    let best: Dir | null = null;
    let bestDist = Infinity;
    for (const d of candidates) {
      if (d === opposite) continue;
      const v = dirVec(d);
      if (!isPassable(s.grid, g.tx + v.dx, g.ty + v.dy, true)) continue;
      const nx = g.tx + v.dx, ny = g.ty + v.dy;
      const dist = (nx - target.x) ** 2 + (ny - target.y) ** 2;
      if (dist < bestDist) { bestDist = dist; best = d; }
    }
    if (frightened && best) {
      // Pick random valid direction in frightened mode for more chaos
      const opts: Dir[] = [];
      for (const d of candidates) {
        if (d === opposite) continue;
        const v = dirVec(d);
        if (isPassable(s.grid, g.tx + v.dx, g.ty + v.dy, true)) opts.push(d);
      }
      if (opts.length) best = opts[Math.floor(Math.random() * opts.length)];
    }
    if (best) g.dir = best;
  }
  g.speed = frightened ? 1.0 : g.state === 'eaten' ? 2.6 : 1.5;
  moveEntity(g, s.grid, dt, true);
}

function oppositeDir(d: Dir): Dir {
  switch (d) {
    case 'up': return 'down';
    case 'down': return 'up';
    case 'left': return 'right';
    case 'right': return 'left';
    default: return 'none';
  }
}

// ============================================================
// Rendering
// ============================================================

function draw(canvas: HTMLCanvasElement | null, s: GameState) {
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  ctx.fillStyle = '#000010';
  ctx.fillRect(0, 0, W, H);

  // Walls
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const cell = s.grid[r][c];
      const x = c * TILE, y = r * TILE;
      if (cell === 'wall') {
        ctx.fillStyle = '#0c1b3a';
        ctx.fillRect(x, y, TILE, TILE);
        ctx.strokeStyle = '#2563eb';
        ctx.lineWidth = 1.5;
        ctx.strokeRect(x + 2, y + 2, TILE - 4, TILE - 4);
      } else if (cell === 'door') {
        ctx.fillStyle = '#f472b6';
        ctx.fillRect(x + 2, y + TILE / 2 - 1, TILE - 4, 2);
      } else if (cell === 'dot') {
        ctx.fillStyle = '#e2e8f0';
        ctx.beginPath();
        ctx.arc(x + TILE / 2, y + TILE / 2, 2, 0, Math.PI * 2);
        ctx.fill();
      } else if (cell === 'power') {
        const pulse = 3 + Math.sin(performance.now() / 200) * 1.5;
        ctx.fillStyle = '#22d3ee';
        ctx.beginPath();
        ctx.arc(x + TILE / 2, y + TILE / 2, pulse, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = 'rgba(34,211,238,0.3)';
        ctx.beginPath();
        ctx.arc(x + TILE / 2, y + TILE / 2, pulse + 3, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  // Ghosts
  for (const g of s.ghosts) drawGhost(ctx, g, performance.now() < s.frightenedUntil);
  // Player
  const invuln = performance.now() < s.invulnerableUntil;
  if (!invuln || Math.floor(performance.now() / 100) % 2 === 0) {
    drawPlayer(ctx, s.player);
  }

  if (s.paused) {
    ctx.fillStyle = 'rgba(2,6,23,0.6)';
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#60a5fa';
    ctx.font = '800 28px ui-monospace, Menlo, monospace';
    ctx.textAlign = 'center';
    ctx.fillText('PAUSED', W / 2, H / 2);
    ctx.font = '11px ui-monospace, Menlo, monospace';
    ctx.fillStyle = '#94a3b8';
    ctx.fillText('press P to resume', W / 2, H / 2 + 22);
    ctx.textAlign = 'left';
  }
}

function drawPlayer(ctx: CanvasRenderingContext2D, p: GameState['player']) {
  const r = TILE * 0.42;
  const angle = (() => {
    switch (p.dir) {
      case 'right': return 0;
      case 'down': return Math.PI / 2;
      case 'left': return Math.PI;
      case 'up': return -Math.PI / 2;
      default: return 0;
    }
  })();

  // Fivetran-blue Pac body with mouth wedge
  ctx.fillStyle = '#0073ea';
  ctx.beginPath();
  ctx.moveTo(p.px, p.py);
  ctx.arc(p.px, p.py, r, angle + p.mouthAngle, angle - p.mouthAngle + Math.PI * 2);
  ctx.closePath();
  ctx.fill();

  // Mini Fivetran "F" mark inside the body, offset opposite the mouth so it's
  // never clipped by the mouth wedge. Clip to the body shape so it never leaks
  // out the open side.
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(p.px, p.py);
  ctx.arc(p.px, p.py, r, angle + p.mouthAngle, angle - p.mouthAngle + Math.PI * 2);
  ctx.closePath();
  ctx.clip();

  // F bars — drawn upright regardless of direction so the icon stays readable
  const fx = p.px - 4;
  const fy = p.py - 4;
  ctx.fillStyle = '#ffffff';
  // Vertical stem
  ctx.fillRect(fx, fy, 1.6, 8);
  // Top arm
  ctx.fillRect(fx, fy, 7, 1.6);
  // Middle arm
  ctx.fillRect(fx, fy + 3.4, 5, 1.6);
  ctx.restore();

  // Cyan accent dot — Fivetran "data flow" mark
  ctx.fillStyle = '#22d3ee';
  ctx.beginPath();
  ctx.arc(p.px + 3, p.py - 3, 1.4, 0, Math.PI * 2);
  ctx.fill();
}

function drawGhost(ctx: CanvasRenderingContext2D, g: Ghost, frightenedActive: boolean) {
  const r = TILE * 0.42;
  const flash = frightenedActive && (performance.now() / 200) % 1 < 0.5;
  const body = g.state === 'eaten' ? null
    : g.state === 'frightened' ? (flash ? '#e2e8f0' : '#1d4ed8')
    : g.color;
  if (body) {
    ctx.fillStyle = body;
    // Body: rounded top, scalloped bottom
    ctx.beginPath();
    ctx.arc(g.px, g.py - 1, r, Math.PI, 0);
    ctx.lineTo(g.px + r, g.py + r);
    // scallops
    const step = r * 2 / 4;
    for (let i = 0; i < 4; i++) {
      const cx = g.px + r - step * (i * 2 + 1);
      ctx.quadraticCurveTo(cx + step / 2, g.py + r * 0.6, cx, g.py + r);
    }
    ctx.lineTo(g.px - r, g.py - 1);
    ctx.closePath();
    ctx.fill();
  }
  // Eyes
  const eyeOff = dirVec(g.dir);
  const ex1 = g.px - 4 + eyeOff.dx * 1.5, ex2 = g.px + 4 + eyeOff.dx * 1.5;
  const ey = g.py - 2 + eyeOff.dy * 1.5;
  ctx.fillStyle = '#fff';
  ctx.beginPath(); ctx.arc(ex1, ey, 2.8, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(ex2, ey, 2.8, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = g.state === 'frightened' && !flash ? '#fff' : '#0a0a0a';
  ctx.beginPath(); ctx.arc(ex1 + eyeOff.dx * 1.4, ey + eyeOff.dy * 1.4, 1.4, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(ex2 + eyeOff.dx * 1.4, ey + eyeOff.dy * 1.4, 1.4, 0, Math.PI * 2); ctx.fill();

  // Label below
  if (g.state !== 'eaten') {
    ctx.fillStyle = g.state === 'frightened' ? '#cbd5e1' : g.color;
    ctx.font = '700 8px ui-monospace, Menlo, monospace';
    ctx.textAlign = 'center';
    ctx.fillText(g.name, g.px, g.py + r + 8);
    ctx.textAlign = 'left';
  }
}
