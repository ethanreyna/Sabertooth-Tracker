#!/usr/bin/env python3
"""Thumbnails a window around each candidate coordinate, in one labelled sheet.

Confirms in a single glance which candidates actually sit on a city footprint,
instead of trusting a remembered cell number.
"""
import json
import os
import sys

from PIL import Image, ImageDraw

TILES, OUT, CANDFILE = sys.argv[1], sys.argv[2], sys.argv[3]
HALF = int(sys.argv[4]) if len(sys.argv) > 4 else 10000   # world units each side
Z = 5

cand = json.load(open(CANDFILE, encoding='utf-8'))
meta = json.load(open(os.path.join(TILES, 'meta.json'), encoding='utf-8'))
W = meta['world']
n = 2 ** Z
size = n * 256
span = W['maxX'] - W['minX']


def px_of(x, y):
    return ((x - W['minX']) / span * size, (W['maxY'] - y) / span * size)


CELL = 360
cols = 3
rows = (len(cand) + cols - 1) // cols
sheet = Image.new('RGB', (cols * CELL, rows * (CELL + 26)), (18, 18, 20))
d0 = ImageDraw.Draw(sheet)

for i, (name, (gx, gy)) in enumerate(cand.items()):
    l, t = px_of(gx - HALF, gy + HALF)
    r, b = px_of(gx + HALF, gy - HALF)
    l, t, r, b = int(l), int(t), int(r), int(b)
    tile = Image.new('RGB', (r - l, b - t), (30, 30, 34))
    for tx in range(l // 256, (r - 1) // 256 + 1):
        for ty in range(t // 256, (b - 1) // 256 + 1):
            p = os.path.join(TILES, str(Z), str(tx), f'{ty}.jpg')
            if os.path.isfile(p):
                with Image.open(p) as s:
                    tile.paste(s, (tx * 256 - l, ty * 256 - t))
    tile = tile.resize((CELL, CELL), Image.LANCZOS)
    d = ImageDraw.Draw(tile)
    c = CELL // 2
    d.line([c - 18, c, c + 18, c], fill=(255, 40, 40), width=2)
    d.line([c, c - 18, c, c + 18], fill=(255, 40, 40), width=2)
    d.ellipse([c - 10, c - 10, c + 10, c + 10], outline=(255, 40, 40), width=2)

    cx = (i % cols) * CELL
    cy = (i // cols) * (CELL + 26)
    sheet.paste(tile, (cx, cy))
    d0.text((cx + 6, cy + CELL + 6), f'{name}  ({gx}, {gy})', fill=(255, 255, 0))

sheet.save(OUT)
print('wrote', OUT, sheet.size, f'window +/-{HALF} units')
