/**
 * Reads a Discord job-board or storage post into a draft record.
 *
 * The board has no fixed format — some posts use the long "Name of Client:"
 * template, some the short "Name : / Place : / Reward :" one, and storage posts
 * are often two lines of prose. So this recognises labels loosely and never
 * insists: whatever it can't work out is left blank for the person importing to
 * fill in, and everything it does work out lands in the normal form for review
 * rather than being saved behind their back.
 */

import type { CollectionTarget } from '@/types';

export interface JobDraft {
  kind: 'job';
  name: string;
  client: string;
  contact: string;
  faction: string;
  description: string;
  reward: number;
  items: CollectionTarget[];
  itemRewards: CollectionTarget[];
  deadlineText: string;
  /** Fields the text didn't answer, so the dialog can say what to check. */
  missing: string[];
}

export interface BarrelDraft {
  kind: 'barrel';
  owner: string;
  guildMember: boolean;
  paid: boolean;
  rate: number;
  notes: string;
  missing: string[];
}

export type Draft = JobDraft | BarrelDraft;

const clean = (v: string) => v.replace(/\s+/g, ' ').trim();
const lower = (v: string) => clean(v).toLowerCase();

/** Splits "Label : value" — tolerant of the spaced colons the board uses. */
function labelled(line: string): { label: string; value: string } | null {
  const m = /^\s*[-*•]?\s*([A-Za-z][A-Za-z '/]{2,90}?)\s*:\s*(.*)$/.exec(line);
  if (!m) return null;
  return { label: lower(m[1]), value: clean(m[2]) };
}

/** First label whose text contains one of `keys`. */
function pick(rows: Array<{ label: string; value: string }>, ...keys: string[]): string {
  for (const k of keys) {
    const hit = rows.find((r) => r.label.includes(k) && r.value !== '');
    if (hit) return hit.value;
  }
  return '';
}

const NUM = /\d[\d,]*/;
const toNum = (v: string) => Number((NUM.exec(v)?.[0] ?? '').replace(/,/g, '')) || 0;

/**
 * One line of a quantity list. The board writes these three ways:
 *   "300 Imp Stool"   "charcoal x1000"   "Imp Stool - 300"
 * Anything without a number is not a quantity line at all.
 */
export function parseQtyLine(raw: string): CollectionTarget | null {
  const line = clean(raw).replace(/^[-*•]\s*/, '');
  if (!line || /^[a-z ]{0,20}:/i.test(line) === false && !NUM.test(line)) return null;

  let m = /^(\d[\d,]*)\s*x?\s+(.+)$/i.exec(line); // 300 Imp Stool / 300x Imp Stool
  if (m) return target(m[2], m[1]);

  m = /^(.+?)\s*[x×]\s*(\d[\d,]*)$/i.exec(line); // charcoal x1000
  if (m) return target(m[1], m[2]);

  m = /^(.+?)\s*[-–—:]\s*(\d[\d,]*)$/.exec(line); // Imp Stool - 300
  if (m) return target(m[1], m[2]);

  return null;
}

function target(name: string, qty: string): CollectionTarget | null {
  const item = clean(name).replace(/[.,;]+$/, '');
  if (!item || item.length > 80) return null;
  return { item: titled(item), qty: Math.max(1, Number(qty.replace(/,/g, '')) || 1) };
}

/** "300 imp stool" reads better in the list as "Imp Stool". Words already
 *  carrying capitals are left alone, so "Cure disease Potions" survives. */
const titled = (v: string) =>
  /[A-Z]/.test(v) ? v : v.replace(/\b[a-z]/g, (c) => c.toUpperCase());

/** The byline Discord puts above every post: name, an OP chip, then a stamp. */
const BYLINE = /\d{1,2}\/\d{1,2}\/\d{2,4}\s+\d{1,2}:\d{2}\s*(?:AM|PM)?|\bOP\b\s+\d/i;
/** Chrome that would otherwise be read as content. */
const NOISE = /^(?:OP|\(?edited\)?|\d{1,2}\/\d{1,2}\/\d{2,4}.*|\d{1,2}:\d{2}\s?(?:AM|PM)?)$/i;

const isChrome = (l: string) => NOISE.test(l) || BYLINE.test(l);

function lines(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((l) => clean(l))
    .filter((l) => l !== '' && !isChrome(l));
}

/**
 * A Discord thread's title sits on its own line above the first byline, and is
 * usually the best name a post has ("Warmaidens - Charcoal").
 */
function threadTitle(text: string): string {
  const raw = text.split(/\r?\n/).map(clean).filter((l) => l !== '');
  const first = raw[0];
  if (!first || first.length > 60 || labelled(first) || isChrome(first)) return '';
  return raw[1] && isChrome(raw[1]) ? first : '';
}

/** A line that only introduces the list under it, e.g. "Quest Reward:". */
const isHeading = (l: string) => /:\s*$/.test(l);

/** Labels carrying post metadata, never a quantity â so "Time limit : 3 days"
 *  isn't read as three of an item called Days. */
const META_LABEL = /time limit|deadline|due|contact|faction|client|place|location|name|posted/;

/** Storage posts read as prose about a container, not as a labelled record. */
function looksLikeStorage(all: string[]): boolean {
  const blob = all.join(' ').toLowerCase();
  if (/\b(collect|reward|client|job request|time limit)\b/.test(blob)) return false;
  return /\b(barrel|chest|dresser|cupboard|sack|strongbox|urn|satchel|rents?|rent)\b/.test(blob);
}

export function parseImport(text: string): Draft {
  const all = lines(text);
  return looksLikeStorage(all) ? parseStorage(all) : parseJob(all, threadTitle(text));
}

function parseJob(all: string[], title = ''): JobDraft {
  const rows = all.map(labelled).filter((r): r is { label: string; value: string } => r !== null);

  const client = pick(rows, 'name of client', 'client', 'name');
  const contact = pick(rows, 'contact', 'where client', 'found upon');
  const faction = pick(rows, 'faction', 'place', 'location');
  const deadlineText = pick(rows, 'time limit', 'deadline', 'due');

  // A "Reward: 800" line is septims; a reward written as a list of items is
  // handled below, so a purely textual reward doesn't become a bogus 0.
  const rewardText = pick(rows, 'reward', 'pay', 'payment');
  const reward = /septim|gold|^\s*\d/i.test(rewardText) ? toNum(rewardText) : 0;

  // Quantity lines are grouped by the heading above them: everything after a
  // "collect the following" heading is wanted, everything after a "reward"
  // heading is offered.
  let bucket: 'items' | 'rewards' = 'items';
  const items: CollectionTarget[] = [];
  const itemRewards: CollectionTarget[] = [];
  const descBits: string[] = [];

  for (const line of all) {
    if (title && line === title) continue; // already the job's name
    const l = lower(line);
    // Only a heading moves the bucket. "Reward : 800" is a septim figure, not
    // the start of a list, so what follows it is still what's being collected.
    if (/reward|payment|offering/.test(l) && isHeading(line)) bucket = 'rewards';
    else if (/collect|gather|bring|deliver|description of job/.test(l)) bucket = 'items';

    const row = labelled(line);
    if (row && META_LABEL.test(row.label)) continue;
    // "Details : charcoal x1000" carries its quantity in the value.
    const qty = parseQtyLine(row && row.value ? row.value : line);
    if (qty) {
      const into = bucket === 'rewards' ? itemRewards : items;
      if (!into.some((t) => t.item.toLowerCase() === qty.item.toLowerCase())) into.push(qty);
      continue;
    }
    if (row && /description|details|notes|request/.test(row.label)) {
      // The value is often just "Collect the following:", which introduces the
      // list rather than describing anything.
      if (row.value && !isHeading(row.value)) descBits.push(row.value);
    }
    else if (!row && line.length > 12) descBits.push(line);
  }

  // A reward of "800" already counted as septims shouldn't also be an item.
  const rewardsOnly = itemRewards.filter((t) => !/^septims?$/i.test(t.item));

  const name = title
    || rows.find((r) => /^(job name|name of job|title|job)$/.test(r.label))?.value || ''
    || (items.length && client ? `${client} — ${items[0].item}` : '')
    || (items.length ? items.map((t) => t.item).slice(0, 2).join(', ') : '')
    || client;

  const missing: string[] = [];
  if (!name) missing.push('job name');
  if (!client) missing.push('client');
  if (!reward && rewardsOnly.length === 0) missing.push('reward');
  if (items.length === 0) missing.push('items to collect');

  return {
    kind: 'job',
    name, client, contact, faction,
    description: descBits.join('\n'),
    reward, items, itemRewards: rewardsOnly, deadlineText, missing,
  };
}

function parseStorage(all: string[]): BarrelDraft {
  const rows = all.map(labelled).filter((r): r is { label: string; value: string } => r !== null);
  const blob = all.join(' ');
  const l = blob.toLowerCase();

  const owner = pick(rows, 'name', 'owner', 'renter', 'member');

  // "Guildmember rate", "Bartender rents for free", "Paid in full through work
  // for the guild" — the three ways the board says who is paying what.
  const guildMember = /guild\s?member|guildmember|for the guild/.test(l);
  const free = /\bfree\b|no charge|free of charge/.test(l);
  const paid = free || /paid in full|paid up|prepaid|paid through/.test(l);

  const rateMatch = /(\d[\d,]*)\s*(?:septims?|s\b|gold)?\s*(?:per|a|\/)\s*week/i.exec(blob)
    ?? /rate\s*:?\s*(\d[\d,]*)/i.exec(blob);
  const rate = free ? 0 : Number((rateMatch?.[1] ?? '').replace(/,/g, '')) || 0;

  // Everything that isn't a label line is the description of where it is.
  const notes = all.filter((line) => {
    const row = labelled(line);
    return !row || (!!row.value && /rate|detail|note|place|location/.test(row.label));
  }).join('\n');

  const missing: string[] = [];
  if (!owner) missing.push('who it belongs to');
  if (!rate && !free) missing.push('weekly rate');

  return { kind: 'barrel', owner, guildMember, paid, rate, notes, missing };
}
