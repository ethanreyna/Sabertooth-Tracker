#!/usr/bin/env python3
"""Slices Skyrim's LOD map textures into a web tile pyramid.

The Satellite World Map mod ships the world as 16 DDS textures named
`tamriel.32.<cellX>.<cellY>.dds` — a 4x4 grid, each 4096x4096, each covering
32 game cells. Stitched that's 16384x16384 covering cells -64..+63 on both
axes, which is the whole Tamriel worldspace.

Two things make this worth scripting rather than doing by hand:

  * The names are game cell coordinates, so the pixel grid can be tied to
    Skyrim world units exactly. The emitted meta.json carries that transform,
    which is what lets the app place a marker from a `getpos` readout instead
    of by eye.
  * A 16384x16384 RGB canvas is ~800MB in memory. Tiles are cut per source
    texture instead, so nothing larger than one 4096x4096 image is ever held.
    That works for any zoom where a source texture covers a whole number of
    tiles (z >= 2 here); the two coarsest levels are small enough to assemble
    directly.

Usage:
  python scripts/gen_map_tiles.py <dds-dir> <out-dir> [--max-zoom 5] [--quality 82]
"""
import argparse
import json
import os
import sys

from PIL import Image

CELL_ORIGINS = [-64, -32, 0, 32]  # left->right, and south->north
CELLS_PER_TEXTURE = 32
UNITS_PER_CELL = 4096
SRC_PX = 4096
TILE = 256


def load_sources(src_dir):
    """{(gridX, gridY): path}, gridY counted from the top of the image."""
    out = {}
    for gx, cx in enumerate(CELL_ORIGINS):
        for gy, cy in enumerate(CELL_ORIGINS):
            name = f'tamriel.{CELLS_PER_TEXTURE}.{cx}.{cy}.dds'
            path = os.path.join(src_dir, name)
            if not os.path.isfile(path):
                sys.exit(f'missing source texture: {name}')
            # Game Y increases north; image rows increase downward.
            row = len(CELL_ORIGINS) - 1 - gy
            out[(gx, row)] = path
    return out


def save_tile(img, out_dir, z, x, y, quality):
    d = os.path.join(out_dir, str(z), str(x))
    os.makedirs(d, exist_ok=True)
    img.convert('RGB').save(
        os.path.join(d, f'{y}.jpg'),
        'JPEG', quality=quality, optimize=True, progressive=True,
    )


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('src')
    ap.add_argument('out')
    ap.add_argument('--max-zoom', type=int, default=5)
    ap.add_argument('--quality', type=int, default=82)
    args = ap.parse_args()

    sources = load_sources(args.src)
    grid = len(CELL_ORIGINS)  # 4 textures across
    native_px = grid * SRC_PX  # 16384
    written = 0

    for z in range(args.max_zoom + 1):
        full = TILE * (2 ** z)           # map width in px at this zoom
        per_src = full // grid           # px each source texture occupies

        if per_src >= TILE:
            # A source texture covers a whole number of tiles: cut it alone.
            span = per_src // TILE
            for (gx, gy), path in sorted(sources.items()):
                with Image.open(path) as im:
                    scaled = im.convert('RGB').resize((per_src, per_src), Image.LANCZOS)
                for ty in range(span):
                    for tx in range(span):
                        box = (tx * TILE, ty * TILE, (tx + 1) * TILE, (ty + 1) * TILE)
                        save_tile(scaled.crop(box), args.out, z,
                                  gx * span + tx, gy * span + ty, args.quality)
                        written += 1
                scaled.close()
        else:
            # Coarse level: the whole map is at most 512px, so assemble it.
            canvas = Image.new('RGB', (full, full))
            for (gx, gy), path in sorted(sources.items()):
                with Image.open(path) as im:
                    small = im.convert('RGB').resize((per_src, per_src), Image.LANCZOS)
                canvas.paste(small, (gx * per_src, gy * per_src))
                small.close()
            for ty in range(full // TILE):
                for tx in range(full // TILE):
                    box = (tx * TILE, ty * TILE, (tx + 1) * TILE, (ty + 1) * TILE)
                    save_tile(canvas.crop(box), args.out, z, tx, ty, args.quality)
                    written += 1
            canvas.close()
        print(f'  z{z}: {full}px, {(full // TILE) ** 2} tiles', file=sys.stderr)

    cells = grid * CELLS_PER_TEXTURE            # 128
    min_cell = CELL_ORIGINS[0]                  # -64
    meta = {
        'tileSize': TILE,
        'minZoom': 0,
        'maxZoom': args.max_zoom,
        'nativePx': native_px,
        # World bounds in Skyrim units. x grows east, y grows north.
        'world': {
            'minX': min_cell * UNITS_PER_CELL,
            'minY': min_cell * UNITS_PER_CELL,
            'maxX': (min_cell + cells) * UNITS_PER_CELL,
            'maxY': (min_cell + cells) * UNITS_PER_CELL,
        },
        'unitsPerCell': UNITS_PER_CELL,
        'cells': cells,
        'source': 'Satellite World Map LOD textures (tamriel.32.*.dds)',
    }
    with open(os.path.join(args.out, 'meta.json'), 'w', encoding='utf-8') as f:
        json.dump(meta, f, indent=2)

    total = sum(
        os.path.getsize(os.path.join(dp, f))
        for dp, _, fs in os.walk(args.out) for f in fs
    )
    print(f'wrote {written} tiles, {total / 1048576:.1f}MB total', file=sys.stderr)
    print(f'world {meta["world"]}', file=sys.stderr)


if __name__ == '__main__':
    main()
