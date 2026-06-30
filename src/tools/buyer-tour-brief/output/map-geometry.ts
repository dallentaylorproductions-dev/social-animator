/**
 * Buyer Tour Brief — branded-map geometry (BUYER_TOUR_BRIEF).
 *
 * Pure projection from geocoded lat/lng points onto a fixed SVG viewBox. The map
 * is a BRANDED STYLIZED canvas (product decision #1): no live tiles, no pan/zoom,
 * zero per-load map cost, fully offline-safe. We only place numbered home pins +
 * a route line + the commute-anchor pin on a designed background.
 *
 * Pure + unit-testable: known coords → known pixel positions. North is up (lat is
 * flipped onto the y axis). Degenerate inputs (no points, one point, all-identical
 * coords) resolve to the centre, so the map never divides by zero or renders pins
 * off-canvas.
 */

import type { LatLng } from "../engine/types";

export interface MapPoint {
  /** Pixel x within the viewBox. */
  x: number;
  /** Pixel y within the viewBox. */
  y: number;
}

export interface ProjectedMap {
  width: number;
  height: number;
  /** Projected home pins, in tour order (parallel to the input order). */
  homes: MapPoint[];
  /** Projected commute anchor, when one was supplied with coordinates. */
  anchor?: MapPoint;
}

export interface ProjectInput {
  homes: Array<LatLng | null | undefined>;
  anchor?: LatLng | null;
  width?: number;
  height?: number;
  /** Inset from each edge so pins + their badges never clip. */
  padding?: number;
}

const DEFAULT_WIDTH = 320;
const DEFAULT_HEIGHT = 240;
const DEFAULT_PADDING = 36;

function isPoint(p: LatLng | null | undefined): p is LatLng {
  return (
    !!p &&
    typeof p.lat === "number" &&
    Number.isFinite(p.lat) &&
    typeof p.lng === "number" &&
    Number.isFinite(p.lng)
  );
}

/**
 * Project home + anchor coordinates into the viewBox. Homes without coordinates
 * project to `null` (the caller skips drawing that pin on the map but still shows
 * the card).
 *
 * The bounding box is computed from the HOMES ONLY, so the tour spreads to fill the
 * canvas. The commute anchor is usually far outside that box (a base / workplace
 * miles away); including it would squash every home into one corner (the v0 bug).
 * Instead the anchor is projected with the same transform and then CLAMPED to the
 * padded canvas edge, so it reads as a direction marker ("JBLM is that way") without
 * distorting the home spread — matching the mock, where the anchor is a small edge tag.
 */
export function projectTourMap(input: ProjectInput): {
  width: number;
  height: number;
  homes: Array<MapPoint | null>;
  anchor?: MapPoint;
} {
  const width = input.width ?? DEFAULT_WIDTH;
  const height = input.height ?? DEFAULT_HEIGHT;
  const padding = input.padding ?? DEFAULT_PADDING;

  const homePoints: LatLng[] = [];
  for (const h of input.homes) if (isPoint(h)) homePoints.push(h);
  const anchorValid = isPoint(input.anchor) ? input.anchor : undefined;

  const cx = (padding + (width - padding)) / 2;
  const cy = (padding + (height - padding)) / 2;

  if (homePoints.length === 0) {
    return {
      width,
      height,
      homes: input.homes.map(() => null),
      // With no home box to scale against we can't meaningfully place the anchor.
      anchor: undefined,
    };
  }

  let minLat = Infinity;
  let maxLat = -Infinity;
  let minLng = Infinity;
  let maxLng = -Infinity;
  for (const p of homePoints) {
    if (p.lat < minLat) minLat = p.lat;
    if (p.lat > maxLat) maxLat = p.lat;
    if (p.lng < minLng) minLng = p.lng;
    if (p.lng > maxLng) maxLng = p.lng;
  }

  const spanLat = maxLat - minLat;
  const spanLng = maxLng - minLng;
  // Single distinct home (or all-identical) → put it dead centre, not a corner.
  const single = spanLat === 0 && spanLng === 0;

  const clamp = (v: number, lo: number, hi: number) =>
    Math.max(lo, Math.min(hi, v));

  const project = (p: LatLng): MapPoint => {
    const fx = spanLng === 0 ? 0.5 : (p.lng - minLng) / spanLng;
    const fy = spanLat === 0 ? 0.5 : (p.lat - minLat) / spanLat;
    const x = padding + fx * (width - 2 * padding);
    // Flip lat so north is up: higher lat → smaller y.
    const y = padding + (1 - fy) * (height - 2 * padding);
    return { x, y };
  };

  let anchor: MapPoint | undefined;
  if (anchorValid) {
    if (single) {
      // No span to scale against — drop the anchor toward a bottom corner so it
      // still reads as "off in that direction" rather than sitting on the home.
      anchor = { x: padding, y: height - padding };
    } else {
      const raw = project(anchorValid);
      anchor = {
        x: clamp(raw.x, padding, width - padding),
        y: clamp(raw.y, padding, height - padding),
      };
    }
  }

  return {
    width,
    height,
    homes: input.homes.map((h) =>
      isPoint(h) ? (single ? { x: cx, y: cy } : project(h)) : null,
    ),
    anchor,
  };
}

/** Build an SVG polyline `points` string for the ordered home pins that have a
 *  projected position. Skips homes with no coordinate so the route never jumps to
 *  (0,0). Returns "" when fewer than two pins are placeable. */
export function routePolyline(homes: Array<MapPoint | null>): string {
  const placed = homes.filter((p): p is MapPoint => p !== null);
  if (placed.length < 2) return "";
  return placed.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
}
