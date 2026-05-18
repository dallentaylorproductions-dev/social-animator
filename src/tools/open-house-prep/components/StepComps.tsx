'use client';

import type { Comp, OpenHousePrepDraft } from '../engine/types';
import { FieldHelp } from '@/tools/seller-intelligence-report/components/FieldHelp';
import { COMP_HINTS, getHintByIndex } from '@/lib/wizard-hints';

interface StepProps {
  draft: OpenHousePrepDraft;
  setDraft: (d: OpenHousePrepDraft) => void;
}

const MAX_COMPS = 4;
const inputCls =
  'w-full px-3 py-2 bg-neutral-900 border border-neutral-700 rounded text-sm focus:outline-none focus:border-mint';
const textareaCls = `${inputCls} resize-y min-h-[60px]`;

function newComp(): Comp {
  return { address: '', soldPrice: '', source: 'manual' };
}

export function StepComps({ draft, setDraft }: StepProps) {
  const updateComp = (idx: number, patch: Partial<Comp>) =>
    setDraft({
      ...draft,
      comps: draft.comps.map((c, i) => (i === idx ? { ...c, ...patch } : c)),
    });

  const addComp = () => {
    if (draft.comps.length >= MAX_COMPS) return;
    setDraft({ ...draft, comps: [...draft.comps, newComp()] });
  };

  const removeComp = (idx: number) =>
    setDraft({ ...draft, comps: draft.comps.filter((_, i) => i !== idx) });

  return (
    <div className="space-y-6">
      <header>
        <h2 className="text-lg font-medium">Recent area sales</h2>
        <p className="mt-1 text-xs text-gray-500">
          Up to {MAX_COMPS} comparable recent sales. Address + sold price are the meaningful fields; everything else fills in if you have it.
        </p>
      </header>

      {draft.comps.length === 0 && (
        <p className="text-sm text-gray-400 italic">
          Add at least one comp. Recent sales nearby are the most credible price-defense data on the handout.
        </p>
      )}

      <div className="space-y-4">
        {draft.comps.map((comp, idx) => {
          const hint = getHintByIndex(COMP_HINTS, idx);
          return (
          <div
            key={idx}
            className="p-4 rounded border border-neutral-700 space-y-4 bg-neutral-900/30"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-medium text-gray-300">Comp {idx + 1}</h3>
              <button
                type="button"
                onClick={() => removeComp(idx)}
                className="text-xs text-gray-500 hover:text-red-400"
              >
                Remove
              </button>
            </div>

            <FieldHelp label="Address" helpText="Street address.">
              <input
                type="text"
                className={inputCls}
                value={comp.address}
                onChange={(e) => updateComp(idx, { address: e.target.value })}
                placeholder={hint.address}
              />
            </FieldHelp>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <FieldHelp label="Sold price" helpText="Format as you want it printed.">
                <input
                  type="text"
                  className={inputCls}
                  value={comp.soldPrice}
                  onChange={(e) => updateComp(idx, { soldPrice: e.target.value })}
                  placeholder={hint.soldPrice}
                />
              </FieldHelp>
              <FieldHelp label="Days on market" helpText="How long it sat before pending.">
                <input
                  type="text"
                  className={inputCls}
                  value={comp.daysOnMarket ?? ''}
                  onChange={(e) =>
                    updateComp(idx, { daysOnMarket: e.target.value || undefined })
                  }
                  placeholder={hint.daysOnMarket}
                />
              </FieldHelp>
              <FieldHelp label="Sale-to-list %" helpText="e.g. 98%.">
                <input
                  type="text"
                  className={inputCls}
                  value={comp.saleToListPercent ?? ''}
                  onChange={(e) =>
                    updateComp(idx, { saleToListPercent: e.target.value || undefined })
                  }
                  placeholder={hint.saleToList}
                />
              </FieldHelp>
              <FieldHelp label="Square feet" helpText="Skip if not comparable.">
                <input
                  type="text"
                  className={inputCls}
                  value={comp.squareFeet ?? ''}
                  onChange={(e) =>
                    updateComp(idx, { squareFeet: e.target.value || undefined })
                  }
                  placeholder={hint.squareFeet}
                />
              </FieldHelp>
              <FieldHelp label="Distance (miles)" helpText="From the subject property.">
                <input
                  type="text"
                  className={inputCls}
                  value={comp.distanceMiles ?? ''}
                  onChange={(e) =>
                    updateComp(idx, { distanceMiles: e.target.value || undefined })
                  }
                  placeholder={hint.distance}
                />
              </FieldHelp>
              <FieldHelp label="Sold date" helpText="Recent sales carry more weight.">
                <input
                  type="text"
                  className={inputCls}
                  value={comp.soldDate ?? ''}
                  onChange={(e) =>
                    updateComp(idx, { soldDate: e.target.value || undefined })
                  }
                  placeholder="2026-04"
                />
              </FieldHelp>
            </div>

            <FieldHelp label="Notes" helpText="Why this comp matters. Shown on visitor handout.">
              <textarea
                className={textareaCls}
                value={comp.notes ?? ''}
                onChange={(e) =>
                  updateComp(idx, { notes: e.target.value || undefined })
                }
                placeholder={hint.notes}
              />
            </FieldHelp>
          </div>
        );
        })}
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
}
