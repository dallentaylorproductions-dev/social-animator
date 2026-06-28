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
 */

import type {
  PublicPayload,
  PublicComp,
  PublicPitchCard,
  PublicWhyUs,
  MarketingPoint,
  ProcessStep,
  AreaStats,
} from "@/tools/seller-presentation/output/public-payload";
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

/** First non-empty cleaned string from a list of candidates. */
function firstNonEmpty(...values: unknown[]): string {
  for (const v of values) {
    const c = clean(v);
    if (c) return c;
  }
  return "";
}

/** (1) value / pricing rationale. */
function valueText(p: PublicPayload): string {
  return firstNonEmpty(
    p.priceRationale,
    p.property?.rationaleShort,
    p.whyPrice?.publicRationale,
    p.valuationMessage,
  );
}

/** (2) marketing / exposure plan — restate the agent's marketing-approach points. */
function marketingText(p: PublicPayload): string {
  const whyUs = p.whyUs as PublicWhyUs | undefined;
  const points = Array.isArray(whyUs?.marketingApproach)
    ? (whyUs!.marketingApproach as MarketingPoint[])
    : [];
  const lines = points
    .map((m) => {
      const title = clean(m?.title);
      const detail = clean(m?.detail);
      return [title, detail].filter(Boolean).join(": ");
    })
    .filter(Boolean);
  return lines.join(". ");
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

/** (4) agent plan / service promise. */
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
