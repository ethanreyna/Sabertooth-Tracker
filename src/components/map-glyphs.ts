/**
 * Marker glyphs in the spirit of Skyrim's own map icons: a filled silhouette
 * with a light outline, readable at 24px.
 *
 * These are originals, not the game's art. The per-hold crests (Whiterun's
 * horse, Markarth's ram, Solitude's wolf) are detailed heraldry that doesn't
 * survive being redrawn freehand at this size, so hold capitals share one
 * crenellated shield rather than getting nine muddy approximations. Drop the
 * real textures in and these can be swapped for them.
 */

/** 24x24 viewBox paths, keyed by the point kind they represent. */
export const GLYPH_PATHS: Record<string, string> = {
  // Crenellated shield — hold capitals.
  city: 'M4 3h2v2h2V3h2v2h2V3h2v2h2V3h2v9c0 5-4 8-9 10-5-2-9-5-9-10V3z',
  // Gabled house — settlements and villages.
  settlement: 'M12 2 2 11h3v11h6v-6h2v6h6V11h3z',
  // Cave mouth — anything you go into.
  dungeon: 'M12 2C6 2 3 7 3 13v8h5v-6a4 4 0 0 1 8 0v6h5v-8c0-6-3-11-9-11z',
  // Tall tower with battlements.
  tower: 'M7 2h2v2h2V2h2v2h2V2h2v6h-1v14H6V8H5V2h2zm3 8h4v6h-4z',
  // Squat keep.
  fort: 'M2 6h3v2h3V6h3v2h3V6h3v2h3v14H2V6zm7 9h6v7H9z',
  // Crossed picks — mines.
  mine: 'M4 3c5 0 9 4 9 9l-2 2c0-5-4-8-9-8V3zm16 0v3c-5 0-9 3-9 8l-2-2c0-5 4-9 9-9h2zM10 13l4 4-3 4-4-4z',
  // Anchor — docks and harbours.
  dock: 'M11 2h2v4h3v2h-3v9a6 6 0 0 0 5-5h2a8 8 0 0 1-16 0h2a6 6 0 0 0 5 5V8H8V6h3V2z',
  // Wheat sheaf — farms.
  farm: 'M11 22h2V9h-2v13zM12 2c2 2 2 5 0 7-2-2-2-5 0-7zM6 6c3 0 5 3 5 6-3 0-5-3-5-6zm12 0c0 3-2 6-5 6 0-3 2-6 5-6z',
  // Windmill.
  mill: 'M11 12h2v10h-2V12zm1-11 2 8h-4l2-8zM3 11l8 2v-4l-8 2zm18 0-8-2v4l8-2z',
  // Tent.
  camp: 'M12 2 22 22h-8l-2-6-2 6H2L12 2z',
  // Longship prow — shipwrecks.
  ship: 'M3 12h18l-2 7H6l-3-7zm6-8c3 1 4 3 4 6h-2c0-2-1-4-2-4V4z',
  // Tree — groves.
  grove: 'M11 22h2v-6h-2v6zM12 2l5 7h-3l4 6H6l4-6H7l5-7z',
  // Standing stone.
  stone: 'M9 22 7 6l5-4 5 4-2 16H9z',
};

/** Kinds that keep a plain coloured dot rather than a silhouette. */
const DOT_KINDS = new Set(['ore', 'hunting', 'alchemy', 'crafting', 'other', '']);

/** Synonyms, so a written-in kind still finds a sensible glyph. */
const ALIASES: Record<string, string> = {
  town: 'settlement', village: 'settlement', house: 'settlement', hold: 'city',
  capital: 'city', cave: 'dungeon', barrow: 'dungeon', tomb: 'dungeon',
  ruin: 'dungeon', ruins: 'dungeon', mines: 'mine', harbour: 'dock',
  harbor: 'dock', port: 'dock', watchtower: 'tower', 'lumber mill': 'mill',
  windmill: 'mill', shipwreck: 'ship', wreck: 'ship', 'standing stone': 'stone',
  shrine: 'stone', camps: 'camp',
};

/** The glyph for a kind, or null when it should render as a dot. */
export function glyphFor(kind: string): string | null {
  const k = kind.trim().toLowerCase();
  if (DOT_KINDS.has(k)) return null;
  const key = ALIASES[k] ?? k;
  return GLYPH_PATHS[key] ?? null;
}
