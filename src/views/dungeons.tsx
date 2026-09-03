import { ImageIcon, MapPin, MapPinPlus, Package, Pencil, Trash2, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState, TonedBadge } from '@/components/bits';
import { MapThumb } from '@/components/map-thumb';
import type { Tone } from '@/components/bits';
import { STATUS_LABEL } from '@/lib/dungeon';
import { ago } from '@/lib/format';
import { cn } from '@/lib/utils';
import type { DB, DungeonStatus } from '@/types';

const DIFFICULTY_TONE: Record<string, Tone> = {
  Easy: 'green', Moderate: 'blue', Hard: 'amber', Deadly: 'red',
};

/** Matches the map marker's own lit/dark/unknown colouring, in plain text. */
const STATUS_TEXT: Record<DungeonStatus, string> = {
  active: 'text-amber-600 dark:text-amber-400',
  disabled: 'text-muted-foreground',
  unknown: 'text-sky-600 dark:text-sky-400',
};

export function Dungeons({ db, update, readOnly, onEdit, onPlace }: {
  db: DB;
  update: (fn: (d: DB) => void) => void;
  readOnly: boolean;
  onEdit: (id: string) => void;
  /** Hands the dungeon to the map so the next click sets its coordinates. */
  onPlace: (id: string) => void;
}) {
  const dungeons = db.dungeons.slice().sort((a, b) => a.name.localeCompare(b.name));

  if (dungeons.length === 0) {
    return (
      <EmptyState>
        {readOnly ? 'No dungeons scouted yet.' : 'No dungeons yet. Add one with New dungeon.'}
      </EmptyState>
    );
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {dungeons.map((g) => (
        <Card
          key={g.id}
          // Same idea as the map marker: a disabled dungeon reads as unlit —
          // still on record, visibly not worth a special trip. Unknown stays
          // full opacity; it hasn't been ruled out, just not checked yet.
          className={cn('flex flex-col overflow-hidden py-0', g.status === 'disabled' && 'opacity-65')}
        >
          {/* Once a dungeon is on the map it has a picture for free: a crop of
              the guild map with the marker on it. Beats asking anyone to go and
              screenshot their own map, and it can't fall out of date. */}
          {g.x && g.y ? (
            <MapThumb
              x={g.x} y={g.y} zoom={4} className="h-40 border-b" alt={`${g.name} on the map`}
              status={g.status}
              onSetStatus={readOnly ? undefined : (status) => update((d) => {
                const t = d.dungeons.find((x) => x.id === g.id);
                if (t) t.status = status;
              })}
            />
          ) : g.imgs.length > 0 ? (
            <div className={g.imgs.length > 1 ? 'grid grid-cols-2 gap-px bg-border' : ''}>
              {g.imgs.slice(0, 4).map((src, i) => (
                <a key={src} href={src} target="_blank" rel="noreferrer" className="block">
                  <img
                    src={src} alt={`${g.name} map ${i + 1}`} loading="lazy"
                    className={g.imgs.length > 1 ? 'h-24 w-full object-cover' : 'h-40 w-full border-b object-cover'}
                  />
                </a>
              ))}
            </div>
          ) : (
            <div className="flex h-40 flex-col items-center justify-center gap-1.5 border-b bg-muted/40 text-muted-foreground">
              <ImageIcon className="size-6" />
              <span className="text-xs">Not on the map yet</span>
            </div>
          )}

          {/* Uploaded shots stay reachable when the map crop has the header. */}
          {g.x && g.y && g.imgs.length > 0 && (
            <div className="flex gap-1 border-b bg-muted/30 p-1.5">
              {g.imgs.slice(0, 6).map((src, i) => (
                <a key={src} href={src} target="_blank" rel="noreferrer" className="block">
                  <img
                    src={src} alt={`${g.name} screenshot ${i + 1}`} loading="lazy"
                    className="size-10 rounded object-cover"
                  />
                </a>
              ))}
            </div>
          )}

          <div className="flex flex-1 flex-col gap-2 p-3.5">
            <div className="flex items-start gap-2">
              <span className="min-w-0 flex-1 text-sm font-semibold">
                {g.name}{' '}
                <span className={cn('font-normal', STATUS_TEXT[g.status])}>
                  ({STATUS_LABEL[g.status]})
                </span>
              </span>
              {g.difficulty && (
                <TonedBadge tone={DIFFICULTY_TONE[g.difficulty] ?? 'neutral'}>{g.difficulty}</TonedBadge>
              )}
            </div>

            {g.location && (
              <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
                <MapPin className="mt-0.5 size-3 shrink-0" />
                <span className="min-w-0">{g.location}</span>
              </p>
            )}

            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
              <p className="flex items-center gap-1.5">
                <Users className="size-3 shrink-0 text-muted-foreground" />
                <span className="font-medium">
                  {g.recommended > 0 ? `${g.recommended} recommended` : 'Party size unknown'}
                </span>
              </p>
              <p className="flex items-center gap-1.5">
                <Package className="size-3 shrink-0 text-muted-foreground" />
                <span className={g.chests > 0 ? 'font-medium' : 'text-muted-foreground'}>
                  {g.chests > 0
                    ? `${g.chests} chest${g.chests === 1 ? '' : 's'}`
                    : 'chests not counted'}
                </span>
              </p>
            </div>

            {g.notes && <p className="text-xs whitespace-pre-wrap">{g.notes}</p>}

            {!readOnly && (
              <Button
                variant={g.x && g.y ? 'ghost' : 'outline'} size="xs" className="self-start"
                onClick={() => onPlace(g.id)}
              >
                <MapPinPlus />
                {g.x && g.y ? `On the map at ${g.x}, ${g.y} — move` : 'Place on map'}
              </Button>
            )}
            {readOnly && g.x && g.y && (
              <p className="text-xs text-muted-foreground">On the map at {g.x}, {g.y}</p>
            )}

            <div className="mt-auto flex items-center gap-2 pt-1">
              <span className="text-xs text-muted-foreground">
                {g.addedBy ? `Added by ${g.addedBy}` : 'Added'} {ago(g.at)}
              </span>
              {!readOnly && (
                <>
                  <Button
                    variant="ghost" size="icon-xs" className="ml-auto"
                    aria-label={`Edit ${g.name}`} onClick={() => onEdit(g.id)}
                  >
                    <Pencil />
                  </Button>
                  <Button
                    variant="ghost" size="icon-xs" className="text-destructive"
                    aria-label={`Remove ${g.name}`}
                    onClick={() => {
                      if (confirm(`Remove ${g.name}?`)) {
                        update((d) => { d.dungeons = d.dungeons.filter((x) => x.id !== g.id); });
                      }
                    }}
                  >
                    <Trash2 />
                  </Button>
                </>
              )}
            </div>
          </div>
        </Card>
      ))}
    </div>
  );
}
