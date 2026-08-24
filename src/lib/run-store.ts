import { emptyRun } from '@/types';
import type { DungeonRun, RunEntry } from '@/types';

/**
 * The loot tracker's storage: this browser, and nowhere else.
 *
 * Everything else in the tracker is the guild's shared record, kept on the
 * server so the roster sees one board. A run is the opposite — scratch working
 * for one party while they are inside, thrown away when the loot is split — so
 * it lives in localStorage. Nothing to sync, no conflicts, no version bumps,
 * and a guest can use it as freely as a member.
 */
const KEY = 'sabretooth-run-v1';

const s = (v: unknown, fallback = '') => (typeof v === 'string' ? v : fallback);
const n = (v: unknown, fallback = 0) => (Number.isFinite(Number(v)) ? Number(v) : fallback);
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

/** Coerces whatever is in storage, however old, into a usable run. */
export function normRun(raw: unknown): DungeonRun {
  const x = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;

  const entries = arr(x.entries).map((e): RunEntry => {
    const r = (e || {}) as Record<string, unknown>;
    return {
      id: s(r.id) || Math.random().toString(36).slice(2, 10),
      kind: s(r.kind) === 'item' ? 'item' : 'gold',
      item: s(r.item),
      qty: Math.max(0, n(r.qty)),
      by: s(r.by),
      at: s(r.at),
    };
  }).filter((e) => e.kind === 'gold' || e.item !== '');

  return {
    active: x.active === true,
    name: s(x.name),
    // At least one, always: the split divides by this.
    people: Math.max(1, Math.round(n(x.people, 1)) || 1),
    party: arr(x.party).map((v) => s(v)).filter(Boolean),
    entries,
    startedBy: s(x.startedBy),
    startedAt: s(x.startedAt),
  };
}

export function loadRun(): DungeonRun {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? normRun(JSON.parse(raw)) : emptyRun();
  } catch {
    return emptyRun();
  }
}

export function saveRun(run: DungeonRun): void {
  try {
    if (run.active || run.entries.length) localStorage.setItem(KEY, JSON.stringify(run));
    else localStorage.removeItem(KEY);
  } catch {
    /* private window, or storage full — the run just won't survive a reload */
  }
}
