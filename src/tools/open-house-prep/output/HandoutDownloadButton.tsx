'use client';

import { useState } from 'react';
import type { OpenHousePrepDraft } from '../engine/types';
import type { HandoutAgentContact } from './handout-page';

/**
 * Client-side Download PDF button for the visitor handout (OH Prep
 * Commit 5). Dynamic-imports the react-pdf renderer so it stays out
 * of the server bundle for /h/[slug]/page.tsx.
 *
 * Visitor-facing — uses the handout PDF variant (NOT the agent prep
 * PDF). Same 7-section content as the page, formatted for print.
 */
interface Props {
  draft: OpenHousePrepDraft;
  agentContact: HandoutAgentContact;
}

type ExportState = 'idle' | 'downloading' | 'done' | { error: string };

export function HandoutDownloadButton({ draft, agentContact }: Props) {
  const [state, setState] = useState<ExportState>('idle');

  async function handleDownload() {
    setState('downloading');
    try {
      const { downloadOpenHouseHandoutPdf } = await import('./pdf-export');
      await downloadOpenHouseHandoutPdf(draft, agentContact);
      setState('done');
      setTimeout(() => setState('idle'), 2000);
    } catch (err) {
      setState({
        error: err instanceof Error ? err.message : 'Download failed',
      });
    }
  }

  const label =
    state === 'downloading'
      ? 'Generating PDF…'
      : state === 'done'
        ? 'Downloaded ✓'
        : 'Download as PDF';
  const isError = typeof state === 'object' && 'error' in state;

  return (
    <div className="flex flex-col items-center gap-2">
      <button
        type="button"
        onClick={handleDownload}
        disabled={state === 'downloading'}
        className="inline-flex items-center justify-center rounded-full border border-border-emphasis text-text-primary text-sm font-medium px-5 py-3 transition hover:bg-surface-elevated disabled:opacity-50"
      >
        {label}
      </button>
      {isError && (
        <p className="text-xs text-red-400">Download failed: {state.error}</p>
      )}
    </div>
  );
}
