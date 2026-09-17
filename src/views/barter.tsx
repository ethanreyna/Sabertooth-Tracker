import { useEffect, useMemo, useState } from 'react';
import { ArrowLeftRight, Plus, Scale, Trash2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { EmptyState, TonedBadge } from '@/components/bits';
import { RECIPES } from '@/recipes';
import type { Recipe } from '@/recipes';
import { nameKey, priceIndex, priceOf, pricedItems, recipeCost, tidyCategory, tidyName } from '@/lib/prices';
import type { Basis } from '@/lib/prices';
import { uid } from '@/lib/format';
import type { Price } from '@/types';

const KEY = 'sabretooth-barter-v3';
// v1 was a two-sided swap with one basis switch; v2 a single list with a
// Selling/Buying switch. Neither shape maps onto sides with fixed bases.
const LEGACY_KEYS = ['sabretooth-barter-v1', 'sabretooth-barter-v2'];

/** Where a line's price comes from: a Ledger row, or a recipe costed from its ingredients. */
type Kind = 'item' | 'recipe';

interface Line {
  id: string;
  kind: Kind;
  name: string;
  qty: number;
}

type Side = 'theirs' | 'ours';
type Deal = Record<Side, Line[]>;

const EMPTY: Deal = { theirs: [], ours: [] };

/**
 * Each side of the counter has its own price basis, fixed. What they hand
 * over is worth what the guild would pay for it — the buy column. What the
 * guild hands over is worth what it would charge — the sell column. That's
 * the spread a shop lives on, and the offset the card at the bottom reports.
 */
const BASIS: Record<Side, Basis> = { theirs: 'buy', ours: 'sell' };

/** Septims, to the nearest whole one — nobody counts quarter-coins. */
const coin = (n: number) => Math.round(n).toLocaleString();

/** A per-unit price keeps its fraction: the sheet prices firewood at 0.25,
 *  and rounding that to 0 on the way past would make the line look free. */
const unit = (n: number) => n.toLocaleString(undefined, { maximumFractionDigits: 2 });

function readLines(raw: unknown): Line[] {
  return (Array.isArray(raw) ? raw : [])
    .map((l: unknown): Line => {
      const x = (l || {}) as Record<string, unknown>;
      return {
        id: String(x.id ?? uid()),
        kind: x.kind === 'recipe' ? 'recipe' : 'item',
        name: String(x.name ?? ''),
        qty: Math.max(1, Math.round(Number(x.qty) || 1)),
      };
    })
    .filter((l: Line) => l.name);
}

function load(): Deal {
  try {
    for (const k of LEGACY_KEYS) localStorage.removeItem(k);
    const raw = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (!raw || typeof raw !== 'object') return EMPTY;
    return { theirs: readLines(raw.theirs), ours: readLines(raw.ours) };
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

interface Valued {
  /** Septims per unit of the line, counting only what has a price. */
  each: number;
  total: number;
  approx: boolean;
  /** Where the number came from, or the ingredient breakdown for a recipe. */
  detail: string;
  /** Names with no price behind them — the line itself, or its ingredients. */
  unpriced: string[];
}

function value(l: Line, index: Map<string, Price>, recipes: Map<string, Recipe>, basis: Basis): Valued {
  if (l.kind === 'recipe') {
    const r = recipes.get(l.name);
    if (!r) return { each: 0, total: 0, approx: false, detail: 'no longer in the recipe list', unpriced: [l.name] };
    const c = recipeCost(r, index, basis);
    return {
      each: c.each,
      total: c.each * l.qty,
      approx: c.approx,
      detail: c.lines
        .map((g) => (g.each ? `${g.qty}× ${g.item} @ ${unit(g.each.each)}` : `${g.qty}× ${g.item} (no price)`))
        .join(' · '),
      unpriced: c.unpriced,
    };
  }
  const row = index.get(nameKey(l.name));
  const m = row ? priceOf(row, basis) : null;
  if (!m) return { each: 0, total: 0, approx: false, detail: 'not priced in the Ledger', unpriced: [l.name] };
  return {
    each: m.each,
    total: m.each * l.qty,
    approx: m.approx,
    detail: `${m.approx ? '≈' : ''}${unit(m.each)} each · ${m.from}`,
    unpriced: [],
  };
}

/** Adds a line to one side, searching the Ledger's priced rows and the recipe list together. */
function AddItem({ rows, index, basis, onAdd }: {
  rows: Price[];
  index: Map<string, Price>;
  basis: Basis;
  onAdd: (kind: Kind, name: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');

  const terms = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const matches = (hay: string) => terms.every((t) => hay.includes(t));
  const items = rows
    .filter((r) => !terms.length || matches(`${r.item} ${r.category} ${r.tab}`.toLowerCase()))
    .slice(0, 40);
  const recipes = RECIPES
    .filter((r) => !terms.length || matches(`${r.name} ${r.category}`.toLowerCase()))
    .slice(0, 40);

  const pick = (kind: Kind, name: string) => {
    onAdd(kind, name);
    setQ('');
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button type="button" variant="outline" className="w-full justify-between font-normal">
            <span className="text-muted-foreground">Add an item or a recipe…</span>
            <Plus />
          </Button>
        }
      />
      <PopoverContent className="w-(--anchor-width) p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput placeholder="e.g. iron ingot, iron greatsword" value={q} onValueChange={setQ} />
          <CommandList>
            {items.length === 0 && recipes.length === 0 && (
              <CommandEmpty>Nothing priced or craftable matches that.</CommandEmpty>
            )}
            {items.length > 0 && (
              <CommandGroup heading="Priced in the Ledger">
                {items.map((r) => {
                  const m = priceOf(r, basis);
                  return (
                    <CommandItem key={`item:${r.item}`} value={`item:${r.item}`} onSelect={() => pick('item', r.item)}>
                      <span className="flex-1 truncate">{tidyName(r.item)}</span>
                      <span className="text-xs text-muted-foreground">{tidyCategory(r)}</span>
                      <span className="ml-2 text-xs tabular-nums">{m ? unit(m.each) : '—'}</span>
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            )}
            {recipes.length > 0 && (
              <CommandGroup heading="Recipes, costed from their ingredients">
                {recipes.map((r) => {
                  const c = recipeCost(r, index, basis);
                  return (
                    <CommandItem key={`recipe:${r.name}`} value={`recipe:${r.name}`} onSelect={() => pick('recipe', r.name)}>
                      <span className="flex-1 truncate">{r.name}</span>
                      <span className="text-xs text-muted-foreground">{r.category}</span>
                      <span className="ml-2 text-xs tabular-nums">
                        {c.unpriced.length === c.lines.length ? '—' : `${coin(c.each)}${c.unpriced.length ? '+' : ''}`}
                      </span>
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
 * Two piles: what they give, priced at what the guild pays (buy), and what
 * we give, priced at what the guild charges (sell). An item comes straight
 * off the Ledger; a recipe is costed from its ingredients at the same
 * prices, so an Iron Greatsword on our side is 8 ingots and 4 leather strips
 * at sell — 24 — and on theirs the same at buy — 12. The gap between the
 * piles is the septims one side owes the other to make it even.
 *
 * Nothing here is written down: it is a counter-top calculator for while you
 * are haggling, kept in this browser so switching pages doesn't lose the pile.
 */
export function Barter({ prices }: { prices: Price[] }) {
  const [deal, setDeal] = useState<Deal>(() => load());
  useEffect(() => { save(deal); }, [deal]);

  const rows = useMemo(() => pricedItems(prices), [prices]);
  const index = useMemo(() => priceIndex(prices), [prices]);
  const recipes = useMemo(() => new Map(RECIPES.map((r) => [r.name, r])), []);

  const edit = (side: Side, fn: (list: Line[]) => Line[]) =>
    setDeal((d) => ({ ...d, [side]: fn(d[side]) }));
  const add = (side: Side) => (kind: Kind, name: string) => edit(side, (list) => {
    const hit = list.find((l) => l.kind === kind && l.name === name);
    return hit
      ? list.map((l) => (l === hit ? { ...l, qty: l.qty + 1 } : l))
      : [...list, { id: uid(), kind, name, qty: 1 }];
  });

  const valued = (side: Side) => deal[side].map((l) => ({ line: l, v: value(l, index, recipes, BASIS[side]) }));
  const sum = (side: Side) => valued(side).reduce((n, x) => n + x.v.total, 0);
  const theirs = sum('theirs');
  const ours = sum('ours');
  const gap = theirs - ours;
  const anything = deal.theirs.length > 0 || deal.ours.length > 0;
  const unpriced = valued('theirs').concat(valued('ours')).reduce((n, x) => n + x.v.unpriced.length, 0);

  const column = (side: Side, title: string, hint: string) => (
    <Card className="flex flex-col">
      <CardContent className="flex flex-1 flex-col gap-3 p-4">
        <div>
          <p className="text-sm font-semibold">{title}</p>
          <p className="text-xs text-muted-foreground">{hint}</p>
        </div>

        <AddItem rows={rows} index={index} basis={BASIS[side]} onAdd={add(side)} />

        {deal[side].length === 0 ? (
          <p className="py-4 text-center text-xs text-muted-foreground">Nothing on this side yet.</p>
        ) : (
          <div className="divide-y overflow-hidden rounded-lg border">
            {valued(side).map(({ line: l, v }) => (
              <div key={l.id} className="flex items-center gap-2 bg-card px-2 py-1.5">
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-1.5 text-sm">
                    <span className="truncate">{l.kind === 'item' ? tidyName(l.name) : l.name}</span>
                    <TonedBadge tone={l.kind === 'recipe' ? 'blue' : 'neutral'} className="shrink-0">
                      {l.kind === 'recipe' ? 'Recipe' : 'Ledger'}
                    </TonedBadge>
                  </p>
                  <p className="text-[11px] text-muted-foreground">{v.detail}</p>
                </div>
                <Input
                  type="number" min={1} value={l.qty}
                  aria-label={`Quantity of ${l.name}`}
                  className="h-7 w-20 shrink-0"
                  onChange={(e) => {
                    const q = Math.max(1, Number(e.target.value || 1));
                    edit(side, (list) => list.map((x) => (x.id === l.id ? { ...x, qty: q } : x)));
                  }}
                />
                <span className="w-20 shrink-0 text-right text-sm font-semibold tabular-nums">
                  {v.unpriced.length > 0 && v.each === 0
                    ? '—'
                    : `${v.approx ? '≈' : ''}${coin(v.total)}${v.unpriced.length > 0 ? '+' : ''}`}
                </span>
                <Button
                  variant="ghost" size="icon-xs" aria-label={`Remove ${l.name}`}
                  onClick={() => edit(side, (list) => list.filter((x) => x.id !== l.id))}
                >
                  <X />
                </Button>
              </div>
            ))}
          </div>
        )}

        <div className="mt-auto flex items-baseline justify-between border-t pt-2.5">
          <span className="text-xs text-muted-foreground">
            Worth at {BASIS[side]} prices
          </span>
          <span className="text-xl font-bold tabular-nums">{coin(sum(side))} s</span>
        </div>
      </CardContent>
    </Card>
  );

  if (rows.length === 0) {
    return (
      <EmptyState>
        No prices loaded yet. Pull the price list on the Prices tab and everything on it — and
        every recipe made from it — becomes available to barter with.
      </EmptyState>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <p className="text-xs text-muted-foreground">
          {rows.length} priced items and {RECIPES.length} recipes. What they give is priced at what
          the guild pays (buy); what we give at what the guild charges (sell). A recipe is its
          ingredients added up at the same prices. Anything the sheet leaves blank or marks N/A shows
          as unpriced rather than as zero.
        </p>
        {anything && (
          <Button variant="ghost" size="sm" className="ml-auto" onClick={() => setDeal(EMPTY)}>
            <Trash2 />Clear
          </Button>
        )}
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        {column('theirs', 'They give', 'What is coming to the guild, at buy prices')}
        {column('ours', 'We give', 'What the guild is handing over, at sell prices')}
      </div>

      <Card>
        <CardContent className="flex flex-wrap items-center gap-4 p-4">
          <ArrowLeftRight className="size-5 shrink-0 text-muted-foreground" />
          {!anything ? (
            <p className="text-sm text-muted-foreground">
              Put something on each side and the offset shows here.
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
          {unpriced > 0 && (
            <TonedBadge tone="amber">
              {unpriced} unpriced — totals are short by {unpriced === 1 ? 'that' : 'those'}
            </TonedBadge>
          )}
          <span className="ml-auto flex items-center gap-1.5 text-xs text-muted-foreground">
            <Scale className="size-3.5" />
            {coin(theirs)} in · {coin(ours)} out
          </span>
        </CardContent>
      </Card>
    </div>
  );
}
