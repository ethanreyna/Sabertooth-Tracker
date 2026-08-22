import type { AccessRole, Barrel, CollectionEntry, CollectionTarget, DB, Job, LedgerEntry, Member, MemberEntry, Role, SyncCfg } from './types';

const CFG_KEY = 'sabertooth-auth';
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
    const c = JSON.parse(localStorage.getItem(CFG_KEY) || 'null');
    return c && typeof c.password === 'string' && c.password ? { password: c.password } : null;
  } catch {
    return null;
  }
}

export function saveCfg(cfg: SyncCfg | null): void {
  try {
    if (cfg) localStorage.setItem(CFG_KEY, JSON.stringify(cfg));
    else localStorage.removeItem(CFG_KEY);
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

const auth = (cfg: SyncCfg) => ({ Authorization: 'Bearer ' + cfg.password });

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
