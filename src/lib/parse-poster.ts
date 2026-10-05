/**
 * The poster template language.
 *
 * A poster is written as plain lines so it can be drafted anywhere — a Discord
 * message, a notes app — and pasted in. Nothing here invents content: the
 * parser only sorts lines into headings, rows and paragraphs, and the renderer
 * lays out exactly what was written, in the order it was written.
 *
 *   @key: value     poster settings. title, subtitle and footer are known;
 *                   anything else is carried through as metadata. Commas in an
 *                   @ line are ordinary text.
 *   @columns: A, B  names the columns for every row after it, until changed.
 *   # Text          starts a section.
 *   a, b, c         a row in the current section, split on commas. A cell that
 *                   needs a comma goes in "double quotes".
 *   > Text          a paragraph in the current section, or up top if there
 *                   isn't one yet.
 *   // Text         a comment, ignored. Blank lines are ignored.
 */

export interface PosterTable {
  kind: 'table';
  /** The columns in force when these rows were written; empty if never named. */
  columns: string[];
  rows: string[][];
}

export interface PosterText {
  kind: 'text';
  text: string;
}

export type PosterBlock = PosterTable | PosterText;

export interface PosterSection {
  heading: string;
  blocks: PosterBlock[];
}

/** An `@key` the poster doesn't know by name, kept so it can still be shown. */
export interface PosterMeta {
  key: string;
  value: string;
}

export interface Poster {
  title: string;
  subtitle: string;
  footer: string;
  meta: PosterMeta[];
  /** Anything written before the first heading. */
  blocks: PosterBlock[];
  sections: PosterSection[];
}

/**
 * One line of comma-separated cells. Double quotes protect a comma inside a
 * cell, and a doubled quote inside those is a literal one.
 */
export function splitCells(line: string): string[] {
  const out: string[] = [];
  let cell = '';
  let quoted = false;

  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (quoted) {
      if (c !== '"') { cell += c; continue; }
      if (line[i + 1] === '"') { cell += '"'; i++; } else quoted = false;
      continue;
    }
    if (c === '"') { quoted = true; continue; }
    if (c === ',') { out.push(cell.trim()); cell = ''; continue; }
    cell += c;
  }
  out.push(cell.trim());
  return out;
}

export function parsePoster(src: string): Poster {
  const poster: Poster = { title: '', subtitle: '', footer: '', meta: [], blocks: [], sections: [] };
  let columns: string[] = [];
  let section: PosterSection | null = null;
  // The run of rows being gathered. Anything that isn't another row ends it,
  // so a paragraph or a change of columns starts a fresh table rather than
  // silently joining rows that were never meant to line up.
  let table: PosterTable | null = null;

  const into = () => (section ? section.blocks : poster.blocks);

  for (const raw of src.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('//')) continue;

    if (line.startsWith('@')) {
      const at = line.indexOf(':');
      const key = (at >= 0 ? line.slice(1, at) : line.slice(1)).trim().toLowerCase();
      const value = at >= 0 ? line.slice(at + 1).trim() : '';
      if (key === 'columns') { columns = splitCells(value).filter(Boolean); table = null; }
      else if (key === 'title') poster.title = value;
      else if (key === 'subtitle') poster.subtitle = value;
      else if (key === 'footer') poster.footer = value;
      else if (key) poster.meta.push({ key, value });
      continue;
    }

    if (line.startsWith('#')) {
      section = { heading: line.replace(/^#+/, '').trim(), blocks: [] };
      poster.sections.push(section);
      table = null;
      continue;
    }

    if (line.startsWith('>')) {
      into().push({ kind: 'text', text: line.slice(1).trim() });
      table = null;
      continue;
    }

    if (!table) {
      table = { kind: 'table', columns, rows: [] };
      into().push(table);
    }
    table.rows.push(splitCells(line));
  }

  return poster;
}

/** A cell that is nothing but a number, set with thousands separators. */
export function formatCell(text: string): string {
  return /^\d+(?:\.\d+)?$/.test(text) ? Number(text).toLocaleString() : text;
}

/** How many of something, when that's worth saying. One of a thing, or a
 *  count nobody wrote, reads better as nothing at all. */
export function formatQty(text: string): string {
  const n = Number(text.trim());
  return Number.isFinite(n) && n > 1 ? `×${n.toLocaleString()}` : '';
}

export const isQtyColumn = (name: string) => name.trim().toLowerCase() === 'qty';

/** Which columns read as figures, so they can be set right the way a price
 *  list is. A column counts as numeric when most of what's in it is a number. */
export function numericColumns(table: PosterTable): boolean[] {
  const width = table.rows.reduce((n, r) => Math.max(n, r.length), table.columns.length);
  return Array.from({ length: width }, (_, i) => {
    const filled = table.rows.map((r) => (r[i] ?? '').trim()).filter(Boolean);
    if (filled.length === 0) return false;
    const numbers = filled.filter((c) => /^\d+(?:\.\d+)?$/.test(c)).length;
    return numbers * 2 >= filled.length;
  });
}

/** True when a Qty column has anything worth printing — all-ones is an empty
 *  column with a heading over it. */
export function qtyWorthShowing(table: PosterTable, index: number): boolean {
  return table.rows.some((r) => formatQty(r[index] ?? '') !== '');
}

/**
 * The poster as plain text, for pasting somewhere that won't take a picture —
 * which, for this guild, is usually Discord.
 */
export function posterToText(poster: Poster): string {
  const out: string[] = [];
  if (poster.title) out.push(`**${poster.title}**`);
  if (poster.subtitle) out.push(poster.subtitle);
  for (const m of poster.meta) out.push(`${m.key}: ${m.value}`);

  const block = (b: PosterBlock) => {
    if (b.kind === 'text') { out.push(b.text); return; }
    const qty = b.columns.findIndex(isQtyColumn);
    for (const row of b.rows) {
      const parts = row
        .map((cell, i) => (i === qty ? formatQty(cell) : formatCell(cell)))
        .filter((cell) => cell !== '');
      if (parts.length) out.push(parts.join(' — '));
    }
  };

  for (const b of poster.blocks) { block(b); out.push(''); }
  for (const s of poster.sections) {
    out.push('', `**${s.heading}**`);
    for (const b of s.blocks) block(b);
  }
  if (poster.footer) out.push('', poster.footer);

  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}
