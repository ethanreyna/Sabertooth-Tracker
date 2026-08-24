import { useMemo, useState } from 'react';
import { Info, Search, X } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { EmptyState, TonedBadge } from '@/components/bits';
import { RECIPES, RECIPE_NOTES, STATIONS, statLabel } from '@/recipes';
import { cn } from '@/lib/utils';

const ALL = '__all';

export function Recipes() {
  const [q, setQ] = useState('');
  const [cat, setCat] = useState(ALL);
  // Which forge you are standing at decides what you can make, so that is the
  // first cut; the doc is organised the same way.
  const [station, setStation] = useState(STATIONS[0] ?? ALL);

  const inStation = useMemo(
    () => RECIPES.filter((r) => station === ALL || r.station === station),
    [station],
  );
  const categories = useMemo(
    () => [...new Set(inStation.map((r) => r.category))],
    [inStation],
  );

  // Searching by ingredient is the point of this page — "what can I make with
  // leather strips" matters more than looking up a name you already know.
  const groups = useMemo(() => {
    const terms = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
    const match = (r: typeof RECIPES[number]) => {
      if (!terms.length) return true;
      const hay = `${r.name} ${r.category} ${r.ingredients.map((g) => g.item).join(' ')}`.toLowerCase();
      return terms.every((t) => hay.includes(t));
    };

    const out: Array<{ category: string; rows: typeof RECIPES }> = [];
    for (const r of inStation) {
      if (cat !== ALL && r.category !== cat) continue;
      if (!match(r)) continue;
      const last = out[out.length - 1];
      if (last && last.category === r.category) last.rows.push(r);
      else out.push({ category: r.category, rows: [r] });
    }
    return out;
  }, [q, cat, inStation]);

  const shown = groups.reduce((n, g) => n + g.rows.length, 0);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search by item or ingredient…" value={q}
            onChange={(e) => setQ(e.target.value)}
            className="h-8 w-72 pl-8"
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
        <span className="ml-auto text-xs text-muted-foreground">
          {shown} of {inStation.length} recipes
          {station !== ALL ? ` at the ${station}` : ''}
        </span>
      </div>

      <Tabs
        value={station}
        onValueChange={(v) => { setStation(v ? String(v) : ALL); setCat(ALL); }}
      >
        <TabsList className="flex-wrap">
          {STATIONS.map((st) => (
            <TabsTrigger key={st} value={st}>
              {st}
              <span className="ml-1.5 text-muted-foreground">
                {RECIPES.filter((r) => r.station === st).length}
              </span>
            </TabsTrigger>
          ))}
          <TabsTrigger value={ALL}>
            Everything<span className="ml-1.5 text-muted-foreground">{RECIPES.length}</span>
          </TabsTrigger>
        </TabsList>
      </Tabs>

      <div className="flex flex-wrap gap-1.5">
        <button type="button" onClick={() => setCat(ALL)}>
          <TonedBadge tone={cat === ALL ? 'blue' : 'neutral'}>All</TonedBadge>
        </button>
        {categories.map((c) => (
          <button key={c} type="button" onClick={() => setCat(c)}>
            <TonedBadge tone={cat === c ? 'blue' : 'neutral'}>{c}</TonedBadge>
          </button>
        ))}
      </div>

      {groups.length === 0 ? (
        <EmptyState>Nothing matches “{q}”.</EmptyState>
      ) : (
        groups.map((g, i) => (
          <Card key={`${g.category}-${i}`} className="overflow-hidden py-0">
            <div className="flex items-center gap-2 border-b bg-muted/40 px-4 py-2">
              <h2 className="text-sm font-semibold">{g.category}</h2>
              <span className="ml-auto text-xs text-muted-foreground">{g.rows.length}</span>
            </div>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="min-w-56">Item</TableHead>
                    <TableHead className="w-24 text-right">{statLabel(g.category)}</TableHead>
                    <TableHead>Ingredients</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {g.rows.map((r) => (
                    <TableRow key={`${r.category}-${r.name}`}>
                      <TableCell className="font-medium">{r.name}</TableCell>
                      <TableCell className={cn('text-right tabular-nums', !r.stat && 'text-muted-foreground')}>
                        {r.stat || '—'}
                      </TableCell>
                      <TableCell className="whitespace-normal">
                        <span className="flex flex-wrap gap-1">
                          {r.ingredients.map((g2, k) => (
                            <span
                              key={`${g2.item}-${k}`}
                              className="rounded-md border bg-muted/40 px-1.5 py-0.5 text-xs"
                            >
                              {g2.qty > 1 && <span className="font-semibold tabular-nums">{g2.qty}× </span>}
                              {g2.item}
                            </span>
                          ))}
                        </span>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </Card>
        ))
      )}

      {RECIPE_NOTES.map((n) => (
        <Alert key={n}>
          <Info />
          <AlertDescription>{n}</AlertDescription>
        </Alert>
      ))}

      <p className="text-xs text-muted-foreground">
        Transcribed once from the guild's blacksmith recipe document — this list ships with the app
        rather than syncing, so changes to the doc need a fresh extraction. The doc's own headings
        say 97 and 152 recipes; it actually holds {RECIPES.length} across both stations, and every
        one of them is here.
      </p>
    </div>
  );
}
