import { DEFAULT_GUILD_CUT_PCT } from '@/types';
import type { Job } from '@/types';

export interface PayoutRow {
  member: string;
  credited: number; // items that counted toward a target
  surplus: number; // turned in but past the target, or not requested at all
  share: number; // 0..1 of the job's total requirement
  septims: number;
}

export interface PayoutSummary {
  totalRequired: number;
  totalCredited: number;
  completion: number; // 0..1
  reward: number;
  cutPct: number; // the guild's percentage, as applied
  guildCut: number; // septims the guild keeps
  pool: number; // septims available to players when the job is fully done
  paid: number; // septims earned so far
  unearned: number; // pool - paid, still outstanding
  rows: PayoutRow[];
}

/**
 * Splits a collection job's septim reward across contributors.
 *
 * The guild keeps `cutPct` (20% by default, set per guild), so the player pool
 * is the rest. A member who delivers 10% of what the job asked for earns 10% of
 * that pool — meaning a finished job pays out the whole pool, and a
 * half-finished one pays half, with the remainder left unearned rather than
 * being shared out early.
 *
 * Credit is capped per item at the requested quantity and awarded oldest
 * turn-in first, so nobody is paid for surplus the job never asked for. Items
 * that were not requested at all earn nothing. Both show as `surplus`.
 */
export function computePayout(job: Job, cutPct = DEFAULT_GUILD_CUT_PCT): PayoutSummary {
  const targets = new Map<string, number>();
  for (const t of job.items) {
    const key = t.item.trim().toLowerCase();
    if (key && t.qty > 0) targets.set(key, (targets.get(key) || 0) + t.qty);
  }

  const totalRequired = [...targets.values()].reduce((s, v) => s + v, 0);
  const remaining = new Map(targets);

  const credited = new Map<string, number>();
  const surplus = new Map<string, number>();
  const bump = (m: Map<string, number>, k: string, v: number) => m.set(k, (m.get(k) || 0) + v);

  // Oldest first, so credit goes to whoever actually filled the order.
  const entries = job.entries
    .map((e, i) => ({ e, i }))
    .sort((a, b) => (a.e.at || '').localeCompare(b.e.at || '') || a.i - b.i);

  for (const { e } of entries) {
    const who = e.by.trim() || 'Unknown';
    const key = e.item.trim().toLowerCase();
    const qty = Math.max(0, e.qty);
    const room = remaining.get(key) ?? 0;
    const take = Math.min(qty, room);
    if (take > 0) {
      bump(credited, who, take);
      remaining.set(key, room - take);
    }
    if (qty - take > 0) bump(surplus, who, qty - take);
  }

  const reward = Math.max(0, Number(job.reward) || 0);
  const pct = Math.min(100, Math.max(0, Number(cutPct) || 0));
  const guildCut = reward * (pct / 100);
  const pool = reward - guildCut;

  const names = new Set([...credited.keys(), ...surplus.keys()]);
  const rows: PayoutRow[] = [...names]
    .map((member) => {
      const got = credited.get(member) || 0;
      const share = totalRequired > 0 ? got / totalRequired : 0;
      return {
        member,
        credited: got,
        surplus: surplus.get(member) || 0,
        share,
        septims: Math.round(share * pool),
      };
    })
    .sort((a, b) => b.septims - a.septims || b.credited - a.credited || a.member.localeCompare(b.member));

  const totalCredited = [...credited.values()].reduce((s, v) => s + v, 0);
  const paid = rows.reduce((s, r) => s + r.septims, 0);

  return {
    totalRequired,
    totalCredited,
    completion: totalRequired > 0 ? totalCredited / totalRequired : 0,
    reward,
    cutPct: pct,
    guildCut: Math.round(guildCut),
    pool: Math.round(pool),
    paid,
    unearned: Math.max(0, Math.round(pool) - paid),
    rows,
  };
}
