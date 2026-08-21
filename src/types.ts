export type JobStatus = 'open' | 'claimed' | 'done';
export type LedgerType = 'income' | 'expense';
export type Theme = 'dark' | 'light';

/** One line on a collection job's shopping list: what to gather, and how many. */
export interface CollectionTarget {
  item: string;
  qty: number;
}

/** A member's turn-in against a collection job. */
export interface CollectionEntry {
  by: string;
  item: string;
  qty: number;
  at: string; // ISO date
}

export interface Job {
  id: string;
  name: string;
  client: string;
  contact: string;
  faction: string;
  tag: string;
  priority: string;
  reward: number;
  description: string;
  postedBy: string;
  postedAt: string;
  deadline: string;
  status: JobStatus;
  claimedBy: string;
  collection: boolean;
  items: CollectionTarget[];
  entries: CollectionEntry[];
}

export interface Barrel {
  id: string;
  owner: string;
  paid: boolean;
  rate: number; // septims per week
  start: string;
  end: string;
  notes: string;
  img: string; // R2 URL (/api/img/<key>), or a legacy data URL
  at: string;
}

export interface LedgerEntry {
  id: string;
  type: LedgerType;
  amount: number;
  desc: string;
  by: string;
  at: string;
}

export interface Member {
  id: string;
  role: string;
  name: string;
  joined: string;
}

export interface DB {
  members: Member[];
  jobs: Job[];
  barrels: Barrel[];
  ledger: LedgerEntry[];
}

/** Credentials for the shared guild database (the Worker's guild password). */
export interface SyncCfg {
  password: string;
}

export type SyncStatus = 'local' | 'syncing' | 'synced' | 'error' | 'denied';
