import { isQtyColumn, parsePoster } from './parse-poster';
import type { PosterBlock } from './parse-poster';
import type { CatalogueItem } from '@/types';

/**
 * Reads a pasted price list into catalogue lines.
 *
 * It speaks the poster template, so a poster already written for the spell
 * tomes can be pasted straight in: `# Heading` starts a section, `@columns:`
 * names the columns, and every row after is `name, …`. Settings lines (title,
 * background, sizes) are simply ignored.
 *
 * The price is the column called Price, or failing that the first cell after
 * the name that is a number. A Qty column is dropped — the board says what
 * things cost, not how many are in the barrel. Everything else is kept as the
 * line's note, so "Ironflesh, Ad, 2500" lists Ironflesh at 2,500 with "Ad"
 * beside it.
 */
export function parseCatalogueText(src: string): Array<Omit<CatalogueItem, 'id'>> {
  const poster = parsePoster(src);
  const out: Array<Omit<CatalogueItem, 'id'>> = [];

  const read = (blocks: PosterBlock[], section: string) => {
    for (const b of blocks) {
      if (b.kind !== 'table') continue;
      const named = b.columns.findIndex((c) => c.trim().toLowerCase() === 'price');
      const qty = b.columns.findIndex(isQtyColumn);
      for (const row of b.rows) {
        const name = (row[0] ?? '').trim();
        if (!name) continue;
        const at = named > 0 ? named : row.findIndex((c, i) => i > 0 && i !== qty && /^\d[\d,]*$/.test(c.trim()));
        const price = at > 0 ? Number((row[at] ?? '').replace(/,/g, '')) : 0;
        const note = row
          .filter((c, i) => i > 0 && i !== at && i !== qty && c.trim())
          .map((c) => c.trim())
          .join(' · ');
        out.push({
          tab: '', section, name, note, hidden: false,
          price: Number.isFinite(price) && price > 0 ? Math.round(price) : 0,
        });
      }
    }
  };

  for (const panel of poster.panels) {
    read(panel.blocks, panel.title);
    for (const s of panel.sections) read(s.blocks, s.heading || panel.title);
  }
  return out;
}
