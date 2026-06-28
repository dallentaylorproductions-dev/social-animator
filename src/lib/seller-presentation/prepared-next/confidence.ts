/**
 * PREPARED_NEXT — confidence buckets (rule-derived, NOT model-rated).
 *
 * The Follow-Up Recap Asset Contract:
 *   - hard_required: seller page link · agent identity · property/page subject ·
 *     public payload content.
 *   - enrichment (missing one does NOT block): seller name · seller motivation ·
 *     appointment timing · richer profile voice · viewed timestamp.
 *   - CTA is enrichment with the code-constant fallback (always appended, never blocks).
 *
 * Buckets:
 *   - enough  → ALL hard_required present AND >=3 bullet candidates → prepare.
 *   - partial → ALL hard_required present, but an ASKABLE enrichment is missing OR
 *     only 2 candidates → prepare AND optionally ask the single `ask_field`.
 *   - weak    → ANY hard_required missing OR <2 candidates → do NOT draft (zero spend).
 *
 * Why "askable enrichment" (seller name, appointment timing) gates the bucket,
 * not the full enrichment list: those are the only two with an `ask_field`, and
 * the ask is HARD-CAPPED at one (priority: seller name → appointment timing).
 * Seller motivation has no public source and can never be asked, profile voice
 * has the neutral-voice floor, and the viewed timestamp always rides the Moment —
 * so none of those would ever change behavior, and folding them into the bucket
 * would make `enough` unreachable. The downgrade set is exactly the askable pair.
 */

import type { PublicPayload } from "@/tools/seller-presentation/output/public-payload";
import type { BulletCandidate } from "./bullets";

export type Confidence = "enough" | "partial" | "weak";

/** The single follow-up question to optionally ask, by fixed priority. */
export type AskField = "seller_name" | "appointment_timing";

export interface ConfidenceResult {
  confidence: Confidence;
  /** Present ONLY on `partial`, and at most one (the first missing askable field). */
  askField: AskField | null;
  availableContext: string[];
  missingContext: string[];
}

function present(value: unknown): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

/**
 * Decide the bucket from the public payload + the extracted candidates. PURE so
 * the route and the unit tests share one verdict.
 *
 * `sellerName` defaults to the payload's `preparedFor`; the route may pass an
 * agent-supplied answer (the one `ask_field`) to upgrade a later prepare.
 */
export function resolveConfidence(
  payload: PublicPayload,
  candidates: BulletCandidate[],
  opts: { sellerName?: string } = {},
): ConfidenceResult {
  const candidateCount = candidates.length;

  // hard_required.
  const hasPageContent = candidates.length > 0 || Boolean(payload);
  const hasAgentIdentity = present(payload.agent?.name) || present(payload.agentBranding?.name);
  const hasSubject =
    present(payload.propertyAddress) || present(payload.property?.address);
  // The page link is always derivable from the slug at the call site, so it is
  // structurally present whenever we have a payload to prepare from.
  const hardRequired: Array<[string, boolean]> = [
    ["page link", true],
    ["agent identity", hasAgentIdentity],
    ["page subject", hasSubject],
    ["page content", hasPageContent],
  ];
  const missingHard = hardRequired.filter(([, ok]) => !ok).map(([k]) => k);

  // enrichment.
  const sellerName = present(opts.sellerName)
    ? opts.sellerName!.trim()
    : present(payload.preparedFor)
      ? payload.preparedFor!.trim()
      : "";
  const hasSellerName = present(sellerName);
  const hasAppointment = present(payload.appointmentAt);
  const hasProfileVoice =
    present(payload.agentTagline) ||
    present(payload.signatureLine) ||
    Boolean(payload.whyUs);

  const availableContext: string[] = [];
  const missingContext: string[] = [...missingHard];
  if (hasSellerName) availableContext.push("seller name");
  else missingContext.push("seller name");
  if (hasAppointment) availableContext.push("appointment timing");
  else missingContext.push("appointment timing");
  if (hasProfileVoice) availableContext.push("profile voice");
  else missingContext.push("profile voice");
  // Seller motivation is never in the public payload — always an honest gap.
  missingContext.push("seller motivation");

  // weak: any hard_required missing OR fewer than 2 candidates → no draft, no spend.
  if (missingHard.length > 0 || candidateCount < 2) {
    return { confidence: "weak", askField: null, availableContext, missingContext };
  }

  // The ONE askable enrichment, by fixed priority (cap of one).
  const askField: AskField | null = !hasSellerName
    ? "seller_name"
    : !hasAppointment
      ? "appointment_timing"
      : null;

  // enough: a full, well-grounded page — >=3 candidates AND both askable fields present.
  if (candidateCount >= 3 && askField === null) {
    return { confidence: "enough", askField: null, availableContext, missingContext };
  }

  // partial: draftable, optionally ask one question.
  return { confidence: "partial", askField, availableContext, missingContext };
}
