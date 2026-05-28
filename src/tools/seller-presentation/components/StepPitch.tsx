"use client";

import { useEffect, useRef } from "react";
import { generateId } from "@/lib/ids";
import type {
  PitchPoint,
  PitchPointVisibility,
  SellerPresentationDraft,
} from "../engine/types";
import { AIPlugPoint } from "./AIPlugPoint";

/**
 * Seller Presentation Step 4 — Pitch points (v1.47 / A5b → A7c.4).
 *
 * Substrate's "agent controls what the client sees" rule (§3.4, §4)
 * lands as a per-point `visibility: 'public' | 'private'` toggle the
 * serializer reads to decide what reaches the published page.
 *
 * A7c.4 — "guided + finite" pass on the input UX:
 *   - Per-row example placeholders ROTATE (see PITCH_EXAMPLES) so the
 *     agent reads them as inspiration, not a canned default. Cycled
 *     by row index, wrapping past the list end.
 *   - First mount seeds INITIAL_VISIBLE_ROWS empty points when the
 *     draft has fewer, so the agent lands on a small finite set of
 *     rows (no more "list to 14" obligation). The seed runs ONCE per
 *     mount via `seededRef`, so explicit removals are respected. The
 *     load-path `clampPitchPoint` drops content-less rows on reload,
 *     keeping the persisted shape clean even if some seeded rows are
 *     never filled.
 *   - Strength signal (dots + one microcopy line) reads off filled
 *     rows — neutral at 0, amber at 1–2, green from 3 (SWEET_SPOT
 *     wording at 4+). Reassurance only — publishing with fewer or
 *     more still works.
 *   - At sweet spot, the "+ Add another" affordance switches to a
 *     ghost style so the agent feels finished, not pushed.
 *   - Soft cap (SOFT_CAP_ROWS) hides the add button when reached. A
 *     draft loaded with more than the cap (legacy / power-user) is
 *     never truncated — only adding more is blocked.
 *
 * Tunable defaults (Dallen smokes; adjust here): INITIAL_VISIBLE_ROWS,
 * SOFT_CAP_ROWS, AMBER_THRESHOLD, GREEN_THRESHOLD.
 *
 * Lane C seam unchanged: <AIPlugPoint type="copy-suggestion" /> still
 * sits at the top per SELLER_PRESENTATION_AI_PLUG_POINTS[2].
 *
 * Data-model invariants preserved: PitchPoint shape, the public/
 * private toggle, and the serializer's allowlist are untouched.
 */

interface StepPitchProps {
  draft: SellerPresentationDraft;
  setDraft: (next: SellerPresentationDraft) => void;
}

const INITIAL_VISIBLE_ROWS = 3;
const SOFT_CAP_ROWS = 6;
const AMBER_THRESHOLD = 1; // filled >= 1 → amber until GREEN_THRESHOLD
const GREEN_THRESHOLD = 3; // filled >= 3 → green
const SWEET_SPOT = 4; // copy mentions "4 strong points is plenty"

const PITCH_EXAMPLES = [
  "Chef's kitchen made for hosting",
  "Walk to the lake in five minutes",
  "Quiet street, top-rated schools",
  "Sun-filled primary suite",
  "Brand-new roof and HVAC",
  "Two-car garage plus workshop",
  "Move-in ready, nothing to do",
  "Backyard made for summer nights",
  "Minutes to downtown and transit",
  "Rare double lot with privacy",
] as const;

function exampleForIndex(idx: number): string {
  return PITCH_EXAMPLES[idx % PITCH_EXAMPLES.length];
}

const inputCls =
  "w-full px-3 py-2 bg-neutral-900 border border-neutral-700 rounded text-sm focus:outline-none focus:border-mint";
const textareaCls = `${inputCls} resize-y min-h-[80px]`;

function newPitchPoint(): PitchPoint {
  // A7c.6 — default visibility is PUBLIC. A first-time agent moving
  // quickly fills points expecting them on the buyer's page; defaulting
  // to private silently drops them. Empty points are still filtered
  // out by `projectPitchCard` in the public-payload serializer, so a
  // seeded-but-unfilled point cannot leak a blank card to /h/[slug].
  // Private stays available as a per-point opt-in for prep-only points.
  return {
    id: generateId("artifact"),
    title: "",
    support: "",
    visibility: "public",
  };
}

function hasContent(point: PitchPoint): boolean {
  const title = (point.title ?? point.text ?? "").trim();
  return title.length > 0;
}

type StrengthLevel = "neutral" | "amber" | "green";

function strengthLevel(filled: number): StrengthLevel {
  if (filled <= 0) return "neutral";
  if (filled < GREEN_THRESHOLD) return "amber";
  return "green";
}

function strengthMessage(filled: number): string {
  if (filled <= 0) return "Add 2 to 4 selling points.";
  if (filled < GREEN_THRESHOLD) return "A couple more makes it stronger.";
  return `Looks great. ${SWEET_SPOT} strong points is plenty.`;
}

export function StepPitch({ draft, setDraft }: StepPitchProps) {
  // Seed initial empty rows ONCE per mount when the draft is short.
  // `clampPitchPoint` drops empty rows on reload, so this won't bloat
  // the persisted draft; it just hands the agent a finite starting
  // canvas instead of a single empty row.
  const seededRef = useRef(false);
  useEffect(() => {
    if (seededRef.current) return;
    seededRef.current = true;
    if (draft.pitchPoints.length < INITIAL_VISIBLE_ROWS) {
      const need = INITIAL_VISIBLE_ROWS - draft.pitchPoints.length;
      const additions = Array.from({ length: need }, newPitchPoint);
      setDraft({
        ...draft,
        pitchPoints: [...draft.pitchPoints, ...additions],
      });
    }
    // Intentionally run once on mount only — explicit removals after
    // mount should not trigger a reseed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  const filledCount = draft.pitchPoints.filter(hasContent).length;
  const publicCount = draft.pitchPoints.filter(
    (p) => p.visibility === "public" && hasContent(p),
  ).length;
  const level = strengthLevel(filledCount);
  const atSweetSpot = filledCount >= GREEN_THRESHOLD;
  const atSoftCap = draft.pitchPoints.length >= SOFT_CAP_ROWS;

  return (
    <div className="space-y-6" data-testid="step-pitch">
      <header>
        <h2 className="text-lg font-medium">Your pitch</h2>
        <p className="mt-1 text-xs text-gray-500">
          2 to 4 things that make this home stand out. These become the
          selling points on the buyer&apos;s page.
        </p>
      </header>

      <AIPlugPoint type="copy-suggestion" draft={draft} setDraft={setDraft} />

      <StrengthMeter
        filled={filledCount}
        cap={SOFT_CAP_ROWS}
        level={level}
        message={strengthMessage(filledCount)}
      />

      <div className="space-y-3">
        {draft.pitchPoints.map((point, idx) => (
          <PitchPointCard
            key={point.id}
            index={idx}
            point={point}
            example={exampleForIndex(idx)}
            onUpdate={(patch) => updatePoint(point.id, patch)}
            onRemove={() => removePoint(point.id)}
          />
        ))}
      </div>

      <div className="flex items-center justify-between gap-3">
        {atSoftCap ? (
          <span
            className="text-xs text-neutral-500"
            data-testid="step-pitch-cap-reached"
          >
            You&apos;ve added the most points we recommend.
          </span>
        ) : (
          <button
            type="button"
            onClick={addPoint}
            data-testid="step-pitch-add"
            data-emphasis={atSweetSpot ? "ghost" : "primary"}
            className={
              atSweetSpot
                ? "rounded px-3 py-1.5 text-xs text-neutral-500 hover:text-text-primary"
                : "rounded border border-mint px-4 py-2 text-sm text-mint hover:bg-mint/10"
            }
          >
            {atSweetSpot
              ? "+ Add another (optional)"
              : "+ Add a selling point"}
          </button>
        )}
        <p
          className="text-xs text-neutral-500"
          data-testid="step-pitch-counter"
        >
          {publicCount} of {filledCount} marked public
        </p>
      </div>
    </div>
  );
}

interface StrengthMeterProps {
  filled: number;
  cap: number;
  level: StrengthLevel;
  message: string;
}

function StrengthMeter({ filled, cap, level, message }: StrengthMeterProps) {
  const litColor =
    level === "green"
      ? "bg-mint"
      : level === "amber"
        ? "bg-amber-400"
        : "bg-neutral-700";
  const textColor =
    level === "green"
      ? "text-mint"
      : level === "amber"
        ? "text-amber-400"
        : "text-neutral-400";

  return (
    <div
      className="space-y-1.5"
      data-testid="step-pitch-strength"
      data-level={level}
      data-filled={filled}
    >
      <div
        className="flex items-center gap-1.5"
        role="meter"
        aria-valuemin={0}
        aria-valuemax={cap}
        aria-valuenow={filled}
        aria-label="Selling points strength"
      >
        {Array.from({ length: cap }, (_, i) => (
          <span
            key={i}
            className={`h-1.5 w-6 rounded-full transition-colors ${
              i < filled ? litColor : "bg-neutral-800"
            }`}
            aria-hidden
          />
        ))}
      </div>
      <p
        className={`text-xs ${textColor}`}
        data-testid="step-pitch-strength-message"
      >
        {message}
      </p>
    </div>
  );
}

interface PitchPointCardProps {
  index: number;
  point: PitchPoint;
  example: string;
  onUpdate: (patch: Partial<PitchPoint>) => void;
  onRemove: () => void;
}

function PitchPointCard({
  index,
  point,
  example,
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
          placeholder={`e.g. ${example}`}
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
