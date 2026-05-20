"use client";

import type { SellerPresentationPlugPointType } from "../skill";

/**
 * AI plug-point seam (v1.47 / A5b — null component).
 *
 * Renders nothing. The component exists so wizard steps can declare
 * where Lane C's AI plug-points eventually land:
 *
 *   <AIPlugPoint type="photo-to-comp" /> at the top of StepComps
 *   <AIPlugPoint type="address-autofill" /> at the top of StepProperty
 *   <AIPlugPoint type="copy-suggestion" /> at the top of StepPitch
 *
 * The contract for each plug-point is declared on the skill record
 * (src/tools/seller-presentation/skill.ts —
 * `SELLER_PRESENTATION_AI_PLUG_POINTS`). Lane C (Prompt C) replaces
 * this null implementation with the real proposer UI — typically a
 * dismissable suggestion card above the manual form, with confidence
 * badges per cell for `photo-to-comp` and a per-proposal Accept /
 * Reject control that writes the chosen subset into the draft.
 *
 * Keeping it local to the seller-presentation tool for v1.47 — Lane C
 * may promote it to `src/skills/components/AIPlugPoint.tsx` if other
 * skills (Buyer Tour, future Authority) declare plug-points too.
 *
 * `onProposal` is reserved for the future signature where Lane C
 * proposes a value the step can accept into the draft. It's typed
 * `unknown` to keep this commit additive; each plug-point type will
 * narrow the proposal shape in Lane C.
 */

export interface AIPlugPointProps {
  type: SellerPresentationPlugPointType;
  onProposal?: (proposal: unknown) => void;
}

// Destructure nothing — same lint-clean idiom A5a uses for the stub
// step components when a prop is reserved but not yet consumed.
// eslint-disable-next-line @typescript-eslint/no-empty-object-pattern
export function AIPlugPoint({}: AIPlugPointProps): null {
  return null;
}
