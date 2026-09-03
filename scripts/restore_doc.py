#!/usr/bin/env python3
"""Writes a SQL file that restores a doc_archive snapshot back onto the live
guild database.

    wrangler d1 execute sabertooth --remote \\
        --command "SELECT data FROM doc_archive ORDER BY id DESC LIMIT 1" --json \\
        > /tmp/archive.json
    wrangler d1 execute sabertooth --remote \\
        --command "SELECT version FROM doc WHERE id = 1" --json \\
        > /tmp/current.json
    restore_doc.py /tmp/archive.json /tmp/current.json restore.sql
    wrangler d1 execute sabertooth --remote --file=restore.sql

Two separate reads because the restore has to be guarded on whatever version
is live *right now* — not the version the archive itself was taken at — or a
change made since archiving would be silently discarded instead of rejected.
"""
import json
import sys
from datetime import datetime, timezone

ARCHIVE, CUR, OUT = sys.argv[1], sys.argv[2], sys.argv[3]

archive = json.load(open(ARCHIVE, encoding='utf-8'))
data = archive[0]['results'][0]['data']

cur = json.load(open(CUR, encoding='utf-8'))
live_version = int(cur[0]['results'][0]['version'])
now = datetime.now(timezone.utc).isoformat().replace('+00:00', 'Z')

sql = (
    "UPDATE doc SET data = '" + data.replace("'", "''") + "', "
    "version = version + 1, updated_at = '" + now + "' "
    "WHERE id = 1 AND version = " + str(live_version) + ";"
)
open(OUT, 'w', encoding='utf-8', newline='\n').write(sql)
print(f'wrote {OUT} — restores onto version {live_version} ({len(data)} bytes)', file=sys.stderr)
