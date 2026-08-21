import { useMemo } from 'react';
import { Progress } from '@/components/ui/progress';
import { collectedByItem } from '@/sync';
import { sep } from '@/lib/format';
import { cn } from '@/lib/utils';
import type { Job } from '@/types';

function Row({ label, got, want }: { label: string; got: number; want: number }) {
  const done = want > 0 && got >= want;
  const pct = want > 0 ? Math.min(100, (got / want) * 100) : got > 0 ? 100 : 0;
  return (
    <div className="space-y-1">
      <div className="flex items-center gap-2 text-sm">
        <span className="min-w-0 flex-1 truncate capitalize">{label}</span>
        <span className={cn('shrink-0 font-medium tabular-nums', done ? 'text-emerald-600 dark:text-emerald-400' : 'text-muted-foreground')}>
          {sep(got)}{want > 0 ? ` / ${sep(want)}` : ''}
        </span>
      </div>
      <Progress
        value={pct}
        className={cn('[&_[data-slot=progress-indicator]]:transition-all', done
          ? '[&_[data-slot=progress-indicator]]:bg-emerald-500'
          : '[&_[data-slot=progress-indicator]]:bg-amber-500')}
      />
    </div>
  );
}

/** How much of each requested item has actually come in. */
export function CollectionProgress({ job }: { job: Job }) {
  const collected = useMemo(() => collectedByItem(job), [job]);
  const extras = useMemo(() => {
    const wanted = new Set(job.items.map((t) => t.item.trim().toLowerCase()));
    return [...collected].filter(([k]) => !wanted.has(k));
  }, [job.items, collected]);

  if (!job.items.length && extras.length === 0) {
    return <p className="text-sm text-muted-foreground">No items requested yet.</p>;
  }

  return (
    <div className="space-y-3">
      {job.items.map((t) => (
        <Row key={t.item} label={t.item} got={collected.get(t.item.trim().toLowerCase()) || 0} want={t.qty} />
      ))}
      {extras.map(([k, v]) => <Row key={k} label={`${k} (extra)`} got={v} want={0} />)}
    </div>
  );
}
