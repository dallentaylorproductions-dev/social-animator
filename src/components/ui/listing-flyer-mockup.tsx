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

/** Character-by-character typing — fraction of `text` visible based on t. */
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

  // Form-side typed values
  const addressForm = typed("1247 Maple Heights Dr", t, 0.5, 2.5);
  const priceForm = typed("$685,000", t, 2.5, 3.5);
  const bedsForm = t >= 3.5 ? "4" : "";
  const bathsForm = t >= 3.7 ? "3" : "";
  const sqftForm = t >= 3.9 ? "2,548" : "";
  const feature1Form = typed("Chef's kitchen with marble", t, 6.5, 7.3);
  const feature2Form = typed("Open Bar", t, 7.5, 7.9);
  const feature3Form = typed("Indoor Pool", t, 8.0, 8.4);

  // Preview-side reveal
  const previewBadgeOpacity = progress(t, 4.4, 4.7);
  const previewHeroOpacity = progress(t, 4.5, 5.0);
  const previewAddressOpacity = progress(t, 5.0, 5.4);
  const previewPriceOpacity = progress(t, 5.4, 5.9);
  const previewStatsOpacity = progress(t, 5.9, 6.3);
  const previewF1Opacity = progress(t, 6.7, 7.2);
  const previewF2Opacity = progress(t, 7.6, 8.0);
  const previewF3Opacity = progress(t, 8.1, 8.5);
  const previewGridOpacity = progress(t, 8.4, 8.8);
  const previewFooterOpacity = progress(t, 5.0, 5.5);

  // Button states
  const buttonPulse = t >= 8.5 && t < 9.5;
  const buttonTap = t >= 9.5 && t < 9.7;
  const buttonLoading = t >= 9.7 && t < 10.5;

  // Share sheet — persistent in DOM, transformed in/out via motion
  const shareSheetIn = t >= 10.5 && t < 12.0;

  return (
    <div className="w-full h-full bg-neutral-950 text-white flex flex-col text-[10px] font-sans relative overflow-hidden">
      {/* Top label */}
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

      {/* Live preview */}
      <div className="flex-shrink-0 px-3 pt-2 pb-2 border-b border-neutral-900 bg-neutral-950">
        <p className="text-[7px] uppercase tracking-[0.15em] text-neutral-600 mb-1.5">
          Live preview
        </p>
        <FlyerPreviewCard
          badgeOpacity={previewBadgeOpacity}
          heroOpacity={previewHeroOpacity}
          addressOpacity={previewAddressOpacity}
          priceOpacity={previewPriceOpacity}
          statsOpacity={previewStatsOpacity}
          f1Opacity={previewF1Opacity}
          f2Opacity={previewF2Opacity}
          f3Opacity={previewF3Opacity}
          gridOpacity={previewGridOpacity}
          footerOpacity={previewFooterOpacity}
        />
      </div>

      {/* Form fields */}
      <div className="flex-1 px-3 py-2 space-y-2 overflow-hidden">
        <FormField label="Address" value={addressForm} />
        <FormField label="List price" value={priceForm} accent />
        <div className="grid grid-cols-3 gap-1.5">
          <FormField label="Beds" value={bedsForm} />
          <FormField label="Baths" value={bathsForm} />
          <FormField label="Sq ft" value={sqftForm} />
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

      {/* Share sheet — persistent in DOM, transformed in/out for smoothness */}
      <ShareSheet visible={shareSheetIn} />
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
  value,
  accent = false,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div>
      <p className="uppercase tracking-[0.15em] text-neutral-500 mb-0.5 text-[7px]">
        {label}
      </p>
      <div
        className={`bg-neutral-900 border rounded px-2 py-1 text-[10px] min-h-[22px] flex items-center transition-colors ${
          value
            ? accent
              ? "border-[#4ef2d9]/40"
              : "border-neutral-800"
            : "border-neutral-800"
        }`}
      >
        <span style={accent && value ? { color: MINT } : undefined}>
          {value || <span className="opacity-30">|</span>}
        </span>
      </div>
    </div>
  );
}

function FormChip({ value }: { value: string }) {
  if (!value) {
    return (
      <div className="bg-neutral-900 border border-dashed border-neutral-800 rounded px-2 py-1 text-[9px] text-neutral-600 min-h-[20px] flex items-center">
        +
      </div>
    );
  }
  return (
    <div className="bg-neutral-900 border border-neutral-800 rounded px-2 py-1 text-[9px] text-white min-h-[20px] flex items-center gap-1.5">
      <span
        className="inline-block w-1.5 h-1.5 rounded-full flex-shrink-0"
        style={{ backgroundColor: MINT }}
      />
      <span className="truncate">{value}</span>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────── */

/** The "live preview" card — refreshed for H-3a fidelity:
 *  JUST LISTED pill, evocative hero, polished typography hierarchy,
 *  4-tile photo grid, agent footer bar. */
function FlyerPreviewCard({
  badgeOpacity,
  heroOpacity,
  addressOpacity,
  priceOpacity,
  statsOpacity,
  f1Opacity,
  f2Opacity,
  f3Opacity,
  gridOpacity,
  footerOpacity,
}: {
  badgeOpacity: number;
  heroOpacity: number;
  addressOpacity: number;
  priceOpacity: number;
  statsOpacity: number;
  f1Opacity: number;
  f2Opacity: number;
  f3Opacity: number;
  gridOpacity: number;
  footerOpacity: number;
}) {
  return (
    <div className="bg-white text-neutral-900 rounded-md overflow-hidden shadow-lg ring-1 ring-black/5 mx-auto flex flex-col">
      {/* Hero w/ JUST LISTED pill overlay */}
      <div className="relative w-full" style={{ aspectRatio: "8.5 / 4" }}>
        <motion.div
          style={{ opacity: heroOpacity }}
          className="absolute inset-0"
        >
          <PropertyHeroSvg />
        </motion.div>
        <motion.span
          style={{ opacity: badgeOpacity }}
          className="absolute top-1.5 left-1.5 text-[6px] font-bold uppercase tracking-[0.15em] text-black px-1.5 py-0.5 rounded-full shadow-sm"
        >
          <span
            className="inline-block px-1.5 py-0.5 rounded-full"
            style={{ backgroundColor: MINT }}
          >
            JUST LISTED
          </span>
        </motion.span>
      </div>

      {/* Info block */}
      <div className="px-2 pt-1.5 pb-1.5 flex flex-col gap-0.5">
        <motion.div style={{ opacity: addressOpacity }}>
          <p className="text-[7px] font-bold leading-tight text-neutral-900">
            1247 Maple Heights Dr
          </p>
          <p className="text-[5.5px] text-neutral-500 leading-tight">
            Olympia, WA 98501
          </p>
        </motion.div>
        <motion.p
          style={{ opacity: priceOpacity, color: MINT }}
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

        {/* Bullets */}
        <div className="space-y-0.5 mt-0.5">
          <PreviewBullet text="Chef's kitchen with marble" opacity={f1Opacity} />
          <PreviewBullet text="Open Bar" opacity={f2Opacity} />
          <PreviewBullet text="Indoor Pool" opacity={f3Opacity} />
        </div>

        {/* 2x2 photo grid */}
        <motion.div
          style={{ opacity: gridOpacity }}
          className="grid grid-cols-2 gap-0.5 mt-1"
        >
          <PhotoTile gradient="from-amber-100 via-amber-200 to-amber-300" />
          <PhotoTile gradient="from-slate-200 via-slate-300 to-slate-400" />
          <PhotoTile gradient="from-emerald-100 via-emerald-200 to-emerald-300" />
          <PhotoTile gradient="from-sky-100 via-sky-200 to-sky-300" />
        </motion.div>
      </div>

      {/* Agent footer bar */}
      <motion.div
        style={{ opacity: footerOpacity }}
        className="px-2 py-1 border-t border-neutral-200 flex items-center gap-1.5 bg-neutral-50"
      >
        <div
          className="w-3.5 h-3.5 rounded flex items-center justify-center text-[5px] font-bold text-black flex-shrink-0"
          style={{ backgroundColor: MINT }}
        >
          AT
        </div>
        <p className="text-[5.5px] text-neutral-500 truncate">
          Aaron Thomas Home Team · License #1234
        </p>
      </motion.div>
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
        className="inline-block w-1 h-1 rounded-full flex-shrink-0"
        style={{ backgroundColor: MINT }}
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

/* ────────────────────────────────────────────────────────────────────── */

/** More evocative property hero: dusk gradient sky, stylized house with
 *  detailed roofline + windows + door + walkway, subtle ground shadow. */
function PropertyHeroSvg() {
  return (
    <svg
      viewBox="0 0 100 50"
      preserveAspectRatio="xMidYMid slice"
      className="w-full h-full"
    >
      <defs>
        <linearGradient id="propSky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#bfdbfe" />
          <stop offset="60%" stopColor="#fde68a" />
          <stop offset="100%" stopColor="#fbbf77" />
        </linearGradient>
        <linearGradient id="propGround" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#a3b18a" />
          <stop offset="100%" stopColor="#588157" />
        </linearGradient>
        <linearGradient id="propRoof" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#312e2e" />
          <stop offset="100%" stopColor="#1f1d1d" />
        </linearGradient>
        <linearGradient id="propBody" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#f5f5f4" />
          <stop offset="100%" stopColor="#d6d3d1" />
        </linearGradient>
      </defs>
      {/* Sky */}
      <rect width="100" height="50" fill="url(#propSky)" />
      {/* Distant tree line */}
      <path d="M 0 36 Q 15 30 30 33 T 60 32 T 100 34 L 100 38 L 0 38 Z" fill="#3a5a4a" opacity="0.7" />
      {/* Lawn */}
      <rect x="0" y="38" width="100" height="12" fill="url(#propGround)" />
      {/* House body shadow */}
      <ellipse cx="50" cy="42" rx="32" ry="2" fill="#000" opacity="0.18" />
      {/* Roof — main pitch */}
      <polygon points="20,28 50,12 80,28" fill="url(#propRoof)" />
      {/* Roofline trim */}
      <polygon points="20,28 50,12 50,14 22,29" fill="#1f1d1d" />
      {/* Body */}
      <rect x="24" y="28" width="52" height="14" fill="url(#propBody)" />
      {/* Door */}
      <rect x="46" y="33" width="8" height="9" fill="#7c2d12" />
      <circle cx="52" cy="38" r="0.4" fill="#fbbf24" />
      {/* Windows w/ warm interior glow */}
      <rect x="29" y="32" width="9" height="6" fill="#fef3c7" />
      <rect x="29" y="32" width="9" height="6" fill="none" stroke="#1f1d1d" strokeWidth="0.3" />
      <line x1="33.5" y1="32" x2="33.5" y2="38" stroke="#1f1d1d" strokeWidth="0.3" />
      <rect x="62" y="32" width="9" height="6" fill="#fef3c7" />
      <rect x="62" y="32" width="9" height="6" fill="none" stroke="#1f1d1d" strokeWidth="0.3" />
      <line x1="66.5" y1="32" x2="66.5" y2="38" stroke="#1f1d1d" strokeWidth="0.3" />
      {/* Chimney */}
      <rect x="64" y="14" width="4" height="11" fill="#1f1d1d" />
      {/* Walkway */}
      <polygon points="46,42 54,42 60,50 40,50" fill="#9ca3af" opacity="0.85" />
      {/* Tiny shrub */}
      <circle cx="20" cy="40" r="2" fill="#3a5a4a" />
      <circle cx="80" cy="40" r="2.2" fill="#3a5a4a" />
    </svg>
  );
}

/* ────────────────────────────────────────────────────────────────────── */

/** iOS-style share sheet — drag handle, file preview tile (with mini flyer
 *  thumbnail), recent contacts, app icons row, action list, Cancel button.
 *  Persistent in DOM; slides in/out via motion transforms. */
function ShareSheet({ visible }: { visible: boolean }) {
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
      {/* Drag handle */}
      <div className="w-10 h-1 bg-neutral-600 rounded-full mx-auto mb-2.5" />

      {/* File preview tile with mini flyer thumbnail */}
      <div className="bg-neutral-800/80 rounded-lg p-2 flex items-center gap-2 mb-2.5">
        <div className="w-10 h-12 bg-white rounded shadow-md overflow-hidden flex-shrink-0 ring-1 ring-black/10">
          <MiniFlyerThumbnail />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[9px] text-white font-semibold truncate">
            1247-maple-heights-dr-flyer.pdf
          </p>
          <p className="text-[7px] text-neutral-500">PDF Document · 2.3 MB</p>
        </div>
      </div>

      {/* Top contacts row */}
      <div className="flex justify-between mb-3 px-1">
        <ContactCircle initials="JM" bg="#ec4899" />
        <ContactCircle initials="AT" bg={MINT} dark />
        <ContactCircle initials="RW" bg="#3b82f6" />
        <ContactCircle initials="" bg="#ef4444" icon="heart" label="Mom" />
      </div>

      {/* Apps row */}
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

      {/* Action list */}
      <div className="bg-neutral-800/70 rounded-lg overflow-hidden">
        <ActionRow label="Save to Files" icon={<FolderPlus size={12} />} />
        <ActionRow label="Markup" icon={<Pencil size={12} />} />
        <ActionRow label="Print" icon={<Printer size={12} />} last />
      </div>

      {/* Cancel */}
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
    <svg viewBox="0 0 24 24" className="w-3.5 h-3.5 text-white" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
      <path d="M5 15c2-3 5-5 7-5s5 2 7 5" />
      <path d="M8 17c1.5-2 3-3 4-3s2.5 1 4 3" />
      <circle cx="12" cy="19.5" r="1.4" fill="currentColor" />
    </svg>
  );
}

/** Tiny representation of the flyer used inside the share sheet's file
 *  preview tile. Standalone (not the live PreviewCard) so it always shows
 *  the "rendered" final state regardless of the loop position. */
function MiniFlyerThumbnail() {
  return (
    <div className="w-full h-full bg-white flex flex-col">
      <div className="h-1/2">
        <PropertyHeroSvg />
      </div>
      <div className="flex-1 px-0.5 pt-0.5 flex flex-col">
        <div className="h-0.5 w-3/4 bg-neutral-800 rounded mb-0.5" />
        <div className="h-1 w-1/2 rounded" style={{ backgroundColor: MINT }} />
        <div className="h-0.5 w-2/3 bg-neutral-300 rounded mt-0.5" />
      </div>
    </div>
  );
}
