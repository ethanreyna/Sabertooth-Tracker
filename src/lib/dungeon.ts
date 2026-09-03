/** A dungeon's name, with its lit state spelled out at the end — the same
 *  suffix everywhere it's shown, so "Active" and "Disabled" always mean the
 *  same thing whether you're reading the map, the list, or a picker. */
export const dungeonLabel = (d: { name: string; active: boolean }): string =>
  `${d.name} (${d.active ? 'Active' : 'Disabled'})`;
