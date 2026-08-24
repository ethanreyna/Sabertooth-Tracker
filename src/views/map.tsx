import { Suspense, lazy, useState } from 'react';
import { MapPinPlus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Card } from '@/components/ui/card';
import { TonedBadge } from '@/components/bits';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Spots } from '@/views/spots';
import type { MapKind } from '@/components/map-canvas';
import type { DB } from '@/types';

// Leaflet and its CSS are ~45KB gzipped, and only this screen needs them.
const MapCanvas = lazy(() => import('@/components/map-canvas'));

export type AddMode = 'point' | 'dungeon' | 'settlement';

const ADDS: Array<[AddMode, string]> = [
  ['point', 'Point of interest'],
  ['dungeon', 'Dungeon'],
  ['settlement', 'Settlement'],
];

const LEGEND: Array<[string, string]> = [
  ['Ore', 'bg-zinc-400'],
  ['Hunting', 'bg-red-500'],
  ['Alchemy', 'bg-emerald-500'],
  ['Fishing', 'bg-sky-500'],
  ['Wood', 'bg-amber-500'],
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
  placing: { id: string; name: string } | null;
  onCancelPlacing: () => void;
  addMode: AddMode;
  onAddModeChange: (m: AddMode) => void;
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
        <div className="ml-auto flex flex-wrap items-center gap-3">
          {LEGEND.map(([label, dot]) => (
            <span key={label} className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <span className={`size-2.5 rounded-full ring-1 ring-black/40 ${dot}`} />
              {label}
            </span>
          ))}
          <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <svg viewBox="0 0 24 24" className="size-3.5" aria-hidden="true">
              <path d="M12 2 C6 2 3 7 3 13 v8 h5 v-6 a4 4 0 0 1 8 0 v6 h5 v-8 c0-6-3-11-9-11z"
                fill="currentColor" />
            </svg>
            Dungeon
          </span>
          <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <svg viewBox="0 0 24 24" className="size-3.5" aria-hidden="true">
              <path d="M12 2 2 11 h3 v11 h6 v-6 h2 v6 h6 V11 h3z" fill="currentColor" />
            </svg>
            Settlement
          </span>
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
        <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-muted/30 px-3 py-2">
          <span className="text-xs text-muted-foreground">A click on the map adds:</span>
          {ADDS.map(([value, label]) => (
            <button key={value} type="button" onClick={() => onAddModeChange(value)}>
              <TonedBadge tone={addMode === value ? 'blue' : 'neutral'}>{label}</TonedBadge>
            </button>
          ))}
          <span className="ml-auto text-xs text-muted-foreground">
            Drag a marker to move it; click one to open or delete it.
          </span>
        </div>
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
