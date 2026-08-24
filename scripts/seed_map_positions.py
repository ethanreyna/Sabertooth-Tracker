#!/usr/bin/env python3
"""Seeds map coordinates: cities as Settlement points, dungeons by position.

Two very different confidence levels, kept distinct on purpose.

CITIES were located by rendering the tile pyramid around a candidate and
checking whether a city footprint was actually there — Whiterun's walls,
Windhelm's bridge, Solitude's arch, Riften's canals, Dawnstar's docks. Each was
confirmed visually and the offset measured, so these are good to a few hundred
units.

DUNGEONS could not be located that way at all: cave entrances don't exist in
terrain LOD, so there is nothing to look at. These are placed by hold and
bearing relative to the confirmed cities — right region, roughly right spot,
not surveyed. Every one says so in its notes, and markers are draggable.
"""
import json
import re
import sys
from datetime import datetime, timezone

CUR, OUT_SQL = sys.argv[1], sys.argv[2]

# name: (x, y) — visually confirmed against the rendered map
CITIES = {
    'Whiterun':   (24000, -3500),
    'Solitude':   (-60800, 106500),
    'Windhelm':   (133500, 40500),
    'Markarth':   (-175000, 6000),
    'Riften':     (173500, -96500),
    'Dawnstar':   (28500, 103000),
    'Morthal':    (-37000, 65500),
    'Falkreath':  (-33000, -89000),
    'Winterhold': (110500, 102000),
}

# name: (x, y) — approximate, by hold and bearing from the confirmed cities.
# Omitted entirely where even the hold is uncertain, rather than invented.
DUNGEONS = {
    'Bleak Falls Barrow':  (-2000, -30000),
    'Bleak Falls Sanctum': (-2600, -31000),
    'Brittleshin Pass':    (-8000, -40000),
    'Broken Fang Cave':    (-5000, -8000),
    'Bronze Water Cave':   (128000, 62000),
    'Brood Cavern':        (-8000, 25000),
    'Chillwind Depths':    (-60000, 10000),
    'Crystaldrift Cave':   (120000, -70000),
    'Dark Water Pass':     (120000, -30000),
    "Dustman's Cairn":     (-12000, 5000),
    'Forsaken Cave':       (50000, 95000),
    'Gloomreach':          (-140000, 5000),
    "Hob's Fall Cave":     (95000, 110000),
    "Illinalta's Deep":    (-25000, -55000),
    'Ironbind Barrow':     (85000, 85000),
    "Liar's Retreat":      (-95000, 75000),
    'Lost Knife Hideout':  (115000, 15000),
    'Moss Mother Cavern':  (-20000, -75000),
    'Mzulft':              (150000, 10000),
    'Orotheim':            (-55000, 80000),
    'Purewater Run':       (-150000, 30000),
    'Ravenscar Hollow':    (-90000, 115000),
    "Rebel's Cairn":       (-120000, -25000),
    "Red Eagle's Redoubt": (-125000, -30000),
    'Shadowgreen Cavern':  (-85000, 120000),
    'Shimmermist Cave':    (45000, 20000),
    'Shriekwind Bastion':  (-70000, 85000),
    'Steepfall Burrow':    (-105000, 95000),
    "Swindler's Den":      (-20000, 15000),
    'Uttering Hills Cave': (125000, 55000),
    'White River Watch':   (55000, 0),
    'Wolfskull Cave':      (-90000, 90000),
    'Yngvild':             (40000, 125000),
}
APPROX = 'Map position approximate — drag the marker to correct it.'

cur = json.load(open(CUR, encoding='utf-8'))
version = int(cur['version'])
db = json.loads(cur['data'])
db.setdefault('spots', [])
db.setdefault('dungeons', [])

norm = lambda s: re.sub(r'[^a-z0-9]', '', (s or '').lower())
now = datetime.now(timezone.utc).isoformat().replace('+00:00', 'Z')

# --- cities -> Settlement points -------------------------------------------
existing_spots = {norm(s.get('name')) for s in db['spots']}
added_cities = []
for i, (name, (x, y)) in enumerate(CITIES.items(), start=1):
    if norm(name) in existing_spots:
        continue
    db['spots'].append({
        'id': f'city{i:02d}', 'name': name, 'kind': 'Settlement',
        'location': 'Hold capital', 'yield': '', 'respawn': '',
        'x': str(x), 'y': str(y), 'mapUrl': '',
        'notes': 'Position confirmed against the rendered map.',
        'imgs': [], 'addedBy': 'Guild list', 'at': now,
    })
    added_cities.append(name)

# --- dungeon positions ------------------------------------------------------
placed, missing = [], []
by_name = {norm(g.get('name')): g for g in db['dungeons']}
for name, (x, y) in DUNGEONS.items():
    g = by_name.get(norm(name))
    if not g:
        missing.append(name)
        continue
    if g.get('x') and g.get('y'):
        continue                      # already placed; leave it alone
    g['x'], g['y'] = str(x), str(y)
    note = (g.get('notes') or '').strip()
    if APPROX not in note:
        g['notes'] = (note + ' ' + APPROX).strip()
    placed.append(name)

unplaced = [g['name'] for g in db['dungeons'] if not (g.get('x') and g.get('y'))]
print(f'cities added: {len(added_cities)}', file=sys.stderr)
print(f'dungeons placed: {len(placed)}', file=sys.stderr)
if missing:
    print(f'  not found in db: {", ".join(missing)}', file=sys.stderr)
if unplaced:
    print(f'  left unplaced (hold unknown): {", ".join(unplaced)}', file=sys.stderr)

data = json.dumps(db, ensure_ascii=False, separators=(',', ':'))
sql = (
    "UPDATE doc SET data = '" + data.replace("'", "''") + "', version = version + 1, "
    "updated_at = datetime('now') WHERE id = 1 AND version = " + str(version) + ";"
)
open(OUT_SQL, 'w', encoding='utf-8', newline='\n').write(sql)
print(f'wrote {OUT_SQL} ({len(data)} bytes, guarded on version {version})', file=sys.stderr)
