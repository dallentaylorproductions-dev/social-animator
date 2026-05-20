/**
 * Seller Presentation — engine types (v1.47 / A5a)
 *
 * Per-skill draft for the converged WorkflowInstance shape. The
 * storage layer (src/skills/workflow-instance-storage.ts) treats
 * `draft` as opaque; this module owns its structure.
 *
 * A5a only the Step 1 (Property) fields are LIVE. Steps 2–5 fields
 * are declared on the type (so the draft is shape-stable across the
 * commit boundary) but the wizard stubs don't touch them; A5b fills
 * them in. `clampDraft` accepts any historical shape (defense-at-
 * boundary, mirroring SIR + OH Prep) so a v1 draft re-opened after
 * A5b adds fields doesn't crash.
 *
 * `Comp` is re-imported from the SIR engine — the substrate-shape
 * Comp (carrying `source` + `fieldConfidence` for Lane C's photo-to-
 * comp plug-point) already lives there and shouldn't be duplicated.
 */

import type { Comp } from "@/tools/seller-intelligence-report/engine/types";

export type { Comp };

export type ConfidenceLevel = "high" | "medium" | "low";

export type PitchPointVisibility = "public" | "private";

export interface PitchPoint {
  /** Local UUID for stable list editing across reorders / deletes. */
  id: string;
  text: string;
  /** Drives the public-payload allowlist (A6) — only `public` points reach the published web page. */
  visibility: PitchPointVisibility;
}

export interface SellerPresentationDraft {
  // ---- Step 1: Property (A5a LIVE) ----
  /**
   * Snapshot of the resolved Property primitive id at the time the
   * agent advanced past Step 1. The wizard shell also writes this
   * onto WorkflowInstance.resolvedPrimitives.propertyId so the
   * runtime + dashboard can read it without inspecting the draft.
   */
  propertyId?: string;
  propertyAddress?: string;
  propertyCity?: string;

  // ---- Step 3 (A5b): Pricing & strategy ----
  recommendedPrice?: string;
  /** Short public-safe rationale (≠ pricingStrategyId / confidence, which are private). */
  priceRationale?: string;
  pricingStrategyId?: string;
  confidence?: ConfidenceLevel;

  // ---- Step 2 (A5b): Comparable sales ----
  comps: Comp[];

  // ---- Step 4 (A5b): Pitch ----
  pitchPoints: PitchPoint[];

  // ---- Step 5 (A5b): Review ----
  preAppointmentNotes?: string;
  commitments: string[];
  asks: string[];

  // ---- Optional cross-step refs ----
  /** Stable Client id when the SP is personalized ("for the Johnsons"). */
  clientId?: string;
  /** Premium theme id (A7); empty/absent = default Base theme. */
  themeId?: string;
}

export const EMPTY_DRAFT: SellerPresentationDraft = {
  comps: [],
  pitchPoints: [],
  commitments: [],
  asks: [],
};

const VALID_CONFIDENCE: readonly ConfidenceLevel[] = ["high", "medium", "low"];

const VALID_PITCH_VISIBILITY: readonly PitchPointVisibility[] = [
  "public",
  "private",
];

function clampString(v: unknown): string | undefined {
  return typeof v === "string" && v.length > 0 ? v : undefined;
}

function clampPitchPoint(raw: unknown): PitchPoint | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.id !== "string" || typeof r.text !== "string") return null;
  return {
    id: r.id,
    text: r.text,
    visibility: VALID_PITCH_VISIBILITY.includes(r.visibility as PitchPointVisibility)
      ? (r.visibility as PitchPointVisibility)
      : "private",
  };
}

/**
 * Normalize a draft from any historical shape. Defense-at-boundary
 * mirror of SIR's clampDraft pattern: types stay strict; the helper
 * coalesces missing arrays / strings to safe defaults so a partial
 * draft (loaded from a pre-A5b instance) renders without crashing.
 */
export function clampDraft(
  raw: Partial<SellerPresentationDraft> | null | undefined,
): SellerPresentationDraft {
  if (!raw) return { ...EMPTY_DRAFT };
  return {
    propertyId: clampString(raw.propertyId),
    propertyAddress: clampString(raw.propertyAddress),
    propertyCity: clampString(raw.propertyCity),
    recommendedPrice: clampString(raw.recommendedPrice),
    priceRationale: clampString(raw.priceRationale),
    pricingStrategyId: clampString(raw.pricingStrategyId),
    confidence: VALID_CONFIDENCE.includes(raw.confidence as ConfidenceLevel)
      ? (raw.confidence as ConfidenceLevel)
      : undefined,
    comps: Array.isArray(raw.comps) ? raw.comps.slice(0, 4) : [],
    pitchPoints: Array.isArray(raw.pitchPoints)
      ? raw.pitchPoints
          .map(clampPitchPoint)
          .filter((p): p is PitchPoint => p !== null)
      : [],
    preAppointmentNotes: clampString(raw.preAppointmentNotes),
    commitments: Array.isArray(raw.commitments)
      ? raw.commitments.filter((s): s is string => typeof s === "string").slice(0, 10)
      : [],
    asks: Array.isArray(raw.asks)
      ? raw.asks.filter((s): s is string => typeof s === "string").slice(0, 10)
      : [],
    clientId: clampString(raw.clientId),
    themeId: clampString(raw.themeId),
  };
}

/**
 * True iff Step 1 (Property) is fully cleared — a saved Property
 * primitive id AND a non-empty address. The wizard shell uses this
 * to gate Step 1's "Next" button.
 */
export function isStepPropertyComplete(draft: SellerPresentationDraft): boolean {
  return Boolean(draft.propertyId && draft.propertyAddress?.trim());
}

/**
 * Field keys (per the skill contract) currently empty on the draft.
 * Single source of truth for export gating — both the runtime's
 * SkillStatus.missingRequiredInputs (which surfaces blockers in the
 * dashboard) and StepReview's pre-publish validation (which renders
 * "Missing: X → Go back to fix →") read from this.
 *
 * Mirrors the skill record's `inputs.required`: propertyAddress is
 * always required; recommendedPrice is required for export (gates the
 * agent prep PDF + the published web page); comps require at least
 * one row with address + soldPrice (the published page renders the
 * price-justification table from `comps[].public`).
 */
export function getMissingRequiredInputs(
  draft: SellerPresentationDraft,
): string[] {
  const missing: string[] = [];
  if (!draft.propertyAddress?.trim()) missing.push("propertyAddress");
  if (!draft.recommendedPrice?.trim()) missing.push("recommendedPrice");
  if (draft.comps.length === 0) {
    missing.push("comps");
  } else if (
    !draft.comps[0].address.trim() ||
    !draft.comps[0].soldPrice.trim()
  ) {
    missing.push("comps[0]");
  }
  return missing;
}

/**
 * The single field key blocking export, or null when none. Convenience
 * over `getMissingRequiredInputs[0]` for the StepReview / button paths
 * that only show one blocker at a time. Mirrors the SIR + OH Prep
 * `validateForExport` shape.
 */
export function validateForExport(
  draft: SellerPresentationDraft,
): string | null {
  return getMissingRequiredInputs(draft)[0] ?? null;
}
