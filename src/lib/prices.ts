/**
 * Reading money out of the guild's price sheet.
 *
 * The sheet is written by people, for people: a price might be "250", "5g",
 * "1g for 10", "1500-3000", "N/A" or "#DIV/0!", and which column holds it
 * changes from tab to tab. Everything that has to turn a row into a number
 * lives here so the barter tool and the item importer agree about what a row
 * is worth — and, more importantly, agree about when it is worth nothing
 * knowable and should be left alone.
 */

import type { Recipe } from '@/recipes';
import type { Price } from '@/types';

/** Which side of the counter a value is quoted from. */
export type Basis = 'sell' | 'buy';

/** Column names that mean "what the guild sells it for", best first. */
const SELL_COLUMNS = ['sell', 'price', 'price of 1', 'buy', 'make price', 'price to brew'];
/** …and "what the guild pays for it". "Price of 1" is the sheet's buy column
 *  in all but name; "Make Price" is a crafting fee and comes after it, or an
 *  N/A there (you can't make ore) would read as "don't buy ore". */
const BUY_COLUMNS = ['buy', 'price of 1', 'price to brew', 'make price', 'sell', 'price'];

/** Columns that are never money, whatever they are called. */
const NOT_MONEY = new Set([
  'buy price code', 'stock', 'low', 'high', 'avg', 'profit', 'high demand',
  'ingredients', 'effects', 'potions used in', 'contents', 'details', 'notes', 'level',
]);

export interface Money {
  /** Septims for one of the item. */
  each: number;
  /** The column it came from, so the tool can show its working. */
  from: string;
  /** True when the sheet gave a range and this is the middle of it. */
  approx: boolean;
}

/**
 * What one cell says. Three answers, and the difference between the last two
 * is the whole point: a blank (or a dash, or a formula error) means nobody
 * has written a price yet, while "N/A" or "No" means somebody has — the guild
 * doesn't deal in this, on this side of the counter — and a trade built on
 * it should be stopped, not quietly priced off another column.
 */
export type Cell = { kind: 'blank' } | { kind: 'refused' } | { kind: 'money'; money: Money };

const REFUSED = /^(n\/?a|no|none|nope|never|not (for )?sale|not sold|not bought|don'?t|do not)$/i;
const BLANK = /^(tbd|\?+|[-–—]+|#\w+[!?]?|true|false)$/i;

export function readCell(raw: string): Cell {
  const t = (raw || '').trim();
  if (!t || BLANK.test(t)) return { kind: 'blank' };
  if (REFUSED.test(t)) return { kind: 'refused' };

  // "1g for 10" — a price for a bundle, so divide it out.
  const bundle = /^([\d.,]+)\s*g?\s*(?:for|per|\/)\s*([\d.,]+)\b/i.exec(t);
  if (bundle) {
    const total = num(bundle[1]);
    const count = num(bundle[2]);
    if (total === null || count === null || count <= 0) return { kind: 'blank' };
    return { kind: 'money', money: { each: total / count, from: '', approx: false } };
  }

  // "1500-3000" — quoted as a range, so take the middle and say so.
  const range = /^([\d.,]+)\s*g?\s*[-–—]\s*([\d.,]+)\s*g?$/.exec(t);
  if (range) {
    const lo = num(range[1]);
    const hi = num(range[2]);
    if (lo === null || hi === null) return { kind: 'blank' };
    return { kind: 'money', money: { each: (lo + hi) / 2, from: '', approx: true } };
  }

  // "250", "5g", "0.25"
  const plain = /^([\d.,]+)\s*g?$/i.exec(t);
  if (plain) {
    const v = num(plain[1]);
    return v === null ? { kind: 'blank' } : { kind: 'money', money: { each: v, from: '', approx: false } };
  }

  return { kind: 'blank' };
}

/** Reads one cell as money. Null for anything that isn't a number the guild
 *  would actually charge — blanks, "N/A", "#DIV/0!", "TRUE", text. */
export function readMoney(raw: string): Money | null {
  const c = readCell(raw);
  return c.kind === 'money' ? c.money : null;
}

const num = (v: string): number | null => {
  const n = Number(v.replace(/,/g, ''));
  return Number.isFinite(n) ? n : null;
};

/** A row's answer on one basis: a price, an explicit refusal (naming the
 *  column that said so), or nothing at all. */
export type Quote = { kind: 'money'; money: Money } | { kind: 'refused'; from: string } | null;

/**
 * Walks the basis's columns in order and takes the first that has anything
 * to say. A refusal stops the walk: the sheet saying "N/A" under Buy is an
 * answer about buying, and falling through to the Sell column would turn a
 * "we don't buy this" into a price.
 */
export function quote(row: Price, basis: Basis = 'sell'): Quote {
  const order = basis === 'buy' ? BUY_COLUMNS : SELL_COLUMNS;
  const entries = Object.entries(row.values ?? {})
    .filter(([label]) => !NOT_MONEY.has(label.trim().toLowerCase()));

  const consider = (label: string, value: string): Quote => {
    const c = readCell(value);
    if (c.kind === 'money') return { kind: 'money', money: { ...c.money, from: label } };
    if (c.kind === 'refused') return { kind: 'refused', from: label };
    return null;
  };

  const seen = new Set<string>();
  for (const want of order) {
    const hit = entries.find(([label]) => label.trim().toLowerCase() === want);
    if (!hit) continue;
    seen.add(hit[0]);
    const q = consider(hit[0], hit[1]);
    if (q) return q;
  }

  // Nothing recognised by name: take the first column that has an answer at
  // all, rather than calling a priced item unpriced.
  for (const [label, value] of entries) {
    if (seen.has(label)) continue;
    const q = consider(label, value);
    if (q) return q;
  }
  return null;
}

/** What one of this row is worth, on the given basis. Null when unpriced —
 *  including when the sheet refuses; see {@link refusedFor} for that case. */
export function priceOf(row: Price, basis: Basis = 'sell'): Money | null {
  const q = quote(row, basis);
  return q?.kind === 'money' ? q.money : null;
}

/** The column that says the guild doesn't deal in this on that basis, or null. */
export function refusedFor(row: Price, basis: Basis): string | null {
  const q = quote(row, basis);
  return q?.kind === 'refused' ? q.from : null;
}

/** The sheet shouts; the app doesn't. "IRON INGOT" -> "Iron Ingot". */
export function tidyName(raw: string): string {
  const t = raw.trim().replace(/\s+/g, ' ');
  if (!t) return '';
  // Already mixed case: the writer meant it, so leave it alone.
  if (/[a-z]/.test(t)) return t;
  return t.toLowerCase().replace(/\b[a-z]/g, (c) => c.toUpperCase());
}

/** Junk that appears in a category column: "FALSE", "-", a repeat of the tab. */
export function tidyCategory(row: Price): string {
  const c = row.category.trim();
  if (!c || /^(false|true|-+|n\/?a)$/i.test(c)) return tidyName(row.tab);
  return tidyName(c);
}

/**
 * Rows a person could actually trade or stock: one named thing, with a price.
 *
 * Deliberately strict. The sheet holds section headers, notes, recipe lines and
 * rows covering several items at once ("WOLF/FOX PELTS"), and every one of them
 * would become a fake item in the catalogue if it were let through.
 */
export function isTradeable(row: Price): boolean {
  const name = row.item.trim();
  if (name.length < 2 || name.length > 44) return false;
  // A slash means the row is really several items priced together.
  if (name.includes('/')) return false;
  // Headers, totals and prose.
  if (/[:()]|^\d|\b(total|notes?|header|example|prices?)\b/i.test(name)) return false;
  if (name.toLowerCase() === row.category.trim().toLowerCase()) return false;
  return priceOf(row, 'sell') !== null || priceOf(row, 'buy') !== null;
}

/** Anything the sheet has an answer for on either side of the counter — a
 *  price, or an explicit N/A. Looser than {@link isTradeable}, because
 *  bartering a row named "STEEL ARROW (80)" is fine when the name is shown as
 *  written, while stocking it as an item is not; and a row the guild refuses
 *  to buy still belongs in the barter list, so the tool can say so. */
export const isPriced = (row: Price): boolean => quote(row, 'sell') !== null || quote(row, 'buy') !== null;

/** Priced rows, one per name, in sheet order — the barter tool's catalogue. */
export function pricedItems(rows: Price[]): Price[] {
  const seen = new Set<string>();
  const out: Price[] = [];
  for (const r of rows) {
    const key = r.item.trim().toLowerCase();
    if (!key || seen.has(key) || !isPriced(r)) continue;
    seen.add(key);
    out.push(r);
  }
  return out;
}

/** A name as a lookup key: trimmed, single-spaced, case-folded. */
export const nameKey = (s: string) => s.trim().replace(/\s+/g, ' ').toLowerCase();

/** Priced rows by {@link nameKey}. First occurrence wins, in sheet order,
 *  the same way {@link pricedItems} dedupes. */
export function priceIndex(rows: Price[]): Map<string, Price> {
  const m = new Map<string, Price>();
  for (const r of pricedItems(rows)) m.set(nameKey(r.item), r);
  return m;
}

export interface IngredientCost {
  item: string;
  qty: number;
  /** Per-unit money, or null when the Ledger has no price for it. */
  each: Money | null;
  /** True when the Ledger says outright that the guild doesn't deal in this
   *  ingredient on this basis — a stronger thing than having no price. */
  refused: boolean;
}

export interface RecipeCost {
  /** Septims for one crafting, counting only the ingredients that have a price. */
  each: number;
  lines: IngredientCost[];
  /** Ingredients the Ledger doesn't price — `each` is short by these. */
  unpriced: string[];
  /** Ingredients the Ledger refuses on this basis. A recipe built on one
   *  can't be honestly priced at all. */
  refused: string[];
  approx: boolean;
}

/**
 * What one crafting of a recipe costs in materials on the given basis: every
 * ingredient looked up in the Ledger and added up, so a sword is its ingots
 * and leather strips at whatever the sheet says today. Ingredients the sheet
 * doesn't price are listed rather than counted as zero, so the total says it
 * is short instead of quietly being wrong. "Gold" as an ingredient is septims
 * themselves and counts at face value without needing a row.
 */
export function recipeCost(recipe: Recipe, index: Map<string, Price>, basis: Basis): RecipeCost {
  const lines = recipe.ingredients.map((g): IngredientCost => {
    if (nameKey(g.item) === 'gold') {
      return { item: g.item, qty: g.qty, each: { each: 1, from: 'septims', approx: false }, refused: false };
    }
    const row = index.get(nameKey(g.item));
    const q = row ? quote(row, basis) : null;
    return {
      item: g.item, qty: g.qty,
      each: q?.kind === 'money' ? q.money : null,
      refused: q?.kind === 'refused',
    };
  });
  return {
    each: lines.reduce((sum, l) => sum + (l.each ? l.each.each * l.qty : 0), 0),
    lines,
    unpriced: lines.filter((l) => !l.each && !l.refused).map((l) => l.item),
    refused: lines.filter((l) => l.refused).map((l) => l.item),
    approx: lines.some((l) => l.each?.approx ?? false),
  };
}

/**
 * The name this row should carry in the item list.
 *
 * The ore and ingot tabs name the material only — "IRON" under a category of
 * "Ore" — which as an item name is ambiguous with the ingot of the same metal.
 * Putting the category back on gives the name the sheet means, and has the
 * useful side effect of matching the built-in catalogue so it dedupes instead
 * of adding a second "Iron".
 */
export function catalogueName(row: Price): string {
  const name = tidyName(row.item);
  const cat = row.category.trim().toLowerCase();
  // String.raw, because in a plain template literal `\b` is a backspace
  // character rather than a word boundary — which quietly yields "Iron Ingot
  // Ingot" instead of matching.
  if ((cat === 'ore' || cat === 'ingot') && !new RegExp(String.raw`\b${cat}\b`, 'i').test(name)) {
    return `${name} ${cat === 'ore' ? 'Ore' : 'Ingot'}`;
  }
  return name;
}
