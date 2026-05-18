'use client';

import type { SellerIntelligenceReportDraft } from '../engine/types';
import { FieldHelp } from './FieldHelp';
import {
  ASK_HINTS,
  COMMITMENT_HINTS,
  getHintByIndex,
} from '@/lib/wizard-hints';

interface StepProps {
  draft: SellerIntelligenceReportDraft;
  setDraft: (d: SellerIntelligenceReportDraft) => void;
}

const MAX_BULLETS = 10;

const inputCls =
  'w-full px-3 py-2 bg-neutral-900 border border-neutral-700 rounded text-sm focus:outline-none focus:border-mint';

const textareaCls = `${inputCls} resize-y min-h-[100px]`;

export function StepNotes({ draft, setDraft }: StepProps) {
  return (
    <div className="space-y-6">
      <header>
        <h2 className="text-lg font-medium">Notes, commitments, asks</h2>
        <p className="mt-1 text-xs text-gray-500">
          Pre-appointment context for yourself, plus the promises and asks you&apos;ll bring to the
          conversation.
        </p>
      </header>

      <FieldHelp
        label="Pre-appointment notes"
        helpText="Private context that won't be shown to the seller. Anything you want to remember walking in."
      >
        <textarea
          className={textareaCls}
          value={draft.preAppointmentNotes ?? ''}
          onChange={(e) =>
            setDraft({ ...draft, preAppointmentNotes: e.target.value || undefined })
          }
          placeholder="They've had two prior agents fall through. Husband is the decision-maker. Don't push on price the first 5 minutes."
        />
      </FieldHelp>

      <BulletList
        label="What I'll do"
        helpText="Promises you're making to the seller if they sign. Will appear under 'What I'll do' in the PDF."
        placeholder={(i) => getHintByIndex(COMMITMENT_HINTS, i)}
        values={draft.commitments}
        onChange={(next) => setDraft({ ...draft, commitments: next })}
      />

      <BulletList
        label="What I need from you"
        helpText="Things you need from the seller — access, paperwork, decisions. Will appear under 'What I need from you'."
        placeholder={(i) => getHintByIndex(ASK_HINTS, i)}
        values={draft.asks}
        onChange={(next) => setDraft({ ...draft, asks: next })}
      />
    </div>
  );
}

function BulletList({
  label,
  helpText,
  placeholder,
  values,
  onChange,
}: {
  label: string;
  helpText: string;
  /**
   * Per-row placeholder. Pass a string for a static placeholder, or a
   * function for per-slot rotation (Commit 7 wizard-hints pattern).
   */
  placeholder: string | ((index: number) => string);
  values: string[];
  onChange: (next: string[]) => void;
}) {
  const placeholderFor = (index: number): string =>
    typeof placeholder === 'function' ? placeholder(index) : placeholder;
  const update = (index: number, text: string) => {
    onChange(values.map((v, i) => (i === index ? text : v)));
  };
  const remove = (index: number) => {
    onChange(values.filter((_, i) => i !== index));
  };
  const add = () => {
    if (values.length >= MAX_BULLETS) return;
    onChange([...values, '']);
  };

  return (
    <FieldHelp label={label} helpText={helpText}>
      <div className="space-y-2">
        {values.length === 0 && (
          <p className="text-xs text-gray-500 italic">None yet.</p>
        )}
        {values.map((value, index) => (
          <div key={index} className="flex gap-2 items-start">
            <input
              type="text"
              className={inputCls}
              value={value}
              onChange={(e) => update(index, e.target.value)}
              placeholder={placeholderFor(index)}
            />
            <button
              type="button"
              onClick={() => remove(index)}
              aria-label="Remove"
              className="px-3 py-2 text-xs text-gray-500 hover:text-red-400 border border-neutral-800 rounded"
            >
              ✕
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={add}
          disabled={values.length >= MAX_BULLETS}
          className="px-3 py-1.5 text-xs border border-neutral-700 rounded hover:border-neutral-500 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          + Add another {values.length >= MAX_BULLETS && `(max ${MAX_BULLETS})`}
        </button>
      </div>
    </FieldHelp>
  );
}
