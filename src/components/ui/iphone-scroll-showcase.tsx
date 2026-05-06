"use client";

import { motion, useScroll, useTransform } from "framer-motion";
import { useRef, type ReactNode } from "react";

/**
 * Scroll-driven iPhone-framed showcase. Adapts the Aceternity ContainerScroll
 * pattern — a long-ish scroll container drives a 3D tilt + scale on a card
 * pinned in the middle of the section. Here the card is styled as an iPhone
 * (bezel, rounded corners, dynamic-island notch) so an arbitrary `children`
 * payload reads as "what the user sees on their phone."
 *
 * Marketing-budget scroll length: 50–60rem container, NOT the 1500px the
 * Aceternity demo uses. Anything more steals scroll budget from the rest
 * of the marketing flow.
 */
export default function IphoneScrollShowcase({
  title,
  children,
}: {
  title?: ReactNode;
  children: ReactNode;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: containerRef });

  // 20° → 0° tilt and 1.05 → 1 scale as the card scrolls into the viewport.
  // The header lifts upward (-100) so it doesn't collide with the iPhone
  // when the card lands flat.
  const rotate = useTransform(scrollYProgress, [0, 1], [20, 0]);
  const scale = useTransform(scrollYProgress, [0, 1], [1.05, 1]);
  const headerTranslate = useTransform(scrollYProgress, [0, 1], [0, -100]);

  return (
    <div
      ref={containerRef}
      className="h-[50rem] md:h-[60rem] flex items-center justify-center relative px-4"
      style={{ perspective: "1000px" }}
    >
      <div className="w-full max-w-3xl mx-auto">
        {title ? (
          <motion.div
            style={{ translateY: headerTranslate }}
            className="text-center mb-10"
          >
            {title}
          </motion.div>
        ) : null}

        <motion.div
          style={{
            rotateX: rotate,
            scale,
            transformStyle: "preserve-3d",
          }}
          className="mx-auto w-[20rem] aspect-[9/19.5] rounded-[3rem] bg-black shadow-[0_40px_80px_-20px_rgba(0,0,0,0.7)] border-[10px] border-black relative"
        >
          {/* Dynamic-island-style notch */}
          <div className="w-24 h-6 bg-black rounded-b-2xl absolute top-0 left-1/2 -translate-x-1/2 z-20" />
          {/* Screen — clipped rounded inset so children don't bleed past the bezel */}
          <div className="absolute inset-0 rounded-[2.25rem] overflow-hidden bg-neutral-950">
            {children}
          </div>
        </motion.div>
      </div>
    </div>
  );
}
