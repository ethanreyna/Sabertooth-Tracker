/** The community map. Members paste a link from here onto a point of interest. */
export const KEIZAAL_MAP_URL = 'https://keizaal.com/map';

/** UESP's Skyrim game map, which takes world coordinates in its URL. */
const UESP_BASE = 'https://gamemap.uesp.net/sr/';

/**
 * A stored coordinate, normalised to a plain integer string (a leading minus is
 * fine — Skyrim uses both). Empty when there is genuinely no position.
 *
 * Deliberately forgiving about *how* the number was written. This runs over
 * every record on every load, so anything it rejects is blanked and then saved
 * back blank — one strict test here can quietly erase every marker on the map.
 * A number, or a string with a decimal point, is still a position; only what
 * isn't a number at all is dropped.
 */
export const coordOrEmpty = (raw: unknown): string => {
  if (typeof raw === 'number') return Number.isFinite(raw) ? String(Math.round(raw)) : '';
  if (typeof raw !== 'string') return '';
  const v = raw.trim();
  if (v === '') return '';
  if (/^-?\d+$/.test(v)) return v;
  const n = Number(v);
  return Number.isFinite(n) ? String(Math.round(n)) : '';
};

/**
 * Deep-links UESP's map to a set of Skyrim world coordinates.
 *
 * A link, deliberately — not an embed. UESP's tiles are theirs, served off a
 * donation-funded wiki, and they return 403 to non-browser clients. Sending a
 * member there costs them a page view; rendering their tiles inside our app
 * would spend their bandwidth on our feature.
 */
export function uespMapUrl(x: string, y: string, zoom = 2.4): string {
  const cx = coordOrEmpty(x);
  const cy = coordOrEmpty(y);
  if (!cx || !cy) return '';
  const q = new URLSearchParams({
    world: 'skyrim',
    layer: 'day',
    x: cx,
    y: cy,
    zoom: String(zoom),
  });
  return `${UESP_BASE}?${q}`;
}

/** Only http(s) survives, so a stored link can't become a javascript: URL. */
export const httpUrlOrEmpty = (raw: string): string => {
  const v = raw.trim();
  return /^https?:\/\//i.test(v) ? v : '';
};
