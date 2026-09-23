import { useMemo, useRef, useState } from 'react';
import type { ClipboardEvent, FormEvent } from 'react';
import { FileImage, ScanText, Wand2, X } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Field, NameField, TonedBadge } from '@/components/bits';
import { NoVisionError, readScreenshot } from '@/sync';
import { usePrices } from '@/views/prices';
import { useLedgerItemSync } from '@/lib/ledger-sync';
import { pricedItems, tidyName } from '@/lib/prices';
import { matchItem, parseInventory } from '@/lib/parse-inventory';
import type { Confidence } from '@/lib/parse-inventory';
import { sep, uid } from '@/lib/format';
import type { BankItem, DB, SyncCfg } from '@/types';

interface Row {
  id: string;
  /** What the screenshot said, kept so a corrected name can be checked against it. */
  read: string;
  name: string;
  qty: number;
  confidence: Confidence;
}

const CONFIDENCE: Record<Confidence, { tone: 'green' | 'amber' | 'red'; label: string }> = {
  exact: { tone: 'green', label: 'Matched' },
  close: { tone: 'amber', label: 'Close match — check it' },
  none: { tone: 'red', label: 'Not in the list — saved as read' },
};

/**
 * Stocks the bank from a screenshot of a Skyrim inventory or container.
 *
 * The picture goes to the vision model for the item list; each name is then
 * matched against the guild's own item names so the bank doesn't end up with
 * "Iron Ingots" next to "Iron Ingot". Every row is shown for review — name,
 * count, how sure the match was — and can be corrected or dropped before
 * anything is written. Pasted text works the same way, for when the model is
 * off or misreads a word.
 */
export function ImportBankDialog({ cfg, db, update, itemNames: catalogueNames, memberNames, close, onAdd }: {
  cfg: SyncCfg;
  db: DB;
  update: (fn: (d: DB) => void) => void;
  /** The catalogue and the guild's own items. The Ledger's names are added here. */
  itemNames: string[];
  memberNames: string[];
  close: () => void;
  onAdd: (items: BankItem[]) => void;
}) {
  // The Ledger names things the catalogue may not — and a pull here also
  // files any of them the Database is missing, same as opening the Ledger.
  const { prices } = usePrices();
  useLedgerItemSync(prices, db, update, true);
  const itemNames = useMemo(() => {
    const seen = new Set(catalogueNames.map((n) => n.trim().toLowerCase()));
    const out = [...catalogueNames];
    for (const r of pricedItems(prices)) {
      const name = tidyName(r.item);
      const key = name.toLowerCase();
      if (!seen.has(key)) { seen.add(key); out.push(name); }
    }
    return out;
  }, [catalogueNames, prices]);

  const [text, setText] = useState('');
  const [rows, setRows] = useState<Row[]>([]);
  const [move, setMove] = useState<BankItem['type']>('in');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [note, setNote] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const read = (raw: string) => {
    setErr('');
    const lines = parseInventory(raw);
    if (lines.length === 0) {
      setErr('No items found in that. Each line should be an item, with its count in brackets.');
      setRows([]);
      return;
    }
    setRows(lines.map((l) => {
      const m = matchItem(l.name, itemNames);
      return { id: uid(), read: l.name, name: m.name, qty: l.qty, confidence: m.confidence };
    }));
  };

  const readImage = async (file: File) => {
    setBusy(true);
    setErr('');
    setNote('');
    try {
      const got = await readScreenshot(cfg, file, 'inventory');
      setText(got);
      if (got.trim()) {
        read(got);
        setNote('Read from the screenshot — check the names and counts against the picture before adding.');
      } else {
        setErr('Nothing legible came back. Try a tighter crop of the item list, or type the items in.');
      }
    } catch (e) {
      setErr(e instanceof NoVisionError
        ? 'Reading screenshots isn’t switched on for this site. Type the items in instead, one per line.'
        : e instanceof Error ? e.message : 'Could not read that screenshot.');
    } finally {
      setBusy(false);
    }
  };

  const onPaste = (e: ClipboardEvent) => {
    const img = [...e.clipboardData.items].find((i) => i.type.startsWith('image/'));
    if (!img) return;
    const file = img.getAsFile();
    if (!file) return;
    e.preventDefault();
    void readImage(file);
  };

  const set = (id: string, patch: Partial<Row>) => setRows((list) => list.map((r) => {
    if (r.id !== id) return r;
    const next = { ...r, ...patch };
    // A corrected name re-checks itself, so the badge tells the truth.
    if (patch.name !== undefined) next.confidence = matchItem(patch.name, itemNames).confidence;
    return next;
  }));

  const total = rows.reduce((n, r) => n + r.qty, 0);
  const unsure = rows.filter((r) => r.confidence !== 'exact').length;

  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const by = String(f.get('by') || '').trim();
    const note = String(f.get('note') || '').trim();
    const at = new Date().toISOString();
    const items: BankItem[] = rows
      .filter((r) => r.name.trim() && r.qty > 0)
      .map((r) => ({ id: uid(), type: move, item: r.name.trim(), qty: r.qty, by, note, at }));
    if (items.length === 0) return;
    onAdd(items);
    close();
  };

  return (
    <Dialog open onOpenChange={(open) => { if (!open) close(); }}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Stock the bank from a screenshot</DialogTitle>
          <DialogDescription>
            Paste or upload a screenshot of a Skyrim inventory or container. Every item on it is
            read, matched to the guild’s item list, and shown here for a look before it’s added.
          </DialogDescription>
        </DialogHeader>

        {err && <Alert variant="destructive"><AlertDescription>{err}</AlertDescription></Alert>}
        {note && <Alert><ScanText /><AlertDescription>{note}</AlertDescription></Alert>}

        <form onSubmit={submit} className="space-y-4">
          <Textarea
            rows={rows.length ? 3 : 7}
            value={text}
            onChange={(e) => { setText(e.target.value); setRows([]); }}
            onPaste={onPaste}
            placeholder={'Paste a screenshot here, or type the items one per line:\nIron Ingot (24)\nLeather Strips (12)\nHealth Potion'}
            className="font-mono text-xs"
          />

          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" onClick={() => read(text)} disabled={busy}>
              <Wand2 />Read it
            </Button>
            <Button type="button" variant="outline" disabled={busy} onClick={() => fileRef.current?.click()}>
              <FileImage />{busy ? 'Reading screenshot…' : 'Use a screenshot'}
            </Button>
            <Input
              ref={fileRef} type="file" accept="image/*" className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = '';
                if (f) void readImage(f);
              }}
            />
          </div>

          {rows.length > 0 && (
            <div className="space-y-3 rounded-lg border bg-muted/30 p-3">
              <div className="flex flex-wrap items-center gap-2">
                <TonedBadge tone="blue">{rows.length} item{rows.length === 1 ? '' : 's'} · {sep(total)} pieces</TonedBadge>
                {unsure > 0 && (
                  <TonedBadge tone="amber">{unsure} to check</TonedBadge>
                )}
                <span className="ml-auto text-xs text-muted-foreground">
                  Fix a name by picking from the list; drop a row with ×.
                </span>
              </div>

              {/* Headings once, above the rows. A row's height varies — a
                  flagged name carries a badge and a hint under it — so a
                  per-row label can't stay level with the one beside it. */}
              <div className="grid grid-cols-[1fr_4.5rem_1.5rem] gap-2 px-2 text-xs text-muted-foreground">
                <span>Item</span>
                <span>Qty</span>
                <span />
              </div>

              <div className="space-y-2">
                {rows.map((r) => (
                  <div key={r.id} className="rounded-md border bg-card/40 p-2">
                    {/* The controls line up with each other at the top; the
                        badge and hint hang below, however tall they get. */}
                    <div className="grid grid-cols-[1fr_4.5rem_1.5rem] items-start gap-2">
                      <div className="min-w-0">
                        <NameField
                          id={`bank-row-${r.id}`} name={`row-${r.id}`} options={itemNames}
                          defaultValue={r.name} placeholder="Pick from the list or write in"
                          onValueChange={(v) => set(r.id, { name: v })}
                        />
                      </div>
                      <Input
                        type="number" min={1} value={r.qty}
                        aria-label={`Quantity of ${r.name || r.read}`}
                        onChange={(e) => set(r.id, { qty: Math.max(1, Math.round(Number(e.target.value) || 1)) })}
                      />
                      <Button
                        type="button" variant="ghost" size="icon"
                        aria-label={`Drop ${r.name || r.read}`}
                        onClick={() => setRows((list) => list.filter((x) => x.id !== r.id))}
                      >
                        <X />
                      </Button>
                    </div>
                    <p className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
                      <TonedBadge tone={CONFIDENCE[r.confidence].tone}>{CONFIDENCE[r.confidence].label}</TonedBadge>
                      {r.read.trim().toLowerCase() !== r.name.trim().toLowerCase() && (
                        <span>read as “{r.read}”</span>
                      )}
                    </p>
                  </div>
                ))}
              </div>

              <div className="grid gap-4 sm:grid-cols-[auto_1fr_1fr]">
                <Field label="Movement">
                  <Tabs value={move} onValueChange={(v) => setMove(v === 'out' ? 'out' : 'in')}>
                    <TabsList>
                      <TabsTrigger value="in">Into the bank</TabsTrigger>
                      <TabsTrigger value="out">Out of it</TabsTrigger>
                    </TabsList>
                  </Tabs>
                </Field>
                <Field label="By" htmlFor="bank-import-by">
                  <NameField id="bank-import-by" name="by" options={memberNames} required
                    defaultValue={memberNames[0] || ''} placeholder="Pick a member or write in" />
                </Field>
                <Field label="Note (optional)" htmlFor="bank-import-note">
                  <Input id="bank-import-note" name="note" placeholder="e.g. Left barrel, guild hall" />
                </Field>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={close}>Cancel</Button>
            <Button type="submit" disabled={rows.length === 0}>
              {move === 'in' ? 'Add' : 'Take'} {rows.length > 0 ? `${rows.length} item${rows.length === 1 ? '' : 's'}` : 'items'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
