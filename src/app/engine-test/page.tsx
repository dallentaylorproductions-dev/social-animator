"use client";

import { useMemo } from "react";
import { Canvas } from "@/engine/canvas";
import { Timeline } from "@/engine/timeline";
import { easeOutCubic, easeInOutCubic } from "@/engine/easing";

export default function EngineTestPage() {
  const timeline = useMemo(
    () =>
      new Timeline([
        // White rectangle fades in at t=0.5s over 1s
        {
          id: "rect-fade",
          start: 0.5,
          duration: 1,
          easing: easeOutCubic,
          onUpdate: (p, ctx) => {
            ctx.globalAlpha = p;
            ctx.fillStyle = "#ffffff";
            ctx.fillRect(100, 140, 200, 120);
          },
        },
        // Cyan circle pulses starting at t=1.8s, loops forever
        {
          id: "circle-pulse",
          start: 1.8,
          duration: 1.2,
          easing: easeInOutCubic,
          loop: true,
          onUpdate: (p, ctx) => {
            const pulse = Math.sin(p * Math.PI * 2) * 0.2 + 1; // 0.8 → 1.2
            const radius = 50 * pulse;
            ctx.fillStyle = "#4ef2d9";
            ctx.beginPath();
            ctx.arc(600, 200, radius, 0, Math.PI * 2);
            ctx.fill();
          },
        },
      ]),
    []
  );

  return (
    <main className="min-h-screen bg-black flex flex-col items-center justify-center p-8">
      <div className="w-full max-w-4xl">
        <Canvas
          width={800}
          height={400}
          timeline={timeline}
          background="#000000"
        />
      </div>
      <p className="text-gray-500 text-sm mt-6">
        Phase 1 — Engine proof: white rectangle fades in, cyan circle pulses.
      </p>
    </main>
  );
}
