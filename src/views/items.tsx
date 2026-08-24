import { useMemo, useState } from 'react';
import { Pencil, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { EmptyState, TonedBadge } from '@/components/bits';
import { ITEMS } from '@/items';
import { cn } from '@/lib/utils';
import type { DB } from '@/types';

const ALL = '__all';

/** Rows the table shows: the built-in catalogue and the guild's own additions,
 *  merged, with only the latter editable. */
type Row = { name: string; cat: string; notes: string; id: string; custom: boolean };

function rows(db: DB): Row[] {
  const byName = new Map<string, Row>();

  for (const i of ITEMS) {
    byName.set(i.name.toLowerCase(), { name: i.name, cat: i.cat, notes: '', id: '', custom: false });
  }
  for (const c of db.items) {
    const name = c.name.trim();
    if (!name) continue;
    byName.set(name.toLowerCase(), {
      name,
      cat: c.category.trim() || 'Custom',
      notes: c.notes,
      id: c.id,
      // A custom entry that shadows a built-in is still the guild's record, so
      // it stays editable — that is how a category gets corrected.
      custom: true,
    });
  }
  return [...byName.values()].sort((a, b) => a.name.localeCompare(b.name));
}

export function Items({ db, update, readOnly, onEdit }: {
  db: DB;
  update: (fn: (d: DB) => void) => void;
  readOnly: boolean;
  onEdit: (id: string) => void;
}) {
  const [q, setQ] = useState('');
  const [cat, setCat] = useState(ALL);

  const all = useMemo(() => rows(db), [db]);
  const cats = useMemo(
    () => [...new Set(all.map((r) => r.cat))].sort((a, b) => a.localeCompare(b)),
    [all],
  );

  const needle = q.trim().toLowerCase();
  const shown = all.filter((r) => {
    if (cat !== ALL && r.cat !== cat) return false;
    if (!needle) return true;
    return r.name.toLowerCase().includes(needle) || r.notes.toLowerCase().includes(needle);
  });

  const customCount = db.items.length;

  const table = (list: Row[]) => (
    <Card className="overflow-hidden py-0">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Item</TableHead>
            <TableHead className="w-32">Category</TableHead>
            <TableHead>Notes</TableHead>
            <TableHead className="w-28">Source</TableHead>
            {!readOnly && <TableHead className="w-20" />}
          </TableRow>
        </TableHeader>
        <TableBody>
          {list.map((r) => (
            <TableRow key={r.name}>
              <TableCell className="font-medium">{r.name}</TableCell>
              <TableCell className="text-muted-foreground">{r.cat}</TableCell>
              <TableCell className="max-w-0 truncate text-muted-foreground">{r.notes}</TableCell>
              <TableCell>
                <TonedBadge tone={r.custom ? 'blue' : 'neutral'}>
                  {r.custom ? 'Guild' : 'Built in'}
                </TonedBadge>
              </TableCell>
              {!readOnly && (
                <TableCell className={cn('text-right', !r.custom && 'opacity-0')}>
                  {r.custom && (
                    <div className="flex justify-end gap-0.5">
                      <Button
                        variant="ghost" size="icon-xs" aria-label={`Edit ${r.name}`}
                        onClick={() => onEdit(r.id)}
                      >
                        <Pencil />
                      </Button>
                      <Button
                        variant="ghost" size="icon-xs" aria-label={`Remove ${r.name}`}
                        onClick={() => {
                          if (confirm(`Remove ${r.name} from the guild's item list?`)) {
                            update((d) => { d.items = d.items.filter((x) => x.id !== r.id); });
                          }
                        }}
                      >
                        <Trash2 />
                      </Button>
                    </div>
                  )}
                </TableCell>
              )}
            </TableRow>
          ))}
          {list.length === 0 && (
            <TableRow>
              <TableCell colSpan={readOnly ? 4 : 5} className="py-6 text-center text-muted-foreground">
                Nothing matches “{q}”.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </Card>
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Input
          placeholder="Search items" value={q} onChange={(e) => setQ(e.target.value)}
          className="h-8 w-64 max-sm:w-full"
        />
        <p className="text-xs text-muted-foreground">
          {all.length} items — {ITEMS.length} built in, {customCount} added by the guild.
          Everything here is offered wherever items are picked: collection jobs, item rewards
          and guild storage.
        </p>
      </div>

      {all.length === 0 ? (
        <EmptyState>No items yet.</EmptyState>
      ) : (
        <Tabs value={cat} onValueChange={(v) => setCat(v ? String(v) : ALL)}>
          <TabsList className="flex-wrap">
            <TabsTrigger value={ALL}>All</TabsTrigger>
            {cats.map((c) => <TabsTrigger key={c} value={c}>{c}</TabsTrigger>)}
          </TabsList>
          <TabsContent value={ALL} className="mt-4">{table(shown)}</TabsContent>
          {cats.map((c) => (
            <TabsContent key={c} value={c} className="mt-4">{table(shown)}</TabsContent>
          ))}
        </Tabs>
      )}
    </div>
  );
}
