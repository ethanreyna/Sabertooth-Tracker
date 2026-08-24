import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { EmptyState, TonedBadge } from '@/components/bits';
import { Trash2 } from 'lucide-react';
import { dstr, sep } from '@/lib/format';
import { cn } from '@/lib/utils';
import type { DB } from '@/types';

function Stat({ label, value, className }: { label: string; value: string; className?: string }) {
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-xs font-medium text-muted-foreground">{label}</p>
        <p className={cn('mt-1 text-2xl font-bold tracking-tight tabular-nums', className)}>{value}</p>
      </CardContent>
    </Card>
  );
}

/** Current stock per item: everything put in, less everything taken out. */
function stockOf(db: DB): Array<{ item: string; qty: number; last: string }> {
  const byItem = new Map<string, { item: string; qty: number; last: string }>();
  for (const e of db.bankItems) {
    const key = e.item.trim().toLowerCase();
    if (!key) continue;
    const row = byItem.get(key) ?? { item: e.item.trim(), qty: 0, last: '' };
    row.qty += (e.type === 'out' ? -1 : 1) * Number(e.qty || 0);
    if ((e.at || '') > row.last) row.last = e.at || '';
    byItem.set(key, row);
  }
  return [...byItem.values()].sort((a, b) => b.qty - a.qty || a.item.localeCompare(b.item));
}

export function Ledger({ db, income, spend, readOnly, update }: {
  db: DB; income: number; spend: number; readOnly: boolean;
  update: (fn: (d: DB) => void) => void;
}) {
  const [tab, setTab] = useState('septims');

  const rows = db.ledger.slice().sort((a, b) => (b.at || '').localeCompare(a.at || ''));
  const entries = db.bankItems.slice().sort((a, b) => (b.at || '').localeCompare(a.at || ''));
  const stock = stockOf(db);

  return (
    <Tabs value={tab} onValueChange={(v) => setTab(v ? String(v) : 'septims')}>
      <TabsList>
        <TabsTrigger value="septims">Septims</TabsTrigger>
        <TabsTrigger value="items">
          Items{stock.length > 0 && <span className="ml-1.5 text-muted-foreground">{stock.length}</span>}
        </TabsTrigger>
      </TabsList>

      <TabsContent value="septims" className="mt-4 space-y-4">
        <div className="grid gap-3 sm:grid-cols-3">
          <Stat label="Balance" value={sep(income - spend)} />
          <Stat label="Income" value={sep(income)} className="text-emerald-600 dark:text-emerald-400" />
          <Stat label="Spending" value={sep(spend)} className="text-red-600 dark:text-red-400" />
        </div>

        <Card className="overflow-hidden py-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-28">Type</TableHead>
                <TableHead>Description</TableHead>
                <TableHead className="w-36">By</TableHead>
                <TableHead className="w-28">Date</TableHead>
                <TableHead className="w-32 text-right">Amount</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((l) => (
                <TableRow key={l.id}>
                  <TableCell>
                    <TonedBadge tone={l.type === 'income' ? 'green' : 'red'}>
                      {l.type === 'income' ? 'Income' : 'Spending'}
                    </TonedBadge>
                  </TableCell>
                  <TableCell className="max-w-0 truncate">{l.desc}</TableCell>
                  <TableCell className="text-muted-foreground">{l.by}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{dstr(l.at)}</TableCell>
                  <TableCell className={cn(
                    'text-right font-semibold tabular-nums',
                    l.type === 'income' ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400',
                  )}>
                    {l.type === 'income' ? '+' : '−'}{sep(l.amount)} s
                  </TableCell>
                </TableRow>
              ))}
              {rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="py-6 text-center text-muted-foreground">
                    No ledger entries yet.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </Card>
      </TabsContent>

      <TabsContent value="items" className="mt-4 space-y-4">
        {entries.length === 0 ? (
          <EmptyState>
            Nothing in guild storage yet. Use <span className="font-medium">New item</span> to log what
            someone puts in or takes out.
          </EmptyState>
        ) : (
          <>
            <Card className="overflow-hidden py-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>In stock</TableHead>
                    <TableHead className="w-32">Last movement</TableHead>
                    <TableHead className="w-24 text-right">Qty</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {stock.map((r) => (
                    <TableRow key={r.item}>
                      <TableCell className="font-medium">{r.item}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{dstr(r.last)}</TableCell>
                      <TableCell className={cn(
                        'text-right font-semibold tabular-nums',
                        r.qty < 0 && 'text-red-600 dark:text-red-400',
                      )}>
                        {sep(r.qty)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>

            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Movement log
              </p>
              <Card className="overflow-hidden py-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-24">Type</TableHead>
                      <TableHead>Item</TableHead>
                      <TableHead className="w-36">By</TableHead>
                      <TableHead className="w-28">Date</TableHead>
                      <TableHead className="w-20 text-right">Qty</TableHead>
                      {!readOnly && <TableHead className="w-10" />}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {entries.map((e) => (
                      <TableRow key={e.id}>
                        <TableCell>
                          <TonedBadge tone={e.type === 'in' ? 'green' : 'red'}>
                            {e.type === 'in' ? 'Put in' : 'Took out'}
                          </TonedBadge>
                        </TableCell>
                        <TableCell className="max-w-0 truncate">
                          {e.item}
                          {e.note && <span className="text-muted-foreground"> — {e.note}</span>}
                        </TableCell>
                        <TableCell className="text-muted-foreground">{e.by}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{dstr(e.at)}</TableCell>
                        <TableCell className="text-right font-semibold tabular-nums">
                          {e.type === 'in' ? '+' : '−'}{sep(e.qty)}
                        </TableCell>
                        {!readOnly && (
                          <TableCell>
                            <Button
                              variant="ghost" size="icon-xs" aria-label="Delete entry"
                              onClick={() => update((d) => {
                                d.bankItems = d.bankItems.filter((x) => x.id !== e.id);
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
            </div>
          </>
        )}
      </TabsContent>
    </Tabs>
  );
}
