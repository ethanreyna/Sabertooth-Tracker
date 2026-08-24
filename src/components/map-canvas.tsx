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
}

export default function MapCanvas({ db, readOnly, onPick, onOpen }: MapCanvasProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layerRef = useRef<L.LayerGroup | null>(null);
  // Held in refs so re-renders don't tear the map down and rebuild it.
  const pickRef = useRef(onPick);
  pickRef.current = onPick;
  const openRef = useRef(onOpen);
  openRef.current = onOpen;
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
      const marker = L.circleMarker(L.latLng(Number(s.y), Number(s.x)), {
        radius: 6,
        color: '#0b0b0c',
        weight: 2,
        fillColor: colorFor(s.kind),
        fillOpacity: 0.95,
      });
      marker.bindTooltip(`${esc(s.name)} · ${esc(s.kind)}`, { direction: 'top' });
      marker.bindPopup(
        `<div style="min-width:180px">
           <div style="font-weight:600">${esc(s.name)}</div>
           <div style="opacity:.7;font-size:12px">${esc(s.kind)}${s.location ? ' · ' + esc(s.location) : ''}</div>
           ${s.yield ? `<div style="font-size:12px;margin-top:4px">${esc(s.yield)}</div>` : ''}
           <div style="font-size:11px;opacity:.6;margin-top:4px">${esc(s.x)}, ${esc(s.y)}</div>
           <button data-poi="${esc(s.id)}" style="margin-top:6px;font-size:12px;text-decoration:underline;cursor:pointer;background:none;border:0;padding:0;color:inherit">Open</button>
         </div>`,
      );
      marker.on('popupopen', (e) => {
        const el = (e as unknown as { popup: L.Popup }).popup.getElement();
        el?.querySelector<HTMLButtonElement>('button[data-poi]')
          ?.addEventListener('click', () => openRef.current(s.id));
      });
      marker.addTo(group);
    }
  }, [db.spots]);

  return <div ref={hostRef} className="h-full w-full rounded-xl [&_.leaflet-container]:bg-muted" />;
}
