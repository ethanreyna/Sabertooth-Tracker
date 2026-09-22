/**
 * Reading a Skyrim inventory screen back into item rows.
 *
 * The vision model is asked for "item name | count" lines, but the client
 * accepts the shapes the game itself uses — "Iron Ingot (24)", "24x Iron
 * Ingot" — and plain transcriptions too, so pasted text works the same way
 * a screenshot does. Names are then matched against what the guild already
 * knows, since a bank line that says "Iron Ingots" and a catalogue that says
 * "Iron Ingot" would count as two things forever after.
 */

export interface InventoryLine {
  name: string;
  qty: number;
}

/** Category tabs and readouts the menu shows that aren't items. */
const NOT_ITEMS = new Set([
  'all', 'favorites', 'favourites', 'weapons', 'apparel', 'potions', 'scrolls', 'food',
  'ingredients', 'books', 'keys', 'misc', 'miscellaneous', 'inventory', 'container', 'take all',
  'weight', 'value', 'damage', 'armor', 'armour', 'carry weight', 'gold', 'septims',
]);

const norm = (s: string) => s.trim().replace(/\s+/g, ' ').toLowerCase();

/** Turns transcribed text into item rows, merging repeats of the same name. */
export function parseInventory(text: string): InventoryLine[] {
  const by = new Map<string, InventoryLine>();
  for (const raw of text.split(/\r?\n/)) {
    // Bullets, list numbers and table pipes from a chatty transcription.
    const line = raw.replace(/^[\s\-•*·]+/, '').replace(/^\d+[.)]\s+/, '').trim();
    if (!line) continue;

    let name = '';
    let qty = 1;
    let m: RegExpExecArray | null;
    if ((m = /^(.+?)\s*\|\s*(\d[\d,]*)\s*$/.exec(line))) {
      // "Iron Ingot | 24" — the shape the Worker asks for.
      [, name] = m; qty = num(m[2]);
    } else if ((m = /^(.+?)\s*\((\d[\d,]*)\)\s*$/.exec(line))) {
      // "Iron Ingot (24)" — the game's own.
      [, name] = m; qty = num(m[2]);
    } else if ((m = /^(.+?)\s+[x×]\s*(\d[\d,]*)\s*$/i.exec(line))) {
      // "Iron Ingot x24"
      [, name] = m; qty = num(m[2]);
    } else if ((m = /^(\d[\d,]*)\s*[x×]?\s+(.+)$/.exec(line))) {
      // "24x Iron Ingot", "24 Iron Ingot"
      qty = num(m[1]); name = m[2];
    } else {
      name = line;
    }

    name = name.replace(/[|:]+$/, '').trim();
    // A bare number, a heading, or a readout like "Weight 12.5" is not an item.
    if (!name || /^\d[\d.,]*$/.test(name) || NOT_ITEMS.has(norm(name))) continue;
    if (/^(weight|value|damage|armou?r|carry weight)\b/i.test(name)) continue;
    if (qty < 1) qty = 1;

    const key = norm(name);
    const row = by.get(key) ?? { name: name.trim(), qty: 0 };
    row.qty += qty;
    by.set(key, row);
  }
  return [...by.values()];
}

const num = (s: string) => Math.max(0, Math.round(Number(s.replace(/,/g, '')) || 0));

export type Confidence = 'exact' | 'close' | 'none';

export interface Match {
  /** The known name to file this under — or the transcribed one, when nothing fits. */
  name: string;
  confidence: Confidence;
}

/** Plurals and apostrophes, which the game and the model both play loose
 *  with — "Orc's Tusk" comes back as "Orcs Tusk" as often as not. */
const stem = (s: string) => norm(s).replace(/['’]/g, '').replace(/(ies)$/, 'y').replace(/(s|es)$/, '');

/**
 * Finds the guild's name for a transcribed one. Exact first; then the same
 * thing with a plural or an apostrophe worn off; then the shortest known name
 * that contains, or is contained by, what was read — "Ingot, Iron" against
 * "Iron Ingot" is a stretch, but "Potion of Minor Healing" against "Minor
 * Healing Potion" isn't, and the row is marked so someone looks.
 */
export function matchItem(read: string, known: string[]): Match {
  const n = norm(read);
  const exact = known.find((k) => norm(k) === n);
  if (exact) return { name: exact, confidence: 'exact' };

  const st = stem(read);
  const stemmed = known.find((k) => stem(k) === st);
  if (stemmed) return { name: stemmed, confidence: 'close' };

  const loose = known
    .filter((k) => { const kn = norm(k); return kn.length >= 4 && (kn.includes(n) || n.includes(kn)); })
    .sort((a, b) => a.length - b.length)[0];
  if (loose) return { name: loose, confidence: 'close' };

  return { name: read.trim(), confidence: 'none' };
}
