/**
 * Keeping the item list in step with the price sheet.
 *
 * The Ledger is where new things first get written down — someone prices a
 * thing before anyone thinks to add it to the Database — so whenever a price
 * pull names something the item list hasn't got, it's added. Same filter as
 * the manual "Add from Ledger" button (see item-import.ts): one named thing
 * with a real price, so headers and notes never become items.
 */

import { useEffect } from 'react';
import { catalogue } from '@/items';
import { fromLedger, norm } from '@/lib/item-import';
import { uid } from '@/lib/format';
import type { DB, ItemRecord, Price } from '@/types';

/** Records for whatever the Ledger names that `items` doesn't have yet. */
export function ledgerAdditions(prices: Price[], items: ItemRecord[]): ItemRecord[] {
  const known = new Set(catalogue(items).map((i) => norm(i.name)));
  const at = new Date().toISOString();
  return fromLedger(prices, known).map((c) => ({
    id: uid(), name: c.name, category: c.category, notes: '', addedBy: 'Ledger', at,
  }));
}

/**
 * Adds the Ledger's new items to the Database as they arrive. Members only —
 * a guest's browser can read prices but has nowhere to write. The additions
 * are worked out again inside the update against the live document, so two
 * tabs pulling at once can't both add the same thing.
 */
export function useLedgerItemSync(
  prices: Price[],
  db: DB,
  update: (fn: (d: DB) => void) => void,
  enabled: boolean,
) {
  useEffect(() => {
    if (!enabled || prices.length === 0) return;
    if (ledgerAdditions(prices, db.items).length === 0) return;
    update((d) => { d.items.push(...ledgerAdditions(prices, d.items)); });
  }, [prices, db.items, update, enabled]);
}
