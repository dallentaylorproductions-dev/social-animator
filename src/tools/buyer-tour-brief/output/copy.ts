/**
 * Buyer Tour Brief — static, Studio-authored copy + labels (v0).
 *
 * Everything here is copy STUDIO generates (layer labels, the footer disclaimer,
 * section headings). It is held to the Fair Housing hard constraint: factual only,
 * never a quality judgment. The agent's own authored language (whyOnList /
 * watchFor / agentNote) is the ONLY qualitative copy on the page, and it is the
 * agent's authorship — Studio never generates it.
 *
 * The Fair-Housing guard test (e2e/buyer-tour.fair-housing.spec.ts) scans the
 * Studio-generated surfaces (this file, the output components, and a fully
 * rendered fixture page) for `FAIR_HOUSING_BANNED` and fails on any hit.
 */

import type { ProximityCategory } from "../engine/types";

/**
 * Buyer-facing layer labels. FACTUAL by construction. Schools is deliberately
 * "School locations" (not "Schools" or anything qualitative): v0 shows school
 * LOCATIONS + distance only, never names-as-quality, never ratings.
 */
export const LAYER_LABELS: Record<ProximityCategory, string> = {
  schools: "School locations",
  commute: "Commute",
  parks: "Parks",
  coffee: "Coffee",
  grocery: "Grocery",
};

/** Short helper line under a layer in the legend (factual orientation only). */
export const LAYER_HINTS: Record<ProximityCategory, string> = {
  schools: "Nearby school locations and distance",
  commute: "Drive time to your commute anchor",
  parks: "Nearby parks and distance",
  coffee: "Nearby coffee and distance",
  grocery: "Nearby grocery and distance",
};

/** First-use affordance on the layer legend (acceptance criterion 3). */
export const LEGEND_HINT = "Tap a layer to show or hide it on the map.";

/** Section + structural headings (Studio-authored, factual). */
export const HEADINGS = {
  plannedAround: "Planned around you",
  theDay: "Your showing day",
  theHomes: "The homes, in order",
  whyOnList: "Why it's on the list",
  watchFor: "What to notice",
  mapTitle: "Your tour route",
  afterTour: "After the tour",
  contact: "Questions before the day?",
} as const;

/** The small after-tour teaser (copy only in v0 — no asset yet). */
export const AFTER_TOUR_TEASER =
  "After we walk these together, I'll put the ones you liked side by side so it's easy to compare.";

/**
 * The required page footer disclaimer. Nearby locations / approximate distances
 * are for orientation only — not a rating, recommendation, or representation —
 * and all buyers are welcome and served equally. This text is FIXED; the guard
 * test asserts it renders and stays clean.
 */
export const FOOTER_DISCLAIMER =
  "Nearby locations and approximate distances are shown for orientation only. " +
  "They are not a rating, recommendation, or representation about any school, " +
  "neighborhood, or community. All buyers are welcome and served equally.";

/*
 * Fair Housing — Studio-generated copy/labels must never carry a quality judgment
 * about schools, neighborhoods, or who a place is "for". The banned-substring list
 * lives in the guard test (e2e/buyer-tour.fair-housing.spec.ts), which scans these
 * Studio surfaces + a rendered fixture. It is deliberately NOT scanned over the
 * agent's own authored fields (whyOnList / watchFor / agentNote) — that is the
 * agent's protected authorship. Product principle: Studio renders agent text +
 * factual proximity; Studio never interprets.
 */
