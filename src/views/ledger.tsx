import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { TonedBadge } from '@/components/bits';
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

export function Ledger({ db, income, spend }: { db: DB; income: number; spend: number }) {
  const rows = db.ledger.slice().sort((a, b) => (b.at || '').localeCompare(a.at || ''));

  return (
    <div className="space-y-4">
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
    </div>
  );
}
