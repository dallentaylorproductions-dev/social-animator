/**
 * PREPARED_NEXT — deterministic bullet extraction (the unit-test seam).
 *
 * From the PUBLIC payload ONLY, in a fixed priority order, pick up to 3 section
 * "bullet candidates" the model later restates (it may not invent new points —
 * the honesty rule). PURE + deterministic so the route, the generator, and the
 * unit tests share one implementation and can never drift.
 *
 * FOUR sections — the spec's old "preparation / next steps" section is DROPPED
 * because no dedicated public field exists (verified read-only fact). We do NOT
 * synthesize one from `appointmentAt` / State-A fields; that would invent content.
 *
 * A section counts as ONE candidate iff it yields at least one non-empty, public-
 * allowed value whose TRIMMED length exceeds `MIN_BULLET_CHARS`. Every value read
 * here is already public (it renders on /h/<slug>); no private/stripped field is
 * ever touched (per-comp soldPrice etc. are gone from the payload by construction).
 *
 * v0.1 — State-A coverage fix. The readers also cover the State-A prepared-
 * invitation page's own content (which a State-A publish populates while leaving
 * the State-B pricing/brand fields empty): the chosen `leadEmphasis` lever and
 * the agent's `recentListings` reach feed the marketing section, and the personal
 * `welcomeLine` feeds the agent-plan section. Static template / scaffolding copy
 * (the "At our meeting" framing etc.), capability-asset URLs, and `appointmentAt`
 * are deliberately NOT bullet sources (appointment stays an enrichment / ask_field).
 */

import type {
  PublicPayload,
  PublicComp,
  PublicPitchCard,
  PublicRecentListing,
  PublicWhyUs,
  MarketingPoint,
  ProcessStep,
  AreaStats,
} from "@/tools/seller-presentation/output/public-payload";
import {
  LEAD_EMPHASIS_LABELS,
  clampLeadEmphasis,
} from "@/lib/seller-presentation/lead-emphasis";
import { MIN_BULLET_CHARS, MAX_BULLETS } from "./constants";

/** The four sections, in their fixed priority order. */
export type BulletSection = "value" | "marketing" | "comps" | "agent_plan";

export interface BulletCandidate {
  section: BulletSection;
  /** Calm, human label for the section (shown in the review pane + given to the model). */
  label: string;
  /**
   * The concrete PUBLIC text the model restates. Real payload content (never
   * synthesized claims), so the model has honest material to work from.
   */
  text: string;
}

const SECTION_LABEL: Record<BulletSection, string> = {
  value: "Why this price",
  marketing: "How the home gets seen",
  comps: "Nearby market evidence",
  agent_plan: "How I work",
};

function clean(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

/**
 * Known static template / scaffolding copy that is identical across pages (the
 * State-A page renders some of this as fixed framing). It is NOT agent-authored
 * seller-specific content, so it must never become a bullet — the model would
 * restate boilerplate as if it were a real point. Matched as a normalized
 * prefix/equality so an agent line that merely contains a stray word is unharmed.
 * Conservative + reversible: only the known constant openers are listed.
 */
const STATIC_TEMPLATE_FRAGMENTS: readonly string[] = [
  "at our meeting",
  "i like to understand the market first",
  "here is what happens next",
  "here is what happens at our meeting",
];

function isStaticTemplate(text: string): boolean {
  const t = text.trim().toLowerCase();
  if (!t) return false;
  return STATIC_TEMPLATE_FRAGMENTS.some((f) => t === f || t.startsWith(f));
}

/**
 * A cleaned string, but EMPTY when it is known static-template copy — so
 * boilerplate never qualifies a section. Used for the prose fields; plain
 * `clean` stays for non-prose values (addresses, labels) that can't be boilerplate.
 */
function meaningful(value: unknown): string {
  const c = clean(value);
  return isStaticTemplate(c) ? "" : c;
}

/** First non-empty, non-boilerplate string from a list of candidates. */
function firstNonEmpty(...values: unknown[]): string {
  for (const v of values) {
    const c = meaningful(v);
    if (c) return c;
  }
  return "";
}

/** (1) value / pricing rationale. (valuationMessage already covers State-A.) */
function valueText(p: PublicPayload): string {
  return firstNonEmpty(
    p.priceRationale,
    p.property?.rationaleShort,
    p.whyPrice?.publicRationale,
    p.valuationMessage,
  );
}

/**
 * (2) marketing / exposure plan. State-B brand marketing-approach PLUS the
 * State-A invitation's own exposure content: the chosen lead-emphasis lever
 * (naturalized via its agent-facing label) and the agent's recent listings with
 * their real buyer-view reach. All public + agent-authored; the model restates,
 * never invents. Joined so the model gets the fullest honest picture.
 */
function marketingText(p: PublicPayload): string {
  const parts: string[] = [];

  const whyUs = p.whyUs as PublicWhyUs | undefined;
  const points = Array.isArray(whyUs?.marketingApproach)
    ? (whyUs!.marketingApproach as MarketingPoint[])
    : [];
  const approach = points
    .map((m) => [meaningful(m?.title), meaningful(m?.detail)].filter(Boolean).join(": "))
    .filter(Boolean)
    .join(". ");
  if (approach) parts.push(approach);

  // State-A: the one exposure lever the agent picked, as its human label.
  const lever = clampLeadEmphasis(p.leadEmphasis);
  if (lever) parts.push(`My exposure plan leads with ${LEAD_EMPHASIS_LABELS[lever].toLowerCase()}.`);

  // State-A: the agent's recent listings + their real buyer-view reach. A listing
  // qualifies on a non-empty address; the view count (public) rides along when set.
  const listings = Array.isArray(p.recentListings)
    ? (p.recentListings as PublicRecentListing[])
    : [];
  const listingParts = listings
    .slice(0, 4)
    .map((l) => {
      const addr = clean(l?.address);
      if (!addr) return "";
      const views =
        typeof l?.viewCount === "number" && Number.isFinite(l.viewCount)
          ? ` (${l.viewCount} buyer views)`
          : "";
      return `${addr}${views}`;
    })
    .filter(Boolean);
  if (listingParts.length) {
    parts.push(`Recent listings I have put in front of buyers: ${listingParts.join("; ")}`);
  }

  return parts.join(". ");
}

/** (3) comparable sales / market evidence — addresses + anonymized area context (all public). */
function compsText(p: PublicPayload): string {
  const comps = Array.isArray(p.comps) ? (p.comps as PublicComp[]) : [];
  const addresses = comps
    .map((c) => clean(c?.address))
    .filter(Boolean)
    .slice(0, 4);
  const parts: string[] = [];
  if (addresses.length) {
    parts.push(`Nearby recent sales: ${addresses.join("; ")}`);
  }
  const area = p.areaStats as AreaStats | undefined;
  const median = clean(area?.medianSale);
  if (median) parts.push(`Area median sale ${median}`);
  if (p.valuationRange) {
    // Anonymized endpoints only (the payload never carries a per-comp dollar).
    parts.push(
      `Comparable range ${p.valuationRange.low} to ${p.valuationRange.high}`,
    );
  }
  return parts.join(". ");
}

/**
 * (4) agent plan / service promise. State-B brand "why us" content PLUS the
 * State-A invitation's agent-authored personal hello (`welcomeLine`). All
 * agent-authored prose; boilerplate is filtered by `firstNonEmpty`/`meaningful`.
 */
function agentPlanText(p: PublicPayload): string {
  const whyUs = p.whyUs as PublicWhyUs | undefined;
  const guarantee = clean(whyUs?.guarantee);
  const howWeWork = Array.isArray(whyUs?.howWeWork)
    ? (whyUs!.howWeWork as ProcessStep[])
        .map((s) => [clean(s?.step), clean(s?.detail)].filter(Boolean).join(": "))
        .filter(Boolean)
        .join(". ")
    : "";
  const differentiators = Array.isArray(whyUs?.differentiators)
    ? (whyUs!.differentiators as string[]).map(clean).filter(Boolean).join(". ")
    : "";
  const cards = Array.isArray(p.pitchPublicCards)
    ? (p.pitchPublicCards as PublicPitchCard[])
        .map((c) =>
          [clean(c?.title), clean(c?.support)].filter(Boolean).join(": "),
        )
        .filter(Boolean)
        .join(". ")
    : "";
  return firstNonEmpty(
    guarantee,
    howWeWork,
    differentiators,
    cards,
    p.agentTagline,
    p.signatureLine,
    p.welcomeLine,
  );
}

const EXTRACTORS: Array<{ section: BulletSection; get: (p: PublicPayload) => string }> = [
  { section: "value", get: valueText },
  { section: "marketing", get: marketingText },
  { section: "comps", get: compsText },
  { section: "agent_plan", get: agentPlanText },
];

/**
 * Extract the ordered bullet candidates from a public payload. Walks the four
 * sections in fixed priority order, keeps each section whose representative text
 * exceeds `MIN_BULLET_CHARS`, and returns at most `MAX_BULLETS` (first-3-only).
 * PURE.
 */
export function extractBulletCandidates(p: PublicPayload): BulletCandidate[] {
  const out: BulletCandidate[] = [];
  for (const { section, get } of EXTRACTORS) {
    if (out.length >= MAX_BULLETS) break;
    const text = get(p);
    if (text.trim().length > MIN_BULLET_CHARS) {
      out.push({ section, label: SECTION_LABEL[section], text });
    }
  }
  return out;
}
