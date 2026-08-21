import type { CSSProperties } from 'react';

// Every colour is a CSS custom property defined in index.html, so the whole app
// re-themes when `data-theme` flips on <html> — no React re-render required.
export const C = {
  bg: 'var(--bg)',
  surface: 'var(--surface)',
  surface2: 'var(--surface2)',
  border: 'var(--border)',
  border2: 'var(--border2)',
  border3: 'var(--border3)',
  muted: 'var(--muted)',
  mutedFg: 'var(--muted-fg)',
  fg: 'var(--fg)',
  fg2: 'var(--fg2)',
  primary: 'var(--primary)',
  primaryFg: 'var(--primary-fg)',
  accent: 'var(--accent)',
  accentFg: 'var(--accent-fg)',
  red: 'var(--red)',
  redDark: 'var(--red-dark)',
  green: 'var(--green)',
  amber: 'var(--amber)',
  amberFg2: 'var(--amber-fg2)',
  overlay: 'var(--overlay)',
  shadow: 'var(--shadow)',
  shadowLg: 'var(--shadow-lg)',
};

/** Badge colour triples: [background, foreground, border]. */
export const tone = {
  green: ['var(--green-bg)', 'var(--green-fg)', 'var(--green-bd)'] as const,
  amber: ['var(--amber-bg)', 'var(--amber-fg)', 'var(--amber-bd)'] as const,
  red: ['var(--red-bg)', 'var(--red-fg)', 'var(--red-bd)'] as const,
  blue: ['var(--blue-bg)', 'var(--blue-fg)', 'var(--blue-bd)'] as const,
  neutral: ['var(--neutral-bg)', 'var(--neutral-fg)', 'var(--neutral-bd)'] as const,
};

export const card: CSSProperties = {
  background: C.surface,
  border: '1px solid ' + C.border,
  borderRadius: 12,
  boxShadow: C.shadow,
};

export const input: CSSProperties = {
  height: 34,
  border: '1px solid ' + C.border,
  borderRadius: 6,
  padding: '0 10px',
  background: C.surface,
  color: C.fg,
  fontSize: 13,
  fontWeight: 400,
};

export const select: CSSProperties = { ...input, padding: '0 8px' };

export const field: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 4,
  fontSize: 12,
  fontWeight: 500,
};

export const btnPrimary: CSSProperties = {
  height: 34,
  padding: '0 14px',
  background: C.primary,
  color: C.primaryFg,
  border: 0,
  borderRadius: 6,
  fontSize: 13,
  fontWeight: 500,
  cursor: 'pointer',
  boxShadow: C.shadow,
};

export const btnOutline: CSSProperties = {
  height: 34,
  padding: '0 14px',
  border: '1px solid ' + C.border,
  background: C.surface,
  color: C.fg,
  borderRadius: 6,
  fontSize: 13,
  fontWeight: 500,
  cursor: 'pointer',
};

export const badge = (bg: string, fg: string, bd: string): CSSProperties => ({
  fontSize: 11,
  fontWeight: 500,
  padding: '2px 8px',
  borderRadius: 6,
  background: bg,
  color: fg,
  border: '1px solid ' + bd,
  flex: 'none',
  textTransform: 'capitalize',
});

/** badge() from a `tone` triple. */
export const toneBadge = (t: readonly [string, string, string]): CSSProperties => badge(t[0], t[1], t[2]);

export const sectionLabel: CSSProperties = {
  fontSize: 11,
  fontWeight: 600,
  color: C.mutedFg,
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
  marginBottom: 4,
};

export const statusStyles: Record<string, CSSProperties> = {
  open: toneBadge(tone.green),
  claimed: toneBadge(tone.amber),
  done: toneBadge(tone.neutral),
};

export const prioStyles: Record<string, CSSProperties> = {
  Low: badge(C.surface2, C.mutedFg, C.border),
  Normal: badge(C.surface2, C.fg2, C.border),
  High: toneBadge(tone.amber),
  Urgent: toneBadge(tone.red),
};

export const emptyState: CSSProperties = {
  background: C.surface,
  border: '1px dashed ' + C.border,
  borderRadius: 12,
  padding: 40,
  textAlign: 'center',
  color: C.mutedFg,
};

export const uid = () => Math.random().toString(36).slice(2, 10);

export const sep = (n: number | string | undefined) => Number(n || 0).toLocaleString();

export const dstr = (iso: string) =>
  iso ? new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : '';

export function ago(iso: string): string {
  if (!iso) return '';
  const dd = Math.floor((Date.now() - new Date(iso).getTime()) / 864e5);
  if (dd <= 0) return 'today';
  if (dd === 1) return 'yesterday';
  if (dd < 30) return dd + ' days ago';
  return new Date(iso).toLocaleDateString();
}
