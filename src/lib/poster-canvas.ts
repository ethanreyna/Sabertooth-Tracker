/**
 * Drawing a poster onto a canvas, so it can be saved as a picture.
 *
 * A third way of setting the same parsed poster, next to the sheet on screen
 * and the plain text for Discord. Painting it rather than photographing the
 * page is deliberate: the DOM-to-image libraries choke on the colour space
 * Tailwind 4 emits, and they'd be a dependency carried for one button. Here
 * the output is exact, needs nothing, and can be drawn at any scale.
 *
 * Everything is measured before anything is painted, by running the whole
 * layout twice against the same code — once to total the height, once for
 * real. The two passes can't drift apart because there is only one of them.
 */

import { formatCell, formatQty, isQtyColumn, numericColumns, qtyWorthShowing } from './parse-poster';
import type { Poster, PosterBlock, PosterSection, PosterTable } from './parse-poster';

const W = 900; // sheet width, in CSS pixels
const PAD = 56;
const GUTTER = 40;

const PAPER = '#faf7f0';
const INK = '#1c1917';
const BODY = '#4a423b';
const MUTED = '#6b625a';
const FAINT = '#8a7f70';
const RULE = '#cdc3b4';

// Georgia rather than the `ui-serif` the sheet would prefer: canvas drops a
// whole font string it can't parse, silently keeping the last one, and Georgia
// is everywhere. The sheet uses the same stack so the two match.
export const POSTER_SERIF = 'Georgia, "Times New Roman", serif';
const font = (spec: string) => `${spec} ${POSTER_SERIF}`;

const LINE = { title: 34, subtitle: 20, meta: 16, heading: 20, colhead: 15, row: 20, para: 20 };

/** Paints only when it's for real; measures either way. */
interface Pen {
  ctx: CanvasRenderingContext2D;
  dry: boolean;
}

const text = (pen: Pen, s: string, x: number, y: number, align: CanvasTextAlign = 'left') => {
  if (pen.dry) return;
  pen.ctx.textAlign = align;
  pen.ctx.fillText(s, x, y);
};

const rule = (pen: Pen, x: number, y: number, width: number, colour: string, thickness = 1) => {
  if (pen.dry) return;
  pen.ctx.fillStyle = colour;
  pen.ctx.fillRect(x, y, width, thickness);
};

function wrap(ctx: CanvasRenderingContext2D, body: string, max: number): string[] {
  const words = body.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = '';
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (!line || ctx.measureText(next).width <= max) line = next;
    else { lines.push(line); line = word; }
  }
  if (line) lines.push(line);
  return lines;
}

/** Cuts a label that won't fit, so a long name can't run under the prices. */
function clip(ctx: CanvasRenderingContext2D, body: string, max: number): string {
  if (ctx.measureText(body).width <= max) return body;
  let cut = body;
  while (cut.length > 1 && ctx.measureText(`${cut}…`).width > max) cut = cut.slice(0, -1);
  return `${cut}…`;
}

/** What each cell of a table says once the template's rules are applied. */
function cellsOf(table: PosterTable) {
  const qty = table.columns.findIndex(isQtyColumn);
  const showQty = qty >= 0 && qtyWorthShowing(table, qty);
  const width = Math.max(table.columns.length, ...table.rows.map((r) => r.length), 0);
  const keep = Array.from({ length: width }, (_, i) => !(i === qty && !showQty));
  const rows = table.rows.map((row) => Array.from({ length: width }, (_, i) => (
    i === qty ? formatQty(row[i] ?? '') : formatCell(row[i] ?? '')
  )));
  return { qty, keep, width, rows, numeric: numericColumns(table) };
}

/**
 * One table. The first column takes what's left; the rest are measured across
 * every row and set hard against the right edge, so figures line up down the
 * page the way a price list has to.
 */
function drawTable(pen: Pen, table: PosterTable, x: number, top: number, width: number): number {
  const { ctx } = pen;
  const { qty, keep, width: cols, rows, numeric } = cellsOf(table);
  if (rows.length === 0) return 0;

  const fontFor = (i: number) => font(i === qty ? '12px' : '15px');
  const gap = 12;

  // Widest each trailing column ever needs, header included.
  const widths: number[] = [];
  for (let i = 1; i < cols; i++) {
    if (!keep[i]) { widths[i] = 0; continue; }
    let w = 0;
    ctx.font = fontFor(i);
    for (const row of rows) w = Math.max(w, ctx.measureText(row[i] ?? '').width);
    if (table.columns[i] && !isQtyColumn(table.columns[i])) {
      ctx.font = font('600 10px');
      w = Math.max(w, ctx.measureText(table.columns[i].toUpperCase()).width);
    }
    widths[i] = w;
  }
  const trailing = widths.reduce((n, w, i) => n + (keep[i] && w > 0 ? w + gap : 0), 0);
  const firstWidth = Math.max(60, width - trailing);

  // Right edge of each trailing column, laid out from the right.
  const right: number[] = [];
  let edge = x + width;
  for (let i = cols - 1; i >= 1; i--) {
    if (!keep[i] || widths[i] === 0) { right[i] = edge; continue; }
    right[i] = edge;
    edge -= widths[i] + gap;
  }

  let y = top;
  const headed = table.columns.length > 0;
  if (headed) {
    y += LINE.colhead;
    ctx.font = font('600 10px');
    if (!pen.dry) pen.ctx.fillStyle = FAINT;
    if (keep[0] && table.columns[0]) text(pen, table.columns[0].toUpperCase(), x, y);
    for (let i = 1; i < cols; i++) {
      if (!keep[i] || !table.columns[i] || isQtyColumn(table.columns[i])) continue;
      text(pen, table.columns[i].toUpperCase(), right[i], y, 'right');
    }
    y += 5;
    rule(pen, x, y, width, RULE);
    y += 3;
  }

  for (const row of rows) {
    y += LINE.row;
    ctx.font = font('15px');
    if (!pen.dry) pen.ctx.fillStyle = INK;
    if (keep[0]) text(pen, clip(ctx, row[0] ?? '', firstWidth - gap), x, y);
    for (let i = 1; i < cols; i++) {
      if (!keep[i] || !(row[i] ?? '')) continue;
      ctx.font = fontFor(i);
      if (!pen.dry) pen.ctx.fillStyle = i === qty ? FAINT : numeric[i] ? INK : MUTED;
      text(pen, row[i], right[i], y, 'right');
    }
  }

  return y - top;
}

function drawBlocks(pen: Pen, blocks: PosterBlock[], x: number, top: number, width: number): number {
  let y = top;
  for (const block of blocks) {
    if (block.kind === 'table') {
      y += drawTable(pen, block, x, y, width);
      continue;
    }
    pen.ctx.font = font('15px');
    if (!pen.dry) pen.ctx.fillStyle = BODY;
    for (const line of wrap(pen.ctx, block.text, width)) {
      y += LINE.para;
      text(pen, line, x, y);
    }
    y += 4;
  }
  return y - top;
}

function drawSection(pen: Pen, section: PosterSection, x: number, top: number, width: number): number {
  let y = top;
  pen.ctx.font = font('bold 15px');
  if (!pen.dry) pen.ctx.fillStyle = INK;
  y += LINE.heading;
  text(pen, section.heading.toUpperCase(), x, y);
  y += 6;
  rule(pen, x, y, width, RULE);
  y += drawBlocks(pen, section.blocks, x, y, width);
  return y - top + 22;
}

/** Fills the first column to about half the total, so neither runs long. */
function split(heights: number[]): number {
  const total = heights.reduce((n, h) => n + h, 0);
  let used = 0;
  for (let i = 0; i < heights.length; i++) {
    if (used > 0 && used + heights[i] / 2 > total / 2) return i;
    used += heights[i];
  }
  return heights.length;
}

function render(poster: Poster, ctx: CanvasRenderingContext2D, dry: boolean): number {
  const pen: Pen = { ctx, dry };
  const inner = W - PAD * 2;
  let y = PAD;

  if (poster.title) {
    ctx.font = font('bold 30px');
    if (!dry) ctx.fillStyle = INK;
    for (const line of wrap(ctx, poster.title.toUpperCase(), inner)) {
      y += LINE.title;
      text(pen, line, W / 2, y, 'center');
    }
  }
  if (poster.subtitle) {
    ctx.font = font('14px');
    if (!dry) ctx.fillStyle = MUTED;
    for (const line of wrap(ctx, poster.subtitle, inner)) {
      y += LINE.subtitle;
      text(pen, line, W / 2, y, 'center');
    }
  }
  if (poster.meta.length > 0) {
    ctx.font = font('11px');
    if (!dry) ctx.fillStyle = FAINT;
    const label = poster.meta.map((m) => `${m.key}: ${m.value}`).join(' · ').toUpperCase();
    for (const line of wrap(ctx, label, inner)) {
      y += LINE.meta;
      text(pen, line, W / 2, y, 'center');
    }
  }
  y += 16;
  rule(pen, PAD, y, inner, INK, 2);
  y += 10;

  if (poster.blocks.length > 0) y += drawBlocks(pen, poster.blocks, PAD, y, inner) + 10;

  // Two columns once there's more than one section, matching the sheet.
  if (poster.sections.length > 1) {
    const colWidth = (inner - GUTTER) / 2;
    const dryPen: Pen = { ctx, dry: true };
    const heights = poster.sections.map((s) => drawSection(dryPen, s, PAD, 0, colWidth));
    const at = split(heights);

    let left = y;
    let rightY = y;
    poster.sections.forEach((s, i) => {
      if (i < at) left += drawSection(pen, s, PAD, left, colWidth);
      else rightY += drawSection(pen, s, PAD + colWidth + GUTTER, rightY, colWidth);
    });
    y = Math.max(left, rightY);
  } else {
    for (const s of poster.sections) y += drawSection(pen, s, PAD, y, inner);
  }

  if (poster.footer) {
    y += 6;
    rule(pen, PAD, y, inner, INK, 2);
    y += 8;
    ctx.font = font('14px');
    if (!dry) ctx.fillStyle = BODY;
    for (const line of wrap(ctx, poster.footer, inner)) {
      y += LINE.para;
      text(pen, line, W / 2, y, 'center');
    }
  }

  return y + PAD;
}

/** The poster as a canvas, drawn at `scale` for a crisp picture. */
export function posterToCanvas(poster: Poster, scale = 2): HTMLCanvasElement {
  const scratch = document.createElement('canvas').getContext('2d');
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!scratch || !ctx) throw new Error('This browser has no canvas to draw on.');

  const height = render(poster, scratch, true);
  canvas.width = Math.round(W * scale);
  canvas.height = Math.round(height * scale);
  ctx.scale(scale, scale);
  ctx.fillStyle = PAPER;
  ctx.fillRect(0, 0, W, height);
  ctx.textBaseline = 'alphabetic';
  render(poster, ctx, false);
  return canvas;
}

/** A filename from the title: "Spell Tomes For Sale" -> spell-tomes-for-sale.png */
export function posterFilename(poster: Poster): string {
  const slug = poster.title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  return `${slug || 'poster'}.png`;
}
