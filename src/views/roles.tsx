import { Pencil, Trash2, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState, TonedBadge } from '@/components/bits';
import { STARTER_ROLES } from '@/data';
import { uid } from '@/lib/format';
import type { DB } from '@/types';

export function Roles({ db, update, onEdit, readOnly }: {
  db: DB;
  update: (fn: (d: DB) => void) => void;
  onEdit: (roleId: string) => void;
  readOnly: boolean;
}) {
  const seed = () => update((d) => {
    const existing = new Set(d.roles.map((r) => r.name.toLowerCase()));
    for (const r of STARTER_ROLES) {
      if (!existing.has(r.name.toLowerCase())) d.roles.push({ id: uid(), ...r });
    }
  });

  const remove = (id: string, name: string) => {
    const holders = db.members.filter((m) => m.role === name);
    const msg = holders.length
      ? `Delete the “${name}” role? ${holders.length} member${holders.length === 1 ? '' : 's'} will be left with no role.`
      : `Delete the “${name}” role?`;
    if (!confirm(msg)) return;
    update((d) => {
      d.roles = d.roles.filter((r) => r.id !== id);
      // Leave the member record valid rather than pointing at a role that's gone.
      for (const m of d.members) if (m.role === name) m.role = '';
    });
  };

  if (db.roles.length === 0) {
    if (readOnly) return <EmptyState>No roles defined yet.</EmptyState>;
    return (
      <div className="space-y-3">
        <EmptyState>
          No roles yet. Create one with New role, or start from a standard set.
        </EmptyState>
        <div className="flex justify-center">
          <Button variant="outline" size="sm" onClick={seed}>
            <Sparkles />
            Add the five standard ranks
          </Button>
        </div>
      </div>
    );
  }

  return (
    <Card className="max-w-3xl overflow-hidden py-0">
      {db.roles.map((r) => {
        const count = db.members.filter((m) => m.role === r.name).length;
        return (
          <div key={r.id} className="flex items-start gap-3 border-b px-4 py-3 last:border-0">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium">{r.name}</span>
                <TonedBadge tone={count ? 'blue' : 'neutral'}>
                  {count} member{count === 1 ? '' : 's'}
                </TonedBadge>
              </div>
              {r.desc && <p className="mt-0.5 text-xs text-muted-foreground">{r.desc}</p>}
              {r.advanceAfter > 0 && r.advanceTo && (
                <p className="mt-1 text-xs text-sky-700 dark:text-sky-400">
                  Advances to {r.advanceTo} after {r.advanceAfter} completion{r.advanceAfter === 1 ? '' : 's'}
                </p>
              )}
            </div>
            {!readOnly && (
              <>
                <Button variant="ghost" size="icon-sm" aria-label={`Edit ${r.name}`} onClick={() => onEdit(r.id)}>
                  <Pencil />
                </Button>
                <Button variant="ghost" size="icon-sm" aria-label={`Delete ${r.name}`} onClick={() => remove(r.id, r.name)}>
                  <Trash2 />
                </Button>
              </>
            )}
          </div>
        );
      })}
    </Card>
  );
}
