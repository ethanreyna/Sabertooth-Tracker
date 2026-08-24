import { GLYPH_PATHS } from '@/components/map-glyphs';
import { cn } from '@/lib/utils';

// Same projection the full map uses: world/2048 + 128 puts Skyrim's ±262144
// into a 256-pixel square, and each zoom level doubles that.
const TILE = 256;
const ORIGIN = 128;
const UNITS_PER_PX = 2048;
const TILE_URL = '/tiles/skyrim/{z}/{x}/{y}.jpg';

/**
 * A crop of the guild map centred on one place, with a marker on it.
 *
 * Not a Leaflet map — there is nothing to pan or click, and a dungeon list
 * would otherwise mount thirty of them. It is a handful of tile images offset
 * so the point lands dead centre, which means no measuring, no layout pass, and
 * nothing to tear down. The tiles are the ones the map already serves, so they
 * are usually in the browser cache by the time this renders.
 */
export function MapThumb({ x, y, zoom = 4, radius = 1, className, alt }: {
  x: string | number;
  y: string | number;
  /** Higher is closer in. The pyramid holds real detail to 5. */
  zoom?: number;
  /** Tiles kept either side of the centre one; 1 covers a 768px box. */
  radius?: number;
  className?: string;
  alt?: string;
}) {
  const wx = Number(x);
  const wy = Number(y);
  if (!Number.isFinite(wx) || !Number.isFinite(wy) || x === '' || y === '') return null;

  const tiles = 2 ** zoom;
  // Pixel position of the point within the whole pyramid at this zoom.
  const px = (wx / UNITS_PER_PX + ORIGIN) * tiles;
  const py = (-wy / UNITS_PER_PX + ORIGIN) * tiles;

  const cx = Math.floor(px / TILE);
  const cy = Math.floor(py / TILE);

  const grid: Array<{ tx: number; ty: number }> = [];
  for (let ty = cy - radius; ty <= cy + radius; ty++) {
    for (let tx = cx - radius; tx <= cx + radius; tx++) {
      // Off the edge of the world: the pyramid has no tile there.
      if (tx < 0 || ty < 0 || tx >= tiles || ty >= tiles) continue;
      grid.push({ tx, ty });
    }
  }

  return (
    <div
      className={cn('relative overflow-hidden bg-muted', className)}
      role="img"
      aria-label={alt ?? `Map around ${wx}, ${wy}`}
    >
      {/* Zero-size anchor at the centre of the box: every tile is placed
          relative to the point itself, so the crop needs no measuring. */}
      <div className="absolute left-1/2 top-1/2 size-0">
        {grid.map(({ tx, ty }) => (
          <img
            key={`${tx}/${ty}`}
            src={TILE_URL.replace('{z}', String(zoom)).replace('{x}', String(tx)).replace('{y}', String(ty))}
            alt=""
            loading="lazy"
            draggable={false}
            className="absolute max-w-none select-none"
            style={{ left: tx * TILE - px, top: ty * TILE - py, width: TILE, height: TILE }}
            // The LOD textures don't fill every cell, so some tiles are
            // legitimately absent rather than broken.
            onError={(e) => { e.currentTarget.style.visibility = 'hidden'; }}
          />
        ))}
      </div>

      <svg
        viewBox="0 0 24 24" width={26} height={26} aria-hidden="true"
        className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-[85%]"
        style={{ filter: 'drop-shadow(0 1px 2px rgba(0,0,0,.65))' }}
      >
        <path d={GLYPH_PATHS.dungeon} fill="#111114" stroke="#e4e4e7" strokeWidth={1.5} strokeLinejoin="round" />
      </svg>

      <span className="absolute bottom-1 right-1 rounded bg-black/55 px-1.5 py-0.5 text-[10px] font-medium tabular-nums text-white">
        {Math.round(wx)}, {Math.round(wy)}
      </span>
    </div>
  );
}
