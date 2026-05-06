"use client";

import {
  motion,
  useScroll,
  useSpring,
  useTransform,
} from "framer-motion";
import { useEffect, useRef, useState, type ReactNode } from "react";

/**
 * Scroll-driven iPhone-framed showcase. Adapts the Aceternity ContainerScroll
 * pattern — a long-ish scroll container drives a 3D tilt + scale on a card
 * pinned in the middle of the section.
 *
 * H-3.5f tuning (after H-3.5e overcorrected to "showy"):
 *   - rotateX dropped 25°→6° on desktop. Six degrees registers as 3D
 *     foreshortening without the card feeling like it's physically
 *     tipping forward.
 *   - rotateY removed entirely — the spatial-presence read on a tall
 *     iPhone shape was too much. Single rotation axis, simpler line.
 *   - perspective dropped 2000→1500 to match the gentler rotation.
 *   - On mobile (≤768px) ALL rotation is disabled: the inner mockup
 *     animation IS the product demo; the scroll-driven 3D layer is
 *     decorative on top, and "decorative + jumpy on touch scroll" is
 *     worse than "static + clean." Scale + translate stay since they're
 *     not the source of the dramatic feel.
 *   - useSpring stays on every motion value (smooth settle on trackpads).
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

  // Mobile detection via matchMedia. SSR-safe: starts false, updates on
  // mount + on viewport-width change. Re-renders rebuild useTransform with
  // the right input ranges.
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 768px)");
    setIsMobile(mq.matches);
    const onChange = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  // Mobile flattens rotateX to 0 across the whole scroll range; desktop
  // gets the gentle 6°→0° tilt.
  const rotateXRaw = useTransform(
    scrollYProgress,
    [0, 1],
    isMobile ? [0, 0] : [6, 0]
  );
  const scaleRaw = useTransform(scrollYProgress, [0, 1], [1.05, 1]);
  const headerTranslateRaw = useTransform(scrollYProgress, [0, 1], [0, -100]);

  const SPRING = { stiffness: 100, damping: 20 };
  const rotateX = useSpring(rotateXRaw, SPRING);
  const scale = useSpring(scaleRaw, SPRING);
  const headerTranslate = useSpring(headerTranslateRaw, SPRING);

  return (
    <div
      ref={containerRef}
      className="h-[40rem] md:h-[50rem] flex items-center justify-center relative px-4 overflow-hidden"
      style={{
        perspective: "1500px",
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
            scale,
            transformStyle: "preserve-3d",
          }}
          // Responsive width so the 9:19.5 aspect doesn't push the bezel
          // taller than the showcase wrapper on narrow viewports. At
          // 16rem (256px) the iPhone is ~554px tall — fits inside the
          // 40rem (640px) mobile wrapper with ~43px breathing room top
          // and bottom. At sm+ (≥640px viewport) we go to 18rem, and
          // at md+ (≥768px) we restore the original 20rem desktop size.
          className="mx-auto w-[16rem] sm:w-[18rem] md:w-[20rem] aspect-[9/19.5] rounded-[3rem] bg-black shadow-[0_40px_80px_-20px_rgba(0,0,0,0.7)] border-[10px] border-black relative"
        >
          {/* Dynamic-island-style notch */}
          <div className="w-24 h-6 bg-black rounded-b-2xl absolute top-0 left-1/2 -translate-x-1/2 z-20" />
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
