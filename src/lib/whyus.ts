/**
 * B0a — "Why us" agent-constant content model.
 *
 * The pre-listing "why work with us" package: differentiation an agent sets
 * ONCE in Settings (guarantees, marketing process, quantified results, how we
 * work) that flows into every Seller Presentation. This is the FIRST
 * agent-constant home for performance stats — the per-presentation `AreaStats`
 * (on the draft) is a different, listing-specific thing; `trackRecord` was
 * removed in A7d.1 and is NOT revived here.
 *
 * Pure module — no React, no storage. `brand.ts` folds `clampWhyUs` into
 * `loadBrandSettings`; the Settings form seeds blank state from
 * `defaultWhyUs()`. Kept here (not in `brand.ts`) so the offline schema spec
 * can import the type + helpers without pulling in the client hook.
 *
 * "Arrives done" contract (the governing B0a principle): the form is never a
 * blank slate. `defaultWhyUs()` ships editable example copy for the prose
 * groups and PRE-LABELED stat rows with blank numbers, so the agent edits
 * rather than configures. Empty rows are simply not shown downstream (B0b).
 */

/** A single marketing-process point (photography, ad funnel, Showcase, …). */
export interface MarketingPoint {
  title: string;
  detail?: string;
}

/**
 * A quantified comparison row. Pre-labeled in `defaultWhyUs()` so the agent
 * only types numbers. `marketValue` is optional — some stats have no market
 * comparison. `unit` drives the form's input control: "%" → PercentInput,
 * anything else (or unset) → NumberInput.
 */
export interface PerformanceStat {
  label: string;
  yourValue: string;
  marketValue?: string;
  unit?: string;
}

/** One ordered step of the agent's how-we-work process. */
export interface ProcessStep {
  step: string;
  detail?: string;
}

/** The agent-constant "Why us" group on BrandSettings. All optional downstream. */
export interface WhyUs {
  differentiators: string[];
  marketingApproach: MarketingPoint[];
  performanceStats: PerformanceStat[];
  howWeWork: ProcessStep[];
  guarantee?: string;
}

/**
 * Soft caps. The form stops offering "+ Add" at the cap and shows the calm
 * nudge; persistence (clampWhyUs) hard-clamps to these so a tampered or
 * legacy record can never smuggle an unbounded list downstream.
 */
export const WHYUS_CAPS = {
  differentiators: 6,
  marketingApproach: 6,
  performanceStats: 6,
  howWeWork: 7,
} as const;

/** Calm copy nudge shown when a group reaches its soft cap. */
export const WHYUS_CAP_NUDGE = "Two or three strong points read better than six.";

/**
 * Arrives-done defaults. Editable example prose for the qualitative groups;
 * the canonical, pre-labeled stat rows with blank numbers. The Settings form
 * seeds its editing state from this when nothing is stored yet — it does NOT
 * persist on mount (mirrors the E.0 brand-color "never write defaults on
 * mount" contract); only an explicit edit writes to localStorage.
 */
export function defaultWhyUs(): WhyUs {
  return {
    differentiators: [
      "We average more views per listing than any team in the area.",
      "Professional photography and video on every home, no exceptions.",
      "You work with us directly. Never handed off to an assistant.",
    ],
    marketingApproach: [
      {
        title: "Professional photography & video",
        detail: "Every listing, shot by a pro. Stills, video, and twilight when it helps.",
      },
      {
        title: "Targeted digital ad funnel",
        detail: "Your home in front of the right buyers on the platforms they actually use.",
      },
      {
        title: "Featured placement & syndication",
        detail: "Zillow Showcase plus every major portal, the first day it's live.",
      },
    ],
    performanceStats: [
      // marketValue is omitted (not "") so the default round-trips through the
      // clamp unchanged — the form always renders the optional market-avg
      // input regardless, and an empty one is simply not persisted.
      { label: "Average sale-to-list", yourValue: "", unit: "%" },
      { label: "Average days on market", yourValue: "", unit: "days" },
      { label: "Average listing views", yourValue: "", unit: "views" },
      { label: "Homes sold (last 12 months)", yourValue: "" },
      { label: "Total reviews", yourValue: "" },
    ],
    howWeWork: [
      { step: "Walk the home together", detail: "We see what buyers will see and plan around it." },
      { step: "Price it on real comps", detail: "A number grounded in what's actually selling nearby." },
      { step: "Prep, shoot, and stage", detail: "Photography, video, and any quick fixes that pay off." },
      { step: "Launch the marketing", detail: "Portals, ads, and our network, all on day one." },
      { step: "Negotiate and close", detail: "We handle every offer and walk you through to the keys." },
    ],
  };
}

const str = (v: unknown): string => (typeof v === "string" ? v : "");

/** Trim + drop an array down to its soft cap. */
function clampList<T>(raw: unknown, cap: number, project: (item: unknown) => T | null): T[] {
  if (!Array.isArray(raw)) return [];
  const out: T[] = [];
  for (const item of raw) {
    if (out.length >= cap) break;
    const projected = project(item);
    if (projected !== null) out.push(projected);
  }
  return out;
}

function clampMarketingPoint(item: unknown): MarketingPoint | null {
  if (!item || typeof item !== "object") return null;
  const rec = item as Record<string, unknown>;
  const title = str(rec.title);
  const detail = str(rec.detail);
  // Keep the row if it has ANY content — the form may hold an in-progress
  // row with only a detail typed so far. A fully-empty row is dropped.
  if (!title.trim() && !detail.trim()) return null;
  return detail.trim() ? { title, detail } : { title };
}

function clampPerformanceStat(item: unknown): PerformanceStat | null {
  if (!item || typeof item !== "object") return null;
  const rec = item as Record<string, unknown>;
  const label = str(rec.label);
  const yourValue = str(rec.yourValue);
  const marketValue = str(rec.marketValue);
  const unit = str(rec.unit);
  // A stat row is meaningful only with a label. Pre-labeled rows the agent
  // never filled (blank yourValue) are KEPT on persistence — they're the
  // arrives-done skeleton; B0b hides empty-value rows at render, not here.
  if (!label.trim()) return null;
  const out: PerformanceStat = { label, yourValue };
  if (marketValue.trim()) out.marketValue = marketValue;
  if (unit.trim()) out.unit = unit;
  return out;
}

function clampProcessStep(item: unknown): ProcessStep | null {
  if (!item || typeof item !== "object") return null;
  const rec = item as Record<string, unknown>;
  const step = str(rec.step);
  const detail = str(rec.detail);
  if (!step.trim() && !detail.trim()) return null;
  return detail.trim() ? { step, detail } : { step };
}

/**
 * Defense-at-boundary clamp for a stored `whyUs` record. Coerces every field
 * to its declared shape, hard-clamps each list to its soft cap, and drops
 * fully-empty rows. Returns `undefined` when nothing usable survives so the
 * form treats "never configured" as a single state (→ seeds from defaults).
 */
export function clampWhyUs(raw: unknown): WhyUs | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const rec = raw as Record<string, unknown>;

  const differentiators = clampList<string>(
    rec.differentiators,
    WHYUS_CAPS.differentiators,
    (item) => {
      const v = str(item);
      return v.trim() ? v : null;
    },
  );
  const marketingApproach = clampList(
    rec.marketingApproach,
    WHYUS_CAPS.marketingApproach,
    clampMarketingPoint,
  );
  const performanceStats = clampList(
    rec.performanceStats,
    WHYUS_CAPS.performanceStats,
    clampPerformanceStat,
  );
  const howWeWork = clampList(rec.howWeWork, WHYUS_CAPS.howWeWork, clampProcessStep);
  const guarantee = str(rec.guarantee).trim() ? str(rec.guarantee) : undefined;

  if (
    differentiators.length === 0 &&
    marketingApproach.length === 0 &&
    performanceStats.length === 0 &&
    howWeWork.length === 0 &&
    !guarantee
  ) {
    return undefined;
  }

  const out: WhyUs = { differentiators, marketingApproach, performanceStats, howWeWork };
  if (guarantee) out.guarantee = guarantee;
  return out;
}
