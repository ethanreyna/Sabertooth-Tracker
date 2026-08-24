import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { DB, Spot } from '@/types';

// The tile pyramid was cut from Skyrim's own LOD textures, so these numbers are
// exact rather than eyeballed: the world spans cells -64..+63 at 4096 units per
// cell, and the pyramid tops out at 256 * 2^MAX_ZOOM pixels across.
const WORLD_MIN = -262144;
const WORLD_MAX = 262144;
const MAX_ZOOM = 5;
const TILE_URL = '/tiles/skyrim/{z}/{x}/{y}.jpg';

// pixel = 2^z * (world / 2048 + 128), and y is negated because image rows run
// south as they increase while game Y runs north.
const SCALE = 1 / 2048;
const OFFSET = 128;

const KIND_COLOR: Record<string, string> = {
  ore: '#a1a1aa',
  hunting: '#ef4444',
  alchemy: '#22c55e',
  fishing: '#0ea5e9',
  wood: '#f59e0b',
};
const colorFor = (kind: string) => KIND_COLOR[kind.toLowerCase()] ?? '#a1a1aa';

const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string
  ));

export interface MapCanvasProps {
  db: DB;
  readOnly: boolean;
  /** Clicking empty map hands back coordinates so a point can be created there. */
  onPick: (x: number, y: number) => void;
  onOpen: (id: string) => void;
  onDelete: (id: string) => void;
  /** Dragging a marker rewrites its coordinates — far quicker than retyping. */
  onMove: (kind: 'spot' | 'dungeon', id: string, x: number, y: number) => void;
}

export default function MapCanvas({ db, readOnly, onPick, onOpen, onDelete, onMove }: MapCanvasProps) {
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
  const moveRef = useRef(onMove);
  moveRef.current = onMove;
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
    if (!group) return;
    group.clearLayers();

    const placed: Spot[] = db.spots.filter((s) => s.x !== '' && s.y !== '');
    for (const s of placed) {
      // A divIcon rather than circleMarker: only L.Marker can be dragged, and
      // dragging is how a mis-placed point gets fixed.
      const marker = L.marker(L.latLng(Number(s.y), Number(s.x)), {
        draggable: !roRef.current,
        icon: L.divIcon({
          className: '',
          iconSize: [14, 14],
          iconAnchor: [7, 7],
          html: `<span style="display:block;width:14px;height:14px;border-radius:9999px;
                   background:${colorFor(s.kind)};border:2px solid #0b0b0c;
                   box-shadow:0 0 0 1px rgba(255,255,255,.35)"></span>`,
        }),
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
          ?.addEventListener('click', () => openRef.current(s.id));
        el?.querySelector<HTMLButtonElement>('button[data-act="del"]')
          ?.addEventListener('click', () => {
            // Confirmed here rather than in React: the popup is Leaflet's own
            // DOM, so there is no dialog to hand this off to.
            if (confirm(`Delete “${s.name}”?`)) deleteRef.current(s.id);
          });
      });
      if (!roRef.current) {
        marker.on('dragend', () => {
          const p = marker.getLatLng();
          moveRef.current('spot', s.id, Math.round(p.lng), Math.round(p.lat));
        });
      }
      marker.addTo(group);
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
          html: `<svg viewBox="0 0 24 24" width="26" height="26" aria-hidden="true">
                   <path d="M12 2 C6 2 3 7 3 13 v8 h5 v-6 a4 4 0 0 1 8 0 v6 h5 v-8 c0-6-3-11-9-11z"
                         fill="#111114" stroke="#e4e4e7" stroke-width="1.6" stroke-linejoin="round"/>
                 </svg>`,
        }),
      });
      marker.bindTooltip(
        `${esc(g.name)}${g.recommended ? ` · ${g.recommended}+` : ''}`,
        { direction: 'top' },
      );
      marker.bindPopup(
        `<div style="min-width:180px">
           <div style="font-weight:600">${esc(g.name)}</div>
           <div style="opacity:.7;font-size:12px">Dungeon${g.difficulty ? ' · ' + esc(g.difficulty) : ''}${g.recommended ? ` · ${g.recommended}+ recommended` : ''}</div>
           ${g.location ? `<div style="font-size:12px;margin-top:4px">${esc(g.location)}</div>` : ''}
           <div style="font-size:11px;opacity:.6;margin-top:4px">${esc(g.x)}, ${esc(g.y)}</div>
         </div>`,
      );
      if (!roRef.current) {
        marker.on('dragend', () => {
          const p = marker.getLatLng();
          moveRef.current('dungeon', g.id, Math.round(p.lng), Math.round(p.lat));
        });
      }
      marker.addTo(group);
    }
  }, [db.spots, db.dungeons]);

  return <div ref={hostRef} className="h-full w-full rounded-xl [&_.leaflet-container]:bg-muted" />;
}
