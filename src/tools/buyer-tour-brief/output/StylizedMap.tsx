"use client";

/**
 * Buyer Tour Brief — the branded stylized map (BUYER_TOUR_BRIEF, v0.1 re-skin).
 *
 * A designed light "Buyer Day Map" canvas (per the approved mock) — NOT live Google
 * tiles, NO pan/zoom. A soft sage land base with decorative water / parks / roads,
 * numbered home pins on a dashed route, the commute anchor as an edge tag, and
 * per-pin factual layer markers. Projected from geocoded coordinates (map-geometry).
 *
 * Color rule (preserved through the re-skin):
 *   • TOUR THREAD = the agent brand `accent`: the route line + the numbered pins.
 *   • MAP LOGIC = the FIXED semantic palette (`LAYER_COLOR`): the layer markers (+
 *     the legend + chips in BuyerTourPage). Never tinted by the brand accent.
 *
 * Layer markers are FACTUAL annotations on each home pin (the home carries that
 * proximity chip), never a fabricated third-party location. Honest + Fair-Housing
 * clean. Motion uses `motion-safe:` so reduced-motion viewers get them statically.
 */

import type { ProximityCategory } from "../engine/types";
import type { PublicHome, PublicCommuteAnchor } from "./public-payload";
import { LAYER_LABELS } from "./copy";
import { projectTourMap, routePolyline } from "./map-geometry";
import { pickContrastText } from "@/tools/listing-flyer/engine/contrast";

/**
 * FIXED semantic map-logic palette (the legend). Owns the markers + legend + chips;
 * NEVER tinted with the brand accent (tinting would break the legend / collide with
 * the tour thread). Matches the mock's marker colors.
 */
export const LAYER_COLOR: Record<ProximityCategory, string> = {
  schools: "#3b82f6", // blue
  commute: "#c2703d", // terra
  parks: "#4e7d33", // green
  coffee: "#9a6b3f", // brown
  grocery: "#3e7d5a", // green (deeper, distinct from parks)
};

/** Default tour-thread accent when the agent has no brandAccent set. */
export const DEFAULT_TOUR_ACCENT = "#0e7c73";

/**
 * A short, dynamic display form of the agent's commute-anchor label for the map
 * tag — fixes the clip without hardcoding any place. Whole label if short, else
 * the first clean token (a multi-word destination collapses to its first word),
 * else a neutral "Commute". The label is always the tour's own anchor.
 */
export function shortAnchorLabel(label: string | undefined): string {
  const l = (label ?? "").trim();
  if (!l) return "Commute";
  if (l.length <= 12) return l;
  const first = l.split(/\s+/)[0];
  return first.length <= 12 ? first : first.slice(0, 12);
}

interface StylizedMapProps {
  homes: PublicHome[];
  anchor?: PublicCommuteAnchor;
  activeLayers: ReadonlySet<ProximityCategory>;
  highlightedStop: number | null;
  onPinTap: (stop: number) => void;
  /** The agent brand accent — owns the pins + route line (the tour thread). */
  accent: string;
}

const WIDTH = 400;
const HEIGHT = 360;

export function StylizedMap({
  homes,
  anchor,
  activeLayers,
  highlightedStop,
  onPinTap,
  accent,
}: StylizedMapProps) {
  const onAccent = pickContrastText(accent);
  const projected = projectTourMap({
    homes: homes.map((h) =>
      h.lat !== undefined && h.lng !== undefined
        ? { lat: h.lat, lng: h.lng }
        : null,
    ),
    anchor:
      anchor && anchor.lat !== undefined && anchor.lng !== undefined
        ? { lat: anchor.lat, lng: anchor.lng }
        : null,
    width: WIDTH,
    height: HEIGHT,
    padding: 40,
  });

  const polyline = routePolyline(projected.homes);

  return (
    <div
      className="relative w-full overflow-hidden"
      style={{ aspectRatio: "1 / 0.9", background: "#EAF0E8" }}
      data-testid="btb-map"
    >
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        className="absolute inset-0 block h-full w-full"
        role="img"
        aria-label="Stylized map of your tour route"
      >
        <defs>
          <filter id="btb-pin-shadow" x="-50%" y="-50%" width="200%" height="200%">
            <feDropShadow
              dx="0"
              dy="1.5"
              stdDeviation="2"
              floodColor="#16211F"
              floodOpacity="0.28"
            />
          </filter>
        </defs>

        {/* Decorative geographic base — water, parks, roads. Not brand, not data. */}
        <rect x="0" y="0" width={WIDTH} height={HEIGHT} fill="#EAF0E8" />
        <path
          d="M0,250 Q70,232 110,252 T200,268 Q160,300 0,300 Z"
          fill="#D3E3EA"
        />
        <ellipse cx="305" cy="78" rx="52" ry="34" fill="#D9E7CC" />
        <ellipse cx="70" cy="138" rx="40" ry="30" fill="#D9E7CC" />
        <g stroke="#FFFFFF" strokeWidth="8" fill="none" strokeLinecap="round">
          <path d="M-10,190 H410" />
          <path d="M150,-10 V370" />
          <path d="M40,36 Q205,110 382,62" />
          <path d="M28,278 Q205,232 392,280" />
        </g>

        {/* Route line through the ordered home pins — TOUR THREAD = accent. */}
        {polyline && (
          <polyline
            points={polyline}
            fill="none"
            stroke={accent}
            strokeWidth="3"
            strokeDasharray="0.5 7"
            strokeLinecap="round"
            opacity="0.85"
            data-testid="btb-map-route"
          />
        )}

        {/* Commute anchor — terra (fixed) edge tag, clamped into view by geometry.
            Label is dynamic + width-fit so it never clips. */}
        {projected.anchor &&
          (() => {
            const tag = shortAnchorLabel(anchor?.label);
            const w = Math.max(48, tag.length * 6.5 + 18);
            return (
              <g
                transform={`translate(${projected.anchor.x}, ${projected.anchor.y})`}
                data-testid="btb-map-anchor"
              >
                <rect
                  x={-w / 2}
                  y="-12"
                  width={w}
                  height="24"
                  rx="7"
                  fill={LAYER_COLOR.commute}
                />
                <text
                  textAnchor="middle"
                  dominantBaseline="central"
                  fontSize="10"
                  fontWeight="700"
                  letterSpacing="0.02em"
                  fill="#ffffff"
                >
                  {tag}
                </text>
              </g>
            );
          })()}

        {/* Home pins + their active-layer annotation markers. */}
        {projected.homes.map((pt, i) => {
          if (!pt) return null;
          const home = homes[i];
          const stop = home.stop;
          const isActive = highlightedStop === stop;
          const homeLayers = Array.from(
            new Set(home.proximity.map((c) => c.category)),
          ).filter((c) => activeLayers.has(c));
          return (
            <g
              key={stop}
              transform={`translate(${pt.x}, ${pt.y})`}
              data-testid={`btb-map-pin-${stop}`}
            >
              {isActive && (
                <circle
                  r="24"
                  fill={accent}
                  opacity="0.16"
                  data-testid={`btb-map-pin-${stop}-halo`}
                />
              )}
              {homeLayers.map((cat, j) => {
                const angle = (-90 + j * 40) * (Math.PI / 180);
                const r = 22;
                return (
                  <circle
                    key={cat}
                    cx={Math.cos(angle) * r}
                    cy={Math.sin(angle) * r}
                    r="4.5"
                    fill={LAYER_COLOR[cat]}
                    stroke="#ffffff"
                    strokeWidth="1.5"
                    className="motion-safe:transition-opacity"
                    data-testid={`btb-map-marker-${stop}-${cat}`}
                  >
                    <title>{LAYER_LABELS[cat]}</title>
                  </circle>
                );
              })}
              <circle
                r="16"
                fill={accent}
                stroke="#ffffff"
                strokeWidth="3"
                filter="url(#btb-pin-shadow)"
                className="motion-safe:transition-colors"
              />
              <text
                textAnchor="middle"
                dominantBaseline="central"
                fontSize="13"
                fontWeight="700"
                fill={onAccent}
              >
                {stop}
              </text>
            </g>
          );
        })}
      </svg>

      {/* Real, ≥44px tappable hit targets over each pin (criterion 3 + 5). */}
      {projected.homes.map((pt, i) => {
        if (!pt) return null;
        const stop = homes[i].stop;
        return (
          <button
            key={stop}
            type="button"
            onClick={() => onPinTap(stop)}
            aria-label={`Jump to home ${stop}`}
            data-testid={`btb-map-pinbtn-${stop}`}
            className="absolute -translate-x-1/2 -translate-y-1/2 rounded-full"
            style={{
              left: `${(pt.x / WIDTH) * 100}%`,
              top: `${(pt.y / HEIGHT) * 100}%`,
              width: 44,
              height: 44,
            }}
          />
        );
      })}
    </div>
  );
}
