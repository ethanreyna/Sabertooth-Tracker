import { ENCHANTMENTS } from '@/types';
import type { DB, EnchantmentDef, EnchantmentRecord } from '@/types';

/** One row of the enchantment list, whichever side it came from. */
export interface EnchantmentRow extends EnchantmentDef {
  notes: string;
  /** Empty for the built-in list, which can't be edited away. */
  id: string;
  custom: boolean;
}

const key = (name: string) => name.trim().toLowerCase();

/**
 * The built-in list plus the guild's own, merged by name.
 *
 * A guild entry with the same name as a built-in wins, so a tier or a price can
 * be corrected in the app rather than waiting on a release.
 */
export function enchantments(custom: EnchantmentRecord[]): EnchantmentRow[] {
  const byName = new Map<string, EnchantmentRow>();
  for (const e of ENCHANTMENTS) {
    byName.set(key(e.name), { ...e, notes: '', id: '', custom: false });
  }
  for (const c of custom) {
    const name = c.name.trim();
    if (!name) continue;
    byName.set(key(name), {
      name, tier: c.tier.trim(), cost: c.cost.trim(), notes: c.notes, id: c.id, custom: true,
    });
  }
  return [...byName.values()];
}

/** Names for the pickers, in the order the list is written. */
export const enchantmentNames = (db: DB): string[] =>
  enchantments(db.enchantments).map((e) => e.name);
