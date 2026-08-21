import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ago, sep } from '@/lib/format';
import { cn } from '@/lib/utils';
import type { DB } from '@/types';

function Stat({ label, value, sub, className }: { label: string; value: string | number; sub?: string; className?: string }) {
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-xs font-medium text-muted-foreground">{label}</p>
        <p className={cn('mt-1 text-2xl font-bold tracking-tight tabular-nums', className)}>{value}</p>
        {sub && <p className="mt-0.5 text-xs text-muted-foreground">{sub}</p>}
      </CardContent>
    </Card>
  );
}

export function Dashboard({ db, income, spend }: { db: DB; income: number; spend: number }) {
  const activity = [
    ...db.jobs.map((j) => ({ at: j.postedAt, text: `${j.postedBy} posted job “${j.name}”`, dot: 'bg-primary' })),
    ...db.jobs.flatMap((j) => j.entries.map((e) => ({
      at: e.at, text: `${e.by} turned in ${e.qty}× ${e.item} for “${j.name}”`, dot: 'bg-emerald-500',
    }))),
    ...db.barrels.map((b) => ({
      at: b.at, text: `${b.owner} rented a barrel (${b.notes || 'no location noted'})`, dot: 'bg-amber-500',
    })),
    ...db.ledger.map((l) => ({
      at: l.at,
      text: `${l.type === 'income' ? '+' : '−'}${sep(l.amount)} s — ${l.desc}`,
      dot: l.type === 'income' ? 'bg-emerald-500' : 'bg-red-500',
    })),
  ].sort((a, b) => (b.at || '').localeCompare(a.at || '')).slice(0, 8);

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Treasury balance" value={sep(income - spend)} sub="septims" />
        <Stat
          label="Open jobs"
          value={db.jobs.filter((j) => j.status === 'open').length}
          sub={`${db.jobs.filter((j) => j.status === 'claimed').length} claimed`}
        />
        <Stat
          label="Barrels rented"
          value={db.barrels.length}
          sub={`${db.barrels.filter((b) => !b.paid).length} unpaid`}
        />
        <Stat label="Members" value={db.members.length} sub="on the roster" />
      </div>

      <Card>
        <CardHeader className="border-b">
          <CardTitle className="text-sm">Recent activity</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {activity.map((a, i) => (
            <div key={i} className="flex items-center gap-3 border-b px-4 py-2.5 text-sm last:border-0">
              <span className={cn('size-1.5 shrink-0 rounded-full', a.dot)} />
              <span className="min-w-0 flex-1 truncate">{a.text}</span>
              <span className="shrink-0 text-xs text-muted-foreground">{ago(a.at)}</span>
            </div>
          ))}
          {activity.length === 0 && (
            <p className="px-4 py-6 text-center text-sm text-muted-foreground">Nothing logged yet.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
