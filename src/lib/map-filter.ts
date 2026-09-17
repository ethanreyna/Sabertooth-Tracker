import { STATUS_LABEL } from '@/lib/dungeon';
import type { Dungeon, DungeonStatus, Spot } from '@/types';

/**
 * One lens on the map: what its chip says, and the text it matches against.
 * A typed filter is both at once. A legend click matches a bracketed token
 * instead, so "Ore" lights up the kind rather than every name with "ore" in
 * it — a shore or a moor isn't a vein.
 */
export interface MapFilter {
  label: string;
  term: string;
}

export const textFilter = (text: string): MapFilter => ({ label: text.trim(), term: text.trim() });

export const kindFilter = (kind: string): MapFilter =>
  ({ label: kind, term: `[kind:${kind.trim().toLowerCase()}]` });

export const statusFilter = (status: DungeonStatus): MapFilter =>
  ({ label: `Dungeon (${STATUS_LABEL[status]})`, term: `[status:${status}]` });

/** What a term is matched against: name, kind and location as written, plus
 *  the bracketed tokens the legend filters use. Case-folded. */
export const spotHay = (s: Spot) =>
  `${s.name} ${s.kind} ${s.location} [kind:${s.kind.trim()}]`.toLowerCase();
export const dungeonHay = (g: Dungeon) =>
  `${g.name} dungeon ${g.difficulty} ${g.location} [kind:dungeon] [status:${g.status}]`.toLowerCase();

/** OR across terms: a marker stays lit if any one filter matches it, so adding
 *  a second filter widens what's shown rather than narrowing it. */
export const matchesAny = (hay: string, terms: string[]) =>
  terms.some((t) => hay.includes(t.trim().toLowerCase()));
