"use client";

import type { Comp } from "@/tools/seller-intelligence-report/engine/types";
import type { SellerPresentationDraft } from "../engine/types";

/**
 * Seller State A — the LEAN "nearby sales" step (invitation mode only).
 *
 * The prepared invitation deliberately carries no price and no comp analysis
 * (a real number means seeing the home first). But the dossier's flagship
 * "Nearby sales reviewed" artifact reads `whyPrice.comps`, so the agent needs a
 * light way to seed a few recent sales. This is that: ADDRESS ONLY. No sold
 * price, no days-on-market, no analysis — just the streets, which power the
 * Street View thumbnails in the published invitation and read as "I've already
 * looked around your block." Each row writes a minimal `Comp` ({address,
 * soldPrice: ""}) into `draft.comps`; the published page enriches them with
 * Street View exactly like the full comps step.
 *
 * Entirely OPTIONAL — when the agent adds none, the brief's nearby-sales block
 * flexes out cleanly (the whole file is honest-by-construction). This is an
 * interim input: Phase 2 will auto-pull these from the address via RentCast and
 * retire even this. Rendered ONLY in the invitation flow, so the full
 * presentation's `StepComps` (and flag-off) are untouched.
 */

const MAX_NEARBY = 4;

interface StepNearbySalesProps {
  draft: SellerPresentationDraft;
  setDraft: (next: SellerPresentationDraft) => void;
}

function nearbyComp(address: string): Comp {
  return { address, soldPrice: "", source: "manual" };
}

export function StepNearbySales({ draft, setDraft }: StepNearbySalesProps) {
  const comps = draft.comps ?? [];
  const canAdd = comps.length < MAX_NEARBY;

  // A trailing empty input lets the agent type the next address inline. The row
  // at index `comps.length` is that trailing slot; typing into it appends a new
  // comp (and a fresh trailing slot appears). Editing an existing row updates
  // it. We persist only non-empty addresses, so clearing a row removes it and
  // the draft never carries a hollow "Nearby" card.
  const rows: Array<{ address: string }> = canAdd
    ? [...comps, { address: "" }]
    : comps;

  const writeAt = (index: number, value: string) => {
    const base = comps.map((c) => ({ ...c }));
    if (index < base.length) {
      base[index] = { ...base[index], address: value };
    } else if (value.trim()) {
      base.push(nearbyComp(value));
    }
    const pruned = base
      .filter((c) => c.address.trim().length > 0)
      .slice(0, MAX_NEARBY);
    setDraft({ ...draft, comps: pruned });
  };

  const removeAt = (index: number) => {
    setDraft({ ...draft, comps: comps.filter((_, i) => i !== index) });
  };

  return (
    <section className="home" data-testid="step-nearby-sales">
      <div className="sec-head">
        <h2 className="sec-title">Nearby sales</h2>
        <p className="sec-sub">
          A few recent sales near your seller&apos;s home. Address only, no
          prices yet. They show up as &ldquo;nearby sales reviewed&rdquo; in the
          invitation, so it reads like you have already done your homework.
        </p>
      </div>

      <div className="fields sa-nearby">
        {rows.map((row, index) => {
          const isExisting = index < comps.length;
          return (
            <div className="sa-nearby__row" key={index}>
              <input
                type="text"
                className="input"
                value={row.address}
                onChange={(e) => writeAt(index, e.target.value)}
                placeholder={
                  index === 0
                    ? "742 N Cedar St"
                    : "Another recent sale nearby"
                }
                aria-label={`Nearby sale ${index + 1} address`}
                data-testid={`step-nearby-sales-address-${index}`}
              />
              {isExisting && (
                <button
                  type="button"
                  className="sa-nearby__remove"
                  onClick={() => removeAt(index)}
                  aria-label={`Remove nearby sale ${index + 1}`}
                  data-testid={`step-nearby-sales-remove-${index}`}
                >
                  ✕
                </button>
              )}
            </div>
          );
        })}

        <p className="hint">
          {comps.length > 0
            ? `${comps.length} added. Leave it here, or add a couple more up to ${MAX_NEARBY}.`
            : "Optional. Skip it and the invitation simply leaves this out."}
        </p>
      </div>

      <p className="autosave-note">
        <span className="dot-live" /> Saved automatically.
      </p>
    </section>
  );
}
