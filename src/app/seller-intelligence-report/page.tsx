'use client';

import { useEffect, useState } from 'react';
import type { SellerIntelligenceReportDraft } from '@/tools/seller-intelligence-report/engine/types';
import { loadDraft, saveDraft } from '@/tools/seller-intelligence-report/engine/draft-storage';
import { DEFAULT_SELECTED_OBJECTION_IDS } from '@/tools/seller-intelligence-report/content/objections';

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
        {currentStep === 'review' && <StepReview draft={draft} />}
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

// Placeholder step components for Commit 1. Full field UX lands in Commit 2.

interface StepProps {
  draft: SellerIntelligenceReportDraft;
  setDraft: (d: SellerIntelligenceReportDraft) => void;
}

function StepProperty(_props: StepProps) {
  return (
    <div className="space-y-4">
      <h2 className="text-lg font-medium">Property + pricing strategy</h2>
      <p className="text-sm text-gray-400">
        Property address, recommended price, pricing strategy, and your confidence in the comp set.
      </p>
      <p className="text-xs text-gray-500 italic">
        Full field UX coming in next commit. Wizard structure is in place.
      </p>
    </div>
  );
}

function StepComps(_props: StepProps) {
  return (
    <div className="space-y-4">
      <h2 className="text-lg font-medium">Comparable sales</h2>
      <p className="text-sm text-gray-400">
        Up to 4 comps. Each: address, sold price, days on market, sale-to-list ratio, square feet,
        distance, notes.
      </p>
      <p className="text-xs text-gray-500 italic">
        Full field UX coming in next commit. Wizard structure is in place.
      </p>
    </div>
  );
}

function StepObjections({ draft }: StepProps) {
  return (
    <div className="space-y-4">
      <h2 className="text-lg font-medium">Talking points</h2>
      <p className="text-sm text-gray-400">
        Pick which objections you want printed for this specific appointment. We&apos;ve pre-checked{' '}
        {DEFAULT_SELECTED_OBJECTION_IDS.length} universal ones.
      </p>
      <p className="text-xs text-gray-500 italic">
        Full multi-select UX coming in next commit. {draft.selectedObjectionIds.length} selected by
        default.
      </p>
    </div>
  );
}

function StepNotes(_props: StepProps) {
  return (
    <div className="space-y-4">
      <h2 className="text-lg font-medium">Notes, commitments, asks</h2>
      <p className="text-sm text-gray-400">
        Pre-appointment context, your promises if signed, and what you need from the seller.
      </p>
      <p className="text-xs text-gray-500 italic">
        Full field UX coming in next commit. Wizard structure is in place.
      </p>
    </div>
  );
}

function StepReview({ draft: _draft }: { draft: SellerIntelligenceReportDraft }) {
  return (
    <div className="space-y-4">
      <h2 className="text-lg font-medium">Review</h2>
      <p className="text-sm text-gray-400">When ready, you&apos;ll be able to download the PDF here.</p>
      <p className="text-xs text-gray-500 italic">PDF rendering coming in next commit.</p>
    </div>
  );
}
