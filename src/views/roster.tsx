import { Trash2 } from 'lucide-react';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/bits';
import { initials, sep } from '@/lib/format';
import type { DB } from '@/types';

export function Roster({ db, update }: { db: DB; update: (fn: (d: DB) => void) => void }) {
  if (db.members.length === 0) return <EmptyState>No members yet. Add one with Add member.</EmptyState>;

  return (
    <Card className="max-w-3xl overflow-hidden py-0">
      {db.members.map((m) => {
        const claimed = db.jobs.filter((j) => j.claimedBy === m.name).length;
        const posted = db.jobs.filter((j) => j.postedBy === m.name).length;
        const turnedIn = db.jobs.reduce(
          (s, j) => s + j.entries.filter((e) => e.by === m.name).reduce((t, e) => t + e.qty, 0),
          0,
        );

        return (
          <div key={m.id} className="flex items-center gap-3 border-b px-4 py-2.5 last:border-0">
            <Avatar className="size-8">
              <AvatarFallback className="text-[11px] font-semibold">{initials(m.name)}</AvatarFallback>
            </Avatar>
            <span className="min-w-0 flex-1 truncate text-sm font-medium">{m.name}</span>
            <span className="hidden text-xs text-muted-foreground sm:block">{m.role}</span>
            <span className="hidden w-52 text-right text-xs text-muted-foreground md:block">
              {claimed} claimed · {posted} posted · {sep(turnedIn)} items
            </span>
            <Button
              variant="ghost" size="icon-sm" aria-label={`Remove ${m.name}`}
              onClick={() => {
                if (confirm(`Remove ${m.name} from the roster?`)) {
                  update((d) => { d.members = d.members.filter((x) => x.id !== m.id); });
                }
              }}
            >
              <Trash2 />
            </Button>
          </div>
        );
      })}
    </Card>
  );
}
