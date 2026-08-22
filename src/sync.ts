import type { AccessRole, Barrel, CollectionEntry, CollectionTarget, DB, Dungeon, Job, LedgerEntry, Member, MemberEntry, Price, Role, SyncCfg } from './types';

const CFG_KEY = 'sabretooth-auth';
const LEGACY_CFG_KEY = 'sabertooth-auth'; // pre-rename; read once so nobody is logged out
const DB_KEY = 'keizaal-db'; // unchanged so existing local data survives the upgrade

/** Server rejected the write because someone else saved first. */
export class ConflictError extends Error {
  constructor(public db: DB, public version: number) {
    super('version conflict');
    this.name = 'ConflictError';
  }
}

/** Wrong or missing guild password. */
export class AuthError extends Error {
  constructor() {
    super('unauthorized');
    this.name = 'AuthError';
  }
}

/** Signed in as a guest, which the server allows to read but not write. */
export class ReadOnlyError extends Error {
  constructor() {
    super('read-only');
    this.name = 'ReadOnlyError';
  }
}

export function loadCfg(): SyncCfg | null {
  try {
    const raw = localStorage.getItem(CFG_KEY) ?? localStorage.getItem(LEGACY_CFG_KEY);
    const c = JSON.parse(raw || 'null');
    if (!c) return null;
    if (c.guest === true) return { password: '', guest: true };
    return typeof c.password === 'string' && c.password ? { password: c.password, guest: false } : null;
  } catch {
    return null;
  }
}

export function saveCfg(cfg: SyncCfg | null): void {
  try {
    if (cfg) localStorage.setItem(CFG_KEY, JSON.stringify(cfg));
    else localStorage.removeItem(CFG_KEY);
    localStorage.removeItem(LEGACY_CFG_KEY);
  } catch {
    /* ignore */
  }
}

export function loadLocal(): DB | null {
  try {
    const d = JSON.parse(localStorage.getItem(DB_KEY) || 'null');
    return d && d.jobs ? normalizeDb(d) : null;
  } catch {
    return null;
  }
}

export function saveLocal(db: DB): void {
  try {
    localStorage.setItem(DB_KEY, JSON.stringify(db));
  } catch {
    /* quota — the server copy is authoritative anyway */
  }
}

/** Drop the offline cache (on sign-out, so the next user sees nothing stale). */
export function clearLocal(): void {
  try {
    localStorage.removeItem(DB_KEY);
  } catch {
    /* ignore */
  }
}

/** Guests send no credential at all; the Worker serves them anonymously. */
const auth = (cfg: SyncCfg): Record<string, string> =>
  cfg.guest || !cfg.password ? {} : { Authorization: 'Bearer ' + cfg.password };

export async function pullDb(cfg: SyncCfg): Promise<{ db: DB; version: number; role: AccessRole }> {
  const r = await fetch('/api/db', { headers: auth(cfg) });
  if (r.status === 401) throw new AuthError();
  if (!r.ok) throw new Error('pull failed: ' + r.status);
  const j = await r.json();
  return {
    db: normalizeDb(j.db),
    version: Number(j.version || 0),
    role: j.role === 'guest' ? 'guest' : 'member',
  };
}

/** Returns the new version. Throws ConflictError if `version` is stale. */
export async function pushDb(cfg: SyncCfg, db: DB, version: number): Promise<number> {
  const r = await fetch('/api/db', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', ...auth(cfg) },
    body: JSON.stringify({ db, version }),
  });
  if (r.status === 401) throw new AuthError();
  if (r.status === 403) throw new ReadOnlyError();
  if (r.status === 409) {
    const j = await r.json();
    throw new ConflictError(normalizeDb(j.db), Number(j.version || 0));
  }
  if (!r.ok) throw new Error('push failed: ' + r.status);
  const j = await r.json();
  return Number(j.version || 0);
}

// Bumped when the cached shape changes: rows used to be {make, unit, sell} and
// are now {values}, so an old cache would hand the table rows with no `values`
// at all. A versioned key retires it instead of crashing on it.
const PRICES_KEY = 'sabretooth-prices-v2';
const LEGACY_PRICES_KEYS = ['sabretooth-prices'];

/** Coerces one row from cache or the wire, whatever shape it arrived in. */
function normPrice(raw: unknown): Price | null {
  const x = (raw || {}) as Record<string, unknown>;
  const item = s(x.item).trim();
  if (!item) return null;

  const values: Record<string, string> = {};
  const bag = x.values && typeof x.values === 'object' ? (x.values as Record<string, unknown>) : {};
  for (const [k, v] of Object.entries(bag)) {
    const text = s(v).trim();
    if (k && text) values[k] = text;
  }

  return { tab: s(x.tab), category: s(x.category), item, values };
}

/** Last successful price pull, so the list renders instantly and survives offline. */
export function loadPrices(): { prices: Price[]; syncedAt: string } | null {
  try {
    for (const k of LEGACY_PRICES_KEYS) localStorage.removeItem(k);
    const c = JSON.parse(localStorage.getItem(PRICES_KEY) || 'null');
    if (!c || !Array.isArray(c.prices)) return null;
    const prices = c.prices.map(normPrice).filter((p: Price | null): p is Price => p !== null);
    return prices.length ? { prices, syncedAt: s(c.syncedAt) } : null;
  } catch {
    return null;
  }
}

/**
 * Pulls the market price list. The Worker proxies the Google Sheet, so this
 * works despite Google sending no CORS headers. `force` bypasses the edge cache.
 */
export async function fetchPrices(cfg: SyncCfg, force = false): Promise<{ prices: Price[]; syncedAt: string }> {
  const r = await fetch('/api/prices' + (force ? '?refresh=1' : ''), { headers: auth(cfg) });
  if (r.status === 401) throw new AuthError();
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(s(j.error) || 'Could not load prices (' + r.status + ').');

  const prices: Price[] = arr(j.prices)
    .map(normPrice)
    .filter((p): p is Price => p !== null);

  const out = { prices, syncedAt: s(j.syncedAt) || new Date().toISOString() };
  try {
    localStorage.setItem(PRICES_KEY, JSON.stringify(out));
  } catch {
    /* quota — the list just won't be cached */
  }
  return out;
}

/** Uploads a screenshot to R2 and returns the URL to store on the barrel. */
export async function uploadImage(cfg: SyncCfg, file: File): Promise<string> {
  const r = await fetch('/api/upload', {
    method: 'POST',
    headers: { 'Content-Type': file.type || 'application/octet-stream', ...auth(cfg) },
    body: file,
  });
  if (r.status === 401) throw new AuthError();
  if (r.status === 403) throw new ReadOnlyError();
  if (!r.ok) throw new Error('upload failed: ' + r.status);
  const j = await r.json();
  return String(j.url || '');
}

// ---------------------------------------------------------------------------
// Normalisation
//
// Guards against older records (collection targets used to be free-text strings
// like "40 iron ingots") and against anything malformed coming off the wire.
// ---------------------------------------------------------------------------

const s = (v: unknown, fallback = '') => (typeof v === 'string' ? v : fallback);
const n = (v: unknown, fallback = 0) => (Number.isFinite(Number(v)) ? Number(v) : fallback);
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

/** "40 iron ingots" -> { item: 'iron ingots', qty: 40 } */
function parseTarget(raw: unknown): CollectionTarget | null {
  if (raw && typeof raw === 'object') {
    const o = raw as Record<string, unknown>;
    const item = s(o.item).trim();
    return item ? { item, qty: Math.max(0, n(o.qty)) } : null;
  }
  const text = s(raw).trim();
  if (!text) return null;
  const m = /^(\d+)\s*[x×]?\s+(.*)$/.exec(text);
  if (m) return { item: m[2].trim(), qty: n(m[1]) };
  return { item: text, qty: 0 };
}

function normJob(raw: unknown): Job {
  const o = (raw || {}) as Record<string, unknown>;
  const status = s(o.status, 'open');
  return {
    id: s(o.id) || Math.random().toString(36).slice(2, 10),
    name: s(o.name, 'Untitled job'),
    client: s(o.client),
    contact: s(o.contact),
    faction: s(o.faction),
    tag: s(o.tag, 'Other'),
    priority: s(o.priority, 'Normal'),
    reward: n(o.reward),
    itemRewards: arr(o.itemRewards).map(parseTarget).filter((t): t is CollectionTarget => t !== null),
    description: s(o.description),
    postedBy: s(o.postedBy),
    postedAt: s(o.postedAt),
    deadline: s(o.deadline),
    status: (status === 'claimed' || status === 'done' ? status : 'open') as Job['status'],
    claimedBy: s(o.claimedBy),
    collection: !!o.collection,
    items: arr(o.items).map(parseTarget).filter((t): t is CollectionTarget => t !== null),
    entries: arr(o.entries).map((e): CollectionEntry => {
      const x = (e || {}) as Record<string, unknown>;
      return { by: s(x.by), item: s(x.item), qty: n(x.qty, 1), at: s(x.at) };
    }).filter((e) => e.item),
  };
}

export function normalizeDb(raw: unknown): DB {
  const o = (raw || {}) as Record<string, unknown>;
  return {
    members: arr(o.members).map((m): Member => {
      const x = (m || {}) as Record<string, unknown>;
      return {
        id: s(x.id) || Math.random().toString(36).slice(2, 10),
        name: s(x.name),
        role: s(x.role, 'Member'),
        joined: s(x.joined),
        log: arr(x.log).map((l): MemberEntry => {
          const y = (l || {}) as Record<string, unknown>;
          return {
            id: s(y.id) || Math.random().toString(36).slice(2, 10),
            kind: s(y.kind) === 'note' ? 'note' : 'credit',
            text: s(y.text), jobId: s(y.jobId), by: s(y.by), at: s(y.at),
          };
        }),
      };
    }).filter((m) => m.name),
    roles: arr(o.roles).map((r): Role => {
      const x = (r || {}) as Record<string, unknown>;
      return {
        id: s(x.id) || Math.random().toString(36).slice(2, 10),
        name: s(x.name), desc: s(x.desc),
        advanceAfter: Math.max(0, n(x.advanceAfter)),
        advanceTo: s(x.advanceTo),
      };
    }).filter((r) => r.name),
    jobs: arr(o.jobs).map(normJob),
    barrels: arr(o.barrels).map((b): Barrel => {
      const x = (b || {}) as Record<string, unknown>;
      return {
        id: s(x.id) || Math.random().toString(36).slice(2, 10),
        owner: s(x.owner), guildMember: x.guildMember !== false, paid: !!x.paid, rate: n(x.rate, 50),
        start: s(x.start), end: s(x.end), notes: s(x.notes), img: s(x.img), at: s(x.at),
      };
    }),
    dungeons: arr(o.dungeons).map((g): Dungeon => {
      const x = (g || {}) as Record<string, unknown>;
      return {
        id: s(x.id) || Math.random().toString(36).slice(2, 10),
        name: s(x.name), location: s(x.location),
        recommended: Math.max(0, n(x.recommended, 1)),
        difficulty: s(x.difficulty), notes: s(x.notes),
        imgs: arr(x.imgs).map((u) => s(u)).filter(Boolean),
        addedBy: s(x.addedBy), at: s(x.at),
      };
    }).filter((g) => g.name),
    ledger: arr(o.ledger).map((l): LedgerEntry => {
      const x = (l || {}) as Record<string, unknown>;
      return {
        id: s(x.id) || Math.random().toString(36).slice(2, 10),
        type: s(x.type) === 'expense' ? 'expense' : 'income',
        amount: n(x.amount), desc: s(x.desc), by: s(x.by), at: s(x.at),
      };
    }),
  };
}

/** Total collected per item name (case-insensitive), keyed by lowercased name. */
export function collectedByItem(job: Job): Map<string, number> {
  const m = new Map<string, number>();
  for (const e of job.entries) {
    const k = e.item.trim().toLowerCase();
    if (k) m.set(k, (m.get(k) || 0) + e.qty);
  }
  return m;
}
