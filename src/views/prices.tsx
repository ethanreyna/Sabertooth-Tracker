import { useCallback, useEffect, useMemo, useState } from 'react';
import { ExternalLink, RefreshCw, Search, X } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { EmptyState, TonedBadge } from '@/components/bits';
import { fetchPrices, loadPrices } from '@/sync';
import { ago } from '@/lib/format';
import { cn } from '@/lib/utils';
import type { Price, SyncCfg } from '@/types';

const SHEET_URL =
  'https://docs.google.com/spreadsheets/d/1i5_O_jqz2wPBBNUzjCk0gwMRBIdVdnbIc0BG1S-KMWQ/edit';

const ALL = '__all';

/** Right-align numbers; leave "N/A", "-" and free text looking like text. */
function ValueCell({ value }: { value: string }) {
  const numeric = value !== '' && !Number.isNaN(Number(value.replace(/[g,]/g, '')));
  return (
    <TableCell className={cn(numeric ? 'text-right tabular-nums' : 'text-muted-foreground')}>
      {value || '—'}
    </TableCell>
  );
}

/** One block of rows sharing a category, with columns derived from the rows. */
function PriceTable({ rows }: { rows: Price[] }) {
  // Columns vary per tab, so take the union of labels in first-seen order.
  const labels = useMemo(() => {
    const seen: string[] = [];
    for (const r of rows) {
      for (const k of Object.keys(r.values)) if (!seen.includes(k)) seen.push(k);
    }
    return seen;
  }, [rows]);

  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="min-w-48">Item</TableHead>
            {labels.map((l) => <TableHead key={l} className="whitespace-nowrap">{l}</TableHead>)}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r, i) => (
            <TableRow key={`${r.tab}-${r.category}-${r.item}-${i}`}>
              <TableCell className="font-medium">{r.item.toLowerCase()}</TableCell>
              {labels.map((l) => <ValueCell key={l} value={r.values[l] ?? ''} />)}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

export function Prices() {
  const cached = loadPrices();
  const [prices, setPrices] = useState<Price[]>(cached?.prices ?? []);
  const [syncedAt, setSyncedAt] = useState(cached?.syncedAt ?? '');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [q, setQ] = useState('');
  const [tab, setTab] = useState(ALL);

  // Prices come from the sheet, not the guild database — a guest-safe read.
  const cfg: SyncCfg = { password: '', guest: true };

  const load = useCallback(async (force: boolean) => {
    setBusy(true);
    setErr('');
    try {
      const res = await fetchPrices(cfg, force);
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
      const hay = `${p.item} ${p.category} ${p.tab} ${Object.entries(p.values).flat().join(' ')}`.toLowerCase();
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
            <PriceTable rows={g.rows} />
          </Card>
        ))
      )}

      <p className="text-xs text-muted-foreground">
        Pulled from the guild's Google Sheet through the server, since Google sends no CORS headers.
        Cached 5 minutes; Refresh forces a fresh pull. Each tab is laid out differently, so columns
        are read from whatever headers the sheet uses — an unlabelled column is dropped rather than
        guessed at.
      </p>
    </div>
  );
}
