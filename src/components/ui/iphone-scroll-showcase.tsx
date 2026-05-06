"use client";

import {
  motion,
  useScroll,
  useSpring,
  useTransform,
} from "framer-motion";
import { useRef, type ReactNode } from "react";

/**
 * Scroll-driven iPhone-framed showcase. Adapts the Aceternity ContainerScroll
 * pattern — a long-ish scroll container drives a 3D tilt + scale on a card
 * pinned in the middle of the section.
 *
 * H-3.5e tuning:
 *   - perspective bumped 1000→2000px and perspective-origin pushed to
 *     "50% 30%" so foreshortening reads as "card tipping forward toward
 *     viewer" instead of "tall card vertically squashing"
 *   - rotateX starts at 25° (was 20°) for more pronounced tilt
 *   - rotateY ranges -8°→0° so the card has spatial presence on a second
 *     axis instead of just hinging on a horizontal line
 *   - all transform values pass through useSpring (stiffness 100,
 *     damping 20) so motion has settle/lag instead of mechanically
 *     tracking raw scroll position
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

  // Raw scroll-tied transforms. Each gets smoothed by a useSpring before
  // being applied so the rotation eases in/out of position instead of
  // jumping with every scroll event.
  const rotateXRaw = useTransform(scrollYProgress, [0, 1], [25, 0]);
  const rotateYRaw = useTransform(scrollYProgress, [0, 1], [-8, 0]);
  const scaleRaw = useTransform(scrollYProgress, [0, 1], [1.05, 1]);
  const headerTranslateRaw = useTransform(scrollYProgress, [0, 1], [0, -100]);

  // Spring config: 100/20 lands "settled" without overshoot; 150 if motion
  // feels too laggy, 80 if it feels too jumpy. Default mass: 1.
  const SPRING = { stiffness: 100, damping: 20 };
  const rotateX = useSpring(rotateXRaw, SPRING);
  const rotateY = useSpring(rotateYRaw, SPRING);
  const scale = useSpring(scaleRaw, SPRING);
  const headerTranslate = useSpring(headerTranslateRaw, SPRING);

  return (
    <div
      ref={containerRef}
      className="h-[40rem] md:h-[50rem] flex items-center justify-center relative px-4"
      style={{
        perspective: "2000px",
        perspectiveOrigin: "50% 30%",
      }}
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
            rotateX,
            rotateY,
            scale,
            transformStyle: "preserve-3d",
          }}
          className="mx-auto w-[20rem] aspect-[9/19.5] rounded-[3rem] bg-black shadow-[0_40px_80px_-20px_rgba(0,0,0,0.7)] border-[10px] border-black relative"
        >
          {/* Dynamic-island-style notch */}
          <div className="w-24 h-6 bg-black rounded-b-2xl absolute top-0 left-1/2 -translate-x-1/2 z-20" />
          {/* Screen — clipped rounded inset so children don't bleed past
           *  the bezel. Inner wrapper also gets transformStyle:preserve-3d
           *  so child content doesn't get re-flattened in its own 2D
           *  context as the parent rotates. */}
          <div
            className="absolute inset-0 rounded-[2.25rem] overflow-hidden bg-neutral-950"
            style={{ transformStyle: "preserve-3d" }}
          >
            {children}
          </div>
        </motion.div>
      </div>
    </div>
  );
}
