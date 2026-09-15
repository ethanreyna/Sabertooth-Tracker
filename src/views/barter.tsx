import { useEffect, useMemo, useState } from 'react';
import { Plus, Trash2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { EmptyState, TonedBadge } from '@/components/bits';
import { RECIPES } from '@/recipes';
import type { Recipe } from '@/recipes';
import { nameKey, priceIndex, priceOf, pricedItems, recipeCost, tidyCategory, tidyName } from '@/lib/prices';
import type { Basis } from '@/lib/prices';
import { uid } from '@/lib/format';
import type { Price } from '@/types';

const KEY = 'sabretooth-barter-v2';
// v1 was a two-sided swap calculator; its saved shape doesn't map onto this.
const LEGACY_KEYS = ['sabretooth-barter-v1'];

/** Where a line's price comes from: a Ledger row, or a recipe costed from its ingredients. */
type Kind = 'item' | 'recipe';

interface Line {
  id: string;
  kind: Kind;
  name: string;
  qty: number;
}

interface Saved {
  mode: Basis;
  lines: Line[];
}

const EMPTY: Saved = { mode: 'sell', lines: [] };

const MODE_LABEL: Record<Basis, string> = { sell: 'Selling', buy: 'Buying' };

/** Septims, to the nearest whole one — nobody counts quarter-coins. */
const coin = (n: number) => Math.round(n).toLocaleString();

/** A per-unit price keeps its fraction: the sheet prices firewood at 0.25,
 *  and rounding that to 0 on the way past would make the line look free. */
const unit = (n: number) => n.toLocaleString(undefined, { maximumFractionDigits: 2 });

function load(): Saved {
  try {
    for (const k of LEGACY_KEYS) localStorage.removeItem(k);
    const raw = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (!raw || typeof raw !== 'object') return EMPTY;
    const lines: Line[] = (Array.isArray(raw.lines) ? raw.lines : [])
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
    return { mode: raw.mode === 'buy' ? 'buy' : 'sell', lines };
  } catch {
    return EMPTY;
  }
}

function save(s: Saved) {
  try {
    if (s.lines.length) localStorage.setItem(KEY, JSON.stringify(s));
    else localStorage.removeItem(KEY);
  } catch {
    /* private window — the list just won't survive a reload */
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

function value(l: Line, index: Map<string, Price>, recipes: Map<string, Recipe>, mode: Basis): Valued {
  if (l.kind === 'recipe') {
    const r = recipes.get(l.name);
    if (!r) return { each: 0, total: 0, approx: false, detail: 'no longer in the recipe list', unpriced: [l.name] };
    const c = recipeCost(r, index, mode);
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
  const m = row ? priceOf(row, mode) : null;
  if (!m) return { each: 0, total: 0, approx: false, detail: 'not priced in the Ledger', unpriced: [l.name] };
  return {
    each: m.each,
    total: m.each * l.qty,
    approx: m.approx,
    detail: `${m.approx ? '≈' : ''}${unit(m.each)} each · ${m.from}`,
    unpriced: [],
  };
}

/** Adds a line, searching the Ledger's priced rows and the recipe list together. */
function AddItem({ rows, index, mode, onAdd }: {
  rows: Price[];
  index: Map<string, Price>;
  mode: Basis;
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
                  const m = priceOf(r, mode);
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
                  const c = recipeCost(r, index, mode);
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
 * Prices a pile of things on one side of the counter, using the guild's own
 * list. Selling uses the Ledger's sell prices, Buying its buy prices. An item
 * comes straight off the Ledger; a recipe is costed from its ingredients at
 * those same prices, so an Iron Greatsword is its 8 ingots and 4 leather
 * strips added up — 12 to buy, 24 to sell, at today's sheet.
 *
 * Nothing here is written down: it is a counter-top calculator for while you
 * are haggling, kept in this browser so switching pages doesn't lose the pile.
 */
export function Barter({ prices }: { prices: Price[] }) {
  const [saved, setSaved] = useState<Saved>(() => load());
  useEffect(() => { save(saved); }, [saved]);
  const { mode, lines } = saved;

  const rows = useMemo(() => pricedItems(prices), [prices]);
  const index = useMemo(() => priceIndex(prices), [prices]);
  const recipes = useMemo(() => new Map(RECIPES.map((r) => [r.name, r])), []);

  const setMode = (m: Basis) => setSaved((s) => ({ ...s, mode: m }));
  const edit = (fn: (list: Line[]) => Line[]) => setSaved((s) => ({ ...s, lines: fn(s.lines) }));
  const add = (kind: Kind, name: string) => edit((list) => {
    const hit = list.find((l) => l.kind === kind && l.name === name);
    return hit
      ? list.map((l) => (l === hit ? { ...l, qty: l.qty + 1 } : l))
      : [...list, { id: uid(), kind, name, qty: 1 }];
  });

  const valued = lines.map((l) => ({ line: l, v: value(l, index, recipes, mode) }));
  const total = valued.reduce((n, x) => n + x.v.total, 0);
  const other: Basis = mode === 'sell' ? 'buy' : 'sell';
  const otherTotal = lines.reduce((n, l) => n + value(l, index, recipes, other).total, 0);
  const unpriced = valued.reduce((n, x) => n + x.v.unpriced.length, 0);

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
        <Tabs value={mode} onValueChange={(v) => setMode(v === 'buy' ? 'buy' : 'sell')}>
          <TabsList>
            <TabsTrigger value="sell">Selling</TabsTrigger>
            <TabsTrigger value="buy">Buying</TabsTrigger>
          </TabsList>
        </Tabs>
        <p className="text-xs text-muted-foreground">
          {rows.length} priced items and {RECIPES.length} recipes. A recipe is costed from its
          ingredients at the Ledger's {mode === 'sell' ? 'sell' : 'buy'} prices. Anything the sheet
          leaves blank or marks N/A shows as unpriced rather than as zero.
        </p>
        {lines.length > 0 && (
          <Button variant="ghost" size="sm" className="ml-auto" onClick={() => setSaved((s) => ({ ...s, lines: [] }))}>
            <Trash2 />Clear
          </Button>
        )}
      </div>

      <Card>
        <CardContent className="flex flex-col gap-3 p-4">
          <AddItem rows={rows} index={index} mode={mode} onAdd={add} />

          {lines.length === 0 ? (
            <p className="py-4 text-center text-xs text-muted-foreground">
              Nothing on the counter yet.
            </p>
          ) : (
            <div className="divide-y overflow-hidden rounded-lg border">
              {valued.map(({ line: l, v }) => (
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
                      edit((list) => list.map((x) => (x.id === l.id ? { ...x, qty: q } : x)));
                    }}
                  />
                  <span className="w-20 shrink-0 text-right text-sm font-semibold tabular-nums">
                    {v.unpriced.length > 0 && v.each === 0
                      ? '—'
                      : `${v.approx ? '≈' : ''}${coin(v.total)}${v.unpriced.length > 0 ? '+' : ''}`}
                  </span>
                  <Button
                    variant="ghost" size="icon-xs" aria-label={`Remove ${l.name}`}
                    onClick={() => edit((list) => list.filter((x) => x.id !== l.id))}
                  >
                    <X />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="flex flex-wrap items-center gap-4 p-4">
          <div>
            <p className="text-xs text-muted-foreground">
              {mode === 'sell' ? 'We charge' : 'We pay'}
            </p>
            <p className="text-2xl font-bold tabular-nums">{coin(total)} s</p>
          </div>
          {lines.length > 0 && (
            <p className="text-xs text-muted-foreground">
              {MODE_LABEL[other]} would be {coin(otherTotal)} s.
            </p>
          )}
          {unpriced > 0 && (
            <TonedBadge tone="amber" className="ml-auto">
              {unpriced} unpriced — the total is short by {unpriced === 1 ? 'that' : 'those'}
            </TonedBadge>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
