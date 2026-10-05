import { useEffect, useMemo, useState } from 'react';
import { ClipboardCopy, Eraser, FileText, Image as ImageIcon, Printer, Save, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { TonedBadge } from '@/components/bits';
import { ago, uid } from '@/lib/format';
import type { DB } from '@/types';
import {
  formatCell, formatQty, isQtyColumn, numericColumns, parsePoster, posterToText, qtyWorthShowing,
} from '@/lib/parse-poster';
import type { Poster, PosterBlock, PosterTable } from '@/lib/parse-poster';
import { POSTER_SERIF, posterFilename, posterToCanvas } from '@/lib/poster-canvas';
import { cn } from '@/lib/utils';

const KEY = 'orgimm-poster-v1';

/** A real poster, so the format is legible from the first look rather than
 *  from the notes under it. */
const EXAMPLE = `@title: Clan Orgrimm Spell Tomes For Sale
@subtitle: N = Novice · A = Apprentice · Ad = Adept · E = Expert · M = Master
@columns: Item, Tier, Price, Qty

# Alteration
Ironflesh, Ad, 2500, 1
Detect Dead, Ad, 1000, 3
Detect Life, Ad, 600, 1
Oakflesh, N, 500, 2
Magelight, A, 400, 3
Waterbreathing, A, 400, 1
Candlelight, N, 300, 6

# Restoration
Heal Other, Ad, 2000, 1
Greater Ward, Ad, 1250, 1
Healing Hands, A, 1200, 4
Circle of Protection, E, 1200, 1
Steadfast Ward, A, 800, 3
Lesser Ward, N, 400, 4

# Destruction
Blizzard, M, 10000, 1
Icy Spear, E, 3000, 1
Flame Cloak, Ad, 1200, 1
Ice Spike, A, 1000, 1
Fire Rune, A, 800, 1
Firebolt, A, 800, 2
Frost Rune, A, 800, 2
Lightning Rune, A, 800, 1
Flames, N, 400, 1
Sparks, N, 400, 2

# Illusion
Rally, Ad, 2000, 1
Harmony, M, 1000, 1
Mayhem, M, 1000, 1
Calm, A, 400, 2
Courage, N, 300, 4
Fear, N, 300, 2
Fury, N, 300, 1
Muffle, A, 300, 1

@footer: If you're interested, send a pigeon to me or head to the Stronghold Gol-Razhkbur (located at Halted Stream Camp north of Whiterun) and someone will help you purchase the tome if any of our clan is awake.
`;

/** The sheet is set in a serif and on paper whatever the app's theme is: it's
 *  a printed notice, not another panel, and it has to print as one. Shared
 *  with the canvas renderer so the picture matches what's on screen. */
const SERIF = POSTER_SERIF;

function Table({ table }: { table: PosterTable }) {
  const numeric = numericColumns(table);
  const qty = table.columns.findIndex(isQtyColumn);
  // An all-ones Qty column is an empty column under a heading, so it goes.
  const showQty = qty >= 0 && qtyWorthShowing(table, qty);
  const hidden = (i: number) => i === qty && !showQty;
  const width = Math.max(table.columns.length, ...table.rows.map((r) => r.length));
  const heads = table.columns.length > 0;

  return (
    <table className="w-full border-collapse" style={{ fontVariantNumeric: 'tabular-nums' }}>
      {heads && (
        <thead>
          <tr>
            {table.columns.map((name, i) => hidden(i) ? null : (
              <th
                key={name + i}
                className={cn(
                  'border-b border-[#cdc3b4] pb-0.5 text-[0.62rem] font-semibold uppercase tracking-[0.12em] text-[#8a7f70]',
                  numeric[i] ? 'text-right' : 'text-left',
                )}
              >
                {isQtyColumn(name) ? '' : name}
              </th>
            ))}
          </tr>
        </thead>
      )}
      <tbody>
        {table.rows.map((row, r) => (
          <tr key={r} className="align-baseline">
            {Array.from({ length: width }, (_, i) => hidden(i) ? null : (
              <td
                key={i}
                className={cn(
                  'py-[0.15rem] text-[0.95rem] leading-snug',
                  numeric[i] ? 'text-right tabular-nums' : 'text-left',
                  i === qty && 'pl-2 text-[0.8rem] text-[#8a7f70]',
                  i === 0 && 'pr-3',
                )}
              >
                {i === qty ? formatQty(row[i] ?? '') : formatCell(row[i] ?? '')}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

const Blocks = ({ blocks }: { blocks: PosterBlock[] }) => (
  <>
    {blocks.map((b, i) => (b.kind === 'table'
      ? <Table key={i} table={b} />
      : <p key={i} className="my-1.5 text-[0.95rem] leading-relaxed">{b.text}</p>))}
  </>
);

/** The poster itself. Nothing in here depends on the app's theme, so what is
 *  on screen is what comes out of the printer. */
function Sheet({ poster }: { poster: Poster }) {
  const empty = !poster.title && poster.sections.length === 0 && poster.blocks.length === 0;

  return (
    <article
      className="poster-sheet mx-auto w-full max-w-[52rem] rounded-sm bg-[#faf7f0] px-8 py-10 text-[#1c1917] shadow-sm ring-1 ring-black/10"
      style={{ fontFamily: SERIF }}
    >
      {empty ? (
        <p className="py-16 text-center text-sm text-[#8a7f70]">
          The poster appears here as you type.
        </p>
      ) : (
        <>
          <header className="text-center">
            {poster.title && (
              <h1 className="text-[1.75rem] leading-tight font-bold tracking-wide uppercase">
                {poster.title}
              </h1>
            )}
            {poster.subtitle && (
              <p className="mt-1.5 text-[0.85rem] text-[#6b625a]">{poster.subtitle}</p>
            )}
            {poster.meta.length > 0 && (
              <p className="mt-1 text-[0.75rem] uppercase tracking-[0.1em] text-[#8a7f70]">
                {poster.meta.map((m) => `${m.key}: ${m.value}`).join(' · ')}
              </p>
            )}
            <hr className="mt-4 border-0 border-t-2 border-[#1c1917]" />
          </header>

          {poster.blocks.length > 0 && (
            <div className="mt-4"><Blocks blocks={poster.blocks} /></div>
          )}

          {/* Two columns on a wide sheet and on paper, so a long list reads as
              one notice instead of a scroll. A section is never split. */}
          <div className="mt-5 gap-8 sm:columns-2">
            {poster.sections.map((s, i) => (
              <section key={i} className="mb-5 break-inside-avoid">
                <h2 className="mb-1 border-b border-[#cdc3b4] pb-1 text-[0.95rem] font-bold uppercase tracking-[0.08em]">
                  {s.heading}
                </h2>
                <Blocks blocks={s.blocks} />
              </section>
            ))}
          </div>

          {poster.footer && (
            <footer className="mt-5 border-t-2 border-[#1c1917] pt-3">
              <p className="text-center text-[0.85rem] leading-relaxed text-[#4a423b]">
                {poster.footer}
              </p>
            </footer>
          )}
        </>
      )}
    </article>
  );
}

const HELP: Array<[string, string]> = [
  ['@title:  @subtitle:  @footer:', 'the poster’s own lines'],
  ['@columns: Item, Price, Qty', 'names the columns for the rows after it'],
  ['@anything: value', 'carried through and printed under the subtitle'],
  ['# Heading', 'starts a section'],
  ['Item, Ad, 2500, 3', 'a row — "quote a cell" that needs a comma'],
  ['> Some words', 'a paragraph'],
  ['// Some words', 'a note to yourself, never printed'],
];

/**
 * Turns a written template into a printable poster.
 *
 * Deliberately not generated: the layout is fixed and the parser only sorts
 * lines, so the same template always produces the same sheet and nothing
 * appears on it that nobody typed. Numbers are set with separators, a quantity
 * of one is left off, and rows stay in the order they were written.
 */
export function PosterMaker({ db, update }: {
  db: DB;
  update: (fn: (d: DB) => void) => void;
}) {
  const [src, setSrc] = useState(() => {
    try {
      return localStorage.getItem(KEY) ?? '';
    } catch {
      return '';
    }
  });
  // Which saved poster the draft came from, so Save goes back to the same one
  // rather than leaving a copy behind every time.
  const [openId, setOpenId] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    try {
      if (src.trim()) localStorage.setItem(KEY, src);
      else localStorage.removeItem(KEY);
    } catch {
      /* private window — the draft just won't survive a reload */
    }
  }, [src]);

  const poster = useMemo(() => parsePoster(src), [src]);
  const rows = poster.sections.reduce(
    (n, s) => n + s.blocks.reduce((m, b) => m + (b.kind === 'table' ? b.rows.length : 0), 0),
    0,
  );

  const saved = db.posters.slice().sort((a, b) => (b.at || '').localeCompare(a.at || ''));
  const open = openId ? db.posters.find((p) => p.id === openId) ?? null : null;
  const dirty = open ? open.template !== src : src.trim() !== '';

  const store = (id: string | null) => {
    const title = poster.title.trim() || 'Untitled poster';
    const at = new Date().toISOString();
    if (id) {
      update((d) => {
        const p = d.posters.find((x) => x.id === id);
        if (p) { p.title = title; p.template = src; p.at = at; }
      });
      setOpenId(id);
      return;
    }
    const fresh = uid();
    update((d) => { d.posters.push({ id: fresh, title, template: src, at }); });
    setOpenId(fresh);
  };

  /** Loading over unsaved work asks first — the draft is the only copy. */
  const load = (id: string, template: string) => {
    if (dirty && !confirm('Open this poster? The draft on screen hasn’t been saved.')) return;
    setSrc(template);
    setOpenId(id);
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(posterToText(poster));
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard refused — the preview is still there to copy by hand */
    }
  };

  // Drawn at 2x, so the picture holds up pinned next to a Discord message.
  const savePng = () => {
    setErr('');
    try {
      posterToCanvas(poster, 2).toBlob((blob) => {
        if (!blob) { setErr('The picture could not be made. Print to PDF instead.'); return; }
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = posterFilename(poster);
        a.click();
        // Freed on the next turn, once the browser has taken the blob.
        window.setTimeout(() => URL.revokeObjectURL(url), 0);
      }, 'image/png');
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'The picture could not be made.');
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" onClick={() => window.print()} disabled={!src.trim()}>
          <Printer />Print or save as PDF
        </Button>
        <Button size="sm" variant="outline" onClick={savePng} disabled={!src.trim()}>
          <ImageIcon />Save as PNG
        </Button>
        <Button size="sm" variant="outline" onClick={() => void copy()} disabled={!src.trim()}>
          <ClipboardCopy />{copied ? 'Copied' : 'Copy as text'}
        </Button>
        <Button size="sm" variant="outline" onClick={() => setSrc(EXAMPLE)}>
          <FileText />Load the example
        </Button>
        <Button size="sm" variant="outline" onClick={() => store(open ? open.id : null)} disabled={!src.trim() || !dirty}>
          <Save />{open ? 'Save changes' : 'Save to the guild'}
        </Button>
        {open && (
          <Button size="sm" variant="ghost" onClick={() => store(null)} disabled={!src.trim()}>
            Save a copy
          </Button>
        )}
        {src.trim() && (
          <Button
            size="sm" variant="ghost" className="text-destructive"
            onClick={() => {
              if (confirm('Clear the template? The saved copy, if there is one, stays.')) {
                setSrc('');
                setOpenId(null);
              }
            }}
          >
            <Eraser />Clear
          </Button>
        )}
        <span className="ml-auto flex items-center gap-2 text-xs text-muted-foreground">
          {open && (
            <TonedBadge tone={dirty ? 'amber' : 'green'}>
              {dirty ? 'Unsaved changes' : `Saved · ${open.title}`}
            </TonedBadge>
          )}
          {poster.sections.length} section{poster.sections.length === 1 ? '' : 's'} · {rows} row{rows === 1 ? '' : 's'}
        </span>
      </div>

      {err && (
        <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive print:hidden">
          {err}
        </p>
      )}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]">
        <div className="space-y-3 print:hidden">
          <Textarea
            value={src}
            onChange={(e) => setSrc(e.target.value)}
            spellCheck={false}
            placeholder={'@title: What this is\n@columns: Item, Price\n\n# A section\nSomething, 250\n\n> A line of prose.'}
            className="h-[28rem] font-mono text-xs"
          />
          {saved.length > 0 && (
            <Card>
              <CardContent className="space-y-1.5 p-3">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Saved posters
                </p>
                <div className="divide-y overflow-hidden rounded-md border">
                  {saved.map((p) => (
                    <div
                      key={p.id}
                      className={cn(
                        'flex items-center gap-2 bg-card px-2 py-1.5',
                        p.id === openId && 'bg-sky-500/10',
                      )}
                    >
                      <button
                        type="button"
                        className="min-w-0 flex-1 text-left"
                        onClick={() => load(p.id, p.template)}
                      >
                        <span className="block truncate text-sm">{p.title}</span>
                        <span className="block text-[11px] text-muted-foreground">
                          saved {ago(p.at)}
                        </span>
                      </button>
                      <Button
                        variant="ghost" size="icon-xs" className="text-destructive"
                        aria-label={`Delete ${p.title}`}
                        onClick={() => {
                          if (!confirm(`Delete “${p.title}” from the saved posters?`)) return;
                          update((d) => { d.posters = d.posters.filter((x) => x.id !== p.id); });
                          if (p.id === openId) setOpenId(null);
                        }}
                      >
                        <Trash2 />
                      </Button>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardContent className="space-y-1.5 p-3">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                One instruction per line
              </p>
              <dl className="space-y-1">
                {HELP.map(([syntax, what]) => (
                  <div key={syntax} className="grid grid-cols-[auto_1fr] gap-x-2 text-[11px]">
                    <dt className="font-mono text-foreground">{syntax}</dt>
                    <dd className="text-muted-foreground">{what}</dd>
                  </div>
                ))}
              </dl>
            </CardContent>
          </Card>
        </div>

        <div className="min-w-0">
          <Sheet poster={poster} />
        </div>
      </div>

      <p className="text-xs text-muted-foreground print:hidden">
        The sheet is laid out from the template, never generated — the same template always gives
        the same poster. Printing shows only the sheet, so “Save as PDF” gives a clean copy; Save as
        PNG draws the same poster at double size as a picture; Copy as text gives a version to paste
        into Discord. The draft is kept in this browser; saving puts the template itself in the
        guild database, so an old poster opens as something still editable rather than a picture.
      </p>
    </div>
  );
}
