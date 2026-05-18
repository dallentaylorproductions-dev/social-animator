'use client';

import { useEffect, useState } from 'react';
import type { SellerIntelligenceReportDraft } from '@/tools/seller-intelligence-report/engine/types';
import { loadDraft, saveDraft } from '@/tools/seller-intelligence-report/engine/draft-storage';
import { DEFAULT_SELECTED_OBJECTION_IDS } from '@/tools/seller-intelligence-report/content/objections';
import { StepProperty } from '@/tools/seller-intelligence-report/components/StepProperty';
import { StepComps } from '@/tools/seller-intelligence-report/components/StepComps';
import { StepObjections } from '@/tools/seller-intelligence-report/components/StepObjections';
import { StepNotes } from '@/tools/seller-intelligence-report/components/StepNotes';
import { StepReview } from '@/tools/seller-intelligence-report/components/StepReview';

const STEPS = [
  { id: 'property', label: 'Property + pricing' },
  { id: 'comps', label: 'Comps' },
  { id: 'objections', label: 'Talking points' },
  { id: 'notes', label: 'Notes + asks' },
  { id: 'review', label: 'Review' },
] as const;

type StepId = (typeof STEPS)[number]['id'];

/**
 * Per-step required-field validation. v1.45.1 fix: Step 1 advances were
 * not gated, so users could click through 5 steps before learning Step 1
 * was incomplete. Now the Next button disables on Step 1 until the SIR's
 * required fields (propertyAddress + recommendedListPrice) are non-empty.
 *
 * Other steps don't gate — comp data, talking points, notes are all
 * optional past Step 1 (validateForExport on the Review step covers
 * comp+price+address). Step 1 is the only must-fill gate.
 *
 * v1.45.2 hardening: coerce-safe trim via String(value ?? '') so a
 * non-string field default (e.g. undefined or a number from a malformed
 * legacy draft) doesn't throw. The Next button click handler also
 * re-checks this before advancing — belt and suspenders against any
 * disabled-prop binding issue.
 */
function isCurrentStepValid(
  stepId: StepId,
  draft: SellerIntelligenceReportDraft | null,
): boolean {
  if (!draft) return false;
  if (stepId === 'property') {
    return (
      String(draft.propertyAddress ?? '').trim().length > 0 &&
      String(draft.recommendedListPrice ?? '').trim().length > 0
    );
  }
  return true;
}

export default function SellerIntelligenceReportPage() {
  const [draft, setDraft] = useState<SellerIntelligenceReportDraft | null>(null);
  const [currentStep, setCurrentStep] = useState<StepId>('property');

  // Load draft on mount; initialize default-selected objections if fresh draft.
  useEffect(() => {
    const loaded = loadDraft();
    if (loaded.selectedObjectionIds.length === 0) {
      loaded.selectedObjectionIds = [...DEFAULT_SELECTED_OBJECTION_IDS];
    }
    setDraft(loaded);
  }, []);

  // Save draft whenever it changes.
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
        <h1 className="text-2xl font-semibold">Seller Intelligence Report</h1>
        <p className="mt-1 text-sm text-gray-400">
          Your private prep document for a listing appointment. Step{' '}
          {STEPS.findIndex((s) => s.id === currentStep) + 1} of {STEPS.length}.
        </p>
      </header>

      <StepIndicator currentStep={currentStep} />

      <section className="mt-8 min-h-[400px]">
        {currentStep === 'property' && <StepProperty draft={draft} setDraft={setDraft} />}
        {currentStep === 'comps' && <StepComps draft={draft} setDraft={setDraft} />}
        {currentStep === 'objections' && <StepObjections draft={draft} setDraft={setDraft} />}
        {currentStep === 'notes' && <StepNotes draft={draft} setDraft={setDraft} />}
        {currentStep === 'review' && <StepReview draft={draft} goToStep={setCurrentStep} />}
      </section>

      <nav className="mt-8 flex justify-between">
        <button
          type="button"
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
          type="button"
          onClick={() => {
            // v1.45.2 P1-R01 hardening: re-check validity in the click
            // handler. Belt-and-suspenders against any disabled-prop
            // binding regression (the v2 QA smoke caught one such case
            // on the v1.45.1 production deploy where the styled disable
            // didn't actually block clicks).
            if (!isCurrentStepValid(currentStep, draft)) return;
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
