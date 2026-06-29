/**
 * PREPARED_NEXT — confidence buckets (rule-derived, NOT model-rated).
 *
 * v0.5 minimal-claims recap: the recap no longer re-pitches page data, so it no
 * longer depends on bullet candidates. A warm re-open is preparable whenever the
 * page has a property subject (always true for a viewed published page), so the
 * bucket is decided by the safe, factual fields only:
 *
 *   - hard_required: seller page link · agent identity · property/page subject.
 *   - weak    → a hard_required is missing → do NOT draft (effectively never, for
 *     a real published page).
 *   - partial → preparable, but the seller name is unknown → optionally ask the
 *     single `ask_field` ("seller_name"). Still drafts (warm, no name).
 *   - enough  → preparable and the seller name is known.
 *
 * The thin-profile neutral-voice floor + no-fake-personalization are preserved by
 * design: the recap always uses the calm neutral house voice and never invents a
 * name (enforced in the generation prompt). `extractBulletCandidates` is no longer
 * consulted here.
 */

import type { PublicPayload } from "@/tools/seller-presentation/output/public-payload";

export type Confidence = "enough" | "partial" | "weak";

/** The single follow-up question to optionally ask (v0.5: seller name only). */
export type AskField = "seller_name";

export interface ConfidenceResult {
  confidence: Confidence;
  /** Present ONLY on `partial`: the seller name is unknown and may be asked. */
  askField: AskField | null;
  availableContext: string[];
  missingContext: string[];
}

function present(value: unknown): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

/**
 * Decide the bucket from the public payload alone (no bullet candidates). PURE so
 * the route and the unit tests share one verdict.
 *
 * `sellerName` defaults to the payload's `preparedFor`; the route may pass an
 * agent-supplied answer (the one `ask_field`) to upgrade a later prepare.
 */
export function resolveConfidence(
  payload: PublicPayload,
  opts: { sellerName?: string } = {},
): ConfidenceResult {
  // hard_required (the page link is always derivable from the slug at the call
  // site, so it is structurally present whenever we have a payload).
  const hasAgentIdentity =
    present(payload.agent?.name) || present(payload.agentBranding?.name);
  const hasSubject =
    present(payload.propertyAddress) || present(payload.property?.address);
  const hardRequired: Array<[string, boolean]> = [
    ["page link", true],
    ["agent identity", hasAgentIdentity],
    ["page subject", hasSubject],
  ];
  const missingHard = hardRequired.filter(([, ok]) => !ok).map(([k]) => k);

  // The one safe optional field that drives the lone ask_field.
  const sellerName = present(opts.sellerName)
    ? opts.sellerName!.trim()
    : present(payload.preparedFor)
      ? payload.preparedFor!.trim()
      : "";
  const hasSellerName = present(sellerName);
  const hasAppointment = present(payload.appointmentAt);

  const availableContext: string[] = [];
  const missingContext: string[] = [...missingHard];
  if (hasSellerName) availableContext.push("seller name");
  else missingContext.push("seller name");
  if (hasAppointment) availableContext.push("appointment timing");

  // weak: a hard_required is missing → no draft, no spend. (Effectively never for
  // a real published page, which always has an agent + a property subject.)
  if (missingHard.length > 0) {
    return { confidence: "weak", askField: null, availableContext, missingContext };
  }

  // partial: preparable, but ask for the seller name when it is unknown.
  if (!hasSellerName) {
    return { confidence: "partial", askField: "seller_name", availableContext, missingContext };
  }

  // enough: preparable and the seller name is known.
  return { confidence: "enough", askField: null, availableContext, missingContext };
}
