#!/usr/bin/env python3
"""Writes a SQL file that archives the current guild database as a private,
restorable snapshot before a destructive change.

    wrangler d1 execute sabertooth --remote \\
        --command "SELECT version, data FROM doc WHERE id = 1" --json \\
        > /tmp/current.json
    backup_doc.py /tmp/current.json "pre-server-move" backup.sql
    wrangler d1 execute sabertooth --remote --file=backup.sql

The snapshot lands in doc_archive (see schema_archive.sql), a table no Worker
route reads from — unlike R2, where any key is a public GET at /api/img/:key,
there's no way to fetch this back except by running SQL against the account.
See restore_doc.py to bring one back.
"""
import json
import sys
from datetime import datetime, timezone

CUR, LABEL, OUT = sys.argv[1], sys.argv[2], sys.argv[3]

cur = json.load(open(CUR, encoding='utf-8'))
row = cur[0]['results'][0]
version = int(row['version'])
data = row['data']  # already a JSON string; re-embedded as one, not re-parsed
now = datetime.now(timezone.utc).isoformat().replace('+00:00', 'Z')

sql = (
    "INSERT INTO doc_archive (label, data, version, archived_at) VALUES ("
    + "'" + LABEL.replace("'", "''") + "', "
    + "'" + data.replace("'", "''") + "', "
    + str(version) + ", "
    + "'" + now + "');"
)
open(OUT, 'w', encoding='utf-8', newline='\n').write(sql)
print(f'wrote {OUT} — archives version {version} as {LABEL!r} ({len(data)} bytes)', file=sys.stderr)
