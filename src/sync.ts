import type { DB, SyncCfg } from './types';

const API = 'https://api.jsonbin.io/v3/b/';
const CFG_KEY = 'keizaal-sync';
const DB_KEY = 'keizaal-db';

export function loadCfg(): SyncCfg | null {
  try {
    const c = JSON.parse(localStorage.getItem(CFG_KEY) || 'null');
    return c && c.binId ? c : null;
  } catch {
    return null;
  }
}

export function saveCfg(cfg: SyncCfg | null): void {
  localStorage.setItem(CFG_KEY, JSON.stringify(cfg));
}

export function loadLocal(): DB | null {
  try {
    const d = JSON.parse(localStorage.getItem(DB_KEY) || 'null');
    return d && d.jobs ? d : null;
  } catch {
    return null;
  }
}

export function saveLocal(db: DB): void {
  localStorage.setItem(DB_KEY, JSON.stringify(db));
}

export async function pullDb(cfg: SyncCfg): Promise<DB | null> {
  const r = await fetch(API + cfg.binId + '/latest', {
    headers: cfg.apiKey ? { 'X-Master-Key': cfg.apiKey } : {},
  });
  if (!r.ok) throw new Error('pull failed: ' + r.status);
  const j = await r.json();
  return j.record && j.record.jobs ? (j.record as DB) : null;
}

export async function pushDb(cfg: SyncCfg, db: DB): Promise<void> {
  const r = await fetch(API + cfg.binId, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', ...(cfg.apiKey ? { 'X-Master-Key': cfg.apiKey } : {}) },
    body: JSON.stringify(db),
  });
  if (!r.ok) throw new Error('push failed: ' + r.status);
}
