"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
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
import { formatPhone, useBrandSettings } from "@/lib/brand";
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
  // H-7.7: templates can restrict the editor's size picker via
  // `availableSizes`. Filter SIZE_PRESETS once; the initial sizeKey
  // falls back to whichever size the template actually supports if
  // the conventional Feed default isn't in the allowed list.
  const availableSizes = useMemo(
    () =>
      template.availableSizes
        ? SIZE_PRESETS.filter((s) => template.availableSizes!.includes(s.key))
        : SIZE_PRESETS,
    [template]
  );
  const [sizeKey, setSizeKey] = useState<TemplateSize>(() =>
    availableSizes.some((s) => s.key === "1080x1350")
      ? "1080x1350"
      : availableSizes[0].key
  );
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
    // H-7.8-2: listing-showcase reads agent name / brokerage / phone /
    // license / logo from the brand profile rather than from sidebar
    // form fields. Inject those values into build() inputs for that
    // template only — mirrors the four main tools' pattern (Listing
    // Flyer's template-mapping.ts does the same merge). Other templates
    // pass state + assets straight through unchanged.
    const buildState =
      template.id === "listing-showcase"
        ? {
            ...state,
            agentName: brandSettings.agentName || "",
            agentBrokerage: brandSettings.brokerage || "",
            agentPhone: brandSettings.contactPhone
              ? formatPhone(brandSettings.contactPhone)
              : "",
            agentLicense: brandSettings.licenseNumber || "",
          }
        : state;
    const buildAssets =
      template.id === "listing-showcase"
        ? { ...assets, agentLogo: brandLogo }
        : assets;
    const t = template.build(
      buildState,
      { width: size.width, height: size.height },
      buildAssets
    );
    t.duration = duration;
    return t;
  }, [template, state, size, duration, assets, brandSettings, brandLogo]);

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
          <Link
            href="/social-animator"
            className="text-xs uppercase tracking-[0.2em] text-[#4ef2d9] hover:underline"
          >
            ← Social Animator
          </Link>
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
                {availableSizes.map((s) => (
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
                // stringList stores values newline-joined inside state but
                // renders as separate inputs; the parsed list is used for
                // both the "(n / max)" counter and the input rows below.
                const stringListItems =
                  field.type === "stringList"
                    ? parseStringList(state[field.key] ?? "")
                    : null;
                const labelText =
                  field.type === "stringList" && field.max !== undefined
                    ? `${field.label} (${stringListItems!.length} / ${field.max})`
                    : field.label;
                return (
                  <div key={field.key}>
                    <label className="block text-[10px] uppercase tracking-[0.15em] text-neutral-500 mb-2">
                      {labelText}
                    </label>
                    {field.type === "text" && (
                      <input
                        type="text"
                        value={state[field.key] ?? ""}
                        onChange={(e) => updateField(field.key, e.target.value)}
                        className="w-full bg-neutral-900 border border-neutral-800 rounded-md px-3 py-2 text-base lg:text-sm focus:outline-none focus:border-[#4ef2d9]"
                      />
                    )}
                    {field.type === "textarea" && (
                      <textarea
                        value={state[field.key] ?? ""}
                        onChange={(e) => updateField(field.key, e.target.value)}
                        rows={3}
                        className="w-full bg-neutral-900 border border-neutral-800 rounded-md px-3 py-2 text-base lg:text-sm focus:outline-none focus:border-[#4ef2d9] resize-none"
                      />
                    )}
                    {field.type === "stringList" && stringListItems && (
                      <StringListInput
                        items={stringListItems}
                        max={field.max}
                        onChange={(next) =>
                          updateField(field.key, next.join("\n"))
                        }
                      />
                    )}
                    {field.type === "color" && (
                      <div className="flex items-center gap-2">
                        {/* 44×44pt wrapper — visible swatch in mobile Safari
                         * portrait where the bare native input collapses. */}
                        <label
                          className="relative block w-11 h-11 rounded border border-neutral-800 cursor-pointer overflow-hidden flex-shrink-0"
                          style={{
                            backgroundColor: state[field.key] ?? "#000000",
                          }}
                        >
                          <input
                            type="color"
                            value={state[field.key] ?? "#000000"}
                            onChange={(e) =>
                              updateField(field.key, e.target.value)
                            }
                            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                          />
                        </label>
                        <input
                          type="text"
                          value={state[field.key] ?? ""}
                          onChange={(e) => updateField(field.key, e.target.value)}
                          className="flex-1 min-w-0 bg-neutral-900 border border-neutral-800 rounded-md px-3 py-2 text-base lg:text-sm font-mono focus:outline-none focus:border-[#4ef2d9]"
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
                        className="w-full bg-neutral-900 border border-neutral-800 rounded-md px-3 py-2 text-base lg:text-sm focus:outline-none focus:border-[#4ef2d9]"
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

          {/* H-7.2.4-4: desktop preview was `lg:static` which killed
              the sticky behavior on long forms — once the user
              scrolled past the preview's natural top, it scrolled
              off the top of the viewport and stayed gone. Switched
              to the same sticky pattern as the other three tools
              (Listing Flyer / Listing Presentation / Open House
              Promo): `lg:sticky lg:top-4 lg:self-start` anchors
              the preview to the top of its grid cell with a 16px
              chrome offset; `lg:max-h-[calc(100vh-2rem)]
              lg:overflow-y-auto` caps height to viewport so the
              preview can't escape its column into the exports row
              below. Mobile sticky-top (via the unconditional
              `sticky top-0`) is preserved. */}
          <section className="sticky top-0 lg:top-4 z-20 -mx-6 lg:mx-0 px-6 lg:px-0 pt-3 pb-3 lg:py-0 bg-neutral-950 lg:bg-transparent border-b border-neutral-800/60 lg:border-0 lg:self-start lg:max-h-[calc(100vh-2rem)] lg:overflow-y-auto flex items-start justify-center">
            <div className="w-full max-w-[200px] lg:max-w-sm">
              <Canvas
                ref={canvasRef}
                width={size.width}
                height={size.height}
                timeline={timeline}
                background={state.background ?? "#000000"}
                paintBackground={paintBackground}
                playKey={`${sizeKey}-${playKey}-${duration}`}
                brandLogo={template.rendersAgentInContent ? null : brandLogo}
                brandName={
                  template.rendersAgentInContent ? "" : brandSettings.agentName
                }
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

/**
 * Parse a `stringList` field's stored value (newline-joined) into an array
 * of entries. An empty stored value yields a single empty slot so the user
 * sees at least one input row to type into.
 */
function parseStringList(raw: string): string[] {
  if (raw === "") return [""];
  return raw.split("\n");
}

/**
 * Renders the chip-add UI for a `stringList` field — one input per entry
 * with a × remove control, plus a "+ Add" button that disables at `max`.
 * The parent owns state; this component is purely presentational and emits
 * the next array via `onChange`.
 *
 * Paste guard: input values strip embedded newlines so a multi-line paste
 * into a single row can't break the underlying newline-joined storage.
 */
function StringListInput({
  items,
  max,
  onChange,
}: {
  items: string[];
  max?: number;
  onChange: (next: string[]) => void;
}) {
  const canAdd = max === undefined || items.length < max;
  return (
    <div className="space-y-2">
      {items.map((item, i) => (
        <div key={i} className="flex items-center gap-2">
          <input
            type="text"
            value={item}
            onChange={(e) => {
              const next = [...items];
              next[i] = e.target.value.replace(/\n+/g, " ");
              onChange(next);
            }}
            className="flex-1 min-w-0 bg-neutral-900 border border-neutral-800 rounded-md px-3 py-2 text-base lg:text-sm focus:outline-none focus:border-[#4ef2d9]"
          />
          {items.length > 1 && (
            <button
              type="button"
              onClick={() =>
                onChange(items.filter((_, idx) => idx !== i))
              }
              aria-label="Remove entry"
              className="px-2 py-1 text-xs text-neutral-500 hover:text-neutral-300"
            >
              ✕
            </button>
          )}
        </div>
      ))}
      {canAdd && (
        <button
          type="button"
          onClick={() => onChange([...items, ""])}
          className="w-full bg-neutral-900 border border-dashed border-neutral-700 hover:border-[#4ef2d9] rounded-md px-3 py-2 text-xs text-neutral-400 hover:text-neutral-200 transition"
        >
          + Add
        </button>
      )}
    </div>
  );
}
