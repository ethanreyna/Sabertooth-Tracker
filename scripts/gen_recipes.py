#!/usr/bin/env python3
"""Extracts the blacksmith recipe doc into a static TS module.

    gen_recipes.py <doc.docx|doc.txt> <out.ts>

The doc is a flattened three-column table. Records come in groups of three
(name, stat, ingredients) under an "Item / Armor|Damage / Ingredients" header,
which is itself preceded by a category name. "Part N — <station>" headings
split the whole thing by crafting station.

Not a live feed: re-run this when the doc changes.
"""
import html
import json
import re
import sys
import zipfile

SRC, OUT = sys.argv[1], sys.argv[2]

# The armour blocks head their middle column "Armor"; the weapons block calls it
# "Damage". Accept either, or the weapons block is silently skipped.
STAT_HEADERS = ('Armor', 'Damage', 'Dmg')

# "Part I — Skyforge", "Part II — Blacksmith Forge"
PART = re.compile(r'^Part\s+[IVX\d]+\s*[—–-]\s*(.+)$')


def read_lines(path):
    """Text lines from a .docx, or from an already-extracted .txt."""
    if not path.lower().endswith('.docx'):
        raw = open(path, encoding='utf-8-sig').read()
    else:
        xml = zipfile.ZipFile(path).read('word/document.xml').decode('utf-8')
        # One paragraph per line; tabs kept so column text doesn't run together.
        xml = xml.replace('</w:p>', '\n').replace('<w:tab/>', '\t')
        raw = html.unescape(re.sub(r'<[^>]+>', '', xml))
    lines = [ln.replace('\r', '').lstrip('\t').strip() for ln in raw.split('\n')]
    return [ln for ln in lines if ln != '']


# The smelter tables have no rating to give, so they run two columns instead of
# three: what you get, and what it takes. The Dwemer block inverts that — it
# lists the scrap and what it melts into.
PAIR_HEADERS = {
    ('Product', 'Requires'): 'makes',
    ('Scrap Piece', 'Melts Into'): 'melts',
}


def is_header(seq):
    """A three-column header: Item / Armor|Damage|Dmg / Ingredients."""
    return (
        len(seq) == 3
        and seq[0] == 'Item'
        and seq[1] in STAT_HEADERS
        and seq[2] == 'Ingredients'
    )


def pair_mode(seq):
    """'makes', 'melts', or None for a two-column header."""
    return PAIR_HEADERS.get(tuple(seq[:2])) if len(seq) >= 2 else None


def block_starts(lines, i):
    """True when a new table's header begins at i — either shape."""
    return is_header(tuple(lines[i:i + 3])) or pair_mode(lines[i:i + 2]) is not None


def parse_stat(raw):
    """Armour rating or damage. Tools list "—", meaning the item has neither.

    A blank is *not* a dash: it means we have run off the end of the table, so
    it has to fail rather than quietly become a zero-rated recipe.
    """
    if raw in ('—', '–', '-'):
        return 0
    m = re.fullmatch(r'(\d+)', raw)
    return int(m.group(1)) if m else None


def is_prose(line):
    """A sentence, not an item name — the doc ends with one."""
    return len(line.split()) > 8 or line.endswith('.')


def parse_ingredients(raw):
    out = []
    for part in raw.split(','):
        part = part.strip()
        if not part:
            continue
        m = re.match(r'^(\d+)\s+(.*)$', part)
        if m:
            out.append({'qty': int(m.group(1)), 'item': m.group(2).strip()})
        else:
            out.append({'qty': 1, 'item': part})
    return out


lines = read_lines(SRC)

records = []
notes = []
station = ''
category = ''
mode = 'stat'
i = 0

while i < len(lines):
    ln = lines[i]

    part = PART.match(ln)
    if part:
        station = part.group(1).strip()
        # A station's own blurb sits under its heading; keep it as a note.
        if i + 1 < len(lines) and not block_starts(lines, i + 1):
            nxt = lines[i + 1]
            if len(nxt.split()) > 2 and not PART.match(nxt):
                notes.append(f'{station}: {nxt}')
        category = ''
        mode = 'stat'
        i += 1
        continue

    # A header means the previous line was the category name.
    if ln == 'Item' and is_header(tuple(lines[i:i + 3])):
        if i > 0:
            category = lines[i - 1]
        mode = 'stat'
        i += 3
        continue

    pm = pair_mode(lines[i:i + 2])
    if pm:
        if i > 0:
            # "Dwemer Scrap Melting (→ Dwarven Metal Ingot)" — the parenthetical
            # repeats what every name in the block already says.
            category = re.sub(r'\s*\([^)]*\)\s*$', '', lines[i - 1]).strip()
        mode = pm
        i += 2
        continue

    # Not in a block yet (title / subtitle lines before the first header).
    if not category:
        i += 1
        continue

    # The line before the next header is that block's category, not a record.
    if (i + 1 < len(lines)
            and (block_starts(lines, i + 1) or PART.match(lines[i + 1]))):
        i += 1
        continue

    if is_prose(ln):
        notes.append(ln)
        i += 1
        continue

    if mode in ('makes', 'melts'):
        second = lines[i + 1] if i + 1 < len(lines) else ''
        if not second:
            i += 1
            continue

        if mode == 'makes':
            # "Iron Ingot" <- "6 Iron Ore, 6 Poor Charcoal"
            name, ing = ln, second
        else:
            # "Bent Dwemer Scrap Metal" -> "→ Dwarven Metal Ingot". The product
            # is what you are making, so it leads the name; several scraps make
            # the same ingot, and a recipe name has to stay unique.
            product = second.lstrip('→>-→ ').strip()
            name, ing = f'{product} — from {ln}', ln

        records.append({
            'station': station,
            'category': category,
            'name': name,
            'stat': 0,
            'ingredients': parse_ingredients(ing),
        })
        i += 2
        continue

    name = ln
    stat_raw = lines[i + 1] if i + 1 < len(lines) else ''
    ing_raw = lines[i + 2] if i + 2 < len(lines) else ''

    stat = parse_stat(stat_raw)
    if stat is None:
        # Shape broke; skip one line and resynchronise rather than guess.
        print(f'  ! skipped near {name!r}: stat was {stat_raw!r}', file=sys.stderr)
        i += 1
        continue

    records.append({
        'station': station,
        'category': category,
        'name': name,
        'stat': stat,
        'ingredients': parse_ingredients(ing_raw),
    })
    i += 3

by_station = {}
for r in records:
    by_station.setdefault(r['station'], {})
    by_station[r['station']][r['category']] = by_station[r['station']].get(r['category'], 0) + 1

print(f'parsed {len(records)} recipes', file=sys.stderr)
for st, cats in by_station.items():
    print(f'  {st or "(no station)"}: {sum(cats.values())}', file=sys.stderr)
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

ts = f'''// Generated from the guild's "Blacksmith Recipies" doc — a one-time extraction,
// not a live feed, so edits to the doc need a re-run of scripts/gen_recipes.py.
//
// Recipes are grouped by the station that crafts them. Part II of the doc lists
// only what the Blacksmith Forge adds; it also carries most Skyforge recipes
// with the same ingredients, which is why the two lists differ in size rather
// than one containing the other.

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

export const RECIPE_NOTES: string[] = {json.dumps(notes, ensure_ascii=False, indent=2).replace('"', '"')};

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
