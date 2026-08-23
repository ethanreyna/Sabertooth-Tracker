#!/usr/bin/env python3
"""One-time extraction of the blacksmith recipe doc into a static TS module.

The doc is a flattened three-column table: a category line, an
"Item / Armor / Ingredients" header, then records in groups of three
(name, stat, ingredients).
"""
import json
import re
import sys

SRC = sys.argv[1]
OUT = sys.argv[2]

raw = open(SRC, encoding='utf-8-sig').read()
lines = [ln.replace('\r', '').lstrip('\t').strip() for ln in raw.split('\n')]
lines = [ln for ln in lines if ln != '']

# The armour blocks head their middle column "Armor"; the weapons block calls it
# "Damage". Accept either, or the weapons block is silently skipped.
STAT_HEADERS = ('Armor', 'Damage')


def is_header(seq):
    return (
        len(seq) == 3
        and seq[0] == 'Item'
        and seq[1] in STAT_HEADERS
        and seq[2] == 'Ingredients'
    )

note = ''
records = []
category = ''
i = 0
while i < len(lines):
    ln = lines[i]

    if ln.startswith('Note:'):
        note = ln
        i += 1
        continue

    # A header triple means the previous line was the category name.
    if ln == 'Item' and is_header(tuple(lines[i:i + 3])):
        if i > 0:
            category = lines[i - 1]
        i += 3
        continue

    # Not in a block yet (title / subtitle lines before the first header).
    if not category:
        i += 1
        continue

    # The line before the next header is that block's category, not a record.
    if is_header(tuple(lines[i + 1:i + 4])):
        i += 1
        continue

    name = ln
    stat_raw = lines[i + 1] if i + 1 < len(lines) else ''
    ing_raw = lines[i + 2] if i + 2 < len(lines) else ''

    m = re.fullmatch(r'(\d+)', stat_raw)
    if not m:
        # Shape broke; skip one line and resynchronise rather than guess.
        print(f'  ! skipped near {name!r}: stat was {stat_raw!r}', file=sys.stderr)
        i += 1
        continue

    ingredients = []
    for part in ing_raw.split(','):
        part = part.strip()
        if not part:
            continue
        mm = re.match(r'^(\d+)\s+(.*)$', part)
        if mm:
            ingredients.append({'qty': int(mm.group(1)), 'item': mm.group(2).strip()})
        else:
            ingredients.append({'qty': 1, 'item': part})

    records.append({
        'category': category,
        'name': name,
        'stat': int(m.group(1)),
        'ingredients': ingredients,
    })
    i += 3

cats = {}
for r in records:
    cats[r['category']] = cats.get(r['category'], 0) + 1
print(f'parsed {len(records)} recipes', file=sys.stderr)
for c, n in cats.items():
    print(f'  {c}: {n}', file=sys.stderr)

body = ',\n'.join(
    '  { category: %s, name: %s, stat: %d, ingredients: %s }' % (
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

ts = f'''// Generated from the guild's "Blacksmith Recipies" doc — a one-time extraction,
// not a live feed, so edits to the doc need a re-run of the generator.
//
// The doc was transcribed from gameplay footage, hence the note below: some
// ingredient counts are marked "(?)" in the source and are kept verbatim rather
// than cleaned up, so nobody mistakes a guess for a confirmed figure.

export interface RecipeIngredient {{
  qty: number;
  item: string;
}}

export interface Recipe {{
  category: string;
  name: string;
  /** Armour rating, or damage for weapons. 0 where the doc lists none. */
  stat: number;
  ingredients: RecipeIngredient[];
}}

export const RECIPE_NOTE =
  {json.dumps(note)};

export const RECIPES: Recipe[] = [
{body},
];

/** Weapons are rated by damage; everything else by armour. */
export const statLabel = (category: string) =>
  /weapon|ammo|arrow|bow/i.test(category) ? 'Damage' : 'Armor';
'''

open(OUT, 'w', encoding='utf-8', newline='\n').write(ts)
print(f'wrote {OUT}', file=sys.stderr)
