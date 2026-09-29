/**
 * Live countdowns, and the clock-face digits that set them.
 *
 * Two things in the app wait on a timer — a dungeon's loot coming back, a
 * skill's training coming off cooldown — and they read the same way: a clock
 * ticking down to zero, set by typing digits that fill in from the right.
 * Where they differ is grain: a respawn is set to the second, a training
 * cooldown in hours and minutes. That's the one knob here.
 */

import { useEffect, useState } from 'react';

/** What the rightmost pair of typed digits means. */
export type Grain = 'sec' | 'min';

/** Ticks once a second so every countdown on a page moves together, off one
 *  timer instead of one per row. Keep it around the ticking list only — a
 *  form that re-renders every second loses what's being typed into it. */
export function useNow(): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  return now;
}

const pad = (n: number) => String(n).padStart(2, '0');

/** "5:34" while under an hour, "1:05:34" once it isn't, "2d 03:14:07" for
 *  anything that runs multiple days — a clock face, not a rounded-off guess,
 *  since the whole point is to glance at it and read the exact time left. */
export function formatCountdown(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  const days = Math.floor(total / 86400);
  const hours = Math.floor((total % 86400) / 3600);
  const mins = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  if (days > 0) return `${days}d ${pad(hours)}:${pad(mins)}:${pad(secs)}`;
  if (hours > 0) return `${hours}:${pad(mins)}:${pad(secs)}`;
  return `${mins}:${pad(secs)}`;
}

/**
 * The typed digits as a clock face. At `sec` grain "5" → 00:05 and "543" →
 * 05:43; at `min` grain the rightmost pair is minutes, so "230" → 2:30, two
 * and a half hours. Empty until something is typed, so the placeholder shows.
 */
export function formatDigits(digits: string, grain: Grain): string {
  if (!digits) return '';
  if (grain === 'min') {
    const d = digits.padStart(3, '0');
    return `${d.slice(0, -2)}:${d.slice(-2)}`;
  }
  const d = digits.padStart(4, '0');
  const hours = d.slice(0, -4);
  return `${hours ? hours + ':' : ''}${d.slice(-4, -2)}:${d.slice(-2)}`;
}

/** What the typed digits come to in seconds, or null when there's nothing to
 *  read — which leaves a form as a no-op rather than guessing. */
export function parseDigits(digits: string, grain: Grain): number | null {
  if (!digits) return null;
  const total = grain === 'min'
    ? (Number(digits.slice(0, -2)) || 0) * 3600 + (Number(digits.slice(-2)) || 0) * 60
    : (Number(digits.slice(0, -4)) || 0) * 3600
      + (Number(digits.slice(-4, -2)) || 0) * 60
      + (Number(digits.slice(-2)) || 0);
  return total > 0 ? total : null;
}

/** Keeps only the digits, drops leading zeros so "0" then "5" still reads as
 *  five, and caps the length — six digits is longer than any timer here. */
export const onlyDigits = (raw: string) => raw.replace(/\D/g, '').replace(/^0+/, '').slice(-6);

/** "just now" / "12 min ago" / "3 hrs ago" / a date once it's old news.
 *  {@link import('./format').ago} only tells days apart, too coarse next to a
 *  timer that runs in minutes. */
export function sinceShort(iso: string, now: number): string {
  if (!iso) return '';
  const mins = Math.floor((now - new Date(iso).getTime()) / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 48) return `${hours} hr${hours === 1 ? '' : 's'} ago`;
  return new Date(iso).toLocaleDateString();
}
