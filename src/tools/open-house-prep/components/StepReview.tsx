'use client';

import { useState } from 'react';
import {
  validateForExport,
  type OpenHousePrepDraft,
} from '../engine/types';
import { useBrandSettings } from '@/lib/brand';

type StepId =
  | 'event-property'
  | 'comps'
  | 'talking-points'
  | 'notes-asks'
  | 'review';

interface StepReviewProps {
  draft: OpenHousePrepDraft;
  goToStep: (stepId: StepId) => void;
}

type PublishState =
  | { kind: 'idle' }
  | { kind: 'publishing' }
  | { kind: 'published'; slug: string }
  | { kind: 'revoking' }
  | { kind: 'revoked' }
  | { kind: 'error'; message: string };

type ExportState = 'idle' | 'downloading' | 'done' | { error: string };

function fieldLabel(field: string): { stepId: StepId; label: string } {
  switch (field) {
    case 'propertyAddress':
      return { stepId: 'event-property', label: 'property address' };
    case 'listPrice':
      return { stepId: 'event-property', label: 'list price' };
    case 'eventDate':
      return { stepId: 'event-property', label: 'event date' };
    default:
      return { stepId: 'event-property', label: field };
  }
}

export function StepReview({ draft, goToStep }: StepReviewProps) {
  const [publishState, setPublishState] = useState<PublishState>({ kind: 'idle' });
  const [exportState, setExportState] = useState<ExportState>('idle');
  const { settings: brand } = useBrandSettings();
  const missing = validateForExport(draft);

  const agentContact = {
    name: brand.agentName || '',
    brokerage: brand.brokerage || '',
    phone: brand.contactPhone || '',
    email: brand.contactEmail || '',
    licenseNumber: brand.licenseNumber || '',
  };

  async function handlePublish() {
    if (missing) return;
    setPublishState({ kind: 'publishing' });
    try {
      const res = await fetch('/api/oh-prep/publish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ draft, agentContact }),
      });
      const body = await res.json();
      if (!res.ok || !body.ok) {
        setPublishState({
          kind: 'error',
          message: body.error ?? `Publish failed (${res.status})`,
        });
        return;
      }
      setPublishState({ kind: 'published', slug: body.slug });
    } catch (err) {
      setPublishState({
        kind: 'error',
        message: err instanceof Error ? err.message : 'Publish failed',
      });
    }
  }

  async function handleRevoke(slug: string) {
    setPublishState({ kind: 'revoking' });
    try {
      const res = await fetch('/api/oh-prep/revoke', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug }),
      });
      const body = await res.json();
      if (!res.ok || !body.ok) {
        setPublishState({
          kind: 'error',
          message: body.error ?? `Revoke failed (${res.status})`,
        });
        return;
      }
      setPublishState({ kind: 'revoked' });
    } catch (err) {
      setPublishState({
        kind: 'error',
        message: err instanceof Error ? err.message : 'Revoke failed',
      });
    }
  }

  async function handleDownloadPrep() {
    if (missing) return;
    setExportState('downloading');
    try {
      const { downloadOpenHousePrepPdf } = await import('../output/pdf-export');
      await downloadOpenHousePrepPdf(draft, agentContact);
      setExportState('done');
      setTimeout(() => setExportState('idle'), 2000);
    } catch (err) {
      setExportState({
        error: err instanceof Error ? err.message : 'Export failed',
      });
    }
  }

  return (
    <div className="space-y-6">
      <header>
        <h2 className="text-lg font-medium">Review</h2>
        <p className="mt-1 text-xs text-gray-500">
          Check what you have, then publish the visitor handout link and download your private prep doc.
        </p>
      </header>

      {missing ? (
        <ValidationBlock missing={missing} goToStep={goToStep} />
      ) : (
        <div className="p-4 rounded border border-mint/40 bg-mint/5">
          <p className="text-sm text-mint font-medium">Ready to publish</p>
        </div>
      )}

      <section className="space-y-3 text-sm text-gray-300">
        <h3 className="text-xs uppercase tracking-wider text-gray-500">Summary</h3>
        <SummaryRow label="Property" value={draft.propertyAddress || '—'} />
        {draft.propertyCity && <SummaryRow label="City" value={draft.propertyCity} />}
        <SummaryRow label="List price" value={draft.listPrice || '—'} />
        <SummaryRow
          label="Event"
          value={
            draft.eventDate
              ? `${draft.eventDate}${draft.eventStartTime ? ` · ${draft.eventStartTime}` : ''}${draft.eventEndTime ? `–${draft.eventEndTime}` : ''}`
              : '—'
          }
        />
        <SummaryRow label="Comps" value={`${draft.comps.length} provided`} />
        <SummaryRow
          label="Talking points"
          value={`${draft.selectedTalkingPointIds.length} selected`}
        />
        <SummaryRow
          label="Common questions"
          value={`${draft.selectedCommonQuestionIds.length} selected`}
        />
        <SummaryRow
          label="Conversion prompts"
          value={`${draft.selectedConversionPromptIds.length} selected`}
        />
        <SummaryRow
          label="Neighborhood facts"
          value={`${draft.neighborhoodFacts.length}`}
        />
        <SummaryRow
          label="Commitments"
          value={`${draft.followUpCommitments.filter((c) => c.trim()).length}`}
        />
      </section>

      <div className="pt-4 border-t border-neutral-800 space-y-4">
        {!brand.agentName?.trim() && (
          <div className="p-3 border border-gold/40 bg-gold/10 rounded-md">
            <p className="text-sm text-gold">
              <strong>Brand profile incomplete.</strong> Your visitor handout will
              publish, but the &ldquo;Your agent&rdquo; section will be hidden
              because no agent name is set.{' '}
              <a href="/settings" className="underline hover:no-underline">
                Set up your brand profile
              </a>{' '}
              first if you want visitors to see your contact info.
            </p>
          </div>
        )}

        <PublishSection
          state={publishState}
          onPublish={handlePublish}
          onRevoke={handleRevoke}
          disabled={Boolean(missing)}
          propertyAddress={draft.propertyAddress}
        />

        <div className="flex flex-col gap-2">
          <button
            type="button"
            onClick={handleDownloadPrep}
            disabled={Boolean(missing) || exportState === 'downloading'}
            className="self-start px-5 py-2.5 text-sm font-medium rounded border border-mint/40 text-mint hover:bg-mint/10 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {exportState === 'downloading'
              ? 'Generating PDF…'
              : exportState === 'done'
                ? 'Downloaded ✓'
                : 'Download your prep doc (PDF)'}
          </button>
          {typeof exportState === 'object' && 'error' in exportState && (
            <p className="text-xs text-red-400">Export failed: {exportState.error}</p>
          )}
        </div>
      </div>
    </div>
  );
}

function PublishSection({
  state,
  onPublish,
  onRevoke,
  disabled,
  propertyAddress,
}: {
  state: PublishState;
  onPublish: () => void;
  onRevoke: (slug: string) => void;
  disabled: boolean;
  propertyAddress: string;
}) {
  if (state.kind === 'published') {
    const origin =
      typeof window !== 'undefined' ? window.location.origin : '';
    const url = `${origin}/h/${state.slug}`;
    const sample = `Hey — here's the info from today's open house at ${propertyAddress || 'the home'}: ${url}`;
    return (
      <div className="p-4 rounded border border-mint/40 bg-mint/5 space-y-3">
        <p className="text-sm text-mint font-medium">Handout published</p>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <code className="flex-1 px-3 py-2 rounded bg-neutral-900 border border-neutral-700 text-xs text-text-primary break-all">
            {url}
          </code>
          <button
            type="button"
            onClick={() => navigator.clipboard?.writeText(url)}
            className="px-3 py-2 text-xs rounded border border-neutral-700 text-text-primary hover:bg-neutral-800"
          >
            Copy URL
          </button>
        </div>
        <div>
          <p className="text-[11px] text-gray-500 uppercase tracking-wider mt-2">Sample text to send</p>
          <p className="mt-1 text-xs text-gray-300 leading-relaxed italic">
            {sample}
          </p>
          <button
            type="button"
            onClick={() => navigator.clipboard?.writeText(sample)}
            className="mt-2 px-3 py-1.5 text-[11px] rounded border border-neutral-700 text-text-primary hover:bg-neutral-800"
          >
            Copy sample text
          </button>
        </div>
        <div className="flex gap-3 pt-1">
          <button
            type="button"
            onClick={onPublish}
            className="text-xs text-mint hover:underline"
          >
            Publish again (new URL)
          </button>
          <button
            type="button"
            onClick={() => onRevoke(state.slug)}
            className="text-xs text-gray-500 hover:text-red-400"
          >
            Revoke this URL
          </button>
        </div>
      </div>
    );
  }

  if (state.kind === 'revoking') {
    return (
      <p className="text-xs text-gray-500 italic">Revoking handout…</p>
    );
  }

  if (state.kind === 'revoked') {
    return (
      <div className="p-4 rounded border border-neutral-800 bg-neutral-900 space-y-3">
        <p className="text-sm text-text-primary font-medium">Handout revoked</p>
        <p className="text-xs text-gray-500">
          The previous URL now returns a &ldquo;not available&rdquo; page. Publish again to share a fresh link.
        </p>
        <button
          type="button"
          onClick={onPublish}
          disabled={disabled}
          className="px-5 py-2.5 text-sm font-medium rounded bg-mint text-black hover:bg-mint-hover disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Publish handout
        </button>
      </div>
    );
  }

  if (state.kind === 'error') {
    return (
      <div className="p-4 rounded border border-red-500/40 bg-red-500/5 space-y-2">
        <p className="text-sm text-red-300 font-medium">Something went wrong</p>
        <p className="text-xs text-red-200/80">{state.message}</p>
        <button
          type="button"
          onClick={onPublish}
          disabled={disabled}
          className="px-5 py-2.5 text-sm font-medium rounded bg-mint text-black hover:bg-mint-hover disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Try again
        </button>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={onPublish}
      disabled={disabled || state.kind === 'publishing'}
      className="px-5 py-2.5 text-sm font-semibold rounded bg-mint text-black hover:bg-mint-hover disabled:opacity-40 disabled:cursor-not-allowed"
    >
      {state.kind === 'publishing' ? 'Publishing…' : 'Publish visitor handout'}
    </button>
  );
}

function ValidationBlock({
  missing,
  goToStep,
}: {
  missing: string;
  goToStep: (stepId: StepId) => void;
}) {
  const { stepId, label } = fieldLabel(missing);
  return (
    <div className="p-4 rounded border border-red-500/40 bg-red-500/5 space-y-3">
      <p className="text-sm text-red-300 font-medium">Missing: {label}</p>
      <button
        type="button"
        onClick={() => goToStep(stepId)}
        className="text-xs text-mint hover:underline"
      >
        Go back to fix →
      </button>
    </div>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline gap-3">
      <span className="text-xs uppercase tracking-wider text-gray-500 min-w-[160px]">
        {label}
      </span>
      <span className="flex-1">{value}</span>
    </div>
  );
}
