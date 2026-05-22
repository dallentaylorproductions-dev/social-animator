"use client";

import { generateId } from "@/lib/ids";
import type {
  PitchPoint,
  PitchPointVisibility,
  SellerPresentationDraft,
} from "../engine/types";
import { AIPlugPoint } from "./AIPlugPoint";

/**
 * Seller Presentation Step 4 — Pitch points (v1.47 / A5b → A7c).
 *
 * The substrate's "agent controls what the client sees" rule
 * (§3.4, §4) made concrete. Each pitch point carries a per-point
 * `visibility: 'public' | 'private'` flag the agent toggles by
 * hand. The serializer projects `pitchPublicCards` as
 * `draft.pitchPoints.filter(p => p.visibility === 'public').map(p =>
 * ({ title, support }))` — the toggle here directly determines what
 * reaches the published web page.
 *
 * A7c shape migration: input UX now captures `{ title, support }`
 * (matching the locked design's pitch-card markup) instead of A5b's
 * single `text` field. Older drafts with only `text` set still
 * round-trip cleanly because:
 *   - the serializer's title fallback (A7a) maps
 *     `point.title ?? point.text` into the public card's `title`;
 *   - this component shows the legacy `text` value in the Title
 *     input until the user edits, then writes to `title` and clears
 *     `text` on save (clean migration with no fragile parsing).
 *
 * Defaults to `private` on add — opt-in to publishing so a hasty
 * "save then publish" can't leak a point the agent intended for
 * their prep doc only.
 *
 * Lane C seam: `<AIPlugPoint type="copy-suggestion" />` at the top
 * renders null today; Lane C swaps in the copy-suggestion proposer
 * per the contract on `SELLER_PRESENTATION_AI_PLUG_POINTS[2]`.
 */

interface StepPitchProps {
  draft: SellerPresentationDraft;
  setDraft: (next: SellerPresentationDraft) => void;
}

const inputCls =
  "w-full px-3 py-2 bg-neutral-900 border border-neutral-700 rounded text-sm focus:outline-none focus:border-mint";
const textareaCls = `${inputCls} resize-y min-h-[80px]`;

function newPitchPoint(): PitchPoint {
  return {
    id: generateId("artifact"),
    title: "",
    support: "",
    visibility: "private",
  };
}

export function StepPitch({ draft, setDraft }: StepPitchProps) {
  const updatePoint = (id: string, patch: Partial<PitchPoint>) => {
    const next = draft.pitchPoints.map((p) =>
      p.id === id ? { ...p, ...patch } : p,
    );
    setDraft({ ...draft, pitchPoints: next });
  };

  const addPoint = () => {
    setDraft({ ...draft, pitchPoints: [...draft.pitchPoints, newPitchPoint()] });
  };

  const removePoint = (id: string) => {
    setDraft({
      ...draft,
      pitchPoints: draft.pitchPoints.filter((p) => p.id !== id),
    });
  };

  const publicCount = draft.pitchPoints.filter(
    (p) => p.visibility === "public",
  ).length;

  return (
    <div className="space-y-6" data-testid="step-pitch">
      <header>
        <h2 className="text-lg font-medium">Your pitch</h2>
        <p className="mt-1 text-xs text-gray-500">
          2 to 4 things that make this home stand out. These become the
          selling points on the buyer&apos;s page.
        </p>
      </header>

      <AIPlugPoint type="copy-suggestion" />

      {draft.pitchPoints.length === 0 && (
        <p className="text-sm italic text-gray-400">
          No pitch points yet. Add at least one. Even private ones
          structure your prep.
        </p>
      )}

      <div className="space-y-3">
        {draft.pitchPoints.map((point, idx) => (
          <PitchPointCard
            key={point.id}
            index={idx}
            point={point}
            onUpdate={(patch) => updatePoint(point.id, patch)}
            onRemove={() => removePoint(point.id)}
          />
        ))}
      </div>

      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={addPoint}
          data-testid="step-pitch-add"
          className="rounded border border-mint px-4 py-2 text-sm text-mint hover:bg-mint/10"
        >
          + Add pitch point
        </button>
        <p
          className="text-xs text-neutral-500"
          data-testid="step-pitch-counter"
        >
          {publicCount} of {draft.pitchPoints.length} marked public
        </p>
      </div>
    </div>
  );
}

interface PitchPointCardProps {
  index: number;
  point: PitchPoint;
  onUpdate: (patch: Partial<PitchPoint>) => void;
  onRemove: () => void;
}

function PitchPointCard({
  index,
  point,
  onUpdate,
  onRemove,
}: PitchPointCardProps) {
  const setVisibility = (visibility: PitchPointVisibility) =>
    onUpdate({ visibility });

  // Legacy migration: a pre-A7c point may have only `text` set. Surface
  // that value in the Title input until the user edits, then write to
  // `title` and clear `text` so subsequent loads use the new shape.
  const titleDisplay = point.title ?? point.text ?? "";
  const onTitleChange = (value: string) => {
    const patch: Partial<PitchPoint> = { title: value };
    // Clear the legacy `text` field on first edit so the migration
    // completes — the serializer's fallback only kicks in when
    // `title` is unset.
    if (point.text !== undefined) patch.text = undefined;
    onUpdate(patch);
  };

  return (
    <div
      className="space-y-3 rounded border border-neutral-700 bg-neutral-900/30 p-4"
      data-testid={`step-pitch-card-${index}`}
    >
      <div className="flex items-center justify-between">
        <span className="text-xs uppercase tracking-wider text-gray-500">
          Point {index + 1}
        </span>
        <button
          type="button"
          onClick={onRemove}
          className="text-xs text-gray-500 hover:text-red-400"
          data-testid={`step-pitch-remove-${index}`}
        >
          Remove
        </button>
      </div>

      <label className="block">
        <span className="text-[10px] uppercase tracking-wider text-gray-500">
          Title
        </span>
        <input
          type="text"
          className={`${inputCls} mt-1`}
          value={titleDisplay}
          onChange={(e) => onTitleChange(e.target.value)}
          placeholder="e.g. Chef's kitchen, built for hosting"
          data-testid={`step-pitch-title-${index}`}
        />
      </label>

      <label className="block">
        <span className="text-[10px] uppercase tracking-wider text-gray-500">
          Support
        </span>
        <textarea
          className={`${textareaCls} mt-1`}
          value={point.support ?? ""}
          onChange={(e) =>
            onUpdate({ support: e.target.value || undefined })
          }
          placeholder="One sentence of supporting detail (optional)."
          data-testid={`step-pitch-support-${index}`}
        />
      </label>

      <div
        className="inline-flex rounded border border-neutral-700 p-1"
        role="radiogroup"
        aria-label={`pitch-point-${index + 1}-visibility`}
      >
        <button
          type="button"
          role="radio"
          aria-checked={point.visibility === "private"}
          onClick={() => setVisibility("private")}
          data-testid={`step-pitch-private-${index}`}
          className={`flex items-center gap-1 rounded px-3 py-1 text-xs transition ${
            point.visibility === "private"
              ? "bg-neutral-800 text-text-primary"
              : "text-neutral-500 hover:text-text-primary"
          }`}
        >
          <span aria-hidden>🔒</span> Private
        </button>
        <button
          type="button"
          role="radio"
          aria-checked={point.visibility === "public"}
          onClick={() => setVisibility("public")}
          data-testid={`step-pitch-public-${index}`}
          className={`flex items-center gap-1 rounded px-3 py-1 text-xs transition ${
            point.visibility === "public"
              ? "bg-mint/15 text-mint"
              : "text-neutral-500 hover:text-text-primary"
          }`}
        >
          <span aria-hidden>🌐</span> Public
        </button>
      </div>
    </div>
  );
}
