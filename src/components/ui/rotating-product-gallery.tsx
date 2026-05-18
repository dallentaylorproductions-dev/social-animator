"use client";

import { motion, AnimatePresence } from "framer-motion";
import { ChevronLeft, ChevronRight } from "lucide-react";
import {
  useCallback,
  useEffect,
  useState,
  type ReactNode,
} from "react";

const MINT = "#4ef2d9";

export interface GalleryItem {
  /** Self-contained React node rendered in the mockup slot. Each item brings
   *  its own aspect ratio; wrapper letterboxes via flex-center. */
  mockup: ReactNode;
  toolName: string;
  feature: string;
  tagline: string;
}

interface Props {
  galleryItems: GalleryItem[];
  autoplay?: boolean;
  intervalMs?: number;
}

/**
 * 3D-stacked product carousel — adapts the Aceternity circular-testimonials
 * pattern for product showcase. Active card front-and-center at scale 1, the
 * prev/next slot peek behind at scale 0.85 and ±15° rotateY. Auto-cycles
 * every 5s with hover pause; keyboard left/right also navigate.
 *
 * Mockups slot in as React nodes, not image URLs — lets the marketing page
 * use programmatic illustrations (SVG + Tailwind) instead of static asset
 * files. The wrapper just sizes the slot and lets each mockup's intrinsic
 * aspect ratio handle letterboxing.
 */
export default function RotatingProductGallery({
  galleryItems,
  autoplay = true,
  intervalMs = 5000,
}: Props) {
  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(false);

  const n = galleryItems.length;

  const goNext = useCallback(() => {
    setActive((i) => (i + 1) % n);
  }, [n]);

  const goPrev = useCallback(() => {
    setActive((i) => (i - 1 + n) % n);
  }, [n]);

  useEffect(() => {
    if (!autoplay || paused || n <= 1) return;
    const id = setInterval(goNext, intervalMs);
    return () => clearInterval(id);
  }, [autoplay, paused, intervalMs, goNext, n]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") goPrev();
      else if (e.key === "ArrowRight") goNext();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [goNext, goPrev]);

  if (n === 0) return null;
  const item = galleryItems[active];

  return (
    <div
      className="grid lg:grid-cols-2 gap-10 lg:gap-16 items-center"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      {/* Mockup carousel — wrapped in motion.div drag="x" so touch swipes
          on mobile (and click+drag on desktop) advance/rewind the gallery
          alongside the chevron buttons. dragConstraints+elastic keep the
          carousel pinned to its grid cell visually (no permanent offset
          on release); onDragEnd reads offset OR velocity to decide
          direction. Vertical page scroll passes through cleanly because
          drag is x-only. */}
      <motion.div
        className="relative h-[420px] flex items-center justify-center touch-pan-y select-none"
        style={{ perspective: "1200px" }}
        drag="x"
        dragConstraints={{ left: 0, right: 0 }}
        dragElastic={0.08}
        dragMomentum={false}
        onDragEnd={(_, info) => {
          if (info.offset.x < -50 || info.velocity.x < -500) goNext();
          else if (info.offset.x > 50 || info.velocity.x > 500) goPrev();
        }}
      >
        {galleryItems.map((g, i) => {
          // Wrap-aware relative offset from the active index, clamped to
          // [-n/2, n/2] so cards far away can re-enter from the opposite side.
          let offset = i - active;
          if (offset > n / 2) offset -= n;
          if (offset < -n / 2) offset += n;

          const isActive = offset === 0;
          const isPrev = offset === -1;
          const isNext = offset === 1;
          const visible = isActive || isPrev || isNext;

          let translateX = 0;
          let rotateY = 0;
          let scale = 0.85;
          let zIndex = 0;
          if (isActive) {
            scale = 1;
            zIndex = 30;
          } else if (isPrev) {
            translateX = -55;
            rotateY = 15;
            zIndex = 20;
          } else if (isNext) {
            translateX = 55;
            rotateY = -15;
            zIndex = 20;
          }

          return (
            <motion.div
              key={i}
              animate={{
                x: `${translateX}%`,
                rotateY,
                scale,
                opacity: visible ? 1 : 0,
              }}
              transition={{ duration: 0.55, ease: [0.25, 0.1, 0.25, 1] }}
              style={{
                zIndex,
                transformStyle: "preserve-3d",
                pointerEvents: isActive ? "auto" : "none",
              }}
              className="absolute w-[260px] h-[400px] flex items-center justify-center"
            >
              <div className="w-full h-full max-w-full max-h-full flex items-center justify-center pointer-events-none">
                {g.mockup}
              </div>
            </motion.div>
          );
        })}
      </motion.div>

      {/* Text + nav */}
      <div className="text-left">
        <AnimatePresence mode="wait">
          <motion.div
            key={active}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            transition={{ duration: 0.3 }}
          >
            <p
              className="text-xs uppercase tracking-[0.2em] mb-2"
              style={{ color: MINT }}
            >
              {item.feature}
            </p>
            <h3 className="text-2xl md:text-3xl font-bold text-white">
              {item.toolName}
            </h3>
            <p className="text-sm text-neutral-400 mt-4 leading-relaxed max-w-md">
              {item.tagline}
            </p>
          </motion.div>
        </AnimatePresence>

        <div className="flex items-center gap-3 pt-8">
          <button
            type="button"
            onClick={goPrev}
            aria-label="Previous tool"
            className="w-10 h-10 rounded-full bg-neutral-900 border border-neutral-800 hover:border-mint hover:text-mint transition flex items-center justify-center text-neutral-400"
          >
            <ChevronLeft size={18} />
          </button>
          <button
            type="button"
            onClick={goNext}
            aria-label="Next tool"
            className="w-10 h-10 rounded-full bg-neutral-900 border border-neutral-800 hover:border-mint hover:text-mint transition flex items-center justify-center text-neutral-400"
          >
            <ChevronRight size={18} />
          </button>
          <div className="flex items-center gap-1.5 ml-3">
            {galleryItems.map((_, i) => (
              <button
                key={i}
                type="button"
                aria-label={`Go to item ${i + 1}`}
                onClick={() => setActive(i)}
                className="w-1.5 h-1.5 rounded-full transition-colors"
                style={{
                  backgroundColor: i === active ? MINT : "#404040",
                }}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
