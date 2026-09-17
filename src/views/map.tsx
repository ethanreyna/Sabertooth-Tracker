import { Suspense, lazy, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Filter, MapPinPlus, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Card } from '@/components/ui/card';
import { TonedBadge } from '@/components/bits';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Spots } from '@/views/spots';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import type { MapCanvasHandle, MapKind, MoveRequest } from '@/components/map-canvas';
import { MapSearch } from '@/components/map-search';
import { ChunkBoundary } from '@/components/chunk-boundary';
import { lazyChunk } from '@/lib/lazy-chunk';
import { dungeonHay, kindFilter, matchesAny, spotHay, statusFilter, textFilter } from '@/lib/map-filter';
import type { MapFilter } from '@/lib/map-filter';
import { cn } from '@/lib/utils';
import type { DB } from '@/types';

// Leaflet and its CSS are ~45KB gzipped, and only this screen needs them.
// Wrapped, because a tab open across a deploy asks for a chunk that no longer
// exists — see lazyChunk.
const MapCanvas = lazy(lazyChunk(() => import('@/components/map-canvas')));

export type AddMode = 'point' | 'dungeon' | 'settlement';

const ADDS: Array<[AddMode, string]> = [
  ['point', 'Point of interest'],
  ['dungeon', 'Dungeon'],
  ['settlement', 'Settlement'],
];

const CAVE = 'M12 2 C6 2 3 7 3 13 v8 h5 v-6 a4 4 0 0 1 8 0 v6 h5 v-8 c0-6-3-11-9-11z';
const HOUSE = 'M12 2 2 11 h3 v11 h6 v-6 h2 v6 h6 V11 h3z';

const dot = (color: string) => (
  <span className={cn('size-2.5 shrink-0 rounded-full ring-1 ring-black/40', color)} />
);
const glyph = (path: string, fill: string, opts: { glow?: string; className?: string } = {}) => (
  <svg
    viewBox="0 0 24 24" className={cn('size-3.5 shrink-0', opts.className)} aria-hidden="true"
    style={opts.glow ? { filter: `drop-shadow(0 0 3px ${opts.glow})` } : undefined}
  >
    <path d={path} fill={fill} />
  </svg>
);

/** Every symbol the map uses, each doubling as a one-click filter for its kind. */
const LEGEND: Array<{ filter: MapFilter; icon: ReactNode }> = [
  { filter: kindFilter('Ore'), icon: dot('bg-yellow-500') },
  { filter: kindFilter('Hunting'), icon: dot('bg-red-500') },
  { filter: kindFilter('Alchemy'), icon: dot('bg-emerald-500') },
  { filter: kindFilter('Crafting'), icon: dot('bg-blue-500') },
  { filter: statusFilter('active'), icon: glyph(CAVE, '#f5b942', { glow: 'rgba(245,185,66,.8)' }) },
  { filter: statusFilter('disabled'), icon: glyph(CAVE, '#71717a', { className: 'opacity-60' }) },
  { filter: statusFilter('unknown'), icon: glyph(CAVE, '#94a3b8') },
  { filter: kindFilter('Settlement'), icon: glyph(HOUSE, 'currentColor') },
];

export function MapView({ db, update, readOnly, placing, addMode, onAddModeChange, onPick, onOpen, onDelete, onMove, onCancelPlacing }: {
  db: DB;
  update: (fn: (d: DB) => void) => void;
  readOnly: boolean;
  onPick: (x: number, y: number) => void;
  onOpen: (kind: MapKind, id: string) => void;
  onDelete: (kind: MapKind, id: string) => void;
  onMove: (kind: MapKind, id: string, x: number, y: number) => void;
  /** A dungeon awaiting a click to set its coordinates. */
  placing: { id: string; name: string; kind: MapKind } | null;
  onCancelPlacing: () => void;
  addMode: AddMode;
  onAddModeChange: (m: AddMode) => void;
}) {
  const [tab, setTab] = useState<'map' | 'list'>('map');
  const canvasRef = useRef<MapCanvasHandle>(null);
  // A dropped marker, waiting to be confirmed. Nothing is written to the record
  // until it is: a marker knocked loose can simply be put back.
  const [move, setMove] = useState<MoveRequest | null>(null);
  const placed = db.spots.filter((s) => s.x !== '' && s.y !== '').length;
  const unplaced = db.spots.length - placed;

  // The viewer's own lens: filters light up the markers they match and dim the
  // rest. OR-combined — a second filter widens the view — and never saved;
  // this is for scanning the map, not for the record.
  const [filters, setFilters] = useState<MapFilter[]>([]);
  const terms = filters.map((f) => f.term);
  const has = (f: MapFilter) => filters.some((x) => x.term === f.term);
  const addFilter = (f: MapFilter) => {
    if (!f.term) return;
    setFilters((list) => (list.some((x) => x.term === f.term) ? list : [...list, f]));
  };
  const toggleFilter = (f: MapFilter) => setFilters((list) => (
    list.some((x) => x.term === f.term) ? list.filter((x) => x.term !== f.term) : [...list, f]
  ));
  const removeFilter = (f: MapFilter) => setFilters((list) => list.filter((x) => x.term !== f.term));

  const placedDungeons = db.dungeons.filter((g) => g.x !== '' && g.y !== '');
  const onMap = placed + placedDungeons.length;
  const lit = terms.length === 0 ? onMap
    : db.spots.filter((s) => s.x !== '' && s.y !== '' && matchesAny(spotHay(s), terms)).length
      + placedDungeons.filter((g) => matchesAny(dungeonHay(g), terms)).length;

  // The list lives here rather than in its own sidebar entry: points without
  // coordinates can't appear as markers, so hiding the list would strand them.
  if (tab === 'list') {
    return (
      <div className="space-y-3">
        <Tabs value={tab} onValueChange={(v) => setTab(v === 'list' ? 'list' : 'map')}>
          <TabsList>
            <TabsTrigger value="map">Map</TabsTrigger>
            <TabsTrigger value="list">
              List <span className="ml-1.5 text-xs opacity-60">{db.spots.length}</span>
            </TabsTrigger>
          </TabsList>
        </Tabs>
        <Spots db={db} update={update} readOnly={readOnly} onEdit={(id) => onOpen('spot', id)} />
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <Tabs value={tab} onValueChange={(v) => setTab(v === 'list' ? 'list' : 'map')}>
          <TabsList>
            <TabsTrigger value="map">Map</TabsTrigger>
            <TabsTrigger value="list">
              List <span className="ml-1.5 text-xs opacity-60">{db.spots.length}</span>
            </TabsTrigger>
          </TabsList>
        </Tabs>
        <TonedBadge tone="blue">{placed} on the map</TonedBadge>
        {unplaced > 0 && (
          <TonedBadge tone="amber">{unplaced} without coordinates</TonedBadge>
        )}
        <MapSearch
          db={db}
          onFilter={(term) => addFilter(textFilter(term))}
          onSelect={(kind, id, hasCoords) => {
            // Nothing to fly to without coordinates, so this opens the record
            // instead of failing quietly on a map that never moves.
            if (hasCoords) canvasRef.current?.focus(kind, id);
            else onOpen(kind, id);
          }}
        />
        {/* The legend is also the quickest filter: one click on a symbol lights
            up everything of that kind. Click again to let it go. */}
        <div className="ml-auto flex flex-wrap items-center gap-0.5">
          {LEGEND.map(({ filter, icon }) => {
            const on = has(filter);
            return (
              <button
                key={filter.term} type="button" aria-pressed={on}
                title={on ? `Stop lighting up ${filter.label}` : `Light up every ${filter.label}`}
                onClick={() => toggleFilter(filter)}
                className={cn(
                  'flex items-center gap-1.5 rounded-md px-1.5 py-0.5 text-xs transition-colors',
                  on
                    ? 'bg-sky-500/15 text-foreground'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                )}
              >
                {icon}
                {filter.label}
              </button>
            );
          })}
        </div>
      </div>

      {filters.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-sky-500/25 bg-sky-500/10 px-3 py-2">
          <Filter className="size-3.5 shrink-0 text-sky-700 dark:text-sky-400" />
          <span className="text-xs text-muted-foreground">Lit up:</span>
          {filters.map((f) => (
            <button
              key={f.term} type="button" aria-label={`Remove filter ${f.label}`}
              onClick={() => removeFilter(f)}
            >
              <TonedBadge tone="blue" className="gap-1 pr-1">
                {f.label}
                <X className="size-3" />
              </TonedBadge>
            </button>
          ))}
          <span className="text-xs text-muted-foreground">
            {lit} of {onMap} on the map · only you see this
          </span>
          <Button variant="ghost" size="xs" className="ml-auto" onClick={() => setFilters([])}>
            Clear all
          </Button>
        </div>
      )}

      {!readOnly && placing && (
        <Alert className="border-sky-500/25 bg-sky-500/10 text-sky-700 dark:text-sky-400">
          <MapPinPlus />
          <AlertDescription className="flex flex-wrap items-center gap-2">
            <span>
              Click the map to place <strong>{placing.name}</strong>
              {placing.kind === 'dungeon' ? ' (dungeon)' : ''}.
            </span>
            <Button variant="ghost" size="xs" onClick={onCancelPlacing}>Cancel</Button>
          </AlertDescription>
        </Alert>
      )}

      {!readOnly && !placing && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-muted/30 px-3 py-2">
          <span className="text-xs text-muted-foreground">A click on the map adds:</span>
          {ADDS.map(([value, label]) => (
            <button key={value} type="button" onClick={() => onAddModeChange(value)}>
              <TonedBadge tone={addMode === value ? 'blue' : 'neutral'}>{label}</TonedBadge>
            </button>
          ))}
          <span className="ml-auto text-xs text-muted-foreground">
            Hold a marker for a moment to unlock it, then drag; click one to open or delete it.
          </span>
        </div>
      )}

      <Card className="min-h-96 flex-1 overflow-hidden p-0">
        <ChunkBoundary what="The map">
          <Suspense
            fallback={
              <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                Loading the map…
              </div>
            }
          >
            <MapCanvas
              ref={canvasRef}
              db={db} readOnly={readOnly} filters={terms}
              onPick={onPick} onOpen={onOpen} onDelete={onDelete}
              onMoveRequest={setMove}
              onSetDungeonStatus={(id, status) => update((d) => {
                const t = d.dungeons.find((g) => g.id === id);
                if (t) t.status = status;
              })}
            />
          </Suspense>
        </ChunkBoundary>
      </Card>

      {move && (
        <Dialog
          open
          onOpenChange={(open) => { if (!open) { move.revert(); setMove(null); } }}
        >
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Move {move.name}?</DialogTitle>
              <DialogDescription>
                This rewrites the coordinates on the {move.kind === 'dungeon' ? 'dungeon' : 'point'}{' '}
                record. Cancel and it goes straight back where it was.
              </DialogDescription>
            </DialogHeader>
            <dl className="grid grid-cols-[4rem_1fr] gap-x-4 gap-y-1 text-sm">
              <dt className="text-xs text-muted-foreground">From</dt>
              <dd className="tabular-nums">{move.fromX}, {move.fromY}</dd>
              <dt className="text-xs text-muted-foreground">To</dt>
              <dd className="font-medium tabular-nums">{move.x}, {move.y}</dd>
            </dl>
            <DialogFooter>
              <Button variant="outline" onClick={() => { move.revert(); setMove(null); }}>
                Put it back
              </Button>
              <Button onClick={() => { onMove(move.kind, move.id, move.x, move.y); setMove(null); }}>
                Move it here
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      <p className="text-xs text-muted-foreground">
        Terrain rendered from Skyrim's own LOD textures, cut into tiles and served from this site —
        nobody else's map is being loaded. Coordinates are real world units, so a{' '}
        <code className="text-[11px]">getpos</code> readout drops a marker exactly where you stood.
      </p>
    </div>
  );
}
