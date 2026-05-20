"use client";

import type { SellerPresentationDraft } from "../engine/types";

type StepId = "property" | "comps" | "strategy" | "pitch" | "review";

/**
 * Seller Presentation Step 5 — Review (v1.47 / A5a STUB).
 *
 * A5b adds a real review summary; A6 wires the publish + PDF buttons
 * (with the OH Prep StepReview state machine ported verbatim, swapping
 * the API path to /api/seller-presentation/publish and serializing
 * through toPublicPayload before persistence — closing the OH Prep
 * R-1 gap by construction).
 *
 * For A5a this stub renders a minimal summary and a Jump-to-Step-1
 * link that exercises the shell's `goToStep` plumbing.
 */

interface StepReviewProps {
  draft: SellerPresentationDraft;
  goToStep: (stepId: StepId) => void;
}

export function StepReview({ draft, goToStep }: StepReviewProps) {
  const populated = [
    draft.propertyAddress && "address",
    draft.propertyCity && "city",
    draft.recommendedPrice && "price",
    draft.comps.length > 0 && `${draft.comps.length} comp(s)`,
    draft.pitchPoints.length > 0 && `${draft.pitchPoints.length} pitch point(s)`,
  ].filter(Boolean);

  return (
    <div className="space-y-4" data-testid="step-review">
      <header>
        <h2 className="text-lg font-medium">Review</h2>
        <p className="mt-1 text-xs text-gray-500">
          Coming in A5b/A6 — summary blocks + publish (web page) + download
          (prep PDF) buttons.
        </p>
      </header>
      <div className="rounded border border-dashed border-neutral-700 p-6 text-sm text-neutral-500">
        <p>
          Step under construction. Populated fields:{" "}
          <strong>{populated.length > 0 ? populated.join(", ") : "none yet"}</strong>.
        </p>
        <button
          type="button"
          onClick={() => goToStep("property")}
          className="mt-3 text-xs text-mint hover:underline"
        >
          ← Jump back to Step 1 (property)
        </button>
      </div>
    </div>
  );
}
