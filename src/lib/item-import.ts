/**
 * Filling the item list from what the guild has already written down.
 *
 * Two sources say what exists in Keizaal: the price sheet (the Ledger) and the
 * blacksmith recipe doc. Both name things the base game has never heard of, and
 * both name plenty of things the catalogue already has. The work here is
 * deciding what is genuinely new — matching loosely enough that "Nails" and
 * "Nail" are the same item, while keeping the two sources' own categories.
 */

import { RECIPES } from '@/recipes';
import { catalogueName, isTradeable, priceOf, tidyCategory } from '@/lib/prices';
import type { Price } from '@/types';

export interface Candidate {
  name: string;
  category: string;
  /** Septims, when the source knew a price. Shown so junk is easy to spot. */
  each: number;
}

/**
 * A name reduced to what makes it the same item as another.
 *
 * Punctuation and case go, and so does a trailing plural — the recipe doc says
 * "Nails" where the catalogue says "Nail", and adding both would leave two
 * entries for one thing in every picker. Words ending "ss" are left alone so
 * Glass doesn't become Glas.
 */
export function norm(raw: string): string {
  const base = raw.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
  return base
    .split(' ')
    .map((w) => (w.length > 3 && w.endsWith('s') && !w.endsWith('ss') ? w.slice(0, -1) : w))
    .join(' ');
}

/**
 * Categories that are the same idea spelled two ways.
 *
 * Only true synonyms: the price sheet groups armour by material — Iron,
 * Orichalcum, Stormcloak, Bosmer — and those stay, because that is how a smith
 * looks for them. Light and Heavy Armor stay apart for the same reason.
 */
const SYNONYMS: Record<string, string> = {
  'misc.': 'Misc',
  miscellaneous: 'Misc',
  'tools & miscellaneous': 'Misc',
  potions: 'Potion',
  alchemy: 'Ingredient',
  'alchemy ingredients': 'Ingredient',
  ingredients: 'Ingredient',
  'food/ingredients': 'Food',
  'books and magic': 'Scroll & Book',
  books: 'Scroll & Book',
  'weapons & ammo': 'Weapon',
  weapons: 'Weapon',
  armour: 'Armor',
  tailoring: 'Clothing',
  jewellery: 'Jewelry',
};

export function canonCategory(raw: string): string {
  const t = raw.trim();
  if (!t) return 'Misc';
  return SYNONYMS[t.toLowerCase()] ?? t;
}

/** Drops anything already known, and anything the list already offered. */
function fresh(list: Candidate[], known: Set<string>): Candidate[] {
  const seen = new Set<string>();
  const out: Candidate[] = [];
  for (const c of list) {
    const key = norm(c.name);
    if (!key || seen.has(key) || known.has(key)) continue;
    seen.add(key);
    out.push(c);
  }
  return out;
}

/**
 * Priced rows from the Ledger that aren't in the item list yet.
 *
 * Deliberately narrow: only rows that name one thing and carry a price the
 * guild would actually charge (see isTradeable). The sheet also holds section
 * headers, notes, and rows covering several items at once, and a catalogue full
 * of those is worse than one that is merely incomplete.
 */
export function fromLedger(prices: Price[], known: Set<string>): Candidate[] {
  const list: Candidate[] = [];
  for (const row of prices) {
    if (!isTradeable(row)) continue;
    const m = priceOf(row);
    list.push({
      name: catalogueName(row),
      category: canonCategory(tidyCategory(row)),
      each: m ? m.each : 0,
    });
  }
  return fresh(list, known);
}

/**
 * Everything the recipe doc names: what it makes, and what it makes them from.
 *
 * The crafted items keep the doc's own category. Ingredients are filed under
 * Smithing, which is where the built-in catalogue already keeps leather strips
 * and charcoal — but only the ones nothing else has named, since most of them
 * are ingots the catalogue has had all along.
 */
export function fromRecipes(known: Set<string>): Candidate[] {
  const list: Candidate[] = RECIPES.map((r) => ({
    // The smelter's melt recipes are named for the route as well as the
    // product — "Dwarven Metal Ingot — from Large Dwemer Strut" — because six
    // scraps make the same ingot. That distinction belongs to the recipe; the
    // item is just the ingot, and all six collapse onto it here.
    name: r.name.split(' — from ')[0].trim(),
    category: canonCategory(r.category),
    each: 0,
  }));

  // Ingredients after the crafted items, so a thing that is both — an ingot the
  // doc also teaches you to make — keeps its recipe's category.
  for (const r of RECIPES) {
    for (const g of r.ingredients) {
      list.push({ name: g.item.trim(), category: 'Smithing', each: 0 });
    }
  }

  return fresh(list, known);
}
