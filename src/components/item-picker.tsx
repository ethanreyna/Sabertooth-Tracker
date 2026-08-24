import { useMemo, useState } from 'react';
import { Check, Plus, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { searchItems } from '@/items';
import type { ItemDef } from '@/items';
import type { CollectionTarget } from '@/types';

/** Searchable Skyrim-item combobox that builds a collection job's shopping list. */
export function ItemPicker({ targets, setTargets, catalogue, label = 'Search Skyrim items…' }: {
  targets: CollectionTarget[];
  setTargets: (fn: (t: CollectionTarget[]) => CollectionTarget[]) => void;
  /** Built-in records plus whatever the guild has added to its item list. */
  catalogue: ItemDef[];
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');

  const results = useMemo(() => searchItems(query, 50, catalogue), [query, catalogue]);
  const typed = query.trim();
  const alreadyListed = (name: string) => targets.some((t) => t.item.toLowerCase() === name.toLowerCase());
  const exactInCatalogue = results.some((r) => r.name.toLowerCase() === typed.toLowerCase());

  const add = (name: string) => {
    const clean = name.trim();
    if (!clean || alreadyListed(clean)) return;
    setTargets((t) => [...t, { item: clean, qty: 1 }]);
    setQuery('');
    setOpen(false);
  };

  return (
    <div className="flex flex-col gap-2">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger
          render={
            <Button type="button" variant="outline" className="w-full justify-between font-normal">
              <span className="text-muted-foreground">{label}</span>
              <Plus />
            </Button>
          }
        />
        <PopoverContent className="w-(--anchor-width) p-0" align="start">
          <Command shouldFilter={false}>
            <CommandInput
              placeholder="e.g. iron ingot, deathbell"
              value={query}
              onValueChange={setQuery}
            />
            <CommandList>
              {typed && !exactInCatalogue && (
                <CommandGroup heading="Custom">
                  <CommandItem value={`__custom_${typed}`} onSelect={() => add(typed)}>
                    <Plus />
                    Add “{typed}” as a custom item
                  </CommandItem>
                </CommandGroup>
              )}
              {results.length === 0 && !typed && <CommandEmpty>Start typing to search.</CommandEmpty>}
              {results.length === 0 && typed && !exactInCatalogue && null}
              {results.length > 0 && (
                <CommandGroup heading="Catalogue">
                  {results.map((r) => (
                    <CommandItem key={r.name} value={r.name} onSelect={() => add(r.name)}>
                      {alreadyListed(r.name) ? <Check className="opacity-60" /> : <Plus className="opacity-40" />}
                      <span className="flex-1">{r.name}</span>
                      <span className="text-xs text-muted-foreground">{r.cat}</span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              )}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

      {targets.length > 0 && (
        <div className="divide-y overflow-hidden rounded-lg border">
          {targets.map((t, i) => (
            <div key={t.item} className="flex items-center gap-2 bg-card px-2 py-1.5">
              <span className="min-w-0 flex-1 truncate text-sm">{t.item}</span>
              <Input
                type="number" min={1} value={t.qty}
                aria-label={`Quantity of ${t.item}`}
                className="h-7 w-20 shrink-0"
                onChange={(e) => {
                  const v = Math.max(1, Number(e.target.value || 1));
                  setTargets((list) => list.map((x, xi) => (xi === i ? { ...x, qty: v } : x)));
                }}
              />
              <Button
                type="button" variant="ghost" size="icon-xs"
                aria-label={`Remove ${t.item}`}
                onClick={() => setTargets((list) => list.filter((_, xi) => xi !== i))}
              >
                <X />
              </Button>
            </div>
          ))}
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        {targets.length
          ? `${targets.length} item${targets.length === 1 ? '' : 's'} requested`
          : 'Nothing added yet — search above to build the list.'}
      </p>
    </div>
  );
}
