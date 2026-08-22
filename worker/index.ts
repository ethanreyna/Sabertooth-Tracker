/// <reference types="@cloudflare/workers-types" />

// Sabertooth Tracker backend.
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
  /** Optional. When set, grants read-only access. Unset = no guest access. */
  GUEST_PASSWORD?: string;
}

type Role = 'member' | 'guest';

const EMPTY_DB = { members: [], jobs: [], barrels: [], ledger: [] };
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

/** Members can write; guests can only read. Null means no valid password. */
function authRole(req: Request, env: Env): Role | null {
  const m = /^Bearer\s+(.+)$/i.exec(req.headers.get('Authorization') || '');
  if (!m) return null;
  const given = m[1];
  // Never allow-all: an unset GUILD_PASSWORD denies rather than admits.
  if (env.GUILD_PASSWORD && secretEquals(given, env.GUILD_PASSWORD)) return 'member';
  if (env.GUEST_PASSWORD && secretEquals(given, env.GUEST_PASSWORD)) return 'guest';
  return null;
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
  if (!role) {
    return json({ error: 'unauthorized' }, 401);
  }

  // Guests get reads only. Enforced here, not just hidden in the UI.
  if (role !== 'member' && req.method !== 'GET') {
    return json({ error: 'read-only', role }, 403);
  }

  if (url.pathname === '/api/db') {
    await ensureSchema(env);

    if (req.method === 'GET') {
      return json({ ...(await readDoc(env)), role });
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
