import { useEffect, useState } from 'react';
import { Hammer, Minus, Plus, Trash2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { RECIPES } from '@/recipes';
import type { Recipe } from '@/recipes';

const KEY = 'sabretooth-craft-v1';

/** How many of each recipe are planned, keyed by recipe name (they're unique). */
export type Plan = Record<string, number>;

export function loadPlan(): Plan {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (!raw || typeof raw !== 'object') return {};
    const out: Plan = {};
    for (const [name, qty] of Object.entries(raw as Record<string, unknown>)) {
      const n = Math.max(0, Math.round(Number(qty) || 0));
      // A name the doc no longer has would total ingredients nobody can see.
      if (n > 0 && RECIPES.some((r) => r.name === name)) out[name] = n;
    }
    return out;
  } catch {
    return {};
  }
}

function savePlan(plan: Plan) {
  try {
    if (Object.keys(plan).length) localStorage.setItem(KEY, JSON.stringify(plan));
    else localStorage.removeItem(KEY);
  } catch {
    /* private window — the plan just won't survive a reload */
  }
}

/** Everything the planned recipes need, added up, most-needed first. */
export function shoppingList(plan: Plan): Array<{ item: string; qty: number }> {
  const totals = new Map<string, { item: string; qty: number }>();
  for (const [name, count] of Object.entries(plan)) {
    const recipe = RECIPES.find((r) => r.name === name);
    if (!recipe) continue;
    for (const g of recipe.ingredients) {
      const key = g.item.trim().toLowerCase();
      const row = totals.get(key) ?? { item: g.item.trim(), qty: 0 };
      row.qty += g.qty * count;
      totals.set(key, row);
    }
  }
  return [...totals.values()].sort((a, b) => b.qty - a.qty || a.item.localeCompare(b.item));
}

export function usePlan() {
  const [plan, setPlan] = useState<Plan>(() => loadPlan());
  useEffect(() => { savePlan(plan); }, [plan]);

  const add = (name: string, by = 1) => setPlan((p) => {
    const next = { ...p, [name]: Math.max(0, (p[name] ?? 0) + by) };
    if (next[name] === 0) delete next[name];
    return next;
  });
  const clear = () => setPlan({});

  return { plan, add, clear, planned: Object.keys(plan).length };
}

/**
 * What a batch of crafting actually costs, in one list.
 *
 * The recipe tables answer "what does this one need"; the question a smith
 * actually has before a trip is "what do I need for all of it", which means
 * adding up shared ingredients across recipes — four items each wanting leather
 * strips is one number, not four.
 */
export function CraftPlan({ plan, add, clear }: ReturnType<typeof usePlan>) {
  const chosen = Object.keys(plan)
    .map((name) => RECIPES.find((r) => r.name === name))
    .filter((r): r is Recipe => Boolean(r))
    .sort((a, b) => a.name.localeCompare(b.name));

  const list = shoppingList(plan);
  const total = list.reduce((n, g) => n + g.qty, 0);

  if (chosen.length === 0) return null;

  return (
    <Card>
      <CardContent className="grid gap-5 p-4 md:grid-cols-2">
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground [&_svg]:size-3.5">
              <Hammer />Making
            </p>
            <Button variant="ghost" size="xs" className="ml-auto" onClick={clear}>
              <Trash2 />Clear
            </Button>
          </div>

          <div className="divide-y overflow-hidden rounded-lg border">
            {chosen.map((r) => (
              <div key={r.name} className="flex items-center gap-2 bg-card px-2 py-1.5">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm">{r.name}</p>
                  <p className="text-[11px] text-muted-foreground">{r.category} · {r.station}</p>
                </div>
                <Button
                  variant="outline" size="icon-xs" aria-label={`One fewer ${r.name}`}
                  onClick={() => add(r.name, -1)}
                >
                  <Minus />
                </Button>
                <span className="w-7 text-center text-sm font-semibold tabular-nums">
                  {plan[r.name]}
                </span>
                <Button
                  variant="outline" size="icon-xs" aria-label={`One more ${r.name}`}
                  onClick={() => add(r.name, 1)}
                >
                  <Plus />
                </Button>
                <Button
                  variant="ghost" size="icon-xs" aria-label={`Remove ${r.name}`}
                  onClick={() => add(r.name, -plan[r.name])}
                >
                  <X />
                </Button>
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-2">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Everything you need
          </p>
          <div className="divide-y overflow-hidden rounded-lg border">
            {list.map((g) => (
              <div key={g.item} className="flex items-baseline gap-3 bg-card px-2.5 py-1.5">
                <span className="min-w-0 flex-1 truncate text-sm">{g.item}</span>
                <span className="text-sm font-semibold tabular-nums">{g.qty.toLocaleString()}</span>
              </div>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">
            {list.length} ingredient{list.length === 1 ? '' : 's'}, {total.toLocaleString()} pieces
            in all. Ingredients that are themselves craftable — ingots, leather strips — are counted
            as they are written, not broken down further.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
