"use client";

import { useEffect, useRef, useState } from "react";
import { generateId } from "@/lib/ids";
import {
  isStepPropertyComplete,
  type PitchPoint,
  type PitchPointVisibility,
  type SellerPresentationDraft,
} from "../engine/types";
import { AIPlugPoint } from "./AIPlugPoint";

/**
 * Seller Presentation Step 4 — Your pitch (Phase B4 redesign).
 *
 * "Arrives populated" rebuild on the B1 `.sep-wizard` canvas. Instead of
 * three blank rows, the step seeds three Tier 1 starter points (generic
 * titles, empty support) the moment the agent lands with Step 1 complete
 * — the agent's job becomes "pick the ones that fit, swap any that don't,
 * write a sentence each." A per-card Swap reach repicks from the unused
 * Tier 1 titles; a "Yours" chip marks a card the agent has written
 * support for; "+ Add another" appends the next unused Tier 1 title (or
 * "write your own →" appends a blank).
 *
 * Data-model invariants are UNCHANGED from production: the `PitchPoint`
 * shape, the per-point public/private toggle (default PUBLIC, A7c.6), and
 * the serializer's allowlist (`projectPitchCard` drops empty-title cards
 * so a seeded-but-untouched card can't leak a blank body to /h/[slug]).
 * The strength meter, soft cap, and "N of M marked public" counter keep
 * their production logic verbatim — only the visual treatment changed.
 *
 * Seeding gate (Phase 0 §3): Tier 1 seeds ONLY when Step 1 is complete
 * (`isStepPropertyComplete`). On the cold path (Step 1 not yet done) the
 * step falls back to the production behavior of three empty rows, so the
 * agent never lands on a single empty row. The seed runs ONCE per mount
 * via `seededRef`, so explicit removals are respected; `clampPitchPoint`
 * drops content-less rows on reload, keeping the persisted draft clean.
 *
 * Lane C seam unchanged: <AIPlugPoint type="copy-suggestion" /> still
 * mounts at the top (a no-op placeholder until that plug-point ships).
 */

interface StepPitchProps {
  draft: SellerPresentationDraft;
  setDraft: (next: SellerPresentationDraft) => void;
}

const INITIAL_VISIBLE_ROWS = 3; // cold-path fallback row count
const SOFT_CAP_ROWS = 6;
const GREEN_THRESHOLD = 3; // filled >= 3 → green (amber for 1–2, neutral at 0)
const SWEET_SPOT = 4; // copy mentions "4 strong points is plenty"

/**
 * Phase B4 — Tier 1 templated drafts (generic, fire when Step 1 is
 * complete). Each is title-only; the agent fills support based on the
 * actual home. The Swap picker + catalog-aware "Add another" draw from
 * this list. Dropped in verbatim from Phase 0 §3.
 */
export const TIER_1_DRAFTS = [
  { id: "kitchen-host", title: "A kitchen built for hosting", category: "kitchen" },
  { id: "move-in-ready", title: "Move-in ready, top to bottom", category: "condition" },
  { id: "location-quiet", title: "A quiet street, close to the things you drive to most", category: "location" },
  { id: "floor-plan-works", title: "A floor plan that just works day to day", category: "layout" },
  { id: "outdoor-room", title: "Outdoor space that doubles as a second living room", category: "outdoor" },
  { id: "storage-more", title: "More storage than it looks", category: "storage" },
  { id: "natural-light", title: "Light, everywhere you'd want it", category: "finishes" },
  { id: "neighborhood-fit", title: "A neighborhood you'd want to be in regardless of the house", category: "neighborhood" },
  { id: "value-built-in", title: "Value built in: priced where buyers expect, not above", category: "value" },
  { id: "primary-suite", title: "A primary suite that earns its name", category: "layout" },
  { id: "outdoor-low-maintenance", title: "Outdoor space without the upkeep", category: "outdoor" },
  { id: "character-and-charm", title: "Character that doesn't need to be created", category: "history" },
] as const;

/**
 * Rotating placeholder examples for BLANK cards (cold-path rows + "write
 * your own" cards). Seeded Tier 1 cards carry a real title, so the
 * placeholder is moot for them — it only shows on an empty title input.
 */
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

function newPitchPoint(title = ""): PitchPoint {
  // A7c.6 — default visibility is PUBLIC. Empty points are filtered out
  // by `projectPitchCard` in the public-payload serializer, so a
  // seeded-but-unfilled point cannot leak a blank card to /h/[slug].
  return {
    id: generateId("artifact"),
    title,
    support: "",
    visibility: "public",
  };
}

/** The three Tier 1 starter points the step seeds on the happy path. */
function seededTier1Points(): PitchPoint[] {
  return TIER_1_DRAFTS.slice(0, 3).map((d) => newPitchPoint(d.title));
}

function pointTitle(point: PitchPoint): string {
  return (point.title ?? point.text ?? "").trim();
}

function hasContent(point: PitchPoint): boolean {
  return pointTitle(point).length > 0;
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

/* ---- icons ------------------------------------------------------- */
function IconGlobe() {
  return (
    <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18" />
      <path d="M12 3a14 14 0 0 1 0 18 14 14 0 0 1 0-18Z" />
    </svg>
  );
}
function IconLock() {
  return (
    <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="4.5" y="10.5" width="15" height="10" rx="2.2" />
      <path d="M8 10.5V7a4 4 0 0 1 8 0v3.5" />
    </svg>
  );
}
function IconSwap() {
  return (
    <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M4 7h13l-3-3M20 17H7l3 3" />
    </svg>
  );
}

export function StepPitch({ draft, setDraft }: StepPitchProps) {
  // Seed ONCE per mount when the draft has no points yet. Happy path
  // (Step 1 complete) → 3 Tier 1 starters; cold path → 3 empty rows.
  // `clampPitchPoint` drops empty rows on reload so this never bloats
  // the persisted draft. Explicit removals after mount are respected.
  const seededRef = useRef(false);
  useEffect(() => {
    if (seededRef.current) return;
    seededRef.current = true;
    if (draft.pitchPoints.length > 0) return;
    const seeded = isStepPropertyComplete(draft)
      ? seededTier1Points()
      : Array.from({ length: INITIAL_VISIBLE_ROWS }, () => newPitchPoint());
    setDraft({ ...draft, pitchPoints: seeded });
    // Run once on mount only — a reseed after explicit removal would
    // fight the agent.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [openSwapIndex, setOpenSwapIndex] = useState<number | null>(null);

  // Item 2 (post-E.0): the open Swap picker dismisses on an outside click
  // or Escape. Previously the only way out was pressing Swap again, which
  // agents didn't discover. Clicks inside the open picker, or on its own
  // Swap toggle, are ignored here so the existing toggle + option onClick
  // handlers (which manage their own close) keep working without a
  // double-fire (a re-press would otherwise close-then-reopen).
  useEffect(() => {
    if (openSwapIndex === null) return;
    const onPointerDown = (e: MouseEvent) => {
      const t = e.target as HTMLElement | null;
      if (!t) return;
      if (t.closest(`[data-testid="step-pitch-swap-picker-${openSwapIndex}"]`)) {
        return;
      }
      if (t.closest(`[data-testid="step-pitch-swap-${openSwapIndex}"]`)) {
        return;
      }
      setOpenSwapIndex(null);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpenSwapIndex(null);
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [openSwapIndex]);

  const updatePoint = (id: string, patch: Partial<PitchPoint>) => {
    const next = draft.pitchPoints.map((p) =>
      p.id === id ? { ...p, ...patch } : p,
    );
    setDraft({ ...draft, pitchPoints: next });
  };

  // Titles currently in use — the Swap picker + catalog-aware Add skip
  // these so the agent never sees a duplicate starter title.
  const usedTitles = new Set(
    draft.pitchPoints.map(pointTitle).filter((t) => t.length > 0),
  );
  const unusedTier1 = TIER_1_DRAFTS.filter((d) => !usedTitles.has(d.title));

  const addPoint = () => {
    // Catalog-aware: append the next unused Tier 1 title. When the
    // catalog is exhausted, append a blank card.
    const nextTitle = unusedTier1[0]?.title ?? "";
    setDraft({
      ...draft,
      pitchPoints: [...draft.pitchPoints, newPitchPoint(nextTitle)],
    });
  };

  const addBlankPoint = () => {
    setDraft({
      ...draft,
      pitchPoints: [...draft.pitchPoints, newPitchPoint("")],
    });
  };

  const removePoint = (id: string) => {
    setOpenSwapIndex(null);
    setDraft({
      ...draft,
      pitchPoints: draft.pitchPoints.filter((p) => p.id !== id),
    });
  };

  const swapTitle = (id: string, title: string) => {
    // Picking a new starter title clears the support sentence — the old
    // seller-specific sentence no longer applies to the new title.
    updatePoint(id, { title, support: "", text: undefined });
    setOpenSwapIndex(null);
  };

  const filledCount = draft.pitchPoints.filter(hasContent).length;
  const publicCount = draft.pitchPoints.filter(
    (p) => p.visibility === "public" && hasContent(p),
  ).length;
  const level = strengthLevel(filledCount);
  const atSweetSpot = filledCount >= GREEN_THRESHOLD;
  const atSoftCap = draft.pitchPoints.length >= SOFT_CAP_ROWS;

  return (
    <section className="pitch" data-testid="step-pitch">
      <div className="sec-head">
        <h2 className="sec-title">Your pitch</h2>
        <p className="sec-sub">
          Three starter points are ready. Pick the ones that fit this home,
          swap any that don&apos;t, and write a sentence for each.
        </p>
      </div>

      {/* Lane C seam (no-op placeholder until the plug-point ships). */}
      <AIPlugPoint type="copy-suggestion" draft={draft} setDraft={setDraft} />

      <StrengthMeter
        filled={filledCount}
        cap={SOFT_CAP_ROWS}
        level={level}
        message={strengthMessage(filledCount)}
      />

      <div className="pitch-list">
        {draft.pitchPoints.map((point, idx) => (
          <PitchPointCard
            key={point.id}
            index={idx}
            point={point}
            example={exampleForIndex(idx)}
            swapOpen={openSwapIndex === idx}
            unusedTier1={unusedTier1}
            onToggleSwap={() =>
              setOpenSwapIndex((cur) => (cur === idx ? null : idx))
            }
            onSwap={(title) => swapTitle(point.id, title)}
            onUpdate={(patch) => updatePoint(point.id, patch)}
            onRemove={() => removePoint(point.id)}
          />
        ))}
      </div>

      <div className="pitch-foot">
        {atSoftCap ? (
          <span className="pitch-cap" data-testid="step-pitch-cap-reached">
            You&apos;ve added the most points we recommend.
          </span>
        ) : (
          <div className="pitch-add-group">
            <button
              type="button"
              onClick={addPoint}
              data-testid="step-pitch-add"
              data-emphasis={atSweetSpot ? "ghost" : "primary"}
              className={"pitch-add" + (atSweetSpot ? " ghost" : "")}
            >
              + Add another point
            </button>
            <button
              type="button"
              onClick={addBlankPoint}
              data-testid="step-pitch-add-blank"
              className="pitch-add-blank"
            >
              or write your own →
            </button>
          </div>
        )}
        <p className="pitch-counter" data-testid="step-pitch-counter">
          {publicCount} of {filledCount} marked public
        </p>
      </div>
    </section>
  );
}

interface StrengthMeterProps {
  filled: number;
  cap: number;
  level: StrengthLevel;
  message: string;
}

function StrengthMeter({ filled, cap, level, message }: StrengthMeterProps) {
  return (
    <div
      className="pitch-meter"
      data-testid="step-pitch-strength"
      data-level={level}
      data-filled={filled}
    >
      <div
        className="meter-track"
        role="meter"
        aria-valuemin={0}
        aria-valuemax={cap}
        aria-valuenow={filled}
        aria-label="Selling points strength"
      >
        {Array.from({ length: cap }, (_, i) => (
          <span
            key={i}
            className={"meter-dot" + (i < filled ? " lit" : "")}
            aria-hidden
          />
        ))}
      </div>
      <p className="meter-msg" data-testid="step-pitch-strength-message">
        {message}
      </p>
    </div>
  );
}

interface PitchPointCardProps {
  index: number;
  point: PitchPoint;
  example: string;
  swapOpen: boolean;
  unusedTier1: ReadonlyArray<{ id: string; title: string; category: string }>;
  onToggleSwap: () => void;
  onSwap: (title: string) => void;
  onUpdate: (patch: Partial<PitchPoint>) => void;
  onRemove: () => void;
}

function PitchPointCard({
  index,
  point,
  example,
  swapOpen,
  unusedTier1,
  onToggleSwap,
  onSwap,
  onUpdate,
  onRemove,
}: PitchPointCardProps) {
  const setVisibility = (visibility: PitchPointVisibility) =>
    onUpdate({ visibility });

  // Legacy migration: a pre-A7c point may carry only `text`. Surface it
  // in the Title input until the user edits, then write `title` + clear
  // `text` so subsequent loads use the new shape.
  const titleDisplay = point.title ?? point.text ?? "";
  const onTitleChange = (value: string) => {
    const patch: Partial<PitchPoint> = { title: value };
    if (point.text !== undefined) patch.text = undefined;
    onUpdate(patch);
  };

  const isYours = (point.support ?? "").trim().length > 0;

  return (
    <div className="pitch-card" data-testid={`step-pitch-card-${index}`}>
      <div className="pc-head">
        {isYours ? (
          <span
            className="yours-chip"
            data-testid={`step-pitch-yours-chip-${index}`}
          >
            Yours
          </span>
        ) : (
          <span className="pc-eyebrow">Starter point</span>
        )}
        <div className="pc-actions">
          <button
            type="button"
            className={"pc-action" + (swapOpen ? " on" : "")}
            onClick={onToggleSwap}
            data-testid={`step-pitch-swap-${index}`}
          >
            <IconSwap /> Swap
          </button>
          <button
            type="button"
            className="pc-action danger"
            onClick={onRemove}
            data-testid={`step-pitch-remove-${index}`}
          >
            Remove
          </button>
        </div>
      </div>

      <input
        type="text"
        className="input pitch-title"
        value={titleDisplay}
        onChange={(e) => onTitleChange(e.target.value)}
        placeholder={`e.g. ${example}`}
        data-testid={`step-pitch-title-${index}`}
        aria-label={`pitch-point-${index + 1}-title`}
      />

      {swapOpen && (
        <div
          className="swap-picker"
          data-testid={`step-pitch-swap-picker-${index}`}
        >
          {unusedTier1.length > 0 ? (
            unusedTier1.map((d) => (
              <button
                key={d.id}
                type="button"
                className="swap-opt"
                onClick={() => onSwap(d.title)}
                data-testid={`step-pitch-swap-option-${d.id}`}
              >
                {d.title}
              </button>
            ))
          ) : (
            <p className="swap-empty">
              You&apos;ve used every starter title. Add or remove a point to
              free one up.
            </p>
          )}
        </div>
      )}

      <textarea
        className="input pitch-support"
        rows={2}
        value={point.support ?? ""}
        onChange={(e) => onUpdate({ support: e.target.value || undefined })}
        placeholder="Add a sentence about this home."
        data-testid={`step-pitch-support-${index}`}
        aria-label={`pitch-point-${index + 1}-support`}
      />

      <div
        className="vis-toggle"
        role="radiogroup"
        aria-label={`pitch-point-${index + 1}-visibility`}
      >
        <button
          type="button"
          role="radio"
          aria-checked={point.visibility === "private"}
          onClick={() => setVisibility("private")}
          data-testid={`step-pitch-private-${index}`}
          className={
            "vis-btn" + (point.visibility === "private" ? " on" : "")
          }
        >
          <IconLock /> Private
        </button>
        <button
          type="button"
          role="radio"
          aria-checked={point.visibility === "public"}
          onClick={() => setVisibility("public")}
          data-testid={`step-pitch-public-${index}`}
          className={
            "vis-btn public" + (point.visibility === "public" ? " on" : "")
          }
        >
          <IconGlobe /> Public
        </button>
      </div>
    </div>
  );
}
