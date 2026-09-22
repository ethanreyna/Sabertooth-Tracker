import { useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { ArrowDownToLine, ArrowUpFromLine, Pencil, Plus, Receipt, Trash2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { EmptyState, Field, NameField, TonedBadge } from '@/components/bits';
import { RECIPES } from '@/recipes';
import { pricedItems, tidyName } from '@/lib/prices';
import { ago, sep, uid } from '@/lib/format';
import { cn } from '@/lib/utils';
import type { DB, Price, Sale, SaleLine } from '@/types';

/** Septims in, out, and the difference, for one sale. */
export function saleTotals(sale: Pick<Sale, 'theirs' | 'ours'>) {
  const inn = sale.theirs.reduce((n, l) => n + l.septims, 0);
  const out = sale.ours.reduce((n, l) => n + l.septims, 0);
  return { in: inn, out, net: inn - out };
}

/** Everything a line's name can autocomplete to: the Ledger's priced items
 *  and every recipe. Coin has its own control, so it isn't offered here. */
export function saleNames(prices: Price[]): string[] {
  const seen = new Set<string>();
  for (const r of pricedItems(prices)) seen.add(tidyName(r.item));
  for (const r of RECIPES) seen.add(r.name);
  return [...seen];
}

/** Coin is recorded as an ordinary line named this, on whichever side paid
 *  it, so the totals need no special case. The dialog pulls it back out into
 *  its Gained / Lost control when a sale is edited. */
const SEPTIMS = 'Septims';
const isCoin = (l: SaleLine) => l.item.trim().toLowerCase() === SEPTIMS.toLowerCase();

/** A sale as the dialog works on it — everything but id and timestamp. */
export type SaleDraft = Omit<Sale, 'id' | 'at'>;

interface Draft extends SaleLine { id: string }

const blank = (): Draft => ({ id: uid(), item: '', qty: 1, septims: 0 });
const toDrafts = (lines: SaleLine[]): Draft[] => lines.map((l) => ({ ...l, id: uid() }));

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
              defaultValue={l.item} placeholder="Item or recipe"
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

function SideHeading({ side, total }: { side: 'theirs' | 'ours'; total?: number }) {
  return (
    <p className="mb-1 flex items-center justify-between gap-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground [&_svg]:size-3.5">
      <span className="flex items-center gap-1.5">
        {side === 'theirs' ? <ArrowDownToLine /> : <ArrowUpFromLine />}
        {side === 'theirs' ? 'They gave' : 'We gave'}
      </span>
      {total !== undefined && <span className="tabular-nums">{sep(total)} s</span>}
    </p>
  );
}

type Direction = 'gained' | 'lost';

/**
 * Writes a sale up, or edits one. The item lines on each side are editable,
 * or — when the deal arrives from Barter — shown as a read-only preview so
 * what's being logged is plain before it is. Coin has its own control:
 * Gained means the other party paid the guild the difference, Lost means the
 * guild paid them. It defaults to whatever squares the two piles, since
 * that's what the barter tool said to ask for.
 */
export function SaleDialog({ title, action, initial, preview = false, close, onSave, memberNames, names = [] }: {
  title: string;
  action: string;
  initial: SaleDraft;
  /** Show the lines as a fixed preview rather than editors. */
  preview?: boolean;
  close: () => void;
  onSave: (draft: SaleDraft) => void;
  memberNames: string[];
  names?: string[];
}) {
  // Coin comes out of the lines and into its own control; whatever's left
  // is goods. Editing then round-trips: save puts the coin line back.
  const [theirs, setTheirs] = useState<Draft[]>(() => {
    const goods = toDrafts(initial.theirs.filter((l) => !isCoin(l)));
    return goods.length || preview ? goods : [blank()];
  });
  const [ours, setOurs] = useState<Draft[]>(() => {
    const goods = toDrafts(initial.ours.filter((l) => !isCoin(l)));
    return goods.length || preview ? goods : [blank()];
  });

  const goodsIn = theirs.reduce((n, l) => n + l.septims, 0);
  const goodsOut = ours.reduce((n, l) => n + l.septims, 0);
  // Positive when they owe the guild the difference.
  const owed = goodsOut - goodsIn;

  const coinIn = initial.theirs.filter(isCoin).reduce((n, l) => n + l.septims, 0);
  const coinOut = initial.ours.filter(isCoin).reduce((n, l) => n + l.septims, 0);
  const recorded = coinIn - coinOut;
  const hadCoin = coinIn > 0 || coinOut > 0;

  const [dir, setDir] = useState<Direction>(() => (hadCoin ? recorded : owed) >= 0 ? 'gained' : 'lost');
  const [coin, setCoin] = useState<number>(() => Math.abs(Math.round(hadCoin ? recorded : owed)));

  const clean = (lines: Draft[]): SaleLine[] => lines
    .filter((l) => l.item.trim())
    .map(({ item, qty, septims }) => ({ item: item.trim(), qty, septims }));

  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const t = clean(theirs);
    const o = clean(ours);
    if (coin > 0) (dir === 'gained' ? t : o).push({ item: SEPTIMS, qty: coin, septims: coin });
    if (t.length === 0 && o.length === 0) return;
    onSave({
      party: String(f.get('party') || '').trim(),
      theirs: t, ours: o,
      note: String(f.get('note') || '').trim(),
      by: String(f.get('by') || '').trim(),
    });
    close();
  };

  const finalIn = goodsIn + (dir === 'gained' ? coin : 0);
  const finalOut = goodsOut + (dir === 'lost' ? coin : 0);

  return (
    <Dialog open onOpenChange={(open) => { if (!open) close(); }}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            {preview
              ? 'Both sides go in at today’s prices, and the counter is cleared once it’s logged.'
              : 'What came in, what went out, and what each was worth at the counter.'}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Traded with" htmlFor="sale-party">
              <Input id="sale-party" name="party" autoFocus defaultValue={initial.party}
                placeholder="A player, a merchant, another guild" />
            </Field>
            <Field label="Logged by" htmlFor="sale-by">
              <NameField id="sale-by" name="by" options={memberNames} required
                defaultValue={initial.by || memberNames[0] || ''} placeholder="Pick a member or write in" />
            </Field>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2 rounded-lg border bg-muted/30 p-3">
              <SideHeading side="theirs" total={preview ? goodsIn : undefined} />
              {preview
                ? <Lines lines={clean(theirs)} />
                : <LinesEditor side="theirs" lines={theirs} onChange={setTheirs} names={names} />}
            </div>
            <div className="space-y-2 rounded-lg border bg-muted/30 p-3">
              <SideHeading side="ours" total={preview ? goodsOut : undefined} />
              {preview
                ? <Lines lines={clean(ours)} />
                : <LinesEditor side="ours" lines={ours} onChange={setOurs} names={names} />}
            </div>
          </div>

          <div className="space-y-2 rounded-lg border p-3">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Septims that changed hands
            </p>
            <div className="flex flex-wrap items-center gap-3">
              <Tabs value={dir} onValueChange={(v) => setDir(v === 'lost' ? 'lost' : 'gained')}>
                <TabsList>
                  <TabsTrigger value="gained">Gained</TabsTrigger>
                  <TabsTrigger value="lost">Lost</TabsTrigger>
                </TabsList>
              </Tabs>
              <Input
                type="number" min={0} value={coin} aria-label="Septims"
                className="w-32 tabular-nums"
                onChange={(e) => setCoin(Math.max(0, Math.round(Number(e.target.value) || 0)))}
              />
              <span className="text-xs text-muted-foreground">
                {dir === 'gained' ? 'they paid the guild' : 'the guild paid them'}
                {owed !== 0 && (
                  <> · the goods alone are {sep(Math.abs(owed))} {owed > 0 ? 'in the guild’s favour' : 'against the guild'}</>
                )}
              </span>
            </div>
            <p className="text-xs text-muted-foreground">
              Logged as {sep(finalIn)} in and {sep(finalOut)} out —{' '}
              {finalIn === finalOut
                ? 'an even trade.'
                : finalIn > finalOut
                  ? `${sep(finalIn - finalOut)} to the guild.`
                  : `${sep(finalOut - finalIn)} from the guild.`}
            </p>
          </div>

          <Field label="Note (optional)" htmlFor="sale-note">
            <Input id="sale-note" name="note" defaultValue={initial.note}
              placeholder="Anything worth remembering about this one" />
          </Field>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={close}>Cancel</Button>
            <Button type="submit"><Receipt />{action}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

const EMPTY_DRAFT: SaleDraft = { party: '', theirs: [], ours: [], note: '', by: '' };

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
 * can be written up here by hand or sent over from the Barter tab, and
 * corrected afterwards either way.
 */
export function SalesTracker({ db, update, prices, memberNames }: {
  db: DB;
  update: (fn: (d: DB) => void) => void;
  prices: Price[];
  memberNames: string[];
}) {
  const [logging, setLogging] = useState(false);
  const [editing, setEditing] = useState<Sale | null>(null);
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
                      variant="ghost" size="icon-xs" aria-label="Edit this sale"
                      onClick={() => setEditing(sale)}
                    >
                      <Pencil />
                    </Button>
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
                      <SideHeading side="theirs" total={t.in} />
                      <Lines lines={sale.theirs} />
                    </div>
                    <div>
                      <SideHeading side="ours" total={t.out} />
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
        <SaleDialog
          title="Log a sale" action="Log it"
          initial={EMPTY_DRAFT}
          close={() => setLogging(false)}
          memberNames={memberNames} names={names}
          onSave={(draft) => update((d) => {
            d.sales.push({ id: uid(), ...draft, at: new Date().toISOString() });
          })}
        />
      )}

      {editing && (
        <SaleDialog
          title="Edit sale" action="Save"
          initial={editing}
          close={() => setEditing(null)}
          memberNames={memberNames} names={names}
          onSave={(draft) => update((d) => {
            const t = d.sales.find((x) => x.id === editing.id);
            // The timestamp stays: it says when the deal happened, not when
            // somebody last fixed a typo in it.
            if (t) Object.assign(t, draft);
          })}
        />
      )}
    </div>
  );
}
