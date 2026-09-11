/**
 * Reads a pasted project brief — a stronghold expansion, a guild hall
 * addition, whatever gets planned as a wall of "Stage N:" and "Item: qty"
 * lines — into stages and requirements ready for review.
 *
 * No fixed template: a stage starts at a "STAGE 1:" line or at a heading that
 * mentions "STATION" (the flat-priced crafting-station list works the same
 * way structurally, just with no stage number), and every "Label: value" line
 * under it becomes a requirement until the next heading. A "TOTAL ..." line
 * starts a section that's skipped rather than parsed — it's a sum of the
 * stages above, not a stage of its own — so the same brief that lists a
 * project's stages and then repeats the grand total doesn't end up with the
 * total double-counted as one more requirement pile.
 */

export interface ParsedRequirement {
  item: string;
  qty: number;
  unit: string;
}

export interface ParsedStage {
  name: string;
  description: string;
  requirements: ParsedRequirement[];
}

export interface ParsedProject {
  name: string;
  stages: ParsedStage[];
}

const STAGE_RE = /^STAGE\s+\d+\s*:\s*(.+)$/i;
const STATION_RE = /STATION/i;
const TOTAL_RE = /^TOTAL\b/i;
/** "━━━━━", "----", "════" — pure divider lines, never content. */
const DIVIDER_RE = /^[━\-─_=]{3,}$/;
/** "(Upgraded heavy spiked timber palisade walls, …)" — a stage's blurb. */
const PAREN_RE = /^\(.*\)$/;
/** "Iron Ingots: 400", "Pelts (Wolf / Bear / Sabre): 40 (Any mix)". */
const REQUIREMENT_RE = /^([A-Za-z][A-Za-z0-9 /()&'".-]{1,60}):\s*(.+)$/;
// Must start on an actual digit — "LONGHOUSE, SETTLEMENT" has a comma but no
// digit, and [\d,]+ alone would still match that lone comma and read as a
// (zero-value) requirement rather than as the title line it is.
const NUMBER_RE = /\d[\d,]*(?:\.\d+)?/;

function parseRequirementLine(line: string): ParsedRequirement | null {
  const m = REQUIREMENT_RE.exec(line);
  if (!m) return null;
  const item = m[1].trim();
  if (TOTAL_RE.test(item)) return null;
  const value = m[2].trim();
  const numMatch = NUMBER_RE.exec(value);
  if (!numMatch) return null;
  const qty = Number(numMatch[0].replace(/,/g, ''));
  if (!Number.isFinite(qty) || qty <= 0) return null;
  const unit = (value.slice(0, numMatch.index) + value.slice(numMatch.index + numMatch[0].length)).trim();
  return { item, qty, unit };
}

/** A heading beginning a new stage — "STAGE 1: …" or a stations-style list —
 *  and the name it should carry. */
function stageHeading(line: string): string | null {
  const stage = STAGE_RE.exec(line);
  if (stage) return stage[1].trim();
  // A heading is a title, not a sentence — excluding anything ending like one
  // keeps "Crafting and utility stations follow standard pricing:" from being
  // read as a second, competing heading right under the real one.
  if (STATION_RE.test(line) && !REQUIREMENT_RE.test(line) && !/[:.]$/.test(line)) {
    // Drop a trailing "(FLAT GOLD PRICING)"-style qualifier; the heading
    // reads fine without repeating what every line under it already shows.
    return line.replace(/\s*\([^)]*\)\s*$/, '').trim();
  }
  return null;
}

export function parseProjectText(raw: string): ParsedProject {
  const lines = raw.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);

  let name = '';
  const stages: ParsedStage[] = [];
  let current: ParsedStage | null = null;
  let skipping = false;

  for (const line of lines) {
    if (DIVIDER_RE.test(line)) continue;

    const heading = stageHeading(line);
    if (heading) {
      current = { name: heading, description: '', requirements: [] };
      stages.push(current);
      skipping = false;
      continue;
    }

    if (TOTAL_RE.test(line)) {
      skipping = true;
      continue;
    }

    if (skipping) continue;

    if (!current) {
      // Content before the first heading is the project's own name — the
      // title line above "STAGE 1:", not a requirement or a stage.
      if (!name && !parseRequirementLine(line)) name = line;
      continue;
    }

    if (PAREN_RE.test(line) && current.requirements.length === 0 && !current.description) {
      current.description = line.slice(1, -1).trim();
      continue;
    }

    const req = parseRequirementLine(line);
    if (req) current.requirements.push(req);
    // Anything else — a blurb sentence like "Crafting and utility stations
    // follow standard flat-rate gold pricing:" — is prose, not a requirement,
    // and is dropped without ending the stage.
  }

  return { name, stages: stages.filter((st) => st.requirements.length > 0) };
}
