// Two-theme switch — Fivetran (default) ↔ Snowflake. Flips a data-theme
// attribute on <html> which the CSS variables in index.css listen for.

export type Theme = 'fivetran' | 'snowflake';

const KEY = 'epic-demo:theme';
const listeners = new Set<(t: Theme) => void>();

export function getTheme(): Theme {
  try {
    return (localStorage.getItem(KEY) as Theme) || 'fivetran';
  } catch {
    return 'fivetran';
  }
}

export function setTheme(t: Theme) {
  try { localStorage.setItem(KEY, t); } catch {}
  document.documentElement.setAttribute('data-theme', t);
  listeners.forEach((fn) => fn(t));
}

export function subscribeTheme(fn: (t: Theme) => void): () => void {
  listeners.add(fn);
  fn(getTheme());
  return () => listeners.delete(fn);
}

// Apply theme on app boot so initial paint uses the saved choice.
export function applyInitialTheme() {
  document.documentElement.setAttribute('data-theme', getTheme());
}
