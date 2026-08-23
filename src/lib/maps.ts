/** The community map. Members paste a link from here onto a point of interest. */
export const KEIZAAL_MAP_URL = 'https://keizaal.com/map';

/** UESP's Skyrim game map, which takes world coordinates in its URL. */
const UESP_BASE = 'https://gamemap.uesp.net/sr/';

/** Keeps only a plain integer (a leading minus is fine — Skyrim uses both). */
export const coordOrEmpty = (raw: string): string => {
  const v = raw.trim();
  return /^-?\d+$/.test(v) ? v : '';
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
