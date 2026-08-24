import { useMemo, useState } from 'react';
import { Download, Pencil, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { EmptyState, TonedBadge } from '@/components/bits';
import { ITEMS } from '@/items';
import { catalogueName, isTradeable, priceOf, tidyCategory } from '@/lib/prices';
import { usePrices } from '@/views/prices';
import { uid } from '@/lib/format';
import type { Price } from '@/types';
import { cn } from '@/lib/utils';
import type { DB } from '@/types';

const ALL = '__all';

const norm = (v: string) => v.toLowerCase().replace(/[^a-z0-9 ]/g, '').trim();

/** One row of the price list that could become an item. */
interface Candidate {
  name: string;
  category: string;
  each: number;
}

/**
 * Priced rows that aren't in the item list yet.
 *
 * Deliberately narrow. The price sheet is the only record of Keizaal's own
 * items, so it is worth mining — but it also holds section headers, notes and
 * rows covering several things at once, and a catalogue full of those is worse
 * than one that is merely incomplete. Only rows that name one thing and carry a
 * price the guild would actually charge get this far (see isTradeable), and
 * anything already known, built in or added, is dropped here.
 */
function candidates(prices: Price[], known: Set<string>): Candidate[] {
  const seen = new Set<string>();
  const out: Candidate[] = [];
  for (const row of prices) {
    if (!isTradeable(row)) continue;
    const name = catalogueName(row);
    const key = norm(name);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    if (known.has(key)) continue;
    const m = priceOf(row);
    out.push({ name, category: tidyCategory(row), each: m ? m.each : 0 });
  }
  return out;
}

function ImportFromLedger({ known, close, onAdd }: {
  known: Set<string>;
  close: () => void;
  onAdd: (picked: Candidate[]) => void;
}) {
  const { prices, busy, load } = usePrices();
  const [q, setQ] = useState('');
  const [dropped, setDropped] = useState<Set<string>>(() => new Set());

  const found = useMemo(() => candidates(prices, known), [prices, known]);

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
          <DialogTitle>Add items from the Ledger</DialogTitle>
          <DialogDescription>
            Everything the price list names and prices, that the item list doesn’t have yet.
            Rows without a price, and rows covering several items at once, are left out — the
            sheet has plenty of both. Untick anything that shouldn’t be an item.
          </DialogDescription>
        </DialogHeader>

        {prices.length === 0 ? (
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
            Nothing to add — every priced item in the Ledger is already on the item list.
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

  for (const i of ITEMS) {
    byName.set(i.name.toLowerCase(), { name: i.name, cat: i.cat, notes: '', id: '', custom: false });
  }
  for (const c of db.items) {
    const name = c.name.trim();
    if (!name) continue;
    byName.set(name.toLowerCase(), {
      name,
      cat: c.category.trim() || 'Custom',
      notes: c.notes,
      id: c.id,
      // A custom entry that shadows a built-in is still the guild's record, so
      // it stays editable — that is how a category gets corrected.
      custom: true,
    });
  }
  return [...byName.values()].sort((a, b) => a.name.localeCompare(b.name));
}

export function Items({ db, update, readOnly, onEdit }: {
  db: DB;
  update: (fn: (d: DB) => void) => void;
  readOnly: boolean;
  onEdit: (id: string) => void;
}) {
  const [q, setQ] = useState('');
  const [cat, setCat] = useState(ALL);
  const [importing, setImporting] = useState(false);

  const all = useMemo(() => rows(db), [db]);
  const cats = useMemo(
    () => [...new Set(all.map((r) => r.cat))].sort((a, b) => a.localeCompare(b)),
    [all],
  );

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
        {!readOnly && (
          <Button variant="outline" size="sm" onClick={() => setImporting(true)}>
            <Download />Add from Ledger
          </Button>
        )}
        <p className="text-xs text-muted-foreground">
          {all.length} items — {ITEMS.length} built in, {customCount} added by the guild.
          Everything here is offered wherever items are picked: collection jobs, item rewards
          and guild storage.
        </p>
      </div>

      {importing && (
        <ImportFromLedger
          known={new Set(all.map((r) => norm(r.name)))}
          close={() => setImporting(false)}
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

      {all.length === 0 ? (
        <EmptyState>No items yet.</EmptyState>
      ) : (
        <Tabs value={cat} onValueChange={(v) => setCat(v ? String(v) : ALL)}>
          <TabsList className="flex-wrap">
            <TabsTrigger value={ALL}>All</TabsTrigger>
            {cats.map((c) => <TabsTrigger key={c} value={c}>{c}</TabsTrigger>)}
          </TabsList>
          <TabsContent value={ALL} className="mt-4">{table(shown)}</TabsContent>
          {cats.map((c) => (
            <TabsContent key={c} value={c} className="mt-4">{table(shown)}</TabsContent>
          ))}
        </Tabs>
      )}
    </div>
  );
}
