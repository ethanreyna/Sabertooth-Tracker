import { CircleHelp, CircleOff, Flame } from 'lucide-react';
import type { ComponentType } from 'react';
import { GLYPH_PATHS } from '@/components/map-glyphs';
import { DUNGEON_STATUSES, STATUS_LABEL, dungeonIconStyle } from '@/lib/dungeon';
import { cn } from '@/lib/utils';
import type { DungeonStatus } from '@/types';

// Same projection the full map uses: world/2048 + 128 puts Skyrim's ±262144
// into a 256-pixel square, and each zoom level doubles that.
const TILE = 256;
const ORIGIN = 128;
const UNITS_PER_PX = 2048;
const TILE_URL = '/tiles/skyrim/{z}/{x}/{y}.jpg';

const STATUS_ICON: Record<DungeonStatus, ComponentType<{ className?: string; strokeWidth?: number }>> = {
  active: Flame, disabled: CircleOff, unknown: CircleHelp,
};

/** Buttons overlaid on a {@link MapThumb} to set a dungeon's status without
 *  opening its edit form — the fast path for browsing and fixing as you go. */
function StatusPicker({ status, onSet }: { status: DungeonStatus; onSet: (s: DungeonStatus) => void }) {
  return (
    <div className="absolute bottom-1 left-1 flex gap-0.5 rounded-md bg-black/55 p-0.5">
      {DUNGEON_STATUSES.map((s) => {
        const Icon = STATUS_ICON[s];
        const current = s === status;
        return (
          <button
            key={s}
            type="button"
            aria-label={`Mark ${STATUS_LABEL[s]}`}
            aria-pressed={current}
            title={STATUS_LABEL[s]}
            onClick={(e) => { e.stopPropagation(); onSet(s); }}
            className={cn(
              'flex size-5 items-center justify-center rounded text-white/70 transition-colors hover:text-white',
              current && 'bg-white/25 text-white',
            )}
          >
            <Icon className="size-3.5" strokeWidth={2.25} />
          </button>
        );
      })}
    </div>
  );
}

/**
 * A crop of the guild map centred on one place, with a marker on it.
 *
 * Not a Leaflet map — there is nothing to pan or click, and a dungeon list
 * would otherwise mount thirty of them. It is a handful of tile images offset
 * so the point lands dead centre, which means no measuring, no layout pass, and
 * nothing to tear down. The tiles are the ones the map already serves, so they
 * are usually in the browser cache by the time this renders.
 */
export function MapThumb({ x, y, zoom = 4, radius = 1, className, alt, status, onSetStatus }: {
  x: string | number;
  y: string | number;
  /** Higher is closer in. The pyramid holds real detail to 5. */
  zoom?: number;
  /** Tiles kept either side of the centre one; 1 covers a 768px box. */
  radius?: number;
  className?: string;
  alt?: string;
  /** Lights the marker to match — active glows, disabled and unknown don't.
   *  Plain black-and-white when omitted, for places that aren't dungeons. */
  status?: DungeonStatus;
  /** Renders the status buttons in the corner; omit to leave the thumb
   *  read-only (a guest's view, or a form that already has its own toggle). */
  onSetStatus?: (status: DungeonStatus) => void;
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

  const style = status ? dungeonIconStyle(status) : null;

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
        style={{ filter: style?.glow ?? 'drop-shadow(0 1px 2px rgba(0,0,0,.65))', opacity: style?.opacity ?? 1 }}
      >
        <path
          d={GLYPH_PATHS.dungeon}
          fill={style?.fill ?? '#111114'} stroke={style?.stroke ?? '#e4e4e7'}
          strokeWidth={1.5} strokeLinejoin="round"
        />
        {status === 'unknown' && (
          <>
            <circle cx="18" cy="6" r="6.5" fill="#0b0b0c" stroke={style?.stroke} strokeWidth={1} />
            <text x="18" y="9" fontSize="9" fontWeight="700" textAnchor="middle" fill={style?.stroke}>?</text>
          </>
        )}
      </svg>

      <span className="absolute bottom-1 right-1 rounded bg-black/55 px-1.5 py-0.5 text-[10px] font-medium tabular-nums text-white">
        {Math.round(wx)}, {Math.round(wy)}
      </span>

      {status && onSetStatus && <StatusPicker status={status} onSet={onSetStatus} />}
    </div>
  );
}
