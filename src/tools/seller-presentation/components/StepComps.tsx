"use client";

import { CurrencyInput } from "@/components/inputs/CurrencyInput";
import { NumberInput } from "@/components/inputs/NumberInput";
import type { Comp, SellerPresentationDraft } from "../engine/types";
import { AIPlugPoint } from "./AIPlugPoint";

/**
 * Seller Presentation Step 2 — Comparable sales (v1.47 / A5b LIVE).
 *
 * ≤4 comps editor over the substrate-shape `Comp` (re-exported from
 * SIR's engine). Address + Sold Price are required for export per the
 * skill contract (`comps: 'required'`); everything else is optional.
 *
 * Public / private split (substrate §4 + A6's `toPublicPayload`):
 *   - PUBLIC per-comp: address, soldPrice, daysOnMarket,
 *     saleToListPercent, squareFeet, distanceMiles, soldDate
 *   - PRIVATE per-comp: notes (agent commentary), source,
 *     fieldConfidence
 *
 * A6's serializer projects `comps[].public` from these. The split is
 * load-bearing — the inline label on the Notes field telegraphs it
 * to the agent so they know notes won't reach the seller.
 *
 * Lane C seam: `<AIPlugPoint type="photo-to-comp" />` at the top of
 * the step renders null today. Lane C (Prompt C) replaces it with
 * the photo-to-comp proposer per the contract on
 * `SELLER_PRESENTATION_AI_PLUG_POINTS[0]` (proposes to `comps`,
 * requires review, falls back to manual entry).
 */

interface StepCompsProps {
  draft: SellerPresentationDraft;
  setDraft: (next: SellerPresentationDraft) => void;
}

const MAX_COMPS = 4;

const inputCls =
  "w-full px-3 py-2 bg-neutral-900 border border-neutral-700 rounded text-sm focus:outline-none focus:border-mint";

const textareaCls = `${inputCls} resize-y min-h-[60px]`;

function newComp(): Comp {
  return {
    address: "",
    soldPrice: "",
    source: "manual",
  };
}

export function StepComps({ draft, setDraft }: StepCompsProps) {
  const updateComp = (index: number, patch: Partial<Comp>) => {
    const next = draft.comps.map((c, i) =>
      i === index ? { ...c, ...patch } : c,
    );
    setDraft({ ...draft, comps: next });
  };

  const addComp = () => {
    if (draft.comps.length >= MAX_COMPS) return;
    setDraft({ ...draft, comps: [...draft.comps, newComp()] });
  };

  const removeComp = (index: number) => {
    setDraft({
      ...draft,
      comps: draft.comps.filter((_, i) => i !== index),
    });
  };

  return (
    <div className="space-y-6" data-testid="step-comps">
      <header>
        <h2 className="text-lg font-medium">Comparable sales</h2>
        <p className="mt-1 text-xs text-gray-500">
          Recent nearby sales. These power the price story buyers see.
        </p>
      </header>

      {/* Lane C seam — renders null today. The skill contract declares
          the photo-to-comp plug-point on this step; Lane C swaps in the
          proposer UI without StepComps needing to change. */}
      <AIPlugPoint type="photo-to-comp" />

      {draft.comps.length === 0 && (
        <p className="text-sm italic text-gray-400">
          No comps yet. Add at least one. The published page needs comps to
          justify the recommended price.
        </p>
      )}

      <div className="space-y-4">
        {draft.comps.map((comp, index) => (
          <CompCard
            key={index}
            comp={comp}
            index={index}
            onUpdate={(patch) => updateComp(index, patch)}
            onRemove={() => removeComp(index)}
          />
        ))}
      </div>

      <button
        type="button"
        onClick={addComp}
        disabled={draft.comps.length >= MAX_COMPS}
        data-testid="step-comps-add"
        className="rounded border border-mint px-4 py-2 text-sm text-mint hover:bg-mint/10 disabled:cursor-not-allowed disabled:opacity-40"
      >
        + Add comp{" "}
        {draft.comps.length >= MAX_COMPS && `(max ${MAX_COMPS})`}
      </button>
    </div>
  );
}

interface CompCardProps {
  comp: Comp;
  index: number;
  onUpdate: (patch: Partial<Comp>) => void;
  onRemove: () => void;
}

function CompCard({ comp, index, onUpdate, onRemove }: CompCardProps) {
  return (
    <div
      className="space-y-4 rounded border border-neutral-700 bg-neutral-900/30 p-4"
      data-testid={`step-comps-card-${index}`}
    >
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-gray-300">Comp {index + 1}</h3>
        <button
          type="button"
          onClick={onRemove}
          className="text-xs text-gray-500 hover:text-red-400"
          data-testid={`step-comps-remove-${index}`}
        >
          Remove
        </button>
      </div>

      <label className="block">
        <span className="text-xs uppercase tracking-wider text-gray-500">
          Address *
        </span>
        <input
          type="text"
          className={`${inputCls} mt-1`}
          value={comp.address}
          onChange={(e) => onUpdate({ address: e.target.value })}
          placeholder="1234 Elm Ave NE"
          data-testid={`step-comps-address-${index}`}
        />
      </label>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="text-xs uppercase tracking-wider text-gray-500">
            Sold price *
          </span>
          <CurrencyInput
            className={`${inputCls} mt-1`}
            value={comp.soldPrice}
            onChange={(v) => onUpdate({ soldPrice: v })}
            placeholder="$685,000"
            aria-label={`comp-${index + 1}-sold-price`}
          />
        </label>

        <label className="block">
          <span className="text-xs uppercase tracking-wider text-gray-500">
            Days on market
          </span>
          {/* A7c.1: numeric integer keypad on iOS. */}
          <input
            type="text"
            inputMode="numeric"
            className={`${inputCls} mt-1`}
            value={comp.daysOnMarket ?? ""}
            onChange={(e) =>
              onUpdate({
                daysOnMarket: e.target.value.replace(/[^0-9]/g, "") || undefined,
              })
            }
            placeholder="11"
          />
        </label>

        <label className="block">
          <span className="text-xs uppercase tracking-wider text-gray-500">
            Sale-to-list %
          </span>
          {/* A7c.1: decimal keypad (the plain numeric pad omits the
              dot, blocking fractional ratios like 101.5). Auto-
              append "%" on blur if missing AND content present, so
              the stored value reads consistently ("98%") for the
              renderer. Doesn't fight the user mid-edit. */}
          <input
            type="text"
            inputMode="decimal"
            className={`${inputCls} mt-1`}
            value={comp.saleToListPercent ?? ""}
            onChange={(e) =>
              onUpdate({ saleToListPercent: e.target.value || undefined })
            }
            onBlur={(e) => {
              const raw = e.target.value.trim();
              if (!raw) {
                onUpdate({ saleToListPercent: undefined });
                return;
              }
              const next = raw.endsWith("%") ? raw : `${raw}%`;
              if (next !== raw) onUpdate({ saleToListPercent: next });
            }}
            placeholder="98%"
          />
        </label>

        <label className="block">
          <span className="text-xs uppercase tracking-wider text-gray-500">
            Square feet
          </span>
          <NumberInput
            className={`${inputCls} mt-1`}
            value={comp.squareFeet ?? ""}
            onChange={(v) => onUpdate({ squareFeet: v || undefined })}
            placeholder="2,840"
          />
        </label>

        <label className="block">
          <span className="text-xs uppercase tracking-wider text-gray-500">
            Distance (miles)
          </span>
          {/* A7c.1: decimal keypad so sub-mile distances (0.4) are
              typeable on iOS — the plain numeric pad omits the dot. */}
          <input
            type="text"
            inputMode="decimal"
            className={`${inputCls} mt-1`}
            value={comp.distanceMiles ?? ""}
            onChange={(e) =>
              onUpdate({ distanceMiles: e.target.value || undefined })
            }
            placeholder="0.4"
          />
        </label>

        <label className="block">
          <span className="text-xs uppercase tracking-wider text-gray-500">
            Sold date
          </span>
          {/* A7c.1: native date picker opens the iOS calendar. Stored
              as ISO YYYY-MM-DD which the renderer displays verbatim
              (e.g. "Sold 2026-04-15") — agents can leave a free-text
              date format intact on older drafts (the field accepts
              any value via Comp.soldDate?: string; the date picker
              just shows blank if the existing value isn't ISO-shaped). */}
          <input
            type="date"
            className={`${inputCls} mt-1`}
            value={comp.soldDate ?? ""}
            onChange={(e) =>
              onUpdate({ soldDate: e.target.value || undefined })
            }
          />
        </label>
      </div>

      <label className="block">
        <span className="text-xs uppercase tracking-wider text-gray-500">
          Notes
          <span className="ml-2 text-[10px] normal-case tracking-normal text-neutral-500">
            🔒 private. Stays on your prep doc, never on the seller page.
          </span>
        </span>
        <textarea
          className={`${textareaCls} mt-1`}
          value={comp.notes ?? ""}
          onChange={(e) => onUpdate({ notes: e.target.value || undefined })}
          placeholder="Why this comp matters or doesn't"
        />
      </label>
    </div>
  );
}
