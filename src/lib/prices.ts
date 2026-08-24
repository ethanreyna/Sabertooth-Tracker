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

import type { Price } from '@/types';

/** Which side of the counter a value is quoted from. */
export type Basis = 'sell' | 'buy';

/** Column names that mean "what the guild sells it for", best first. */
const SELL_COLUMNS = ['sell', 'price', 'price of 1', 'buy', 'make price', 'price to brew'];
/** …and "what the guild pays for it". */
const BUY_COLUMNS = ['buy', 'price to brew', 'make price', 'price of 1', 'sell', 'price'];

/** Columns that are never money, whatever they are called. */
const NOT_MONEY = new Set([
  'buy price code', 'stock', 'low', 'high', 'avg', 'profit', 'high demand',
  'ingredients', 'effects', 'potions used in', 'contents', 'details', 'notes',
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
 * Reads one cell. Returns null for anything that isn't a number the guild
 * would actually charge — "N/A", "#DIV/0!", "TRUE", blanks and text.
 */
export function readMoney(raw: string): Money | null {
  const t = (raw || '').trim();
  if (!t) return null;
  if (/^(n\/?a|tbd|-+|#\w+[!?]?|true|false)$/i.test(t)) return null;

  // "1g for 10" — a price for a bundle, so divide it out.
  const bundle = /^([\d.,]+)\s*g?\s*(?:for|per|\/)\s*([\d.,]+)\b/i.exec(t);
  if (bundle) {
    const total = num(bundle[1]);
    const count = num(bundle[2]);
    if (total === null || count === null || count <= 0) return null;
    return { each: total / count, from: '', approx: false };
  }

  // "1500-3000" — quoted as a range, so take the middle and say so.
  const range = /^([\d.,]+)\s*g?\s*[-–—]\s*([\d.,]+)\s*g?$/.exec(t);
  if (range) {
    const lo = num(range[1]);
    const hi = num(range[2]);
    if (lo === null || hi === null) return null;
    return { each: (lo + hi) / 2, from: '', approx: true };
  }

  // "250", "5g", "0.25"
  const plain = /^([\d.,]+)\s*g?$/i.exec(t);
  if (plain) {
    const v = num(plain[1]);
    return v === null ? null : { each: v, from: '', approx: false };
  }

  return null;
}

const num = (v: string): number | null => {
  const n = Number(v.replace(/,/g, ''));
  return Number.isFinite(n) ? n : null;
};

/** What one of this row is worth, on the given basis. Null when unpriced. */
export function priceOf(row: Price, basis: Basis = 'sell'): Money | null {
  const order = basis === 'buy' ? BUY_COLUMNS : SELL_COLUMNS;
  const entries = Object.entries(row.values ?? {})
    .filter(([label]) => !NOT_MONEY.has(label.trim().toLowerCase()));

  for (const want of order) {
    const hit = entries.find(([label]) => label.trim().toLowerCase() === want);
    if (!hit) continue;
    const money = readMoney(hit[1]);
    if (money) return { ...money, from: hit[0] };
  }

  // Nothing recognised by name: take the first column that reads as money at
  // all, rather than calling a priced item unpriced.
  for (const [label, value] of entries) {
    const money = readMoney(value);
    if (money) return { ...money, from: label };
  }
  return null;
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
  return priceOf(row) !== null;
}

/** Anything the sheet puts a number against — a looser test than
 *  {@link isTradeable}, because bartering a row named "STEEL ARROW (80)" is
 *  fine when the name is shown as written, while stocking it as an item is not. */
export const isPriced = (row: Price): boolean => priceOf(row) !== null;

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
