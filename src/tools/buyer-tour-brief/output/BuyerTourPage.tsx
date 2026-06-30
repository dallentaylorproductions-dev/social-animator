"use client";

/**
 * Buyer Tour Brief — the buyer-facing page (BUYER_TOUR_BRIEF).
 *
 * The buyer-side twin of the Seller Presentation. The hero is the AGENT'S THINKING
 * (why each home is on the list, what to notice), not the map; the map is an
 * experience hero, not a data dependency. Renders ONLY from the clamped public
 * payload (the privacy boundary) — never the raw draft.
 *
 * Acceptance criteria wired here:
 *   1. No horizontal overflow — content is a single max-w column; chips + legend wrap.
 *   2. "Planned around you" is a static, fully-visible card (no scroll-to-reveal).
 *   3. Layer legend = real buttons (aria-pressed), wrap, ≥44px tap targets, a
 *      first-use hint, clear active/inactive states.
 *   4. Toggling a layer updates BOTH the map markers AND the matching card chips
 *      (the chip glow ties layer → card → buyer priority).
 *   5. Tapping a map pin scrolls to + briefly highlights the matching home.
 *   6. prefers-reduced-motion → glow/flash become a static highlight (no animation);
 *      map markers appear without scale/transition (motion-safe gating).
 *   7. School layer is factual proximity only, labelled "School locations".
 */

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { ProximityCategory } from "../engine/types";
import type { BuyerTourPublicPayload, PublicHome } from "./public-payload";
import {
  AFTER_TOUR_TEASER,
  FOOTER_DISCLAIMER,
  HEADINGS,
  LAYER_HINTS,
  LAYER_LABELS,
  LEGEND_HINT,
} from "./copy";
import { DEFAULT_TOUR_ACCENT, LAYER_COLOR, StylizedMap } from "./StylizedMap";
import { pickContrastText } from "@/tools/listing-flyer/engine/contrast";

const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

function subscribeReducedMotion(onChange: () => void): () => void {
  if (typeof window === "undefined" || !window.matchMedia) return () => {};
  const mq = window.matchMedia(REDUCED_MOTION_QUERY);
  mq.addEventListener?.("change", onChange);
  return () => mq.removeEventListener?.("change", onChange);
}

/** SSR-safe prefers-reduced-motion read via the external-store subscription
 *  pattern (no set-state-in-effect). Server snapshot is false. */
function useReducedMotion(): boolean {
  return useSyncExternalStore(
    subscribeReducedMotion,
    () =>
      typeof window !== "undefined" && window.matchMedia
        ? window.matchMedia(REDUCED_MOTION_QUERY).matches
        : false,
    () => false,
  );
}

function formatPrice(price?: number): string | null {
  if (price === undefined) return null;
  return `$${price.toLocaleString("en-US")}`;
}

function specLine(home: PublicHome): string | null {
  const parts: string[] = [];
  if (home.beds !== undefined) parts.push(`${home.beds} bd`);
  if (home.baths !== undefined) parts.push(`${home.baths} ba`);
  if (home.sqft !== undefined) parts.push(`${home.sqft.toLocaleString("en-US")} sqft`);
  return parts.length > 0 ? parts.join(" · ") : null;
}

export function BuyerTourPage({ payload }: { payload: BuyerTourPublicPayload }) {
  const reduced = useReducedMotion();

  // The agent brand accent owns the TOUR THREAD only (pins/route handled in the
  // map; CTA + step numbers + the "why" accent bar handled below). Legibility never
  // rides on it: text drawn ON the accent uses a contrast-picked color, so a very
  // light or very dark agent accent still reads. Absent → the default tour accent.
  const accent = payload.brandAccent ?? DEFAULT_TOUR_ACCENT;
  const onAccent = pickContrastText(accent);

  // The single primary CTA (the next action) also belongs to the brand accent.
  // Prefer a text thread to the agent, then scheduling, then email.
  const agentFirst = payload.agent.name?.trim().split(/\s+/)[0] ?? "your agent";
  const primaryCta = payload.agent.phone
    ? { label: `Text ${agentFirst}`, href: `sms:${payload.agent.phone}` }
    : payload.agent.schedulingUrl
      ? { label: "Plan the day", href: payload.agent.schedulingUrl }
      : payload.agent.email
        ? { label: `Email ${agentFirst}`, href: `mailto:${payload.agent.email}` }
        : null;

  // Active layers default to the agent-enabled priority set.
  const [activeLayers, setActiveLayers] = useState<Set<ProximityCategory>>(
    () => new Set(payload.priorities),
  );
  const [highlightedStop, setHighlightedStop] = useState<number | null>(null);

  const cardRefs = useRef<Map<number, HTMLElement | null>>(new Map());
  const clearTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (clearTimer.current) clearTimeout(clearTimer.current);
    };
  }, []);

  const toggleLayer = useCallback((cat: ProximityCategory) => {
    setActiveLayers((prev) => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat);
      else next.add(cat);
      return next;
    });
  }, []);

  const onPinTap = useCallback(
    (stop: number) => {
      const el = cardRefs.current.get(stop);
      if (el) {
        el.scrollIntoView({
          behavior: reduced ? "auto" : "smooth",
          block: "center",
        });
      }
      setHighlightedStop(stop);
      if (clearTimer.current) clearTimeout(clearTimer.current);
      // Clear after a beat. With reduced motion the highlight is a STATIC ring
      // (no flash animation) while it is applied — see the card className below.
      clearTimer.current = setTimeout(() => setHighlightedStop(null), 2200);
    },
    [reduced],
  );

  const hasMap = payload.homes.some(
    (h) => h.lat !== undefined && h.lng !== undefined,
  );

  const greeting = payload.buyerName
    ? `${payload.buyerName}, here's the tour I planned around you`
    : "Here's the tour I planned around you";

  return (
    <main
      className="min-h-screen bg-neutral-950 text-neutral-100 overflow-x-hidden"
      data-testid="buyer-tour-page"
    >
      <div className="mx-auto w-full max-w-xl px-4 py-8 sm:py-12">
        {/* ---- Hero / "planned around you" (static, fully visible) ---- */}
        <header className="mb-8">
          <p className="text-[11px] uppercase tracking-[0.18em] text-neutral-500">
            {HEADINGS.plannedAround}
          </p>
          <h1 className="mt-2 text-2xl font-semibold leading-snug text-neutral-50 sm:text-3xl">
            {greeting}
          </h1>
          <dl className="mt-4 flex flex-wrap gap-x-6 gap-y-2 text-sm text-neutral-300">
            {payload.tourDate && (
              <div>
                <dt className="text-[11px] uppercase tracking-wide text-neutral-500">
                  {HEADINGS.theDay}
                </dt>
                <dd className="font-medium" data-testid="btb-tour-date">
                  {payload.tourDate}
                </dd>
              </div>
            )}
            {payload.meetingPoint && (
              <div>
                <dt className="text-[11px] uppercase tracking-wide text-neutral-500">
                  Meeting point
                </dt>
                <dd className="font-medium" data-testid="btb-meeting-point">
                  {payload.meetingPoint}
                </dd>
              </div>
            )}
          </dl>
        </header>

        {/* The agent's note — the agent's voice, rendered verbatim. */}
        {payload.agentNote && (
          <section
            className="mb-8 rounded-2xl border border-neutral-800 bg-neutral-900/60 p-5"
            data-testid="btb-agent-note"
          >
            <p className="whitespace-pre-line text-[15px] leading-relaxed text-neutral-200">
              {payload.agentNote}
            </p>
          </section>
        )}

        {/* ---- Map + layer legend ---- */}
        {hasMap && (
          <section className="mb-10" data-testid="btb-map-section">
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-[0.14em] text-neutral-400">
              {HEADINGS.mapTitle}
            </h2>
            <StylizedMap
              homes={payload.homes}
              anchor={payload.commuteAnchor}
              activeLayers={activeLayers}
              highlightedStop={highlightedStop}
              onPinTap={onPinTap}
              accent={accent}
            />

            {payload.priorities.length > 0 && (
              <div className="mt-4" data-testid="btb-legend">
                <p className="mb-2 text-xs text-neutral-500">{LEGEND_HINT}</p>
                <div className="flex flex-wrap gap-2">
                  {payload.priorities.map((cat) => {
                    const on = activeLayers.has(cat);
                    const col = LAYER_COLOR[cat];
                    return (
                      <button
                        key={cat}
                        type="button"
                        role="switch"
                        aria-checked={on}
                        aria-label={`${LAYER_LABELS[cat]} — ${LAYER_HINTS[cat]}`}
                        title={LAYER_HINTS[cat]}
                        onClick={() => toggleLayer(cat)}
                        data-testid={`btb-legend-${cat}`}
                        data-active={on ? "true" : "false"}
                        // The layer control's active state uses the LAYER'S category
                        // color (the semantic legend), never the agent brand accent.
                        style={
                          on
                            ? { borderColor: col, backgroundColor: `${col}26` }
                            : undefined
                        }
                        className={`inline-flex min-h-[44px] items-center gap-2 rounded-full border px-4 py-2 text-sm motion-safe:transition-colors ${
                          on
                            ? "text-neutral-100"
                            : "border-neutral-700 bg-neutral-900 text-neutral-400"
                        }`}
                      >
                        <span
                          aria-hidden="true"
                          className="inline-block h-2.5 w-2.5 rounded-full"
                          style={{ backgroundColor: on ? col : "#525252" }}
                        />
                        {LAYER_LABELS[cat]}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </section>
        )}

        {/* ---- The homes, in order ---- */}
        <section data-testid="btb-homes">
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-[0.14em] text-neutral-400">
            {HEADINGS.theHomes}
          </h2>
          <ol className="space-y-6">
            {payload.homes.map((home) => {
              const highlighted = highlightedStop === home.stop;
              const price = formatPrice(home.price);
              const specs = specLine(home);
              return (
                <li
                  key={home.stop}
                  ref={(el) => {
                    cardRefs.current.set(home.stop, el);
                  }}
                  data-testid={`btb-home-${home.stop}`}
                  data-highlighted={highlighted ? "true" : "false"}
                  className={`scroll-mt-6 overflow-hidden rounded-2xl border bg-neutral-900/60 motion-safe:transition-[border-color,box-shadow] ${
                    highlighted
                      ? "border-teal-400 shadow-[0_0_0_2px_rgba(45,212,191,0.5)]"
                      : "border-neutral-800"
                  }`}
                >
                  {home.photoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={home.photoUrl}
                      alt={`Home ${home.stop}: ${home.address}`}
                      className="aspect-[4/3] w-full object-cover"
                      data-testid={`btb-home-${home.stop}-photo`}
                    />
                  ) : (
                    // Clean branded placeholder — the card looks complete with no
                    // photo work. Neutral canvas + a single accent house glyph (the
                    // tour thread), never a brand-color flood.
                    <div
                      className="flex aspect-[4/3] w-full items-center justify-center bg-gradient-to-br from-neutral-800 to-neutral-900"
                      data-testid={`btb-home-${home.stop}-placeholder`}
                      aria-hidden="true"
                    >
                      <svg
                        width="40"
                        height="40"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke={accent}
                        strokeWidth="1.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        opacity="0.85"
                      >
                        <path d="M3 10.5 12 3l9 7.5" />
                        <path d="M5 9.5V21h14V9.5" />
                      </svg>
                    </div>
                  )}
                  <div className="p-5">
                    <div className="flex items-start gap-3">
                      <span
                        className="mt-0.5 flex h-7 w-7 flex-none items-center justify-center rounded-full text-sm font-bold"
                        style={{ backgroundColor: accent, color: onAccent }}
                        data-testid={`btb-home-${home.stop}-badge`}
                      >
                        {home.stop}
                      </span>
                      <div className="min-w-0">
                        <p className="break-words font-medium text-neutral-100">
                          {home.address}
                        </p>
                        {(price || specs) && (
                          <p className="mt-0.5 text-sm text-neutral-400">
                            {[price, specs].filter(Boolean).join("  ·  ")}
                          </p>
                        )}
                      </div>
                    </div>

                    {home.whyOnList && (
                      // The "why it's on the list" accent bar is part of the tour
                      // thread → agent brand accent.
                      <div
                        className="mt-4 border-l-2 pl-3"
                        style={{ borderColor: accent }}
                      >
                        <p className="text-[11px] uppercase tracking-wide text-neutral-400">
                          {HEADINGS.whyOnList}
                        </p>
                        <p className="mt-1 whitespace-pre-line text-[15px] leading-relaxed text-neutral-100">
                          {home.whyOnList}
                        </p>
                      </div>
                    )}

                    {home.watchFor && (
                      <div className="mt-3">
                        <p className="text-[11px] uppercase tracking-wide text-neutral-500">
                          {HEADINGS.watchFor}
                        </p>
                        <p className="mt-1 whitespace-pre-line text-[15px] leading-relaxed text-neutral-300">
                          {home.watchFor}
                        </p>
                      </div>
                    )}

                    {home.proximity.length > 0 && (
                      <ul className="mt-4 flex flex-wrap gap-2" data-testid={`btb-home-${home.stop}-chips`}>
                        {home.proximity.map((chip, idx) => {
                          const on = activeLayers.has(chip.category);
                          const col = LAYER_COLOR[chip.category];
                          return (
                            <li
                              key={`${chip.category}-${idx}`}
                              data-testid={`btb-chip-${home.stop}-${chip.category}`}
                              data-active={on ? "true" : "false"}
                              // Chips are MAP-LOGIC facts → the active glow uses the
                              // category color (the legend), never the brand accent.
                              style={
                                on
                                  ? {
                                      borderColor: col,
                                      backgroundColor: `${col}1f`,
                                      boxShadow: `0 0 0 1px ${col}59`,
                                    }
                                  : undefined
                              }
                              className={`inline-flex max-w-full items-center gap-1.5 rounded-full border px-3 py-1 text-xs motion-safe:transition-all ${
                                on
                                  ? "text-neutral-50"
                                  : "border-neutral-800 bg-neutral-900 text-neutral-500 opacity-70"
                              }`}
                            >
                              <span
                                aria-hidden="true"
                                className="inline-block h-2 w-2 flex-none rounded-full"
                                style={{ backgroundColor: on ? col : "#525252" }}
                              />
                              <span className="truncate">
                                <span className="text-neutral-300">
                                  {LAYER_LABELS[chip.category]}:
                                </span>{" "}
                                {chip.label}
                                {chip.value ? ` · ${chip.value}` : ""}
                              </span>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </div>
                </li>
              );
            })}
          </ol>
        </section>

        {/* ---- After-tour teaser (copy only in v0) ---- */}
        <section
          className="mt-10 rounded-2xl border border-dashed border-neutral-800 bg-neutral-900/40 p-5"
          data-testid="btb-after-tour"
        >
          <p className="text-[11px] uppercase tracking-[0.18em] text-neutral-500">
            {HEADINGS.afterTour}
          </p>
          <p className="mt-2 text-sm leading-relaxed text-neutral-300">
            {AFTER_TOUR_TEASER}
          </p>
        </section>

        {/* ---- Agent contact ---- */}
        {(payload.agent.name || payload.agent.phone || payload.agent.email) && (
          <section className="mt-10" data-testid="btb-agent">
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-[0.14em] text-neutral-400">
              {HEADINGS.contact}
            </h2>
            <div className="flex items-center gap-4 rounded-2xl border border-neutral-800 bg-neutral-900/60 p-5">
              {payload.agent.photoUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={payload.agent.photoUrl}
                  alt={payload.agent.name ?? "Your agent"}
                  className="h-14 w-14 flex-none rounded-full object-cover"
                />
              )}
              <div className="min-w-0">
                {payload.agent.name && (
                  <p className="font-medium text-neutral-100">
                    {payload.agent.name}
                  </p>
                )}
                {payload.agent.brokerage && (
                  <p className="text-sm text-neutral-400">
                    {payload.agent.brokerage}
                  </p>
                )}
                {primaryCta && (
                  <a
                    href={primaryCta.href}
                    className="mt-3 inline-flex items-center justify-center rounded-full px-5 py-2 text-sm font-semibold"
                    style={{ backgroundColor: accent, color: onAccent }}
                    data-testid="btb-primary-cta"
                  >
                    {primaryCta.label}
                  </a>
                )}
                <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-neutral-400">
                  {payload.agent.schedulingUrl && (
                    <a
                      href={payload.agent.schedulingUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="hover:text-neutral-200"
                    >
                      Plan the day
                    </a>
                  )}
                  {payload.agent.phone && (
                    <a href={`tel:${payload.agent.phone}`} className="hover:text-neutral-200">
                      {payload.agent.phone}
                    </a>
                  )}
                  {payload.agent.email && (
                    <a
                      href={`mailto:${payload.agent.email}`}
                      className="break-all hover:text-neutral-200"
                    >
                      {payload.agent.email}
                    </a>
                  )}
                </div>
              </div>
            </div>
          </section>
        )}

        {/* ---- Required Fair Housing footer disclaimer ---- */}
        <footer className="mt-10 border-t border-neutral-900 pt-6">
          <p
            className="text-[11px] leading-relaxed text-neutral-500"
            data-testid="btb-disclaimer"
          >
            {FOOTER_DISCLAIMER}
          </p>
        </footer>
      </div>
    </main>
  );
}
