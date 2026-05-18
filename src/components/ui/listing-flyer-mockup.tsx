"use client";

import { motion } from "framer-motion";
import {
  FolderPlus,
  Heart,
  Mail,
  MessageSquare,
  Pencil,
  Printer,
  StickyNote,
} from "lucide-react";
import { useEffect, useState } from "react";

/**
 * Self-contained 14-second loop demoing the Listing Flyer Generator on a
 * mobile-shaped surface. Designed to render inside the inner area of
 * IphoneScrollShowcase (~300×690px after bezel).
 *
 * Animation engine: a single requestAnimationFrame timer publishes the
 * current loop time `t` (0–14s, modulo). All UI is derived from `t` via
 * pure helpers.
 *
 * H-5 added a COLOR MODE step demonstrating the per-flyer color override
 * feature. Loop extended 12s→14s; typing budget held at 4.7s (the rhythm
 * was carefully tuned in H-3.5e, so downstream events are shifted instead
 * of compressing the typing). App UI elements (top label, export button,
 * active field borders, status chip) stay mint — only flyer-content
 * elements (JUST LISTED badge, price, bullet dots, agent-footer mark,
 * mini-thumbnail accent, preview-frame bg) switch palettes during COLOR
 * MODE. Two distinct color systems: the app's brand mint vs the
 * flyer's customizable colors.
 *
 * H-5.1 polish:
 *   - Color reset moved from the loop-wrap snap into the share-sheet
 *     exit window. Sheet slides down at 13.0; palette eases back to
 *     default 13.0-13.5 (largely behind the receding sheet). At t=0
 *     the loop wraps from a default-palette hold, so there is no
 *     visible color snap any more.
 *   - Each color transition stretched 0.4s → 0.6s with easeInOutCubic
 *     so each swatch tap registers as "becoming" rather than "snap."
 *     Three sequential 0.6s transitions chain end-to-end inside the
 *     existing COLOR MODE budget (8.4-10.2).
 *   - FORM ↔ COLOR crossfade extended from 0.2s symmetric to a 0.4s
 *     picker fade overlapping a 0.2s form/summary fade — gives the
 *     panel-content swap a settled feel rather than a flag-flip.
 *   - Active-swatch position indicator added: a single mint vertical
 *     bar that physically glides between rows via spring physics,
 *     replacing the implicit "ring fades on row N, ring fades on row
 *     N+1" hand-off that read as a jump.
 *   - fadeOnly eased with easeInOutCubic for the same reason.
 *
 * Timeline:
 *   0.0–3.0   HOLD POPULATED STATE — slow Ken Burns, default palette
 *   3.0–3.6   PREVIEW → FORM transition
 *   3.6–8.25  typing windows (address / price / stats / 3× features)
 *   8.1–8.3   form fields fade out
 *   8.1–8.5   color picker fades in (0.4s, overlaps form fade-out)
 *   8.3–9.0   PRIMARY active; color transitions 8.4-9.0 (0.6s)
 *   9.0–9.6   ACCENT active; color transitions 9.0-9.6 (0.6s)
 *   9.6–10.3  BACKGROUND active; color transitions 9.6-10.2 (0.6s)
 *  10.2–10.3  hold new palette
 *  10.3–10.7  color picker fades out (0.4s)
 *  10.3–10.9  COLOR → PREVIEW panel resize
 *  10.5–10.7  summary fades in (0.2s, overlaps picker fade-out tail)
 *  10.9–11.6  Export PDF button pulses (custom palette visible)
 *  11.6–11.8  button tap
 *  11.8–12.4  loading state
 *  12.4–14.5  share sheet visible (slides up, holds ~1.8s pure hold
 *             after spring settles — H-5.1b extended from 0.3s)
 *  14.5       share sheet exit triggered (spring slides down ~0.3s)
 *  14.5–15.3  palette resets to default (0.8s window, mostly hidden
 *             behind the receding sheet)
 *  15.3–15.6  hold preview at default palette
 *  15.6 = 0.0 wrap — palette already default, no snap
 */

const LOOP_S = 15.6;
const MINT = "#4ef2d9";

// Default flyer palette (what the loop starts with) and the custom palette
// transitioned to during COLOR MODE. Coral primary + deep navy bg picked
// for boutique-realtor warmth and clear distance from the brand mint.
const FLYER_PRIMARY_DEFAULT = "#4ef2d9";
const FLYER_ACCENT_DEFAULT = "#4ef2d9";
const FLYER_BG_DEFAULT = "#0a0a0a";
const FLYER_PRIMARY_CUSTOM = "#f97056";
const FLYER_ACCENT_CUSTOM = "#f97056";
const FLYER_BG_CUSTOM = "#1a2740";

// Unsplash photo URL used as the property hero for the iPhone mockup.
// Unsplash license doesn't require attribution but encourages it; keeping
// these comments so credit can be added later if policy changes.
//
//   Modern home exterior — https://unsplash.com/photos/Pc4iz8h5JJo
const HERO_PHOTO_URL =
  "https://images.unsplash.com/photo-1568605114967-8130f3a36994?w=800&q=85";

// Hold-end + reset-end define the populated→empty fade window, kept in
// sync with the panel-resize window in computePreviewWeight so content
// fade and panel motion happen together.
const HOLD_END = 3.0;
const RESET_END = 3.6;

/** Opacity for an element that holds visible at start of loop, fades out
 *  during the reset, hides through the typing phase, fades back in during
 *  the preview reveal, and stays visible until loop end. */
function opacityCycle(
  t: number,
  holdEnd: number,
  resetEnd: number,
  revealStart: number,
  revealEnd: number
): number {
  if (t <= holdEnd) return 1;
  if (t <= resetEnd) return 1 - (t - holdEnd) / (resetEnd - holdEnd);
  if (t <= revealStart) return 0;
  if (t <= revealEnd) return (t - revealStart) / (revealEnd - revealStart);
  return 1;
}

/** Typed-text cycle. Returns the substring visible at time t and the
 *  opacity multiplier for the parent. */
function typedCycle(
  text: string,
  t: number,
  holdEnd: number,
  resetEnd: number,
  typeStart: number,
  typeEnd: number
): { text: string; opacity: number } {
  if (t <= holdEnd) return { text, opacity: 1 };
  if (t <= resetEnd) {
    return {
      text,
      opacity: 1 - (t - holdEnd) / (resetEnd - holdEnd),
    };
  }
  if (t <= typeStart) return { text: "", opacity: 1 };
  if (t <= typeEnd) {
    const p = (t - typeStart) / (typeEnd - typeStart);
    return { text: text.slice(0, Math.round(p * text.length)), opacity: 1 };
  }
  return { text, opacity: 1 };
}

/** Cubic ease-in-out — smooths the layout-mode transitions so the panels
 *  don't snap. */
function easeInOutCubic(p: number): number {
  return p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;
}

/** Linear RGB interpolation between two #rrggbb hex colors. p in [0,1]. */
function lerpColor(a: string, b: string, p: number): string {
  const ar = parseInt(a.slice(1, 3), 16);
  const ag = parseInt(a.slice(3, 5), 16);
  const ab = parseInt(a.slice(5, 7), 16);
  const br = parseInt(b.slice(1, 3), 16);
  const bg = parseInt(b.slice(3, 5), 16);
  const bb = parseInt(b.slice(5, 7), 16);
  const r = Math.round(ar + (br - ar) * p);
  const g = Math.round(ag + (bg - ag) * p);
  const bv = Math.round(ab + (bb - ab) * p);
  return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${bv.toString(16).padStart(2, "0")}`;
}

/** Returns the live color value at time t. Holds at `base` until
 *  transitionStart, eases to `custom` between transitionStart and
 *  transitionEnd, holds at `custom`, then optionally eases back to
 *  `base` between resetStart and resetEnd before holding at base
 *  through the rest of the loop. The reset window is what lets the
 *  palette return to default during the share-sheet exit instead of
 *  snapping at the loop boundary. */
function colorCycle(
  t: number,
  base: string,
  custom: string,
  transitionStart: number,
  transitionEnd: number,
  resetStart?: number,
  resetEnd?: number
): string {
  if (t <= transitionStart) return base;
  if (resetEnd !== undefined && t >= resetEnd) return base;
  if (resetStart !== undefined && t >= resetStart) {
    const span = (resetEnd ?? resetStart) - resetStart;
    if (span <= 0) return base;
    const p = easeInOutCubic((t - resetStart) / span);
    return lerpColor(custom, base, p);
  }
  if (t >= transitionEnd) return custom;
  const p = easeInOutCubic((t - transitionStart) / (transitionEnd - transitionStart));
  return lerpColor(base, custom, p);
}

/** Generic fade-in/hold/fade-out opacity, eased with easeInOutCubic
 *  on both edges so panel-content swaps feel "settled" rather than
 *  flag-flip. Used for the form-fields ↔ color-picker ↔ summary
 *  crossfade in the form panel. Linear opacity for these short fades
 *  reads as too mechanical alongside the eased panel-resize and
 *  color transitions. */
function fadeOnly(
  t: number,
  fadeInStart: number,
  fadeInEnd: number,
  fadeOutStart: number,
  fadeOutEnd: number
): number {
  if (t < fadeInStart) return 0;
  if (t < fadeInEnd) return easeInOutCubic((t - fadeInStart) / (fadeInEnd - fadeInStart));
  if (t < fadeOutStart) return 1;
  if (t < fadeOutEnd) return 1 - easeInOutCubic((t - fadeOutStart) / (fadeOutEnd - fadeOutStart));
  return 0;
}

/** Returns the preview panel's flex-grow weight at time t. Inverse of the
 *  form panel weight. PREVIEW MODE during the populated hold (0..3) and
 *  after form completes (8.7..12); FORM MODE during the typing window
 *  (3.3..8.7); two short transition windows interpolate smoothly between
 *  the modes.
 *
 *  H-3.5d softened the endpoints from 0.95/0.05 to 0.88/0.38. The 95/5
 *  split left dead space in both modes: in PREVIEW the form strip was
 *  too thin to fit the export button comfortably, in FORM the preview
 *  collapsed to a useless label-only sliver. 88/12 keeps the export
 *  button area readable below the full preview, 38/62 keeps a compact
 *  property card visible while the user types — both panels read as
 *  "doing something" at all times. */
const PREVIEW_HEAVY = 0.88;
const PREVIEW_LIGHT = 0.38;
function computePreviewWeight(t: number): number {
  // Cold paint + initial hold
  if (t < 3.0) return PREVIEW_HEAVY;
  // Transition into FORM MODE
  if (t < 3.6) {
    const p = easeInOutCubic((t - 3.0) / 0.6);
    return PREVIEW_HEAVY - p * (PREVIEW_HEAVY - PREVIEW_LIGHT);
  }
  // FORM MODE (typing) + COLOR MODE (color picker) — both share the
  // same panel split. The form-panel content crossfades between form
  // fields, color picker, and "ready to export" summary; layout split
  // doesn't need to move during the swap.
  if (t < 10.3) return PREVIEW_LIGHT;
  // Transition back to PREVIEW MODE
  if (t < 10.9) {
    const p = easeInOutCubic((t - 10.3) / 0.6);
    return PREVIEW_LIGHT + p * (PREVIEW_HEAVY - PREVIEW_LIGHT);
  }
  // PREVIEW MODE through button + share-sheet sequence
  return PREVIEW_HEAVY;
}

/** Snap-in cycle for one-shot values (digits in beds/baths/sqft). */
function staggerCycle(t: number, revealAt: number) {
  const opacity =
    t <= HOLD_END
      ? 1
      : t <= RESET_END
        ? 1 - (t - HOLD_END) / (RESET_END - HOLD_END)
        : t < revealAt
          ? 0
          : 1;
  const visible = t <= HOLD_END || t >= revealAt;
  return (text: string) => ({ text: visible ? text : "", opacity });
}

export default function ListingFlyerMockup() {
  const [t, setT] = useState(0);

  useEffect(() => {
    let raf = 0;
    const startTs = performance.now();
    const tick = (now: number) => {
      const elapsed = ((now - startTs) / 1000) % LOOP_S;
      setT(elapsed);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  // Typing windows — normalized to ~70ms/char for the long values so the
  // rhythm doesn't feel "slow start, fast finish." Short bullets type at
  // ~35-45ms/char since the eye doesn't dwell on three-word phrases.
  const address = typedCycle("1247 Maple Heights Dr", t, HOLD_END, RESET_END, 3.6, 5.1);
  const price = typedCycle("$685,000", t, HOLD_END, RESET_END, 5.3, 5.86);
  const beds = staggerCycle(t, 5.95)("4");
  const baths = staggerCycle(t, 6.1)("3");
  const sqft = staggerCycle(t, 6.25)("2,548");
  const feature1 = typedCycle("Chef's kitchen with marble", t, HOLD_END, RESET_END, 6.5, 7.4);
  const feature2 = typedCycle("Open Bar", t, HOLD_END, RESET_END, 7.5, 7.85);
  const feature3 = typedCycle("Indoor Pool", t, HOLD_END, RESET_END, 7.9, 8.25);

  // Preview reveal opacities — badge + hero + address + price + stats
  // + footer fade in DURING form-mode typing (visible in the compact
  // card). Bullets + photo-grid reveal during the COLOR→PREVIEW
  // transition (10.3-10.9), so their windows are 2s later than the
  // pre-H-5 layout where this transition was at 8.3-8.9.
  const previewBadgeOp = opacityCycle(t, HOLD_END, RESET_END, 3.6, 3.95);
  const previewHeroOp = opacityCycle(t, HOLD_END, RESET_END, 3.6, 4.0);
  const previewAddressOp = opacityCycle(t, HOLD_END, RESET_END, 4.5, 4.9);
  const previewPriceOp = opacityCycle(t, HOLD_END, RESET_END, 5.4, 5.8);
  const previewStatsOp = opacityCycle(t, HOLD_END, RESET_END, 5.95, 6.3);
  const previewFooterOp = opacityCycle(t, HOLD_END, RESET_END, 5.95, 6.3);
  const previewF1Op = opacityCycle(t, HOLD_END, RESET_END, 10.55, 10.75);
  const previewF2Op = opacityCycle(t, HOLD_END, RESET_END, 10.6, 10.8);
  const previewF3Op = opacityCycle(t, HOLD_END, RESET_END, 10.65, 10.85);
  const previewGridOp = opacityCycle(t, HOLD_END, RESET_END, 10.7, 10.9);

  // Subtle Ken Burns on the hero — only during the populated hold phase
  // so the frame doesn't feel completely static. 1.0 → 1.02 over 0-3s.
  const heroZoom = t < HOLD_END ? 1.0 + (t / HOLD_END) * 0.02 : 1.0;

  // Live flyer palette. Stays at default through typing, eases to
  // custom during the relevant swatch-tap window in COLOR MODE, holds
  // through PREVIEW + the extended SHARE hold, then eases back to
  // default during the share-sheet exit (14.5-15.3) so the loop wrap
  // is colorless — no visible palette snap. Each color uses a 0.6s
  // forward transition (chained end-to-end across the COLOR MODE
  // budget) and a shared 0.8s reset window aligned with the share-
  // sheet slide-down.
  const currentPrimary = colorCycle(t, FLYER_PRIMARY_DEFAULT, FLYER_PRIMARY_CUSTOM, 8.4, 9.0, 14.5, 15.3);
  const currentAccent = colorCycle(t, FLYER_ACCENT_DEFAULT, FLYER_ACCENT_CUSTOM, 9.0, 9.6, 14.5, 15.3);
  const currentBg = colorCycle(t, FLYER_BG_DEFAULT, FLYER_BG_CUSTOM, 9.6, 10.2, 14.5, 15.3);

  // Active swatch index for the picker. -1 means no swatch focused.
  // Each window covers its swatch's color-transition window plus a
  // brief lead-in/linger so the indicator arrives just before the
  // color starts changing and stays put through the change.
  const activeSwatch =
    t >= 8.3 && t < 9.0 ? 0 : t >= 9.0 && t < 9.6 ? 1 : t >= 9.6 && t < 10.3 ? 2 : -1;

  // Button + share-sheet timing. Sheet now holds visibly for ~1.8s
  // (H-5.1b extended from 0.3s, brief found the original too quick
  // to read) before exiting at 14.5. Spring (damping:26, stiffness:
  // 280) settles in ~0.3s; the 0.8s color-reset window finishes at
  // 15.3 with 0.3s of preview hold remaining before the loop wraps
  // at 15.6. Loop end-state matches loop start-state (default
  // palette, full preview, no share sheet) so the wrap is invisible.
  const buttonPulse = t >= 10.9 && t < 11.6;
  const buttonTap = t >= 11.6 && t < 11.8;
  const buttonLoading = t >= 11.8 && t < 12.4;

  const shareSheetIn = t >= 12.4 && t < 14.5;

  // Three-mode layout. previewWeight drives both panels' flex-grow
  // inversely; PREVIEW at t=0..3 and 10.9..14, FORM/COLOR at t=3.6..10.3.
  const previewWeight = computePreviewWeight(t);
  const formWeight = 1 - previewWeight;

  // Form-panel content crossfade. Three stacked layers with independent
  // opacity windows; each handoff is an asymmetric overlap rather than
  // a hard handoff: the picker fades over 0.4s on each side while the
  // form fields and summary fade over 0.2s, so during the swap both
  // layers are mid-opacity for a moment instead of one snapping in as
  // the other snaps out. easeInOutCubic on each edge (via fadeOnly).
  const formFieldsOpacity = fadeOnly(t, 3.5, 3.7, 8.1, 8.3);
  const colorPickerOpacity = fadeOnly(t, 8.1, 8.5, 10.3, 10.7);
  // Summary visible at the loop boundaries (start + end), hidden in
  // the middle. Computed piecewise since fadeOnly assumes hidden-then-
  // visible-then-hidden, the inverse of what we need.
  let summaryOpacity: number;
  if (t < 3.3) summaryOpacity = 1;
  else if (t < 3.5) summaryOpacity = 1 - (t - 3.3) / 0.2;
  else if (t < 10.5) summaryOpacity = 0;
  else if (t < 10.7) summaryOpacity = (t - 10.5) / 0.2;
  else summaryOpacity = 1;

  // Photo grid + bullets + agent footer only render when the preview
  // card has room. Gated on previewWeight crossing 0.7 — true during
  // PREVIEW MODE, false during FORM/COLOR MODE.
  const previewCompact = previewWeight < 0.7;

  // Active-field highlight — currently-typing field gets a mint border.
  const activeAddress = t >= 3.6 && t < 5.1;
  const activePrice = t >= 5.3 && t < 5.86;
  const activeStats = t >= 5.95 && t < 6.35;
  const activeF1 = t >= 6.5 && t < 7.4;
  const activeF2 = t >= 7.5 && t < 7.85;
  const activeF3 = t >= 7.9 && t < 8.25;

  return (
    <div className="w-full h-full bg-neutral-950 text-white flex flex-col text-[10px] font-sans relative overflow-hidden">
      {/* Top label — fixed strip */}
      <div className="px-4 pt-7 pb-1.5 border-b border-neutral-900 flex-shrink-0">
        <p
          className="text-[8px] uppercase tracking-[0.2em]"
          style={{ color: MINT }}
        >
          Listing Flyer Generator
        </p>
        <p className="text-[9px] text-neutral-500 mt-0.5">
          1247-maple-heights-dr.pdf
        </p>
      </div>

      {/* Preview panel — flex-grow follows previewWeight so it expands in
          PREVIEW MODE and shrinks to a label strip in FORM/COLOR MODE.
          Background animates with currentBg during the BACKGROUND swatch
          tap (9.8-10.1) so the area framing the white flyer card visibly
          shifts to navy — keeps the card's text contrast intact. */}
      <div
        style={{ flex: `${previewWeight} 0 0`, backgroundColor: currentBg }}
        className="overflow-hidden flex flex-col border-b border-neutral-900 transition-none"
      >
        <p className="px-3 pt-2 pb-1 text-[7px] uppercase tracking-[0.15em] text-neutral-600 flex-shrink-0">
          Live preview
        </p>
        <div className="flex-1 px-3 pb-2 overflow-hidden flex flex-col">
          <FlyerPreviewCard
            badgeOpacity={previewBadgeOp}
            heroOpacity={previewHeroOp}
            heroZoom={heroZoom}
            addressOpacity={previewAddressOp}
            priceOpacity={previewPriceOp}
            statsOpacity={previewStatsOp}
            f1Opacity={previewF1Op}
            f2Opacity={previewF2Op}
            f3Opacity={previewF3Op}
            gridOpacity={previewGridOp}
            footerOpacity={previewFooterOp}
            compact={previewCompact}
            primaryColor={currentPrimary}
            accentColor={currentAccent}
          />
        </div>
      </div>

      {/* Form panel — inverse of preview. Three stacked layers crossfade
          via independent computed opacities: form fields during FORM
          MODE, color picker during COLOR MODE, "ready to export" summary
          at the loop boundaries. Each layer is absolute-positioned so
          the panel height stays driven by formWeight. */}
      <div
        style={{ flex: `${formWeight} 0 0` }}
        className="overflow-hidden flex flex-col relative bg-neutral-950"
      >
        {/* Full form */}
        <div
          className="absolute inset-0 px-3 py-3 overflow-hidden flex flex-col gap-3"
          style={{
            opacity: formFieldsOpacity,
            pointerEvents: formFieldsOpacity > 0.5 ? "auto" : "none",
          }}
        >
          <p className="text-[7px] uppercase tracking-[0.15em] text-neutral-500 flex-shrink-0">
            Fill in your flyer
          </p>
          <FormField label="Address" cycle={address} active={activeAddress} />
          <FormField label="List price" cycle={price} accent active={activePrice} />
          <div className="grid grid-cols-3 gap-1.5">
            <FormField label="Beds" cycle={beds} active={activeStats} />
            <FormField label="Baths" cycle={baths} active={activeStats} />
            <FormField label="Sq ft" cycle={sqft} active={activeStats} />
          </div>
          <div className="space-y-1.5">
            <p className="text-[7px] uppercase tracking-[0.15em] text-neutral-500">
              Feature bullets
            </p>
            <FormChip cycle={feature1} active={activeF1} />
            <FormChip cycle={feature2} active={activeF2} />
            <FormChip cycle={feature3} active={activeF3} />
          </div>
        </div>

        {/* Color picker. Rows wrapped in a relative container so the
            sliding focus indicator can position itself absolutely
            against row offsets. */}
        <div
          className="absolute inset-0 px-3 py-3 overflow-hidden flex flex-col gap-2"
          style={{
            opacity: colorPickerOpacity,
            pointerEvents: colorPickerOpacity > 0.5 ? "auto" : "none",
          }}
        >
          <p className="text-[7px] uppercase tracking-[0.15em] text-neutral-500 flex-shrink-0">
            Brand colors
          </p>
          <div className="relative flex flex-col gap-2">
            {/* Sliding focus indicator — single mint vertical bar that
                physically glides between row positions via spring
                physics. Replaces the prior "ring fades on row N as
                ring fades on row N+1" hand-off, which read as a
                jump. Y values map to row tops + 6px (each SwatchRow
                is 40px tall with 8px gap; swatch starts at +6 inside
                its row). Hidden when no row is active. */}
            <motion.div
              className="absolute left-0 top-0 w-[2px] rounded-full pointer-events-none"
              style={{ backgroundColor: MINT, height: 28 }}
              animate={{
                y:
                  activeSwatch === 0
                    ? 6
                    : activeSwatch === 1
                      ? 54
                      : activeSwatch === 2
                        ? 102
                        : 0,
                opacity: activeSwatch >= 0 ? 1 : 0,
              }}
              transition={{ type: "spring", stiffness: 380, damping: 30 }}
            />
            <SwatchRow
              label="Primary"
              hex={currentPrimary}
              active={activeSwatch === 0}
            />
            <SwatchRow
              label="Accent"
              hex={currentAccent}
              active={activeSwatch === 1}
            />
            <SwatchRow
              label="Background"
              hex={currentBg}
              active={activeSwatch === 2}
            />
          </div>
        </div>

        {/* Collapsed summary */}
        <div
          className="absolute inset-0 px-3 py-2 flex items-center gap-2"
          style={{
            opacity: summaryOpacity,
            pointerEvents: summaryOpacity > 0.5 ? "auto" : "none",
          }}
        >
          <span
            className="inline-flex items-center justify-center w-3.5 h-3.5 rounded-full text-[8px] font-bold text-black flex-shrink-0"
            style={{ backgroundColor: MINT }}
          >
            ✓
          </span>
          <span className="text-[9px] text-neutral-300 truncate">
            Listing flyer ready to export
          </span>
        </div>
      </div>

      <div className="px-3 pb-3 pt-2 bg-neutral-950 border-t border-neutral-900 flex-shrink-0">
        <motion.button
          type="button"
          animate={{
            scale: buttonTap ? 0.96 : buttonPulse ? 1.03 : 1,
          }}
          transition={{ duration: 0.2 }}
          className="w-full rounded-md py-2.5 text-[11px] font-bold text-black flex items-center justify-center gap-2"
          style={{
            backgroundColor: MINT,
            boxShadow: buttonPulse
              ? `0 0 0 4px ${MINT}33, 0 6px 20px -6px ${MINT}99`
              : `0 4px 14px -4px ${MINT}66`,
          }}
        >
          {buttonLoading ? (
            <>
              <Spinner />
              Generating PDF…
            </>
          ) : (
            "Export PDF"
          )}
        </motion.button>
      </div>

      <ShareSheet visible={shareSheetIn} flyerPrimaryColor={currentPrimary} />
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────── */

function Spinner() {
  return (
    <svg
      className="w-3 h-3 animate-spin"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="3"
    >
      <circle cx="12" cy="12" r="9" opacity="0.25" />
      <path d="M21 12a9 9 0 0 0-9-9" strokeLinecap="round" />
    </svg>
  );
}

function FormField({
  label,
  cycle,
  accent = false,
  active = false,
}: {
  label: string;
  cycle: { text: string; opacity: number };
  accent?: boolean;
  active?: boolean;
}) {
  const { text, opacity } = cycle;
  // Active border (mint) trumps the accent treatment so the eye follows
  // the typing cursor; once the field is no longer being typed, accent
  // (price field) reverts to its mint-tinted "filled" border.
  const borderClass = active
    ? "border-mint"
    : accent && text
      ? "border-mint/40"
      : "border-neutral-800";
  const bgStyle = active
    ? { backgroundColor: "rgba(78, 242, 217, 0.05)" }
    : undefined;
  return (
    <div>
      <p className="uppercase tracking-[0.15em] text-neutral-500 mb-0.5 text-[7px]">
        {label}
      </p>
      <div
        className={`bg-neutral-900 border rounded px-2 py-1 text-[10px] min-h-[22px] flex items-center transition-colors ${borderClass}`}
        style={bgStyle}
      >
        <span
          style={{
            opacity,
            color: accent && text ? MINT : undefined,
          }}
        >
          {text || <span className="opacity-30">|</span>}
        </span>
      </div>
    </div>
  );
}

function SwatchRow({
  label,
  hex,
  active,
}: {
  label: string;
  hex: string;
  active: boolean;
}) {
  return (
    <div
      className="flex items-center gap-2 rounded px-2 py-1.5"
      style={{
        backgroundColor: active ? "rgba(78, 242, 217, 0.06)" : "transparent",
        transition: "background-color 200ms ease",
      }}
    >
      <div
        className="w-7 h-7 rounded flex-shrink-0"
        style={{
          backgroundColor: hex,
          boxShadow: active
            ? `0 0 0 2px ${MINT}, 0 0 0 4px rgba(78, 242, 217, 0.18)`
            : "0 0 0 1px rgba(255, 255, 255, 0.08)",
          transform: active ? "scale(1.05)" : "scale(1)",
          transition: "box-shadow 220ms ease, transform 220ms ease",
        }}
      />
      <div className="flex-1 min-w-0">
        <p className="uppercase tracking-[0.15em] text-neutral-500 text-[7px]">
          {label}
        </p>
        <p className="font-mono text-[9px] text-neutral-300 leading-tight">
          {hex.toUpperCase()}
        </p>
      </div>
    </div>
  );
}

function FormChip({
  cycle,
  active = false,
}: {
  cycle: { text: string; opacity: number };
  active?: boolean;
}) {
  const { text, opacity } = cycle;
  if (!text) {
    return (
      <div
        className={`bg-neutral-900 border border-dashed rounded px-2 py-1 text-[9px] text-neutral-600 min-h-[20px] flex items-center transition-colors ${
          active ? "border-mint" : "border-neutral-800"
        }`}
      >
        +
      </div>
    );
  }
  return (
    <div
      className={`bg-neutral-900 border rounded px-2 py-1 text-[9px] text-white min-h-[20px] flex items-center gap-1.5 transition-colors ${
        active ? "border-mint" : "border-neutral-800"
      }`}
      style={{
        opacity,
        ...(active ? { backgroundColor: "rgba(78, 242, 217, 0.05)" } : {}),
      }}
    >
      <span
        className="inline-block w-1.5 h-1.5 rounded-full flex-shrink-0"
        style={{ backgroundColor: MINT }}
      />
      <span className="truncate">{text}</span>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────── */

function FlyerPreviewCard({
  badgeOpacity,
  heroOpacity,
  heroZoom,
  addressOpacity,
  priceOpacity,
  statsOpacity,
  f1Opacity,
  f2Opacity,
  f3Opacity,
  gridOpacity,
  footerOpacity,
  compact = false,
  primaryColor,
  accentColor,
}: {
  badgeOpacity: number;
  heroOpacity: number;
  heroZoom: number;
  addressOpacity: number;
  priceOpacity: number;
  statsOpacity: number;
  f1Opacity: number;
  f2Opacity: number;
  f3Opacity: number;
  gridOpacity: number;
  footerOpacity: number;
  /** When true (FORM/COLOR MODE), the card runs lean: hero stretches
   *  via flex-1 instead of fixed aspect-ratio, photo grid + bullets
   *  hidden, agent footer hidden. */
  compact?: boolean;
  /** Live flyer palette. primaryColor drives the JUST LISTED badge,
   *  the price text, and the agent-footer chip; accentColor drives the
   *  bullet dots. Default to MINT so the mockup renders sensibly if
   *  rendered without the palette pipe. */
  primaryColor: string;
  accentColor: string;
}) {
  return (
    <div className="bg-white text-neutral-900 rounded-md overflow-hidden shadow-lg ring-1 ring-black/5 mx-auto flex flex-col h-full w-full">
      {/* Hero — when compact, flex-1 grows it to absorb the freed space.
          When not compact, fixed 8.5/4 aspect (a tight band so the
          info block + photo grid + footer have room below it). */}
      <div
        className={`relative w-full overflow-hidden bg-gradient-to-b from-sky-300 via-amber-200 to-amber-400 ${compact ? "flex-1 min-h-0" : ""}`}
        style={compact ? undefined : { aspectRatio: "8.5 / 4" }}
      >
        <motion.div
          style={{ opacity: heroOpacity, scale: heroZoom }}
          className="absolute inset-0"
        >
          <PropertyHeroPhoto />
        </motion.div>
        <motion.span
          style={{ opacity: badgeOpacity }}
          className="absolute top-1.5 left-1.5"
        >
          <span
            className="inline-block px-1.5 py-0.5 rounded-full text-[6px] font-bold uppercase tracking-[0.15em] text-black shadow-sm"
            style={{ backgroundColor: primaryColor }}
          >
            JUST LISTED
          </span>
        </motion.span>
      </div>

      <div
        className={`px-2 pt-1.5 pb-1.5 flex flex-col gap-0.5 ${compact ? "" : "flex-1 min-h-0"}`}
      >
        <motion.div style={{ opacity: addressOpacity }}>
          <p className="text-[7px] font-bold leading-tight text-neutral-900">
            1247 Maple Heights Dr
          </p>
          <p className="text-[5.5px] text-neutral-500 leading-tight">
            Olympia, WA 98501
          </p>
        </motion.div>
        <motion.p
          style={{ opacity: priceOpacity, color: primaryColor }}
          className="text-[12px] font-extrabold leading-none mt-0.5"
        >
          $685,000
        </motion.p>
        <motion.p
          style={{ opacity: statsOpacity }}
          className="text-[5.5px] font-semibold uppercase tracking-wider text-neutral-500"
        >
          4 BEDS · 3 BATHS · 2,548 SQ FT
        </motion.p>

        {/* Bullets + photo grid only render when there's room (PREVIEW
            MODE). Hiding outright instead of opacity-fading because at
            the compact card height these would crash into each other. */}
        {!compact && (
          <>
            <div className="space-y-0.5 mt-0.5">
              <PreviewBullet text="Chef's kitchen with marble" opacity={f1Opacity} dotColor={accentColor} />
              <PreviewBullet text="Open Bar" opacity={f2Opacity} dotColor={accentColor} />
              <PreviewBullet text="Indoor Pool" opacity={f3Opacity} dotColor={accentColor} />
            </div>
            <motion.div
              style={{ opacity: gridOpacity }}
              className="grid grid-cols-2 gap-0.5 mt-auto pt-1"
            >
              <PhotoTile gradient="from-amber-100 via-amber-200 to-amber-300" />
              <PhotoTile gradient="from-slate-200 via-slate-300 to-slate-400" />
              <PhotoTile gradient="from-emerald-100 via-emerald-200 to-emerald-300" />
              <PhotoTile gradient="from-sky-100 via-sky-200 to-sky-300" />
            </motion.div>
          </>
        )}
      </div>

      {!compact && (
        <motion.div
          style={{ opacity: footerOpacity }}
          className="px-2 py-1 border-t border-neutral-200 flex items-center gap-1.5 bg-neutral-50 flex-shrink-0"
        >
          <div
            className="w-3.5 h-3.5 rounded flex items-center justify-center text-[5px] font-bold text-black flex-shrink-0"
            style={{ backgroundColor: primaryColor }}
          >
            AT
          </div>
          <p className="text-[5.5px] text-neutral-500 truncate">
            Aaron Thomas Home Team · License #1234
          </p>
        </motion.div>
      )}
    </div>
  );
}

function PreviewBullet({
  text,
  opacity,
  dotColor,
}: {
  text: string;
  opacity: number;
  dotColor: string;
}) {
  return (
    <motion.div
      style={{ opacity }}
      className="flex items-center gap-1 text-[6px] text-neutral-700"
    >
      <span
        className="inline-block w-1 h-1 rounded-full flex-shrink-0"
        style={{ backgroundColor: dotColor }}
      />
      <span className="truncate">{text}</span>
    </motion.div>
  );
}

function PhotoTile({ gradient }: { gradient: string }) {
  return (
    <div
      className={`w-full aspect-[4/3] rounded-sm bg-gradient-to-br ${gradient} ring-1 ring-black/5`}
    />
  );
}

/** Real property exterior — Unsplash modern home. Loaded eagerly with
 *  fetchPriority="high" because it's the first-paint focal point of the
 *  marketing hero. The parent has a sky-to-amber gradient bg so during
 *  the brief load window the user sees a tasteful "exterior loading"
 *  warm gradient, never pure white. */
function PropertyHeroPhoto() {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={HERO_PHOTO_URL}
      alt="Modern home exterior"
      loading="eager"
      fetchPriority="high"
      className="w-full h-full object-cover"
    />
  );
}

/* ────────────────────────────────────────────────────────────────────── */

function ShareSheet({
  visible,
  flyerPrimaryColor,
}: {
  visible: boolean;
  /** The flyer's primary color at share-time. Threaded into the
   *  MiniFlyerThumbnail's price-line accent so the thumbnail reflects
   *  the customized palette the user just picked. */
  flyerPrimaryColor: string;
}) {
  return (
    <motion.div
      animate={{
        y: visible ? 0 : "100%",
        opacity: visible ? 1 : 0,
      }}
      transition={{ type: "spring", damping: 26, stiffness: 280 }}
      className="absolute bottom-0 left-0 right-0 bg-neutral-900/97 backdrop-blur-md rounded-t-2xl border-t border-neutral-800 px-3 pt-2 pb-3 max-h-[85%] overflow-hidden"
      style={{ pointerEvents: visible ? "auto" : "none" }}
    >
      <div className="w-10 h-1 bg-neutral-600 rounded-full mx-auto mb-2.5" />

      <div className="bg-neutral-800/80 rounded-lg p-2 flex items-center gap-2 mb-2.5">
        <div className="w-10 h-12 bg-white rounded shadow-md overflow-hidden flex-shrink-0 ring-1 ring-black/10">
          <MiniFlyerThumbnail primaryColor={flyerPrimaryColor} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[9px] text-white font-semibold truncate">
            1247-maple-heights-dr-flyer.pdf
          </p>
          <p className="text-[7px] text-neutral-500">PDF Document · 2.3 MB</p>
        </div>
      </div>

      <div className="flex justify-between mb-3 px-1">
        <ContactCircle initials="JM" bg="#ec4899" />
        <ContactCircle initials="AT" bg={MINT} dark />
        <ContactCircle initials="RW" bg="#3b82f6" />
        <ContactCircle initials="" bg="#ef4444" icon="heart" label="Mom" />
      </div>

      <div className="flex justify-around mb-2.5 pb-2.5 border-b border-neutral-800">
        <AppIcon label="AirDrop" bg="#1d4ed8">
          <AirDropIcon />
        </AppIcon>
        <AppIcon label="Messages" bg="#22c55e">
          <MessageSquare size={14} className="text-white" />
        </AppIcon>
        <AppIcon label="Mail" bg="#0ea5e9">
          <Mail size={14} className="text-white" />
        </AppIcon>
        <AppIcon label="Notes" bg="#facc15">
          <StickyNote size={14} className="text-neutral-900" />
        </AppIcon>
      </div>

      <div className="bg-neutral-800/70 rounded-lg overflow-hidden">
        <ActionRow label="Save to Files" icon={<FolderPlus size={12} />} />
        <ActionRow label="Markup" icon={<Pencil size={12} />} />
        <ActionRow label="Print" icon={<Printer size={12} />} last />
      </div>

      <button
        type="button"
        className="w-full mt-2 bg-neutral-800/70 rounded-lg py-1.5 text-[10px] font-semibold text-white"
      >
        Cancel
      </button>
    </motion.div>
  );
}

function ContactCircle({
  initials,
  bg,
  dark = false,
  icon,
  label,
}: {
  initials: string;
  bg: string;
  dark?: boolean;
  icon?: "heart";
  label?: string;
}) {
  return (
    <div className="flex flex-col items-center gap-0.5">
      <div
        className="w-9 h-9 rounded-full flex items-center justify-center text-[9px] font-semibold"
        style={{
          backgroundColor: bg,
          color: dark ? "#0a0a0a" : "white",
        }}
      >
        {icon === "heart" ? (
          <Heart size={14} className="text-white fill-white" />
        ) : (
          initials
        )}
      </div>
      {label ? (
        <span className="text-[6px] text-neutral-400">{label}</span>
      ) : null}
    </div>
  );
}

function AppIcon({
  label,
  bg,
  children,
}: {
  label: string;
  bg: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-0.5">
      <div
        className="w-9 h-9 rounded-xl flex items-center justify-center shadow-sm"
        style={{ backgroundColor: bg }}
      >
        {children}
      </div>
      <span className="text-[6px] text-neutral-400">{label}</span>
    </div>
  );
}

function ActionRow({
  label,
  icon,
  last = false,
}: {
  label: string;
  icon: React.ReactNode;
  last?: boolean;
}) {
  return (
    <div
      className={`flex items-center justify-between px-2.5 py-1.5 ${last ? "" : "border-b border-neutral-700/60"}`}
    >
      <span className="text-[9px] text-white">{label}</span>
      <span className="text-neutral-400">{icon}</span>
    </div>
  );
}

function AirDropIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="w-3.5 h-3.5 text-white"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
    >
      <path d="M5 15c2-3 5-5 7-5s5 2 7 5" />
      <path d="M8 17c1.5-2 3-3 4-3s2.5 1 4 3" />
      <circle cx="12" cy="19.5" r="1.4" fill="currentColor" />
    </svg>
  );
}

/** Tiny flyer-card representation inside the share sheet's file preview
 *  tile. Uses the same Unsplash hero photo for end-to-end visual
 *  consistency. The price-line accent reflects the live flyer primary
 *  color so the thumbnail matches the customized flyer being shared. */
function MiniFlyerThumbnail({ primaryColor }: { primaryColor: string }) {
  return (
    <div className="w-full h-full bg-white flex flex-col">
      <div className="h-1/2 overflow-hidden">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={HERO_PHOTO_URL}
          alt=""
          loading="eager"
          className="w-full h-full object-cover"
        />
      </div>
      <div className="flex-1 px-0.5 pt-0.5 flex flex-col">
        <div className="h-0.5 w-3/4 bg-neutral-800 rounded mb-0.5" />
        <div className="h-1 w-1/2 rounded" style={{ backgroundColor: primaryColor }} />
        <div className="h-0.5 w-2/3 bg-neutral-300 rounded mt-0.5" />
      </div>
    </div>
  );
}
