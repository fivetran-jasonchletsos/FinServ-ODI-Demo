// localStorage-backed saved-company list, used by the header star badge
// and the /watchlist page.

const KEY = 'meridian-odi:watchlist';
const listeners = new Set<(ids: string[]) => void>();

export function getWatchlist(): string[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr.filter((x) => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

function save(ids: string[]) {
  try { localStorage.setItem(KEY, JSON.stringify(ids)); } catch {}
  listeners.forEach((fn) => fn(ids));
}

export function add(id: string) {
  const ids = getWatchlist();
  if (ids.includes(id)) return;
  save([id, ...ids]);
}

export function remove(id: string) {
  save(getWatchlist().filter((x) => x !== id));
}

export function toggle(id: string) {
  const ids = getWatchlist();
  if (ids.includes(id)) remove(id);
  else add(id);
}

export function has(id: string): boolean {
  return getWatchlist().includes(id);
}

export function subscribe(fn: (ids: string[]) => void): () => void {
  listeners.add(fn);
  fn(getWatchlist());
  return () => listeners.delete(fn);
}
