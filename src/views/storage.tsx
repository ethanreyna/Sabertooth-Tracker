import { ImageIcon, Pencil } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState, TonedBadge } from '@/components/bits';
import { dstr, sep } from '@/lib/format';
import { cn } from '@/lib/utils';
import type { DB } from '@/types';

export function Storage({ db, update, readOnly, onEdit }: {
  db: DB; update: (fn: (d: DB) => void) => void; readOnly: boolean;
  onEdit: (id: string) => void;
}) {
  const now = Date.now();
  const units = db.barrels.slice().sort((a, b) => (b.at || '').localeCompare(a.at || ''));

  if (units.length === 0) {
    return <EmptyState>{readOnly ? 'No storage tracked yet.' : 'No storage tracked yet. Add one with New storage.'}</EmptyState>;
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
      {units.map((b) => {
        const left = b.end ? Math.ceil((new Date(b.end).getTime() - now) / 864e5) : null;
        const expired = left !== null && left < 0;

        return (
          <Card key={b.id} className="flex flex-col overflow-hidden py-0">
            {b.img ? (
              <img src={b.img} alt="Storage location" loading="lazy" className="h-36 w-full border-b object-cover" />
            ) : (
              <div className="flex h-36 flex-col items-center justify-center gap-1.5 border-b bg-muted/40 text-muted-foreground">
                <ImageIcon className="size-6" />
                <span className="text-xs">No location screenshot</span>
              </div>
            )}

            <div className="flex flex-1 flex-col gap-2 p-3.5">
              <div className="flex items-center gap-2">
                <span className="min-w-0 flex-1 truncate text-sm font-semibold">{b.owner}</span>
                {readOnly ? (
                  <TonedBadge tone={b.paid ? 'green' : 'amber'}>{b.paid ? 'Paid' : 'Unpaid'}</TonedBadge>
                ) : (
                  <button
                    type="button"
                    aria-label={b.paid ? 'Mark unpaid' : 'Mark paid'}
                    onClick={() => update((d) => { const t = d.barrels.find((x) => x.id === b.id); if (t) t.paid = !t.paid; })}
                  >
                    <TonedBadge tone={b.paid ? 'green' : 'amber'}>{b.paid ? 'Paid' : 'Unpaid'}</TonedBadge>
                  </button>
                )}
              </div>

              <div className="flex flex-wrap gap-1.5">
                <TonedBadge tone={b.guildMember ? 'blue' : 'neutral'}>
                  {b.guildMember ? 'Guild member storage' : 'Non-member'}
                </TonedBadge>
              </div>

              <p className="text-xs text-muted-foreground">
                {dstr(b.start)} – {dstr(b.end)} · {sep(b.rate)} s/week
              </p>
              {b.notes && <p className="text-xs">{b.notes}</p>}

              <div className="mt-auto flex items-center gap-2 pt-1">
                <span className={cn(
                  'text-xs font-medium',
                  expired ? 'text-red-600 dark:text-red-400'
                    : left !== null && left <= 3 ? 'text-amber-600 dark:text-amber-400'
                      : 'text-muted-foreground',
                )}>
                  {expired ? `Expired ${Math.abs(left!)}d ago` : left === null ? '' : `${left} days left`}
                </span>
                {!readOnly && (
                  <>
                    <Button
                      variant="ghost" size="icon-xs" className="ml-auto"
                      aria-label={`Edit ${b.owner}'s storage`} onClick={() => onEdit(b.id)}
                    >
                      <Pencil />
                    </Button>
                    <Button
                      variant="ghost" size="xs" className="text-destructive"
                      onClick={() => {
                        if (confirm('Remove this storage entry?')) {
                          update((d) => { d.barrels = d.barrels.filter((x) => x.id !== b.id); });
                        }
                      }}
                    >
                      Remove
                    </Button>
                  </>
                )}
              </div>
            </div>
          </Card>
        );
      })}
    </div>
  );
}
