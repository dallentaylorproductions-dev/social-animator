"use client";

import { motion, AnimatePresence } from "framer-motion";
import { useEffect, useState } from "react";

/**
 * Self-contained 12-second loop demoing the Listing Flyer Generator on a
 * mobile-shaped surface. No video, no real photos — every visual is React,
 * Tailwind, or inline SVG. Designed to render inside the inner area of
 * IphoneScrollShowcase (~300×690px after bezel).
 *
 * Animation engine: a single requestAnimationFrame timer publishes the
 * current loop time `t` (0–12s, modulo). All UI is derived from `t` via
 * pure helpers — no setTimeout chains, no state machine, no animation
 * library timeline. Restarting the loop just means t wraps back to 0.
 *
 * Timeline:
 *   0.0–0.5  empty form
 *   0.5–2.5  type address into form (mirrored to preview at ~4.5s)
 *   2.5–3.5  type price
 *   3.5–4.5  beds / baths / sqft (staggered)
 *   4.5–6.5  preview populates progressively
 *   6.5–8.5  three feature bullets type sequentially (mirrored to preview)
 *   8.5–9.5  Export PDF button pulses (highlight/scale)
 *   9.5–10.5 Button "tap" (scale-down/up) + brief loading state
 *  10.5–11.5 iOS share sheet slides up from bottom
 *  11.5–12.0 hold the share sheet
 *  12.0      reset, loop
 */

const LOOP_S = 12;
const MINT = "#4ef2d9";

/** Linear progress through [start, end]; clamped to [0, 1]. */
function progress(t: number, start: number, end: number): number {
  if (t <= start) return 0;
  if (t >= end) return 1;
  return (t - start) / (end - start);
}

/** Character-by-character typing — fraction of `text` visible based on t.
 *  Returns a string with the visible prefix. */
function typed(text: string, t: number, start: number, end: number): string {
  const p = progress(t, start, end);
  const chars = Math.round(p * text.length);
  return text.slice(0, chars);
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

  // Form-side typed values (drive the input boxes)
  const addressForm = typed("1247 Maple Heights Dr", t, 0.5, 2.5);
  const priceForm = typed("$685,000", t, 2.5, 3.5);
  const bedsForm = t >= 3.5 ? "4" : "";
  const bathsForm = t >= 3.7 ? "3" : "";
  const sqftForm = t >= 3.9 ? "2,548" : "";
  const feature1Form = typed("Chef's kitchen", t, 6.5, 7.1);
  const feature2Form = typed("Open Bar", t, 7.5, 7.9);
  const feature3Form = typed("Indoor Pool", t, 8.0, 8.4);

  // Preview-side reveal (lags the form so it reads as "the preview is mirroring
  // the input"). Cross-fade in via opacity progress.
  const previewHeroOpacity = progress(t, 4.5, 5.0);
  const previewAddressOpacity = progress(t, 5.0, 5.4);
  const previewPriceOpacity = progress(t, 5.4, 5.9);
  const previewStatsOpacity = progress(t, 5.9, 6.3);
  const previewF1Opacity = progress(t, 6.7, 7.2);
  const previewF2Opacity = progress(t, 7.6, 8.0);
  const previewF3Opacity = progress(t, 8.1, 8.5);

  // Export button states
  const buttonPulse = t >= 8.5 && t < 9.5;
  const buttonTap = t >= 9.5 && t < 9.7;
  const buttonLoading = t >= 9.7 && t < 10.5;

  // Share sheet slides up; held until loop reset
  const shareSheetIn = t >= 10.5 && t < 12.0;

  return (
    <div className="w-full h-full bg-neutral-950 text-white flex flex-col text-[10px] font-sans relative overflow-hidden">
      {/* Top label */}
      <div className="px-4 pt-7 pb-2 border-b border-neutral-900 flex-shrink-0">
        <p
          className="text-[8px] uppercase tracking-[0.2em]"
          style={{ color: MINT }}
        >
          Listing Flyer Generator
        </p>
        <p className="text-[10px] text-neutral-500 mt-0.5">
          1247-maple-heights-dr.pdf
        </p>
      </div>

      {/* Two halves: live preview top, form bottom — matches the actual
       *  mobile sticky-preview-on-top pattern of the live tool */}
      <div className="flex-shrink-0 px-3 pt-2 pb-2 border-b border-neutral-900 bg-neutral-950">
        <p className="text-[7px] uppercase tracking-[0.15em] text-neutral-600 mb-1">
          Live preview
        </p>
        <PreviewCard
          addressOpacity={previewAddressOpacity}
          priceOpacity={previewPriceOpacity}
          statsOpacity={previewStatsOpacity}
          heroOpacity={previewHeroOpacity}
          f1Opacity={previewF1Opacity}
          f2Opacity={previewF2Opacity}
          f3Opacity={previewF3Opacity}
        />
      </div>

      {/* Form fields */}
      <div className="flex-1 px-3 py-3 space-y-2.5 overflow-hidden">
        <FormField label="Address" value={addressForm} />
        <FormField label="List price" value={priceForm} />
        <div className="grid grid-cols-3 gap-1.5">
          <FormField label="Beds" value={bedsForm} compact />
          <FormField label="Baths" value={bathsForm} compact />
          <FormField label="Sq ft" value={sqftForm} compact />
        </div>
        <div className="space-y-1">
          <p className="text-[7px] uppercase tracking-[0.15em] text-neutral-500">
            Feature bullets
          </p>
          <FormChip value={feature1Form} />
          <FormChip value={feature2Form} />
          <FormChip value={feature3Form} />
        </div>
      </div>

      {/* Sticky export button */}
      <div className="px-3 pb-3 pt-2 bg-neutral-950 border-t border-neutral-900 flex-shrink-0">
        <motion.button
          type="button"
          animate={{
            scale: buttonTap ? 0.95 : buttonPulse ? 1.03 : 1,
          }}
          transition={{ duration: 0.2 }}
          className="w-full rounded-md py-2.5 text-[11px] font-bold text-black"
          style={{
            backgroundColor: MINT,
            boxShadow: buttonPulse ? `0 0 0 4px ${MINT}33` : "none",
          }}
        >
          {buttonLoading ? "Generating PDF…" : "Export PDF"}
        </motion.button>
      </div>

      {/* Share sheet overlay (inside the iPhone bezel) */}
      <AnimatePresence>
        {shareSheetIn && (
          <motion.div
            key="share-sheet"
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 24, stiffness: 280 }}
            className="absolute bottom-0 left-0 right-0 bg-neutral-900/95 backdrop-blur-sm rounded-t-2xl border-t border-neutral-800 p-3"
          >
            {/* Drag handle */}
            <div className="w-10 h-1 bg-neutral-700 rounded-full mx-auto mb-2.5" />
            {/* PDF preview tile */}
            <div className="bg-neutral-800 rounded-md p-2 flex items-center gap-2 mb-3">
              <div className="w-9 h-11 bg-white rounded-sm flex items-center justify-center text-[7px] font-bold text-red-600">
                PDF
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[9px] text-white font-semibold truncate">
                  1247-maple-heights-dr-flyer.pdf
                </p>
                <p className="text-[8px] text-neutral-500">PDF · 1.2 MB</p>
              </div>
            </div>
            {/* App icon row */}
            <div className="flex gap-2 justify-around">
              <ShareIcon label="AirDrop" color="#3b82f6" letter="A" />
              <ShareIcon label="Files" color="#0891b2" letter="F" />
              <ShareIcon label="Mail" color="#22c55e" letter="M" />
              <ShareIcon label="iMessage" color="#10b981" letter="i" />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function FormField({
  label,
  value,
  compact = false,
}: {
  label: string;
  value: string;
  compact?: boolean;
}) {
  return (
    <div>
      <p
        className={`uppercase tracking-[0.15em] text-neutral-500 mb-0.5 ${compact ? "text-[7px]" : "text-[7px]"}`}
      >
        {label}
      </p>
      <div className="bg-neutral-900 border border-neutral-800 rounded px-2 py-1 text-[10px] text-white min-h-[22px] flex items-center">
        {value || <span className="opacity-30">|</span>}
      </div>
    </div>
  );
}

function FormChip({ value }: { value: string }) {
  if (!value) {
    return (
      <div className="bg-neutral-900 border border-dashed border-neutral-800 rounded px-2 py-1 text-[9px] text-neutral-600 min-h-[20px]">
        +
      </div>
    );
  }
  return (
    <div className="bg-neutral-900 border border-neutral-800 rounded px-2 py-1 text-[9px] text-white min-h-[20px] flex items-center gap-1.5">
      <span
        className="inline-block w-1.5 h-1.5 rounded-full"
        style={{ backgroundColor: MINT }}
      />
      {value}
    </div>
  );
}

function ShareIcon({
  color,
  letter,
  label,
}: {
  color: string;
  letter: string;
  label: string;
}) {
  return (
    <div className="flex flex-col items-center gap-1">
      <div
        className="w-9 h-9 rounded-lg flex items-center justify-center text-white text-[10px] font-bold"
        style={{ backgroundColor: color }}
      >
        {letter}
      </div>
      <span className="text-[7px] text-neutral-500">{label}</span>
    </div>
  );
}

/** The "live preview" card. Compressed flyer layout that fades in
 *  progressively as the form fields populate. */
function PreviewCard({
  addressOpacity,
  priceOpacity,
  statsOpacity,
  heroOpacity,
  f1Opacity,
  f2Opacity,
  f3Opacity,
}: {
  addressOpacity: number;
  priceOpacity: number;
  statsOpacity: number;
  heroOpacity: number;
  f1Opacity: number;
  f2Opacity: number;
  f3Opacity: number;
}) {
  return (
    <div className="bg-white text-neutral-900 rounded-md overflow-hidden shadow-md mx-auto" style={{ width: "100%", aspectRatio: "8.5 / 5.5" }}>
      <div className="flex h-full">
        {/* Left: hero */}
        <div className="w-[42%] relative bg-neutral-200">
          <motion.div
            style={{ opacity: heroOpacity }}
            className="absolute inset-0"
          >
            <HouseSilhouette />
          </motion.div>
        </div>
        {/* Right: text content */}
        <div className="flex-1 p-1.5 flex flex-col gap-1">
          <motion.p
            style={{ opacity: addressOpacity }}
            className="text-[7px] font-bold leading-tight text-neutral-900"
          >
            1247 Maple Heights Dr
          </motion.p>
          <motion.p
            style={{ opacity: priceOpacity, color: MINT }}
            className="text-[10px] font-extrabold leading-none"
          >
            $685,000
          </motion.p>
          <motion.p
            style={{ opacity: statsOpacity }}
            className="text-[6px] font-semibold uppercase tracking-wider text-neutral-700"
          >
            4 BD · 3 BA · 2,548 SF
          </motion.p>
          <div className="space-y-0.5 mt-0.5">
            <PreviewBullet text="Chef's kitchen" opacity={f1Opacity} />
            <PreviewBullet text="Open Bar" opacity={f2Opacity} />
            <PreviewBullet text="Indoor Pool" opacity={f3Opacity} />
          </div>
        </div>
      </div>
    </div>
  );
}

function PreviewBullet({ text, opacity }: { text: string; opacity: number }) {
  return (
    <motion.div
      style={{ opacity }}
      className="flex items-center gap-1 text-[6px] text-neutral-700"
    >
      <span
        className="inline-block w-1 h-1 rounded-full"
        style={{ backgroundColor: MINT }}
      />
      {text}
    </motion.div>
  );
}

/** Stylized house silhouette — pure SVG, no external asset. */
function HouseSilhouette() {
  return (
    <svg
      viewBox="0 0 100 100"
      className="w-full h-full"
      preserveAspectRatio="xMidYMid slice"
    >
      <defs>
        <linearGradient id="houseSky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#a3b8c2" />
          <stop offset="100%" stopColor="#dbeafe" />
        </linearGradient>
        <linearGradient id="houseBody" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#737373" />
          <stop offset="100%" stopColor="#404040" />
        </linearGradient>
      </defs>
      <rect width="100" height="100" fill="url(#houseSky)" />
      {/* Ground */}
      <rect x="0" y="78" width="100" height="22" fill="#52525b" />
      {/* Roof */}
      <polygon points="20,50 50,28 80,50" fill="#262626" />
      {/* Body */}
      <rect x="25" y="50" width="50" height="30" fill="url(#houseBody)" />
      {/* Door */}
      <rect x="46" y="62" width="8" height="18" fill="#171717" />
      {/* Windows */}
      <rect x="32" y="58" width="8" height="8" fill="#fde68a" opacity="0.85" />
      <rect x="60" y="58" width="8" height="8" fill="#fde68a" opacity="0.85" />
      {/* Chimney */}
      <rect x="62" y="34" width="5" height="12" fill="#262626" />
    </svg>
  );
}
