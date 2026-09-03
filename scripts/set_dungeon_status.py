#!/usr/bin/env python3
"""Bulk-sets every dungeon's status in one go.

    wrangler d1 execute sabertooth --remote \\
        --command "SELECT version, data FROM doc WHERE id = 1" --json \\
        > /tmp/current.json
    python3 scripts/backup_doc.py /tmp/current.json "pre-status-change" backup.sql
    wrangler d1 execute sabertooth --remote --file=backup.sql   # back up first, always
    python3 scripts/set_dungeon_status.py /tmp/current.json unknown status.sql
    wrangler d1 execute sabertooth --remote --file=status.sql

Useful right after a reset onto a fresh season: the map data survives, but
nobody's actually confirmed any of it still drops loot on the new run, so
Active is a worse default than admitting it's Unknown until someone checks.
Only ever writes a SQL file, guarded on the version read a moment before —
see reset_for_new_server.py for the same pattern.
"""
import json
import sys
from datetime import datetime, timezone

CUR, STATUS, OUT = sys.argv[1], sys.argv[2], sys.argv[3]

if STATUS not in ('active', 'disabled', 'unknown'):
    sys.exit(f'status must be active, disabled or unknown, not {STATUS!r}')

cur = json.load(open(CUR, encoding='utf-8'))
row = cur[0]['results'][0]
version = int(row['version'])
db = json.loads(row['data'])

dungeons = db.get('dungeons', [])
changed = sum(1 for g in dungeons if g.get('status') != STATUS)
for g in dungeons:
    g['status'] = STATUS

print(f'{len(dungeons)} dungeons, {changed} changing to {STATUS!r}', file=sys.stderr)

data = json.dumps(db, ensure_ascii=False, separators=(',', ':'))
now = datetime.now(timezone.utc).isoformat().replace('+00:00', 'Z')
sql = (
    "UPDATE doc SET data = '" + data.replace("'", "''") + "', "
    "version = version + 1, updated_at = '" + now + "' "
    "WHERE id = 1 AND version = " + str(version) + ";"
)
open(OUT, 'w', encoding='utf-8', newline='\n').write(sql)
print(f'wrote {OUT} ({len(data)} bytes, guarded on version {version})', file=sys.stderr)
