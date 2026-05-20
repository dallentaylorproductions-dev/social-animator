"use client";

import type { SellerPresentationDraft } from "../engine/types";

/**
 * Seller Presentation Step 3 — Pricing & strategy (v1.47 / A5a STUB).
 *
 * A5b builds the real fields: recommendedPrice, priceRationale
 * (public-safe), pricingStrategyId + confidence (private). This
 * stub keeps the wizard traversable for the spine smoke.
 *
 * Props mirror A5b's eventual full signature ({ draft, setDraft });
 * `setDraft` deliberately not destructured until writes happen.
 */

interface StepStrategyProps {
  draft: SellerPresentationDraft;
  setDraft: (next: SellerPresentationDraft) => void;
}

export function StepStrategy({ draft }: StepStrategyProps) {
  const summary = draft.recommendedPrice
    ? `Recommended price draft value: ${draft.recommendedPrice}`
    : "No recommended price set yet.";
  return (
    <div className="space-y-4" data-testid="step-strategy">
      <header>
        <h2 className="text-lg font-medium">Pricing &amp; strategy</h2>
        <p className="mt-1 text-xs text-gray-500">
          Coming in A5b — recommended price + public-safe rationale + private
          strategy/confidence.
        </p>
      </header>
      <div className="rounded border border-dashed border-neutral-700 p-6 text-sm text-neutral-500">
        Step under construction. {summary}
      </div>
    </div>
  );
}
