"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { BrandSettings } from "@/lib/brand";
import { pickContrastText, pickContrastMuted } from "@/tools/listing-flyer/engine/contrast";
import type { ExportProgress } from "./types";
import { STAGE_DEFS, STAGE_ORDER } from "./stages";

interface ExportLoaderProps {
  progress: ExportProgress;
  brand: BrandSettings;
}

/**
 * Full-screen modal loader shown during MP4 export. Replaces the
 * generic spinner with a 4-stage educational walkthrough that
 * reinforces the privacy + quality + platform-optimization story
 * during the wait. Brand-aware: card background, accent text, and
 * progress bar fill all draw from the active BrandSettings, with
 * auto-contrast text colors so any agent-picked palette stays
 * readable.
 *
 * Wired through the existing render-mp4 progress callbacks; the
 * tool's ExportButtons handler maps engine phases to ExportStage
 * before passing to this component.
 */
export function ExportLoader({ progress, brand }: ExportLoaderProps) {
  const [now, setNow] = useState(progress.elapsedMs);

  // Tick every 250ms so the elapsed counter updates even between
  // engine progress events (which can be spaced out during ffmpeg
  // encoding). Use the bigger of the two — engine elapsed wins
  // when it advances, the local tick fills gaps.
  useEffect(() => {
    const id = setInterval(() => setNow((v) => v + 250), 250);
    return () => clearInterval(id);
  }, []);

  const def = STAGE_DEFS[progress.stage];
  const primary = brand.primaryColor || "#4ef2d9";
  const cardBg = brand.backgroundColor || "#ffffff";
  const textColor = pickContrastText(cardBg);
  const mutedColor = pickContrastMuted(cardBg);

  const elapsedMs = Math.max(progress.elapsedMs, now);
  const elapsedSec = Math.floor(elapsedMs / 1000);
  const m = Math.floor(elapsedSec / 60);
  const s = elapsedSec % 60;
  const elapsedLabel = `${m}:${String(s).padStart(2, "0")} elapsed`;

  const overallPct = Math.max(0, Math.min(100, progress.overallPercent));

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 backdrop-blur-sm"
      role="status"
      aria-live="polite"
      aria-label={`${def.title} — ${Math.round(overallPct)}% complete`}
    >
      <div
        className="w-full max-w-md mx-4 rounded-2xl p-6 shadow-2xl"
        style={{ backgroundColor: cardBg, color: textColor }}
      >
        {/* Brand logo with subtle scale-pulse */}
        <div className="flex justify-center mb-5">
          {brand.logoDataUrl ? (
            <motion.img
              src={brand.logoDataUrl}
              alt=""
              className="h-14 w-14 object-contain"
              animate={{ scale: [1, 1.05, 1] }}
              transition={{
                duration: 2,
                repeat: Infinity,
                ease: "easeInOut",
              }}
            />
          ) : (
            <motion.div
              className="h-14 w-14 rounded-full"
              style={{ backgroundColor: primary }}
              animate={{ scale: [1, 1.05, 1] }}
              transition={{
                duration: 2,
                repeat: Infinity,
                ease: "easeInOut",
              }}
            />
          )}
        </div>

        {/* Optional batch label (e.g. "Reel (1 of 2)") */}
        {progress.label && (
          <p
            className="text-[10px] uppercase tracking-[0.18em] text-center mb-2"
            style={{ color: mutedColor }}
          >
            {progress.label}
          </p>
        )}

        {/* Stage title — animated swap on stage change */}
        <AnimatePresence mode="wait">
          <motion.h2
            key={`title-${progress.stage}`}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.3 }}
            className="text-2xl font-bold text-center"
            style={{ color: primary }}
          >
            {def.title}
          </motion.h2>
        </AnimatePresence>

        <AnimatePresence mode="wait">
          <motion.p
            key={`copy-${progress.stage}`}
            initial={{ opacity: 0 }}
            animate={{ opacity: 0.85 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="text-sm text-center mt-2 leading-relaxed"
            style={{ color: textColor }}
          >
            {def.copy}
          </motion.p>
        </AnimatePresence>

        {/* Progress bar */}
        <div className="mt-6">
          <div
            className="h-2 rounded-full overflow-hidden"
            style={{ backgroundColor: mutedColor + "33" }}
          >
            <motion.div
              className="h-full rounded-full"
              style={{ backgroundColor: primary }}
              animate={{ width: `${overallPct}%` }}
              transition={{ duration: 0.4, ease: "easeOut" }}
            />
          </div>
        </div>

        {/* Stage indicator dots */}
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

        {/* Elapsed time */}
        <p
          className="text-xs text-center mt-4 font-mono"
          style={{ color: mutedColor }}
        >
          {elapsedLabel}
        </p>
      </div>
    </div>
  );
}
