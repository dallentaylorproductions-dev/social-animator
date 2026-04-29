"use client";

import { useMemo, useState } from "react";
import { Canvas } from "@/engine/canvas";
import { Timeline } from "@/engine/timeline";
import { easeOutCubic } from "@/engine/easing";
import { drawImageCover } from "@/engine/draw";
import { ImageField } from "@/components/ImageField";

export default function ImageTestPage() {
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [playKey, setPlayKey] = useState(0);

  const timeline = useMemo(
    () =>
      new Timeline([
        {
          id: "hero",
          start: 0.2,
          duration: 0.8,
          easing: easeOutCubic,
          onUpdate: (p, ctx) => {
            ctx.globalAlpha = p;
            if (img) {
              drawImageCover(ctx, img, 100, 100, 880, 880, 32);
            } else {
              ctx.fillStyle = "#1a1a1a";
              ctx.beginPath();
              ctx.roundRect(100, 100, 880, 880, 32);
              ctx.fill();
              ctx.fillStyle = "#666";
              ctx.font = "32px Inter, system-ui, sans-serif";
              ctx.textAlign = "center";
              ctx.textBaseline = "middle";
              ctx.fillText("Upload an image →", 540, 540);
            }
          },
        },
      ]),
    [img]
  );

  return (
    <main className="min-h-screen bg-neutral-950 text-white p-8">
      <div className="max-w-5xl mx-auto">
        <a
          href="/social-animator"
          className="text-xs uppercase tracking-[0.2em] text-[#4ef2d9] hover:underline"
        >
          ← Social Animator
        </a>
        <h1 className="text-2xl font-semibold mt-1 mb-1">Image Test</h1>
        <p className="text-sm text-neutral-400 mb-8 max-w-md">
          Phase B-1 proof: upload an image, see it render with rounded crop on
          the canvas.
        </p>

        <div className="grid lg:grid-cols-[360px_1fr] gap-10">
          <aside className="space-y-5">
            <div>
              <label className="block text-[10px] uppercase tracking-[0.15em] text-neutral-500 mb-2">
                Photo
              </label>
              <ImageField value={img} onChange={setImg} />
            </div>

            <button
              onClick={() => setPlayKey((k) => k + 1)}
              className="w-full bg-neutral-800 hover:bg-neutral-700 text-white rounded-md px-4 py-2.5 text-sm font-medium transition"
            >
              Replay animation
            </button>
          </aside>

          <section className="flex items-start justify-center">
            <div className="w-full max-w-sm">
              <Canvas
                width={1080}
                height={1080}
                timeline={timeline}
                background="#000000"
                playKey={String(playKey)}
              />
              <p className="text-xs text-neutral-500 mt-3 text-center">
                Preview · Square (1080 × 1080)
              </p>
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}
