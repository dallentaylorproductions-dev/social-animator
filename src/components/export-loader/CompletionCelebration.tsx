"use client";

import { motion } from "framer-motion";
import { Check } from "lucide-react";

interface CompletionCelebrationProps {
  /** Hex color matching the brand primary; tints the check + sparkles. */
  color: string;
  /** Hex color for the surrounding card background (drives the
   *  text auto-contrast inside the celebration card). */
  cardBg: string;
  /** Foreground text color (already auto-contrast computed). */
  textColor: string;
  /** Override the headline. Defaults to "Your video is ready!". */
  headline?: string;
  /** When true, motion is suppressed (prefers-reduced-motion). */
  reducedMotion: boolean;
}

/**
 * Brief celebration moment shown after the export pipeline
 * finishes, before the loader dismisses. Communicates "you're
 * done" with a satisfying scale-in checkmark + sparkle burst.
 * Held for ~800ms by the parent before the share sheet / download
 * fires.
 *
 * Under prefers-reduced-motion: shows the check + headline as a
 * static panel with no spring/sparkles.
 */
export function CompletionCelebration({
  color,
  cardBg,
  textColor,
  headline = "Your video is ready!",
  reducedMotion,
}: CompletionCelebrationProps) {
  return (
    <div
      className="relative flex flex-col items-center justify-center py-6"
      style={{ backgroundColor: cardBg }}
      role="status"
      aria-live="polite"
    >
      <div className="relative">
        {reducedMotion ? (
          <div
            className="h-16 w-16 rounded-full flex items-center justify-center"
            style={{ backgroundColor: color, color: cardBg }}
          >
            <Check size={32} strokeWidth={3} />
          </div>
        ) : (
          <>
            <motion.div
              className="h-16 w-16 rounded-full flex items-center justify-center"
              style={{ backgroundColor: color, color: cardBg }}
              initial={{ scale: 0, rotate: -180 }}
              animate={{ scale: 1, rotate: 0 }}
              transition={{ type: "spring", stiffness: 240, damping: 16 }}
            >
              <Check size={32} strokeWidth={3} />
            </motion.div>
            <Sparkles color={color} />
          </>
        )}
      </div>
      <motion.h2
        className="text-xl font-bold mt-4"
        style={{ color }}
        initial={reducedMotion ? false : { opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: reducedMotion ? 0 : 0.2, duration: 0.3 }}
      >
        {headline}
      </motion.h2>
      <motion.p
        className="text-sm mt-1"
        style={{ color: textColor, opacity: 0.7 }}
        initial={reducedMotion ? false : { opacity: 0 }}
        animate={{ opacity: 0.7 }}
        transition={{ delay: reducedMotion ? 0 : 0.3, duration: 0.3 }}
      >
        Handing off to your share sheet…
      </motion.p>
    </div>
  );
}

/**
 * Twelve mint dots scattering outward from behind the check
 * badge — keeps the moment feeling celebratory without overdoing
 * it. Each sparkle fades + scales out over ~700ms on its own
 * angle, then the whole burst is done.
 */
function Sparkles({ color }: { color: string }) {
  const count = 12;
  return (
    <>
      {Array.from({ length: count }).map((_, i) => {
        const angle = (i / count) * Math.PI * 2;
        const distance = 40;
        const dx = Math.cos(angle) * distance;
        const dy = Math.sin(angle) * distance;
        return (
          <motion.span
            key={i}
            className="absolute top-1/2 left-1/2 rounded-full"
            style={{
              width: 5,
              height: 5,
              backgroundColor: color,
              marginLeft: -2.5,
              marginTop: -2.5,
            }}
            initial={{ opacity: 1, scale: 1, x: 0, y: 0 }}
            animate={{
              opacity: 0,
              scale: 0.4,
              x: dx,
              y: dy,
            }}
            transition={{
              duration: 0.7,
              delay: 0.1,
              ease: "easeOut",
            }}
            aria-hidden
          />
        );
      })}
    </>
  );
}
