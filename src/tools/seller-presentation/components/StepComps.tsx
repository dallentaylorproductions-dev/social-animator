"use client";

import type { SellerPresentationDraft } from "../engine/types";

/**
 * Seller Presentation Step 2 — Comparable sales (v1.47 / A5a STUB).
 *
 * A5b builds the real comp editor. This stub keeps the wizard
 * traversable so the spine + storage + registration plumbing can
 * smoke end-to-end before any single step grows large.
 *
 * Integration seam reserved for Lane C: when the photo-to-comp
 * plug-point lands, it renders ABOVE the comp list as an opt-in
 * `<AIPlugPoint type="photo-to-comp" />` block. The skill record
 * (src/tools/seller-presentation/skill.ts) already declares the
 * plug-point shape — `SELLER_PRESENTATION_AI_PLUG_POINTS[0]`.
 *
 * Props mirror A5b's eventual full signature ({ draft, setDraft });
 * destructuring `draft` only for now because writes don't happen
 * until A5b — keeps lint happy without disable comments.
 */

interface StepCompsProps {
  draft: SellerPresentationDraft;
  setDraft: (next: SellerPresentationDraft) => void;
}

export function StepComps({ draft }: StepCompsProps) {
  return (
    <div className="space-y-4" data-testid="step-comps">
      <header>
        <h2 className="text-lg font-medium">Comparable sales</h2>
        <p className="mt-1 text-xs text-gray-500">
          Coming in A5b — Lane C&apos;s photo-to-comp plug-point will live here.
        </p>
      </header>
      <div className="rounded border border-dashed border-neutral-700 p-6 text-sm text-neutral-500">
        Step under construction. Draft currently carries{" "}
        <strong>{draft.comps.length}</strong> comp
        {draft.comps.length === 1 ? "" : "s"}.
      </div>
    </div>
  );
}
