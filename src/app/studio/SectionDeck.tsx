"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { flushSync } from "react-dom";
import {
  extractPhoneDigits,
  formatPhone,
  type BrandSettings,
} from "@/lib/brand";
import type { PublicPayload } from "@/tools/seller-presentation/output/public-payload";
import { HeadshotField } from "@/app/settings/HeadshotField";
import type { HeadshotCropValue } from "@/app/settings/HeadshotCropEditor";
import {
  SEGMENTS,
  isReachDone,
  isYouDone,
  type SegmentKey,
} from "@/lib/studio-profile/setup-state";
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
  /** input type for text subsections (default "text"). */
  type?: "text" | "email" | "url" | "tel";
  /** inputMode hint for the soft keyboard (e.g. "email", "tel", "url"). */
  inputMode?: "text" | "email" | "url" | "tel" | "numeric";
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
  /**
   * The section's quality bar. When already met (a returning agent whose data is
   * set), required-subsection gating relaxes so they can advance/finish without
   * re-typing. Mirrors the step's "done" predicate (isYouDone / isReachDone).
   */
  satisfied?: (b: BrandSettings) => boolean;
}

/* ───────────────────────────── Step 1 (You) config ───────────────────────────── */

/**
 * YOU_SECTION — Step 1 fills the generic scaffold. Adding any of steps 2–6 later
 * is the same shape: a stable section component + an ordered subsection list. No
 * section-specific structure lives in the deck shell.
 */
export const YOU_SECTION: SectionConfig = {
  id: "you",
  satisfied: isYouDone,
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

/* ───────────────────────────── Step 2 (Reach) config ───────────────────────────── */

/**
 * REACH_SECTION — the second reference, proving the scaffold generalizes beyond
 * You. The stable section is the contact CTA card (ConfirmTime), shown via the
 * real isolated asset. Subsections differ from You in optionality (email leads,
 * phone + scheduling are additive), so this is NOT a clone of YOU_SECTION:
 * `satisfied` is isReachDone (email OR phone), which lets a returning agent who
 * already has a contact skip straight through.
 */
export const REACH_SECTION: SectionConfig = {
  id: "reach",
  satisfied: isReachDone,
  renderSection: (payload, reducedMotion, saved) => (
    <AssetPreviewFrame
      payload={payload}
      asset="reach"
      saved={saved}
      reducedMotion={reducedMotion}
    />
  ),
  subsections: [
    {
      key: "email",
      prompt: "Email",
      kind: "text",
      required: true,
      type: "email",
      inputMode: "email",
      placeholder: "you@brokerage.com",
      read: (b) => b.contactEmail ?? "",
      write: (v) => ({ contactEmail: v }),
    },
    {
      key: "phone",
      prompt: "Phone",
      kind: "text",
      required: false,
      type: "tel",
      inputMode: "tel",
      placeholder: "(253) 555-0188",
      // Display formatted, persist digits (the same utils the desktop console uses).
      read: (b) => formatPhone(b.contactPhone ?? ""),
      write: (v) => ({ contactPhone: extractPhoneDigits(v) }),
    },
    {
      key: "schedule",
      prompt: "Scheduling link (optional)",
      kind: "text",
      required: false,
      type: "url",
      inputMode: "url",
      placeholder: "calendly.com/your-handle",
      read: (b) => b.schedulingUrl ?? "",
      write: (v) => ({ schedulingUrl: v }),
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
  // editing = a deck text input is focused (the keyboard is up). It switches the
  // deck between two compositions: RESTING (preview in the upper region, controls
  // grouped beneath) and EDITING (group sinks to the keyboard band, Save above the
  // keyboard). Driven by focus, and set explicitly per target in goToSub.
  const [editing, setEditing] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const sub = subs[subIndex];
  const value = sub.read(effective);
  const hasValue = value.trim().length > 0;
  const isLast = subIndex === subs.length - 1;
  // Required gates Save until a real value exists; optional always advances (Skip
  // when empty). A returning agent whose section is already satisfied (e.g. a
  // contact already on file) is never forced to re-type — gating relaxes.
  const sectionSatisfied = section.satisfied?.(effective) ?? false;
  const canAdvance = !sub.required || hasValue || sectionSatisfied;

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
    const target = subs[next];
    setDir(next > subIndex ? "fwd" : "back");
    // Set the composition for the target up front so a media subsection rests and
    // a text subsection enters the editing band in the same commit.
    flushSync(() => {
      setSubIndex(next);
      setEditing(target.kind === "text");
    });
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
      className={`sp sp-deck${editing ? " sp-deck--editing" : ""}`}
      data-testid="sp-deck"
      data-section={section.id}
      data-sub={sub.key}
      data-editing={editing ? "true" : "false"}
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
        className={`sp-deck__prompt sp-deck__prompt--${dir} sp-deck__prompt--${sub.kind}`}
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
            type={sub.type ?? "text"}
            inputMode={sub.inputMode}
            value={value}
            placeholder={sub.placeholder}
            aria-label={sub.prompt}
            onChange={(e) => setField(sub.write(e.target.value))}
            onFocus={() => setEditing(true)}
            onBlur={(e) => {
              // Tapping Save/Back must not flip the composition mid-commit; goToSub
              // owns the editing flag for those. Any other blur (keyboard dismiss)
              // returns to the resting composition.
              const next = e.relatedTarget as HTMLElement | null;
              if (next?.closest?.(".sp-deck__cta")) return;
              setEditing(false);
            }}
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
