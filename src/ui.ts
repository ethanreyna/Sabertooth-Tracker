import type { CSSProperties } from 'react';

export const C = {
  border: 'hsl(220 13% 91%)',
  border2: 'hsl(220 13% 93%)',
  border3: 'hsl(220 13% 95%)',
  muted: 'hsl(240 4.8% 95.9%)',
  mutedFg: 'hsl(240 3.8% 46.1%)',
  fg2: 'hsl(240 5.3% 26.1%)',
  primary: 'hsl(240 5.9% 10%)',
  primaryFg: 'hsl(0 0% 98%)',
  red: 'hsl(0 84.2% 60.2%)',
  redDark: 'hsl(0 74% 42%)',
  green: 'hsl(142 76% 36%)',
  amber: 'hsl(38 92% 50%)',
};

export const card: CSSProperties = {
  background: '#fff',
  border: '1px solid ' + C.border,
  borderRadius: 12,
  boxShadow: '0 1px 2px 0 rgb(0 0 0 / 0.05)',
};

export const input: CSSProperties = {
  height: 34,
  border: '1px solid ' + C.border,
  borderRadius: 6,
  padding: '0 10px',
  background: '#fff',
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
  boxShadow: '0 1px 2px 0 rgb(0 0 0 / 0.05)',
};

export const btnOutline: CSSProperties = {
  height: 34,
  padding: '0 14px',
  border: '1px solid ' + C.border,
  background: '#fff',
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

export const sectionLabel: CSSProperties = {
  fontSize: 11,
  fontWeight: 600,
  color: C.mutedFg,
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
  marginBottom: 4,
};

export const statusStyles: Record<string, CSSProperties> = {
  open: badge('hsl(142 76% 96%)', 'hsl(142 76% 26%)', 'hsl(142 50% 80%)'),
  claimed: badge('hsl(38 92% 95%)', 'hsl(38 92% 25%)', 'hsl(38 80% 75%)'),
  done: badge('hsl(240 4.8% 95.9%)', 'hsl(240 3.8% 46.1%)', 'hsl(220 13% 88%)'),
};

export const prioStyles: Record<string, CSSProperties> = {
  Low: badge('hsl(0 0% 99%)', 'hsl(240 3.8% 46.1%)', 'hsl(220 13% 91%)'),
  Normal: badge('hsl(0 0% 99%)', 'hsl(240 5.3% 26.1%)', 'hsl(220 13% 91%)'),
  High: badge('hsl(38 92% 95%)', 'hsl(38 92% 25%)', 'hsl(38 80% 75%)'),
  Urgent: badge('hsl(0 84% 97%)', 'hsl(0 74% 42%)', 'hsl(0 70% 85%)'),
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
