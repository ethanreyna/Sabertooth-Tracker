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

/** shadcn keys its dark palette off a `dark` class on <html>. */
export function applyTheme(t: Theme): void {
  document.documentElement.classList.toggle('dark', t === 'dark');
  try {
    localStorage.setItem(KEY, t);
  } catch {
    /* private mode — theme just won't persist */
  }
}
