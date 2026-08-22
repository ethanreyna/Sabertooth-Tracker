import { useCallback, useEffect, useMemo, useState } from 'react';
import { ExternalLink, RefreshCw } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { EmptyState } from '@/components/bits';
import { fetchPrices, loadPrices } from '@/sync';
import { ago } from '@/lib/format';
import { cn } from '@/lib/utils';
import type { Price, SyncCfg } from '@/types';

const SHEET_URL =
  'https://docs.google.com/spreadsheets/d/1i5_O_jqz2wPBBNUzjCk0gwMRBIdVdnbIc0BG1S-KMWQ/edit';

/** Right-align numbers, but leave "N/A" / "-" looking like text. */
function Cell({ value }: { value: string }) {
  const numeric = value !== '' && !Number.isNaN(Number(value));
  return (
    <TableCell className={cn('text-right', numeric ? 'tabular-nums' : 'text-muted-foreground')}>
      {value || '—'}
    </TableCell>
  );
}

export function Prices() {
  const cached = loadPrices();
  const [prices, setPrices] = useState<Price[]>(cached?.prices ?? []);
  const [syncedAt, setSyncedAt] = useState(cached?.syncedAt ?? '');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [q, setQ] = useState('');

  // Prices come straight from the sheet, not the guild database, so this is a
  // guest-safe read either way.
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

  // Only auto-pull when there's nothing cached; otherwise Refresh is explicit.
  useEffect(() => {
    if (!cached) void load(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const ql = q.trim().toLowerCase();
  const groups = useMemo(() => {
    const filtered = ql
      ? prices.filter((p) => `${p.item} ${p.category}`.toLowerCase().includes(ql))
      : prices;
    const map = new Map<string, Price[]>();
    for (const p of filtered) {
      const k = p.category || 'Other';
      const list = map.get(k);
      if (list) list.push(p);
      else map.set(k, [p]);
    }
    return [...map];
  }, [prices, ql]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Input
          placeholder="Search items" value={q} onChange={(e) => setQ(e.target.value)}
          className="h-8 w-56"
        />
        <span className="text-xs text-muted-foreground">
          {syncedAt ? `Updated ${ago(syncedAt)}` : 'Not loaded yet'}
          {prices.length ? ` · ${prices.length} items` : ''}
        </span>
        <div className="ml-auto flex items-center gap-2">
          <Button variant="ghost" size="sm" render={<a href={SHEET_URL} target="_blank" rel="noreferrer" />}>
            <ExternalLink />
            Open sheet
          </Button>
          <Button size="sm" disabled={busy} onClick={() => void load(true)}>
            <RefreshCw className={busy ? 'animate-spin' : undefined} />
            {busy ? 'Pulling…' : 'Refresh prices'}
          </Button>
        </div>
      </div>

      {err && (
        <Alert variant="destructive">
          <AlertDescription>{err}</AlertDescription>
        </Alert>
      )}

      {groups.length === 0 ? (
        <EmptyState>
          {busy ? 'Pulling prices from the sheet…'
            : ql ? 'No items match that search.'
              : 'No prices loaded. Hit Refresh prices to pull from the sheet.'}
        </EmptyState>
      ) : (
        groups.map(([category, rows]) => (
          <Card key={category} className="overflow-hidden py-0">
            <div className="border-b bg-muted/40 px-4 py-2">
              <h2 className="text-sm font-semibold">{category}</h2>
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Item</TableHead>
                  <TableHead className="w-32 text-right">Make price</TableHead>
                  <TableHead className="w-32 text-right">Price of 1</TableHead>
                  <TableHead className="w-28 text-right">Sell</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((p) => (
                  <TableRow key={`${category}-${p.item}`}>
                    <TableCell className="font-medium capitalize">{p.item.toLowerCase()}</TableCell>
                    <Cell value={p.make} />
                    <Cell value={p.unit} />
                    <Cell value={p.sell} />
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        ))
      )}

      <p className="text-xs text-muted-foreground">
        Pulled from the guild's Google Sheet through the server (Google sends no CORS headers, so the
        browser can't read it directly). Cached for 5 minutes; Refresh forces a fresh pull.
      </p>
    </div>
  );
}
