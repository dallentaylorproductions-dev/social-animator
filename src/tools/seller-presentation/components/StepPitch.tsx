"use client";

import { generateId } from "@/lib/ids";
import type {
  PitchPoint,
  PitchPointVisibility,
  SellerPresentationDraft,
} from "../engine/types";
import { AIPlugPoint } from "./AIPlugPoint";

/**
 * Seller Presentation Step 4 — Pitch points (v1.47 / A5b LIVE).
 *
 * The substrate's "agent controls what the client sees" rule
 * (§3.4, §4) made concrete. Each pitch point carries a per-point
 * `visibility: 'public' | 'private'` flag the agent toggles by
 * hand. A6's `toPublicPayload` projects `pitchPublicPoints` as
 * `draft.pitchPoints.filter(p => p.visibility === 'public').map(p =>
 * p.text)` — the toggle here directly determines what reaches the
 * published web page.
 *
 * Defaults to `private` on add — opt-in to publishing so a hasty
 * "save then publish" can't leak a point the agent intended for
 * their prep doc only.
 *
 * Lane C seam: `<AIPlugPoint type="copy-suggestion" />` at the top
 * renders null today; Lane C swaps in the copy-suggestion proposer
 * per the contract on `SELLER_PRESENTATION_AI_PLUG_POINTS[2]`
 * (proposes to `pitchPoints`, requires review).
 *
 * Stable per-point ids (via `generateId('artifact')` reused for the
 * local list — the artifact prefix is the closest semantic match;
 * a per-step PitchPointId prefix would be over-typing) keep React
 * keys stable across reorders/deletes.
 */

interface StepPitchProps {
  draft: SellerPresentationDraft;
  setDraft: (next: SellerPresentationDraft) => void;
}

const textareaCls =
  "w-full px-3 py-2 bg-neutral-900 border border-neutral-700 rounded text-sm focus:outline-none focus:border-mint resize-y min-h-[80px]";

function newPitchPoint(): PitchPoint {
  return {
    id: generateId("artifact"),
    text: "",
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
          Selling-points. Toggle each point Public (appears on the seller
          page) or Private (your prep doc only). Defaults to private —
          you publish what you decide to publish.
        </p>
      </header>

      <AIPlugPoint type="copy-suggestion" />

      {draft.pitchPoints.length === 0 && (
        <p className="text-sm italic text-gray-400">
          No pitch points yet. Add at least one — even private ones
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

      <textarea
        className={textareaCls}
        value={point.text}
        onChange={(e) => onUpdate({ text: e.target.value })}
        placeholder="What you want to communicate"
        data-testid={`step-pitch-text-${index}`}
      />

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
