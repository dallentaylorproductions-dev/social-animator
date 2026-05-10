"use client";

import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Sparkles,
  Lock,
  Camera,
  Film,
  Palette,
  Zap,
  Home,
  Smartphone,
  TrendingUp,
  Brain,
  Target,
} from "lucide-react";
import { EXPORT_TIPS, buildTipRotation, type TipIcon } from "./tips";

const ROTATION_MS = 5000;
const FADE_MS = 400;

interface RotatingTipProps {
  /** When true, motion is suppressed (prefers-reduced-motion). */
  reducedMotion: boolean;
  /** Hex color for the tip icon (matches brand primary). */
  iconColor: string;
  /** Hex color for the tip text. */
  textColor: string;
}

const ICON_MAP: Record<TipIcon, typeof Sparkles> = {
  sparkles: Sparkles,
  lock: Lock,
  camera: Camera,
  film: Film,
  palette: Palette,
  zap: Zap,
  home: Home,
  smartphone: Smartphone,
  "trending-up": TrendingUp,
  brain: Brain,
  target: Target,
};

/**
 * Cycles through educational tips during the export wait. Tips are
 * shuffled per mount so a user running multiple exports in a
 * session doesn't see the same tip in slot 1 every time. Crossfade
 * is suppressed when prefers-reduced-motion is set.
 */
export function RotatingTip({ reducedMotion, iconColor, textColor }: RotatingTipProps) {
  const tips = useMemo(() => buildTipRotation(EXPORT_TIPS), []);
  const [index, setIndex] = useState(0);

  useEffect(() => {
    const id = setInterval(() => {
      setIndex((i) => (i + 1) % tips.length);
    }, ROTATION_MS);
    return () => clearInterval(id);
  }, [tips.length]);

  const tip = tips[index];
  const Icon = ICON_MAP[tip.icon];

  const content = (
    <div className="flex items-start gap-3">
      <Icon size={16} color={iconColor} className="flex-shrink-0 mt-0.5" />
      <p className="text-xs leading-relaxed" style={{ color: textColor, opacity: 0.85 }}>
        {tip.text}
      </p>
    </div>
  );

  if (reducedMotion) {
    return <div className="mt-4">{content}</div>;
  }

  return (
    <div className="mt-4 min-h-[3rem]">
      <AnimatePresence mode="wait">
        <motion.div
          key={index}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: FADE_MS / 1000 }}
        >
          {content}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
