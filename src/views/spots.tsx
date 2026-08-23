import { useMemo, useState } from 'react';
import { ExternalLink, ImageIcon, Map, MapPin, Pencil, RefreshCw, Search, Trash2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { EmptyState, TonedBadge } from '@/components/bits';
import type { Tone } from '@/components/bits';
import { ago } from '@/lib/format';
import { KEIZAAL_MAP_URL, uespMapUrl } from '@/lib/maps';
import type { DB, Spot } from '@/types';

const ALL = '__all';

const KIND_TONE: Record<string, Tone> = {
  ore: 'neutral', hunting: 'red', alchemy: 'green', fishing: 'blue', wood: 'amber',
};
const toneFor = (kind: string) => KIND_TONE[kind.toLowerCase()] ?? 'neutral';

function SpotCard({ spot, readOnly, onEdit, remove }: {
  spot: Spot; readOnly: boolean; onEdit: (id: string) => void; remove: (s: Spot) => void;
}) {
  const uesp = uespMapUrl(spot.x, spot.y);
  return (
    <Card className="flex flex-col overflow-hidden py-0">
      {spot.imgs.length > 0 ? (
        <div className={spot.imgs.length > 1 ? 'grid grid-cols-2 gap-px bg-border' : ''}>
          {spot.imgs.slice(0, 4).map((src, i) => (
            <a key={src} href={src} target="_blank" rel="noreferrer" className="block">
              <img
                src={src} alt={`${spot.name} ${i + 1}`} loading="lazy"
                className={spot.imgs.length > 1 ? 'h-24 w-full object-cover' : 'h-40 w-full border-b object-cover'}
              />
            </a>
          ))}
        </div>
      ) : (
        <div className="flex h-32 flex-col items-center justify-center gap-1.5 border-b bg-muted/40 text-muted-foreground">
          <ImageIcon className="size-6" />
          <span className="text-xs">No screenshot</span>
        </div>
      )}

      <div className="flex flex-1 flex-col gap-2 p-3.5">
        <div className="flex items-start gap-2">
          <span className="min-w-0 flex-1 text-sm font-semibold">{spot.name}</span>
          <TonedBadge tone={toneFor(spot.kind)}>{spot.kind}</TonedBadge>
        </div>

        {spot.location && (
          <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
            <MapPin className="mt-0.5 size-3 shrink-0" />
            <span className="min-w-0">{spot.location}</span>
          </p>
        )}

        {spot.yield && (
          <p className="text-xs">
            <span className="text-muted-foreground">Yield: </span>{spot.yield}
          </p>
        )}

        {spot.respawn && (
          <p className="flex items-center gap-1.5 text-xs">
            <RefreshCw className="size-3 shrink-0 text-muted-foreground" />
            <span>Respawns {spot.respawn}</span>
          </p>
        )}

        {spot.x && spot.y && (
          <p className="text-xs">
            <span className="text-muted-foreground">Coords: </span>
            <span className="tabular-nums">{spot.x}, {spot.y}</span>
          </p>
        )}

        {spot.notes && <p className="text-xs whitespace-pre-wrap">{spot.notes}</p>}

        {(uesp || spot.mapUrl) && (
          <div className="flex flex-wrap gap-1.5">
            {uesp && (
              <Button
                variant="outline" size="xs"
                render={<a href={uesp} target="_blank" rel="noreferrer" />}
              >
                <Map />
                UESP map
              </Button>
            )}
            {spot.mapUrl && (
              <Button
                variant="outline" size="xs"
                render={<a href={spot.mapUrl} target="_blank" rel="noreferrer" />}
              >
                <ExternalLink />
                Keizaal map
              </Button>
            )}
          </div>
        )}

        <div className="mt-auto flex items-center gap-2 pt-1">
          <span className="text-xs text-muted-foreground">
            {spot.addedBy ? `Added by ${spot.addedBy}` : 'Added'} {ago(spot.at)}
          </span>
          {!readOnly && (
            <>
              <Button
                variant="ghost" size="icon-xs" className="ml-auto"
                aria-label={`Edit ${spot.name}`} onClick={() => onEdit(spot.id)}
              >
                <Pencil />
              </Button>
              <Button
                variant="ghost" size="icon-xs" className="text-destructive"
                aria-label={`Remove ${spot.name}`} onClick={() => remove(spot)}
              >
                <Trash2 />
              </Button>
            </>
          )}
        </div>
      </div>
    </Card>
  );
}

export function Spots({ db, update, readOnly, onEdit }: {
  db: DB;
  update: (fn: (d: DB) => void) => void;
  readOnly: boolean;
  onEdit: (id: string) => void;
}) {
  const [q, setQ] = useState('');
  const [kind, setKind] = useState(ALL);

  // Tabs come from the kinds that actually exist, so writing in a new one adds
  // its tab rather than needing a code change.
  const kinds = useMemo(() => {
    const seen: string[] = [];
    for (const sp of db.spots) if (sp.kind && !seen.includes(sp.kind)) seen.push(sp.kind);
    return seen.sort((a, b) => a.localeCompare(b));
  }, [db.spots]);

  const filtered = useMemo(() => {
    const terms = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
    return db.spots.filter((sp) => {
      if (!terms.length) return true;
      const hay = `${sp.name} ${sp.kind} ${sp.location} ${sp.yield} ${sp.notes}`.toLowerCase();
      return terms.every((t) => hay.includes(t));
    });
  }, [db.spots, q]);

  const remove = (sp: Spot) => {
    if (!confirm(`Remove ${sp.name}?`)) return;
    update((d) => { d.spots = d.spots.filter((x) => x.id !== sp.id); });
  };

  const forKind = (k: string) =>
    (k === ALL ? filtered : filtered.filter((sp) => sp.kind === k))
      .slice()
      .sort((a, b) => a.name.localeCompare(b.name));

  const mapLink = (
    <Button variant="ghost" size="sm" render={<a href={KEIZAAL_MAP_URL} target="_blank" rel="noreferrer" />}>
      <ExternalLink />
      Keizaal map
    </Button>
  );

  if (db.spots.length === 0) {
    return (
      <div className="space-y-3">
        <EmptyState>
          {readOnly
            ? 'No points of interest recorded yet.'
            : 'Nothing here yet. Add one with New point — ore veins, hunting grounds, ingredient patches, fishing holes.'}
        </EmptyState>
        <div className="flex justify-center">{mapLink}</div>
      </div>
    );
  }

  const grid = (list: Spot[]) => (
    list.length === 0
      ? <EmptyState>Nothing here matches.</EmptyState>
      : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {list.map((sp) => (
            <SpotCard key={sp.id} spot={sp} readOnly={readOnly} onEdit={onEdit} remove={remove} />
          ))}
        </div>
      )
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-72">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search points of interest…" value={q} onChange={(e) => setQ(e.target.value)}
            className="h-8 pl-8"
          />
          {q && (
            <Button
              variant="ghost" size="icon-xs" aria-label="Clear search"
              className="absolute right-1 top-1/2 -translate-y-1/2"
              onClick={() => setQ('')}
            >
              <X />
            </Button>
          )}
        </div>
        <div className="ml-auto">{mapLink}</div>
      </div>

      <Tabs value={kind} onValueChange={(v) => setKind(v ? String(v) : ALL)}>
        <TabsList className="flex-wrap">
          <TabsTrigger value={ALL}>
            All <span className="ml-1.5 text-xs opacity-60">{forKind(ALL).length}</span>
          </TabsTrigger>
          {kinds.map((k) => (
            <TabsTrigger key={k} value={k}>
              {k} <span className="ml-1.5 text-xs opacity-60">{forKind(k).length}</span>
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value={ALL} className="mt-4">{grid(forKind(ALL))}</TabsContent>
        {kinds.map((k) => (
          <TabsContent key={k} value={k} className="mt-4">{grid(forKind(k))}</TabsContent>
        ))}
      </Tabs>
    </div>
  );
}
