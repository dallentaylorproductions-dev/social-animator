"use client";

import { CurrencyInput } from "@/components/inputs/CurrencyInput";
import { PRICING_STRATEGIES } from "@/tools/seller-intelligence-report/content/pricing-strategies";
import type {
  ConfidenceLevel,
  SellerPresentationDraft,
} from "../engine/types";

/**
 * Seller Presentation Step 3 — Pricing & strategy (v1.47 / A5b LIVE).
 *
 * Visually splits the step into two sections so the agent sees the
 * public/private cleavage at edit time:
 *
 *   🌐 PUBLIC (appears on the seller's page)
 *     - recommendedPrice
 *     - priceRationale
 *
 *   🔒 PRIVATE (your prep doc only)
 *     - pricingStrategyId  (which framework you're using)
 *     - confidence         (how tight the comp set is)
 *
 * A6's `toPublicPayload` enforces this — the public-payload allowlist
 * (`['propertyAddress','recommendedPrice','priceRationale','comps.public',
 * 'agentBranding','pitchPublicPoints']`) emits ONLY the two public
 * fields above from this step. The two private fields stay in the
 * agent prep PDF and never reach the published web page.
 *
 * Pricing-strategy catalog is borrowed from
 * `src/tools/seller-intelligence-report/content/pricing-strategies.ts`
 * — same frameworks the SIR uses, kept canonical in one place.
 */

interface StepStrategyProps {
  draft: SellerPresentationDraft;
  setDraft: (next: SellerPresentationDraft) => void;
}

const inputCls =
  "w-full px-3 py-2 bg-neutral-900 border border-neutral-700 rounded text-sm focus:outline-none focus:border-mint";
const textareaCls = `${inputCls} resize-y min-h-[100px]`;

const CONFIDENCE_OPTIONS: ReadonlyArray<{
  id: ConfidenceLevel;
  label: string;
  blurb: string;
}> = [
  {
    id: "high",
    label: "High",
    blurb: "Tight comp set, ≤5% spread, recent — narrow defensible range.",
  },
  {
    id: "medium",
    label: "Medium",
    blurb: "Mixed comps or sparse recent activity — moderate range.",
  },
  {
    id: "low",
    label: "Low",
    blurb: "Thin comp set or outliers — wider range to absorb uncertainty.",
  },
];

export function StepStrategy({ draft, setDraft }: StepStrategyProps) {
  const update = <K extends keyof SellerPresentationDraft>(
    key: K,
    value: SellerPresentationDraft[K],
  ) => setDraft({ ...draft, [key]: value });

  return (
    <div className="space-y-8" data-testid="step-strategy">
      <header>
        <h2 className="text-lg font-medium">Pricing &amp; strategy</h2>
        <p className="mt-1 text-xs text-gray-500">
          Two halves: what the seller sees vs. what stays on your prep doc.
        </p>
      </header>

      {/* ---------- Public half ---------- */}
      <section
        className="space-y-5 rounded border border-mint/30 bg-mint/[0.03] p-5"
        data-testid="step-strategy-public"
      >
        <h3 className="flex items-center gap-2 text-sm font-medium text-mint">
          <span aria-hidden>🌐</span> Public — appears on the seller&apos;s page
        </h3>

        <label className="block">
          <span className="text-xs uppercase tracking-wider text-gray-500">
            Recommended price *
          </span>
          <CurrencyInput
            className={`${inputCls} mt-1`}
            value={draft.recommendedPrice ?? ""}
            onChange={(v) => update("recommendedPrice", v)}
            placeholder="$685,000"
            aria-label="recommended-price"
          />
        </label>

        <label className="block">
          <span className="text-xs uppercase tracking-wider text-gray-500">
            Price rationale (short)
          </span>
          <textarea
            className={`${textareaCls} mt-1`}
            value={draft.priceRationale ?? ""}
            onChange={(e) =>
              update("priceRationale", e.target.value || undefined)
            }
            placeholder="Two-three sentences the seller will read explaining the recommended price."
            data-testid="step-strategy-rationale"
          />
          <span className="mt-1 block text-[11px] text-neutral-500">
            This text shows on the published page — keep it agent-voice, not
            internal reasoning.
          </span>
        </label>
      </section>

      {/* ---------- Private half ---------- */}
      <section
        className="space-y-5 rounded border border-neutral-700 bg-neutral-900/30 p-5"
        data-testid="step-strategy-private"
      >
        <h3 className="flex items-center gap-2 text-sm font-medium text-neutral-300">
          <span aria-hidden>🔒</span> Private — your prep doc only
        </h3>

        <fieldset className="space-y-3">
          <legend className="text-xs uppercase tracking-wider text-gray-500">
            Pricing strategy framework
          </legend>
          <div className="space-y-2">
            {PRICING_STRATEGIES.map((strategy) => {
              const checked = draft.pricingStrategyId === strategy.id;
              return (
                <label
                  key={strategy.id}
                  className={`flex cursor-pointer items-start gap-3 rounded border p-3 transition ${
                    checked
                      ? "border-mint bg-mint/5"
                      : "border-neutral-700 hover:border-neutral-600"
                  }`}
                >
                  <input
                    type="radio"
                    name="pricing-strategy"
                    value={strategy.id}
                    checked={checked}
                    onChange={() => update("pricingStrategyId", strategy.id)}
                    className="mt-1"
                    data-testid={`step-strategy-strategy-${strategy.id}`}
                  />
                  <span>
                    <span className="text-sm text-text-primary">
                      {strategy.name}
                    </span>
                    <span className="mt-1 block text-xs text-neutral-400">
                      {strategy.oneLineDescription}
                    </span>
                  </span>
                </label>
              );
            })}
          </div>
        </fieldset>

        <fieldset className="space-y-3">
          <legend className="text-xs uppercase tracking-wider text-gray-500">
            Comp-set confidence
          </legend>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            {CONFIDENCE_OPTIONS.map((option) => {
              const checked = draft.confidence === option.id;
              return (
                <label
                  key={option.id}
                  className={`flex cursor-pointer flex-col gap-1 rounded border p-3 text-sm transition ${
                    checked
                      ? "border-mint bg-mint/5"
                      : "border-neutral-700 hover:border-neutral-600"
                  }`}
                >
                  <input
                    type="radio"
                    name="confidence"
                    value={option.id}
                    checked={checked}
                    onChange={() => update("confidence", option.id)}
                    className="sr-only"
                    data-testid={`step-strategy-confidence-${option.id}`}
                  />
                  <span className="font-medium text-text-primary">
                    {option.label}
                  </span>
                  <span className="text-[11px] text-neutral-500">
                    {option.blurb}
                  </span>
                </label>
              );
            })}
          </div>
        </fieldset>
      </section>
    </div>
  );
}
