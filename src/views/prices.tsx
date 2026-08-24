import { useCallback, useEffect, useMemo, useState } from 'react';
import { ExternalLink, RefreshCw, Search, X } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { EmptyState, TonedBadge } from '@/components/bits';
import { Barter } from '@/views/barter';
import { fetchPrices, loadPrices } from '@/sync';
import { ago } from '@/lib/format';
import { cn } from '@/lib/utils';
import type { Price } from '@/types';

const SHEET_URL =
  'https://docs.google.com/spreadsheets/d/1i5_O_jqz2wPBBNUzjCk0gwMRBIdVdnbIc0BG1S-KMWQ/edit';

const ALL = '__all';

// Money columns always appear in this order, whichever order the sheet happened
// to introduce them, so every block reads the same way.
const PRICE_ORDER = ['make price', 'price to brew', 'price of 1', 'buy', 'price', 'cost', 'sell', 'profit'];

// Prose columns: left-aligned and allowed to wrap, unlike the numeric ones.
const TEXT_COLUMNS = new Set([
  'ingredients', 'effects', 'potions used in', 'contents', 'details', 'notes',
]);

const isTextColumn = (label: string) => TEXT_COLUMNS.has(label.toLowerCase());

/** Money columns first in a fixed order, then anything else, first-seen. */
function orderLabels(labels: string[]): string[] {
  const rank = (l: string) => {
    const i = PRICE_ORDER.indexOf(l.toLowerCase());
    return i === -1 ? PRICE_ORDER.length : i;
  };
  return labels
    .map((l, i) => ({ l, i }))
    .sort((a, b) => rank(a.l) - rank(b.l) || a.i - b.i)
    .map((x) => x.l);
}

function ValueCell({ value, label }: { value: string; label: string }) {
  if (isTextColumn(label)) {
    return <TableCell className="min-w-64 text-sm whitespace-normal">{value}</TableCell>;
  }
  const numeric = value !== '' && !Number.isNaN(Number(value.replace(/[g,]/g, '')));
  return (
    <TableCell className={cn('text-right', numeric ? 'tabular-nums' : 'text-muted-foreground')}>
      {value}
    </TableCell>
  );
}

/** One block of rows. Columns come from the whole tab so blocks line up. */
function PriceTable({ rows, labels }: { rows: Price[]; labels: string[] }) {
  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="min-w-56">Item</TableHead>
            {labels.map((l) => (
              <TableHead key={l} className={cn('whitespace-nowrap', !isTextColumn(l) && 'text-right')}>
                {l}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r, i) => (
            <TableRow key={`${r.tab}-${r.category}-${r.item}-${i}`}>
              <TableCell className="font-medium capitalize">{r.item.toLowerCase()}</TableCell>
              {labels.map((l) => <ValueCell key={l} label={l} value={r.values?.[l] ?? ''} />)}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

/**
 * One pull of the sheet, shared by everything that needs prices: the list, the
 * barter tool, and the item importer on the Items page.
 */
export function usePrices() {
  const cached = loadPrices();
  const [prices, setPrices] = useState<Price[]>(cached?.prices ?? []);
  const [syncedAt, setSyncedAt] = useState(cached?.syncedAt ?? '');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const load = useCallback(async (force: boolean) => {
    setBusy(true);
    setErr('');
    try {
      // Prices come from the sheet, not the guild database — a guest-safe read.
      const res = await fetchPrices({ password: '', guest: true }, force);
      setPrices(res.prices);
      setSyncedAt(res.syncedAt);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not load prices.');
    } finally {
      setBusy(false);
    }
  }, []);

  // Only auto-pull when nothing is cached; otherwise Refresh is explicit.
  useEffect(() => {
    if (!cached) void load(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { prices, syncedAt, busy, err, load };
}

function PriceList({ prices, syncedAt, busy, err, load }: ReturnType<typeof usePrices>) {
  const [q, setQ] = useState('');
  const [tab, setTab] = useState(ALL);

  const tabs = useMemo(() => {
    const seen: string[] = [];
    for (const p of prices) if (p.tab && !seen.includes(p.tab)) seen.push(p.tab);
    return seen;
  }, [prices]);

  // Search covers the item, its category/tab, and the values — so "1000" or
  // "restore health" find things, not just item names.
  const groups = useMemo(() => {
    const terms = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
    const match = (p: Price) => {
      if (!terms.length) return true;
      const hay = `${p.item} ${p.category} ${p.tab} ${Object.entries(p.values ?? {}).flat().join(' ')}`.toLowerCase();
      return terms.every((t) => hay.includes(t));
    };

    const out: Array<{ tab: string; category: string; rows: Price[] }> = [];
    for (const p of prices) {
      if (tab !== ALL && p.tab !== tab) continue;
      if (!match(p)) continue;
      const last = out[out.length - 1];
      if (last && last.tab === p.tab && last.category === p.category) last.rows.push(p);
      else out.push({ tab: p.tab, category: p.category, rows: [p] });
    }
    return out;
  }, [prices, q, tab]);

  // Column set is decided per tab, not per block, so every table in a tab has
  // the same columns in the same order and they line up down the page.
  const labelsByTab = useMemo(() => {
    const seen = new Map<string, string[]>();
    for (const p of prices) {
      const list = seen.get(p.tab) ?? [];
      for (const k of Object.keys(p.values ?? {})) if (!list.includes(k)) list.push(k);
      seen.set(p.tab, list);
    }
    return new Map([...seen].map(([t, list]) => [t, orderLabels(list)]));
  }, [prices]);

  const shown = groups.reduce((n, g) => n + g.rows.length, 0);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search every tab…" value={q} onChange={(e) => setQ(e.target.value)}
            className="h-8 w-64 pl-8"
          />
          {q && (
            <Button
              variant="ghost" size="icon-xs" aria-label="Clear search"
              className="absolute right-1 top-1/2 -translate-y-1/2"
              onClick={() => setQ('')}
            >
              <X />
            </Button>
          )}
        </div>

        <Button size="sm" disabled={busy} onClick={() => void load(true)}>
          <RefreshCw className={busy ? 'animate-spin' : undefined} />
          {busy ? 'Pulling…' : 'Refresh'}
        </Button>
        <Button variant="ghost" size="sm" render={<a href={SHEET_URL} target="_blank" rel="noreferrer" />}>
          <ExternalLink />
          Open sheet
        </Button>

        <span className="ml-auto text-xs text-muted-foreground">
          {shown.toLocaleString()} of {prices.length.toLocaleString()} rows
          {syncedAt ? ` · updated ${ago(syncedAt)}` : ''}
        </span>
      </div>

      {tabs.length > 1 && (
        <div className="flex flex-wrap gap-1.5">
          <button type="button" onClick={() => setTab(ALL)}>
            <TonedBadge tone={tab === ALL ? 'blue' : 'neutral'}>All tabs</TonedBadge>
          </button>
          {tabs.map((t) => (
            <button key={t} type="button" onClick={() => setTab(t)}>
              <TonedBadge tone={tab === t ? 'blue' : 'neutral'}>{t}</TonedBadge>
            </button>
          ))}
        </div>
      )}

      {err && <Alert variant="destructive"><AlertDescription>{err}</AlertDescription></Alert>}

      {groups.length === 0 ? (
        <EmptyState>
          {busy ? 'Pulling prices from the sheet…'
            : q ? `Nothing matches “${q}”.`
              : 'No prices loaded. Hit Refresh to pull from the sheet.'}
        </EmptyState>
      ) : (
        groups.map((g, i) => (
          <Card key={`${g.tab}-${g.category}-${i}`} className="overflow-hidden py-0">
            <div className="flex flex-wrap items-center gap-2 border-b bg-muted/40 px-4 py-2">
              <h2 className="text-sm font-semibold">{g.category || g.tab}</h2>
              {g.category !== g.tab && (
                <span className="text-xs text-muted-foreground">{g.tab}</span>
              )}
              <span className="ml-auto text-xs text-muted-foreground">{g.rows.length}</span>
            </div>
            <PriceTable rows={g.rows} labels={labelsByTab.get(g.tab) ?? []} />
          </Card>
        ))
      )}

      <p className="text-xs text-muted-foreground">
        Pulled from the guild's Google Sheet through the server, since Google sends no CORS headers.
        Cached 5 minutes; Refresh forces a fresh pull. Columns come from the headers in each tab and
        a blank cell means the sheet has no value there — nothing is inferred, so a price is never
        shown under a column it didn't come from.
      </p>
    </div>
  );
}

/** The Ledger: the guild's price list, and the barter tool that reads it. */
export function Prices() {
  const [tab, setTab] = useState<'prices' | 'barter'>('prices');
  const priced = usePrices();

  return (
    <Tabs value={tab} onValueChange={(v) => setTab(v === 'barter' ? 'barter' : 'prices')}>
      <TabsList>
        <TabsTrigger value="prices">
          Prices{priced.prices.length > 0 && (
            <span className="ml-1.5 text-muted-foreground">{priced.prices.length}</span>
          )}
        </TabsTrigger>
        <TabsTrigger value="barter">Barter</TabsTrigger>
      </TabsList>

      <TabsContent value="prices" className="mt-4">
        <PriceList {...priced} />
      </TabsContent>
      <TabsContent value="barter" className="mt-4">
        <Barter prices={priced.prices} />
      </TabsContent>
    </Tabs>
  );
}
