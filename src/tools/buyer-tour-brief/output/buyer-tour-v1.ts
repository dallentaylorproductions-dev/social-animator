/**
 * Buyer Tour Brief V1 "context hub" — PURE derivation helpers (BUYER_TOUR_BRIEF_V1).
 *
 * No I/O, no React — just turns the existing public payload into the Quick Read + the
 * comparison spine, so both are fully unit-testable. Everything is DERIVED from data
 * already in the payload (proximity chips + home facts + the enabled priorities); V1
 * adds no required agent input.
 *
 * FAIR HOUSING: this compares FACTUAL proximity + size only. It marks the "strongest
 * match PER PRIORITY" (the closest/shortest/most on THAT axis) — never an overall
 * "best" home, and never a school or neighborhood rating/ranking.
 */

import type { ProximityCategory } from "../engine/types";
import type {
  BuyerTourPublicPayload,
  PublicHome,
  PublicProximityChip,
} from "./public-payload";

/** 1-based stop → tour letter (1→A, 2→B …). Identity, not a quality rank. */
export function stopLetter(stop: number): string {
  return stop >= 1 && stop <= 26 ? String.fromCharCode(64 + stop) : String(stop);
}

/**
 * Fixed semantic axis palette — MUST match `LAYER_COLOR` in StylizedMap (the two-color
 * rule: map logic owns this palette, never the brand accent). Kept as literals here so
 * the pure module stays free of the client map component. `size` is not a map layer, so
 * it gets a neutral ink dot.
 */
export const AXIS_COLOR: Record<string, string> = {
  commute: "#c2703d",
  schools: "#3b82f6",
  parks: "#4e7d33",
  coffee: "#9a6b3f",
  grocery: "#3e7d5a",
  size: "#7c8a86",
};

/** A comparison axis is either a proximity category or the derived "size" axis. */
export type ComparisonAxisKey = ProximityCategory | "size";

/** Full axis label shown on a comparison row. */
const AXIS_LABEL: Record<ComparisonAxisKey, string> = {
  commute: "Commute",
  schools: "School proximity",
  parks: "Parks nearby",
  coffee: "Walkable coffee",
  grocery: "Grocery nearby",
  size: "Home size",
};

/** Short Quick-Read clause per axis (the leader on that axis). */
const QUICK_READ_LABEL: Record<ComparisonAxisKey, string> = {
  commute: "Shortest commute",
  schools: "Closest to a school",
  parks: "Closest to a park",
  coffee: "Closest to coffee",
  grocery: "Closest to grocery",
  size: "Most space",
};

/** The "strongest match" badge word per axis. */
const AXIS_TAG: Record<ComparisonAxisKey, string> = {
  commute: "shortest",
  schools: "closest",
  parks: "closest",
  coffee: "closest",
  grocery: "closest",
  size: "most space",
};

/** Distance categories rank by miles (lower = better); commute by minutes; size by sqft (higher = better). */
const DISTANCE_CATEGORIES: ReadonlySet<ProximityCategory> = new Set([
  "schools",
  "parks",
  "coffee",
  "grocery",
]);

/** Parse a distance chip value ("0.4 mi", "<0.1 mi", "1.2 mi") → miles, or null. */
export function parseMiles(value: string | undefined | null): number | null {
  if (typeof value !== "string") return null;
  if (/<\s*0?\.1/.test(value)) return 0.09; // "<0.1 mi" → nearer than 0.1, checked first
  const m = value.match(/(\d+(?:\.\d+)?)\s*mi\b/i);
  if (m) return parseFloat(m[1]);
  return null;
}

/** Parse a commute chip value ("18 min drive", "1 hr 5 min drive", "1 hr drive") → minutes, or null. */
export function parseMinutes(value: string | undefined | null): number | null {
  if (typeof value !== "string") return null;
  let total = 0;
  let matched = false;
  const hr = value.match(/(\d+)\s*hr/i);
  if (hr) {
    total += parseInt(hr[1], 10) * 60;
    matched = true;
  }
  const min = value.match(/(\d+)\s*min/i);
  if (min) {
    total += parseInt(min[1], 10);
    matched = true;
  }
  return matched ? total : null;
}

/** The chip list to compare against — the full set when present, else the capped card set. */
function homeChips(home: PublicHome): PublicProximityChip[] {
  const all = (home as { proximityAll?: PublicProximityChip[] }).proximityAll;
  if (Array.isArray(all) && all.length > 0) return all;
  return Array.isArray(home.proximity) ? home.proximity : [];
}

/** The comparable numeric for a home on an axis (lower-is-better unless size). null = no data. */
function axisNumeric(home: PublicHome, axis: ComparisonAxisKey): number | null {
  if (axis === "size") {
    return typeof home.sqft === "number" && Number.isFinite(home.sqft) ? home.sqft : null;
  }
  const chip = homeChips(home).find((c) => c.category === axis);
  if (!chip) return null;
  if (axis === "commute") return parseMinutes(chip.value);
  return parseMiles(chip.value);
}

/** The buyer-facing display value for a home on an axis. null = no data. */
function axisDisplay(home: PublicHome, axis: ComparisonAxisKey): string | null {
  if (axis === "size") {
    return typeof home.sqft === "number" && Number.isFinite(home.sqft)
      ? `${home.sqft.toLocaleString("en-US")} sqft`
      : null;
  }
  const chip = homeChips(home).find((c) => c.category === axis);
  const v = chip?.value?.trim();
  return v && v.length > 0 ? v : null;
}

export interface ComparisonHomeCell {
  stop: number;
  letter: string;
  /** The verbatim display value ("18 min", "0.3 mi", "2,540 sqft"), or null if no data. */
  value: string | null;
  /** True for the single strongest match on this axis. */
  isBest: boolean;
}

export interface ComparisonAxis {
  key: ComparisonAxisKey;
  label: string;
  color: string;
  /** Best-match badge word ("closest" / "shortest" / "most space"). */
  tag: string;
  /** One cell per home, in tour order. */
  cells: ComparisonHomeCell[];
  /** The winning stop on this axis. */
  bestStop: number;
}

/**
 * Build the comparison axes: one row per ENABLED priority category that has comparable
 * data across ≥2 homes, plus a "size" row when every home reports sqft. Each row marks
 * the single strongest match on that axis (min distance/time, or max size). An axis with
 * fewer than two comparable homes is omitted (nothing to compare — graceful).
 */
export function deriveComparison(payload: BuyerTourPublicPayload): ComparisonAxis[] {
  const homes = Array.isArray(payload.homes) ? payload.homes : [];
  if (homes.length < 2) return [];

  const axisKeys: ComparisonAxisKey[] = [
    ...(Array.isArray(payload.priorities) ? payload.priorities : []),
  ];
  // Append the size axis after the priority categories.
  axisKeys.push("size");

  const axes: ComparisonAxis[] = [];
  for (const key of axisKeys) {
    const numerics = homes.map((h) => axisNumeric(h, key));
    const eligible = numerics.filter((n): n is number => n !== null);
    if (eligible.length < 2) continue; // not enough to compare → omit

    const higherIsBetter = key === "size";
    let bestVal = higherIsBetter ? -Infinity : Infinity;
    for (const n of eligible) {
      if (higherIsBetter ? n > bestVal : n < bestVal) bestVal = n;
    }
    // Single winner: the earliest home reaching the best value.
    let bestIndex = -1;
    for (let i = 0; i < homes.length; i++) {
      if (numerics[i] === bestVal) {
        bestIndex = i;
        break;
      }
    }

    const cells: ComparisonHomeCell[] = homes.map((h, i) => ({
      stop: h.stop,
      letter: stopLetter(h.stop),
      value: axisDisplay(h, key),
      isBest: i === bestIndex,
    }));

    axes.push({
      key,
      label: AXIS_LABEL[key],
      color: AXIS_COLOR[key] ?? AXIS_COLOR.size,
      tag: AXIS_TAG[key],
      cells,
      bestStop: homes[bestIndex].stop,
    });
  }
  return axes;
}

export interface QuickReadClause {
  key: ComparisonAxisKey;
  label: string;
  color: string;
  /** The leading home's letter for this axis. */
  letter: string;
  stop: number;
}

/**
 * The Quick Read: one plain-English clause per comparison axis naming its leader
 * ("Shortest commute → C"), capped so it lands in ~3 seconds. Derived straight from the
 * comparison, so it can never disagree with the rows beneath it. Empty when nothing is
 * comparable (the block is omitted gracefully).
 */
export function deriveQuickRead(
  payload: BuyerTourPublicPayload,
  max = 4,
): QuickReadClause[] {
  const axes = deriveComparison(payload);
  return axes.slice(0, max).map((axis) => ({
    key: axis.key,
    label: QUICK_READ_LABEL[axis.key],
    color: axis.color,
    letter: stopLetter(axis.bestStop),
    stop: axis.bestStop,
  }));
}
