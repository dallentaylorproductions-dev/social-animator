'use client';

import { useState } from 'react';
import { validateForExport, type SellerIntelligenceReportDraft } from '../engine/types';
import { computeRangeFromConfidence } from '../content/range-confidence';
import { getPricingStrategyById } from '../content/pricing-strategies';
import { downloadSellerIntelligenceReportPdf } from '../output/pdf-export';

type StepId = 'property' | 'comps' | 'objections' | 'notes' | 'review';

interface StepReviewProps {
  draft: SellerIntelligenceReportDraft;
  goToStep: (stepId: StepId) => void;
}

type ExportState =
  | { kind: 'idle' }
  | { kind: 'downloading' }
  | { kind: 'done' }
  | { kind: 'error'; message: string };

function fieldLocation(field: string): { stepId: StepId; label: string } {
  switch (field) {
    case 'propertyAddress':
      return { stepId: 'property', label: 'property address' };
    case 'recommendedListPrice':
      return { stepId: 'property', label: 'recommended list price' };
    case 'comps':
      return { stepId: 'comps', label: 'at least one comp' };
    case 'comps[0]':
      return { stepId: 'comps', label: 'first comp (address + sold price)' };
    default:
      return { stepId: 'property', label: field };
  }
}

export function StepReview({ draft, goToStep }: StepReviewProps) {
  const [state, setState] = useState<ExportState>({ kind: 'idle' });
  const missing = validateForExport(draft);
  const range = computeRangeFromConfidence(draft.recommendedListPrice, draft.confidence);
  const strategy = draft.pricingStrategyId
    ? getPricingStrategyById(draft.pricingStrategyId)
    : undefined;

  const onExport = async () => {
    if (missing) return;
    setState({ kind: 'downloading' });
    try {
      await downloadSellerIntelligenceReportPdf(draft);
      setState({ kind: 'done' });
      setTimeout(() => setState({ kind: 'idle' }), 2000);
    } catch (err) {
      setState({
        kind: 'error',
        message: err instanceof Error ? err.message : 'Export failed',
      });
    }
  };

  return (
    <div className="space-y-6">
      <header>
        <h2 className="text-lg font-medium">Review</h2>
        <p className="mt-1 text-xs text-gray-500">
          Quick check before you export. The PDF stays private to you.
        </p>
      </header>

      {missing ? (
        <ValidationBlock missing={missing} goToStep={goToStep} />
      ) : (
        <div className="p-4 rounded border border-[#4ef2d9]/40 bg-[#4ef2d9]/5">
          <p className="text-sm text-[#4ef2d9] font-medium">Ready to export</p>
        </div>
      )}

      <section className="space-y-3 text-sm text-gray-300">
        <h3 className="text-xs uppercase tracking-wider text-gray-500">Summary</h3>
        <SummaryRow label="Property" value={draft.propertyAddress || '—'} />
        {draft.propertyCity && <SummaryRow label="City" value={draft.propertyCity} />}
        <SummaryRow
          label="Recommended price"
          value={
            draft.recommendedListPrice
              ? range
                ? `${draft.recommendedListPrice}  ·  ${range.low} – ${range.high}`
                : draft.recommendedListPrice
              : '—'
          }
        />
        <SummaryRow
          label="Confidence"
          value={draft.confidence ?? 'medium (default)'}
        />
        <SummaryRow
          label="Pricing strategy"
          value={strategy?.name ?? '— (none selected)'}
        />
        <SummaryRow label="Comps" value={`${draft.comps.length} provided`} />
        <SummaryRow
          label="Talking points"
          value={`${draft.selectedObjectionIds.length} selected`}
        />
        <SummaryRow
          label="Commitments"
          value={`${draft.commitments.filter((c) => c.trim()).length}`}
        />
        <SummaryRow
          label="Asks"
          value={`${draft.asks.filter((a) => a.trim()).length}`}
        />
      </section>

      <div className="pt-4 border-t border-neutral-800 space-y-3">
        <button
          type="button"
          onClick={onExport}
          disabled={Boolean(missing) || state.kind === 'downloading'}
          className="px-5 py-2.5 text-sm font-medium rounded bg-[#4ef2d9] text-black hover:bg-[#3fd9c1] disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {state.kind === 'downloading'
            ? 'Generating PDF…'
            : state.kind === 'done'
              ? 'Downloaded ✓'
              : 'Download PDF'}
        </button>
        {state.kind === 'error' && (
          <p className="text-xs text-red-400">Export failed: {state.message}</p>
        )}
      </div>
    </div>
  );
}

function ValidationBlock({
  missing,
  goToStep,
}: {
  missing: string;
  goToStep: (stepId: StepId) => void;
}) {
  const { stepId, label } = fieldLocation(missing);
  return (
    <div className="p-4 rounded border border-red-500/40 bg-red-500/5 space-y-3">
      <p className="text-sm text-red-300 font-medium">Missing: {label}</p>
      <button
        type="button"
        onClick={() => goToStep(stepId)}
        className="text-xs text-[#4ef2d9] hover:underline"
      >
        Go back to fix →
      </button>
    </div>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline gap-3">
      <span className="text-xs uppercase tracking-wider text-gray-500 min-w-[140px]">
        {label}
      </span>
      <span className="flex-1">{value}</span>
    </div>
  );
}
