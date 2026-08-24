import { useEffect, useMemo, useState } from 'react';
import { ArrowLeftRight, Plus, Scale, Trash2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { EmptyState, Picker, TonedBadge } from '@/components/bits';
import type { Choice } from '@/components/bits';
import { priceOf, pricedItems, tidyCategory, tidyName } from '@/lib/prices';
import type { Basis } from '@/lib/prices';
import { cn } from '@/lib/utils';
import type { Price } from '@/types';

const KEY = 'sabretooth-barter-v1';

const BASES: Choice[] = [
  { value: 'sell', label: "Guild's sell prices" },
  { value: 'buy', label: "Guild's buy prices" },
];

interface Line {
  id: string;
  item: string;
  qty: number;
}

type Side = 'theirs' | 'ours';
type Deal = Record<Side, Line[]>;

const EMPTY: Deal = { theirs: [], ours: [] };

/** Septims, to the nearest whole one — nobody counts quarter-coins. */
const coin = (n: number) => Math.round(n).toLocaleString();

function load(): Deal {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (!raw || typeof raw !== 'object') return EMPTY;
    const side = (v: unknown): Line[] => (Array.isArray(v) ? v : [])
      .map((l) => {
        const x = (l || {}) as Record<string, unknown>;
        return {
          id: String(x.id ?? Math.random().toString(36).slice(2, 10)),
          item: String(x.item ?? ''),
          qty: Math.max(1, Math.round(Number(x.qty) || 1)),
        };
      })
      .filter((l) => l.item);
    return { theirs: side(raw.theirs), ours: side(raw.ours) };
  } catch {
    return EMPTY;
  }
}

function save(deal: Deal) {
  try {
    if (deal.theirs.length || deal.ours.length) localStorage.setItem(KEY, JSON.stringify(deal));
    else localStorage.removeItem(KEY);
  } catch {
    /* private window — the deal just won't survive a reload */
  }
}

/** Adds an item to one side, searching the priced rows from the Ledger. */
function AddItem({ rows, onAdd }: { rows: Price[]; onAdd: (item: string) => void }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');

  const terms = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const shown = rows
    .filter((r) => {
      if (!terms.length) return true;
      const hay = `${r.item} ${r.category} ${r.tab}`.toLowerCase();
      return terms.every((t) => hay.includes(t));
    })
    .slice(0, 60);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button type="button" variant="outline" className="w-full justify-between font-normal">
            <span className="text-muted-foreground">Add from the Ledger…</span>
            <Plus />
          </Button>
        }
      />
      <PopoverContent className="w-(--anchor-width) p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput placeholder="e.g. iron ingot, health potion" value={q} onValueChange={setQ} />
          <CommandList>
            {shown.length === 0 && <CommandEmpty>Nothing priced matches that.</CommandEmpty>}
            {shown.length > 0 && (
              <CommandGroup heading="Priced in the Ledger">
                {shown.map((r) => {
                  const m = priceOf(r);
                  return (
                    <CommandItem
                      key={r.tab + r.item}
                      value={r.item}
                      onSelect={() => { onAdd(r.item); setQ(''); setOpen(false); }}
                    >
                      <span className="flex-1 truncate">{tidyName(r.item)}</span>
                      <span className="text-xs text-muted-foreground">{tidyCategory(r)}</span>
                      <span className="ml-2 text-xs tabular-nums">{m ? coin(m.each) : '—'}</span>
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

/**
 * Works out whether a swap is even, using the guild's own price list.
 *
 * Nothing here is written down: it is a counter-top calculator for while you
 * are haggling, kept in this browser so switching pages doesn't lose the pile.
 * Prices come from the Ledger, so whatever the sheet says today is what this
 * says today.
 */
export function Barter({ prices }: { prices: Price[] }) {
  const [deal, setDeal] = useState<Deal>(() => load());
  const [basis, setBasis] = useState<Basis>('sell');

  useEffect(() => { save(deal); }, [deal]);

  const rows = useMemo(() => pricedItems(prices), [prices]);
  const byName = useMemo(() => {
    const m = new Map<string, Price>();
    for (const r of rows) m.set(r.item.trim().toLowerCase(), r);
    return m;
  }, [rows]);

  const edit = (side: Side, fn: (list: Line[]) => Line[]) =>
    setDeal((d) => ({ ...d, [side]: fn(d[side]) }));

  const add = (side: Side) => (item: string) => edit(side, (list) => (
    list.some((l) => l.item.toLowerCase() === item.toLowerCase())
      ? list.map((l) => (l.item.toLowerCase() === item.toLowerCase() ? { ...l, qty: l.qty + 1 } : l))
      : [...list, { id: Math.random().toString(36).slice(2, 10), item, qty: 1 }]
  ));

  const valueOf = (list: Line[]) => list.reduce((sum, l) => {
    const row = byName.get(l.item.trim().toLowerCase());
    const m = row ? priceOf(row, basis) : null;
    return sum + (m ? m.each * l.qty : 0);
  }, 0);

  const theirs = valueOf(deal.theirs);
  const ours = valueOf(deal.ours);
  const gap = theirs - ours;
  const anything = deal.theirs.length > 0 || deal.ours.length > 0;

  const column = (side: Side, title: string, hint: string) => (
    <Card className="flex flex-col">
      <CardContent className="flex flex-1 flex-col gap-3 p-4">
        <div>
          <p className="text-sm font-semibold">{title}</p>
          <p className="text-xs text-muted-foreground">{hint}</p>
        </div>

        <AddItem rows={rows} onAdd={add(side)} />

        {deal[side].length === 0 ? (
          <p className="py-4 text-center text-xs text-muted-foreground">Nothing on this side yet.</p>
        ) : (
          <div className="divide-y overflow-hidden rounded-lg border">
            {deal[side].map((l) => {
              const row = byName.get(l.item.trim().toLowerCase());
              const m = row ? priceOf(row, basis) : null;
              return (
                <div key={l.id} className="flex items-center gap-2 bg-card px-2 py-1.5">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm">{tidyName(l.item)}</p>
                    <p className="text-[11px] text-muted-foreground">
                      {m
                        ? `${m.approx ? '≈' : ''}${coin(m.each)} each · ${m.from}`
                        : 'not priced in the Ledger'}
                    </p>
                  </div>
                  <Input
                    type="number" min={1} value={l.qty}
                    aria-label={`Quantity of ${l.item}`}
                    className="h-7 w-20 shrink-0"
                    onChange={(e) => {
                      const v = Math.max(1, Number(e.target.value || 1));
                      edit(side, (list) => list.map((x) => (x.id === l.id ? { ...x, qty: v } : x)));
                    }}
                  />
                  <span className="w-20 shrink-0 text-right text-sm font-semibold tabular-nums">
                    {m ? coin(m.each * l.qty) : '—'}
                  </span>
                  <Button
                    variant="ghost" size="icon-xs" aria-label={`Remove ${l.item}`}
                    onClick={() => edit(side, (list) => list.filter((x) => x.id !== l.id))}
                  >
                    <X />
                  </Button>
                </div>
              );
            })}
          </div>
        )}

        <div className="mt-auto flex items-baseline justify-between border-t pt-2.5">
          <span className="text-xs text-muted-foreground">Worth</span>
          <span className="text-xl font-bold tabular-nums">{coin(valueOf(deal[side]))} s</span>
        </div>
      </CardContent>
    </Card>
  );

  if (rows.length === 0) {
    return (
      <EmptyState>
        No prices loaded yet. Pull the price list on the Prices tab and everything on it
        becomes available to barter with.
      </EmptyState>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="w-56">
          <Picker
            value={basis} onValueChange={(v) => setBasis((v as Basis) || 'sell')}
            options={BASES} ariaLabel="Which prices to use"
          />
        </div>
        <p className="text-xs text-muted-foreground">
          {rows.length} priced items from the Ledger. Rows the sheet leaves blank, or marks N/A
          or “?”, are counted as nothing — they show as unpriced rather than as zero.
        </p>
        {anything && (
          <Button
            variant="ghost" size="sm" className="ml-auto"
            onClick={() => setDeal(EMPTY)}
          >
            <Trash2 />Clear
          </Button>
        )}
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        {column('theirs', 'They give', 'What is coming to the guild')}
        {column('ours', 'We give', 'What the guild is handing over')}
      </div>

      <Card>
        <CardContent className="flex flex-wrap items-center gap-4 p-4">
          <ArrowLeftRight className="size-5 shrink-0 text-muted-foreground" />
          {!anything ? (
            <p className="text-sm text-muted-foreground">
              Put something on each side and the difference shows here.
            </p>
          ) : Math.round(gap) === 0 ? (
            <>
              <TonedBadge tone="green">Even trade</TonedBadge>
              <p className="text-sm text-muted-foreground">
                Both sides come to {coin(theirs)} septims.
              </p>
            </>
          ) : (
            <>
              <TonedBadge tone={gap > 0 ? 'green' : 'amber'}>
                {gap > 0 ? 'In the guild’s favour' : 'Against the guild'}
              </TonedBadge>
              <p className="text-sm">
                <span className="font-semibold tabular-nums">{coin(Math.abs(gap))} septims</span>{' '}
                {gap > 0
                  ? 'more coming in than going out — the guild could add that much to even it up.'
                  : 'more going out than coming in — ask for that much on top.'}
              </p>
            </>
          )}
          <span className={cn('ml-auto flex items-center gap-1.5 text-xs text-muted-foreground')}>
            <Scale className="size-3.5" />
            {coin(theirs)} in · {coin(ours)} out
          </span>
        </CardContent>
      </Card>
    </div>
  );
}
