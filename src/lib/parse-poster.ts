/**
 * The poster template language.
 *
 * A poster is written as plain lines so it can be drafted anywhere — a Discord
 * message, a notes app — and pasted in. Nothing here invents content: the
 * parser only sorts lines into headings, rows and paragraphs, and the renderer
 * draws exactly what was written, in the order it was written.
 *
 *   @key: value     poster settings. title, subtitle, footer and background
 *                   are known; anything else is carried through as metadata.
 *                   Commas in an @ line are ordinary text.
 *   @background:    the picture behind everything, as an uploaded image URL.
 *   @columns: A, B  names the columns for every row after it, until changed.
 *   @panel          starts another parchment. Panels sit side by side.
 *   @width: 420     how wide each parchment is; left out, they share.
 *   @gap: 120       how far apart they stand, which is how far each one
 *                   sits from the middle of the poster.
 *   # Text          starts a section inside the current parchment.
 *   a, b, c         a row, split on commas. A cell that needs a comma goes in
 *                   "double quotes".
 *   > Text          a paragraph.
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

/** One torn parchment. Several sit side by side across the poster. */
export interface PosterPanel {
  /** A heading on its own strip above this parchment, if it was given one. */
  title: string;
  /** Anything written before the first heading in this parchment. */
  blocks: PosterBlock[];
  sections: PosterSection[];
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
  /** URL of the picture behind the poster, blank for a plain ground. */
  background: string;
  /** How wide each parchment should be, in poster points. 0 lets them share
   *  the full width, which is what they did before anyone could say. */
  panelWidth: number;
  /** How far apart the parchments stand, in poster points. With two of them
   *  that is how far each sits from the middle. -1 keeps the usual spacing. */
  panelGap: number;
  meta: PosterMeta[];
  panels: PosterPanel[];
}

/** The poster is this many points across; a width given as a percentage is
 *  read against it. */
export const POSTER_POINTS = 1280;

/** `420` is poster points, `35%` is a share of the width; NaN if it's neither. */
function readPoints(value: string): number {
  const text = value.trim();
  const pct = /^(\d+(?:\.\d+)?)\s*%$/.exec(text);
  const raw = pct ? (Number(pct[1]) / 100) * POSTER_POINTS : Number(text);
  return Number.isFinite(raw) ? raw : NaN;
}

/** `@width: 420` is points, `@width: 35%` is a share of the poster. Anything
 *  unreadable leaves the parchments sharing the width as before. */
export function readWidth(value: string): number {
  const raw = readPoints(value);
  if (!(raw > 0)) return 0;
  return Math.round(Math.min(POSTER_POINTS, Math.max(140, raw)));
}

/** `@gap: 120` is how far apart the parchments stand. Nothing readable, or a
 *  negative number, leaves the spacing alone. Zero puts them edge to edge. */
export function readGap(value: string): number {
  const raw = readPoints(value);
  if (!(raw >= 0)) return -1;
  return Math.round(Math.min(POSTER_POINTS, raw));
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

const emptyPanel = (title = ''): PosterPanel => ({ title, blocks: [], sections: [] });

export function parsePoster(src: string): Poster {
  const poster: Poster = {
    title: '', subtitle: '', footer: '', background: '',
    panelWidth: 0, panelGap: -1, meta: [], panels: [],
  };
  let columns: string[] = [];
  let panel = emptyPanel();
  let section: PosterSection | null = null;
  // The run of rows being gathered. Anything that isn't another row ends it,
  // so a paragraph or a change of columns starts a fresh table rather than
  // silently joining rows that were never meant to line up.
  let table: PosterTable | null = null;

  poster.panels.push(panel);
  const into = () => (section ? section.blocks : panel.blocks);

  for (const raw of src.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('//')) continue;

    if (line.startsWith('@')) {
      const at = line.indexOf(':');
      const key = (at >= 0 ? line.slice(1, at) : line.slice(1)).trim().toLowerCase();
      const value = at >= 0 ? line.slice(at + 1).trim() : '';
      if (key === 'columns') { columns = splitCells(value).filter(Boolean); table = null; }
      else if (key === 'panel') {
        // Whatever follows the colon titles the parchment: `@panel: Weapons`.
        panel = emptyPanel(value);
        poster.panels.push(panel);
        section = null;
        table = null;
      }
      else if (key === 'width') poster.panelWidth = readWidth(value);
      else if (key === 'gap') poster.panelGap = readGap(value);
      else if (key === 'title') poster.title = value;
      else if (key === 'subtitle') poster.subtitle = value;
      else if (key === 'footer') poster.footer = value;
      else if (key === 'background') poster.background = value;
      else if (key) poster.meta.push({ key, value });
      continue;
    }

    if (line.startsWith('#')) {
      section = { heading: line.replace(/^#+/, '').trim(), blocks: [] };
      panel.sections.push(section);
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

  // An opening `@panel`, or a poster of nothing but settings, leaves empties.
  // A titled one is kept — the title is content in its own right.
  poster.panels = poster.panels.filter((p) => (
    p.blocks.length > 0 || p.sections.length > 0 || p.title !== ''
  ));
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

/** Every row the poster holds, for a count worth showing in the editor. */
export function countRows(poster: Poster): number {
  const inBlocks = (blocks: PosterBlock[]) =>
    blocks.reduce((n, b) => n + (b.kind === 'table' ? b.rows.length : 0), 0);
  return poster.panels.reduce((n, p) => (
    n + inBlocks(p.blocks) + p.sections.reduce((m, s) => m + inBlocks(s.blocks), 0)
  ), 0);
}

export const countSections = (poster: Poster) =>
  poster.panels.reduce((n, p) => n + p.sections.length, 0);

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

  for (const panel of poster.panels) {
    if (panel.title) out.push('', `**${panel.title}**`);
    for (const b of panel.blocks) { out.push(''); block(b); }
    for (const s of panel.sections) {
      out.push('', `**${s.heading}**`);
      for (const b of s.blocks) block(b);
    }
  }
  if (poster.footer) out.push('', poster.footer);

  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}
