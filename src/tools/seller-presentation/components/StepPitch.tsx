"use client";

import type { SellerPresentationDraft } from "../engine/types";

/**
 * Seller Presentation Step 4 — Pitch (v1.47 / A5a STUB).
 *
 * A5b builds the pitch-point editor with the public/private
 * visibility toggle that drives A6's public-payload allowlist.
 * This stub keeps the wizard traversable for the spine smoke.
 *
 * Lane C's copy-suggestion plug-point (the third entry in
 * SELLER_PRESENTATION_AI_PLUG_POINTS) plugs in here when it lands.
 */

interface StepPitchProps {
  draft: SellerPresentationDraft;
  setDraft: (next: SellerPresentationDraft) => void;
}

export function StepPitch({ draft }: StepPitchProps) {
  const publicCount = draft.pitchPoints.filter(
    (p) => p.visibility === "public",
  ).length;
  return (
    <div className="space-y-4" data-testid="step-pitch">
      <header>
        <h2 className="text-lg font-medium">Your pitch</h2>
        <p className="mt-1 text-xs text-gray-500">
          Coming in A5b — selling-points with per-point public/private toggle.
        </p>
      </header>
      <div className="rounded border border-dashed border-neutral-700 p-6 text-sm text-neutral-500">
        Step under construction. Draft has{" "}
        <strong>{draft.pitchPoints.length}</strong> pitch point
        {draft.pitchPoints.length === 1 ? "" : "s"} ({publicCount} public).
      </div>
    </div>
  );
}
