import { Suspense, lazy } from 'react';
import { Info } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Card } from '@/components/ui/card';
import { TonedBadge } from '@/components/bits';
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

export function MapView({ db, readOnly, onPick, onOpen }: {
  db: DB;
  readOnly: boolean;
  onPick: (x: number, y: number) => void;
  onOpen: (id: string) => void;
}) {
  const placed = db.spots.filter((s) => s.x !== '' && s.y !== '').length;
  const unplaced = db.spots.length - placed;

  return (
    <div className="flex h-full flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
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

      {!readOnly && (
        <Alert>
          <Info />
          <AlertDescription>
            Click anywhere on the map to add a point of interest there — the coordinates are filled
            in for you. Click a marker to open it.
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
          <MapCanvas db={db} readOnly={readOnly} onPick={onPick} onOpen={onOpen} />
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
