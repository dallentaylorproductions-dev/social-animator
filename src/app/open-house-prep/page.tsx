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
import { StepEventProperty } from '@/tools/open-house-prep/components/StepEventProperty';
import { StepComps } from '@/tools/open-house-prep/components/StepComps';
import { StepTalkingPoints } from '@/tools/open-house-prep/components/StepTalkingPoints';
import { StepNotesAsks } from '@/tools/open-house-prep/components/StepNotesAsks';
import { StepReview } from '@/tools/open-house-prep/components/StepReview';

/**
 * Open House Prep — 5-step wizard (OH Prep Commit 5).
 *
 * Commit 4 shipped the skeleton; this commit wires real per-step UX.
 * StepReview wires the publish flow (POST /api/oh-prep/publish) and
 * agent-prep PDF download. All other steps are field-input UX backed
 * by the OpenHousePrepDraft type from Commit 4.
 */

const STEPS = [
  { id: 'event-property', label: 'Event + property' },
  { id: 'comps', label: 'Recent area sales' },
  { id: 'talking-points', label: 'Talking points' },
  { id: 'notes-asks', label: 'Notes + asks' },
  { id: 'review', label: 'Review' },
] as const;

/**
 * Per-step required-field validation. v1.45.1 fix: Step 1 must gate
 * advancement so users don't click through 5 steps before learning their
 * required fields are empty. OH Prep's required Step 1 fields are
 * propertyAddress + listPrice + eventDate.
 *
 * Other steps don't gate — comp data, talking points, notes are all
 * optional past Step 1 (validateForExport on Review covers the rest).
 */
function isCurrentStepValid(
  stepId: (typeof STEPS)[number]['id'],
  draft: OpenHousePrepDraft | null,
): boolean {
  if (!draft) return false;
  if (stepId === 'event-property') {
    return (
      draft.propertyAddress.trim().length > 0 &&
      draft.listPrice.trim().length > 0 &&
      draft.eventDate.trim().length > 0
    );
  }
  return true;
}

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
        <a
          href="/dashboard"
          className="inline-flex items-center text-xs uppercase tracking-[0.18em] text-neutral-500 hover:text-mint mb-4 transition-colors"
        >
          ← Dashboard
        </a>
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
          <StepEventProperty draft={draft} setDraft={setDraft} />
        )}
        {currentStep === 'comps' && (
          <StepComps draft={draft} setDraft={setDraft} />
        )}
        {currentStep === 'talking-points' && (
          <StepTalkingPoints draft={draft} setDraft={setDraft} />
        )}
        {currentStep === 'notes-asks' && (
          <StepNotesAsks draft={draft} setDraft={setDraft} />
        )}
        {currentStep === 'review' && (
          <StepReview draft={draft} goToStep={setCurrentStep} />
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
          disabled={
            currentStep === STEPS[STEPS.length - 1].id ||
            !isCurrentStepValid(currentStep, draft)
          }
          className="px-4 py-2 text-sm bg-mint text-black font-medium rounded disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Next →
        </button>
      </nav>

      {currentStep === 'review' && (
        <div className="mt-8 pt-6 border-t border-neutral-800">
          <a
            href="/dashboard"
            className="inline-flex items-center text-sm text-neutral-400 hover:text-mint transition-colors"
          >
            Done — back to dashboard →
          </a>
        </div>
      )}
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
            idx <= currentIdx ? 'border-mint text-white' : 'border-gray-700 text-gray-500'
          }`}
        >
          {idx + 1}. {step.label}
        </li>
      ))}
    </ol>
  );
}
