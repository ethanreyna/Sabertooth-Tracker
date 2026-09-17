import { useMemo, useState } from 'react';
import { Filter, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { TonedBadge } from '@/components/bits';
import { STATUS_LABEL } from '@/lib/dungeon';
import { dungeonHay, matchesAny, spotHay } from '@/lib/map-filter';
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
 * Finds a point of interest or dungeon by name and jumps the map to it — or
 * lights up everything that matches.
 *
 * A guild running 50+ points doesn't want to pan and squint for one dungeon,
 * so a hit flies the map to it. But "where's all the orichalcum" is a
 * different question from "where's Halted Stream", so the first row offers
 * the typed text as a filter instead: every matching marker stays lit and the
 * rest dim, until the filter is cleared. An unplaced result still shows,
 * marked as such, since "not on the map yet" is itself useful to know here.
 */
export function MapSearch({ db, onSelect, onFilter }: {
  db: DB;
  /** `placed` tells the caller whether there's anywhere to fly to. */
  onSelect: (kind: MapKind, id: string, placed: boolean) => void;
  /** Adds the typed text as a filter: matching markers light up, the rest dim. */
  onFilter: (term: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const term = q.trim();

  const hits = useMemo(() => search(db, q), [db, q]);
  // How many placed markers the term would light up, so the filter row says
  // what it will do before it's picked.
  const wouldLight = useMemo(() => (term === '' ? 0
    : db.spots.filter((s) => s.x !== '' && s.y !== '' && matchesAny(spotHay(s), [term])).length
      + db.dungeons.filter((g) => g.x !== '' && g.y !== '' && matchesAny(dungeonHay(g), [term])).length
  ), [db, term]);

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
          <CommandInput placeholder="Dungeon, point of interest, or something to filter by…" value={q} onValueChange={setQ} autoFocus />
          <CommandList>
            {term === '' && <CommandEmpty>Start typing a name.</CommandEmpty>}
            {term !== '' && (
              <CommandGroup>
                <CommandItem
                  value={`filter:${term}`}
                  onSelect={() => { onFilter(term); setOpen(false); setQ(''); }}
                >
                  <Filter className="size-3.5 shrink-0 text-muted-foreground" />
                  <span className="min-w-0 flex-1 truncate">Filter: {term}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {wouldLight === 0
                      ? 'lights up nothing yet'
                      : `lights up ${wouldLight} marker${wouldLight === 1 ? '' : 's'}`}
                  </span>
                </CommandItem>
              </CommandGroup>
            )}
            {term !== '' && hits.length === 0 && (
              <p className="px-2 py-1.5 text-xs text-muted-foreground">No dungeon or point named “{term}”.</p>
            )}
            {hits.length > 0 && (
              <CommandGroup heading="Jump to">
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
