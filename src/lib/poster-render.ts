/**
 * Drawing a poster: a picture, with torn parchment laid over it.
 *
 * One renderer, used for both the preview on screen and the saved picture, so
 * what you look at is what you get. It paints rather than photographing the
 * page — the DOM-to-image libraries choke on the colour space Tailwind 4
 * emits, and a canvas can be drawn at any size for a crisp export.
 *
 * Everything is measured before anything is painted by running the same code
 * twice, once dry and once for real, so the two passes can't drift apart.
 */

import { formatCell, formatQty, isQtyColumn, numericColumns, qtyWorthShowing } from './parse-poster';
import type { Poster, PosterBlock, PosterPanel, PosterSection, PosterTable } from './parse-poster';

/** 16:9, the shape these get posted at. Exported at 2x gives 2560x1440. */
export const POSTER_W = 1280;
export const POSTER_H = 720;

const MARGIN = 44;
/** How far apart parchments stand when @gap hasn't said otherwise. */
const GAP = 20;
/** No parchment is squeezed narrower than this, however wide a gap is asked for. */
const MIN_PANEL = 140;
const PAD = 22; // inside a parchment
/** How much width one column of a list wants before a second is worth having. */
const COLUMN_WIDTH = 330;
const COLUMN_GAP = 26;

const INK = '#35200f';
const INK_SOFT = '#6a4726';
const INK_FAINT = '#8a6a44';
const GROUND = '#2b2622';

export const POSTER_SERIF = 'Georgia, "Times New Roman", serif';
const font = (spec: string) => `${spec} ${POSTER_SERIF}`;

const LINE = { subtitle: 30, meta: 20, heading: 26, colhead: 16, row: 23, para: 23 };

/** The sizes @titlesize and @footersize start from, in points. */
const TITLE_PX = 40;
const FOOTER_PX = 16;
/** How much room a line of each wants, as a multiple of its own size, so that
 *  resizing moves the lines apart with the letters rather than cramming them. */
const LEADING = { title: 1.15, panel: 1.267, footer: 1.375 };
const leading = (px: number, of: keyof typeof LEADING) => Math.round(px * LEADING[of]);

interface Pen {
  ctx: CanvasRenderingContext2D;
  dry: boolean;
}

const say = (pen: Pen, s: string, x: number, y: number, align: CanvasTextAlign = 'left') => {
  if (pen.dry) return;
  pen.ctx.textAlign = align;
  pen.ctx.fillText(s, x, y);
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

function clip(ctx: CanvasRenderingContext2D, body: string, max: number): string {
  if (ctx.measureText(body).width <= max) return body;
  let cut = body;
  while (cut.length > 1 && ctx.measureText(`${cut}…`).width > max) cut = cut.slice(0, -1);
  return `${cut}…`;
}

/** Seeded, so a parchment's torn edge is the same every time it's drawn —
 *  a shape that danced about on each keystroke would be unreadable. */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** The outline of a torn sheet: a rectangle whose edges wander. */
function tornOutline(x: number, y: number, w: number, h: number, seed: number): Array<[number, number]> {
  const rough = 6;
  const step = 18;
  const rand = rng(seed);
  const wobble = () => (rand() - 0.5) * 2 * rough;
  const pts: Array<[number, number]> = [];
  for (let p = 0; p < w; p += step) pts.push([x + p, y + wobble()]);
  for (let p = 0; p < h; p += step) pts.push([x + w + wobble(), y + p]);
  for (let p = w; p > 0; p -= step) pts.push([x + p, y + h + wobble()]);
  for (let p = h; p > 0; p -= step) pts.push([x + wobble(), y + p]);
  return pts;
}

function parchment(pen: Pen, x: number, y: number, w: number, h: number, seed: number) {
  if (pen.dry) return;
  const { ctx } = pen;
  const pts = tornOutline(x, y, w, h, seed);
  ctx.beginPath();
  pts.forEach(([px, py], i) => (i ? ctx.lineTo(px, py) : ctx.moveTo(px, py)));
  ctx.closePath();

  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.5)';
  ctx.shadowBlur = 16;
  ctx.shadowOffsetY = 5;
  const grad = ctx.createLinearGradient(x, y, x, y + h);
  grad.addColorStop(0, '#e7c293');
  grad.addColorStop(1, '#cda367');
  ctx.fillStyle = grad;
  ctx.fill();
  ctx.restore();

  ctx.strokeStyle = 'rgba(110,76,38,0.5)';
  ctx.lineWidth = 2;
  ctx.stroke();
}

/** One table, laid out inside a parchment's inner width. */
function table(pen: Pen, t: PosterTable, x: number, top: number, width: number): number {
  const { ctx } = pen;
  const qty = t.columns.findIndex(isQtyColumn);
  const showQty = qty >= 0 && qtyWorthShowing(t, qty);
  const cols = Math.max(t.columns.length, ...t.rows.map((r) => r.length), 0);
  const keep = (i: number) => !(i === qty && !showQty);
  const numeric = numericColumns(t);
  const rows = t.rows.map((row) => Array.from({ length: cols }, (_, i) => (
    i === qty ? formatQty(row[i] ?? '') : formatCell(row[i] ?? '')
  )));
  if (rows.length === 0) return 0;

  const fontFor = (i: number) => font(i === qty ? '600 14px' : '17px');
  const gap = 14;

  const widths: number[] = [];
  for (let i = 1; i < cols; i++) {
    if (!keep(i)) { widths[i] = 0; continue; }
    ctx.font = fontFor(i);
    let w = 0;
    for (const row of rows) w = Math.max(w, ctx.measureText(row[i] ?? '').width);
    const head = t.columns[i];
    if (head && !isQtyColumn(head)) {
      ctx.font = font('700 12px');
      w = Math.max(w, ctx.measureText(head.toUpperCase()).width);
    }
    widths[i] = w;
  }
  const trailing = widths.reduce((n, w, i) => n + (keep(i) && w > 0 ? w + gap : 0), 0);
  const firstWidth = Math.max(50, width - trailing);

  const right: number[] = [];
  let edge = x + width;
  for (let i = cols - 1; i >= 1; i--) {
    right[i] = edge;
    if (keep(i) && widths[i] > 0) edge -= widths[i] + gap;
  }

  let y = top;
  if (t.columns.length > 0) {
    y += LINE.colhead;
    ctx.font = font('700 12px');
    if (!pen.dry) ctx.fillStyle = INK_FAINT;
    if (t.columns[0]) say(pen, t.columns[0].toUpperCase(), x, y);
    for (let i = 1; i < cols; i++) {
      if (!keep(i) || !t.columns[i] || isQtyColumn(t.columns[i])) continue;
      say(pen, t.columns[i].toUpperCase(), right[i], y, 'right');
    }
    y += 4;
    if (!pen.dry) { ctx.fillStyle = 'rgba(110,76,38,0.35)'; ctx.fillRect(x, y, width, 1); }
    y += 4;
  }

  for (const row of rows) {
    y += LINE.row;
    ctx.font = font('17px');
    if (!pen.dry) ctx.fillStyle = INK;
    say(pen, clip(ctx, row[0] ?? '', firstWidth - gap), x, y);
    for (let i = 1; i < cols; i++) {
      if (!keep(i) || !(row[i] ?? '')) continue;
      ctx.font = fontFor(i);
      if (!pen.dry) ctx.fillStyle = i === qty ? INK_FAINT : numeric[i] ? INK : INK_SOFT;
      say(pen, row[i], right[i], y, 'right');
    }
  }
  return y - top;
}

function blocks(pen: Pen, list: PosterBlock[], x: number, top: number, width: number): number {
  let y = top;
  for (const b of list) {
    if (b.kind === 'table') { y += table(pen, b, x, y, width); continue; }
    pen.ctx.font = font('16px');
    if (!pen.dry) pen.ctx.fillStyle = INK_SOFT;
    for (const line of wrap(pen.ctx, b.text, width)) {
      y += LINE.para;
      say(pen, line, x, y);
    }
    y += 4;
  }
  return y - top;
}

/** One section — its heading, a rule under it, and whatever it holds. */
function section(pen: Pen, s: PosterSection, x: number, top: number, width: number): number {
  let y = top;
  pen.ctx.font = font('bold 19px');
  if (!pen.dry) pen.ctx.fillStyle = INK;
  y += LINE.heading;
  say(pen, s.heading.toUpperCase(), x + width / 2, y, 'center');
  y += 5;
  if (!pen.dry) { pen.ctx.fillStyle = 'rgba(110,76,38,0.45)'; pen.ctx.fillRect(x, y, width, 1); }
  y += 3;
  y += blocks(pen, s.blocks, x, y, width);
  return y - top + 12;
}

/** Fills the first column to about half, so neither runs much longer. */
function balance(heights: number[], columns: number): number[] {
  const total = heights.reduce((n, h) => n + h, 0);
  const share = total / columns;
  const at: number[] = [];
  let used = 0;
  let col = 1;
  heights.forEach((h, i) => {
    if (col < columns && used > 0 && used + h / 2 > share * col) { at.push(i); col++; }
    used += h;
  });
  return at;
}

/**
 * A parchment's contents. Sections stack in one column on a narrow parchment,
 * the way the reference posters read; on a wide one they flow into two or
 * three, so a long list stays a poster rather than becoming a scroll.
 */
function panelBody(pen: Pen, panel: PosterPanel, x: number, top: number, width: number): number {
  let y = top;
  y += blocks(pen, panel.blocks, x, y, width);
  if (panel.sections.length === 0) return y - top;
  if (panel.blocks.length > 0) y += 10;

  const columns = Math.max(1, Math.min(3, Math.floor(width / COLUMN_WIDTH), panel.sections.length));
  const colWidth = (width - COLUMN_GAP * (columns - 1)) / columns;

  const heights = panel.sections.map((s) => section({ ctx: pen.ctx, dry: true }, s, 0, 0, colWidth));
  const breaks = columns > 1 ? balance(heights, columns) : [];

  let col = 0;
  let colY = y;
  let deepest = y;
  panel.sections.forEach((s, i) => {
    if (breaks.includes(i)) { col++; colY = y; }
    const cx = x + col * (colWidth + COLUMN_GAP);
    colY += section(pen, s, cx, colY, colWidth);
    deepest = Math.max(deepest, colY);
  });

  return deepest - top;
}

/** A strip of parchment sized to the words on it. */
function strip(
  pen: Pen, lines: string[], x: number, top: number, maxWidth: number,
  lineHeight: number, colour: string, seed: number, align: CanvasTextAlign = 'left',
  underline = false,
): { width: number; height: number } {
  const { ctx } = pen;
  let widest = 0;
  for (const l of lines) widest = Math.max(widest, ctx.measureText(l).width);
  const w = Math.min(maxWidth, widest) + PAD * 2;
  const h = lines.length * lineHeight + 18;

  // x is whichever edge the strip is anchored by: its left, its middle or,
  // for a strip hung off the right of the poster, its right.
  const left = align === 'center' ? x - w / 2 : align === 'right' ? x - w : x;
  parchment(pen, left, top, w, h, seed);

  if (!pen.dry) ctx.fillStyle = colour;
  let y = top + 9;
  for (const l of lines) {
    y += lineHeight;
    const tx = align === 'center' ? left + w / 2 : align === 'right' ? left + w - PAD : left + PAD;
    say(pen, l, tx, y - 4, align);
    if (underline && !pen.dry) {
      const lw = ctx.measureText(l).width;
      const ux = align === 'center' ? left + w / 2 - lw / 2
        : align === 'right' ? left + w - PAD - lw : left + PAD;
      ctx.fillRect(ux, y + 1, lw, 2);
    }
  }
  return { width: w, height: h };
}

/**
 * Lays the whole poster out. The titles take the top corners and the subtitle
 * sits under them; the parchments tile the width beneath; the footer is a
 * strip along the bottom. Returns the height it needed — 16:9 unless the contents want more,
 * in which case the poster grows rather than running off the edge.
 */
function layout(pen: Pen, poster: Poster, height: number): number {
  const { ctx } = pen;
  const inner = POSTER_W - MARGIN * 2;
  let y = MARGIN;

  // The two titles share the top line: the first against the left edge, the
  // second against the right, set the same so neither reads as the lesser.
  // Alone, either one has the whole width to itself.
  const titlePx = poster.titleSize > 0 ? poster.titleSize : TITLE_PX;
  if (poster.title || poster.title2) {
    ctx.font = font(`bold ${titlePx}px`);
    const line = leading(titlePx, 'title');
    const both = poster.title !== '' && poster.title2 !== '';
    const room = (both ? (inner - GAP) / 2 : inner) - PAD * 2;
    let tall = 0;
    if (poster.title) {
      const lines = wrap(ctx, poster.title.toUpperCase(), room);
      tall = Math.max(tall, strip(pen, lines, MARGIN, y, room, line, INK, 11, 'left', true).height);
    }
    if (poster.title2) {
      const lines = wrap(ctx, poster.title2.toUpperCase(), room);
      const x = POSTER_W - MARGIN;
      tall = Math.max(tall, strip(pen, lines, x, y, room, line, INK, 29, 'right', true).height);
    }
    y += tall + 12;
  }
  if (poster.subtitle) {
    ctx.font = font('600 22px');
    const lines = wrap(ctx, poster.subtitle, inner * 0.7);
    y += strip(pen, lines, MARGIN, y, inner * 0.7, LINE.subtitle, INK, 23).height + 10;
  }
  if (poster.meta.length > 0) {
    ctx.font = font('14px');
    const label = poster.meta.map((m) => `${m.key}: ${m.value}`).join(' · ');
    const lines = wrap(ctx, label, inner * 0.6);
    y += strip(pen, lines, MARGIN, y, inner * 0.6, LINE.meta, INK_SOFT, 37).height + 10;
  }

  const panelsTop = y + 10;

  // The footer sits on the bottom edge, so it has to be measured before the
  // parchments can know how much room is left.
  const footerPx = poster.footerSize > 0 ? poster.footerSize : FOOTER_PX;
  const footerLine = leading(footerPx, 'footer');
  let footerH = 0;
  let footerLines: string[] = [];
  if (poster.footer) {
    ctx.font = font(`italic ${footerPx}px`);
    footerLines = wrap(ctx, poster.footer, inner * 0.78);
    footerH = footerLines.length * footerLine + 18 + 14;
  }

  const count = poster.panels.length;
  let panelsBottom = panelsTop;
  if (count > 0) {
    // @gap is how far apart the parchments stand — with two of them, how far
    // each sits from the middle — but never so far that a sheet is squeezed
    // narrower than a line of a list needs.
    const roomForGaps = count > 1 ? (inner - MIN_PANEL * count) / (count - 1) : 0;
    const asked = poster.panelGap >= 0 ? poster.panelGap : GAP;
    const gap = Math.max(0, Math.min(asked, roomForGaps));

    // Parchments share what's left evenly unless @width says how wide each one
    // should be, in which case the row of them is centred.
    const even = (inner - gap * (count - 1)) / count;
    const width = poster.panelWidth > 0 ? Math.min(poster.panelWidth, even) : even;
    const rowWidth = width * count + gap * (count - 1);
    const startX = MARGIN + Math.max(0, (inner - rowWidth) / 2);

    // With no @title over the poster, the parchments' own titles are the top
    // line of it, so they are set at a title's size rather than a heading's.
    const lead = !poster.title && !poster.title2;
    const panelPx = lead ? Math.round(titlePx * 0.75) : 22;
    const titleFont = font(`bold ${panelPx}px`);
    const titleLine = lead ? leading(panelPx, 'panel') : LINE.heading;
    // Every titled parchment gets the same strip height, so the sheets
    // beneath them start on one line rather than stepping down the poster.
    const titled = poster.panels.some((p) => p.title);
    const titleH = titled ? titleLine + 26 : 0;
    const bodyTop = panelsTop + titleH;

    const heights = poster.panels.map((p) => panelBody({ ctx, dry: true }, p, 0, 0, width - PAD * 2));
    const tallest = Math.max(...heights, 0) + PAD * 2;

    poster.panels.forEach((p, i) => {
      const x = startX + i * (width + gap);
      if (p.title) {
        ctx.font = titleFont;
        strip(pen, [clip(ctx, p.title, width - PAD * 2)], x + width / 2, panelsTop,
          width - PAD * 2, titleLine, INK, 211 + i * 13, 'center', lead);
      }
      parchment(pen, x, bodyTop, width, tallest, 101 + i * 17);
      panelBody(pen, p, x + PAD, bodyTop + PAD - 6, width - PAD * 2);
    });
    panelsBottom = bodyTop + tallest;
  }

  if (poster.footer) {
    ctx.font = font(`italic ${footerPx}px`);
    const top = Math.max(panelsBottom + 16, height - MARGIN - footerH + 14);
    strip(pen, footerLines, POSTER_W / 2, top, inner * 0.78, footerLine, INK, 59, 'center');
    return top + footerH;
  }
  return panelsBottom + MARGIN;
}

/** Covers the canvas with the picture, cropping rather than squashing it. */
function drawBackground(ctx: CanvasRenderingContext2D, bg: HTMLImageElement | null, h: number) {
  ctx.fillStyle = GROUND;
  ctx.fillRect(0, 0, POSTER_W, h);
  if (!bg || !bg.width || !bg.height) return;
  const scale = Math.max(POSTER_W / bg.width, h / bg.height);
  const w = bg.width * scale;
  const hh = bg.height * scale;
  ctx.drawImage(bg, (POSTER_W - w) / 2, (h - hh) / 2, w, hh);
}

/** The poster as a canvas, drawn at `scale` for a crisp picture. */
export function posterToCanvas(
  poster: Poster,
  bg: HTMLImageElement | null,
  scale = 2,
): HTMLCanvasElement {
  const scratch = document.createElement('canvas').getContext('2d');
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!scratch || !ctx) throw new Error('This browser has no canvas to draw on.');

  // Measured against the nominal height first; a poster that needs more room
  // gets it, and the background is re-fitted to whatever the final shape is.
  const wanted = layout({ ctx: scratch, dry: true }, poster, POSTER_H);
  const height = Math.max(POSTER_H, Math.ceil(wanted));

  canvas.width = Math.round(POSTER_W * scale);
  canvas.height = Math.round(height * scale);
  ctx.scale(scale, scale);
  ctx.textBaseline = 'alphabetic';
  drawBackground(ctx, bg, height);
  layout({ ctx, dry: false }, poster, height);
  return canvas;
}

/** Loads a background, or nothing if it can't be had. Same-origin uploads, so
 *  the canvas stays clean and can still be exported. */
export function loadBackground(url: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    if (!url.trim()) { resolve(null); return; }
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

/** A filename from the title: "Spell Tomes For Sale" -> spell-tomes-for-sale.png */
export function posterFilename(poster: Poster): string {
  const slug = (poster.title || poster.title2)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  return `${slug || 'poster'}.png`;
}
