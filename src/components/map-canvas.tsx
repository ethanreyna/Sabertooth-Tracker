import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { GLYPH_PATHS, glyphFor } from '@/components/map-glyphs';
import type { DB, Spot } from '@/types';

// The tile pyramid was cut from Skyrim's own LOD textures, so these numbers are
// exact rather than eyeballed: the world spans cells -64..+63 at 4096 units per
// cell, and the pyramid tops out at 256 * 2^TILE_ZOOM pixels across.
const WORLD_MIN = -262144;
const WORLD_MAX = 262144;
/** Deepest level the pyramid actually holds: 256 * 2^5 = 8192px across. */
const TILE_ZOOM = 5;
/**
 * How far the view goes. Past TILE_ZOOM Leaflet upscales the deepest tiles, so
 * the terrain softens but the map keeps zooming — which is what placing a
 * marker on the right side of a river needs. Cutting real tiles at this depth
 * would be four times the files per level, and the pyramid ships in the repo.
 */
const MAX_ZOOM = 8;
const TILE_URL = '/tiles/skyrim/{z}/{x}/{y}.jpg';

// pixel = 2^z * (world / 2048 + 128), and y is negated because image rows run
// south as they increase while game Y runs north.
const SCALE = 1 / 2048;
const OFFSET = 128;

const KIND_COLOR: Record<string, string> = {
  ore: '#eab308',
  hunting: '#ef4444',
  alchemy: '#22c55e',
  crafting: '#3b82f6',
};
const colorFor = (kind: string) => KIND_COLOR[kind.toLowerCase()] ?? '#a1a1aa';

const glyphSvg = (path: string, size: number) =>
  `<svg viewBox="0 0 24 24" width="${size}" height="${size}" aria-hidden="true"
        style="filter:drop-shadow(0 1px 2px rgba(0,0,0,.65))">
     <path d="${path}" fill="#111114" stroke="#e4e4e7" stroke-width="1.5" stroke-linejoin="round"/>
   </svg>`;

/** Kinds with a silhouette get one; the resource kinds stay coloured dots. */
function spotIcon(kind: string): L.DivIcon {
  const path = glyphFor(kind);
  if (path) {
    const size = /^(city|capital|hold)$/i.test(kind.trim()) ? 28 : 24;
    return L.divIcon({
      className: '',
      iconSize: [size, size],
      iconAnchor: [size / 2, size - 4],
      html: glyphSvg(path, size),
    });
  }
  return L.divIcon({
    className: '',
    iconSize: [14, 14],
    iconAnchor: [7, 7],
    html: `<span style="display:block;width:14px;height:14px;border-radius:9999px;
             background:${colorFor(kind)};border:2px solid #0b0b0c;
             box-shadow:0 0 0 1px rgba(255,255,255,.35)"></span>`,
  });
}

const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string
  ));

/** Which collection a marker belongs to, so edits land in the right place. */
export type MapKind = 'spot' | 'dungeon';

/** A finished drag, waiting to be confirmed or put back. */
export interface MoveRequest {
  kind: MapKind;
  id: string;
  name: string;
  x: number;
  y: number;
  /** Where it was, for the message and for putting it back. */
  fromX: number;
  fromY: number;
  /** Returns the marker to where it started. */
  revert: () => void;
}

// Markers don't drag on a plain press. Somebody reading the map shouldn't be
// able to move a dungeon by brushing past it, so a drag has to be asked for:
// press and hold, without wandering, and the marker unlocks and follows the
// same gesture. Dropping it then asks before anything is written down.
const HOLD_MS = 700;
const HOLD_SLOP = 6; // px of wander allowed before it counts as a pan

/**
 * Makes one marker hold-to-drag. Returns a teardown for when markers are
 * rebuilt, so the listeners don't outlive the icon they were bound to.
 */
function armOnHold(map: L.Map, marker: L.Marker, onArmed: () => void): () => void {
  const icon = marker.getElement();
  if (!icon) return () => {};

  let timer: number | undefined;
  let from: { x: number; y: number } | null = null;

  const clear = () => {
    window.clearTimeout(timer);
    timer = undefined;
    from = null;
    icon.classList.remove('marker-arming');
    document.removeEventListener('pointermove', onMove, true);
    document.removeEventListener('pointerup', clear, true);
    document.removeEventListener('pointercancel', clear, true);
  };

  function onMove(e: PointerEvent) {
    if (!from) return;
    if (Math.abs(e.clientX - from.x) > HOLD_SLOP || Math.abs(e.clientY - from.y) > HOLD_SLOP) clear();
  }

  const onDown = (e: PointerEvent) => {
    if (e.button !== 0 || marker.dragging?.enabled()) return;
    from = { x: e.clientX, y: e.clientY };
    icon.classList.add('marker-arming');
    document.addEventListener('pointermove', onMove, true);
    document.addEventListener('pointerup', clear, true);
    document.addEventListener('pointercancel', clear, true);

    timer = window.setTimeout(() => {
      const at = from;
      icon.classList.remove('marker-arming');
      if (!at) return;
      marker.dragging?.enable();
      icon.classList.add('marker-armed');
      onArmed();
      // The map is mid-press too; letting both run would pan and drag at once.
      map.dragging.disable();
      // Hand the gesture that is already underway to Leaflet's drag handler,
      // so the hold flows into the drag instead of needing a second grab.
      icon.dispatchEvent(new MouseEvent('mousedown', {
        clientX: at.x, clientY: at.y, button: 0, bubbles: true, cancelable: true, view: window,
      }));
    }, HOLD_MS);
  };

  icon.addEventListener('pointerdown', onDown);
  return () => {
    clear();
    icon.removeEventListener('pointerdown', onDown);
  };
}

export interface MapCanvasProps {
  db: DB;
  readOnly: boolean;
  /** Clicking empty map hands back coordinates so a point can be created there. */
  onPick: (x: number, y: number) => void;
  onOpen: (kind: MapKind, id: string) => void;
  onDelete: (kind: MapKind, id: string) => void;
  /** A finished drag. Nothing is written until the request is confirmed. */
  onMoveRequest: (req: MoveRequest) => void;
}

export default function MapCanvas({ db, readOnly, onPick, onOpen, onDelete, onMoveRequest }: MapCanvasProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layerRef = useRef<L.LayerGroup | null>(null);
  // Held in refs so re-renders don't tear the map down and rebuild it.
  const pickRef = useRef(onPick);
  pickRef.current = onPick;
  const openRef = useRef(onOpen);
  openRef.current = onOpen;
  const deleteRef = useRef(onDelete);
  deleteRef.current = onDelete;
  const moveRef = useRef(onMoveRequest);
  moveRef.current = onMoveRequest;
  const roRef = useRef(readOnly);
  roRef.current = readOnly;

  useEffect(() => {
    const host = hostRef.current;
    if (!host || mapRef.current) return;

    const crs = L.extend({}, L.CRS.Simple, {
      transformation: new L.Transformation(SCALE, OFFSET, -SCALE, OFFSET),
    });

    const bounds = L.latLngBounds(
      L.latLng(WORLD_MIN, WORLD_MIN),
      L.latLng(WORLD_MAX, WORLD_MAX),
    );

    const map = L.map(host, {
      crs,
      minZoom: 0,
      maxZoom: MAX_ZOOM,
      zoomControl: true,
      attributionControl: false,
      maxBounds: bounds,
      maxBoundsViscosity: 0.9,
    });
    mapRef.current = map;

    L.tileLayer(TILE_URL, {
      tileSize: 256,
      minZoom: 0,
      maxZoom: MAX_ZOOM,
      // Beyond this there are no tiles to fetch; Leaflet stretches z5 instead
      // of asking for 404s.
      maxNativeZoom: TILE_ZOOM,
      noWrap: true,
      bounds,
      // The LOD textures don't fill every cell, so edge tiles are legitimately
      // missing rather than broken.
      errorTileUrl: 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',
    }).addTo(map);

    layerRef.current = L.layerGroup().addTo(map);
    // Explicit view rather than fitBounds: the container is a flex child, so at
    // mount it may still have no height and fitBounds would pick a wild zoom.
    map.setView(L.latLng(0, 0), 2);

    map.on('click', (e: L.LeafletMouseEvent) => {
      if (roRef.current) return;
      pickRef.current(Math.round(e.latlng.lng), Math.round(e.latlng.lat));
    });

    // Leaflet caches the container size, so it has to be told when the flex
    // layout settles or the tile grid is computed against the wrong box.
    const ro = new ResizeObserver(() => map.invalidateSize());
    ro.observe(host);

    return () => {
      ro.disconnect();
      map.remove();
      mapRef.current = null;
      layerRef.current = null;
    };
  }, []);

  // Redraw markers whenever the points change.
  useEffect(() => {
    const group = layerRef.current;
    const map = mapRef.current;
    if (!group || !map) return;
    group.clearLayers();

    // Torn down on the next redraw: the icons these are bound to are gone by
    // then, and a stale listener would arm a marker that no longer exists.
    const cleanups: Array<() => void> = [];

    /** Hold to unlock, drag, then confirm — the whole flow for one marker. */
    const makeMovable = (marker: L.Marker, kind: MapKind, id: string, name: string) => {
      if (roRef.current) return;
      const home = marker.getLatLng();
      // Created draggable so Leaflet builds the handler, but off until held.
      marker.dragging?.disable();

      const settle = () => {
        marker.dragging?.disable();
        marker.getElement()?.classList.remove('marker-armed');
        map.dragging.enable();
      };

      marker.on('dragend', () => {
        const p = marker.getLatLng();
        settle();
        const x = Math.round(p.lng);
        const y = Math.round(p.lat);
        if (x === Math.round(home.lng) && y === Math.round(home.lat)) return;
        moveRef.current({
          kind, id, name, x, y,
          fromX: Math.round(home.lng), fromY: Math.round(home.lat),
          revert: () => marker.setLatLng(home),
        });
      });

      cleanups.push(armOnHold(map, marker, () => marker.closePopup()));
      cleanups.push(settle);
    };

    const placed: Spot[] = db.spots.filter((s) => s.x !== '' && s.y !== '');
    for (const s of placed) {
      // A divIcon rather than circleMarker: only L.Marker can be dragged, and
      // dragging is how a mis-placed point gets fixed.
      const marker = L.marker(L.latLng(Number(s.y), Number(s.x)), {
        // Draggable, but only once held: see armOnHold.
        draggable: !roRef.current,
        icon: spotIcon(s.kind),
      });
      marker.bindTooltip(`${esc(s.name)} · ${esc(s.kind)}`, { direction: 'top' });
      const btn = 'font-size:12px;text-decoration:underline;cursor:pointer;background:none;border:0;padding:0';
      marker.bindPopup(
        `<div style="min-width:180px">
           <div style="font-weight:600">${esc(s.name)}</div>
           <div style="opacity:.7;font-size:12px">${esc(s.kind)}${s.location ? ' · ' + esc(s.location) : ''}</div>
           ${s.yield ? `<div style="font-size:12px;margin-top:4px">${esc(s.yield)}</div>` : ''}
           <div style="font-size:11px;opacity:.6;margin-top:4px">${esc(s.x)}, ${esc(s.y)}</div>
           <div style="display:flex;gap:10px;margin-top:6px">
             <button data-act="open" style="${btn};color:inherit">Open</button>
             ${roRef.current ? '' : `<button data-act="del" style="${btn};color:#dc2626">Delete</button>`}
           </div>
         </div>`,
      );
      marker.on('popupopen', (e) => {
        const el = (e as unknown as { popup: L.Popup }).popup.getElement();
        el?.querySelector<HTMLButtonElement>('button[data-act="open"]')
          ?.addEventListener('click', () => openRef.current('spot', s.id));
        el?.querySelector<HTMLButtonElement>('button[data-act="del"]')
          ?.addEventListener('click', () => {
            // Confirmed here rather than in React: the popup is Leaflet's own
            // DOM, so there is no dialog to hand this off to.
            if (confirm(`Delete “${s.name}”?`)) deleteRef.current('spot', s.id);
          });
      });
      marker.addTo(group);
      makeMovable(marker, 'spot', s.id, s.name);
    }

    // Dungeons get Skyrim's own cave-mouth silhouette so they read as a
    // different kind of thing from a gathering point at a glance.
    for (const g of db.dungeons) {
      if (g.x === '' || g.y === '') continue;
      const marker = L.marker(L.latLng(Number(g.y), Number(g.x)), {
        draggable: !roRef.current,
        icon: L.divIcon({
          className: '',
          iconSize: [26, 26],
          iconAnchor: [13, 22],
          html: glyphSvg(GLYPH_PATHS.dungeon, 26),
        }),
      });
      marker.bindTooltip(
        `${esc(g.name)}${g.recommended ? ` · ${g.recommended}+` : ''}`,
        { direction: 'top' },
      );
      const dbtn = 'font-size:12px;text-decoration:underline;cursor:pointer;background:none;border:0;padding:0';
      marker.bindPopup(
        `<div style="min-width:180px">
           <div style="font-weight:600">${esc(g.name)}</div>
           <div style="opacity:.7;font-size:12px">Dungeon${g.difficulty ? ' · ' + esc(g.difficulty) : ''}${g.recommended ? ` · ${g.recommended}+ recommended` : ''}</div>
           ${g.location ? `<div style="font-size:12px;margin-top:4px">${esc(g.location)}</div>` : ''}
           <div style="font-size:11px;opacity:.6;margin-top:4px">${esc(g.x)}, ${esc(g.y)}</div>
           <div style="display:flex;gap:10px;margin-top:6px">
             <button data-act="open" style="${dbtn};color:inherit">Open</button>
             ${roRef.current ? '' : `<button data-act="del" style="${dbtn};color:#dc2626">Delete</button>`}
           </div>
         </div>`,
      );
      marker.on('popupopen', (e) => {
        const el = (e as unknown as { popup: L.Popup }).popup.getElement();
        el?.querySelector<HTMLButtonElement>('button[data-act="open"]')
          ?.addEventListener('click', () => openRef.current('dungeon', g.id));
        el?.querySelector<HTMLButtonElement>('button[data-act="del"]')
          ?.addEventListener('click', () => {
            if (confirm(`Delete “${g.name}”? This removes it from the Dungeons section too.`)) {
              deleteRef.current('dungeon', g.id);
            }
          });
      });
      marker.addTo(group);
      makeMovable(marker, 'dungeon', g.id, g.name);
    }

    return () => { for (const fn of cleanups) fn(); };
  }, [db.spots, db.dungeons]);

  return <div ref={hostRef} className="h-full w-full rounded-xl [&_.leaflet-container]:bg-muted" />;
}
