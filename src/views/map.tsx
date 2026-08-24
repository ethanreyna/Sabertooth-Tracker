import { Suspense, lazy, useState } from 'react';
import { Info, MapPinPlus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Card } from '@/components/ui/card';
import { TonedBadge } from '@/components/bits';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Spots } from '@/views/spots';
import type { DB } from '@/types';

// Leaflet and its CSS are ~45KB gzipped, and only this screen needs them.
const MapCanvas = lazy(() => import('@/components/map-canvas'));

const LEGEND: Array<[string, string]> = [
  ['Ore', 'bg-zinc-400'],
  ['Hunting', 'bg-red-500'],
  ['Alchemy', 'bg-emerald-500'],
  ['Fishing', 'bg-sky-500'],
  ['Wood', 'bg-amber-500'],
];

export function MapView({ db, update, readOnly, placing, onPick, onOpen, onDelete, onMove, onCancelPlacing }: {
  db: DB;
  update: (fn: (d: DB) => void) => void;
  readOnly: boolean;
  onPick: (x: number, y: number) => void;
  onOpen: (id: string) => void;
  onDelete: (id: string) => void;
  onMove: (kind: 'spot' | 'dungeon', id: string, x: number, y: number) => void;
  /** A dungeon awaiting a click to set its coordinates. */
  placing: { id: string; name: string } | null;
  onCancelPlacing: () => void;
}) {
  const [tab, setTab] = useState<'map' | 'list'>('map');
  const placed = db.spots.filter((s) => s.x !== '' && s.y !== '').length;
  const unplaced = db.spots.length - placed;

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
        <Spots db={db} update={update} readOnly={readOnly} onEdit={onOpen} />
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
        <div className="ml-auto flex flex-wrap items-center gap-3">
          {LEGEND.map(([label, dot]) => (
            <span key={label} className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <span className={`size-2.5 rounded-full ring-1 ring-black/40 ${dot}`} />
              {label}
            </span>
          ))}
        </div>
      </div>

      {!readOnly && placing && (
        <Alert className="border-sky-500/25 bg-sky-500/10 text-sky-700 dark:text-sky-400">
          <MapPinPlus />
          <AlertDescription className="flex flex-wrap items-center gap-2">
            <span>Click the map to place <strong>{placing.name}</strong>.</span>
            <Button variant="ghost" size="xs" onClick={onCancelPlacing}>Cancel</Button>
          </AlertDescription>
        </Alert>
      )}

      {!readOnly && !placing && (
        <Alert>
          <Info />
          <AlertDescription>
            Click the map to add a point of interest there — coordinates are filled in for you. Drag
            any marker to correct its position, and click one to open or delete it.
          </AlertDescription>
        </Alert>
      )}

      <Card className="min-h-96 flex-1 overflow-hidden p-0">
        <Suspense
          fallback={
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
              Loading the map…
            </div>
          }
        >
          <MapCanvas
            db={db} readOnly={readOnly}
            onPick={onPick} onOpen={onOpen} onDelete={onDelete} onMove={onMove}
          />
        </Suspense>
      </Card>

      <p className="text-xs text-muted-foreground">
        Terrain rendered from Skyrim's own LOD textures, cut into tiles and served from this site —
        nobody else's map is being loaded. Coordinates are real world units, so a{' '}
        <code className="text-[11px]">getpos</code> readout drops a marker exactly where you stood.
      </p>
    </div>
  );
}
