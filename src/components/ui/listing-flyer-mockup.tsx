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
 * mobile-shaped surface. Designed to render inside the inner area of
 * IphoneScrollShowcase (~300×690px after bezel).
 *
 * Animation engine: a single requestAnimationFrame timer publishes the
 * current loop time `t` (0–12s, modulo). All UI is derived from `t` via
 * pure helpers — `opacityCycle` for hold→fade-out→hidden→fade-in,
 * `typedCycle` for typed text on top of the same lifecycle.
 *
 * H-3.5a inverted the loop: populated state is now the DEFAULT visible
 * state at t=0 (so first-paint impressions are "real product," not
 * "blank form"). The reset+typing sequence comes after a 3-second hold.
 *
 * Timeline:
 *   0.0–3.0   HOLD POPULATED STATE — every field filled, preview rendered,
 *             slow Ken Burns zoom on the property hero photo (1.0 → 1.02)
 *   3.0–3.3   reset wipe — fields and preview content fade out
 *   3.3–5.5   address re-types
 *   5.5–6.0   price re-types
 *   6.0–6.4   beds / baths / sqft populate (staggered)
 *   6.4–7.0   preview content reveals progressively (badge, hero, address,
 *             price, stats, footer)
 *   7.0–8.5   three feature bullets type in sequence (form + preview mirror)
 *   8.5–9.5   Export PDF button pulses
 *   9.5–10.5  button tap + loading state
 *  10.5–11.7  share sheet slides up
 *  11.7–12.0  hold share sheet
 *  12.0 = 0.0 wrap to populated state (share sheet snaps offscreen via the
 *             `visible` flag returning false)
 */

const LOOP_S = 12;
const MINT = "#4ef2d9";

// Unsplash photo URL used as the property hero for the iPhone mockup.
// Unsplash license doesn't require attribution but encourages it; keeping
// these comments so credit can be added later if policy changes.
//
//   Modern home exterior — https://unsplash.com/photos/Pc4iz8h5JJo
const HERO_PHOTO_URL =
  "https://images.unsplash.com/photo-1568605114967-8130f3a36994?w=800&q=85";

const HOLD_END = 3.0;
const RESET_END = 3.3;

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

  const address = typedCycle("1247 Maple Heights Dr", t, HOLD_END, RESET_END, 3.3, 5.5);
  const price = typedCycle("$685,000", t, HOLD_END, RESET_END, 5.5, 6.0);
  const beds = staggerCycle(t, 6.0)("4");
  const baths = staggerCycle(t, 6.2)("3");
  const sqft = staggerCycle(t, 6.4)("2,548");
  const feature1 = typedCycle("Chef's kitchen with marble", t, HOLD_END, RESET_END, 7.0, 7.6);
  const feature2 = typedCycle("Open Bar", t, HOLD_END, RESET_END, 7.6, 8.0);
  const feature3 = typedCycle("Indoor Pool", t, HOLD_END, RESET_END, 8.0, 8.5);

  const previewBadgeOp = opacityCycle(t, HOLD_END, RESET_END, 6.4, 6.55);
  const previewHeroOp = opacityCycle(t, HOLD_END, RESET_END, 6.45, 6.85);
  const previewAddressOp = opacityCycle(t, HOLD_END, RESET_END, 6.6, 6.9);
  const previewPriceOp = opacityCycle(t, HOLD_END, RESET_END, 6.7, 7.0);
  const previewStatsOp = opacityCycle(t, HOLD_END, RESET_END, 6.8, 7.1);
  const previewFooterOp = opacityCycle(t, HOLD_END, RESET_END, 6.85, 7.15);
  const previewF1Op = opacityCycle(t, HOLD_END, RESET_END, 7.2, 7.5);
  const previewF2Op = opacityCycle(t, HOLD_END, RESET_END, 7.7, 8.0);
  const previewF3Op = opacityCycle(t, HOLD_END, RESET_END, 8.1, 8.4);
  const previewGridOp = opacityCycle(t, HOLD_END, RESET_END, 8.4, 8.8);

  // Subtle Ken Burns on the hero — only during the populated hold phase so
  // the frame doesn't feel completely static. 1.0 → 1.02 over the first 3s.
  const heroZoom = t < HOLD_END ? 1.0 + (t / HOLD_END) * 0.02 : 1.0;

  const buttonPulse = t >= 8.5 && t < 9.5;
  const buttonTap = t >= 9.5 && t < 9.7;
  const buttonLoading = t >= 9.7 && t < 10.5;

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

      <div className="flex-shrink-0 px-3 pt-2 pb-2 border-b border-neutral-900 bg-neutral-950">
        <p className="text-[7px] uppercase tracking-[0.15em] text-neutral-600 mb-1.5">
          Live preview
        </p>
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
        />
      </div>

      <div className="flex-1 px-3 py-2 space-y-2 overflow-hidden">
        <FormField label="Address" cycle={address} />
        <FormField label="List price" cycle={price} accent />
        <div className="grid grid-cols-3 gap-1.5">
          <FormField label="Beds" cycle={beds} />
          <FormField label="Baths" cycle={baths} />
          <FormField label="Sq ft" cycle={sqft} />
        </div>
        <div className="space-y-1">
          <p className="text-[7px] uppercase tracking-[0.15em] text-neutral-500">
            Feature bullets
          </p>
          <FormChip cycle={feature1} />
          <FormChip cycle={feature2} />
          <FormChip cycle={feature3} />
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
  cycle,
  accent = false,
}: {
  label: string;
  cycle: { text: string; opacity: number };
  accent?: boolean;
}) {
  const { text, opacity } = cycle;
  return (
    <div>
      <p className="uppercase tracking-[0.15em] text-neutral-500 mb-0.5 text-[7px]">
        {label}
      </p>
      <div
        className={`bg-neutral-900 border rounded px-2 py-1 text-[10px] min-h-[22px] flex items-center transition-colors ${
          text
            ? accent
              ? "border-[#4ef2d9]/40"
              : "border-neutral-800"
            : "border-neutral-800"
        }`}
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

function FormChip({
  cycle,
}: {
  cycle: { text: string; opacity: number };
}) {
  const { text, opacity } = cycle;
  if (!text) {
    return (
      <div className="bg-neutral-900 border border-dashed border-neutral-800 rounded px-2 py-1 text-[9px] text-neutral-600 min-h-[20px] flex items-center">
        +
      </div>
    );
  }
  return (
    <div
      className="bg-neutral-900 border border-neutral-800 rounded px-2 py-1 text-[9px] text-white min-h-[20px] flex items-center gap-1.5"
      style={{ opacity }}
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
}) {
  return (
    <div className="bg-white text-neutral-900 rounded-md overflow-hidden shadow-lg ring-1 ring-black/5 mx-auto flex flex-col">
      <div
        className="relative w-full overflow-hidden"
        style={{ aspectRatio: "8.5 / 4" }}
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
            style={{ backgroundColor: MINT }}
          >
            JUST LISTED
          </span>
        </motion.span>
      </div>

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

        <div className="space-y-0.5 mt-0.5">
          <PreviewBullet text="Chef's kitchen with marble" opacity={f1Opacity} />
          <PreviewBullet text="Open Bar" opacity={f2Opacity} />
          <PreviewBullet text="Indoor Pool" opacity={f3Opacity} />
        </div>

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

/** Real property exterior — Unsplash modern home. Loaded eagerly because
 *  it's the first-paint focal point of the marketing hero. */
function PropertyHeroPhoto() {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={HERO_PHOTO_URL}
      alt="Modern home exterior"
      loading="eager"
      className="w-full h-full object-cover"
    />
  );
}

/* ────────────────────────────────────────────────────────────────────── */

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
      <div className="w-10 h-1 bg-neutral-600 rounded-full mx-auto mb-2.5" />

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
 *  consistency. */
function MiniFlyerThumbnail() {
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
        <div className="h-1 w-1/2 rounded" style={{ backgroundColor: MINT }} />
        <div className="h-0.5 w-2/3 bg-neutral-300 rounded mt-0.5" />
      </div>
    </div>
  );
}
