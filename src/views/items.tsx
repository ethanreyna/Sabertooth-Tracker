import { useMemo, useState } from 'react';
import { Download, Pencil, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { EmptyState, Picker, TonedBadge } from '@/components/bits';
import { enchantments } from '@/lib/enchantments';
import { ITEMS } from '@/items';
import { canonCategory, fromLedger, fromRecipes, norm } from '@/lib/item-import';
import type { Candidate } from '@/lib/item-import';
import { usePrices } from '@/views/prices';
import { uid } from '@/lib/format';
import { cn } from '@/lib/utils';
import type { DB } from '@/types';

const ALL = '__all';

/** Where a batch of items is being read from. */
type Source = 'ledger' | 'recipes';

const SOURCES: Record<Source, { title: string; blurb: string; button: string }> = {
  ledger: {
    title: 'Add items from the Ledger',
    blurb: 'Everything the price list names and prices that the item list doesn’t have yet. '
      + 'Rows without a price, and rows covering several items at once, are left out — the sheet '
      + 'has plenty of both.',
    button: 'Add from Ledger',
  },
  recipes: {
    title: 'Add items from the Recipes',
    blurb: 'Everything the blacksmith doc makes, and what it makes them from. Names are matched '
      + 'loosely, so “Nails” won’t be added alongside “Nail”, and nothing already in the list '
      + 'comes back.',
    button: 'Add from Recipes',
  },
};

function ImportItems({ source, known, close, onAdd }: {
  source: Source;
  known: Set<string>;
  close: () => void;
  onAdd: (picked: Candidate[]) => void;
}) {
  const { prices, busy, load } = usePrices();
  const [q, setQ] = useState('');
  const [dropped, setDropped] = useState<Set<string>>(() => new Set());

  const fmt = SOURCES[source];
  const found = useMemo(
    () => (source === 'recipes' ? fromRecipes(known) : fromLedger(prices, known)),
    [source, prices, known],
  );

  const needle = q.trim().toLowerCase();
  const shown = found.filter(
    (c) => !needle || c.name.toLowerCase().includes(needle) || c.category.toLowerCase().includes(needle),
  );

  const groups = useMemo(() => {
    const by = new Map<string, Candidate[]>();
    for (const c of shown) by.set(c.category, [...(by.get(c.category) ?? []), c]);
    return [...by.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [shown]);

  const isOn = (c: Candidate) => !dropped.has(norm(c.name));
  const toggle = (c: Candidate, on: boolean) => setDropped((prev) => {
    const next = new Set(prev);
    if (on) next.delete(norm(c.name));
    else next.add(norm(c.name));
    return next;
  });
  const toggleGroup = (list: Candidate[], on: boolean) => setDropped((prev) => {
    const next = new Set(prev);
    for (const c of list) {
      if (on) next.delete(norm(c.name));
      else next.add(norm(c.name));
    }
    return next;
  });

  const picked = found.filter(isOn);

  return (
    <Dialog open onOpenChange={(open) => { if (!open) close(); }}>
      <DialogContent className="max-h-[calc(100vh-4rem)] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{fmt.title}</DialogTitle>
          <DialogDescription>
            {fmt.blurb} Untick anything that shouldn’t be an item.
          </DialogDescription>
        </DialogHeader>

        {source === 'ledger' && prices.length === 0 ? (
          <div className="space-y-3 py-2">
            <p className="text-sm text-muted-foreground">
              No price list loaded in this browser yet.
            </p>
            <Button disabled={busy} onClick={() => void load(false)}>
              {busy ? 'Pulling…' : 'Pull the price list'}
            </Button>
          </div>
        ) : found.length === 0 ? (
          <p className="py-4 text-sm text-muted-foreground">
            Nothing to add — everything the {source === 'recipes' ? 'recipe doc' : 'Ledger'} names
            is already on the item list.
          </p>
        ) : (
          <div className="space-y-3">
            <Input
              placeholder="Filter these…" value={q} onChange={(e) => setQ(e.target.value)}
              className="h-8"
            />

            <div className="space-y-4">
              {groups.map(([cat, list]) => {
                const allOn = list.every(isOn);
                return (
                  <div key={cat}>
                    <Label className="flex items-center gap-2 border-b pb-1.5 text-xs font-semibold">
                      <Checkbox
                        checked={allOn}
                        onCheckedChange={(v) => toggleGroup(list, v === true)}
                      />
                      {cat}
                      <span className="font-normal text-muted-foreground">{list.length}</span>
                    </Label>
                    <div className="grid gap-x-4 sm:grid-cols-2">
                      {list.map((c) => (
                        <Label
                          key={c.name}
                          className="flex items-center gap-2 py-1 text-sm font-normal"
                        >
                          <Checkbox
                            checked={isOn(c)}
                            onCheckedChange={(v) => toggle(c, v === true)}
                          />
                          <span className="min-w-0 flex-1 truncate">{c.name}</span>
                          <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                            {c.each ? Math.round(c.each).toLocaleString() : '—'}
                          </span>
                        </Label>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={close}>Cancel</Button>
          <Button
            disabled={picked.length === 0}
            onClick={() => { onAdd(picked); close(); }}
          >
            Add {picked.length} item{picked.length === 1 ? '' : 's'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Rows the table shows: the built-in catalogue and the guild's own additions,
 *  merged, with only the latter editable. */
type Row = { name: string; cat: string; notes: string; id: string; custom: boolean };

function rows(db: DB): Row[] {
  const byName = new Map<string, Row>();

  // Categories are canonicalised for display so the two sources' spellings of
  // one idea — Potion and Potions, Misc and Misc. — sit together rather than
  // splitting the list in two. What's stored is left as it was written.
  for (const i of ITEMS) {
    byName.set(i.name.toLowerCase(), {
      name: i.name, cat: canonCategory(i.cat), notes: '', id: '', custom: false,
    });
  }
  for (const c of db.items) {
    const name = c.name.trim();
    if (!name) continue;
    byName.set(name.toLowerCase(), {
      name,
      cat: canonCategory(c.category.trim() || 'Misc'),
      notes: c.notes,
      id: c.id,
      // A custom entry that shadows a built-in is still the guild's record, so
      // it stays editable — that is how a category gets corrected.
      custom: true,
    });
  }
  return [...byName.values()].sort((a, b) => a.name.localeCompare(b.name));
}

function ItemList({ db, update, readOnly, onEdit }: {
  db: DB;
  update: (fn: (d: DB) => void) => void;
  readOnly: boolean;
  onEdit: (id: string) => void;
}) {
  const [q, setQ] = useState('');
  const [cat, setCat] = useState(ALL);
  const [importing, setImporting] = useState<Source | null>(null);

  const all = useMemo(() => rows(db), [db]);
  const catOptions = useMemo(() => {
    const counts = new Map<string, number>();
    for (const r of all) counts.set(r.cat, (counts.get(r.cat) ?? 0) + 1);
    return [
      { value: ALL, label: `All categories (${all.length})` },
      ...[...counts.entries()]
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([c, n]) => ({ value: c, label: `${c} (${n})` })),
    ];
  }, [all]);

  const needle = q.trim().toLowerCase();
  const shown = all.filter((r) => {
    if (cat !== ALL && r.cat !== cat) return false;
    if (!needle) return true;
    return r.name.toLowerCase().includes(needle) || r.notes.toLowerCase().includes(needle);
  });

  const customCount = db.items.length;

  const table = (list: Row[]) => (
    <Card className="overflow-hidden py-0">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Item</TableHead>
            <TableHead className="w-32">Category</TableHead>
            <TableHead>Notes</TableHead>
            <TableHead className="w-28">Source</TableHead>
            {!readOnly && <TableHead className="w-20" />}
          </TableRow>
        </TableHeader>
        <TableBody>
          {list.map((r) => (
            <TableRow key={r.name}>
              <TableCell className="font-medium">{r.name}</TableCell>
              <TableCell className="text-muted-foreground">{r.cat}</TableCell>
              <TableCell className="max-w-0 truncate text-muted-foreground">{r.notes}</TableCell>
              <TableCell>
                <TonedBadge tone={r.custom ? 'blue' : 'neutral'}>
                  {r.custom ? 'Guild' : 'Built in'}
                </TonedBadge>
              </TableCell>
              {!readOnly && (
                <TableCell className={cn('text-right', !r.custom && 'opacity-0')}>
                  {r.custom && (
                    <div className="flex justify-end gap-0.5">
                      <Button
                        variant="ghost" size="icon-xs" aria-label={`Edit ${r.name}`}
                        onClick={() => onEdit(r.id)}
                      >
                        <Pencil />
                      </Button>
                      <Button
                        variant="ghost" size="icon-xs" aria-label={`Remove ${r.name}`}
                        onClick={() => {
                          if (confirm(`Remove ${r.name} from the guild's item list?`)) {
                            update((d) => { d.items = d.items.filter((x) => x.id !== r.id); });
                          }
                        }}
                      >
                        <Trash2 />
                      </Button>
                    </div>
                  )}
                </TableCell>
              )}
            </TableRow>
          ))}
          {list.length === 0 && (
            <TableRow>
              <TableCell colSpan={readOnly ? 4 : 5} className="py-6 text-center text-muted-foreground">
                Nothing matches “{q}”.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </Card>
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Input
          placeholder="Search items" value={q} onChange={(e) => setQ(e.target.value)}
          className="h-8 w-64 max-sm:w-full"
        />
        <div className="w-56 max-sm:w-full">
          <Picker
            value={cat} onValueChange={(v) => setCat(v || ALL)}
            options={catOptions} ariaLabel="Category"
          />
        </div>
        {!readOnly && (
          <>
            <Button variant="outline" size="sm" onClick={() => setImporting('ledger')}>
              <Download />Add from Ledger
            </Button>
            <Button variant="outline" size="sm" onClick={() => setImporting('recipes')}>
              <Download />Add from Recipes
            </Button>
          </>
        )}
        <p className="text-xs text-muted-foreground">
          {all.length} items — {ITEMS.length} built in, {customCount} added by the guild.
          Everything here is offered wherever items are picked: collection jobs, item rewards
          and guild storage.
        </p>
      </div>

      {importing && (
        <ImportItems
          source={importing}
          known={new Set(all.map((r) => norm(r.name)))}
          close={() => setImporting(null)}
          onAdd={(picked) => update((d) => {
            const at = new Date().toISOString();
            for (const c of picked) {
              d.items.push({
                id: uid(), name: c.name, category: c.category,
                notes: '', addedBy: '', at,
              });
            }
          })}
        />
      )}

      {all.length === 0 ? <EmptyState>No items yet.</EmptyState> : table(shown)}
    </div>
  );
}

/** Built-in and guild enchantments, merged, with the guild's editable. */
function EnchantmentList({ db, update, readOnly, onEdit }: {
  db: DB;
  update: (fn: (d: DB) => void) => void;
  readOnly: boolean;
  onEdit: (id: string) => void;
}) {
  const [q, setQ] = useState('');
  const rowsAll = useMemo(() => enchantments(db.enchantments), [db.enchantments]);

  const needle = q.trim().toLowerCase();
  const shown = rowsAll.filter((e) => !needle
    || e.name.toLowerCase().includes(needle)
    || e.tier.toLowerCase().includes(needle)
    || e.notes.toLowerCase().includes(needle));

  // Tier order comes from the list itself, so a new tier needs no code change.
  const groups: Array<{ tier: string; rows: typeof rowsAll }> = [];
  for (const e of shown) {
    const tier = e.tier || 'Other';
    const last = groups.find((g) => g.tier === tier);
    if (last) last.rows.push(e);
    else groups.push({ tier, rows: [e] });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Input
          placeholder="Search enchantments" value={q} onChange={(e) => setQ(e.target.value)}
          className="h-8 w-64 max-sm:w-full"
        />
        {!readOnly && (
          <Button variant="outline" size="sm" onClick={() => onEdit('')}>
            <Plus />Add an enchantment
          </Button>
        )}
        <p className="text-xs text-muted-foreground">
          What the guild&rsquo;s enchanter can actually do &mdash; not the full Skyrim table. These
          are what the waitlist and guest requests offer.
        </p>
      </div>

      {groups.length === 0 ? (
        <EmptyState>Nothing matches &ldquo;{q}&rdquo;.</EmptyState>
      ) : groups.map((g) => (
        <Card key={g.tier} className="overflow-hidden py-0">
          <div className="flex items-center gap-2 border-b bg-muted/40 px-4 py-2">
            <h2 className="text-sm font-semibold">{g.tier}</h2>
            {g.rows[0]?.cost && (
              <span className="text-xs text-muted-foreground">{g.rows[0].cost}</span>
            )}
            <span className="ml-auto text-xs text-muted-foreground">{g.rows.length}</span>
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Enchantment</TableHead>
                <TableHead className="w-48">Cost</TableHead>
                <TableHead>Notes</TableHead>
                <TableHead className="w-28">Source</TableHead>
                {!readOnly && <TableHead className="w-20" />}
              </TableRow>
            </TableHeader>
            <TableBody>
              {g.rows.map((e) => (
                <TableRow key={e.name}>
                  <TableCell className="font-medium">{e.name}</TableCell>
                  <TableCell className="text-muted-foreground">{e.cost || '—'}</TableCell>
                  <TableCell className="max-w-0 truncate text-muted-foreground">{e.notes}</TableCell>
                  <TableCell>
                    <TonedBadge tone={e.custom ? 'blue' : 'neutral'}>
                      {e.custom ? 'Guild' : 'Built in'}
                    </TonedBadge>
                  </TableCell>
                  {!readOnly && (
                    <TableCell className={cn('text-right', !e.custom && 'opacity-0')}>
                      {e.custom && (
                        <div className="flex justify-end gap-0.5">
                          <Button
                            variant="ghost" size="icon-xs" aria-label={`Edit ${e.name}`}
                            onClick={() => onEdit(e.id)}
                          >
                            <Pencil />
                          </Button>
                          <Button
                            variant="ghost" size="icon-xs" aria-label={`Remove ${e.name}`}
                            onClick={() => {
                              if (confirm(`Remove ${e.name} from the enchantment list?`)) {
                                update((d) => {
                                  d.enchantments = d.enchantments.filter((x) => x.id !== e.id);
                                });
                              }
                            }}
                          >
                            <Trash2 />
                          </Button>
                        </div>
                      )}
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      ))}
    </div>
  );
}

export type DatabaseTab = 'items' | 'enchantments';

/**
 * The guild's reference data: what exists, and what can be done to it.
 *
 * Both lists work the same way — a built-in set the app ships with, plus the
 * guild's own additions on top, with only the additions editable. Everything
 * here feeds the pickers elsewhere, so this is where a missing option gets
 * fixed rather than being written in over and over.
 */
export function Database({ db, update, readOnly, tab, onTabChange, onEditItem, onEditEnchantment }: {
  db: DB;
  update: (fn: (d: DB) => void) => void;
  readOnly: boolean;
  tab: DatabaseTab;
  onTabChange: (t: DatabaseTab) => void;
  onEditItem: (id: string) => void;
  onEditEnchantment: (id: string) => void;
}) {
  const enchCount = enchantments(db.enchantments).length;

  return (
    <Tabs value={tab} onValueChange={(v) => onTabChange(v === 'enchantments' ? 'enchantments' : 'items')}>
      <TabsList>
        <TabsTrigger value="items">
          Items<span className="ml-1.5 text-muted-foreground">{ITEMS.length + db.items.length}</span>
        </TabsTrigger>
        <TabsTrigger value="enchantments">
          Enchantments<span className="ml-1.5 text-muted-foreground">{enchCount}</span>
        </TabsTrigger>
      </TabsList>

      <TabsContent value="items" className="mt-4">
        <ItemList db={db} update={update} readOnly={readOnly} onEdit={onEditItem} />
      </TabsContent>
      <TabsContent value="enchantments" className="mt-4">
        <EnchantmentList db={db} update={update} readOnly={readOnly} onEdit={onEditEnchantment} />
      </TabsContent>
    </Tabs>
  );
}
