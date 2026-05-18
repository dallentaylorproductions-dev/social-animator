'use client';

import type {
  NeighborhoodFact,
  OpenHousePrepDraft,
} from '../engine/types';
import { FieldHelp } from '@/tools/seller-intelligence-report/components/FieldHelp';
import {
  COMMITMENT_HINTS,
  NEIGHBORHOOD_FACT_HINTS,
  getHintByIndex,
} from '@/lib/wizard-hints';

interface StepProps {
  draft: OpenHousePrepDraft;
  setDraft: (d: OpenHousePrepDraft) => void;
}

const MAX_COMMITMENTS = 10;
const MAX_FACTS = 6;
const inputCls =
  'w-full px-3 py-2 bg-neutral-900 border border-neutral-700 rounded text-sm focus:outline-none focus:border-mint';
const textareaCls = `${inputCls} resize-y min-h-[100px]`;

export function StepNotesAsks({ draft, setDraft }: StepProps) {
  const updateFact = (idx: number, patch: Partial<NeighborhoodFact>) =>
    setDraft({
      ...draft,
      neighborhoodFacts: draft.neighborhoodFacts.map((f, i) =>
        i === idx ? { ...f, ...patch } : f,
      ),
    });

  const addFact = () => {
    if (draft.neighborhoodFacts.length >= MAX_FACTS) return;
    setDraft({
      ...draft,
      neighborhoodFacts: [...draft.neighborhoodFacts, { label: '', value: '' }],
    });
  };

  const removeFact = (idx: number) =>
    setDraft({
      ...draft,
      neighborhoodFacts: draft.neighborhoodFacts.filter((_, i) => i !== idx),
    });

  const updateCommitment = (idx: number, text: string) =>
    setDraft({
      ...draft,
      followUpCommitments: draft.followUpCommitments.map((c, i) =>
        i === idx ? text : c,
      ),
    });

  const addCommitment = () => {
    if (draft.followUpCommitments.length >= MAX_COMMITMENTS) return;
    setDraft({
      ...draft,
      followUpCommitments: [...draft.followUpCommitments, ''],
    });
  };

  const removeCommitment = (idx: number) =>
    setDraft({
      ...draft,
      followUpCommitments: draft.followUpCommitments.filter((_, i) => i !== idx),
    });

  return (
    <div className="space-y-6">
      <header>
        <h2 className="text-lg font-medium">Notes, neighborhood, and commitments</h2>
        <p className="mt-1 text-xs text-gray-500">
          Pre-event notes (private), neighborhood quick-facts (shown on the visitor handout), market context, and your post-event follow-up commitments.
        </p>
      </header>

      <FieldHelp
        label="Pre-event notes"
        helpText="Private context that won't show on the visitor handout. Things you want to remember walking in."
      >
        <textarea
          className={textareaCls}
          value={draft.preEventNotes ?? ''}
          onChange={(e) =>
            setDraft({ ...draft, preEventNotes: e.target.value || undefined })
          }
          placeholder="Two buyers have walked through twice. Husband is the decision-maker."
        />
      </FieldHelp>

      <FieldHelp
        label="Neighborhood at a glance"
        helpText="4–6 quick facts about the area — walk score, schools, median price, commute, etc. Shown on the visitor handout."
      >
        <div className="space-y-2">
          {draft.neighborhoodFacts.length === 0 && (
            <p className="text-xs text-gray-500 italic">No facts added yet.</p>
          )}
          {draft.neighborhoodFacts.map((fact, idx) => {
            const factHint = getHintByIndex(NEIGHBORHOOD_FACT_HINTS, idx);
            return (
            <div key={idx} className="flex gap-2 items-start">
              <input
                type="text"
                className={`${inputCls} flex-1`}
                value={fact.label}
                onChange={(e) => updateFact(idx, { label: e.target.value })}
                placeholder={factHint.label}
              />
              <input
                type="text"
                className={`${inputCls} flex-1`}
                value={fact.value}
                onChange={(e) => updateFact(idx, { value: e.target.value })}
                placeholder={factHint.value}
              />
              <button
                type="button"
                onClick={() => removeFact(idx)}
                aria-label="Remove"
                className="px-3 py-2 text-xs text-gray-500 hover:text-red-400 border border-neutral-800 rounded"
              >
                ✕
              </button>
            </div>
            );
          })}
          <button
            type="button"
            onClick={addFact}
            disabled={draft.neighborhoodFacts.length >= MAX_FACTS}
            className="px-3 py-1.5 text-xs border border-neutral-700 rounded hover:border-neutral-500 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            + Add fact {draft.neighborhoodFacts.length >= MAX_FACTS && `(max ${MAX_FACTS})`}
          </button>
        </div>
      </FieldHelp>

      <FieldHelp
        label="Market context"
        helpText="2–3 sentence positioning statement — your read on the local market. Shown on the visitor handout."
      >
        <textarea
          className={textareaCls}
          value={draft.marketContext ?? ''}
          onChange={(e) =>
            setDraft({ ...draft, marketContext: e.target.value || undefined })
          }
          placeholder="The market in this area is…"
        />
      </FieldHelp>

      <FieldHelp
        label="Follow-up commitments"
        helpText="What you'll do after the event with the visitors you connected with. Appears in your private prep doc."
      >
        <div className="space-y-2">
          {draft.followUpCommitments.length === 0 && (
            <p className="text-xs text-gray-500 italic">No commitments yet.</p>
          )}
          {draft.followUpCommitments.map((c, idx) => {
            const commitHint = getHintByIndex(COMMITMENT_HINTS, idx);
            return (
            <div key={idx} className="flex gap-2 items-start">
              <input
                type="text"
                className={inputCls}
                value={c}
                onChange={(e) => updateCommitment(idx, e.target.value)}
                placeholder={commitHint}
              />
              <button
                type="button"
                onClick={() => removeCommitment(idx)}
                aria-label="Remove"
                className="px-3 py-2 text-xs text-gray-500 hover:text-red-400 border border-neutral-800 rounded"
              >
                ✕
              </button>
            </div>
            );
          })}
          <button
            type="button"
            onClick={addCommitment}
            disabled={draft.followUpCommitments.length >= MAX_COMMITMENTS}
            className="px-3 py-1.5 text-xs border border-neutral-700 rounded hover:border-neutral-500 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            + Add commitment{' '}
            {draft.followUpCommitments.length >= MAX_COMMITMENTS && `(max ${MAX_COMMITMENTS})`}
          </button>
        </div>
      </FieldHelp>
    </div>
  );
}
