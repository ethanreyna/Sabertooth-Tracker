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

/** Words that carry no meaning for telling items apart: the game writes
 *  "Spell Tome: Calm", the sheet "Spell Tome Of Calm", and they're one thing. */
const STOP = new Set(['of', 'the', 'a', 'an']);

/** A name as the words that matter, lowercased, punctuation and filler gone. */
const words = (s: string): string[] => s
  .toLowerCase()
  .replace(/['’]/g, '')
  .replace(/[^a-z0-9]+/g, ' ')
  .trim()
  .split(' ')
  .filter((w) => w && !STOP.has(w));

/** A word with its plural worn off — "Ingots" → "ingot", but "Glass" stays. */
const stemWord = (w: string) => (w.endsWith('ss') ? w : w.replace(/ies$/, 'y').replace(/(es|s)$/, ''));

/**
 * Finds the guild's name for a transcribed one.
 *
 * Exact first. Then the same words in the same order once punctuation and
 * filler are gone — that's still exact, it's the same item written two ways.
 * Then the same words with plurals worn off, marked close. Then the best
 * overlap by words: a known name that has every word that was read (and a
 * few more) beats one that has only some of them, so "Spell Tome: Calm" lands
 * on "Spell Tome Of Calm" and not on the bare "Spell Tome" that also sits in
 * the catalogue. A known name that's merely a fragment of what was read has
 * to cover most of it, or the row is left unmatched rather than filed under
 * something too generic.
 */
export function matchItem(read: string, known: string[]): Match {
  const n = norm(read);
  const exact = known.find((k) => norm(k) === n);
  if (exact) return { name: exact, confidence: 'exact' };

  const rw = words(read);
  if (rw.length === 0) return { name: read.trim(), confidence: 'none' };
  const rkey = rw.join(' ');
  const same = known.find((k) => words(k).join(' ') === rkey);
  if (same) return { name: same, confidence: 'exact' };

  const rstem = rw.map(stemWord).join(' ');
  const stemmed = known.find((k) => words(k).map(stemWord).join(' ') === rstem);
  if (stemmed) return { name: stemmed, confidence: 'close' };

  const rset = new Set(rw.map(stemWord));
  let best: { name: string; score: number } | null = null;
  for (const k of known) {
    const kw = words(k).map(stemWord);
    if (kw.length === 0) continue;
    const kset = new Set(kw);
    const shared = kw.filter((w) => rset.has(w)).length;
    let score = 0;
    if (shared === rset.size) {
      // The known name says everything that was read, and then some.
      score = 1 + shared / kset.size;
    } else if (shared === kset.size && shared / rset.size >= 0.75) {
      // The known name is a fragment of what was read; only a big one counts.
      score = shared / rset.size;
    }
    if (score > 0 && (!best || score > best.score || (score === best.score && k.length < best.name.length))) {
      best = { name: k, score };
    }
  }
  if (best) return { name: best.name, confidence: 'close' };

  return { name: read.trim(), confidence: 'none' };
}
