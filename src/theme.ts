import type { Theme } from './types';

const KEY = 'sabertooth-theme';

/** Dark is the default; light is opt-in. Mirrors the bootstrap script in index.html. */
export function loadTheme(): Theme {
  try {
    return localStorage.getItem(KEY) === 'light' ? 'light' : 'dark';
  } catch {
    return 'dark';
  }
}

export function applyTheme(t: Theme): void {
  const root = document.documentElement;
  if (t === 'light') root.setAttribute('data-theme', 'light');
  else root.removeAttribute('data-theme');
  try {
    localStorage.setItem(KEY, t);
  } catch {
    /* private mode — theme just won't persist */
  }
}
