"use client";

import { motion } from "framer-motion";
import { Home } from "lucide-react";

interface HouseWalkerProps {
  /** Overall progress 0-100 — drives the x-position along the bar. */
  percent: number;
  /** Hex color matching the brand primary; tints the icon. */
  color: string;
  /** When true, motion is suppressed (prefers-reduced-motion). */
  reducedMotion: boolean;
}

/**
 * Small house icon that walks along the top of the progress bar
 * as the export advances. Bobbles vertically like a walking
 * character — tasteful, not cute. The horizontal position is
 * linked to overall progress via CSS `left: %`, with a 300ms
 * ease-out transition between progress updates so the walk feels
 * intentional rather than jittery.
 *
 * Suppressed entirely under prefers-reduced-motion — the static
 * progress bar already communicates state without the motion.
 */
export function HouseWalker({ percent, color, reducedMotion }: HouseWalkerProps) {
  if (reducedMotion) return null;
  const clamped = Math.max(0, Math.min(100, percent));
  return (
    <div className="relative h-0">
      <div
        className="absolute"
        style={{
          left: `${clamped}%`,
          transform: "translateX(-50%)",
          bottom: 4,
          transition: "left 300ms ease-out",
        }}
        aria-hidden
      >
        <motion.div
          animate={{ y: [0, -2, 0] }}
          transition={{
            duration: 0.6,
            repeat: Infinity,
            ease: "easeInOut",
          }}
          style={{ color }}
        >
          <Home size={16} />
        </motion.div>
      </div>
    </div>
  );
}
