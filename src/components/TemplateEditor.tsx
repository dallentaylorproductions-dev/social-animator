"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Canvas } from "@/engine/canvas";
import {
  SIZE_PRESETS,
  getDefaultState,
  EXTRA_BACKGROUND_FIELDS,
  type TemplateConfig,
  type TemplateSize,
  type TemplateAssets,
  type TemplateState,
  type FieldDef,
} from "@/templates/types";
import { ExportButton } from "@/components/ExportButton";
import { ImageField } from "@/components/ImageField";
import { useBrandSettings } from "@/lib/brand";
import { BatchExportButton } from "@/components/BatchExportButton";
import { getFFmpeg } from "@/engine/export";

interface TemplateEditorProps {
  template: TemplateConfig;
}

const SAVED_COLORS_KEY_PREFIX = "socanim_colors_";

/** All color fields a template + extras provide — used for save/load helpers. */
function colorFieldsFor(template: TemplateConfig): FieldDef[] {
  const all = [...template.fields, ...EXTRA_BACKGROUND_FIELDS];
  return all.filter((f) => f.type === "color");
}

function loadSavedColors(template: TemplateConfig): TemplateState {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(
      SAVED_COLORS_KEY_PREFIX + template.id
    );
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const colorKeys = new Set(colorFieldsFor(template).map((f) => f.key));
    const result: TemplateState = {};
    for (const key of Object.keys(parsed)) {
      if (colorKeys.has(key) && typeof parsed[key] === "string") {
        result[key] = parsed[key] as string;
      }
    }
    return result;
  } catch {
    return {};
  }
}

function saveColors(template: TemplateConfig, state: TemplateState): void {
  if (typeof window === "undefined") return;
  try {
    const colorState: Record<string, string> = {};
    for (const f of colorFieldsFor(template)) {
      if (state[f.key]) colorState[f.key] = state[f.key];
    }
    window.localStorage.setItem(
      SAVED_COLORS_KEY_PREFIX + template.id,
      JSON.stringify(colorState)
    );
  } catch {
    // ignore
  }
}

function clearSavedColors(template: TemplateConfig): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(SAVED_COLORS_KEY_PREFIX + template.id);
  } catch {
    // ignore
  }
}

/** Build the form's fields list with EXTRA_BACKGROUND_FIELDS injected right
 *  after the template's existing "background" color field, so background
 *  controls are grouped. If no "background" field exists, extras append. */
function buildRenderedFields(template: TemplateConfig): FieldDef[] {
  const out: FieldDef[] = [];
  let injected = false;
  for (const f of template.fields) {
    out.push(f);
    if (f.key === "background" && !injected) {
      out.push(...EXTRA_BACKGROUND_FIELDS);
      injected = true;
    }
  }
  if (!injected) out.push(...EXTRA_BACKGROUND_FIELDS);
  return out;
}

/** From the current state, produce a paintBackground function for Canvas — or
 *  undefined if the style is solid (Canvas will fall back to solid fillRect). */
function makePaintBackground(
  state: TemplateState,
  width: number,
  height: number
): ((ctx: CanvasRenderingContext2D, t: number) => void) | undefined {
  const style = state.backgroundStyle ?? "solid";
  const bg1 = state.background ?? "#000000";
  const bg2 = state.backgroundColor2 ?? bg1;

  if (style === "gradient") {
    return (ctx) => {
      const grad = ctx.createLinearGradient(0, 0, 0, height);
      grad.addColorStop(0, bg1);
      grad.addColorStop(1, bg2);
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, width, height);
    };
  }
  return undefined;
}

export function TemplateEditor({ template }: TemplateEditorProps) {
  const [state, setState] = useState<TemplateState>(() => {
    // Layer order: extra-field defaults → template defaults → saved colors
    const defaults: TemplateState = {};
    for (const f of EXTRA_BACKGROUND_FIELDS) defaults[f.key] = f.default;
    Object.assign(defaults, getDefaultState(template));
    const saved = loadSavedColors(template);
    return { ...defaults, ...saved };
  });
  const [assets, setAssets] = useState<TemplateAssets>({});
  const [sizeKey, setSizeKey] = useState<TemplateSize>("1080x1350");
  const [playKey, setPlayKey] = useState(0);
  const [duration, setDuration] = useState<number>(template.duration);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const { settings: brandSettings, logoImg: brandLogo } = useBrandSettings();

  const size = SIZE_PRESETS.find((s) => s.key === sizeKey)!;

  useEffect(() => {
    saveColors(template, state);
  }, [template, state]);

  useEffect(() => {
    getFFmpeg().catch(() => {
      // Silent — actual export will retry if this fails
    });
  }, []);

  const timeline = useMemo(() => {
    const t = template.build(
      state,
      { width: size.width, height: size.height },
      assets
    );
    t.duration = duration;
    return t;
  }, [template, state, size, duration, assets]);

  const paintBackground = useMemo(
    () => makePaintBackground(state, size.width, size.height),
    [state, size.width, size.height]
  );

  const renderedFields = useMemo(() => buildRenderedFields(template), [template]);

  const updateField = (key: string, value: string) => {
    setState((prev) => ({ ...prev, [key]: value }));
  };

  const updateAsset = (key: string, img: HTMLImageElement | null) => {
    setAssets((prev) => ({ ...prev, [key]: img }));
  };

  const resetColors = () => {
    clearSavedColors(template);
    setState((prev) => {
      const next = { ...prev };
      for (const f of colorFieldsFor(template)) {
        next[f.key] = f.default;
      }
      // Also reset backgroundStyle to default (solid)
      next.backgroundStyle = "solid";
      return next;
    });
  };

  const isFieldVisible = (field: FieldDef): boolean => {
    if (!field.showWhen) return true;
    return state[field.showWhen.key] === field.showWhen.value;
  };

  return (
    <main className="min-h-screen bg-neutral-950 text-white">
      <div className="max-w-6xl mx-auto p-6 lg:p-10">
        <header className="mb-8">
          <a
            href="/social-animator"
            className="text-xs uppercase tracking-[0.2em] text-[#4ef2d9] hover:underline"
          >
            ← Social Animator
          </a>
          <h1 className="text-2xl font-semibold mt-1">{template.name}</h1>
          <p className="text-sm text-neutral-400 mt-1 max-w-md">
            {template.description}
          </p>
        </header>

        <div className="flex flex-col-reverse gap-6 lg:grid lg:grid-cols-[360px_1fr] lg:gap-10">
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

            <div>
              <label className="block text-[10px] uppercase tracking-[0.15em] text-neutral-500 mb-2">
                Duration · {duration}s
              </label>
              <input
                type="range"
                min={4}
                max={30}
                step={1}
                value={duration}
                onChange={(e) => setDuration(parseInt(e.target.value, 10))}
                className="w-full accent-[#4ef2d9]"
              />
              <div className="flex justify-between text-[10px] text-neutral-600 mt-1">
                <span>4s</span>
                <span>30s</span>
              </div>
            </div>

            <button
              onClick={() => setPlayKey((k) => k + 1)}
              className="w-full bg-neutral-800 hover:bg-neutral-700 text-white rounded-md px-4 py-2.5 text-sm font-medium transition"
            >
              Replay animation
            </button>

            <button
              onClick={resetColors}
              className="w-full text-[11px] text-neutral-500 hover:text-neutral-300 transition py-1"
            >
              ↺ Reset colors to brand defaults
            </button>

            <div className="space-y-5 pt-2 border-t border-neutral-800/60">
              {renderedFields.map((field) => {
                if (!isFieldVisible(field)) return null;
                return (
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
                    {field.type === "image" && (
                      <ImageField
                        value={assets[field.key] ?? null}
                        onChange={(img) => updateAsset(field.key, img)}
                      />
                    )}
                    {field.type === "select" && (
                      <select
                        value={state[field.key] ?? field.default}
                        onChange={(e) => updateField(field.key, e.target.value)}
                        className="w-full bg-neutral-900 border border-neutral-800 rounded-md px-3 py-2 text-sm focus:outline-none focus:border-[#4ef2d9]"
                      >
                        {field.options?.map((opt) => (
                          <option key={opt.value} value={opt.value}>
                            {opt.label}
                          </option>
                        ))}
                      </select>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="pt-5 border-t border-neutral-800">
              <p className="text-[11px] text-neutral-500 leading-snug mb-3">
                ⓘ Keep this tab focused and visible while recording. Switching
                tabs or minimizing the window can freeze the export.
              </p>
              <ExportButton
                canvasRef={canvasRef}
                duration={duration}
                size={{ width: size.width, height: size.height }}
                filename={`${template.id}-${size.shortLabel.toLowerCase()}`}
                onStartRecording={() => setPlayKey((k) => k + 1)}
              />
              <div className="pt-3">
                <BatchExportButton
                  templateId={template.id}
                  duration={duration}
                  canvasRef={canvasRef}
                  onSizeChange={setSizeKey}
                  onPlayKeyChange={() => setPlayKey((k) => k + 1)}
                />
              </div>
            </div>
          </aside>

          <section className="sticky top-0 z-20 -mx-6 lg:mx-0 px-6 lg:px-0 pt-3 pb-3 lg:py-0 bg-neutral-950 lg:bg-transparent border-b border-neutral-800/60 lg:border-0 lg:static flex items-start justify-center">
            <div className="w-full max-w-[200px] lg:max-w-sm">
              <Canvas
                ref={canvasRef}
                width={size.width}
                height={size.height}
                timeline={timeline}
                background={state.background ?? "#000000"}
                paintBackground={paintBackground}
                playKey={`${sizeKey}-${playKey}-${duration}`}
                brandLogo={brandLogo}
                brandName={brandSettings.agentName}
              />
              <p className="text-[10px] lg:text-xs text-neutral-500 mt-2 lg:mt-3 text-center">
                Preview · {size.label} · {duration}s
              </p>
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}
