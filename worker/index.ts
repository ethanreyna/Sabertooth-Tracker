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
  PRICES_SHEET_GIDS?: string;
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
  category: string;
  item: string;
  make: string;
  unit: string;
  sell: string;
}

/**
 * The sheet is laid out as repeating blocks: a header row naming the category
 * and the columns ("Ore | Make Price | Price of 1 | Sell"), then item rows,
 * then a blank spacer. Column positions are read off each header row rather
 * than hardcoded, so inserting a column doesn't break the parse.
 */
function parsePriceSheet(csv: string): PriceRow[] {
  const out: PriceRow[] = [];
  let category = '';
  let nameCol = -1;
  let makeCol = -1;
  let unitCol = -1;
  let sellCol = -1;

  for (const cells of parseCsv(csv)) {
    const lower = cells.map((c) => c.trim().toLowerCase());
    const headerAt = lower.findIndex((c) => c === 'make price');

    if (headerAt >= 0) {
      makeCol = headerAt;
      unitCol = lower.findIndex((c) => c.startsWith('price of'));
      sellCol = lower.findIndex((c) => c === 'sell');
      // The category label sits in the first non-empty cell left of the prices.
      nameCol = lower.findIndex((c, i) => i < headerAt && c !== '');
      category = nameCol >= 0 ? cells[nameCol].trim() : '';
      continue;
    }

    if (nameCol < 0) continue; // nothing useful before the first header
    const item = (cells[nameCol] || '').trim().replace(/\s+/g, ' ');
    if (!item) continue; // blank spacer row

    const at = (i: number) => (i >= 0 ? (cells[i] || '').trim() : '');
    out.push({ category, item, make: at(makeCol), unit: at(unitCol), sell: at(sellCol) });
  }
  return out;
}

async function handlePrices(env: Env, url: URL): Promise<Response> {
  const id = env.PRICES_SHEET_ID;
  if (!id) return json({ error: 'no sheet configured', prices: [] }, 501);

  const gids = (env.PRICES_SHEET_GIDS || '').split(',').map((g) => g.trim()).filter(Boolean);
  const targets = gids.length ? gids : [''];
  const bypass = url.searchParams.get('refresh') === '1';

  const prices: PriceRow[] = [];
  for (const gid of targets) {
    const src = `https://docs.google.com/spreadsheets/d/${id}/export?format=csv${gid ? `&gid=${gid}` : ''}`;
    const res = await fetch(src, {
      cf: { cacheTtl: bypass ? 0 : PRICES_TTL_SECONDS, cacheEverything: true },
      headers: { 'User-Agent': 'sabretooth-tracker' },
    });
    if (!res.ok) {
      return json({
        error: res.status === 401 || res.status === 403
          ? 'The sheet is not shared publicly. Set link sharing to "Anyone with the link can view".'
          : `Google returned ${res.status}.`,
        prices: [],
      }, 502);
    }
    prices.push(...parsePriceSheet(await res.text()));
  }

  return new Response(JSON.stringify({ prices, syncedAt: new Date().toISOString() }), {
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
