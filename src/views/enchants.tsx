import { useState } from 'react';
import type { FormEvent } from 'react';
import { CircleCheck, Sparkles, Trash2, Undo2 } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { EmptyState, Field, NameField, TonedBadge } from '@/components/bits';
import { catalogue } from '@/items';
import { ago, uid } from '@/lib/format';
import { ENCHANTMENTS } from '@/types';
import type { DB, EnchantRequest } from '@/types';

/** The one they are already waiting on, if any. The whole rule lives here so
 *  the form and the suggestion approvals can't disagree about it. */
export const activeFor = (list: EnchantRequest[], who: string): EnchantRequest | undefined =>
  list.find((e) => e.status === 'waiting' && e.who.trim().toLowerCase() === who.trim().toLowerCase());

export function Enchants({ db, update, readOnly, memberNames }: {
  db: DB;
  update: (fn: (d: DB) => void) => void;
  readOnly: boolean;
  memberNames: string[];
}) {
  const [tab, setTab] = useState('waiting');
  const [err, setErr] = useState('');
  const [seq, setSeq] = useState(0);

  const itemNames = catalogue(db.items).map((i) => i.name);

  const sorted = db.enchants.slice().sort((a, b) => (a.at || '').localeCompare(b.at || ''));
  const waiting = sorted.filter((e) => e.status === 'waiting');
  const done = sorted.filter((e) => e.status === 'done').reverse();

  const add = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const who = String(f.get('who') || '').trim();
    const item = String(f.get('item') || '').trim();
    const enchantment = String(f.get('enchantment') || '').trim();
    if (!who || !item) return;

    // One at a time, per person. Checked here rather than left to the person
    // adding it, because the queue is the guild's promise to be fair.
    const held = activeFor(db.enchants, who);
    if (held) {
      setErr(`${who} can't add more than one — ${held.item} is already on the list. `
        + 'Mark that one done first.');
      return;
    }

    setErr('');
    e.currentTarget.reset();
    setSeq((n) => n + 1);
    update((d) => {
      d.enchants.push({
        id: uid(), who, item, enchantment,
        notes: String(f.get('notes') || '').trim(),
        status: 'waiting',
        by: memberNames[0] || '',
        at: new Date().toISOString(),
        doneBy: '', doneAt: '',
      });
    });
  };

  const finish = (id: string) => update((d) => {
    const t = d.enchants.find((x) => x.id === id);
    if (!t) return;
    t.status = 'done';
    t.doneBy = memberNames[0] || '';
    t.doneAt = new Date().toISOString();
  });

  const reopen = (id: string) => {
    const t = db.enchants.find((x) => x.id === id);
    if (!t) return;
    const held = activeFor(db.enchants, t.who);
    if (held) {
      setErr(`${t.who} already has ${held.item} on the list — only one at a time.`);
      return;
    }
    setErr('');
    update((d) => {
      const r = d.enchants.find((x) => x.id === id);
      if (r) { r.status = 'waiting'; r.doneBy = ''; r.doneAt = ''; }
    });
  };

  const remove = (e: EnchantRequest) => {
    if (!confirm(`Take ${e.who}'s ${e.item} off the list?`)) return;
    update((d) => { d.enchants = d.enchants.filter((x) => x.id !== e.id); });
  };

  const queue = (list: EnchantRequest[], numbered: boolean) => (
    <Card className="overflow-hidden py-0">
      <Table>
        <TableHeader>
          <TableRow>
            {numbered && <TableHead className="w-12">#</TableHead>}
            <TableHead className="w-40">Whose</TableHead>
            <TableHead>Item</TableHead>
            <TableHead>Enchantment</TableHead>
            <TableHead className="w-28">Added</TableHead>
            {!readOnly && <TableHead className="w-20" />}
          </TableRow>
        </TableHeader>
        <TableBody>
          {list.map((e, i) => (
            <TableRow key={e.id}>
              {numbered && (
                <TableCell className="font-semibold tabular-nums text-muted-foreground">{i + 1}</TableCell>
              )}
              <TableCell className="font-medium">{e.who}</TableCell>
              <TableCell className="max-w-0 truncate">
                {e.item}
                {e.notes && <span className="text-muted-foreground"> — {e.notes}</span>}
              </TableCell>
              <TableCell>
                {e.enchantment
                  ? <TonedBadge tone="blue">{e.enchantment}</TonedBadge>
                  : <span className="text-xs text-muted-foreground">not specified</span>}
              </TableCell>
              <TableCell className="text-xs text-muted-foreground">
                {e.status === 'done' ? `done ${ago(e.doneAt)}` : ago(e.at)}
              </TableCell>
              {!readOnly && (
                <TableCell>
                  <div className="flex justify-end gap-0.5">
                    {e.status === 'waiting' ? (
                      <Button
                        variant="ghost" size="icon-xs" aria-label={`Mark ${e.item} enchanted`}
                        onClick={() => finish(e.id)}
                      >
                        <CircleCheck />
                      </Button>
                    ) : (
                      <Button
                        variant="ghost" size="icon-xs" aria-label={`Put ${e.item} back on the list`}
                        onClick={() => reopen(e.id)}
                      >
                        <Undo2 />
                      </Button>
                    )}
                    <Button
                      variant="ghost" size="icon-xs" className="text-destructive"
                      aria-label={`Remove ${e.item}`} onClick={() => remove(e)}
                    >
                      <Trash2 />
                    </Button>
                  </div>
                </TableCell>
              )}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Card>
  );

  return (
    <div className="space-y-4">
      {err && <Alert variant="destructive"><AlertDescription>{err}</AlertDescription></Alert>}

      {!readOnly && (
        <Card>
          <CardContent className="p-4">
            <form key={seq} onSubmit={add} className="space-y-3">
              <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground [&_svg]:size-3.5">
                <Sparkles />Put an item on the list
              </p>
              <div className="grid gap-3 sm:grid-cols-3">
                <Field label="Whose item" htmlFor="en-who">
                  <NameField id="en-who" name="who" options={memberNames} required
                    placeholder="Pick a member or write in" />
                </Field>
                <Field label="Item" htmlFor="en-item">
                  <NameField id="en-item" name="item" options={itemNames} required
                    placeholder="Search items, or write one in" />
                </Field>
                <Field label="Enchantment" htmlFor="en-ench">
                  <NameField id="en-ench" name="enchantment" options={ENCHANTMENTS}
                    placeholder="e.g. Fortify Smithing" />
                </Field>
              </div>
              <div className="flex items-end gap-2">
                <Field label="Notes (optional)" htmlFor="en-notes" className="flex-1">
                  <Input id="en-notes" name="notes" placeholder="Soul gem provided, charge level, anything else" />
                </Field>
                <Button type="submit"><Sparkles />Add to the list</Button>
              </div>
              <p className="text-xs text-muted-foreground">
                One item each — a second one is refused until the first is done.
              </p>
            </form>
          </CardContent>
        </Card>
      )}

      <Tabs value={tab} onValueChange={(v) => setTab(v ? String(v) : 'waiting')}>
        <TabsList>
          <TabsTrigger value="waiting">
            Waiting{waiting.length > 0 && <span className="ml-1.5 text-muted-foreground">{waiting.length}</span>}
          </TabsTrigger>
          <TabsTrigger value="done">
            Enchanted{done.length > 0 && <span className="ml-1.5 text-muted-foreground">{done.length}</span>}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="waiting" className="mt-4">
          {waiting.length === 0
            ? <EmptyState>Nobody is waiting. Items go out in the order they were added.</EmptyState>
            : queue(waiting, true)}
        </TabsContent>

        <TabsContent value="done" className="mt-4">
          {done.length === 0
            ? <EmptyState>Nothing has been enchanted yet.</EmptyState>
            : queue(done, false)}
        </TabsContent>
      </Tabs>
    </div>
  );
}
