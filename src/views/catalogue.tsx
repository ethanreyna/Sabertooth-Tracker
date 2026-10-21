import { useMemo, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import {
  ArrowDown, ArrowUp, ClipboardPaste, Eye, EyeOff, ImageUp, Pencil, Plus, RotateCcw, Save, Trash2, X,
} from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { Field } from '@/components/bits';
import { DEFAULT_BOARD } from '@/data';
import { catalogue as itemCatalogue } from '@/items';
import { uid } from '@/lib/format';
import { parseCatalogueText } from '@/lib/parse-catalogue';
import { uploadImage } from '@/sync';
import { cn } from '@/lib/utils';
import type { CatalogueItem, DB, Noticeboard, SyncCfg } from '@/types';

export type CatalogueTab = 'list' | 'board';

/**
 * Where the clan keeps its shop window: the price list strangers read off the
 * noticeboard, and the noticeboard's own words. Members only — what is saved
 * here is public the moment it lands.
 */
export function Catalogue({ db, update, cfg, tab, onTabChange }: {
  db: DB;
  update: (fn: (d: DB) => void) => void;
  cfg: SyncCfg | null;
  tab: CatalogueTab;
  onTabChange: (t: CatalogueTab) => void;
}) {
  const shown = db.catalogue.filter((c) => !c.hidden).length;
  return (
    <Tabs value={tab} onValueChange={(v) => onTabChange(v as CatalogueTab)}>
      <TabsList>
        <TabsTrigger value="list">
          Price list{db.catalogue.length > 0 && <span className="ml-1.5 text-muted-foreground">{shown}</span>}
        </TabsTrigger>
        <TabsTrigger value="board">Noticeboard</TabsTrigger>
      </TabsList>

      <TabsContent value="list" className="mt-4">
        <PriceListEditor db={db} update={update} />
      </TabsContent>
      <TabsContent value="board" className="mt-4">
        <BoardEditor db={db} update={update} cfg={cfg} />
      </TabsContent>
    </Tabs>
  );
}

/* ------------------------------------------------------------------------- */
/* The price list                                                             */
/* ------------------------------------------------------------------------- */

const SECTION_FALLBACK = 'Wares';
const sectionOf = (c: CatalogueItem) => c.section || SECTION_FALLBACK;

/** Sections in the order they first appear, which is the order the public reads. */
function groups(items: CatalogueItem[]): Array<[string, CatalogueItem[]]> {
  const m = new Map<string, CatalogueItem[]>();
  for (const it of items) {
    const k = sectionOf(it);
    const list = m.get(k);
    if (list) list.push(it);
    else m.set(k, [it]);
  }
  return [...m.entries()];
}

const priceOf = (text: string) => {
  const n = Number(text.replace(/[,\s]/g, ''));
  return Number.isFinite(n) && n > 0 ? Math.round(n) : 0;
};

function PriceListEditor({ db, update }: { db: DB; update: (fn: (d: DB) => void) => void }) {
  const [section, setSection] = useState('');
  const [name, setName] = useState('');
  const [price, setPrice] = useState('');
  const [note, setNote] = useState('');
  const [editing, setEditing] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [pasting, setPasting] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);

  const sections = useMemo(() => groups(db.catalogue).map(([s]) => s), [db.catalogue]);
  const itemNames = useMemo(() => itemCatalogue(db.items).map((i) => i.name), [db.items]);

  const add = (e: FormEvent) => {
    e.preventDefault();
    const clean = name.trim();
    if (!clean) return;
    update((d) => {
      d.catalogue.push({
        id: uid(), section: section.trim(), name: clean, price: priceOf(price), note: note.trim(), hidden: false,
      });
    });
    // Section stays: lists are usually typed a section at a time.
    setName(''); setPrice(''); setNote('');
    nameRef.current?.focus();
  };

  /** Swaps with the neighbour in the same section, leaving other sections be. */
  const move = (id: string, dir: -1 | 1) => update((d) => {
    const i = d.catalogue.findIndex((c) => c.id === id);
    if (i < 0) return;
    const key = sectionOf(d.catalogue[i]);
    let j = i + dir;
    while (j >= 0 && j < d.catalogue.length && sectionOf(d.catalogue[j]) !== key) j += dir;
    if (j < 0 || j >= d.catalogue.length) return;
    [d.catalogue[i], d.catalogue[j]] = [d.catalogue[j], d.catalogue[i]];
  });

  /** Moves a whole section ahead of, or behind, its neighbour. */
  const moveSection = (key: string, dir: -1 | 1) => update((d) => {
    const order = groups(d.catalogue).map(([s]) => s);
    const at = order.indexOf(key);
    const to = at + dir;
    if (at < 0 || to < 0 || to >= order.length) return;
    [order[at], order[to]] = [order[to], order[at]];
    const by = new Map(groups(d.catalogue));
    d.catalogue = order.flatMap((s) => by.get(s) ?? []);
  });

  const renameSection = (from: string, to: string) => update((d) => {
    const clean = to.trim();
    for (const c of d.catalogue) if (sectionOf(c) === from) c.section = clean;
  });

  const remove = (id: string) => update((d) => { d.catalogue = d.catalogue.filter((c) => c.id !== id); });

  const toggle = (id: string) => update((d) => {
    const c = d.catalogue.find((x) => x.id === id);
    if (c) c.hidden = !c.hidden;
  });

  const list = groups(db.catalogue);

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="space-y-3 p-4">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <p className="text-sm font-medium">Add to the price list</p>
              <p className="text-xs text-muted-foreground">
                Anything here is on the public noticeboard within seconds. A price of 0 reads as “Ask”.
              </p>
            </div>
            <Button size="sm" variant="outline" onClick={() => setPasting(true)}>
              <ClipboardPaste />Paste a list
            </Button>
          </div>

          <form onSubmit={add} className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)_7rem_minmax(0,1fr)_auto] sm:items-end">
            <Field label="Section" htmlFor="cat-section">
              <Input
                id="cat-section" list="cat-sections" value={section} onChange={(e) => setSection(e.target.value)}
                placeholder="e.g. Spell Tomes"
              />
            </Field>
            <Field label="Item" htmlFor="cat-name">
              <Input
                id="cat-name" ref={nameRef} list="cat-items" value={name} onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Ironflesh"
              />
            </Field>
            <Field label="Price" htmlFor="cat-price">
              <Input
                id="cat-price" inputMode="numeric" value={price} onChange={(e) => setPrice(e.target.value)}
                placeholder="0 = ask"
              />
            </Field>
            <Field label="Note" htmlFor="cat-note">
              <Input id="cat-note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Adept" />
            </Field>
            <Button type="submit" disabled={!name.trim()}><Plus />Add</Button>
          </form>
          <datalist id="cat-sections">{sections.map((s) => <option key={s} value={s} />)}</datalist>
          <datalist id="cat-items">{itemNames.map((n) => <option key={n} value={n} />)}</datalist>
        </CardContent>
      </Card>

      {list.length === 0 ? (
        <Card>
          <CardContent className="p-6 text-center text-sm text-muted-foreground">
            The price list is empty, so the noticeboard says it is still being written. Add a line above, or paste a
            poster template you already have.
          </CardContent>
        </Card>
      ) : list.map(([key, items], si) => (
        <Card key={key}>
          <CardContent className="p-0">
            <div className="flex items-center gap-2 border-b px-4 py-2.5">
              {renaming === key ? (
                <SectionRename
                  initial={key === SECTION_FALLBACK ? '' : key}
                  onDone={(to) => { if (to !== null && to.trim() !== key) renameSection(key, to); setRenaming(null); }}
                />
              ) : (
                <>
                  <p className="min-w-0 flex-1 truncate text-sm font-semibold">{key}</p>
                  <span className="text-xs text-muted-foreground">{items.length}</span>
                  <Button size="icon-xs" variant="ghost" aria-label={`Rename ${key}`} onClick={() => setRenaming(key)}><Pencil /></Button>
                  <Button size="icon-xs" variant="ghost" aria-label={`Move ${key} up`} disabled={si === 0} onClick={() => moveSection(key, -1)}><ArrowUp /></Button>
                  <Button size="icon-xs" variant="ghost" aria-label={`Move ${key} down`} disabled={si === list.length - 1} onClick={() => moveSection(key, 1)}><ArrowDown /></Button>
                </>
              )}
            </div>
            <ul className="divide-y">
              {items.map((it, i) => (
                <li key={it.id} className={cn('px-4 py-2', it.hidden && 'bg-muted/50')}>
                  {editing === it.id ? (
                    <RowEdit
                      item={it}
                      onCancel={() => setEditing(null)}
                      onSave={(next) => {
                        update((d) => {
                          const c = d.catalogue.find((x) => x.id === it.id);
                          if (c) Object.assign(c, next);
                        });
                        setEditing(null);
                      }}
                    />
                  ) : (
                    <div className="flex items-center gap-2">
                      <div className={cn('min-w-0 flex-1', it.hidden && 'opacity-55')}>
                        <p className="truncate text-sm">
                          {it.name}
                          {it.note && <span className="ml-2 text-xs italic text-muted-foreground">{it.note}</span>}
                        </p>
                        {it.hidden && <p className="text-xs text-muted-foreground">Hidden from the noticeboard</p>}
                      </div>
                      <p className={cn('shrink-0 text-sm tabular-nums', it.hidden && 'opacity-55')}>
                        {it.price > 0 ? `${it.price.toLocaleString()} septims` : <span className="italic text-muted-foreground">Ask</span>}
                      </p>
                      <div className="flex shrink-0 items-center">
                        <Button size="icon-xs" variant="ghost" aria-label={it.hidden ? `Show ${it.name}` : `Hide ${it.name}`} onClick={() => toggle(it.id)}>
                          {it.hidden ? <EyeOff /> : <Eye />}
                        </Button>
                        <Button size="icon-xs" variant="ghost" aria-label={`Move ${it.name} up`} disabled={i === 0} onClick={() => move(it.id, -1)}><ArrowUp /></Button>
                        <Button size="icon-xs" variant="ghost" aria-label={`Move ${it.name} down`} disabled={i === items.length - 1} onClick={() => move(it.id, 1)}><ArrowDown /></Button>
                        <Button size="icon-xs" variant="ghost" aria-label={`Edit ${it.name}`} onClick={() => setEditing(it.id)}><Pencil /></Button>
                        <Button
                          size="icon-xs" variant="ghost" aria-label={`Remove ${it.name}`}
                          onClick={() => { if (confirm(`Take ${it.name} off the price list?`)) remove(it.id); }}
                        >
                          <Trash2 />
                        </Button>
                      </div>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ))}

      {pasting && (
        <PasteDialog
          hasList={db.catalogue.length > 0}
          close={() => setPasting(false)}
          onUse={(lines, replace) => {
            update((d) => {
              const fresh = lines.map((l) => ({ ...l, id: uid() }));
              d.catalogue = replace ? fresh : [...d.catalogue, ...fresh];
            });
            setPasting(false);
          }}
        />
      )}
    </div>
  );
}

function SectionRename({ initial, onDone }: { initial: string; onDone: (to: string | null) => void }) {
  const [v, setV] = useState(initial);
  return (
    <form
      className="flex flex-1 items-center gap-2"
      onSubmit={(e) => { e.preventDefault(); onDone(v); }}
    >
      <Input
        autoFocus value={v} onChange={(e) => setV(e.target.value)} className="h-8"
        aria-label="Section name" placeholder={SECTION_FALLBACK}
        onKeyDown={(e) => { if (e.key === 'Escape') onDone(null); }}
      />
      <Button type="submit" size="sm">Rename</Button>
      <Button type="button" size="icon-sm" variant="ghost" aria-label="Cancel" onClick={() => onDone(null)}><X /></Button>
    </form>
  );
}

function RowEdit({ item, onSave, onCancel }: {
  item: CatalogueItem;
  onSave: (next: Pick<CatalogueItem, 'section' | 'name' | 'price' | 'note'>) => void;
  onCancel: () => void;
}) {
  const [section, setSection] = useState(item.section);
  const [name, setName] = useState(item.name);
  const [price, setPrice] = useState(item.price ? String(item.price) : '');
  const [note, setNote] = useState(item.note);
  const id = item.id;
  return (
    <form
      className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)_7rem_minmax(0,1fr)_auto] sm:items-end"
      onSubmit={(e) => {
        e.preventDefault();
        if (!name.trim()) return;
        onSave({ section: section.trim(), name: name.trim(), price: priceOf(price), note: note.trim() });
      }}
      onKeyDown={(e) => { if (e.key === 'Escape') onCancel(); }}
    >
      <Field label="Section" htmlFor={`s-${id}`}>
        <Input id={`s-${id}`} list="cat-sections" value={section} onChange={(e) => setSection(e.target.value)} />
      </Field>
      <Field label="Item" htmlFor={`n-${id}`}>
        <Input id={`n-${id}`} autoFocus value={name} onChange={(e) => setName(e.target.value)} />
      </Field>
      <Field label="Price" htmlFor={`p-${id}`}>
        <Input id={`p-${id}`} inputMode="numeric" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="0 = ask" />
      </Field>
      <Field label="Note" htmlFor={`o-${id}`}>
        <Input id={`o-${id}`} value={note} onChange={(e) => setNote(e.target.value)} />
      </Field>
      <div className="flex gap-1">
        <Button type="submit" size="sm" disabled={!name.trim()}>Save</Button>
        <Button type="button" size="sm" variant="ghost" onClick={onCancel}>Cancel</Button>
      </div>
    </form>
  );
}

const PASTE_EXAMPLE = `@columns: Item, Tier, Price, Qty

# Alteration
Ironflesh, Ad, 2500, 1
Oakflesh, N, 500, 2

# Restoration
Healing Hands, A, 1000, 4`;

function PasteDialog({ hasList, close, onUse }: {
  hasList: boolean;
  close: () => void;
  onUse: (lines: Array<Omit<CatalogueItem, 'id'>>, replace: boolean) => void;
}) {
  const [text, setText] = useState('');
  const lines = useMemo(() => parseCatalogueText(text), [text]);
  const sectionCount = new Set(lines.map((l) => l.section)).size;

  return (
    <Dialog open onOpenChange={(open) => { if (!open) close(); }}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Paste a price list</DialogTitle>
          <DialogDescription>
            Written the way posters are: <code># Section</code> on its own line, then one item per line as
            {' '}<code>Name, …, Price</code>. A poster template pastes straight in — the Price column is the price,
            Qty is dropped, anything else becomes the note.
          </DialogDescription>
        </DialogHeader>

        <Textarea
          value={text} onChange={(e) => setText(e.target.value)} rows={12} placeholder={PASTE_EXAMPLE}
          className="font-mono text-xs"
        />

        {text.trim() && (
          <p className="text-sm text-muted-foreground">
            {lines.length === 0
              ? 'Nothing in that reads as an item yet.'
              : `${lines.length} item${lines.length === 1 ? '' : 's'} in ${sectionCount} section${sectionCount === 1 ? '' : 's'}, `
                + `${lines.filter((l) => l.price === 0).length} without a price.`}
          </p>
        )}
        {lines.length > 0 && (
          <ul className="max-h-48 overflow-y-auto rounded-md border text-sm">
            {lines.slice(0, 200).map((l, i) => (
              <li key={i} className="flex gap-2 border-b px-3 py-1.5 last:border-b-0">
                <span className="w-28 shrink-0 truncate text-xs text-muted-foreground">{l.section || SECTION_FALLBACK}</span>
                <span className="min-w-0 flex-1 truncate">
                  {l.name}{l.note && <span className="ml-2 text-xs italic text-muted-foreground">{l.note}</span>}
                </span>
                <span className="shrink-0 tabular-nums">{l.price > 0 ? l.price.toLocaleString() : 'Ask'}</span>
              </li>
            ))}
          </ul>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={close}>Cancel</Button>
          {hasList && (
            <Button
              variant="outline" disabled={lines.length === 0}
              onClick={() => { if (confirm('Replace the whole price list with these?')) onUse(lines, true); }}
            >
              Replace the list
            </Button>
          )}
          <Button disabled={lines.length === 0} onClick={() => onUse(lines, false)}>
            Add {lines.length || ''} to the list
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ------------------------------------------------------------------------- */
/* The noticeboard's words                                                    */
/* ------------------------------------------------------------------------- */

type BoardDraft = Omit<Noticeboard, 'offers'> & { offers: string };

const toDraft = (b: Noticeboard): BoardDraft => ({ ...b, offers: b.offers.join('\n') });
const fromDraft = (d: BoardDraft): Noticeboard => ({
  ...d,
  offers: d.offers.split('\n').map((l) => l.trim()).filter(Boolean),
});

/**
 * Edited as a draft and saved in one go, rather than live: half a sentence
 * shouldn't reach strangers while someone is still typing it.
 */
function BoardEditor({ db, update, cfg }: {
  db: DB;
  update: (fn: (d: DB) => void) => void;
  cfg: SyncCfg | null;
}) {
  const [draft, setDraft] = useState<BoardDraft>(() => toDraft(db.board));
  const [busy, setBusy] = useState<'' | 'picture' | 'backdrop'>('');
  const [err, setErr] = useState('');
  const [saved, setSaved] = useState(false);

  const dirty = JSON.stringify(fromDraft(draft)) !== JSON.stringify(db.board);
  const set = <K extends keyof BoardDraft>(k: K, v: BoardDraft[K]) => {
    setDraft((d) => ({ ...d, [k]: v }));
    setSaved(false);
  };

  const save = () => {
    const next = fromDraft(draft);
    update((d) => { d.board = next; });
    setSaved(true);
  };

  const upload = async (which: 'picture' | 'backdrop', file: File) => {
    if (!cfg) { setErr('Sign in before uploading a picture.'); return; }
    setBusy(which);
    setErr('');
    try {
      const url = await uploadImage(cfg, file);
      if (!url) throw new Error('The upload came back empty.');
      if (which === 'backdrop') {
        // Kept with the poster backgrounds, so the same scene can be used for both.
        update((d) => {
          d.backgrounds.push({
            id: uid(), url, at: new Date().toISOString(),
            name: file.name.replace(/\.[^.]+$/, '').slice(0, 60) || 'Backdrop',
          });
        });
      }
      set(which, url);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'That picture could not be uploaded.');
    } finally {
      setBusy('');
    }
  };

  const text = (k: keyof BoardDraft, label: string, placeholder = '') => (
    <Field label={label} htmlFor={`board-${k}`}>
      <Input
        id={`board-${k}`} value={draft[k] as string} placeholder={placeholder}
        onChange={(e) => set(k, e.target.value as never)}
      />
    </Field>
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" onClick={save} disabled={!dirty}><Save />Save to the noticeboard</Button>
        <Button size="sm" variant="ghost" disabled={!dirty} onClick={() => setDraft(toDraft(db.board))}>
          Discard changes
        </Button>
        <Button
          size="sm" variant="ghost" className="ml-auto"
          onClick={() => { if (confirm('Put the starting words back? Save afterwards to make it stick.')) setDraft(toDraft(DEFAULT_BOARD)); }}
        >
          <RotateCcw />Starting words
        </Button>
        {saved && !dirty && <span className="text-xs text-muted-foreground">Saved — it’s on the board.</span>}
        {dirty && <span className="text-xs text-amber-700 dark:text-amber-400">Not saved yet</span>}
      </div>

      {err && <Alert variant="destructive"><AlertDescription>{err}</AlertDescription></Alert>}

      <p className="text-xs text-muted-foreground">Leave a field blank to take it off the board.</p>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardContent className="space-y-3 p-4">
            <p className="text-sm font-medium">The poster</p>
            {text('motto', 'Over the name', 'Stronghold of Clan Orgrimm')}
            {text('name', 'Name', 'Gol-Razhkbur')}
            {text('tagline', 'Under the name', 'Strong steel. Honest coin.')}
            <Field label="Welcome — a blank line starts a new paragraph" htmlFor="board-welcome">
              <Textarea id="board-welcome" rows={6} value={draft.welcome} onChange={(e) => set('welcome', e.target.value)} />
            </Field>
            <div className="grid gap-3 sm:grid-cols-2">
              {text('signedBy', 'Signed by')}
              {text('signedAs', 'Signed as')}
            </div>
            {text('where', 'Where to find us — top corner of the board')}
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardContent className="space-y-3 p-4">
              <p className="text-sm font-medium">What we trade in</p>
              {text('offersHeading', 'Heading', 'For blade, book & hearth.')}
              <Field label="A line under it" htmlFor="board-offersIntro">
                <Textarea id="board-offersIntro" rows={2} value={draft.offersIntro} onChange={(e) => set('offersIntro', e.target.value)} />
              </Field>
              <Field label="The list — one per line" htmlFor="board-offers">
                <Textarea id="board-offers" rows={5} value={draft.offers} onChange={(e) => set('offers', e.target.value)} />
              </Field>
              {text('offersSign', 'Signed off with')}
            </CardContent>
          </Card>

          <Card>
            <CardContent className="space-y-3 p-4">
              <p className="text-sm font-medium">Pictures</p>
              <PicturePick
                label="Pinned beside the poster" url={draft.picture} busy={busy === 'picture'}
                onFile={(f) => void upload('picture', f)} onClear={() => set('picture', '')}
              />
              {draft.picture && (
                <div className="grid gap-3 sm:grid-cols-2">
                  {text('pictureCaption', 'Caption')}
                  {text('pictureNote', 'Small print under it')}
                </div>
              )}
              <PicturePick
                label="The scene behind the board" url={draft.backdrop} busy={busy === 'backdrop'}
                onFile={(f) => void upload('backdrop', f)} onClear={() => set('backdrop', '')}
              />
              {db.backgrounds.length > 0 && (
                <div className="space-y-1.5">
                  <p className="text-xs text-muted-foreground">Or use one of the poster backgrounds</p>
                  <div className="flex flex-wrap gap-2">
                    {db.backgrounds.map((b) => (
                      <button
                        key={b.id} type="button" onClick={() => set('backdrop', b.url)}
                        className={cn(
                          'h-14 w-24 overflow-hidden rounded-md border-2 transition-colors',
                          draft.backdrop === b.url ? 'border-primary' : 'border-transparent hover:border-border',
                        )}
                        aria-label={`Use ${b.name || 'this background'} behind the board`}
                      >
                        <img src={b.url} alt="" className="size-full object-cover" loading="lazy" />
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function PicturePick({ label, url, busy, onFile, onClear }: {
  label: string; url: string; busy: boolean; onFile: (f: File) => void; onClear: () => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <div className="flex items-center gap-3">
      <div className="flex h-14 w-24 shrink-0 items-center justify-center overflow-hidden rounded-md border bg-muted">
        {url ? <img src={url} alt="" className="size-full object-cover" /> : <ImageUp className="size-4 text-muted-foreground" />}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium">{label}</p>
        <div className="mt-1 flex gap-1">
          <Button type="button" size="xs" variant="outline" disabled={busy} onClick={() => ref.current?.click()}>
            {busy ? 'Uploading…' : url ? 'Replace' : 'Upload'}
          </Button>
          {url && <Button type="button" size="xs" variant="ghost" onClick={onClear}>Remove</Button>}
        </div>
      </div>
      <input
        ref={ref} type="file" accept="image/*" className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); e.target.value = ''; }}
      />
    </div>
  );
}
