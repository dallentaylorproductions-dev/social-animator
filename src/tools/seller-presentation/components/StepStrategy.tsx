"use client";

import { useEffect, useState } from "react";
import { CurrencyInput } from "@/components/inputs/CurrencyInput";
import { computeCompMedian } from "@/lib/seller-presentation/median";
import { PRICING_STRATEGIES } from "@/tools/seller-intelligence-report/content/pricing-strategies";
import { SP_STRATEGY_DISPLAY_LABELS } from "../content/strategy-display-labels";
import type {
  Comp,
  ConfidenceLevel,
  SellerPresentationDraft,
} from "../engine/types";

/**
 * Seller Presentation Step 3 — Pricing & strategy (Phase B3 redesign).
 *
 * Two-zone layout that makes the public/private cleavage legible at edit
 * time, ported onto B1's warm-dark `.sep-wizard` canvas:
 *
 *   🌐 SHOWN TO YOUR SELLER (reaches the published page)
 *     - recommendedPrice
 *     - priceRationale ("Why this price")
 *     - a comp-based proof line (From your comps · Median of N …)
 *
 *   🔒 JUST FOR YOUR PREP (prep PDF only — never published)
 *     - pricingStrategyId  ("arrives chosen", default market-aligned)
 *     - confidence         (how tight the comp set is)
 *
 * `toPublicPayload`'s allowlist enforces the boundary — only
 * `recommendedPrice` + `priceRationale` from this step reach the seller
 * page; `pricingStrategyId` + `confidence` stay on the prep PDF. B3 does
 * NOT touch the data model or the public-payload behavior.
 *
 * Median proof line: Phase A's `computeCompMedian` over the COUNTED comps
 * (`c.counted !== false` — same predicate Step 2's SummaryBand uses). It
 * returns `null` at zero counted comps, so the truthful-copy rule holds —
 * we render the calm fallback, never a fabricated number. The line
 * recomputes on every render, so editing comps on Step 2 updates it here
 * (shared draft via `useSellerPresentationState`).
 *
 * Pricing-strategy catalog is the SHARED canonical list at
 * `src/tools/seller-intelligence-report/content/pricing-strategies.ts`
 * (SIR + SP read the same IDs). SP shows its own DISPLAY labels via the
 * shared `SP_STRATEGY_DISPLAY_LABELS` map (B6 relocated it to
 * `../content/strategy-display-labels` so Step 6 Review can show the
 * same label); the catalog's formal names are unchanged (SIR's audience
 * + the prep PDF keep them). The
 * canonical `pricingStrategyId` is what persists — only the visible
 * label differs.
 *
 * Spec-stability: `data-testid` values `step-strategy`,
 * `step-strategy-strategy-{id}`, `step-strategy-confidence-{id}`,
 * `step-strategy-rationale`, and `aria-label="recommended-price"` are
 * preserved. The 4 strategy radios are always mounted (sr-only) as the
 * checked source-of-truth, decoupled from the visual collapse, so
 * `.check()` / `.toBeChecked()` resolve whether or not the "Change
 * approach" reveal is open.
 */

interface StepStrategyProps {
  draft: SellerPresentationDraft;
  setDraft: (next: SellerPresentationDraft) => void;
}

/** Default approach so the step "arrives chosen" (Phase 0 decision 3). */
const DEFAULT_STRATEGY_ID = "market-aligned";

/**
 * SP-specific display labels for the canonical pricing-strategy IDs.
 * SP's audience (agents in the wizard) sees these friendlier labels; the
 * shared catalog's formal `name` ("Strategic Pricing for Quick Sale" …)
 * stays the SIR + prep-PDF label. The map is the shared
 * `content/strategy-display-labels` module (B6 relocation) so Step 6's
 * Review summary can show the same label the agent picked here — NOT a
 * ripple into the shared catalog.
 */
const displayLabel = (id: string) => SP_STRATEGY_DISPLAY_LABELS[id] ?? id;

const CONFIDENCE_OPTIONS: ReadonlyArray<{
  id: ConfidenceLevel;
  label: string;
  blurb: string;
}> = [
  {
    id: "high",
    label: "High",
    blurb: "Tight comp set, under a 5% spread — you can hold a narrow range.",
  },
  {
    id: "medium",
    label: "Medium",
    blurb: "Mixed comps or thinner recent activity. Expect a moderate range.",
  },
  {
    id: "low",
    label: "Low",
    blurb: "Few comps or some outliers. Widen the range to absorb the uncertainty.",
  },
];

const isCountedPredicate = (c: Comp) => c.counted !== false;

/** Round to the nearest thousand for the "about $X" framing. */
function fmtAboutThousands(n: number): string {
  return "$" + (Math.round(n / 1000) * 1000).toLocaleString("en-US");
}

/* ---- icons ------------------------------------------------------- */
function IconGlobe() {
  return (
    <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18" />
      <path d="M12 3a14 14 0 0 1 0 18 14 14 0 0 1 0-18Z" />
    </svg>
  );
}
function IconLock() {
  return (
    <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="4.5" y="10.5" width="15" height="10" rx="2.2" />
      <path d="M8 10.5V7a4 4 0 0 1 8 0v3.5" />
    </svg>
  );
}

export function StepStrategy({ draft, setDraft }: StepStrategyProps) {
  const update = <K extends keyof SellerPresentationDraft>(
    key: K,
    value: SellerPresentationDraft[K],
  ) => setDraft({ ...draft, [key]: value });

  // "Arrives chosen" — persist the default approach the first time the
  // agent reaches Step 3 with no prior pick, so the prep PDF reflects the
  // approach the agent saw selected (Phase 0 decision 3, option b: B3
  // always defaults a strategy). No existing logic gates on the unset
  // state. Runs once: after it sets, `pricingStrategyId` is defined and
  // the effect's condition is false.
  useEffect(() => {
    if (draft.pricingStrategyId === undefined) {
      setDraft({ ...draft, pricingStrategyId: DEFAULT_STRATEGY_ID });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft.pricingStrategyId]);

  const [approachOpen, setApproachOpen] = useState(false);

  const selectedId = draft.pricingStrategyId ?? DEFAULT_STRATEGY_ID;
  const selected = PRICING_STRATEGIES.find((s) => s.id === selectedId);

  // Median proof line over the COUNTED comps. Null → calm fallback (no
  // fabricated number). Recomputes every render → reactive to Step 2.
  const medianResult = computeCompMedian(draft.comps, isCountedPredicate);

  const activeBlurb = draft.confidence
    ? CONFIDENCE_OPTIONS.find((o) => o.id === draft.confidence)?.blurb
    : "Pick how tight your comp set is — it sets the range you can defend.";

  return (
    <section className="strat" data-testid="step-strategy">
      <div className="sec-head">
        <h2 className="sec-title">Pricing &amp; strategy</h2>
        <p className="sec-sub">
          We started from your comps. Set the price and the note your
          seller will read.
        </p>
      </div>

      {/* ---------- Zone 1 — public ---------- */}
      <div className="strat-zone public" data-testid="step-strategy-public">
        <span className="zone-tag public">
          <IconGlobe /> Shown to your seller
        </span>
        <div className="zone-body">
          <label
            className="strat-field"
            data-testid="step-strategy-recommended-price"
          >
            <span className="field-label">Recommended price</span>
            <CurrencyInput
              className="input lg"
              value={draft.recommendedPrice ?? ""}
              onChange={(v) => update("recommendedPrice", v)}
              placeholder="$685,000"
              aria-label="recommended-price"
            />
            {medianResult ? (
              <span className="from-comps">
                <span className="from-comps-chip">From your comps</span>
                <span className="from-comps-line">
                  Median of your <strong>{medianResult.countedCount}</strong>{" "}
                  recent {medianResult.countedCount === 1 ? "sale" : "sales"} is
                  about{" "}
                  <strong>{fmtAboutThousands(medianResult.median)}</strong>.
                </span>
              </span>
            ) : (
              <span className="comp-fallback">
                Add comps on Step 2 to see your comp-based price.
              </span>
            )}
          </label>

          <label className="strat-field">
            <span className="field-label">
              Why this price{" "}
              <span className="lbl-soft">· your seller reads this</span>
            </span>
            <textarea
              className="input"
              rows={3}
              value={draft.priceRationale ?? ""}
              onChange={(e) =>
                update("priceRationale", e.target.value || undefined)
              }
              placeholder="A sentence or two for your seller."
              data-testid="step-strategy-rationale"
            />
          </label>
        </div>
      </div>

      {/* ---------- Zone 2 — private ---------- */}
      <div className="strat-zone private" data-testid="step-strategy-private">
        <span className="zone-tag private">
          <IconLock /> Just for your prep
        </span>
        <div className="zone-body">
          <div className="strat-field">
            <span className="field-label">Pricing approach</span>

            {/* Hidden radio group — always mounted; the checked source of
                truth + the canonical-ID testids. Decoupled from the
                collapse so the chosen radio (and the others) resolve
                whether or not the reveal is open. Visible cards below
                drive them via htmlFor. */}
            <div className="sr-only">
              {PRICING_STRATEGIES.map((s) => (
                <input
                  key={s.id}
                  id={`sp-strat-${s.id}`}
                  type="radio"
                  name="pricing-strategy"
                  value={s.id}
                  checked={selectedId === s.id}
                  onChange={() => {
                    update("pricingStrategyId", s.id);
                    setApproachOpen(false);
                  }}
                  data-testid={`step-strategy-strategy-${s.id}`}
                />
              ))}
            </div>

            {!approachOpen ? (
              <div className="approach-chosen">
                <span className="ac-text">
                  <span className="ac-label">{displayLabel(selectedId)}</span>
                  {selected && (
                    <span className="ac-desc">
                      {selected.oneLineDescription}
                    </span>
                  )}
                </span>
                <button
                  type="button"
                  className="approach-change"
                  onClick={() => setApproachOpen(true)}
                  data-testid="step-strategy-change-approach"
                >
                  Change approach
                </button>
              </div>
            ) : (
              <div
                className="approach-reveal"
                data-testid="step-strategy-approach-reveal"
              >
                {PRICING_STRATEGIES.map((s) => {
                  const on = selectedId === s.id;
                  return (
                    <label
                      key={s.id}
                      htmlFor={`sp-strat-${s.id}`}
                      className={"approach-opt" + (on ? " on" : "")}
                      data-testid={`step-strategy-option-${s.id}`}
                    >
                      <span className={"opt-dot" + (on ? " on" : "")} />
                      <span className="opt-text">
                        <span className="opt-label">{displayLabel(s.id)}</span>
                        <span className="opt-desc">
                          {s.oneLineDescription}
                        </span>
                      </span>
                    </label>
                  );
                })}
              </div>
            )}
          </div>

          <div className="conf">
            <span className="field-label">Comp-set confidence</span>
            <div
              className="conf-seg"
              role="radiogroup"
              aria-label="Comp-set confidence"
            >
              {CONFIDENCE_OPTIONS.map((o) => {
                const on = draft.confidence === o.id;
                return (
                  <label
                    key={o.id}
                    className={"conf-seg-btn" + (on ? " on" : "")}
                  >
                    <input
                      type="radio"
                      name="confidence"
                      value={o.id}
                      checked={on}
                      onChange={() => update("confidence", o.id)}
                      className="sr-only"
                      data-testid={`step-strategy-confidence-${o.id}`}
                    />
                    {o.label}
                  </label>
                );
              })}
            </div>
            <p className="conf-blurb">{activeBlurb}</p>
          </div>
        </div>
      </div>
    </section>
  );
}
