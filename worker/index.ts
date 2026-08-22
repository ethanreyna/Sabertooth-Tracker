/// <reference types="@cloudflare/workers-types" />

// Sabretooth Tracker backend.
//
//   GET  /api/db        -> { db, version }
//   PUT  /api/db        -> { version }        body: { db, version }   409 on stale version
//   POST /api/upload    -> { url }            body: raw image bytes
//   GET  /api/img/:key  -> the image          (public: <img src> can't send headers)
//
// Everything except /api/img/* requires `Authorization: Bearer <guild password>`.
// Static assets are served by the [assets] binding; only /api/* runs this Worker
// (see run_worker_first in wrangler.toml).

interface Env {
  DB: D1Database;
  IMAGES: R2Bucket;
  ASSETS: Fetcher;
  GUILD_PASSWORD: string;
  PRICES_SHEET_ID?: string;
  PRICES_SHEET_TABS?: string;
}

type Role = 'member' | 'guest';

/** Sections a guest never receives. The UI hides them too, but stripping them
 *  server-side means an anonymous caller can't just read them off /api/db. */
const GUEST_HIDDEN = ['ledger'] as const;

const EMPTY_DB = { members: [], roles: [], jobs: [], barrels: [], dungeons: [], ledger: [] };
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const MAX_DB_BYTES = 8 * 1024 * 1024;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });

/** Constant-time string compare, so a wrong password leaks no timing signal. */
function secretEquals(a: string, b: string): boolean {
  const ea = new TextEncoder().encode(a);
  const eb = new TextEncoder().encode(b);
  if (ea.byteLength !== eb.byteLength) return false;
  return crypto.subtle.timingSafeEqual(ea, eb);
}

/**
 * Members present the guild password and can write. Anyone else is a guest:
 * read-only, and served a redacted copy. A wrong password is rejected outright
 * rather than silently downgraded, so a typo doesn't look like it worked.
 */
function authRole(req: Request, env: Env): Role | 'bad' {
  const m = /^Bearer\s+(.+)$/i.exec(req.headers.get('Authorization') || '');
  if (!m) return 'guest';
  // Never allow-all: an unset GUILD_PASSWORD denies rather than admits.
  if (env.GUILD_PASSWORD && secretEquals(m[1], env.GUILD_PASSWORD)) return 'member';
  return 'bad';
}

/** Strips member-only sections so a guest never receives them at all. */
function redactForGuest(db: unknown): unknown {
  if (!db || typeof db !== 'object') return db;
  const out = { ...(db as Record<string, unknown>) };
  for (const k of GUEST_HIDDEN) out[k] = [];
  return out;
}

// ---------------------------------------------------------------------------
// Market prices, proxied from a link-shared Google Sheet.
//
// The browser can't fetch the sheet directly (no CORS headers from Google), so
// the Worker does it and hands back JSON. Cached briefly so a room full of
// members clicking Refresh doesn't hammer Google.
// ---------------------------------------------------------------------------

const PRICES_TTL_SECONDS = 300;

/** Minimal RFC4180 CSV parser: handles quoted fields, escaped quotes, CRLF. */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') { cell += '"'; i++; } else quoted = false;
      } else cell += c;
      continue;
    }
    if (c === '"') { quoted = true; continue; }
    if (c === ',') { row.push(cell); cell = ''; continue; }
    if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(cell); cell = '';
      rows.push(row); row = [];
      continue;
    }
    cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows;
}

interface PriceRow {
  tab: string;
  category: string;
  item: string;
  values: Record<string, string>;
}

/** Header cells that name the thing rather than a value about it. */
const NAME_LABELS = new Set(['item', 'ingredient', 'potion', 'name', 'items']);
/** Header cells worth carrying through as columns. */
const VALUE_LABELS = new Set([
  'make price', 'price of 1', 'buy', 'sell', 'price', 'value', 'cost',
  'potions used in', 'ingredients', 'effects', 'contents', 'stock adjust',
  'stock change', 'details', 'notes', 'stock', 'price to brew', 'profit',
  'high demand', 'buy price code', 'low', 'high', 'avg',
]);

const clean = (s: string | undefined) => (s || '').trim().replace(/\s+/g, ' ');

/**
 * Parses one tab of the guild's price sheet.
 *
 * Every tab is laid out differently — hand-made blocks with a header row
 * naming the category and the columns, then item rows, then a spacer. Some tabs
 * call the middle column "Price of 1", others "Buy"; some put the item name in
 * column 0, ALCHEMY puts it in column 5. So rather than hardcoding positions we
 * read them off whichever header row we last saw.
 *
 * Two fallbacks keep the messier tabs usable:
 *  - If a row's labelled columns are all empty, its non-empty cells are matched
 *    to the header labels in order. ARMOR and TAILORING need this: their header
 *    labels sit in different columns from the values beneath them.
 *  - A tab with no recognisable header at all (Copy of Sheet1, which is really
 *    crafting recipes) is read as "one cell = a category, two or more = an item
 *    plus details".
 *
 * It is best-effort against a spreadsheet meant for humans: an unlabelled
 * column is dropped rather than guessed at.
 */
function parsePriceSheet(tab: string, csv: string): PriceRow[] {
  const out: PriceRow[] = [];
  let category = '';
  let nameIdx = -1;
  let cols: Array<{ i: number; label: string }> = [];

  for (const cells of parseCsv(csv)) {
    const lower = cells.map((c) => clean(c).toLowerCase());
    const nonEmpty = lower.map((c, i) => ({ c, i })).filter((x) => x.c !== '');
    if (nonEmpty.length === 0) continue;

    const labelled = nonEmpty.filter((x) => VALUE_LABELS.has(x.c));
    const named = nonEmpty.find((x) => NAME_LABELS.has(x.c));

    // A header row is anything that names at least one value column.
    if (labelled.length > 0) {
      cols = labelled.map((x) => ({ i: x.i, label: clean(cells[x.i]) }));
      if (named) {
        nameIdx = named.i; // "Item" / "Ingredient" — the block keeps its category
      } else {
        const first = nonEmpty.find((x) => !VALUE_LABELS.has(x.c));
        nameIdx = first ? first.i : -1;
        if (first) category = clean(cells[first.i]); // e.g. "Ore", "ORICHALCUM"
      }
      continue;
    }

    // No header seen yet: treat this as a plain list (crafting recipes).
    if (nameIdx < 0) {
      if (nonEmpty.length === 1) {
        category = clean(cells[nonEmpty[0].i]);
      } else {
        const [first, second] = nonEmpty;
        out.push({
          tab, category,
          item: clean(cells[first.i]),
          values: { Details: clean(cells[second.i]) },
        });
      }
      continue;
    }

    const item = clean(cells[nameIdx]);
    if (!item || NAME_LABELS.has(item.toLowerCase())) continue;

    // Strictly positional against the block's own header. There is deliberately
    // no "match leftover cells to labels in order" fallback: the faithful CSV
    // export keeps values under their headers, and guessing produced sell
    // prices filed under Make Price — wrong numbers that looked plausible.
    const values: Record<string, string> = {};
    for (const c of cols) {
      const v = clean(cells[c.i]);
      if (v) values[c.label] = v;
    }

    out.push({ tab, category: category || tab, item, values });
  }
  return out;
}

async function handlePrices(env: Env, url: URL): Promise<Response> {
  const id = env.PRICES_SHEET_ID;
  if (!id) return json({ error: 'no sheet configured', prices: [] }, 501);

  // Each entry is "<gid>:<display label>".
  const sheets = (env.PRICES_SHEET_TABS || '').split(',')
    .map((entry) => {
      const at = entry.indexOf(':');
      const gid = (at >= 0 ? entry.slice(0, at) : entry).trim();
      const tab = (at >= 0 ? entry.slice(at + 1) : entry).trim();
      return { gid, tab };
    })
    .filter((s) => s.gid !== '' && s.tab !== '');
  if (sheets.length === 0) return json({ error: 'no tabs configured', prices: [] }, 501);

  const tabs = sheets.map((s) => s.tab);
  const bypass = url.searchParams.get('refresh') === '1';

  // Fetched in parallel, so eight tabs cost one round trip rather than eight.
  const results = await Promise.all(sheets.map(async ({ gid, tab }) => {
    const src = `https://docs.google.com/spreadsheets/d/${id}/export`
      + `?format=csv&gid=${encodeURIComponent(gid)}`;
    try {
      const res = await fetch(src, {
        cf: { cacheTtl: bypass ? 0 : PRICES_TTL_SECONDS, cacheEverything: true },
        headers: { 'User-Agent': 'sabretooth-tracker' },
      });
      if (!res.ok) return { tab, status: res.status, rows: [] as PriceRow[] };
      return { tab, status: 200, rows: parsePriceSheet(tab, await res.text()) };
    } catch {
      return { tab, status: 0, rows: [] as PriceRow[] };
    }
  }));

  const prices = results.flatMap((r) => r.rows);
  const failed = results.filter((r) => r.status !== 200).map((r) => r.tab);

  // A single bad tab shouldn't sink the whole list — report it alongside the
  // rows that did load.
  if (prices.length === 0 && failed.length) {
    const anyAuth = results.some((r) => r.status === 401 || r.status === 403);
    return json({
      error: anyAuth
        ? 'The sheet is not shared publicly. Set link sharing to "Anyone with the link can view".'
        : `Could not read: ${failed.join(', ')}.`,
      prices: [],
    }, 502);
  }

  return new Response(JSON.stringify({
    prices,
    tabs,
    failed,
    syncedAt: new Date().toISOString(),
  }), {
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': bypass ? 'no-store' : `public, max-age=${PRICES_TTL_SECONDS}`,
    },
  });
}

let schemaReady: Promise<unknown> | null = null;
function ensureSchema(env: Env) {
  if (!schemaReady) {
    schemaReady = env.DB.prepare(
      `CREATE TABLE IF NOT EXISTS doc (
         id         INTEGER PRIMARY KEY CHECK (id = 1),
         data       TEXT    NOT NULL,
         version    INTEGER NOT NULL DEFAULT 0,
         updated_at TEXT    NOT NULL
       )`,
    ).run().catch((e) => {
      schemaReady = null; // let the next request retry
      throw e;
    });
  }
  return schemaReady;
}

async function readDoc(env: Env): Promise<{ db: unknown; version: number }> {
  const row = await env.DB.prepare('SELECT data, version FROM doc WHERE id = 1')
    .first<{ data: string; version: number }>();
  if (!row) return { db: EMPTY_DB, version: 0 };
  let parsed: unknown = EMPTY_DB;
  try {
    parsed = JSON.parse(row.data);
  } catch {
    /* corrupt row: fall back to empty rather than 500 the whole guild */
  }
  return { db: parsed, version: row.version };
}

const extFor = (ct: string) =>
  ({ 'image/png': '.png', 'image/jpeg': '.jpg', 'image/webp': '.webp', 'image/gif': '.gif', 'image/avif': '.avif' })[ct] || '.bin';

async function handleApi(req: Request, env: Env, url: URL): Promise<Response> {
  // Images are fetched by the browser as <img src>, which cannot carry an auth
  // header. Keys are random UUIDs, so they're unguessable rather than secret.
  if (req.method === 'GET' && url.pathname.startsWith('/api/img/')) {
    const key = decodeURIComponent(url.pathname.slice('/api/img/'.length));
    if (!/^[A-Za-z0-9._-]{1,120}$/.test(key)) return json({ error: 'bad key' }, 400);
    const obj = await env.IMAGES.get(key);
    if (!obj) return json({ error: 'not found' }, 404);
    return new Response(obj.body, {
      headers: {
        'Content-Type': obj.httpMetadata?.contentType || 'application/octet-stream',
        'Cache-Control': 'public, max-age=31536000, immutable',
        'ETag': obj.httpEtag,
      },
    });
  }

  const role = authRole(req, env);
  if (role === 'bad') {
    return json({ error: 'unauthorized' }, 401);
  }

  // Guests get reads only. Enforced here, not just hidden in the UI.
  if (role !== 'member' && req.method !== 'GET') {
    return json({ error: 'read-only', role }, 403);
  }

  // Read-only proxy to a link-shared sheet, so any signed-in role may call it.
  if (url.pathname === '/api/prices' && req.method === 'GET') {
    return handlePrices(env, url);
  }

  if (url.pathname === '/api/db') {
    await ensureSchema(env);

    if (req.method === 'GET') {
      const doc = await readDoc(env);
      return json({
        db: role === 'member' ? doc.db : redactForGuest(doc.db),
        version: doc.version,
        role,
      });
    }

    if (req.method === 'PUT') {
      let body: { db?: unknown; version?: unknown };
      try {
        body = await req.json();
      } catch {
        return json({ error: 'invalid json' }, 400);
      }
      if (!body.db || typeof body.db !== 'object') return json({ error: 'missing db' }, 400);

      const data = JSON.stringify(body.db);
      if (data.length > MAX_DB_BYTES) return json({ error: 'database too large' }, 413);
      const expected = Number(body.version || 0);
      const now = new Date().toISOString();

      // Bump the version only if the caller was working from the current one.
      // RETURNING gives us null when the guard blocks the update -> conflict.
      const row = await env.DB.prepare(
        `INSERT INTO doc (id, data, version, updated_at) VALUES (1, ?1, 1, ?2)
         ON CONFLICT(id) DO UPDATE SET data = ?1, version = doc.version + 1, updated_at = ?2
           WHERE doc.version = ?3
         RETURNING version`,
      ).bind(data, now, expected).first<{ version: number }>();

      if (!row) return json({ error: 'conflict', ...(await readDoc(env)) }, 409);
      return json({ version: row.version });
    }

    return json({ error: 'method not allowed' }, 405);
  }

  if (url.pathname === '/api/upload' && req.method === 'POST') {
    const ct = (req.headers.get('Content-Type') || '').split(';')[0].trim().toLowerCase();
    if (!ct.startsWith('image/')) return json({ error: 'expected an image' }, 415);

    const buf = await req.arrayBuffer();
    if (!buf.byteLength) return json({ error: 'empty body' }, 400);
    if (buf.byteLength > MAX_IMAGE_BYTES) return json({ error: 'image too large (10MB max)' }, 413);

    const key = crypto.randomUUID() + extFor(ct);
    await env.IMAGES.put(key, buf, { httpMetadata: { contentType: ct } });
    return json({ url: '/api/img/' + key });
  }

  return json({ error: 'not found' }, 404);
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    if (url.pathname.startsWith('/api/')) {
      try {
        return await handleApi(req, env, url);
      } catch (e) {
        console.error('api error', e);
        return json({ error: 'server error' }, 500);
      }
    }
    // Not an API path: hand back to static assets (only reached if the asset
    // router forwarded it, e.g. when run_worker_first is broadened).
    return env.ASSETS.fetch(req);
  },
} satisfies ExportedHandler<Env>;
