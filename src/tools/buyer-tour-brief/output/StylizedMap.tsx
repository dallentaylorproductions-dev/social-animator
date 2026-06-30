"use client";

/**
 * Buyer Tour Brief — the branded stylized map (BUYER_TOUR_BRIEF, decision #1).
 *
 * A designed SVG canvas — NOT live Google tiles, NO pan/zoom. Numbered home pins
 * on a route line, plus the single commute-anchor pin, projected from geocoded
 * coordinates (see map-geometry.ts). Layer markers are FACTUAL annotations on each
 * home pin: when a layer is active, a small dot appears on the pins of the homes
 * that carry that proximity chip — it reflects which homes have that factual layer,
 * never a fabricated third-party location. Honest by construction + Fair-Housing-clean.
 *
 * Interactions wired by the parent (BuyerTourPage):
 *   • Tapping a pin calls `onPinTap(stop)` → parent scrolls to + highlights the card.
 *   • Active layers drive which annotation dots show.
 *
 * Motion: layer markers + the active-pin ring use `motion-safe:` transitions, so a
 * `prefers-reduced-motion` viewer gets them statically (no scale/transition) per
 * acceptance criterion 6.
 */

import type { ProximityCategory } from "../engine/types";
import type { PublicHome, PublicCommuteAnchor } from "./public-payload";
import { LAYER_LABELS } from "./copy";
import { projectTourMap, routePolyline } from "./map-geometry";

/**
 * FIXED semantic map-logic palette (the legend). These own the MAP LOGIC — the
 * functional markers AND their layer-control checkboxes — and are NEVER tinted
 * with the agent brand color: tinting them would break the legend and risk a
 * collision with the tour-thread accent. The agent brand accent owns the tour
 * thread (pins / route / CTA / step numbers / why-bar) instead.
 */
export const LAYER_COLOR: Record<ProximityCategory, string> = {
  schools: "#3b82f6", // blue
  commute: "#c2622d", // terra
  parks: "#22c55e", // green
  coffee: "#92400e", // brown
  grocery: "#15803d", // green (deeper, so it stays distinct from parks)
};

/** Default tour-thread accent when the agent has no brandAccent set. */
export const DEFAULT_TOUR_ACCENT = "#2dd4bf";

interface StylizedMapProps {
  homes: PublicHome[];
  anchor?: PublicCommuteAnchor;
  activeLayers: ReadonlySet<ProximityCategory>;
  highlightedStop: number | null;
  onPinTap: (stop: number) => void;
  /** The agent brand accent — owns the pins + route line (the tour thread). */
  accent: string;
}

const WIDTH = 320;
const HEIGHT = 240;

export function StylizedMap({
  homes,
  anchor,
  activeLayers,
  highlightedStop,
  onPinTap,
  accent,
}: StylizedMapProps) {
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
  });

  const polyline = routePolyline(projected.homes);

  return (
    <div
      className="relative w-full overflow-hidden rounded-2xl border border-neutral-800 bg-gradient-to-br from-neutral-900 to-neutral-950"
      data-testid="btb-map"
    >
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        className="block h-auto w-full"
        role="img"
        aria-label="Stylized map of your tour route"
      >
        {/* Subtle on-brand grid wash — purely decorative. */}
        <defs>
          <pattern
            id="btb-grid"
            width="32"
            height="32"
            patternUnits="userSpaceOnUse"
          >
            <path
              d="M32 0H0V32"
              fill="none"
              stroke="#262626"
              strokeWidth="0.5"
            />
          </pattern>
        </defs>
        <rect width={WIDTH} height={HEIGHT} fill="url(#btb-grid)" />

        {/* Route line through the ordered home pins. */}
        {polyline && (
          <polyline
            points={polyline}
            fill="none"
            stroke={accent}
            strokeWidth="2"
            strokeDasharray="5 4"
            strokeLinecap="round"
            opacity="0.7"
            data-testid="btb-map-route"
          />
        )}

        {/* Commute anchor pin (diamond). */}
        {projected.anchor && (
          <g
            transform={`translate(${projected.anchor.x}, ${projected.anchor.y})`}
            data-testid="btb-map-anchor"
          >
            <rect
              x="-7"
              y="-7"
              width="14"
              height="14"
              rx="2"
              transform="rotate(45)"
              fill="#0a0a0a"
              stroke={accent}
              strokeWidth="2"
            />
            <title>{anchor?.label ?? "Commute anchor"}</title>
          </g>
        )}

        {/* Home pins + their active-layer annotation dots. */}
        {projected.homes.map((pt, i) => {
          if (!pt) return null;
          const home = homes[i];
          const stop = home.stop;
          const isActive = highlightedStop === stop;
          // Which active layers does THIS home carry a chip for?
          const homeLayers = Array.from(
            new Set(home.proximity.map((c) => c.category)),
          ).filter((c) => activeLayers.has(c));
          return (
            <g
              key={stop}
              transform={`translate(${pt.x}, ${pt.y})`}
              data-testid={`btb-map-pin-${stop}`}
            >
              {/* Active-pin halo (motion-safe transition; static for reduced motion). */}
              {isActive && (
                <circle
                  r="18"
                  fill={accent}
                  opacity="0.18"
                  data-testid={`btb-map-pin-${stop}-halo`}
                />
              )}
              {/* Layer annotation dots, arranged around the pin. */}
              {homeLayers.map((cat, j) => {
                const angle = (-90 + j * 42) * (Math.PI / 180);
                const r = 15;
                return (
                  <circle
                    key={cat}
                    cx={Math.cos(angle) * r}
                    cy={Math.sin(angle) * r}
                    r="3.5"
                    fill={LAYER_COLOR[cat]}
                    stroke="#0a0a0a"
                    strokeWidth="1"
                    className="motion-safe:transition-opacity"
                    data-testid={`btb-map-marker-${stop}-${cat}`}
                  >
                    <title>{LAYER_LABELS[cat]}</title>
                  </circle>
                );
              })}
              {/* The numbered, tappable home pin. ≥44px hit area via the overlay
                  <rect> in foreignObject below; the visible circle is smaller. */}
              <circle
                r="11"
                fill={isActive ? accent : "#171717"}
                stroke={accent}
                strokeWidth="2"
                className="motion-safe:transition-colors"
              />
              <text
                textAnchor="middle"
                dominantBaseline="central"
                fontSize="11"
                fontWeight="700"
                fill={isActive ? "#0a0a0a" : accent}
              >
                {stop}
              </text>
            </g>
          );
        })}
      </svg>

      {/* Real, ≥44px tappable hit targets layered over each pin (criterion 3 +
          criterion 5). Kept as HTML buttons (not SVG <rect>) so they are honest
          interactive controls with an accessible name. */}
      {projected.homes.map((pt, i) => {
        if (!pt) return null;
        const stop = homes[i].stop;
        const leftPct = (pt.x / WIDTH) * 100;
        const topPct = (pt.y / HEIGHT) * 100;
        return (
          <button
            key={stop}
            type="button"
            onClick={() => onPinTap(stop)}
            aria-label={`Jump to home ${stop}`}
            data-testid={`btb-map-pinbtn-${stop}`}
            className="absolute -translate-x-1/2 -translate-y-1/2 rounded-full"
            style={{
              left: `${leftPct}%`,
              top: `${topPct}%`,
              width: 44,
              height: 44,
            }}
          />
        );
      })}
    </div>
  );
}
