import type { CatalogueItem, PriceTab } from '@/types';

/** Where an item with no tab — or a tab since deleted — is listed, once the
 *  list has tabs at all. */
export const OTHER_TAB = 'Other';

/** The item's tab id if it is one the list still has, otherwise ''. */
export const tabOf = (item: CatalogueItem, tabs: PriceTab[]) =>
  tabs.some((t) => t.id === item.tab) ? item.tab : '';

export interface PriceGroup {
  /** '' for Other, and for the one untabbed list when there are no tabs. */
  id: string;
  name: string;
  items: CatalogueItem[];
}

/**
 * The list split by tab, in the clan's order, with Other last when anything
 * falls outside the tabs. A list with no tabs is one group, as it always was.
 */
export function priceGroups(items: CatalogueItem[], tabs: PriceTab[]): PriceGroup[] {
  if (tabs.length === 0) return [{ id: '', name: '', items }];
  const out: PriceGroup[] = tabs.map((t) => ({ id: t.id, name: t.name, items: [] }));
  const other: PriceGroup = { id: '', name: OTHER_TAB, items: [] };
  for (const it of items) {
    (out.find((g) => g.id === it.tab) ?? other).items.push(it);
  }
  return other.items.length ? [...out, other] : out;
}
