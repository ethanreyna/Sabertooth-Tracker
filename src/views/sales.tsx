import { useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { ArrowDownToLine, ArrowUpFromLine, Plus, Receipt, Trash2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { EmptyState, Field, NameField, TonedBadge } from '@/components/bits';
import { RECIPES } from '@/recipes';
import { pricedItems, tidyName } from '@/lib/prices';
import { ago, sep, uid } from '@/lib/format';
import { cn } from '@/lib/utils';
import type { DB, Price, Sale, SaleLine } from '@/types';

/** Septims in, out, and the difference, for one sale. */
export function saleTotals(sale: Sale) {
  const inn = sale.theirs.reduce((n, l) => n + l.septims, 0);
  const out = sale.ours.reduce((n, l) => n + l.septims, 0);
  return { in: inn, out, net: inn - out };
}

/** Everything a line's name can autocomplete to: the Ledger's priced items,
 *  every recipe, and septims themselves. Free text still works. */
export function saleNames(prices: Price[]): string[] {
  const seen = new Set<string>(['Septims']);
  for (const r of pricedItems(prices)) seen.add(tidyName(r.item));
  for (const r of RECIPES) seen.add(r.name);
  return [...seen];
}

interface Draft extends SaleLine { id: string }

const blank = (): Draft => ({ id: uid(), item: '', qty: 1, septims: 0 });

/** The lines on one side of a sale being written up. */
function LinesEditor({ side, lines, onChange, names }: {
  side: 'theirs' | 'ours';
  lines: Draft[];
  onChange: (lines: Draft[]) => void;
  names: string[];
}) {
  const set = (id: string, patch: Partial<Draft>) =>
    onChange(lines.map((l) => (l.id === id ? { ...l, ...patch } : l)));

  return (
    <div className="space-y-2">
      {lines.map((l, i) => (
        <div key={l.id} className="grid grid-cols-[1fr_4.5rem_5.5rem_auto] items-end gap-2">
          <Field label={i === 0 ? 'Item' : ''} htmlFor={`${side}-item-${l.id}`}>
            <NameField
              id={`${side}-item-${l.id}`} name={`${side}-item-${l.id}`} options={names}
              defaultValue={l.item} placeholder="Item, recipe, or Septims"
              onValueChange={(v) => set(l.id, { item: v })}
            />
          </Field>
          <Field label={i === 0 ? 'Qty' : ''} htmlFor={`${side}-qty-${l.id}`}>
            <Input
              id={`${side}-qty-${l.id}`} type="number" min={1} value={l.qty}
              onChange={(e) => set(l.id, { qty: Math.max(1, Number(e.target.value) || 1) })}
            />
          </Field>
          <Field label={i === 0 ? 'Septims' : ''} htmlFor={`${side}-value-${l.id}`}>
            <Input
              id={`${side}-value-${l.id}`} type="number" min={0} value={l.septims}
              onChange={(e) => set(l.id, { septims: Math.max(0, Number(e.target.value) || 0) })}
            />
          </Field>
          <Button
            type="button" variant="ghost" size="icon-xs" aria-label="Remove line"
            className={i === 0 ? 'mb-1' : ''}
            onClick={() => onChange(lines.filter((x) => x.id !== l.id))}
          >
            <X />
          </Button>
        </div>
      ))}
      <Button type="button" variant="outline" size="xs" onClick={() => onChange([...lines, blank()])}>
        <Plus />Add a line
      </Button>
    </div>
  );
}

function LogSaleDialog({ close, onAdd, memberNames, names }: {
  close: () => void;
  onAdd: (sale: Omit<Sale, 'id' | 'at'>) => void;
  memberNames: string[];
  names: string[];
}) {
  const [theirs, setTheirs] = useState<Draft[]>([blank()]);
  const [ours, setOurs] = useState<Draft[]>([blank()]);

  const clean = (lines: Draft[]): SaleLine[] => lines
    .filter((l) => l.item.trim())
    .map(({ item, qty, septims }) => ({ item: item.trim(), qty, septims }));

  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const t = clean(theirs);
    const o = clean(ours);
    if (t.length === 0 && o.length === 0) return;
    onAdd({
      party: String(f.get('party') || '').trim(),
      theirs: t, ours: o,
      note: String(f.get('note') || '').trim(),
      by: String(f.get('by') || '').trim(),
    });
    close();
  };

  return (
    <Dialog open onOpenChange={(open) => { if (!open) close(); }}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Log a sale</DialogTitle>
          <DialogDescription>
            What came in, what went out, and what each was worth at the counter.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Traded with" htmlFor="sale-party">
              <Input id="sale-party" name="party" autoFocus placeholder="A player, a merchant, another guild" />
            </Field>
            <Field label="Logged by" htmlFor="sale-by">
              <NameField id="sale-by" name="by" options={memberNames} required
                defaultValue={memberNames[0] || ''} placeholder="Pick a member or write in" />
            </Field>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2 rounded-lg border bg-muted/30 p-3">
              <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground [&_svg]:size-3.5">
                <ArrowDownToLine />They gave
              </p>
              <LinesEditor side="theirs" lines={theirs} onChange={setTheirs} names={names} />
            </div>
            <div className="space-y-2 rounded-lg border bg-muted/30 p-3">
              <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground [&_svg]:size-3.5">
                <ArrowUpFromLine />We gave
              </p>
              <LinesEditor side="ours" lines={ours} onChange={setOurs} names={names} />
            </div>
          </div>

          <Field label="Note (optional)" htmlFor="sale-note">
            <Input id="sale-note" name="note" placeholder="Anything worth remembering about this one" />
          </Field>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={close}>Cancel</Button>
            <Button type="submit">Log it</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function Lines({ lines }: { lines: SaleLine[] }) {
  if (lines.length === 0) return <p className="text-xs text-muted-foreground">Nothing</p>;
  return (
    <ul className="space-y-0.5">
      {lines.map((l, i) => (
        <li key={`${l.item}-${i}`} className="flex items-baseline gap-2 text-sm">
          <span className="min-w-0 flex-1 truncate">
            {l.qty !== 1 && <span className="font-semibold tabular-nums">{sep(l.qty)}× </span>}
            {l.item}
          </span>
          <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{sep(l.septims)} s</span>
        </li>
      ))}
    </ul>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: 'green' | 'amber' }) {
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-xs font-medium text-muted-foreground">{label}</p>
        <p className={cn(
          'mt-1 text-2xl font-bold tracking-tight tabular-nums',
          tone === 'green' && 'text-emerald-600 dark:text-emerald-400',
          tone === 'amber' && 'text-amber-600 dark:text-amber-400',
        )}>
          {value < 0 ? '−' : ''}{sep(Math.abs(value))}
        </p>
        <p className="mt-0.5 text-xs text-muted-foreground">septims</p>
      </CardContent>
    </Card>
  );
}

/**
 * The record of trades the guild has actually made — what came in, what went
 * out, and the septims each side was worth when the deal was struck. Values
 * are frozen at logging time on purpose: this is a ledger of what was agreed,
 * not a re-pricing of old deals against today's sheet. Members only; a deal
 * can be written up here by hand or sent over from the Barter tab.
 */
export function SalesTracker({ db, update, prices, memberNames }: {
  db: DB;
  update: (fn: (d: DB) => void) => void;
  prices: Price[];
  memberNames: string[];
}) {
  const [logging, setLogging] = useState(false);
  const names = useMemo(() => saleNames(prices), [prices]);

  const sales = db.sales.slice().sort((a, b) => (b.at || '').localeCompare(a.at || ''));
  const totals = sales.reduce((acc, sale) => {
    const t = saleTotals(sale);
    return { in: acc.in + t.in, out: acc.out + t.out };
  }, { in: 0, out: 0 });
  const net = totals.in - totals.out;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" onClick={() => setLogging(true)}><Receipt />Log a sale</Button>
        <p className="text-xs text-muted-foreground">
          Values are what each side was worth when the deal was logged, and stay that way.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Stat label="Came in" value={totals.in} />
        <Stat label="Went out" value={totals.out} />
        <Stat label="Net" value={net} tone={net > 0 ? 'green' : net < 0 ? 'amber' : undefined} />
      </div>

      {sales.length === 0 ? (
        <EmptyState>
          No sales logged yet. Write one up here, or price a deal on the Barter tab and send it over.
        </EmptyState>
      ) : (
        <div className="space-y-3">
          {sales.map((sale) => {
            const t = saleTotals(sale);
            return (
              <Card key={sale.id} className="py-0">
                <CardContent className="space-y-3 p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-semibold">
                      {sale.party ? `Traded with ${sale.party}` : 'Trade'}
                    </span>
                    <TonedBadge tone={t.net > 0 ? 'green' : t.net < 0 ? 'amber' : 'neutral'}>
                      {t.net === 0 ? 'Even' : t.net > 0 ? `+${sep(t.net)} to the guild` : `${sep(t.net)} to the guild`}
                    </TonedBadge>
                    <span className="ml-auto text-xs text-muted-foreground">
                      {sale.by ? `${sale.by} · ` : ''}{ago(sale.at)}
                    </span>
                    <Button
                      variant="ghost" size="icon-xs" className="text-destructive"
                      aria-label="Remove this sale"
                      onClick={() => {
                        if (confirm('Remove this sale from the tracker?')) {
                          update((d) => { d.sales = d.sales.filter((x) => x.id !== sale.id); });
                        }
                      }}
                    >
                      <Trash2 />
                    </Button>
                  </div>
                  <div className="grid gap-4 md:grid-cols-2">
                    <div>
                      <p className="mb-1 flex items-center justify-between text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                        <span>They gave</span>
                        <span className="tabular-nums">{sep(t.in)} s</span>
                      </p>
                      <Lines lines={sale.theirs} />
                    </div>
                    <div>
                      <p className="mb-1 flex items-center justify-between text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                        <span>We gave</span>
                        <span className="tabular-nums">{sep(t.out)} s</span>
                      </p>
                      <Lines lines={sale.ours} />
                    </div>
                  </div>
                  {sale.note && <p className="text-xs text-muted-foreground">{sale.note}</p>}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {logging && (
        <LogSaleDialog
          close={() => setLogging(false)}
          memberNames={memberNames}
          names={names}
          onAdd={(sale) => update((d) => {
            d.sales.push({ id: uid(), ...sale, at: new Date().toISOString() });
          })}
        />
      )}
    </div>
  );
}
