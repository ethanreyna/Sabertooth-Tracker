import type { Theme } from './types';

const KEY = 'sabretooth-theme';
const LEGACY_KEY = 'sabertooth-theme'; // pre-rename spelling

/** Dark is the default; light is opt-in. Mirrors the bootstrap script in index.html. */
export function loadTheme(): Theme {
  try {
    const t = localStorage.getItem(KEY) ?? localStorage.getItem(LEGACY_KEY);
    return t === 'light' ? 'light' : 'dark';
  } catch {
    return 'dark';
  }
}

/** shadcn keys its dark palette off a `dark` class on <html>. */
export function applyTheme(t: Theme): void {
  document.documentElement.classList.toggle('dark', t === 'dark');
  try {
    localStorage.setItem(KEY, t);
    localStorage.removeItem(LEGACY_KEY);
  } catch {
    /* private mode — theme just won't persist */
  }
}
