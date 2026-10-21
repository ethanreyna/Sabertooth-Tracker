import { useMemo, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import {
  ArrowDown, ArrowLeft, ArrowRight, ArrowUp, ClipboardPaste, Eye, EyeOff, ImageUp, Pencil, Plus, RotateCcw, Save, Trash2, X,
} from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { Field } from '@/components/bits';
import { defaultBoard } from '@/data';
import { catalogue as itemCatalogue } from '@/items';
import { uid } from '@/lib/format';
import { parseCatalogueText } from '@/lib/parse-catalogue';
import { uploadImage } from '@/sync';
import { cn } from '@/lib/utils';
import { OTHER_TAB, tabOf } from '@/lib/price-tabs';
import type { CatalogueItem, DB, Notice, Noticeboard, PosterBackground, PriceTab, SyncCfg } from '@/types';

export type BoardTab = 'notices' | 'board' | 'list';

/**
 * Everything on the public noticeboard: the notices pinned to it, every other
 * word on it, and the price list strangers open from it. Members only — what
 * is saved here is public the moment it lands.
 */
export function BoardSection({ db, update, cfg, tab, onTabChange }: {
  db: DB;
  update: (fn: (d: DB) => void) => void;
  cfg: SyncCfg | null;
  tab: BoardTab;
  onTabChange: (t: BoardTab) => void;
}) {
  const shown = db.catalogue.filter((c) => !c.hidden).length;
  const pinned = db.board.notices.filter((n) => !n.hidden).length;
  return (
    <Tabs value={tab} onValueChange={(v) => onTabChange(v as BoardTab)}>
      <TabsList>
        <TabsTrigger value="notices">
          Notices{db.board.notices.length > 0 && <span className="ml-1.5 text-muted-foreground">{pinned}</span>}
        </TabsTrigger>
        <TabsTrigger value="board">Board</TabsTrigger>
        <TabsTrigger value="list">
          Price list{db.catalogue.length > 0 && <span className="ml-1.5 text-muted-foreground">{shown}</span>}
        </TabsTrigger>
      </TabsList>

      <TabsContent value="notices" className="mt-4">
        <NoticesEditor db={db} update={update} cfg={cfg} />
      </TabsContent>
      <TabsContent value="board" className="mt-4">
        <BoardEditor db={db} update={update} cfg={cfg} />
      </TabsContent>
      <TabsContent value="list" className="mt-4">
        <PriceListEditor db={db} update={update} />
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
  const [picked, setPicked] = useState<string>(() => db.priceTabs[0]?.id ?? '');
  const [tabForm, setTabForm] = useState<null | { id: string | null; name: string }>(null);
  const nameRef = useRef<HTMLInputElement>(null);

  const tabs = db.priceTabs;
  // The tab picked may have just been deleted, here or by someone else.
  const tab = picked === '' || tabs.some((t) => t.id === picked) ? picked : (tabs[0]?.id ?? '');
  const inTab = (c: CatalogueItem) => tabOf(c, tabs) === tab;
  const here = db.catalogue.filter(inTab);
  const untabbed = tabs.length > 0 ? db.catalogue.filter((c) => tabOf(c, tabs) === '').length : 0;
  const tabName = tab ? tabs.find((t) => t.id === tab)?.name ?? '' : (tabs.length ? OTHER_TAB : '');

  const sections = useMemo(() => groups(here).map(([sec]) => sec), [here]);
  const itemNames = useMemo(() => itemCatalogue(db.items).map((i) => i.name), [db.items]);

  const add = (e: FormEvent) => {
    e.preventDefault();
    const clean = name.trim();
    if (!clean) return;
    update((d) => {
      d.catalogue.push({
        id: uid(), tab, section: section.trim(), name: clean, price: priceOf(price), note: note.trim(), hidden: false,
      });
    });
    // Section stays: lists are usually typed a section at a time.
    setName(''); setPrice(''); setNote('');
    nameRef.current?.focus();
  };

  /** Swaps with the neighbour in the same tab and section, leaving the rest be. */
  const move = (id: string, dir: -1 | 1) => update((d) => {
    const i = d.catalogue.findIndex((c) => c.id === id);
    if (i < 0) return;
    const same = (c: CatalogueItem) => tabOf(c, d.priceTabs) === tab && sectionOf(c) === sectionOf(d.catalogue[i]);
    let j = i + dir;
    while (j >= 0 && j < d.catalogue.length && !same(d.catalogue[j])) j += dir;
    if (j < 0 || j >= d.catalogue.length) return;
    [d.catalogue[i], d.catalogue[j]] = [d.catalogue[j], d.catalogue[i]];
  });

  /** Moves a whole section ahead of, or behind, its neighbour in this tab. */
  const moveSection = (key: string, dir: -1 | 1) => update((d) => {
    const mine = (c: CatalogueItem) => tabOf(c, d.priceTabs) === tab;
    const order = groups(d.catalogue.filter(mine)).map(([sec]) => sec);
    const at = order.indexOf(key);
    const to = at + dir;
    if (at < 0 || to < 0 || to >= order.length) return;
    [order[at], order[to]] = [order[to], order[at]];
    const by = new Map(groups(d.catalogue.filter(mine)));
    d.catalogue = [...d.catalogue.filter((c) => !mine(c)), ...order.flatMap((sec) => by.get(sec) ?? [])];
  });

  const renameSection = (from: string, to: string) => update((d) => {
    const clean = to.trim();
    for (const c of d.catalogue) if (tabOf(c, d.priceTabs) === tab && sectionOf(c) === from) c.section = clean;
  });

  const remove = (id: string) => update((d) => { d.catalogue = d.catalogue.filter((c) => c.id !== id); });

  const toggle = (id: string) => update((d) => {
    const c = d.catalogue.find((x) => x.id === id);
    if (c) c.hidden = !c.hidden;
  });

  const saveTab = () => {
    if (!tabForm) return;
    const clean = tabForm.name.trim();
    if (!clean) return;
    if (tabForm.id) {
      const id = tabForm.id;
      update((d) => { const t = d.priceTabs.find((x) => x.id === id); if (t) t.name = clean; });
    } else {
      const id = uid();
      update((d) => {
        // The first tab takes in everything already listed, so a list that
        // gets tabs doesn't suddenly have all of it filed under Other.
        if (d.priceTabs.length === 0) for (const c of d.catalogue) c.tab = id;
        d.priceTabs.push({ id, name: clean });
      });
      setPicked(id);
    }
    setTabForm(null);
  };

  const moveTab = (dir: -1 | 1) => update((d) => {
    const i = d.priceTabs.findIndex((t) => t.id === tab);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= d.priceTabs.length) return;
    [d.priceTabs[i], d.priceTabs[j]] = [d.priceTabs[j], d.priceTabs[i]];
  });

  const deleteTab = () => {
    const count = here.length;
    if (!confirm(count
      ? `Delete the “${tabName}” tab? Its ${count} item${count === 1 ? '' : 's'} move to ${OTHER_TAB}, not away.`
      : `Delete the “${tabName}” tab?`)) return;
    update((d) => {
      d.priceTabs = d.priceTabs.filter((t) => t.id !== tab);
      for (const c of d.catalogue) if (c.tab === tab) c.tab = '';
    });
    setPicked(tabs.find((t) => t.id !== tab)?.id ?? '');
  };

  const list = groups(here);
  const tabIndex = tabs.findIndex((t) => t.id === tab);

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="space-y-2 p-4">
          <div className="flex flex-wrap items-center gap-1.5">
            {tabs.map((t) => (
              <Button key={t.id} size="sm" variant={t.id === tab ? 'default' : 'outline'} onClick={() => setPicked(t.id)}>
                {t.name}
                <span className="opacity-60">{db.catalogue.filter((c) => c.tab === t.id).length}</span>
              </Button>
            ))}
            {untabbed > 0 && (
              <Button size="sm" variant={tab === '' ? 'default' : 'outline'} onClick={() => setPicked('')}>
                {OTHER_TAB}<span className="opacity-60">{untabbed}</span>
              </Button>
            )}
            {tabForm ? (
              <form className="flex items-center gap-1" onSubmit={(e) => { e.preventDefault(); saveTab(); }}>
                <Input
                  autoFocus value={tabForm.name} onChange={(e) => setTabForm({ ...tabForm, name: e.target.value })}
                  onKeyDown={(e) => { if (e.key === 'Escape') setTabForm(null); }}
                  placeholder="e.g. Tomes" aria-label="Tab name" className="h-8 w-40"
                />
                <Button type="submit" size="sm" disabled={!tabForm.name.trim()}>{tabForm.id ? 'Rename' : 'Add tab'}</Button>
                <Button type="button" size="icon-sm" variant="ghost" aria-label="Cancel" onClick={() => setTabForm(null)}><X /></Button>
              </form>
            ) : (
              <Button size="sm" variant="ghost" onClick={() => setTabForm({ id: null, name: '' })}><Plus />New tab</Button>
            )}
            {tab && !tabForm && (
              <div className="ml-auto flex items-center">
                <Button size="icon-xs" variant="ghost" aria-label={`Rename ${tabName}`} onClick={() => setTabForm({ id: tab, name: tabName })}><Pencil /></Button>
                <Button size="icon-xs" variant="ghost" aria-label={`Move ${tabName} left`} disabled={tabIndex <= 0} onClick={() => moveTab(-1)}><ArrowLeft /></Button>
                <Button size="icon-xs" variant="ghost" aria-label={`Move ${tabName} right`} disabled={tabIndex >= tabs.length - 1} onClick={() => moveTab(1)}><ArrowRight /></Button>
                <Button size="icon-xs" variant="ghost" aria-label={`Delete ${tabName}`} onClick={deleteTab}><Trash2 /></Button>
              </div>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            {tabs.length === 0
              ? 'Tabs split the public list into Tomes, Forge, Tailor and so on. Without any, it is one list; the first tab you add takes in everything already on it.'
              : tab === ''
                ? `Items not in any tab. The public list shows them under ${OTHER_TAB}; edit one to give it a tab.`
                : 'A tab with nothing in it is left off the public list.'}
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-3 p-4">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <p className="text-sm font-medium">{tabName ? `Add to ${tabName}` : 'Add to the price list'}</p>
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
                placeholder="e.g. Alteration"
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
          <datalist id="cat-sections">{sections.map((sec) => <option key={sec} value={sec} />)}</datalist>
          <datalist id="cat-items">{itemNames.map((n) => <option key={n} value={n} />)}</datalist>
        </CardContent>
      </Card>

      {list.length === 0 ? (
        <Card>
          <CardContent className="p-6 text-center text-sm text-muted-foreground">
            {db.catalogue.length === 0
              ? 'The price list is empty, so the noticeboard says it is still being written. Add a line above, or paste a poster template you already have.'
              : `Nothing in ${tabName || 'this tab'} yet. Add a line above, or paste a list.`}
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
                      item={it} tabs={tabs}
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
          hasList={here.length > 0}
          into={tabName}
          close={() => setPasting(false)}
          onUse={(lines, replace) => {
            update((d) => {
              const fresh = lines.map((l) => ({ ...l, tab, id: uid() }));
              d.catalogue = replace
                ? [...d.catalogue.filter((c) => tabOf(c, d.priceTabs) !== tab), ...fresh]
                : [...d.catalogue, ...fresh];
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

function RowEdit({ item, tabs, onSave, onCancel }: {
  item: CatalogueItem;
  tabs: PriceTab[];
  onSave: (next: Pick<CatalogueItem, 'tab' | 'section' | 'name' | 'price' | 'note'>) => void;
  onCancel: () => void;
}) {
  const [tab, setTab] = useState(tabOf(item, tabs));
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
        onSave({ tab, section: section.trim(), name: name.trim(), price: priceOf(price), note: note.trim() });
      }}
      onKeyDown={(e) => { if (e.key === 'Escape') onCancel(); }}
    >
      {tabs.length > 0 && (
        <Field label="Tab" htmlFor={`t-${id}`} className="sm:col-span-full sm:max-w-56">
          <select
            id={`t-${id}`} value={tab} onChange={(e) => setTab(e.target.value)}
            className="h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm"
          >
            {tabs.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            <option value="">{OTHER_TAB}</option>
          </select>
        </Field>
      )}
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

function PasteDialog({ hasList, into, close, onUse }: {
  hasList: boolean;
  /** The tab the lines go into, for the title. */
  into: string;
  close: () => void;
  onUse: (lines: Array<Omit<CatalogueItem, 'id' | 'tab'>>, replace: boolean) => void;
}) {
  const [text, setText] = useState('');
  const lines = useMemo(() => parseCatalogueText(text), [text]);
  const sectionCount = new Set(lines.map((l) => l.section)).size;

  return (
    <Dialog open onOpenChange={(open) => { if (!open) close(); }}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{into ? `Paste a list into ${into}` : 'Paste a price list'}</DialogTitle>
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
              onClick={() => { if (confirm(into ? `Replace everything in ${into} with these?` : 'Replace the whole price list with these?')) onUse(lines, true); }}
            >
              {into ? `Replace ${into}` : 'Replace the list'}
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
/* Notices                                                                    */
/* ------------------------------------------------------------------------- */

const blankNotice = (): Notice => ({
  id: uid(), label: '', heading: '', picture: '', caption: '', body: '', list: [],
  numbered: true, sign: '', paper: 'torn', hidden: false,
});

/** What a notice is called in the list, from whatever it has. */
const noticeTitle = (n: Notice) =>
  n.heading || n.label || n.caption || n.body.split('\n')[0] || (n.picture ? 'A picture' : 'An empty notice');

function NoticesEditor({ db, update, cfg }: {
  db: DB;
  update: (fn: (d: DB) => void) => void;
  cfg: SyncCfg | null;
}) {
  const [editing, setEditing] = useState<Notice | null>(null);
  const notices = db.board.notices;

  const move = (id: string, dir: -1 | 1) => update((d) => {
    const i = d.board.notices.findIndex((n) => n.id === id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= d.board.notices.length) return;
    [d.board.notices[i], d.board.notices[j]] = [d.board.notices[j], d.board.notices[i]];
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" onClick={() => setEditing(blankNotice())}><Plus />New notice</Button>
        <p className="text-xs text-muted-foreground">
          The first two sit beside the poster; the rest are pinned in a row beneath it.
        </p>
      </div>

      {notices.length === 0 ? (
        <Card>
          <CardContent className="p-6 text-center text-sm text-muted-foreground">
            Nothing is pinned up beside the poster. Add a notice — a picture, a heading, a few words, a list,
            any mix of them.
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <ul className="divide-y">
              {notices.map((n, i) => (
                <li key={n.id} className={cn('flex items-center gap-3 px-4 py-2.5', n.hidden && 'bg-muted/50')}>
                  <div className="flex h-12 w-16 shrink-0 items-center justify-center overflow-hidden rounded-md border bg-muted">
                    {n.picture
                      ? <img src={n.picture} alt="" className="size-full object-cover" />
                      : <span className="text-[10px] uppercase tracking-wider text-muted-foreground">{n.paper}</span>}
                  </div>
                  <div className={cn('min-w-0 flex-1', n.hidden && 'opacity-55')}>
                    <p className="truncate text-sm font-medium">{noticeTitle(n)}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {n.hidden ? 'Taken down — not on the board' : [
                        i < 2 ? 'Beside the poster' : 'Beneath the poster',
                        n.list.length ? `${n.list.length} in the list` : '',
                        n.picture ? 'picture' : '',
                      ].filter(Boolean).join(' · ')}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center">
                    <Button
                      size="icon-xs" variant="ghost" aria-label={n.hidden ? 'Pin it back up' : 'Take it down'}
                      onClick={() => update((d) => { const t = d.board.notices.find((x) => x.id === n.id); if (t) t.hidden = !t.hidden; })}
                    >
                      {n.hidden ? <EyeOff /> : <Eye />}
                    </Button>
                    <Button size="icon-xs" variant="ghost" aria-label="Move up" disabled={i === 0} onClick={() => move(n.id, -1)}><ArrowUp /></Button>
                    <Button size="icon-xs" variant="ghost" aria-label="Move down" disabled={i === notices.length - 1} onClick={() => move(n.id, 1)}><ArrowDown /></Button>
                    <Button size="icon-xs" variant="ghost" aria-label="Edit" onClick={() => setEditing(n)}><Pencil /></Button>
                    <Button
                      size="icon-xs" variant="ghost" aria-label="Remove"
                      onClick={() => {
                        if (confirm(`Take “${noticeTitle(n)}” off the board for good?`)) {
                          update((d) => { d.board.notices = d.board.notices.filter((x) => x.id !== n.id); });
                        }
                      }}
                    >
                      <Trash2 />
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {editing && (
        <NoticeDialog
          initial={editing} db={db} update={update} cfg={cfg}
          isNew={!notices.some((n) => n.id === editing.id)}
          close={() => setEditing(null)}
        />
      )}
    </div>
  );
}

/** A notice is written as a draft and pinned up in one go. */
function NoticeDialog({ initial, isNew, db, update, cfg, close }: {
  initial: Notice;
  isNew: boolean;
  db: DB;
  update: (fn: (d: DB) => void) => void;
  cfg: SyncCfg | null;
  close: () => void;
}) {
  const [n, setN] = useState<Notice>(initial);
  const [list, setList] = useState(initial.list.join('\n'));
  const set = <K extends keyof Notice>(k: K, v: Notice[K]) => setN((x) => ({ ...x, [k]: v }));
  const upload = useUpload(cfg, update);

  const save = () => {
    const next: Notice = { ...n, list: list.split('\n').map((l) => l.trim()).filter(Boolean) };
    update((d) => {
      const i = d.board.notices.findIndex((x) => x.id === next.id);
      if (i >= 0) d.board.notices[i] = next;
      else d.board.notices.push(next);
    });
    close();
  };

  return (
    <Dialog open onOpenChange={(open) => { if (!open) close(); }}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{isNew ? 'A new notice' : 'Edit the notice'}</DialogTitle>
          <DialogDescription>Fill in only what this notice needs — anything left blank isn’t drawn.</DialogDescription>
        </DialogHeader>

        {upload.err && <Alert variant="destructive"><AlertDescription>{upload.err}</AlertDescription></Alert>}

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Small capitals over the heading" htmlFor="nt-label">
            <Input id="nt-label" value={n.label} onChange={(e) => set('label', e.target.value)} placeholder="From the forge-table" />
          </Field>
          <Field label="Heading" htmlFor="nt-heading">
            <Input id="nt-heading" value={n.heading} onChange={(e) => set('heading', e.target.value)} placeholder="For blade, book & hearth." />
          </Field>
        </div>

        <PicturePick
          label="Picture" url={n.picture} busy={upload.busy}
          onFile={(f) => void upload.run(f, (url) => set('picture', url))}
          onClear={() => set('picture', '')}
          shelf={db.backgrounds} onPick={(url) => set('picture', url)}
        />
        {n.picture && (
          <Field label="Under the picture" htmlFor="nt-caption">
            <Input id="nt-caption" value={n.caption} onChange={(e) => set('caption', e.target.value)} placeholder="A little corner of the stronghold." />
          </Field>
        )}

        <Field label="Words — a blank line starts a new paragraph" htmlFor="nt-body">
          <Textarea id="nt-body" rows={4} value={n.body} onChange={(e) => set('body', e.target.value)} />
        </Field>

        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
          <Field label="A list — one per line" htmlFor="nt-list">
            <Textarea id="nt-list" rows={4} value={list} onChange={(e) => setList(e.target.value)} placeholder={'Spell tomes\nForged weapons & armour'} />
          </Field>
          <label className="flex items-center gap-2 pb-2 text-sm">
            <Checkbox checked={n.numbered} onCheckedChange={(v) => set('numbered', v === true)} />
            Number it
          </label>
        </div>

        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
          <Field label="Signed off with" htmlFor="nt-sign">
            <Input id="nt-sign" value={n.sign} onChange={(e) => set('sign', e.target.value)} placeholder="Good steel. A fair price." />
          </Field>
          <div className="flex gap-1">
            {(['torn', 'plain'] as const).map((p) => (
              <Button
                key={p} type="button" size="sm" variant={n.paper === p ? 'default' : 'outline'}
                onClick={() => set('paper', p)}
              >
                {p === 'torn' ? 'Old, torn foot' : 'Clean sheet'}
              </Button>
            ))}
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={close}>Cancel</Button>
          <Button onClick={save} disabled={upload.busy}>{isNew ? 'Pin it up' : 'Save'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Uploads a picture to the guild's store; the url goes to `use`. */
function useUpload(cfg: SyncCfg | null, update: (fn: (d: DB) => void) => void) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const run = async (file: File, use: (url: string) => void, keep = false) => {
    if (!cfg) { setErr('Sign in before uploading a picture.'); return; }
    setBusy(true);
    setErr('');
    try {
      const url = await uploadImage(cfg, file);
      if (!url) throw new Error('The upload came back empty.');
      // Scenes are kept with the poster backgrounds, so either can use them.
      if (keep) {
        update((d) => {
          d.backgrounds.push({
            id: uid(), url, at: new Date().toISOString(),
            name: file.name.replace(/\.[^.]+$/, '').slice(0, 60) || 'Backdrop',
          });
        });
      }
      use(url);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'That picture could not be uploaded.');
    } finally {
      setBusy(false);
    }
  };
  return { busy, err, run };
}

/* ------------------------------------------------------------------------- */
/* Every other word on the board                                              */
/* ------------------------------------------------------------------------- */

type BoardDraft = Omit<Noticeboard, 'notices'>;
const toDraft = ({ notices: _notices, ...rest }: Noticeboard): BoardDraft => rest;

/**
 * Edited as a draft and saved in one go, rather than live: half a sentence
 * shouldn't reach strangers while someone is still typing it. Notices have
 * their own tab and are left alone by a save here.
 */
function BoardEditor({ db, update, cfg }: {
  db: DB;
  update: (fn: (d: DB) => void) => void;
  cfg: SyncCfg | null;
}) {
  const [draft, setDraft] = useState<BoardDraft>(() => toDraft(db.board));
  const [saved, setSaved] = useState(false);
  const upload = useUpload(cfg, update);

  const dirty = JSON.stringify(draft) !== JSON.stringify(toDraft(db.board));
  const set = <K extends keyof BoardDraft>(k: K, v: BoardDraft[K]) => {
    setDraft((d) => ({ ...d, [k]: v }));
    setSaved(false);
  };

  const save = () => {
    update((d) => { d.board = { ...draft, notices: d.board.notices }; });
    setSaved(true);
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
          onClick={() => { if (confirm('Put the starting words back? Save afterwards to make it stick.')) setDraft(toDraft(defaultBoard())); }}
        >
          <RotateCcw />Starting words
        </Button>
        {saved && !dirty && <span className="text-xs text-muted-foreground">Saved — it’s on the board.</span>}
        {dirty && <span className="text-xs text-amber-700 dark:text-amber-400">Not saved yet</span>}
      </div>

      {upload.err && <Alert variant="destructive"><AlertDescription>{upload.err}</AlertDescription></Alert>}

      <p className="text-xs text-muted-foreground">Leave a field blank to take it off the board.</p>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardContent className="space-y-3 p-4">
            <p className="text-sm font-medium">The poster</p>
            {text('motto', 'Over the name', 'Stronghold of Clan Orgrimm')}
            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={draft.showMark} onCheckedChange={(v) => set('showMark', v === true)} />
              Show the clan banner over the name
            </label>
            {text('name', 'Name', 'Gol-Razhkbur')}
            {text('tagline', 'Under the name', 'Strong steel. Honest coin.')}
            <Field label="Welcome — a blank line starts a new paragraph" htmlFor="board-welcome">
              <Textarea id="board-welcome" rows={6} value={draft.welcome} onChange={(e) => set('welcome', e.target.value)} />
            </Field>
            <div className="grid gap-3 sm:grid-cols-2">
              {text('signedBy', 'Signed by')}
              {text('signedAs', 'Signed as')}
            </div>
            {text('posterFoot', 'Along the foot of the poster', 'Forged in fire ✦ Paid in septims')}
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardContent className="space-y-3 p-4">
              <p className="text-sm font-medium">The board itself</p>
              <div className="grid gap-3 sm:grid-cols-2">
                {text('boardTitle', 'Top left corner', 'The Gol-Razhkbur noticeboard')}
                {text('where', 'Top right corner', 'Halted Stream Camp · North of Whiterun')}
              </div>
              <PicturePick
                label="The scene behind the board" url={draft.backdrop} busy={upload.busy}
                onFile={(f) => void upload.run(f, (url) => set('backdrop', url), true)}
                onClear={() => set('backdrop', '')}
                shelf={db.backgrounds} onPick={(url) => set('backdrop', url)}
              />
            </CardContent>
          </Card>

          <Card>
            <CardContent className="space-y-3 p-4">
              <p className="text-sm font-medium">The price-list tag</p>
              <div className="grid gap-3 sm:grid-cols-2">
                {text('tagSmall', 'Over the title', 'Gol-Razhkbur')}
                {text('tagTitle', 'On the tag', 'Price list')}
              </div>
              {text('tagHint', 'Under the title — the item count follows it', 'View Prices and Stock')}
              <div className="grid gap-3 sm:grid-cols-2">
                {text('listTitle', 'Over the opened list', 'Price list')}
                {text('listFoot', 'Under the opened list', 'Prices in septims…')}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="space-y-3 p-4">
              <p className="text-sm font-medium">The clan entrance</p>
              <div className="grid gap-3 sm:grid-cols-2">
                {text('doorSmall', 'Over it', 'Of the clan?')}
                {text('doorTitle', 'On the plaque', 'Clan entrance')}
              </div>
              <Field label="Inside, over the password" htmlFor="board-doorText">
                <Textarea id="board-doorText" rows={2} value={draft.doorText} onChange={(e) => set('doorText', e.target.value)} />
              </Field>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function PicturePick({ label, url, busy, onFile, onClear, shelf = [], onPick }: {
  label: string;
  url: string;
  busy: boolean;
  onFile: (f: File) => void;
  onClear: () => void;
  /** Pictures already uploaded, to choose from instead of uploading again. */
  shelf?: PosterBackground[];
  onPick?: (url: string) => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <div className="space-y-2">
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
      {onPick && shelf.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {shelf.map((b) => (
            <button
              key={b.id} type="button" onClick={() => onPick(b.url)}
              className={cn(
                'h-10 w-16 overflow-hidden rounded border-2 transition-colors',
                url === b.url ? 'border-primary' : 'border-transparent hover:border-border',
              )}
              aria-label={`Use ${b.name || 'this picture'}`}
            >
              <img src={b.url} alt="" className="size-full object-cover" loading="lazy" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
