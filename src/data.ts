import type { DB } from './types';

const d = (days: number) => new Date(Date.now() - days * 864e5).toISOString();
const f = (days: number) => new Date(Date.now() + days * 864e5).toISOString();

export const emptyDb = (): DB => ({ members: [], jobs: [], barrels: [], ledger: [] });

export const demoDb = (): DB => ({
  members: [
    { id: 'm1', name: 'Zahir Alazar', role: 'Guildmaster', joined: d(120) },
    { id: 'm2', name: 'Karina', role: 'Quartermaster', joined: d(95) },
    { id: 'm3', name: 'Waxillius Scadrian', role: 'Member', joined: d(60) },
    { id: 'm4', name: 'Hide the Mute', role: 'Member', joined: d(41) },
    { id: 'm5', name: 'Soul in Sap', role: 'Member', joined: d(12) },
  ],
  jobs: [
    {
      id: 'j1', name: 'Iron for the forge', client: 'Adrianne Avenicci',
      contact: 'Warmaiden’s, Whiterun — daytime', faction: 'Whiterun smiths',
      tag: 'Resource collection', priority: 'Normal', reward: 800,
      description: 'The guild forge is running dry. Bring iron ingots to the quartermaster; payout split by contribution once we hit the target.',
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
      contact: 'Bee and Barb, ask for Talen', faction: 'None', tag: 'Escort', priority: 'High', reward: 1200,
      description: 'Escort a courier and strongbox from Whiterun stables to Riften. Two guards minimum, leave at dawn.',
      postedBy: 'Zahir Alazar', postedAt: d(1), deadline: f(4), status: 'claimed', claimedBy: 'Soul in Sap',
      collection: false, items: [], entries: [],
    },
    {
      id: 'j3', name: 'Bandit camp at Valtheim', client: 'Whiterun guard captain',
      contact: 'Dragonsreach barracks', faction: 'Whiterun guard', tag: 'Kill', priority: 'Urgent', reward: 2000,
      description: 'Clear the towers on the White River. Proof of completion required — report to the captain after.',
      postedBy: 'Zahir Alazar', postedAt: d(6), deadline: '', status: 'done', claimedBy: 'Karina',
      collection: false, items: [], entries: [],
    },
    {
      id: 'j4', name: 'Alchemy stock for the infirmary', client: 'Guild infirmary',
      contact: 'Karina, guild hall', faction: '', tag: 'Resource collection', priority: 'Low', reward: 600,
      description: 'Restocking healing supplies before the next contract. Any quantity helps.',
      postedBy: 'Karina', postedAt: d(5), deadline: f(20), status: 'open', claimedBy: '',
      collection: true,
      items: [
        { item: 'Blue Mountain Flower', qty: 25 },
        { item: 'Wheat', qty: 25 },
        { item: 'Deathbell', qty: 8 },
      ],
      entries: [
        { by: 'Soul in Sap', item: 'Blue Mountain Flower', qty: 9, at: d(3) },
        { by: 'Karina', item: 'Deathbell', qty: 8, at: d(4) },
      ],
    },
  ],
  barrels: [
    { id: 'b1', owner: 'Waxillius Scadrian', paid: true, rate: 50, start: d(5), end: f(9), notes: 'Riverwood — behind the smithy, third barrel', img: '', at: d(5) },
    { id: 'b2', owner: 'Hide the Mute', paid: false, rate: 50, start: d(2), end: f(12), notes: 'Whiterun — by the guild cellar door', img: '', at: d(2) },
  ],
  ledger: [
    { id: 'l1', type: 'income', amount: 2000, desc: 'Bounty payout — Valtheim towers', by: 'Karina', at: d(1) },
    { id: 'l2', type: 'expense', amount: 450, desc: 'Forge coal and supplies', by: 'Karina', at: d(2) },
    { id: 'l3', type: 'income', amount: 100, desc: 'Barrel rent — Waxillius, 2 weeks', by: 'Zahir Alazar', at: d(4) },
    { id: 'l4', type: 'expense', amount: 600, desc: 'Guild hall repairs after the troll incident', by: 'Zahir Alazar', at: d(7) },
  ],
});
