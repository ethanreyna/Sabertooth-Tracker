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
  /** Skyrim world coordinates, blank when nobody has placed it yet. */
  x: string;
  y: string;
  notes: string;
  imgs: string[]; // map screenshots (R2 URLs)
  addedBy: string;
  at: string;
}

/** A point of interest: ore veins, hunting grounds, ingredient patches, and so
 *  on. The DB key stays `spots` for compatibility with existing records; the UI
 *  calls this Points of Interest. */
export interface Spot {
  id: string;
  name: string;
  kind: string; // Ore, Hunting, Alchemy, Fishing, Wood, …
  location: string;
  yield: string; // what it gives, e.g. "3-4 iron veins"
  respawn: string; // e.g. "10 days"
  /** Skyrim world coordinates, as strings so "not recorded" is just empty.
   *  Used to build a UESP map link. */
  x: string;
  y: string;
  mapUrl: string; // a link pasted from keizaal.com/map pointing at this place
  notes: string;
  imgs: string[]; // screenshots (R2 URLs)
  addedBy: string;
  at: string;
}

/** Offered as suggestions; members can write in anything, and the page's tabs
 *  are built from whatever kinds actually exist. */
export const SPOT_KINDS = [
  'Ore', 'Hunting', 'Alchemy', 'Fishing', 'Wood',
  'City', 'Settlement', 'Dungeon', 'Tower', 'Fort', 'Mine', 'Dock', 'Farm', 'Mill',
  'Camp', 'Grove', 'Stone', 'Other',
];

export interface LedgerEntry {
  id: string;
  type: LedgerType;
  amount: number;
  desc: string;
  by: string;
  at: string;
}

/** A deposit into, or withdrawal from, the guild's item store. */
export interface BankItem {
  id: string;
  type: 'in' | 'out';
  item: string;
  qty: number;
  by: string;
  note: string;
  at: string;
}

export type SuggestionKind = 'job' | 'ledger' | 'bankItem';
export type SuggestionStatus = 'pending' | 'approved' | 'denied';

/**
 * Something a guest has proposed. Guests can append these through a dedicated
 * endpoint but cannot edit anything else, so a suggestion is a request rather
 * than a change: a member has to approve it before it becomes a real record.
 */
export interface Suggestion {
  id: string;
  kind: SuggestionKind;
  /** The proposed record's fields, shaped by `kind`. */
  payload: Record<string, string | number>;
  by: string;
  note: string;
  at: string;
  status: SuggestionStatus;
  decidedBy: string;
  decidedAt: string;
}

/** An item the guild knows about. The built-in catalogue in items.ts covers the
 *  common Skyrim records; these are the guild's own additions, kept in the
 *  database so everyone's pickers offer the same list. */
export interface ItemRecord {
  id: string;
  name: string;
  category: string;
  notes: string;
  addedBy: string;
  at: string;
}

/** Offered when adding an item. Free text is allowed â the tabs on the item
 *  list are built from whatever categories actually exist. */
export const ITEM_CATEGORIES = [
  'Ore', 'Ingot', 'Leather', 'Wood', 'Alchemy', 'Food', 'Drink', 'Potion',
  'Soul Gem', 'Weapon', 'Armour', 'Clothing', 'Jewellery', 'Book', 'Misc',
];

/** One thing picked up on the current dungeon run. */
export interface RunEntry {
  id: string;
  kind: 'gold' | 'item';
  /** Blank for gold. */
  item: string;
  /** Septims for gold, a count for items. */
  qty: number;
  by: string;
  at: string;
}

/**
 * The dungeon run in progress. There is exactly one, shared by the whole guild:
 * everyone adds to the same pile as they go and watches the split move, which
 * is the point — a party doesn't want a record of runs, it wants to know what
 * each person is owed right now.
 */
export interface DungeonRun {
  /** False when no run is going, which is what an empty tracker means. */
  active: boolean;
  /** Which dungeon, if anyone said. */
  name: string;
  /** How many ways the loot splits. */
  people: number;
  /** Who is on it, when the party bothered to name themselves. */
  party: string[];
  entries: RunEntry[];
  startedBy: string;
  startedAt: string;
}

export const emptyRun = (): DungeonRun => ({
  active: false, name: '', people: 1, party: [], entries: [], startedBy: '', startedAt: '',
});

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
  bankItems: BankItem[];
  suggestions: Suggestion[];
  items: ItemRecord[];
  run: DungeonRun;
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
