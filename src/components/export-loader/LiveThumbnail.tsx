"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

interface LiveThumbnailProps {
  /** Object URL of the most recent frame preview, or null/undefined
   *  if no preview is available yet (preparing stage, or iOS path). */
  url: string | null | undefined;
  /** Aspect ratio of the source video — drives card sizing. */
  aspect: "reel" | "square";
  /** Hex color for the soft glow border (matches brand primary). */
  glowColor: string;
  /** When true, motion is suppressed (prefers-reduced-motion). */
  reducedMotion: boolean;
}

/**
 * Live preview of the video being assembled. The frame-render
 * engine emits a JPEG object URL every 10 frames; this component
 * displays the most recent one with a smooth crossfade between
 * updates. Reads as a real-time miniature of the export coming
 * together, which makes the multi-minute wait feel productive
 * rather than dead.
 *
 * Falls back to a stenciled placeholder when no thumbnail is
 * available yet (preparing stage, or iOS path which doesn't
 * emit thumbnails).
 */
export function LiveThumbnail({
  url,
  aspect,
  glowColor,
  reducedMotion,
}: LiveThumbnailProps) {
  // Reel cards are 9:16 portrait; square cards are 1:1. Fixed
  // pixel dims keep the loader card layout stable as the inner
  // image swaps in.
  const dims =
    aspect === "reel"
      ? { width: 90, height: 160 }
      : { width: 140, height: 140 };

  return (
    <div className="flex justify-center mb-5">
      <div
        className="rounded-lg overflow-hidden relative"
        style={{
          width: dims.width,
          height: dims.height,
          boxShadow: `0 0 0 1px ${glowColor}55, 0 0 24px 4px ${glowColor}22`,
          backgroundColor: "#0a0a0a",
        }}
      >
        {url ? (
          reducedMotion ? (
            <Image url={url} />
          ) : (
            <AnimatePresence mode="popLayout">
              <motion.div
                key={url}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="absolute inset-0"
              >
                <Image url={url} />
              </motion.div>
            </AnimatePresence>
          )
        ) : (
          <Placeholder glowColor={glowColor} reducedMotion={reducedMotion} />
        )}
      </div>
    </div>
  );
}

function Image({ url }: { url: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={url}
      alt=""
      aria-hidden
      className="w-full h-full object-cover"
    />
  );
}

function Placeholder({
  glowColor,
  reducedMotion,
}: {
  glowColor: string;
  reducedMotion: boolean;
}) {
  if (reducedMotion) {
    return (
      <div
        className="w-full h-full flex items-center justify-center"
        style={{ color: glowColor + "AA" }}
      >
        <span className="text-[10px] uppercase tracking-[0.2em]">Preview</span>
      </div>
    );
  }
  return (
    <motion.div
      className="w-full h-full flex items-center justify-center"
      animate={{ opacity: [0.3, 0.7, 0.3] }}
      transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
      style={{ color: glowColor + "AA" }}
    >
      <span className="text-[10px] uppercase tracking-[0.2em]">Preview</span>
    </motion.div>
  );
}
