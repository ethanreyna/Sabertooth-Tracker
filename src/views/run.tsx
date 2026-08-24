import { useState } from 'react';
import type { FormEvent } from 'react';
import { Coins, Flag, Minus, Package, Plus, Trash2, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { EmptyState, Field, NameField, TonedBadge } from '@/components/bits';
import { catalogue } from '@/items';
import { ago, sep, uid } from '@/lib/format';
import { emptyRun } from '@/types';
import type { DB, RunEntry } from '@/types';

/** What each person is owed, and what the split can't divide. */
interface Share {
  each: number;
  left: number;
}

const split = (total: number, people: number): Share => {
  const n = Math.max(1, people);
  return { each: Math.floor(total / n), left: total % n };
};

/** Items gathered so far, one row per item, most recent movement last. */
function itemTotals(entries: RunEntry[]): Array<{ item: string; qty: number }> {
  const by = new Map<string, { item: string; qty: number }>();
  for (const e of entries) {
    if (e.kind !== 'item') continue;
    const key = e.item.trim().toLowerCase();
    if (!key) continue;
    const row = by.get(key) ?? { item: e.item.trim(), qty: 0 };
    row.qty += e.qty;
    by.set(key, row);
  }
  return [...by.values()].sort((a, b) => b.qty - a.qty || a.item.localeCompare(b.item));
}

function Stat({ label, value, sub, icon }: {
  label: string; value: string; sub?: string; icon: React.ReactNode;
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground [&_svg]:size-3.5">
          {icon}{label}
        </p>
        <p className="mt-1 text-2xl font-bold tracking-tight tabular-nums">{value}</p>
        {sub && <p className="mt-0.5 text-xs text-muted-foreground">{sub}</p>}
      </CardContent>
    </Card>
  );
}

export function Run({ db, update, readOnly, memberNames }: {
  db: DB;
  update: (fn: (d: DB) => void) => void;
  readOnly: boolean;
  memberNames: string[];
}) {
  const run = db.run;
  const [goldSeq, setGoldSeq] = useState(0);
  const [itemSeq, setItemSeq] = useState(0);

  const itemNames = catalogue(db.items).map((i) => i.name);

  const gold = run.entries.filter((e) => e.kind === 'gold').reduce((t, e) => t + e.qty, 0);
  const items = itemTotals(run.entries);
  const goldShare = split(gold, run.people);
  const log = run.entries.slice().sort((a, b) => (b.at || '').localeCompare(a.at || ''));

  const start = () => update((d) => {
    d.run = {
      ...emptyRun(),
      active: true,
      people: 1,
      startedBy: memberNames[0] || '',
      startedAt: new Date().toISOString(),
    };
  });

  const setPeople = (n: number) => update((d) => { d.run.people = Math.max(1, Math.min(24, n)); });

  const addGold = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const qty = Math.max(1, Math.round(Number(f.get('amount') || 0)));
    if (!qty) return;
    const by = String(f.get('by') || '').trim();
    e.currentTarget.reset();
    setGoldSeq((n) => n + 1);
    update((d) => {
      d.run.entries.push({ id: uid(), kind: 'gold', item: '', qty, by, at: new Date().toISOString() });
    });
  };

  const addItem = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const item = String(f.get('item') || '').trim();
    const qty = Math.max(1, Math.round(Number(f.get('qty') || 1)));
    if (!item) return;
    const by = String(f.get('by') || '').trim();
    e.currentTarget.reset();
    setItemSeq((n) => n + 1);
    update((d) => {
      d.run.entries.push({ id: uid(), kind: 'item', item, qty, by, at: new Date().toISOString() });
    });
  };

  if (!run.active) {
    return (
      <div className="mx-auto max-w-2xl space-y-4">
        <EmptyState>
          No run in progress. Start one when the party goes in, add gold and loot as you find it,
          and the split updates as you go.
        </EmptyState>
        {!readOnly && (
          <div className="flex justify-center">
            <Button onClick={start}><Flag />Start a run</Button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="min-w-56 flex-1">
          <Input
            value={run.name}
            disabled={readOnly}
            placeholder="Which dungeon? (optional)"
            onChange={(e) => {
              const v = e.target.value;
              update((d) => { d.run.name = v; });
            }}
            className="h-9 font-medium"
          />
        </div>
        <TonedBadge tone="green">Run in progress</TonedBadge>
        {run.startedAt && (
          <span className="text-xs text-muted-foreground">started {ago(run.startedAt)}</span>
        )}
        {!readOnly && (
          <Button
            variant="outline" size="sm"
            onClick={() => {
              if (confirm('Finish this run? The tally is cleared once everyone is paid out.')) {
                update((d) => { d.run = emptyRun(); });
              }
            }}
          >
            <Flag />Finish run
          </Button>
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Card>
          <CardContent className="p-4">
            <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground [&_svg]:size-3.5">
              <Users />On the run
            </p>
            <div className="mt-1 flex items-center gap-2">
              <Button
                variant="outline" size="icon-xs" aria-label="One fewer person"
                disabled={readOnly || run.people <= 1}
                onClick={() => setPeople(run.people - 1)}
              >
                <Minus />
              </Button>
              <span className="min-w-8 text-center text-2xl font-bold tabular-nums">{run.people}</span>
              <Button
                variant="outline" size="icon-xs" aria-label="One more person"
                disabled={readOnly || run.people >= 24}
                onClick={() => setPeople(run.people + 1)}
              >
                <Plus />
              </Button>
            </div>
          </CardContent>
        </Card>

        <Stat icon={<Coins />} label="Gold found" value={sep(gold)} sub="septims in the pot" />
        <Stat
          icon={<Coins />} label="Each person gets" value={sep(goldShare.each)}
          sub={goldShare.left ? `${sep(goldShare.left)} septims left over` : 'splits evenly'}
        />
      </div>

      {!readOnly && (
        <div className="grid gap-3 md:grid-cols-2">
          <Card>
            <CardContent className="p-4">
              <form key={`gold${goldSeq}`} onSubmit={addGold} className="space-y-3">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Add gold
                </p>
                <div className="flex items-end gap-2">
                  <Field label="Septims" htmlFor="run-gold" className="flex-1">
                    <Input id="run-gold" name="amount" type="number" min={1} required placeholder="250" />
                  </Field>
                  <Button type="submit"><Plus />Add</Button>
                </div>
                <Field label="Found by (optional)" htmlFor="run-gold-by">
                  <NameField id="run-gold-by" name="by" options={memberNames} placeholder="Who picked it up" />
                </Field>
              </form>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <form key={`item${itemSeq}`} onSubmit={addItem} className="space-y-3">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Add loot
                </p>
                <div className="flex items-end gap-2">
                  <Field label="Item" htmlFor="run-item" className="flex-1">
                    <NameField id="run-item" name="item" options={itemNames} required
                      placeholder="Search items, or write one in" />
                  </Field>
                  <Field label="Qty" htmlFor="run-qty" className="w-20">
                    <Input id="run-qty" name="qty" type="number" min={1} defaultValue={1} />
                  </Field>
                  <Button type="submit"><Plus />Add</Button>
                </div>
                <Field label="Found by (optional)" htmlFor="run-item-by">
                  <NameField id="run-item-by" name="by" options={memberNames} placeholder="Who picked it up" />
                </Field>
              </form>
            </CardContent>
          </Card>
        </div>
      )}

      {items.length > 0 && (
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Loot, split {run.people} ways
          </p>
          <Card className="overflow-hidden py-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Item</TableHead>
                  <TableHead className="w-24 text-right">Found</TableHead>
                  <TableHead className="w-28 text-right">Each</TableHead>
                  <TableHead className="w-32 text-right">Left over</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((r) => {
                  const sh = split(r.qty, run.people);
                  return (
                    <TableRow key={r.item}>
                      <TableCell className="font-medium">{r.item}</TableCell>
                      <TableCell className="text-right tabular-nums">{sep(r.qty)}</TableCell>
                      <TableCell className="text-right font-semibold tabular-nums">{sep(sh.each)}</TableCell>
                      <TableCell className="text-right tabular-nums text-muted-foreground">
                        {sh.left ? sep(sh.left) : '—'}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </Card>
        </div>
      )}

      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Everything picked up
        </p>
        {log.length === 0 ? (
          <EmptyState>Nothing found yet.</EmptyState>
        ) : (
          <Card className="overflow-hidden py-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-24">What</TableHead>
                  <TableHead>Item</TableHead>
                  <TableHead className="w-36">Found by</TableHead>
                  <TableHead className="w-24 text-right">Amount</TableHead>
                  {!readOnly && <TableHead className="w-10" />}
                </TableRow>
              </TableHeader>
              <TableBody>
                {log.map((e) => (
                  <TableRow key={e.id}>
                    <TableCell>
                      <TonedBadge tone={e.kind === 'gold' ? 'amber' : 'blue'}>
                        {e.kind === 'gold' ? 'Gold' : 'Loot'}
                      </TonedBadge>
                    </TableCell>
                    <TableCell className="max-w-0 truncate">
                      {e.kind === 'gold' ? 'Septims' : e.item}
                    </TableCell>
                    <TableCell className="text-muted-foreground">{e.by || '—'}</TableCell>
                    <TableCell className="text-right font-semibold tabular-nums">{sep(e.qty)}</TableCell>
                    {!readOnly && (
                      <TableCell>
                        <Button
                          variant="ghost" size="icon-xs" aria-label="Remove"
                          onClick={() => update((d) => {
                            d.run.entries = d.run.entries.filter((x) => x.id !== e.id);
                          })}
                        >
                          <Trash2 />
                        </Button>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        )}
      </div>

      <p className="flex items-center gap-1.5 text-xs text-muted-foreground [&_svg]:size-3.5">
        <Package />
        Everyone on the run sees the same tally — add loot as you find it and the split moves with it.
      </p>
    </div>
  );
}
