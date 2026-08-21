export type JobStatus = 'open' | 'claimed' | 'done';
export type LedgerType = 'income' | 'expense';

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
  items: string[];
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
  img: string; // data URL of location screenshot
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
  name: string;
  role: string;
  joined: string;
}

export interface DB {
  members: Member[];
  jobs: Job[];
  barrels: Barrel[];
  ledger: LedgerEntry[];
}

export interface SyncCfg {
  binId: string;
  apiKey: string;
}

export type SyncStatus = 'local' | 'syncing' | 'synced' | 'error';
