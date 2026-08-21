export const uid = () => Math.random().toString(36).slice(2, 10);

/** Thousands-separated number, tolerant of undefined/garbage. */
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

export const initials = (name: string) =>
  name.split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase();
