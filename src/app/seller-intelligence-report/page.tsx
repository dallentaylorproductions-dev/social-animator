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
          className="px-4 py-2 text-sm bg-[#4ef2d9] text-black font-medium rounded disabled:opacity-50"
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
            idx <= currentIdx ? 'border-[#4ef2d9] text-white' : 'border-gray-700 text-gray-500'
          }`}
        >
          {idx + 1}. {step.label}
        </li>
      ))}
    </ol>
  );
}
