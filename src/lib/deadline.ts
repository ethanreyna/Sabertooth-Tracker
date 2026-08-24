export type DurationUnit = 'hours' | 'days' | 'weeks' | 'months';

export const DURATION_UNITS: Array<{ value: DurationUnit; label: string }> = [
  { value: 'hours', label: 'hours' },
  { value: 'days', label: 'days' },
  { value: 'weeks', label: 'weeks' },
  { value: 'months', label: 'months' },
];

/** Turns "2 weeks from now" into an absolute ISO deadline. */
export function fromNow(amount: number, unit: DurationUnit): string {
  const n = Math.max(1, Math.floor(amount) || 1);
  const d = new Date();
  if (unit === 'hours') d.setHours(d.getHours() + n);
  else if (unit === 'days') d.setDate(d.getDate() + n);
  else if (unit === 'weeks') d.setDate(d.getDate() + n * 7);
  else d.setMonth(d.getMonth() + n);
  return d.toISOString();
}

/** "3 days left", "due today", "2 days overdue" — for display next to a deadline. */
export function untilLabel(iso: string): { text: string; overdue: boolean; soon: boolean } | null {
  if (!iso) return null;
  const ms = new Date(iso).getTime() - Date.now();
  if (Number.isNaN(ms)) return null;

  const overdue = ms < 0;
  const abs = Math.abs(ms);
  const hours = Math.round(abs / 36e5);
  const days = Math.round(abs / 864e5);

  let span: string;
  if (hours < 1) span = 'less than an hour';
  else if (hours < 36) span = `${hours} hour${hours === 1 ? '' : 's'}`;
  else if (days < 14) span = `${days} days`;
  else {
    const weeks = Math.round(days / 7);
    span = `${weeks} week${weeks === 1 ? '' : 's'}`;
  }

  return {
    text: overdue ? `${span} overdue` : `${span} left`,
    overdue,
    soon: !overdue && abs <= 3 * 864e5,
  };
}

/**
 * Reads a time limit written the way the job board writes it — "3 days",
 * "complete weekly (hand in on Saturday)", "2 weeks" — into the amount/unit
 * pair the form uses. Returns null when it can't tell, which leaves the
 * importer's time limit blank rather than inventing one.
 */
export function durationFromText(text: string): { amount: number; unit: DurationUnit } | null {
  const t = text.toLowerCase();
  if (!t.trim()) return null;

  const m = /(\d+)\s*(hour|day|week|month)/.exec(t);
  if (m) return { amount: Math.max(1, Number(m[1]) || 1), unit: (m[2] + 's') as DurationUnit };

  if (/\bdaily\b|\beach day\b/.test(t)) return { amount: 1, unit: 'days' };
  if (/\bweekly\b|\beach week\b/.test(t)) return { amount: 1, unit: 'weeks' };
  if (/\bmonthly\b/.test(t)) return { amount: 1, unit: 'months' };
  if (/\btomorrow\b/.test(t)) return { amount: 1, unit: 'days' };

  return null;
}
