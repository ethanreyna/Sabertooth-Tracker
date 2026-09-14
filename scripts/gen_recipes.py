#!/usr/bin/env python3
"""Builds the static recipe module from the transcribed recipe list.

    gen_recipes.py <recipes.md> <out.ts>

The source is a markdown document: one `## SECTION` heading per crafting
menu, each holding a pipe table whose header names its columns — `Item` (or
`Output`), an optional rating column (`Dmg` or `Armor`), and `Requires`.
Weight and value columns are read past; the app has no use for them yet.
Bullet lines anywhere in the file become the notes shown under the tables.

Not a live feed: re-run this when the transcription changes.
"""
import json
import re
import sys
from collections import Counter

SRC, OUT = sys.argv[1], sys.argv[2]

# Section heading -> (station, category). Everything the footage showed came
# off one forge menu plus the smelter, so there is no Skyforge / Blacksmith
# Forge split to preserve any more.
SECTIONS = {
    'WEAPONS': ('Forge', 'Weapons'),
    'ARMOR & SHIELDS': ('Forge', 'Armor & Shields'),
    'JEWELRY': ('Forge', 'Jewelry'),
    'MISC': ('Forge', 'Miscellaneous'),
    'SMELTER': ('Smelter', 'Ingots & Refined Materials'),
}
NAME_COLS = ('item', 'output')
STAT_COLS = ('dmg', 'armor')


def cells(line):
    return [c.strip() for c in line.strip().strip('|').split('|')]


def parse_stat(raw):
    """A dash (with or without a "(?)") means the rating wasn't legible in the
    footage. A number is a number. Anything else is a transcription slip and
    should stop the build rather than quietly become a zero-rated recipe."""
    if re.fullmatch(r'[—–-]\s*(\(\?\))?', raw):
        return 0
    m = re.fullmatch(r'\d+', raw)
    if not m:
        raise SystemExit(f'unreadable rating {raw!r}')
    return int(raw)


def clean_name(raw):
    return re.sub(r'\s*\(\?\)\s*$', '', raw).strip()


def parse_ingredients(raw):
    # A trailing "*(...)*" is the transcriber's aside, not an ingredient.
    raw = re.sub(r'\*\([^)]*\)\*', '', raw).replace('(?)', '')
    out = []
    for part in raw.split(','):
        part = part.strip()
        # "…" marks a material that couldn't be read at all.
        if not part or part.startswith('…'):
            continue
        # "11–12 Steel Ingot": two frames disagreed. Take the higher — a
        # shopping list that over-asks by one is a nuisance; one that
        # under-asks leaves you short at the forge.
        m = re.match(r'^(\d+)(?:\s*[–-]\s*(\d+))?\s+(.+)$', part)
        if m:
            qty = max(int(m.group(1)), int(m.group(2) or 0))
            out.append({'qty': qty, 'item': m.group(3).strip()})
        else:
            out.append({'qty': 1, 'item': part})
    return out


records = []
notes = []
station = category = None
cols = None  # column positions for the table currently being read

for line in open(SRC, encoding='utf-8-sig'):
    line = line.rstrip('\n')

    heading = re.match(r'^##\s+(.+?)\s*$', line)
    if heading:
        key = heading.group(1).strip().upper()
        station, category = SECTIONS.get(key, (None, None))
        cols = None
        continue

    if line.startswith('- '):
        notes.append(line[2:].strip())
        continue

    if not line.startswith('|') or station is None:
        continue

    row = cells(line)
    if cols is None:
        lower = [c.lower() for c in row]
        cols = {
            'name': next(i for i, c in enumerate(lower) if c in NAME_COLS),
            'stat': next((i for i, c in enumerate(lower) if c in STAT_COLS), None),
            'req': lower.index('requires'),
        }
        continue
    if all(re.fullmatch(r':?-+:?', c) for c in row):
        continue  # the |---|---| rule under the header

    records.append({
        'station': station,
        'category': category,
        'name': clean_name(row[cols['name']]),
        'stat': parse_stat(row[cols['stat']]) if cols['stat'] is not None else 0,
        'ingredients': parse_ingredients(row[cols['req']]),
    })

# Several smelter inputs make the same ingot, and a recipe name has to stay
# unique: the bench keys its plan by name. Lead with the product — it is what
# you are making — and say what from.
dupes = {n for n, k in Counter(r['name'] for r in records).items() if k > 1}
for r in records:
    if r['name'] in dupes:
        r['name'] = f"{r['name']} — from {r['ingredients'][0]['item']}"
clash = [n for n, k in Counter(r['name'] for r in records).items() if k > 1]
if clash:
    raise SystemExit(f'recipe names still not unique: {clash}')

by_station = {}
for r in records:
    cats = by_station.setdefault(r['station'], {})
    cats[r['category']] = cats.get(r['category'], 0) + 1

print(f'parsed {len(records)} recipes', file=sys.stderr)
for st, cats in by_station.items():
    print(f'  {st}: {sum(cats.values())}', file=sys.stderr)
    for c, n in cats.items():
        print(f'    {c}: {n}', file=sys.stderr)

body = ',\n'.join(
    '  { station: %s, category: %s, name: %s, stat: %d, ingredients: %s }' % (
        json.dumps(r['station']),
        json.dumps(r['category']),
        json.dumps(r['name']),
        r['stat'],
        '[' + ', '.join(
            '{ qty: %d, item: %s }' % (g['qty'], json.dumps(g['item']))
            for g in r['ingredients']
        ) + ']',
    )
    for r in records
)

ts = f'''// Generated from the guild's transcription of the server's forge and smelter
// menus — a one-time extraction, not a live feed, so a fresh transcription
// needs a re-run of scripts/gen_recipes.py.
//
// Everything came off one forge menu plus the smelter, so recipes are grouped
// by menu section rather than by which forge happens to carry them.

export interface RecipeIngredient {{
  qty: number;
  item: string;
}}

export interface Recipe {{
  /** The crafting station this was recorded at. */
  station: string;
  category: string;
  name: string;
  /** Armour rating, or damage for weapons. 0 where the item has neither. */
  stat: number;
  ingredients: RecipeIngredient[];
}}

export const RECIPE_NOTES: string[] = {json.dumps(notes, ensure_ascii=False, indent=2)};

export const RECIPES: Recipe[] = [
{body},
];

/** Weapons are rated by damage, everything else by armour. */
export const statLabel = (category: string) =>
  /weapon|ammo|arrow|bow/i.test(category) ? 'Damage' : 'Armor';

/** Stations in the order the doc lists them. */
export const STATIONS = [...new Set(RECIPES.map((r) => r.station))].filter(Boolean);
'''

open(OUT, 'w', encoding='utf-8', newline='\n').write(ts)
print(f'wrote {OUT} ({len(records)} recipes, {len(notes)} notes)', file=sys.stderr)
