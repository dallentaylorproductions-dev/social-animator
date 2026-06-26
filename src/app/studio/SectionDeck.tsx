"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { flushSync } from "react-dom";
import type { BrandSettings } from "@/lib/brand";
import type { PublicPayload } from "@/tools/seller-presentation/output/public-payload";
import { HeadshotField } from "@/app/settings/HeadshotField";
import type { HeadshotCropValue } from "@/app/settings/HeadshotCropEditor";
import { SEGMENTS, type SegmentKey } from "@/lib/studio-profile/setup-state";
import { AssetPreviewFrame } from "./AssetPreviewFrame";

/**
 * SectionDeck — the MOBILE "stable section + subsection prompt deck" (the model
 * that replaces the region-cropping / zoom-to-region Focus Lens for Step 1).
 *
 * The preview is the STAGE; the prompt is the ACTOR. A SECTION (a real Studio
 * component — for "You", the AgentBand identity) renders ONCE and stays put. The
 * user fills its SUBSECTIONS one at a time (name → headshot → brokerage). Each
 * subsection is ONE prompt; filling it updates the stable section LIVE; Save
 * slides that prompt out and the next in; the section never re-crops, re-frames,
 * or zooms. All subsections done → ONE reuse confirmation → the next section.
 *
 * Architecture: an IN-PLACE fixed shell sized to window.visualViewport (via the
 * --sp-vvh / --sp-vvt vars the console root already publishes), NOT a portal — so
 * the SAME section node persists from before-tap through editing and is only
 * scaled (never windowed) when the keyboard opens. Keyboard-safe by construction:
 * the column's bottom edge is the keyboard's top edge and children pack top-down,
 * so Save is always above the keyboard with no page scroll. Mobile only; the
 * desktop console and steps 2–6 are untouched (this renders only for mobile You).
 */

export type SubKind = "text" | "media";

export interface SubsectionConfig {
  key: string;
  /** The single prompt shown for this subsection (the field label / question). */
  prompt: string;
  /** text → keyboard input; media → inline upload/adjust, never a keyboard. */
  kind: SubKind;
  /** Optional subsections offer "Skip for now" instead of gating Save. */
  required: boolean;
  /** Render-only placeholder for the live preview + the empty input. NEVER persisted. */
  placeholder?: string;
  /** Current REAL value ("" when unset) — drives Save-enable + the {value,isDefault} model. */
  read: (b: BrandSettings) => string;
  /** Patch for setField when a text subsection changes. */
  write: (value: string) => Partial<BrandSettings>;
  /** Media subsections render their own control (e.g. HeadshotField) inline. */
  renderMedia?: (
    effective: BrandSettings,
    setField: (patch: Partial<BrandSettings>) => void,
  ) => ReactNode;
}

export interface SectionConfig {
  id: SegmentKey;
  /** The ONE stable section element + its single framing (whole identity card). */
  renderSection: (payload: PublicPayload, reducedMotion: boolean, saved: boolean) => ReactNode;
  subsections: SubsectionConfig[];
}

/* ───────────────────────────── Step 1 (You) config ───────────────────────────── */

/**
 * YOU_SECTION — Step 1 fills the generic scaffold. Adding any of steps 2–6 later
 * is the same shape: a stable section component + an ordered subsection list. No
 * section-specific structure lives in the deck shell.
 */
export const YOU_SECTION: SectionConfig = {
  id: "you",
  renderSection: (payload, reducedMotion, saved) => (
    <AssetPreviewFrame
      payload={payload}
      asset="you"
      youIdentity
      saved={saved}
      reducedMotion={reducedMotion}
    />
  ),
  subsections: [
    {
      key: "name",
      prompt: "Your name",
      kind: "text",
      required: true,
      placeholder: "Your Name",
      read: (b) => b.agentName ?? "",
      write: (v) => ({ agentName: v }),
    },
    {
      key: "headshot",
      prompt: "Your headshot",
      kind: "media",
      required: false,
      read: (b) => b.agentPhotoUrl ?? "",
      write: () => ({}),
      renderMedia: (effective, setField) => (
        <HeadshotField
          photoUrl={effective.agentPhotoUrl}
          focalX={effective.agentHeadshotFocalX ?? 50}
          focalY={effective.agentHeadshotFocalY ?? 50}
          scale={effective.agentHeadshotScale ?? 1}
          monogramName={effective.agentName ?? ""}
          onPhotoChange={(url) =>
            setField({
              agentPhotoUrl: url || undefined,
              agentHeadshotFocalX: undefined,
              agentHeadshotFocalY: undefined,
              agentHeadshotScale: undefined,
            })
          }
          onCropChange={({ focalX, focalY, scale }: HeadshotCropValue) => {
            const centered = focalX === 50 && focalY === 50 && scale === 1;
            setField({
              agentHeadshotFocalX: centered ? undefined : focalX,
              agentHeadshotFocalY: centered ? undefined : focalY,
              agentHeadshotScale: centered ? undefined : scale,
            });
          }}
        />
      ),
    },
    {
      key: "brokerage",
      prompt: "Brokerage",
      kind: "text",
      required: true,
      placeholder: "Your Brokerage",
      read: (b) => b.brokerage ?? "",
      write: (v) => ({ brokerage: v }),
    },
  ],
};

/* ───────────────────────────── the deck shell ───────────────────────────── */

export function SectionDeck({
  section,
  effective,
  setField,
  previewPayload,
  reducedMotion,
  done,
  saving,
  savedNow,
  toast,
  onFinish,
  onBack,
}: {
  section: SectionConfig;
  effective: BrandSettings;
  setField: (patch: Partial<BrandSettings>) => void;
  previewPayload: PublicPayload;
  reducedMotion: boolean;
  done: ReadonlySet<SegmentKey>;
  /** True during the commit animation — disables the CTA. */
  saving: boolean;
  /** True while this section's saved animation plays (drives the preview pulse + toast). */
  savedNow: boolean;
  /** The ONE reuse confirmation, shown at section completion. */
  toast: string | null;
  /** Commit the section (last subsection) → save animation + advance (parent owns it). */
  onFinish: () => void;
  /** subIndex 0 Back leaves the step (parent PREV_SCREEN). */
  onBack: () => void;
}) {
  const subs = section.subsections;
  const [subIndex, setSubIndex] = useState(0);

  // Lock the body while the deck owns the viewport, so iOS can't scroll the page
  // (or its input) out from under the keyboard-pinned fixed column. The step is
  // entered at scrollTop 0 (the screen-change effect resets it), so no offset
  // preserve is needed; restored on unmount when the step advances.
  useEffect(() => {
    if (typeof document === "undefined") return;
    const body = document.body;
    const prev = {
      position: body.style.position,
      top: body.style.top,
      width: body.style.width,
      overflow: body.style.overflow,
    };
    body.style.position = "fixed";
    body.style.top = "0";
    body.style.width = "100%";
    body.style.overflow = "hidden";
    return () => {
      body.style.position = prev.position;
      body.style.top = prev.top;
      body.style.width = prev.width;
      body.style.overflow = prev.overflow;
    };
  }, []);
  // "fwd" | "back" drives the slide-in direction of the freshly mounted prompt.
  const [dir, setDir] = useState<"fwd" | "back">("fwd");
  const inputRef = useRef<HTMLInputElement>(null);

  const sub = subs[subIndex];
  const value = sub.read(effective);
  const hasValue = value.trim().length > 0;
  const isLast = subIndex === subs.length - 1;
  // Required text gates Save until a real value exists OR is already set; optional
  // always advances (acting as Skip when empty). Returning users with real data
  // never re-type — `value` already holds it, so Save is enabled immediately.
  const canAdvance = sub.required ? hasValue : true;

  // CTA label by context (one button style across the small set).
  let ctaLabel: string;
  if (sub.kind === "media") {
    ctaLabel = hasValue ? "Use this photo" : "Skip for now";
  } else if (!sub.required && !hasValue) {
    ctaLabel = "Skip for now";
  } else {
    ctaLabel = isLast ? "Finish section" : "Save & continue";
  }

  // Move to a subsection inside the user gesture: flushSync mounts the target
  // synchronously so a text target can be focused WITHIN the tap (iOS opens the
  // keyboard reliably) and a media target dismisses the keyboard cleanly (no
  // stacked-form flash). The section preview node is never touched — it persists.
  const goToSub = (next: number) => {
    setDir(next > subIndex ? "fwd" : "back");
    flushSync(() => setSubIndex(next));
    const target = subs[next];
    if (target.kind === "text") {
      inputRef.current?.focus();
    } else if (typeof document !== "undefined") {
      (document.activeElement as HTMLElement | null)?.blur?.();
    }
  };

  const onCta = () => {
    if (!canAdvance || saving) return;
    if (isLast) onFinish();
    else goToSub(subIndex + 1);
  };

  const onBackCta = () => {
    if (saving) return;
    if (subIndex > 0) goToSub(subIndex - 1);
    else onBack();
  };

  return (
    <div
      className="sp sp-deck"
      data-testid="sp-deck"
      data-section={section.id}
      data-sub={sub.key}
    >
      {/* compact header + 6-step progress (one progress scale; the subsection
          caption below is textual "N of M", not a second bar) */}
      <header className="sp-deck__head">
        <p className="sp-deck__title">Set up Studio once</p>
        <div className="sp-deck__progress" aria-hidden="true">
          {SEGMENTS.map((s, i) => (
            <span
              key={s.key}
              className={`sp-deck__seg${done.has(s.key) ? " is-done" : ""}${
                s.key === section.id ? " is-active" : ""
              }${i === 3 ? " is-break" : ""}`}
            />
          ))}
        </div>
      </header>

      {/* THE STABLE SECTION — one element, one framing, mounted once. It updates
          live and is only SCALED to fit; it is never re-cropped or re-framed per
          subsection, and it does not zoom. */}
      <div className="sp-deck__preview" data-testid="sp-deck-preview">
        {section.renderSection(previewPayload, reducedMotion, savedNow)}
      </div>

      {/* THE PROMPT DECK — exactly one subsection prompt in the DOM at a time. The
          key remounts the block per subsection so the slide-in animation plays;
          the section preview above stays anchored. */}
      <div
        key={sub.key}
        className={`sp-deck__prompt sp-deck__prompt--${dir}`}
        data-testid="sp-deck-prompt"
      >
        <p className="sp-deck__count" data-testid="sp-deck-count">
          {subIndex + 1} of {subs.length}
        </p>
        <p className="sp-deck__label">{sub.prompt}</p>
        {sub.kind === "text" ? (
          <input
            ref={inputRef}
            className="sp-input sp-deck__input"
            data-testid="sp-deck-input"
            type="text"
            value={value}
            placeholder={sub.placeholder}
            aria-label={sub.prompt}
            onChange={(e) => setField(sub.write(e.target.value))}
          />
        ) : (
          <div className="sp-deck__media" data-testid="sp-deck-media">
            {sub.renderMedia?.(effective, setField)}
          </div>
        )}
      </div>

      {toast && (
        <p className="sp-deck__toast" data-testid="sp-deck-toast" role="status">
          {toast}
        </p>
      )}

      <div className="sp-deck__cta">
        <button
          type="button"
          className="sp-btn sp-btn--primary"
          data-testid="sp-deck-cta"
          disabled={!canAdvance || saving}
          onClick={onCta}
        >
          {ctaLabel}
        </button>
        <button
          type="button"
          className="sp-btn sp-btn--ghost"
          data-testid="sp-deck-back"
          disabled={saving}
          onClick={onBackCta}
        >
          Back
        </button>
      </div>
    </div>
  );
}
