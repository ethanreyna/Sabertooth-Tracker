import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ClipboardCopy, Eraser, FileText, Image as ImageIcon, ImagePlus, Printer, Save, Trash2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { TonedBadge } from '@/components/bits';
import { countRows, countSections, parsePoster, posterToText } from '@/lib/parse-poster';
import { POSTER_W, loadBackground, posterFilename, posterToCanvas } from '@/lib/poster-render';
import { uploadImage } from '@/sync';
import { ago, uid } from '@/lib/format';
import { cn } from '@/lib/utils';
import type { DB, SyncCfg } from '@/types';

const KEY = 'orgimm-poster-v1';

/** A real poster, so the format is legible from the first look rather than
 *  from the notes under it. Two parchments, to show what @panel does. */
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

@panel

# Destruction
Blizzard, M, 10000, 1
Icy Spear, E, 3000, 1
Flame Cloak, Ad, 1200, 1
Ice Spike, A, 1000, 1
Fire Rune, A, 800, 1
Firebolt, A, 800, 2
Frost Rune, A, 800, 2
Flames, N, 400, 1
Sparks, N, 400, 2

# Illusion
Rally, Ad, 2000, 1
Harmony, M, 1000, 1
Mayhem, M, 1000, 1
Calm, A, 400, 2
Courage, N, 300, 4
Fear, N, 300, 2
Muffle, A, 300, 1

@footer: If you're interested, send a pigeon to me or head to the Stronghold Gol-Razhkbur (located at Halted Stream Camp north of Whiterun) and someone will help you purchase the tome if any of our clan is awake.
`;

const HELP: Array<[string, string]> = [
  ['@title:  @subtitle:  @footer:', 'the strips of parchment'],
  ['@background: …', 'the picture behind it — pick one below'],
  ['@columns: Item, Price, Qty', 'names the columns for the rows after it'],
  ['@panel', 'starts another parchment beside the last'],
  ['# Heading', 'a section inside the current parchment'],
  ['Item, Ad, 2500, 3', 'a row — "quote a cell" that needs a comma'],
  ['> Some words', 'a paragraph'],
  ['// Some words', 'a note to yourself, never printed'],
];

/**
 * Turns a written template into a poster: a picture, with torn parchment laid
 * over it. The title and subtitle sit top left, the parchments tile the width
 * beneath them, and the footnote runs along the bottom.
 *
 * Deliberately not generated — the parser only sorts lines and the layout is
 * fixed, so the same template always draws the same poster and nothing appears
 * on it that nobody typed.
 */
export function PosterMaker({ db, update, cfg }: {
  db: DB;
  update: (fn: (d: DB) => void) => void;
  cfg: SyncCfg | null;
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
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [bg, setBg] = useState<HTMLImageElement | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const viewRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    try {
      if (src.trim()) localStorage.setItem(KEY, src);
      else localStorage.removeItem(KEY);
    } catch {
      /* private window — the draft just won't survive a reload */
    }
  }, [src]);

  const poster = useMemo(() => parsePoster(src), [src]);

  // The picture is fetched once per address, not once per keystroke.
  useEffect(() => {
    let alive = true;
    void loadBackground(poster.background).then((img) => { if (alive) setBg(img); });
    return () => { alive = false; };
  }, [poster.background]);

  // The preview is the export: the same draw, copied onto the canvas on screen.
  useEffect(() => {
    const host = viewRef.current;
    if (!host) return;
    try {
      const drawn = posterToCanvas(poster, bg, 2);
      host.width = drawn.width;
      host.height = drawn.height;
      host.getContext('2d')?.drawImage(drawn, 0, 0);
    } catch {
      /* nothing to draw yet */
    }
  }, [poster, bg]);

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

  /** Rewrites the @background line, or adds one at the top if there isn't one. */
  const useBackground = (url: string) => setSrc((prev) => {
    const lines = prev.split('\n');
    const at = lines.findIndex((l) => /^@background\s*:/i.test(l.trim()));
    if (at >= 0) {
      lines[at] = `@background: ${url}`;
      return lines.join('\n');
    }
    return `@background: ${url}\n${prev}`;
  });

  const upload = async (file: File) => {
    if (!cfg) { setErr('Sign in before uploading a background.'); return; }
    setBusy(true);
    setErr('');
    try {
      const url = await uploadImage(cfg, file);
      if (!url) throw new Error('The upload came back empty.');
      update((d) => {
        d.backgrounds.push({
          id: uid(),
          name: file.name.replace(/\.[^.]+$/, '').slice(0, 60) || 'Background',
          url,
          at: new Date().toISOString(),
        });
      });
      useBackground(url);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'That background could not be uploaded.');
    } finally {
      setBusy(false);
    }
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

  const savePng = () => {
    setErr('');
    try {
      posterToCanvas(poster, bg, 2).toBlob((blob) => {
        if (!blob) { setErr('The picture could not be made. Print to PDF instead.'); return; }
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = posterFilename(poster);
        a.click();
        window.setTimeout(() => URL.revokeObjectURL(url), 0);
      }, 'image/png');
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'The picture could not be made.');
    }
  };

  const sections = countSections(poster);
  const rows = countRows(poster);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 print:hidden">
        <Button size="sm" onClick={savePng} disabled={!src.trim()}>
          <ImageIcon />Save as PNG
        </Button>
        <Button size="sm" variant="outline" onClick={() => window.print()} disabled={!src.trim()}>
          <Printer />Print
        </Button>
        <Button size="sm" variant="outline" onClick={() => void copy()} disabled={!src.trim()}>
          <ClipboardCopy />{copied ? 'Copied' : 'Copy as text'}
        </Button>
        <Button size="sm" variant="outline" onClick={() => store(open ? open.id : null)} disabled={!src.trim() || !dirty}>
          <Save />{open ? 'Save changes' : 'Save to the guild'}
        </Button>
        {open && (
          <Button size="sm" variant="ghost" onClick={() => store(null)} disabled={!src.trim()}>
            Save a copy
          </Button>
        )}
        <Button size="sm" variant="outline" onClick={() => setSrc(EXAMPLE)}>
          <FileText />Load the example
        </Button>
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
          {poster.panels.length} parchment{poster.panels.length === 1 ? '' : 's'} · {sections} section{sections === 1 ? '' : 's'} · {rows} row{rows === 1 ? '' : 's'}
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
            placeholder={'@title: What this is\n@columns: Item, Price\n\n# A section\nSomething, 250\n\n@panel\n# Another parchment\nSomething else, 400'}
            className="h-80 font-mono text-xs"
          />

          <Card>
            <CardContent className="space-y-2 p-3">
              <div className="flex items-center gap-2">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Background
                </p>
                <Button
                  size="xs" variant="outline" className="ml-auto" disabled={busy}
                  onClick={() => fileRef.current?.click()}
                >
                  <ImagePlus />{busy ? 'Uploading…' : 'Upload'}
                </Button>
                <Input
                  ref={fileRef} type="file" accept="image/*" className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    e.target.value = '';
                    if (f) void upload(f);
                  }}
                />
              </div>
              {db.backgrounds.length === 0 ? (
                <p className="text-[11px] text-muted-foreground">
                  Upload a screenshot to sit behind the parchment. It's kept for the whole guild.
                </p>
              ) : (
                <div className="grid grid-cols-3 gap-1.5">
                  <button
                    type="button"
                    className={cn(
                      'flex h-14 items-center justify-center rounded border border-dashed text-[11px] text-muted-foreground',
                      !poster.background && 'border-sky-500 text-foreground',
                    )}
                    onClick={() => useBackground('')}
                  >
                    None
                  </button>
                  {db.backgrounds.map((b) => (
                    <div key={b.id} className="group relative">
                      <button
                        type="button"
                        className={cn(
                          'block h-14 w-full overflow-hidden rounded border',
                          poster.background === b.url ? 'border-sky-500 ring-1 ring-sky-500' : 'border-border',
                        )}
                        title={b.name}
                        onClick={() => useBackground(b.url)}
                      >
                        <img src={b.url} alt={b.name} className="h-full w-full object-cover" />
                      </button>
                      <Button
                        variant="destructive" size="icon-xs"
                        className="absolute right-0.5 top-0.5 opacity-0 group-hover:opacity-100"
                        aria-label={`Remove ${b.name}`}
                        onClick={() => {
                          if (!confirm(`Remove “${b.name}” from the backgrounds?`)) return;
                          update((d) => { d.backgrounds = d.backgrounds.filter((x) => x.id !== b.id); });
                        }}
                      >
                        <Trash2 />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

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
                        <span className="block text-[11px] text-muted-foreground">saved {ago(p.at)}</span>
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
          {src.trim() ? (
            <canvas
              ref={viewRef}
              className="poster-sheet h-auto w-full rounded-sm shadow-sm ring-1 ring-black/10"
              style={{ maxWidth: POSTER_W }}
            />
          ) : (
            <div className="rounded-xl border border-dashed p-16 text-center text-sm text-muted-foreground">
              The poster appears here as you type.
            </div>
          )}
        </div>
      </div>

      <p className="text-xs text-muted-foreground print:hidden">
        The poster is drawn from the template, never generated — the same template always gives the
        same picture, and what's on screen is exactly what Save as PNG writes out, at twice the size.
        Copy as text gives a version to paste into Discord. The draft is kept in this browser; saving
        puts the template itself in the guild database, so an old poster opens still editable.
      </p>
    </div>
  );
}
