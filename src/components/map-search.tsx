import { useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { TonedBadge } from '@/components/bits';
import { STATUS_LABEL } from '@/lib/dungeon';
import type { MapKind } from '@/components/map-canvas';
import type { DB } from '@/types';

interface Hit {
  kind: MapKind;
  id: string;
  name: string;
  detail: string;
  placed: boolean;
}

function search(db: DB, q: string): Hit[] {
  const needle = q.trim().toLowerCase();
  if (!needle) return [];

  const spots: Hit[] = db.spots
    .filter((s) => s.name.toLowerCase().includes(needle) || s.kind.toLowerCase().includes(needle))
    .map((s) => ({ kind: 'spot', id: s.id, name: s.name, detail: s.kind, placed: s.x !== '' && s.y !== '' }));

  const dungeons: Hit[] = db.dungeons
    .filter((g) => g.name.toLowerCase().includes(needle) || g.location.toLowerCase().includes(needle))
    .map((g) => ({
      kind: 'dungeon', id: g.id, name: g.name,
      detail: `Dungeon (${STATUS_LABEL[g.status]})`,
      placed: g.x !== '' && g.y !== '',
    }));

  return [...dungeons, ...spots].slice(0, 30);
}

/**
 * Finds a point of interest or dungeon by name and jumps the map to it.
 *
 * A guild running 50+ points doesn't want to pan and squint for one dungeon —
 * this is the same lookup the Dungeons and Points-of-interest lists already
 * offer, just aimed at the map instead. An unplaced result still shows, marked
 * as such, since "not on the map yet" is itself useful to know from here.
 */
export function MapSearch({ db, onSelect }: {
  db: DB;
  /** `placed` tells the caller whether there's anywhere to fly to. */
  onSelect: (kind: MapKind, id: string, placed: boolean) => void;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');

  const hits = useMemo(() => search(db, q), [db, q]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button type="button" variant="outline" className="w-64 justify-start font-normal max-sm:w-full">
            <Search className="text-muted-foreground" />
            <span className="text-muted-foreground">Find on the map…</span>
          </Button>
        }
      />
      <PopoverContent className="w-(--anchor-width) p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput placeholder="Dungeon or point of interest…" value={q} onValueChange={setQ} autoFocus />
          <CommandList>
            {q.trim() === '' && <CommandEmpty>Start typing a name.</CommandEmpty>}
            {q.trim() !== '' && hits.length === 0 && <CommandEmpty>Nothing matches “{q}”.</CommandEmpty>}
            {hits.length > 0 && (
              <CommandGroup>
                {hits.map((h) => (
                  <CommandItem
                    key={`${h.kind}:${h.id}`}
                    value={`${h.kind}:${h.id}`}
                    onSelect={() => { onSelect(h.kind, h.id, h.placed); setOpen(false); setQ(''); }}
                  >
                    <span className="min-w-0 flex-1 truncate">{h.name}</span>
                    <span className="shrink-0 text-xs text-muted-foreground">{h.detail}</span>
                    {!h.placed && <TonedBadge tone="amber" className="shrink-0">not placed</TonedBadge>}
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
