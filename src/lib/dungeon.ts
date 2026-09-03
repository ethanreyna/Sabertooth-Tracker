import type { DungeonStatus } from '@/types';
import type { Tone } from '@/components/bits';

/** Every status, in the order it's offered — active first, since that's the
 *  common case; unknown last, since it's the one nobody's chosen on purpose. */
export const DUNGEON_STATUSES: DungeonStatus[] = ['active', 'disabled', 'unknown'];

export const STATUS_LABEL: Record<DungeonStatus, string> = {
  active: 'Active', disabled: 'Disabled', unknown: 'Unknown',
};

/** Matches the {@link Tone} palette already used for badges everywhere else,
 *  so a dungeon's status reads the same whether it's a badge or plain text. */
export const STATUS_TONE: Record<DungeonStatus, Tone> = {
  active: 'amber', disabled: 'neutral', unknown: 'blue',
};

/** A dungeon's name, with its status spelled out at the end — the same
 *  suffix everywhere it's shown, so "Active", "Disabled" and "Unknown" always
 *  mean the same thing whether you're reading the map, the list, or a picker. */
export const dungeonLabel = (d: { name: string; status: DungeonStatus }): string =>
  `${d.name} (${STATUS_LABEL[d.status]})`;

/**
 * How the map marker (and its small-map twin, {@link MapThumb}) is lit for
 * each status — Skyrim's own way of telling a cleared cave from an
 * unvisited one, borrowed here for "worth a trip" versus "known not to be."
 * `unknown` gets no glow either way; it isn't a claim, just an admission.
 */
export interface DungeonIconStyle {
  fill: string;
  stroke: string;
  /** A CSS `filter` value — glow for active, a plain drop-shadow otherwise. */
  glow: string;
  opacity: number;
}

const STYLE: Record<DungeonStatus, DungeonIconStyle> = {
  active: {
    fill: '#1c1006', stroke: '#f5b942', opacity: 1,
    glow: 'drop-shadow(0 0 5px rgba(245,185,66,.85)) drop-shadow(0 1px 2px rgba(0,0,0,.6))',
  },
  disabled: {
    fill: '#3f3f46', stroke: '#71717a', opacity: 0.62,
    glow: 'drop-shadow(0 1px 2px rgba(0,0,0,.5))',
  },
  unknown: {
    fill: '#1e293b', stroke: '#94a3b8', opacity: 0.85,
    glow: 'drop-shadow(0 1px 2px rgba(0,0,0,.5))',
  },
};

export const dungeonIconStyle = (status: DungeonStatus): DungeonIconStyle => STYLE[status];
