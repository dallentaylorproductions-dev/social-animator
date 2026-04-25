"use client";

import { useMemo, useRef, useState } from "react";
import { Canvas } from "@/engine/canvas";
import {
  SIZE_PRESETS,
  getDefaultState,
  type TemplateConfig,
  type TemplateSize,
} from "@/templates/types";
import { ExportButton } from "@/components/ExportButton";

interface TemplateEditorProps {
  template: TemplateConfig;
}

export function TemplateEditor({ template }: TemplateEditorProps) {
  const [state, setState] = useState(() => getDefaultState(template));
  const [sizeKey, setSizeKey] = useState<TemplateSize>("1080x1350");
  const [playKey, setPlayKey] = useState(0);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const size = SIZE_PRESETS.find((s) => s.key === sizeKey)!;

  const timeline = useMemo(
    () => template.build(state, { width: size.width, height: size.height }),
    [template, state, size]
  );

  const updateField = (key: string, value: string) => {
    setState((prev) => ({ ...prev, [key]: value }));
  };

  return (
    <main className="min-h-screen bg-neutral-950 text-white">
      <div className="max-w-6xl mx-auto p-6 lg:p-10">
        <header className="mb-8">
          <p className="text-xs uppercase tracking-[0.2em] text-[#4ef2d9]">
            Social Animator
          </p>
          <h1 className="text-2xl font-semibold mt-1">{template.name}</h1>
          <p className="text-sm text-neutral-400 mt-1 max-w-md">
            {template.description}
          </p>
        </header>

        <div className="grid lg:grid-cols-[360px_1fr] gap-10">
          <aside className="space-y-5">
            <div>
              <label className="block text-[10px] uppercase tracking-[0.15em] text-neutral-500 mb-2">
                Size
              </label>
              <div className="grid grid-cols-3 gap-2">
                {SIZE_PRESETS.map((s) => (
                  <button
                    key={s.key}
                    onClick={() => setSizeKey(s.key)}
                    className={`rounded-md px-2 py-2.5 text-xs font-medium transition ${
                      sizeKey === s.key
                        ? "bg-[#4ef2d9] text-black"
                        : "bg-neutral-900 text-neutral-300 hover:bg-neutral-800"
                    }`}
                  >
                    {s.shortLabel}
                  </button>
                ))}
              </div>
            </div>

            {template.fields.map((field) => (
              <div key={field.key}>
                <label className="block text-[10px] uppercase tracking-[0.15em] text-neutral-500 mb-2">
                  {field.label}
                </label>
                {field.type === "text" && (
                  <input
                    type="text"
                    value={state[field.key] ?? ""}
                    onChange={(e) => updateField(field.key, e.target.value)}
                    className="w-full bg-neutral-900 border border-neutral-800 rounded-md px-3 py-2 text-sm focus:outline-none focus:border-[#4ef2d9]"
                  />
                )}
                {field.type === "textarea" && (
                  <textarea
                    value={state[field.key] ?? ""}
                    onChange={(e) => updateField(field.key, e.target.value)}
                    rows={3}
                    className="w-full bg-neutral-900 border border-neutral-800 rounded-md px-3 py-2 text-sm focus:outline-none focus:border-[#4ef2d9] resize-none"
                  />
                )}
                {field.type === "color" && (
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={state[field.key] ?? "#000000"}
                      onChange={(e) => updateField(field.key, e.target.value)}
                      className="w-12 h-10 rounded cursor-pointer bg-transparent border border-neutral-800 p-0.5"
                    />
                    <input
                      type="text"
                      value={state[field.key] ?? ""}
                      onChange={(e) => updateField(field.key, e.target.value)}
                      className="flex-1 bg-neutral-900 border border-neutral-800 rounded-md px-3 py-2 text-sm font-mono focus:outline-none focus:border-[#4ef2d9]"
                    />
                  </div>
                )}
              </div>
            ))}

            <button
              onClick={() => setPlayKey((k) => k + 1)}
              className="w-full mt-2 bg-neutral-800 hover:bg-neutral-700 text-white rounded-md px-4 py-2.5 text-sm font-medium transition"
            >
              Replay animation
            </button>

            <div className="pt-5 border-t border-neutral-800">
              <ExportButton
                canvasRef={canvasRef}
                duration={template.duration}
                size={{ width: size.width, height: size.height }}
                filename={`${template.id}-${size.shortLabel.toLowerCase()}`}
                onStartRecording={() => setPlayKey((k) => k + 1)}
              />
            </div>
          </aside>

          <section className="flex items-start justify-center">
            <div className="w-full max-w-sm">
              <Canvas
                ref={canvasRef}
                width={size.width}
                height={size.height}
                timeline={timeline}
                background={state.background ?? "#000000"}
                playKey={`${sizeKey}-${playKey}`}
              />
              <p className="text-xs text-neutral-500 mt-3 text-center">
                Preview · {size.label}
              </p>
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}
