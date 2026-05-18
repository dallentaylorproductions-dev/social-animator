'use client';

import { useEffect, useState } from 'react';
import type { OpenHousePrepDraft } from '@/tools/open-house-prep/engine/types';
import {
  loadDraft,
  saveDraft,
} from '@/tools/open-house-prep/engine/draft-storage';
import { DEFAULT_SELECTED_TALKING_POINT_IDS } from '@/tools/open-house-prep/content/talking-points';
import { DEFAULT_SELECTED_QUESTION_IDS } from '@/tools/open-house-prep/content/common-questions';
import { DEFAULT_SELECTED_PROMPT_IDS } from '@/tools/open-house-prep/content/conversion-prompts';

/**
 * Open House Prep — 5-step wizard skeleton (OH Prep Commit 4).
 *
 * Mirrors SIR Commit 1's skeleton pattern: real per-step UX lands in
 * Commit 5 (PDF + visitor handout + full field UX). This commit lays
 * the wizard structure + autosave + universal-default pre-selection
 * for the three content libraries.
 *
 * Steps (per Audit 1C):
 *   1. event-property — Event date + property identity
 *   2. comps — Recent area sales (up to 4 comps)
 *   3. talking-points — Talking points + common questions + conversion prompts
 *   4. notes-asks — Pre-event notes + follow-up commitments
 *   5. review — Validation + dual-export (PDF + URL)
 */

const STEPS = [
  { id: 'event-property', label: 'Event + property' },
  { id: 'comps', label: 'Recent area sales' },
  { id: 'talking-points', label: 'Talking points' },
  { id: 'notes-asks', label: 'Notes + asks' },
  { id: 'review', label: 'Review' },
] as const;

type StepId = (typeof STEPS)[number]['id'];

export default function OpenHousePrepPage() {
  const [draft, setDraft] = useState<OpenHousePrepDraft | null>(null);
  const [currentStep, setCurrentStep] = useState<StepId>('event-property');

  // Load draft on mount; apply universal defaults from each content library
  // on a fresh draft so the agent doesn't start with an empty selection.
  useEffect(() => {
    const loaded = loadDraft();
    if (loaded.selectedTalkingPointIds.length === 0) {
      loaded.selectedTalkingPointIds = [...DEFAULT_SELECTED_TALKING_POINT_IDS];
    }
    if (loaded.selectedCommonQuestionIds.length === 0) {
      loaded.selectedCommonQuestionIds = [...DEFAULT_SELECTED_QUESTION_IDS];
    }
    if (loaded.selectedConversionPromptIds.length === 0) {
      loaded.selectedConversionPromptIds = [...DEFAULT_SELECTED_PROMPT_IDS];
    }
    setDraft(loaded);
  }, []);

  // Auto-save draft on changes (post-hydration).
  useEffect(() => {
    if (draft) saveDraft(draft);
  }, [draft]);

  if (!draft) {
    return <div className="p-8 text-sm text-gray-400">Loading…</div>;
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <header className="mb-8">
        <h1 className="text-2xl font-semibold">Open House Prep</h1>
        <p className="mt-1 text-sm text-gray-400">
          Generate your private prep doc + a shareable visitor handout from one
          form. Step{' '}
          {STEPS.findIndex((s) => s.id === currentStep) + 1} of {STEPS.length}.
        </p>
      </header>

      <StepIndicator currentStep={currentStep} />

      <section className="mt-8 min-h-[400px]">
        {currentStep === 'event-property' && (
          <PlaceholderStep
            heading="Event + property"
            blurb="Property address, list price, event date and times, hero photo, and the 'why this home' positioning paragraph."
            commitNote="Full field UX coming in next commit. Wizard structure is in place."
          />
        )}
        {currentStep === 'comps' && (
          <PlaceholderStep
            heading="Recent area sales"
            blurb="Up to 4 comparable recent sales. Same shape as the Seller Intelligence Report comps — address, sold price, DOM, ratio, sqft, distance, sold date, agent notes."
            commitNote="Comp card UI coming in next commit."
          />
        )}
        {currentStep === 'talking-points' && (
          <PlaceholderStep
            heading="Talking points"
            blurb={`Pre-event prep: talking points, common visitor questions, conversion prompts. Universal defaults pre-checked (${DEFAULT_SELECTED_TALKING_POINT_IDS.length} talking points, ${DEFAULT_SELECTED_QUESTION_IDS.length} common questions, ${DEFAULT_SELECTED_PROMPT_IDS.length} conversion prompts).`}
            commitNote="Multi-select UX coming in next commit."
          />
        )}
        {currentStep === 'notes-asks' && (
          <PlaceholderStep
            heading="Notes + asks"
            blurb="Private pre-event notes (agent-facing only) and post-event follow-up commitments."
            commitNote="Note + commitment field UX coming in next commit."
          />
        )}
        {currentStep === 'review' && (
          <PlaceholderStep
            heading="Review"
            blurb="Validation summary and dual export — your private prep PDF (download) + visitor handout URL (text-friendly share link)."
            commitNote="PDF rendering + share-URL publish coming in next commit."
          />
        )}
      </section>

      <nav className="mt-8 flex justify-between">
        <button
          onClick={() => {
            const idx = STEPS.findIndex((s) => s.id === currentStep);
            if (idx > 0) setCurrentStep(STEPS[idx - 1].id);
          }}
          disabled={currentStep === STEPS[0].id}
          className="px-4 py-2 text-sm border border-gray-700 rounded disabled:opacity-50"
        >
          ← Previous
        </button>
        <button
          onClick={() => {
            const idx = STEPS.findIndex((s) => s.id === currentStep);
            if (idx < STEPS.length - 1) setCurrentStep(STEPS[idx + 1].id);
          }}
          disabled={currentStep === STEPS[STEPS.length - 1].id}
          className="px-4 py-2 text-sm bg-mint text-black font-medium rounded disabled:opacity-50"
        >
          Next →
        </button>
      </nav>
    </div>
  );
}

function StepIndicator({ currentStep }: { currentStep: StepId }) {
  const currentIdx = STEPS.findIndex((s) => s.id === currentStep);
  return (
    <ol className="flex gap-2 text-xs">
      {STEPS.map((step, idx) => (
        <li
          key={step.id}
          className={`flex-1 border-b-2 pb-2 ${
            idx <= currentIdx
              ? 'border-mint text-white'
              : 'border-gray-700 text-gray-500'
          }`}
        >
          {idx + 1}. {step.label}
        </li>
      ))}
    </ol>
  );
}

function PlaceholderStep({
  heading,
  blurb,
  commitNote,
}: {
  heading: string;
  blurb: string;
  commitNote: string;
}) {
  return (
    <div className="space-y-4">
      <h2 className="text-lg font-medium">{heading}</h2>
      <p className="text-sm text-gray-400">{blurb}</p>
      <p className="text-xs text-gray-500 italic">{commitNote}</p>
    </div>
  );
}
