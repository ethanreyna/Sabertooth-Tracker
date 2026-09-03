#!/usr/bin/env python3
"""Resets the guild database for a new game-server season, keeping the map.

    wrangler d1 execute sabertooth --remote \\
        --command "SELECT version, data FROM doc WHERE id = 1" --json \\
        > /tmp/current.json
    reset_for_new_server.py /tmp/current.json reset.sql
    wrangler d1 execute sabertooth --remote --file=reset.sql

Skyrim's geography doesn't move when the server does, so dungeons and points
of interest are kept exactly as scouted — coordinates, notes, screenshots, the
lot. Everything else here is either specific to the game session that just
ended (jobs, storage, the bank ledger, pending suggestions, the enchanting
waitlist) or content someone will need to re-supply for the new one (roster,
roles, the item and enchantment catalogues), so it resets to empty.

Always archive first — see backup_doc.py. This script only ever writes a SQL
file; nothing is touched until that file is executed.
"""
import json
import sys
from datetime import datetime, timezone

CUR, OUT = sys.argv[1], sys.argv[2]

cur = json.load(open(CUR, encoding='utf-8'))
row = cur[0]['results'][0]
version = int(row['version'])
db = json.loads(row['data'])

kept = {
    'dungeons': db.get('dungeons', []),
    'spots': db.get('spots', []),
}

new_db = {
    'settings': {'guildCutPct': 20},
    'members': [], 'roles': [], 'jobs': [], 'barrels': [],
    'dungeons': kept['dungeons'], 'spots': kept['spots'],
    'ledger': [], 'bankItems': [], 'suggestions': [],
    'items': [], 'enchantments': [], 'enchants': [],
}

print(f'keeping {len(kept["dungeons"])} dungeons, {len(kept["spots"])} points of interest', file=sys.stderr)
for key, val in db.items():
    if key in kept or key == 'settings':
        continue
    n = len(val) if isinstance(val, list) else 1
    print(f'  clearing {key}: {n}', file=sys.stderr)

data = json.dumps(new_db, ensure_ascii=False, separators=(',', ':'))
now = datetime.now(timezone.utc).isoformat().replace('+00:00', 'Z')
sql = (
    "UPDATE doc SET data = '" + data.replace("'", "''") + "', "
    "version = version + 1, updated_at = '" + now + "' "
    "WHERE id = 1 AND version = " + str(version) + ";"
)
open(OUT, 'w', encoding='utf-8', newline='\n').write(sql)
print(f'wrote {OUT} ({len(data)} bytes, guarded on version {version})', file=sys.stderr)
