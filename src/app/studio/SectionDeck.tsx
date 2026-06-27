"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { flushSync } from "react-dom";
import {
  extractPhoneDigits,
  formatPhone,
  type BrandSettings,
} from "@/lib/brand";
import type { PublicPayload } from "@/tools/seller-presentation/output/public-payload";
import { SAMPLE_RECENT_LISTINGS } from "@/lib/onboarding/sample-listing-draft";
import { HeadshotField } from "@/app/settings/HeadshotField";
import type { HeadshotCropValue } from "@/app/settings/HeadshotCropEditor";
import {
  SEGMENTS,
  isProofDone,
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

export type SubKind = "text" | "media" | "control";

export interface SubsectionConfig {
  key: string;
  /** The single prompt shown for this subsection (the field label / question). */
  prompt: string;
  /**
   * text → keyboard input; media → inline photo upload/adjust (photo CTA labels);
   * control → a custom non-keyboard control that is NOT a photo upload (e.g. the
   * color picker), so it gets the text-style "Save & continue" CTA.
   */
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
  /** Patch for setField when a text subsection changes (b = the current overlay,
      for composite fields that must preserve a sibling value, e.g. review body+name). */
  write: (value: string, b: BrandSettings) => Partial<BrandSettings>;
  /** Media subsections render their own control (e.g. HeadshotField) inline. */
  renderMedia?: (
    effective: BrandSettings,
    setField: (patch: Partial<BrandSettings>) => void,
  ) => ReactNode;
}

export interface SectionConfig {
  id: SegmentKey;
  /** The ONE stable section element + its single framing, mounted once. */
  renderSection: (payload: PublicPayload, reducedMotion: boolean, saved: boolean) => ReactNode;
  subsections: SubsectionConfig[];
  /**
   * The ONE framing for this section, chosen once and stable across subsections:
   *  - "contain" (default): scale the whole component to be FULLY visible.
   *  - "top-slice": for TALL sections (marketing) — fit the width so the top
   *    (the lead card / hero band) reads legibly; the rest is clipped, not shrunk
   *    into an unreadable smudge.
   * Never a per-subsection re-crop/zoom.
   */
  framing?: "contain" | "top-slice";
  /**
   * The section's quality bar. When already met (a returning agent whose data is
   * set), required-subsection gating relaxes so they can advance/finish without
   * re-typing. Mirrors the step's "done" predicate (isYouDone / isReachDone).
   */
  satisfied?: (b: BrandSettings) => boolean;
  /**
   * A preview-only BEAT: a section with zero input subsections (e.g. Recent work).
   * Shows the stable preview + this copy + a single "Save & continue"; persists
   * nothing.
   */
  beatCopy?: string;
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

/* ───────────────────────────── Step 3 (Proof) config ───────────────────────────── */

/**
 * PROOF_SECTION — the cream testimonial (TrustStrip), shown whole. Review is the
 * required lead; reviewer name + reviews link are additive. Review body is stored
 * RAW (trimmed + empty-name-defaulted at commit, same as the desktop console), so
 * the spacebar isn't swallowed mid-type.
 */
export const PROOF_SECTION: SectionConfig = {
  id: "proof",
  satisfied: isProofDone,
  renderSection: (payload, reducedMotion, saved) => (
    <AssetPreviewFrame
      payload={payload}
      asset="proof"
      saved={saved}
      reducedMotion={reducedMotion}
    />
  ),
  subsections: [
    {
      key: "review",
      prompt: "Paste a review",
      kind: "text",
      required: true,
      placeholder: "They made the whole sale feel easy…",
      read: (b) => b.agentReviews?.[0]?.body ?? "",
      write: (v, b) => ({
        agentReviews: v.trim()
          ? [{ body: v, attributionName: b.agentReviews?.[0]?.attributionName ?? "" }]
          : undefined,
      }),
    },
    {
      key: "reviewer",
      prompt: "Who said it (optional)",
      kind: "text",
      required: false,
      placeholder: "e.g. J. Mendoza",
      read: (b) => b.agentReviews?.[0]?.attributionName ?? "",
      // Preserve the body; a name alone (no body) writes no review.
      write: (v, b) => {
        const body = b.agentReviews?.[0]?.body;
        return body ? { agentReviews: [{ body, attributionName: v }] } : {};
      },
    },
    {
      key: "reviewsLink",
      prompt: "Link to all your reviews (optional)",
      kind: "text",
      required: false,
      type: "url",
      inputMode: "url",
      placeholder: "Zillow profile, etc.",
      read: (b) => b.reviewsOutlinkUrl ?? "",
      write: (v) => ({ reviewsOutlinkUrl: v }),
    },
  ],
};

/* ───────────────────────────── Step 5 (Recent work) config ─────────────────────────────
 * (Step 4 "How you sell" is the deliberate deck EXCEPTION — it keeps the populated
 * multi-point console editor + a bottom preview, so it is NOT a SectionConfig.) */

/**
 * WORK_SECTION — a preview-only BEAT: the recent-listings coverflow with the
 * existing SAMPLE listings, no input subsections, persists nothing. The real
 * recent-listings editor stays in Settings. Uses the coverflow-only CampaignSpread
 * variant so the relevant slice (the cards) is what shows, contained and legible.
 * The preview forces the curated SAMPLE_RECENT_LISTINGS (all photo + address +
 * views) so a photoless real listing can never leak a blank card into the beat.
 */
export const WORK_SECTION: SectionConfig = {
  id: "work",
  beatCopy:
    "Your recent work shows here. Add your own listings anytime in Settings.",
  renderSection: (payload, reducedMotion, saved) => (
    <AssetPreviewFrame
      payload={{ ...payload, recentListings: SAMPLE_RECENT_LISTINGS }}
      asset="work"
      campaignVariant="coverflow-only"
      saved={saved}
      reducedMotion={reducedMotion}
    />
  ),
  subsections: [],
};

/* ───────────────────────────── scale-to-contain ───────────────────────────── */

/**
 * useContainScale — the ONE framing mechanism. Measures the section's natural size
 * (the inner box's pre-transform offset size) against the available band, and
 * returns a scale that makes it FULLY visible ("contain") or width-legible with
 * the top in view ("top-slice"). Never zooms in (clamped ≤ 1), never clips a
 * contained section. rAF-batched + ResizeObserver so live edits (the section
 * growing as the user types) and the keyboard band shrinking both re-fit.
 */
function useContainScale(framing: "contain" | "top-slice") {
  const frameRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const frame = frameRef.current;
    const inner = innerRef.current;
    if (!frame || !inner) return;
    let raf = 0;
    const measure = () => {
      const availW = frame.clientWidth;
      const availH = frame.clientHeight;
      const natW = inner.offsetWidth;
      const natH = inner.offsetHeight;
      if (!availW || !natW || !natH) return;
      const s =
        framing === "top-slice"
          ? Math.min(availW / natW, 1)
          : Math.min(availW / natW, availH / natH, 1);
      setScale((prev) => (Math.abs(prev - s) < 0.004 ? prev : s));
    };
    const schedule = () => {
      if (raf) cancelAnimationFrame(raf);
      raf = requestAnimationFrame(measure);
    };
    schedule();
    const ro = new ResizeObserver(schedule);
    ro.observe(frame);
    ro.observe(inner);
    const vv = window.visualViewport;
    vv?.addEventListener("resize", schedule);
    return () => {
      if (raf) cancelAnimationFrame(raf);
      ro.disconnect();
      vv?.removeEventListener("resize", schedule);
    };
  }, [framing]);
  return { frameRef, innerRef, scale };
}

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

  const framing = section.framing ?? "contain";
  const { frameRef, innerRef, scale } = useContainScale(framing);

  // A preview-only BEAT (Recent work) has zero input subsections: preview + copy
  // + a single "Save & continue".
  const isBeat = subs.length === 0;
  const sub = isBeat ? null : subs[subIndex];
  const value = sub ? sub.read(effective) : "";
  const hasValue = value.trim().length > 0;
  const isLast = !isBeat && subIndex === subs.length - 1;
  // Required gates Save until a real value exists; optional always advances (Skip
  // when empty). A returning agent whose section is already satisfied (e.g. a
  // contact already on file) is never forced to re-type — gating relaxes.
  const sectionSatisfied = section.satisfied?.(effective) ?? false;
  const canAdvance = isBeat || !sub!.required || hasValue || sectionSatisfied;

  // CTA label by context (one button style across the small set). The label
  // derives from the CURRENT subsection's kind: a control (color) reads like text
  // ("Save & continue"), never the photo CTA.
  let ctaLabel: string;
  if (isBeat) {
    ctaLabel = "Save & continue";
  } else if (sub!.kind === "media") {
    ctaLabel = hasValue ? "Use this photo" : "Skip for now";
  } else if (sub!.kind === "control") {
    ctaLabel = isLast ? "Finish section" : "Save & continue";
  } else if (!sub!.required && !hasValue) {
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
    if (isBeat || isLast) onFinish();
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
      data-sub={sub?.key}
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

      {/* THE STABLE SECTION — one element, one framing, mounted once. The inner
          box is SCALED to fit (scale-to-contain, or width-legible top-slice for a
          tall section); it is never re-cropped/re-framed per subsection and never
          zooms in. */}
      <div
        className="sp-deck__preview"
        data-testid="sp-deck-preview"
        data-framing={framing}
        ref={frameRef}
      >
        <div
          className="sp-deck__fit"
          ref={innerRef}
          style={{ transform: `scale(${scale})` }}
        >
          {section.renderSection(previewPayload, reducedMotion, savedNow)}
        </div>
      </div>

      {/* THE PROMPT DECK — exactly one subsection prompt in the DOM at a time (or
          a preview-only beat with none). The key remounts the block per subsection
          so the slide-in animation plays; the section preview above stays anchored. */}
      {isBeat ? (
        <div
          className="sp-deck__prompt sp-deck__prompt--beat"
          data-testid="sp-deck-prompt"
        >
          <p className="sp-deck__beat">{section.beatCopy}</p>
        </div>
      ) : (
        <div
          key={sub!.key}
          className={`sp-deck__prompt sp-deck__prompt--${dir} sp-deck__prompt--${sub!.kind}`}
          data-testid="sp-deck-prompt"
        >
          <p className="sp-deck__count" data-testid="sp-deck-count">
            {subIndex + 1} of {subs.length}
          </p>
          <p className="sp-deck__label">{sub!.prompt}</p>
          {sub!.kind === "text" ? (
            <input
              ref={inputRef}
              className="sp-input sp-deck__input"
              data-testid="sp-deck-input"
              type={sub!.type ?? "text"}
              inputMode={sub!.inputMode}
              value={value}
              placeholder={sub!.placeholder}
              aria-label={sub!.prompt}
              onChange={(e) => setField(sub!.write(e.target.value, effective))}
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
              {sub!.renderMedia?.(effective, setField)}
            </div>
          )}
        </div>
      )}

      {toast && (
        <p className="sp-deck__toast" data-testid="sp-deck-toast" role="status">
          {toast}
        </p>
      )}

      <div className="sp-deck__cta">
        {/* preventDefault on mousedown so tapping the button does NOT blur the
            focused input: otherwise the keyboard dismisses + the layout re-anchors
            (editing -> resting) and the button MOVES before the click resolves, so
            the first tap is lost (needs two taps). Keeping focus keeps the button
            stationary; goToSub handles focus/keyboard for the next subsection. */}
        <button
          type="button"
          className="sp-btn sp-btn--primary"
          data-testid="sp-deck-cta"
          disabled={!canAdvance || saving}
          onMouseDown={(e) => e.preventDefault()}
          onClick={onCta}
        >
          {ctaLabel}
        </button>
        <button
          type="button"
          className="sp-btn sp-btn--ghost"
          data-testid="sp-deck-back"
          disabled={saving}
          onMouseDown={(e) => e.preventDefault()}
          onClick={onBackCta}
        >
          Back
        </button>
      </div>
    </div>
  );
}
