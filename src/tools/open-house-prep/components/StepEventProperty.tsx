'use client';

import { useState } from 'react';
import type { OpenHousePrepDraft } from '../engine/types';
import { FieldHelp } from '@/tools/seller-intelligence-report/components/FieldHelp';
import { resizeImageToDataURL } from '@/lib/image-utils';

interface StepProps {
  draft: OpenHousePrepDraft;
  setDraft: (d: OpenHousePrepDraft) => void;
}

const inputCls =
  'w-full px-3 py-2 bg-neutral-900 border border-neutral-700 rounded text-sm focus:outline-none focus:border-mint';
const textareaCls = `${inputCls} resize-y min-h-[100px]`;

export function StepEventProperty({ draft, setDraft }: StepProps) {
  const update = <K extends keyof OpenHousePrepDraft>(
    key: K,
    value: OpenHousePrepDraft[K],
  ) => setDraft({ ...draft, [key]: value });

  return (
    <div className="space-y-6">
      <header>
        <h2 className="text-lg font-medium">Event + property</h2>
        <p className="mt-1 text-xs text-gray-500">
          Property identity, list price, event date, and the &ldquo;why this home&rdquo; positioning paragraph.
        </p>
      </header>

      <FieldHelp label="Property address" required helpText="Street address as it'll appear on the handout.">
        <input
          type="text"
          className={inputCls}
          value={draft.propertyAddress}
          onChange={(e) => update('propertyAddress', e.target.value)}
          placeholder="1234 Maple Heights Dr"
        />
      </FieldHelp>

      <FieldHelp label="City, state, zip" helpText="City and state.">
        <input
          type="text"
          className={inputCls}
          value={draft.propertyCity ?? ''}
          onChange={(e) => update('propertyCity', e.target.value || undefined)}
          placeholder="Beaverton, OR 97005"
        />
      </FieldHelp>

      <FieldHelp label="List price" required helpText="Format however you want — we'll show it as you type it.">
        <input
          type="text"
          className={inputCls}
          value={draft.listPrice}
          onChange={(e) => update('listPrice', e.target.value)}
          placeholder="$685,000"
        />
      </FieldHelp>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <FieldHelp label="Beds" helpText="Bedroom count.">
          <input
            type="text"
            className={inputCls}
            value={draft.beds ?? ''}
            onChange={(e) => update('beds', e.target.value || undefined)}
            placeholder="4"
          />
        </FieldHelp>
        <FieldHelp label="Baths" helpText="Bathroom count.">
          <input
            type="text"
            className={inputCls}
            value={draft.baths ?? ''}
            onChange={(e) => update('baths', e.target.value || undefined)}
            placeholder="2.5"
          />
        </FieldHelp>
        <FieldHelp label="Sq ft" helpText="Square footage.">
          <input
            type="text"
            className={inputCls}
            value={draft.squareFeet ?? ''}
            onChange={(e) => update('squareFeet', e.target.value || undefined)}
            placeholder="2,840"
          />
        </FieldHelp>
      </div>

      <HeroPhotoField draft={draft} setDraft={setDraft} />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <FieldHelp label="Event date" required helpText="When the open house is.">
          <input
            type="date"
            className={inputCls}
            value={draft.eventDate}
            onChange={(e) => update('eventDate', e.target.value)}
          />
        </FieldHelp>
        <FieldHelp label="Start time" helpText="e.g. 1:00 PM">
          <input
            type="text"
            className={inputCls}
            value={draft.eventStartTime ?? ''}
            onChange={(e) => update('eventStartTime', e.target.value || undefined)}
            placeholder="1:00 PM"
          />
        </FieldHelp>
        <FieldHelp label="End time" helpText="e.g. 3:00 PM">
          <input
            type="text"
            className={inputCls}
            value={draft.eventEndTime ?? ''}
            onChange={(e) => update('eventEndTime', e.target.value || undefined)}
            placeholder="3:00 PM"
          />
        </FieldHelp>
      </div>

      <FieldHelp
        label="Why this home"
        helpText="2–4 sentences of your read on what makes the home distinct. Shown on the visitor handout."
      >
        <textarea
          className={textareaCls}
          value={draft.positioningNarrative ?? ''}
          onChange={(e) =>
            update('positioningNarrative', e.target.value || undefined)
          }
          placeholder="What I'd want a buyer to notice is…"
        />
      </FieldHelp>
    </div>
  );
}

function HeroPhotoField({
  draft,
  setDraft,
}: {
  draft: OpenHousePrepDraft;
  setDraft: (d: OpenHousePrepDraft) => void;
}) {
  const [advancedMode, setAdvancedMode] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  async function handleFile(file: File) {
    setUploading(true);
    setUploadError(null);
    try {
      const dataUrl = await resizeImageToDataURL(file);
      setDraft({ ...draft, propertyPhotoUrl: dataUrl });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Could not load that image.';
      setUploadError(message);
    } finally {
      setUploading(false);
    }
  }

  const photoUrl = draft.propertyPhotoUrl;

  return (
    <FieldHelp
      label="Hero photo"
      helpText="Pick a photo of the property — we'll resize it automatically."
    >
      {photoUrl ? (
        <div className="space-y-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={photoUrl}
            alt="Property"
            className="rounded-lg max-w-[200px] border border-neutral-700"
          />
          <div className="flex gap-3 text-sm">
            <label className="cursor-pointer text-mint hover:underline">
              Replace
              <input
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void handleFile(f);
                  e.target.value = '';
                }}
              />
            </label>
            <button
              type="button"
              onClick={() =>
                setDraft({ ...draft, propertyPhotoUrl: undefined })
              }
              className="text-neutral-400 hover:text-neutral-200"
            >
              Remove
            </button>
          </div>
        </div>
      ) : (
        <div>
          <label
            className={`inline-flex items-center px-4 py-2 text-sm border border-neutral-700 rounded-lg cursor-pointer hover:border-mint transition ${
              uploading ? 'opacity-50 pointer-events-none' : ''
            }`}
          >
            {uploading ? 'Resizing…' : 'Upload photo'}
            <input
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void handleFile(f);
                e.target.value = '';
              }}
            />
          </label>
        </div>
      )}
      {uploadError && (
        <p className="text-xs text-red-400 mt-2">{uploadError}</p>
      )}
      <button
        type="button"
        onClick={() => setAdvancedMode((v) => !v)}
        className="text-xs text-neutral-500 hover:text-neutral-300 mt-3 block"
      >
        {advancedMode ? '← Use upload' : 'Or paste a URL (advanced)'}
      </button>
      {advancedMode && (
        <input
          type="url"
          className={`${inputCls} mt-2`}
          value={photoUrl ?? ''}
          onChange={(e) =>
            setDraft({
              ...draft,
              propertyPhotoUrl: e.target.value || undefined,
            })
          }
          placeholder="https://example.com/photo.jpg"
        />
      )}
    </FieldHelp>
  );
}
