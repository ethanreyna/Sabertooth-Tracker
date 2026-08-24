import { ImageIcon, MapPin, MapPinPlus, Pencil, Trash2, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState, TonedBadge } from '@/components/bits';
import type { Tone } from '@/components/bits';
import { ago } from '@/lib/format';
import type { DB } from '@/types';

const DIFFICULTY_TONE: Record<string, Tone> = {
  Easy: 'green', Moderate: 'blue', Hard: 'amber', Deadly: 'red',
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
        <Card key={g.id} className="flex flex-col overflow-hidden py-0">
          {g.imgs.length > 0 ? (
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
              <span className="text-xs">No map screenshot</span>
            </div>
          )}

          <div className="flex flex-1 flex-col gap-2 p-3.5">
            <div className="flex items-start gap-2">
              <span className="min-w-0 flex-1 text-sm font-semibold">{g.name}</span>
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

            <p className="flex items-center gap-1.5 text-xs">
              <Users className="size-3 shrink-0 text-muted-foreground" />
              <span className="font-medium">
                {g.recommended > 0 ? `${g.recommended} recommended` : 'Party size unknown'}
              </span>
            </p>

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
