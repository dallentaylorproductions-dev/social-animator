'use client';

import type { Comp, SellerIntelligenceReportDraft } from '../engine/types';
import { FieldHelp } from './FieldHelp';
import { COMP_HINTS, getHintByIndex } from '@/lib/wizard-hints';

interface StepProps {
  draft: SellerIntelligenceReportDraft;
  setDraft: (d: SellerIntelligenceReportDraft) => void;
}

const MAX_COMPS = 4;

const inputCls =
  'w-full px-3 py-2 bg-neutral-900 border border-neutral-700 rounded text-sm focus:outline-none focus:border-mint';

const textareaCls = `${inputCls} resize-y min-h-[60px]`;

function newComp(): Comp {
  return {
    address: '',
    soldPrice: '',
    source: 'manual',
  };
}

export function StepComps({ draft, setDraft }: StepProps) {
  const updateComp = (index: number, patch: Partial<Comp>) => {
    const next = draft.comps.map((c, i) => (i === index ? { ...c, ...patch } : c));
    setDraft({ ...draft, comps: next });
  };

  const addComp = () => {
    if (draft.comps.length >= MAX_COMPS) return;
    setDraft({ ...draft, comps: [...draft.comps, newComp()] });
  };

  const removeComp = (index: number) => {
    setDraft({ ...draft, comps: draft.comps.filter((_, i) => i !== index) });
  };

  return (
    <div className="space-y-6">
      <header>
        <h2 className="text-lg font-medium">Comparable sales</h2>
        <p className="mt-1 text-xs text-gray-500">
          Add up to {MAX_COMPS} comps. Address and Sold Price are required; everything else is
          optional. Skip what you don&apos;t have.
        </p>
      </header>

      {draft.comps.length === 0 && (
        <p className="text-sm text-gray-400 italic">
          No comps yet. Add at least one — it&apos;s how the recommended price gets defended.
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
        className="px-4 py-2 text-sm border border-mint text-mint rounded hover:bg-mint/10 disabled:opacity-40 disabled:cursor-not-allowed"
      >
        + Add comp {draft.comps.length >= MAX_COMPS && `(max ${MAX_COMPS})`}
      </button>
    </div>
  );

  function CompCard({
    comp,
    index,
    onUpdate,
    onRemove,
  }: {
    comp: Comp;
    index: number;
    onUpdate: (patch: Partial<Comp>) => void;
    onRemove: () => void;
  }) {
    const hint = getHintByIndex(COMP_HINTS, index);
    return (
      <div className="p-4 rounded border border-neutral-700 space-y-4 bg-neutral-900/30">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-medium text-gray-300">Comp {index + 1}</h3>
          <button
            type="button"
            onClick={onRemove}
            className="text-xs text-gray-500 hover:text-red-400"
          >
            Remove
          </button>
        </div>

        <FieldHelp label="Address" required helpText="Street address.">
          <input
            type="text"
            className={inputCls}
            value={comp.address}
            onChange={(e) => onUpdate({ address: e.target.value })}
            placeholder={hint.address}
          />
        </FieldHelp>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <FieldHelp
            label="Sold price"
            required
            helpText="Format as you want it printed (e.g. $685,000)."
          >
            <input
              type="text"
              className={inputCls}
              value={comp.soldPrice}
              onChange={(e) => onUpdate({ soldPrice: e.target.value })}
              placeholder={hint.soldPrice}
            />
          </FieldHelp>

          <FieldHelp label="Days on market" helpText="How long it sat before pending.">
            <input
              type="text"
              className={inputCls}
              value={comp.daysOnMarket ?? ''}
              onChange={(e) => onUpdate({ daysOnMarket: e.target.value || undefined })}
              placeholder={hint.daysOnMarket}
            />
          </FieldHelp>

          <FieldHelp
            label="Sale-to-list %"
            helpText="e.g. 98%. Skip if you don't have it."
          >
            <input
              type="text"
              className={inputCls}
              value={comp.saleToListPercent ?? ''}
              onChange={(e) =>
                onUpdate({ saleToListPercent: e.target.value || undefined })
              }
              placeholder={hint.saleToList}
            />
          </FieldHelp>

          <FieldHelp label="Square feet" helpText="Skip if not comparable.">
            <input
              type="text"
              className={inputCls}
              value={comp.squareFeet ?? ''}
              onChange={(e) => onUpdate({ squareFeet: e.target.value || undefined })}
              placeholder={hint.squareFeet}
            />
          </FieldHelp>

          <FieldHelp
            label="Distance (miles)"
            helpText="Distance from the subject property."
          >
            <input
              type="text"
              className={inputCls}
              value={comp.distanceMiles ?? ''}
              onChange={(e) => onUpdate({ distanceMiles: e.target.value || undefined })}
              placeholder={hint.distance}
            />
          </FieldHelp>

          <FieldHelp label="Sold date" helpText="Recent comps carry more weight.">
            <input
              type="text"
              className={inputCls}
              value={comp.soldDate ?? ''}
              onChange={(e) => onUpdate({ soldDate: e.target.value || undefined })}
              placeholder="2026-04 or April 2026"
            />
          </FieldHelp>
        </div>

        <FieldHelp
          label="Notes"
          helpText="Why this comp matters or doesn't. Will appear in the printed report."
        >
          <textarea
            className={textareaCls}
            value={comp.notes ?? ''}
            onChange={(e) => onUpdate({ notes: e.target.value || undefined })}
            placeholder={hint.notes}
          />
        </FieldHelp>
      </div>
    );
  }
}
