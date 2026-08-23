export type JobStatus = 'open' | 'claimed' | 'done';
export type LedgerType = 'income' | 'expense';
export type Theme = 'dark' | 'light';

/** One line on a collection job's shopping list: what to gather, and how many.
 *  Also used for item rewards, which have the same shape. */
export interface CollectionTarget {
  item: string;
  qty: number;
}

/** A guild rank that can be assigned to roster members. */
export interface Role {
  id: string;
  name: string;
  desc: string;
  /** Credits needed to advance out of this role. 0 = no progression track. */
  advanceAfter: number;
  /** Role name a member moves into once advanceAfter is met. */
  advanceTo: string;
}

/** A line on a member's record: either a completion that counts toward
 *  advancement, or a plain note. Mirrors how blooding is tracked in Discord. */
export interface MemberEntry {
  id: string;
  kind: 'credit' | 'note';
  text: string;
  jobId: string; // optional link to the job it came from
  by: string; // who logged it
  at: string;
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
  reward: number; // septims
  itemRewards: CollectionTarget[];
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

/** A storage container (barrel/chest) the guild is tracking. The DB key stays
 *  `barrels` for compatibility with existing records; the UI calls it Storage. */
export interface Barrel {
  id: string;
  owner: string;
  guildMember: boolean;
  paid: boolean;
  rate: number; // septims per week
  start: string;
  end: string;
  notes: string;
  img: string; // R2 URL (/api/img/<key>), or a legacy data URL
  at: string;
}

/** A dungeon the guild has scouted: where it is, and what it takes to clear. */
export interface Dungeon {
  id: string;
  name: string;
  location: string;
  recommended: number; // suggested party size
  difficulty: string;
  notes: string;
  imgs: string[]; // map screenshots (R2 URLs)
  addedBy: string;
  at: string;
}

/** A gathering spot: ore veins, hunting grounds, ingredient patches and so on. */
export interface Spot {
  id: string;
  name: string;
  kind: string; // Ore, Hunting, Alchemy, Fishing, Wood, …
  location: string;
  yield: string; // what it gives, e.g. "3-4 iron veins"
  respawn: string; // e.g. "10 days"
  notes: string;
  imgs: string[]; // map screenshots (R2 URLs)
  addedBy: string;
  at: string;
}

/** Offered as suggestions; members can write in anything, and the page's tabs
 *  are built from whatever kinds actually exist. */
export const SPOT_KINDS = ['Ore', 'Hunting', 'Alchemy', 'Fishing', 'Wood', 'Other'];

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
  log: MemberEntry[];
}

/** Guild-wide settings, editable from the guild database dialog. */
export interface Settings {
  /** Percent of a job's septim reward the guild keeps. 0-100. */
  guildCutPct: number;
}

export const DEFAULT_GUILD_CUT_PCT = 20;

export interface DB {
  settings: Settings;
  members: Member[];
  roles: Role[];
  jobs: Job[];
  barrels: Barrel[];
  dungeons: Dungeon[];
  spots: Spot[];
  ledger: LedgerEntry[];
}

/** One row of the market price list, mirrored from the guild's Google Sheet.
 *  Columns vary per tab, so values are a label->text map rather than fixed
 *  fields, and stay strings because the sheet mixes numbers with "N/A" and "-". */
export interface Price {
  tab: string;
  category: string;
  item: string;
  values: Record<string, string>;
}

/** How this browser is talking to the guild database. A guest session carries
 *  no password and is served anonymously, read-only. */
export interface SyncCfg {
  password: string;
  guest: boolean;
}

/** What the server says this password is allowed to do. Guests are read-only,
 *  enforced by the Worker rather than just hidden in the UI. */
export type AccessRole = 'member' | 'guest';

export type SyncStatus = 'local' | 'syncing' | 'synced' | 'error' | 'denied';
