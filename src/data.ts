import { DEFAULT_GUILD_CUT_PCT } from './types';
import type { DB } from './types';

const d = (days: number) => new Date(Date.now() - days * 864e5).toISOString();
const f = (days: number) => new Date(Date.now() + days * 864e5).toISOString();

export const emptyDb = (): DB => ({ settings: { guildCutPct: DEFAULT_GUILD_CUT_PCT }, members: [], roles: [], jobs: [], barrels: [], dungeons: [], spots: [], ledger: [], bankItems: [], suggestions: [], items: [], enchants: [] });

/** Sensible starting ranks, offered when the roster has no roles yet. The
 *  Initiate -> Saberblooded track mirrors the guild's blooding process. */
export const STARTER_ROLES = [
  { name: 'Guildmaster', desc: 'Runs the guild, final say on contracts and payouts.', advanceAfter: 0, advanceTo: '' },
  { name: 'Quartermaster', desc: 'Keeps the stores, logs turn-ins, pays out rewards.', advanceAfter: 0, advanceTo: '' },
  { name: 'Veteran', desc: 'Trusted member cleared for high-priority contracts.', advanceAfter: 0, advanceTo: '' },
  { name: 'Saberblooded', desc: 'Full member — has completed their blooding.', advanceAfter: 0, advanceTo: '' },
  { name: 'Initiate', desc: 'New recruit. Complete three missions to become Saberblooded.', advanceAfter: 3, advanceTo: 'Saberblooded' },
];

/** Not wired into the app — kept for local testing. See emptyDb() for the real default. */
export const demoDb = (): DB => ({
  settings: { guildCutPct: DEFAULT_GUILD_CUT_PCT },
  members: [
    { id: 'm1', name: 'Zahir Alazar', role: 'Guildmaster', joined: d(120), log: [] },
    { id: 'm2', name: 'Karina', role: 'Quartermaster', joined: d(95), log: [] },
    { id: 'm3', name: 'Waxillius Scadrian', role: 'Saberblooded', joined: d(60), log: [] },
    { id: 'm4', name: 'Hide the Mute', role: 'Saberblooded', joined: d(41), log: [] },
    {
      id: 'm5', name: 'Soul in Sap', role: 'Initiate', joined: d(12),
      log: [
        { id: 'e1', kind: 'credit', text: 'Sabretooth Daily: Healing brews', jobId: '', by: 'Karina', at: d(4) },
        { id: 'e2', kind: 'credit', text: 'Escort to Riften', jobId: 'j2', by: 'Zahir Alazar', at: d(1) },
        { id: 'e3', kind: 'note', text: 'Keen tracker — pair with a veteran for the next bounty.', jobId: '', by: 'Karina', at: d(3) },
      ],
    },
  ],
  roles: STARTER_ROLES.map((r, i) => ({ id: `r${i + 1}`, ...r })),
  jobs: [
    {
      id: 'j1', name: 'Iron for the forge', client: 'Adrianne Avenicci',
      contact: 'Warmaiden’s, Whiterun — daytime', faction: 'Whiterun smiths',
      tag: 'Resource collection', priority: 'Normal',
      reward: 800,
      itemRewards: [{ item: 'Steel Ingot', qty: 5 }],
      description: 'The guild forge is running dry. Bring iron ingots to the quartermaster; payout split by contribution.',
      postedBy: 'Karina', postedAt: d(3), deadline: f(10), status: 'open', claimedBy: '',
      collection: true,
      items: [
        { item: 'Iron Ingot', qty: 40 },
        { item: 'Leather Strips', qty: 15 },
        { item: 'Charcoal', qty: 10 },
      ],
      entries: [
        { by: 'Waxillius Scadrian', item: 'Iron Ingot', qty: 12, at: d(2) },
        { by: 'Hide the Mute', item: 'Iron Ingot', qty: 8, at: d(1) },
        { by: 'Hide the Mute', item: 'Leather Strips', qty: 15, at: d(1) },
      ],
    },
    {
      id: 'j2', name: 'Escort to Riften', client: 'Maven’s courier',
      contact: 'Bee and Barb, ask for Talen', faction: 'None', tag: 'Escort', priority: 'High',
      reward: 1200, itemRewards: [],
      description: 'Escort a courier and strongbox from Whiterun stables to Riften. Two guards minimum, leave at dawn.',
      postedBy: 'Zahir Alazar', postedAt: d(1), deadline: f(4), status: 'claimed', claimedBy: 'Soul in Sap',
      collection: false, items: [], entries: [],
    },
    {
      id: 'j3', name: 'Bandit camp at Valtheim', client: 'Whiterun guard captain',
      contact: 'Dragonsreach barracks', faction: 'Whiterun guard', tag: 'Kill', priority: 'Urgent',
      reward: 2000, itemRewards: [{ item: 'Steel Shield', qty: 1 }],
      description: 'Clear the towers on the White River. Proof of completion required — report to the captain after.',
      postedBy: 'Zahir Alazar', postedAt: d(6), deadline: '', status: 'done', claimedBy: 'Karina',
      collection: false, items: [], entries: [],
    },
  ],
  barrels: [
    { id: 'b1', owner: 'Waxillius Scadrian', guildMember: true, paid: true, rate: 50, start: d(5), end: f(9), notes: 'Riverwood — behind the smithy, third barrel', img: '', at: d(5) },
    { id: 'b2', owner: 'Hide the Mute', guildMember: true, paid: false, rate: 50, start: d(2), end: f(12), notes: 'Whiterun — by the guild cellar door', img: '', at: d(2) },
  ],
  spots: [
    {
      id: 'sp1', name: 'Halted Stream iron veins', kind: 'Ore',
      location: 'Whiterun Hold — Halted Stream Camp, north of Whiterun',
      yield: '8 iron veins plus a transmute spell tome', respawn: 'every 10 days',
      x: '', y: '', mapUrl: '',
      notes: 'Bandit camp on top; clear it first. Mammoth skull altar behind.',
      imgs: [], addedBy: 'Karina', at: d(7),
    },
    {
      id: 'sp2', name: 'Whiterun plains elk', kind: 'Hunting',
      location: 'Whiterun Hold — the plains west of the city',
      yield: 'Elk hide, venison, antlers', respawn: 'roams',
      x: '', y: '', mapUrl: '',
      notes: 'Good bow practice. Watch for sabre cats near the watchtower.',
      imgs: [], addedBy: 'Waxillius Scadrian', at: d(4),
    },
  ],
  dungeons: [
    {
      id: 'dg1', name: 'Bleak Falls Barrow', location: 'Above Riverwood, up the mountain path',
      recommended: 2, difficulty: 'Moderate', x: '', y: '',
      notes: 'Draugr throughout, one Draugr Overlord at the end. Watch the swinging gate puzzle.',
      imgs: [], addedBy: 'Karina', at: d(9),
    },
    {
      id: 'dg2', name: 'Valtheim Towers', location: 'White River, east of Whiterun',
      recommended: 3, difficulty: 'Easy', x: '', y: '',
      notes: 'Bandits, archers on the bridge. Approach from the road side.',
      imgs: [], addedBy: 'Zahir Alazar', at: d(6),
    },
  ],
  ledger: [
    { id: 'l1', type: 'income', amount: 2000, desc: 'Bounty payout — Valtheim towers', by: 'Karina', at: d(1) },
    { id: 'l2', type: 'expense', amount: 450, desc: 'Forge coal and supplies', by: 'Karina', at: d(2) },
    { id: 'l3', type: 'income', amount: 100, desc: 'Barrel rent — Waxillius, 2 weeks', by: 'Zahir Alazar', at: d(4) },
    { id: 'l4', type: 'expense', amount: 600, desc: 'Guild hall repairs after the troll incident', by: 'Zahir Alazar', at: d(7) },
  ],
  bankItems: [
    { id: 'bi1', type: 'in', item: 'Iron Ingot', qty: 24, by: 'Karina', note: 'Left barrel, guild hall', at: d(3) },
    { id: 'bi2', type: 'out', item: 'Iron Ingot', qty: 6, by: 'Hide the Mute', note: 'Forging arrowheads', at: d(1) },
    { id: 'bi3', type: 'in', item: 'Health Potion', qty: 10, by: 'Soul in Sap', note: '', at: d(2) },
  ],
  suggestions: [],
  items: [],
  enchants: [],
});
