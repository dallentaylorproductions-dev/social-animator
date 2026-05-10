"use client";

import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { BrandSettings } from "@/lib/brand";
import {
  pickContrastText,
  pickContrastMuted,
} from "@/tools/listing-flyer/engine/contrast";
import type { ExportProgress } from "./types";
import { STAGE_ORDER, personalizedStageCopy } from "./stages";
import { LiveThumbnail } from "./LiveThumbnail";
import { RotatingTip } from "./RotatingTip";
import { HouseWalker } from "./HouseWalker";
import { CompletionCelebration } from "./CompletionCelebration";

interface ExportLoaderProps {
  progress: ExportProgress;
  brand: BrandSettings;
}

/**
 * Full-screen modal loader shown during MP4 export. H-7.2.1b
 * upgrade replaces the bare progress card with an information-rich
 * wait experience: live frame preview, frame counter + rolling ETA
 * during the long render phase, rotating educational tips, and
 * subtle motion polish (logo glow pulse, particle leading edge on
 * progress bar, stage-transition celebration beats). All motion
 * suppresses to plain crossfades when prefers-reduced-motion is
 * set.
 *
 * Brand-aware throughout: card background, stage title, progress
 * fill, and thumbnail glow all derive from BrandSettings with
 * auto-contrast text colors.
 */
export function ExportLoader({ progress, brand }: ExportLoaderProps) {
  const reducedMotion = usePrefersReducedMotion();
  const [now, setNow] = useState(progress.elapsedMs);

  // Tick every 250ms so the elapsed counter and ETA update even
  // between engine progress events (which are spaced out during
  // ffmpeg encoding).
  useEffect(() => {
    const id = setInterval(() => setNow((v) => v + 250), 250);
    return () => clearInterval(id);
  }, []);

  const def = personalizedStageCopy(progress.stage, {
    address: progress.addressLabel,
  });
  const primary = brand.primaryColor || "#4ef2d9";
  const cardBg = brand.backgroundColor || "#ffffff";
  const textColor = pickContrastText(cardBg);
  const mutedColor = pickContrastMuted(cardBg);

  const elapsedMs = Math.max(progress.elapsedMs, now);
  const elapsedLabel = formatElapsed(elapsedMs);

  const overallPct = Math.max(0, Math.min(100, progress.overallPercent));

  // Time-remaining estimate: linear extrapolation from elapsed
  // wall time and overall progress. Suppressed below 5% to avoid
  // wildly wrong early-stage projections, and above 95% (we're
  // close enough that a counter would just churn).
  const etaLabel = (() => {
    if (overallPct < 5 || overallPct > 95 || elapsedMs < 1500) return null;
    const totalEstMs = elapsedMs / (overallPct / 100);
    const remainingMs = Math.max(0, totalEstMs - elapsedMs);
    const remainingSec = Math.round(remainingMs / 1000);
    if (remainingSec <= 0) return null;
    return `~${remainingSec}s remaining`;
  })();

  const aspect = progress.aspect ?? "reel";
  const showFrameCounter =
    progress.stage === "rendering" &&
    typeof progress.frameIndex === "number" &&
    typeof progress.totalFrames === "number";

  // Celebration overlay short-circuits the regular progress UI
  // once every selected format has been rendered. The handler
  // holds for ~800ms in this state, then clears progress to
  // dismiss the loader and fire the share sheet / downloads.
  if (progress.celebrate) {
    return (
      <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 backdrop-blur-sm p-4"
        role="status"
        aria-live="polite"
      >
        <div
          className="w-full max-w-md rounded-2xl shadow-2xl overflow-hidden"
          style={{ backgroundColor: cardBg }}
        >
          <CompletionCelebration
            color={primary}
            cardBg={cardBg}
            textColor={textColor}
            reducedMotion={reducedMotion}
          />
        </div>
      </div>
    );
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 backdrop-blur-sm p-4"
      role="status"
      aria-live="polite"
      aria-label={`${def.title} — ${Math.round(overallPct)}% complete`}
    >
      <div
        className="w-full max-w-md rounded-2xl p-6 shadow-2xl max-h-[90vh] overflow-y-auto"
        style={{ backgroundColor: cardBg, color: textColor }}
      >
        <BrandLogo
          brand={brand}
          primary={primary}
          reducedMotion={reducedMotion}
        />

        {progress.label && (
          <p
            className="text-[10px] uppercase tracking-[0.18em] text-center mb-2"
            style={{ color: mutedColor }}
          >
            {progress.label}
          </p>
        )}

        <StageTitle
          stage={progress.stage}
          title={def.title}
          color={primary}
          reducedMotion={reducedMotion}
        />

        <AnimatePresence mode="wait">
          <motion.p
            key={`copy-${progress.stage}`}
            initial={reducedMotion ? false : { opacity: 0 }}
            animate={{ opacity: 0.85 }}
            exit={reducedMotion ? undefined : { opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="text-sm text-center mt-2 leading-relaxed"
            style={{ color: textColor }}
          >
            {def.copy}
          </motion.p>
        </AnimatePresence>

        <LiveThumbnail
          url={progress.livePreviewUrl ?? null}
          aspect={aspect}
          glowColor={primary}
          reducedMotion={reducedMotion}
        />

        <HouseWalker
          percent={overallPct}
          color={primary}
          reducedMotion={reducedMotion}
        />

        <ProgressBar
          percent={overallPct}
          fillColor={primary}
          trackColor={mutedColor + "33"}
          reducedMotion={reducedMotion}
        />

        <div className="flex justify-center gap-2 mt-5">
          {STAGE_ORDER.map((s) => {
            const isCurrent = s === progress.stage;
            const isPast =
              STAGE_ORDER.indexOf(s) < STAGE_ORDER.indexOf(progress.stage);
            return (
              <div
                key={s}
                className="rounded-full transition-all duration-300"
                style={{
                  width: isCurrent ? 10 : 8,
                  height: isCurrent ? 10 : 8,
                  backgroundColor:
                    isCurrent || isPast ? primary : mutedColor + "55",
                }}
                aria-hidden
              />
            );
          })}
        </div>

        {(showFrameCounter || etaLabel) && (
          <div
            className="flex justify-between items-center mt-3 text-[11px] font-mono"
            style={{ color: mutedColor }}
          >
            <span>
              {showFrameCounter
                ? `Frame ${progress.frameIndex} of ${progress.totalFrames}`
                : ""}
            </span>
            <span>{etaLabel ?? ""}</span>
          </div>
        )}

        <RotatingTip
          reducedMotion={reducedMotion}
          iconColor={primary}
          textColor={textColor}
        />

        <p
          className="text-xs text-center mt-4 font-mono"
          style={{ color: mutedColor }}
        >
          {elapsedLabel} elapsed
        </p>
      </div>
    </div>
  );
}

/**
 * Brand logo with synchronized scale-pulse + soft radial glow.
 * Both motions stop when reduced-motion is set; the glow stays as
 * a static halo so the visual still reads as branded.
 */
function BrandLogo({
  brand,
  primary,
  reducedMotion,
}: {
  brand: BrandSettings;
  primary: string;
  reducedMotion: boolean;
}) {
  const containerStyle = reducedMotion
    ? {
        boxShadow: `0 0 16px 4px ${primary}22`,
      }
    : undefined;
  const animatedShadow = reducedMotion
    ? undefined
    : {
        boxShadow: [
          `0 0 0 0 ${primary}33`,
          `0 0 24px 8px ${primary}11`,
          `0 0 0 0 ${primary}33`,
        ],
      };

  const inner = brand.logoDataUrl ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={brand.logoDataUrl}
      alt=""
      className="h-14 w-14 object-contain rounded-full"
    />
  ) : (
    <div
      className="h-14 w-14 rounded-full"
      style={{ backgroundColor: primary }}
    />
  );

  return (
    <div className="flex justify-center mb-5">
      {reducedMotion ? (
        <div className="rounded-full" style={containerStyle}>
          {inner}
        </div>
      ) : (
        <motion.div
          className="rounded-full"
          animate={{
            scale: [1, 1.05, 1],
            ...animatedShadow,
          }}
          transition={{
            duration: 2,
            repeat: Infinity,
            ease: "easeInOut",
          }}
        >
          {inner}
        </motion.div>
      )}
    </div>
  );
}

/**
 * Stage title with a celebration scale-bump on stage transition.
 * Existing entry animation (fade + slight slide) is preserved;
 * this just adds a 1.0 → 1.04 → 1.0 beat synced to the entry.
 */
function StageTitle({
  stage,
  title,
  color,
  reducedMotion,
}: {
  stage: string;
  title: string;
  color: string;
  reducedMotion: boolean;
}) {
  if (reducedMotion) {
    return (
      <h2
        className="text-2xl font-bold text-center"
        style={{ color }}
      >
        {title}
      </h2>
    );
  }
  return (
    <AnimatePresence mode="wait">
      <motion.h2
        key={`title-${stage}`}
        initial={{ opacity: 0, y: 6, scale: 1 }}
        animate={{
          opacity: 1,
          y: 0,
          scale: [1, 1.04, 1],
        }}
        exit={{ opacity: 0, y: -6 }}
        transition={{
          opacity: { duration: 0.3 },
          y: { duration: 0.3 },
          scale: { duration: 0.5, times: [0, 0.5, 1] },
        }}
        className="text-2xl font-bold text-center"
        style={{ color }}
      >
        {title}
      </motion.h2>
    </AnimatePresence>
  );
}

/**
 * Progress bar with particle effect at the leading edge.
 * Particles are subtle dots fading out as they fall behind the
 * advancing fill — communicates "energy" without being
 * distracting. Suppressed under reduced-motion.
 */
function ProgressBar({
  percent,
  fillColor,
  trackColor,
  reducedMotion,
}: {
  percent: number;
  fillColor: string;
  trackColor: string;
  reducedMotion: boolean;
}) {
  return (
    <div className="mt-6 relative">
      <div
        className="h-2 rounded-full overflow-hidden relative"
        style={{ backgroundColor: trackColor }}
      >
        <motion.div
          className="h-full rounded-full relative"
          style={{ backgroundColor: fillColor }}
          animate={{ width: `${percent}%` }}
          transition={{ duration: reducedMotion ? 0 : 0.4, ease: "easeOut" }}
        >
          {!reducedMotion && percent > 1 && percent < 100 && (
            <span
              className="absolute right-0 top-1/2 -translate-y-1/2 -translate-x-1/2"
              aria-hidden
            >
              <Particles color={fillColor} />
            </span>
          )}
        </motion.div>
      </div>
    </div>
  );
}

function Particles({ color }: { color: string }) {
  // Four staggered dots fading out from the leading edge of the
  // bar fill. Each dot fades opacity 0.6 → 0 and shrinks 1 → 0.5
  // over 800ms, looping with phase offsets so they emit
  // continuously while the bar advances.
  return (
    <span className="block relative" aria-hidden>
      {[0, 0.2, 0.4, 0.6].map((delay, i) => (
        <motion.span
          key={i}
          className="absolute rounded-full"
          style={{
            width: 4,
            height: 4,
            backgroundColor: color,
            top: -2,
            left: -2,
          }}
          animate={{
            opacity: [0.6, 0],
            scale: [1, 0.5],
            x: [-2, -8],
          }}
          transition={{
            duration: 0.8,
            delay,
            repeat: Infinity,
            ease: "easeOut",
          }}
        />
      ))}
    </span>
  );
}

function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  const mqRef = useRef<MediaQueryList | null>(null);
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    mqRef.current = mq;
    setReduced(mq.matches);
    const listener = (e: MediaQueryListEvent) => setReduced(e.matches);
    mq.addEventListener("change", listener);
    return () => mq.removeEventListener("change", listener);
  }, []);
  return reduced;
}

function formatElapsed(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}
