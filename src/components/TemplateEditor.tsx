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
  type ObjectListSchema,
} from "@/templates/types";
import { ExportButton } from "@/components/ExportButton";
import { ImageField } from "@/components/ImageField";
import {
  formatPhone,
  useBrandSettings,
  type BrandSettings,
} from "@/lib/brand";
import {
  LISTING_PROFILE_FIELDS,
  useListingProfile,
  type ListingProfile,
} from "@/lib/listing-profile";
import { getFFmpeg } from "@/engine/export";
import {
  CurrencyInput,
  NumberInput,
  PhoneInput,
} from "@/components/inputs";

/**
 * Templates that consume the shared listing profile (per H-7.12 audit).
 * On these templates, empty form fields populate from the saved profile
 * on first render; a "Save changes to listing profile" button appears
 * when the template state diverges from the saved profile.
 */
const LISTING_CONSUMER_TEMPLATE_IDS = new Set([
  "listing-card",
  "listing-showcase",
]);

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

/**
 * H-7.13 simplified color picker. Brand-slot field keys move from the inline
 * sidebar into a dedicated "Brand colors" section at the top of the form,
 * mirroring the pattern shared by Listing Flyer / OH Promo / Listing
 * Presentation. The slot set is closed (matches the audit's documented
 * exception for qa-card) so unrelated color fields stay inline.
 */
const BRAND_SLOT_KEYS = new Set([
  "primary",
  "accent",
  "background",
  // qa-card exception (audit §4.6): question/answer panel pairing is a
  // signature design element that doesn't map cleanly to brand primary/
  // accent, so question panel surfaces as a 4th slot on qa-card.
  "questionPanel",
]);

function brandColorSlotsFor(template: TemplateConfig): FieldDef[] {
  return template.fields.filter(
    (f) => f.type === "color" && BRAND_SLOT_KEYS.has(f.key)
  );
}

/**
 * A template is considered migrated to the H-7.13 brand-slot pattern once it
 * declares `primary` or `accent` color fields. Pre-migration templates keep
 * their legacy inline-color FieldDefs and bypass the brand inheritance layer;
 * the form layout for those templates is identical to v1.38.
 */
function isMigratedTemplate(template: TemplateConfig): boolean {
  return template.fields.some(
    (f) => f.key === "primary" || f.key === "accent"
  );
}

/**
 * Resolve the effective fallback color for a brand slot. Primary + accent
 * pull from the brand profile; background and exception slots use the
 * template's own FieldDef.default (per audit §3.1 — backgroundColor is
 * intentionally NOT exposed in BrandProfileForm, so the per-template
 * default is the only fallback for the Background slot).
 */
function brandColorFor(slot: FieldDef, brand: BrandSettings): string {
  if (slot.key === "primary") return brand.primaryColor || slot.default;
  if (slot.key === "accent") return brand.accentColor || slot.default;
  return slot.default;
}

/**
 * Build the resolved state passed to template.build(). For migrated
 * templates, empty brand-slot values fall through to the brand profile
 * (primary/accent) or to the FieldDef default (background, exceptions).
 * Non-empty values are user overrides and pass through unchanged.
 */
function resolveBrandColors(
  state: TemplateState,
  template: TemplateConfig,
  brand: BrandSettings
): TemplateState {
  const slots = brandColorSlotsFor(template);
  if (slots.length === 0) return state;
  const out: TemplateState = { ...state };
  for (const slot of slots) {
    if (!out[slot.key]) out[slot.key] = brandColorFor(slot, brand);
  }
  return out;
}

/** Build the form's fields list with EXTRA_BACKGROUND_FIELDS injected right
 *  after the template's existing "background" color field, so background
 *  controls are grouped. If no "background" field exists, extras append.
 *
 *  H-7.13: for migrated templates (those declaring `primary` or `accent`),
 *  brand-slot color fields move into the top-of-form BrandColorsSection
 *  and are excluded from the inline list. EXTRA_BACKGROUND_FIELDS append
 *  at the end since the inline background anchor is now absent.
 */
function buildRenderedFields(
  template: TemplateConfig,
  isMigrated: boolean
): FieldDef[] {
  if (isMigrated) {
    const out = template.fields.filter((f) => !BRAND_SLOT_KEYS.has(f.key));
    out.push(...EXTRA_BACKGROUND_FIELDS);
    return out;
  }
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
  const listingProfile = useListingProfile();

  const size = SIZE_PRESETS.find((s) => s.key === sizeKey)!;

  // H-7.12 (C.3): for listing-consumer templates, merge the saved
  // listing profile into form state ONCE on initial hydration —
  // "first-edit-only" defaults injection. After this, edits stay
  // local to the template; the user explicitly commits via the
  // "Save changes to listing profile" button (rendered below).
  // Text fields are merged only where state is empty (don't
  // clobber a default that was already set by the template's
  // FieldDef). Hero photo is materialized from its data URL.
  const mergedListingProfileRef = useRef(false);
  useEffect(() => {
    if (mergedListingProfileRef.current) return;
    if (!listingProfile.hydrated) return;
    if (!LISTING_CONSUMER_TEMPLATE_IDS.has(template.id)) {
      mergedListingProfileRef.current = true;
      return;
    }
    mergedListingProfileRef.current = true;

    setState((prev) => {
      const next = { ...prev };
      for (const k of LISTING_PROFILE_FIELDS) {
        if (!next[k] && listingProfile.settings[k]) {
          next[k] = listingProfile.settings[k];
        }
      }
      return next;
    });

    if (listingProfile.settings.heroPhoto) {
      const img = new Image();
      img.onload = () =>
        setAssets((prev) => ({ ...prev, heroPhoto: img }));
      // Silent on error — a stale/corrupt data URL just leaves the
      // hero slot empty and the user re-uploads.
      img.src = listingProfile.settings.heroPhoto;
    }
  }, [
    listingProfile.hydrated,
    listingProfile.settings,
    template.id,
  ]);

  useEffect(() => {
    saveColors(template, state);
  }, [template, state]);

  useEffect(() => {
    getFFmpeg().catch(() => {
      // Silent — actual export will retry if this fails
    });
  }, []);

  // H-7.12 (C.3): dirty-state check for the "Save changes to listing
  // profile" affordance. True when ANY listing-profile field on the
  // current template state differs from the saved profile, OR the
  // hero-photo asset differs from the saved hero photo data URL.
  // Only meaningful for listing-consumer templates; non-consumers
  // get `false` so the button stays hidden.
  const isListingConsumer = LISTING_CONSUMER_TEMPLATE_IDS.has(template.id);
  const listingProfileDirty = (() => {
    if (!isListingConsumer || !listingProfile.hydrated) return false;
    for (const k of LISTING_PROFILE_FIELDS) {
      if ((state[k] ?? "") !== listingProfile.settings[k]) return true;
    }
    const heroSrc = assets.heroPhoto?.src ?? "";
    if (heroSrc !== listingProfile.settings.heroPhoto) return true;
    return false;
  })();

  const handleSaveListingProfile = () => {
    const next: Partial<ListingProfile> = {};
    for (const k of LISTING_PROFILE_FIELDS) {
      next[k] = state[k] ?? "";
    }
    next.heroPhoto = assets.heroPhoto?.src ?? "";
    listingProfile.update(next);
  };

  // H-7.13: surface BrandColorsSection only after a template adopts the
  // brand-slot FieldDef shape. Pre-migration templates render colors
  // inline as before — `renderedFields` and `resolveBrandColors` both
  // short-circuit when `isMigrated` is false.
  const isMigrated = isMigratedTemplate(template);

  const timeline = useMemo(() => {
    // H-7.13: resolve brand-slot color fields first — empty state values
    // fall through to brand.primaryColor / brand.accentColor / FieldDef
    // default per audit §3.1. No-op for pre-migration templates.
    const resolvedState = resolveBrandColors(state, template, brandSettings);

    // H-7.8-2: listing-showcase reads agent name / brokerage / phone /
    // license / logo from the brand profile rather than from sidebar
    // form fields. Inject those values into build() inputs for that
    // template only — mirrors the four main tools' pattern (Listing
    // Flyer's template-mapping.ts does the same merge). Other templates
    // pass state + assets straight through unchanged.
    const buildState =
      template.id === "listing-showcase"
        ? {
            ...resolvedState,
            agentName: brandSettings.agentName || "",
            agentBrokerage: brandSettings.brokerage || "",
            agentPhone: brandSettings.contactPhone
              ? formatPhone(brandSettings.contactPhone)
              : "",
            agentLicense: brandSettings.licenseNumber || "",
          }
        : resolvedState;
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

  const renderedFields = useMemo(
    () => buildRenderedFields(template, isMigrated),
    [template, isMigrated]
  );

  const updateField = (key: string, value: string) => {
    setState((prev) => ({ ...prev, [key]: value }));
  };

  const updateAsset = (key: string, img: HTMLImageElement | null) => {
    setAssets((prev) => ({ ...prev, [key]: img }));
  };

  // H-7.13: per-field reset for brand slots lives inside BrandColorsSection.
  // The old global "Reset colors to brand defaults" toolbar button was
  // misleadingly named (it reset to template hardcoded defaults, not brand
  // colors) and has been removed; section-local Reset is the replacement.

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

            {/* H-7.13: migrated templates surface "Brand colors" at the top
                of the form (matches the pattern shared by Listing Flyer /
                OH Promo / Listing Presentation). The reset affordance lives
                inside that section. Pre-migration templates render colors
                inline below and have no bulk-reset control until they
                migrate. */}
            {isMigrated && (
              <BrandColorsSection
                slots={brandColorSlotsFor(template)}
                state={state}
                brand={brandSettings}
                updateField={updateField}
              />
            )}

            {/* H-7.12 (C.3): "Save changes to listing profile" appears
                only for listing-consumer templates AND only when the
                current template state diverges from the saved profile.
                Click commits the listing-profile fields + hero photo
                data URL to localStorage so the next listing-consumer
                template renders pre-populated. Sits above the form so
                it stays visible while the agent edits the listing
                fields below. */}
            {isListingConsumer && listingProfileDirty && (
              <button
                onClick={handleSaveListingProfile}
                className="w-full bg-[#4ef2d9]/10 hover:bg-[#4ef2d9]/20 border border-[#4ef2d9]/40 hover:border-[#4ef2d9] text-[#4ef2d9] rounded-md px-3 py-2 text-[11px] font-medium transition"
              >
                Save changes to listing profile
              </button>
            )}

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
                // objectList stores values JSON-stringified (mirrors stringList's
                // JSON-ish encoding trick) — the parsed array drives both the
                // "(n / max)" counter and the nested-card UI.
                const objectListItems =
                  field.type === "objectList"
                    ? parseObjectList(state[field.key] ?? "")
                    : null;
                const labelText =
                  field.type === "stringList" && field.max !== undefined
                    ? `${field.label} (${stringListItems!.length} / ${field.max})`
                    : field.type === "objectList" && field.max !== undefined
                    ? `${field.label} (${objectListItems!.length} / ${field.max})`
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
                    {field.type === "currency" && (
                      <CurrencyInput
                        value={state[field.key] ?? ""}
                        onChange={(v) => updateField(field.key, v)}
                      />
                    )}
                    {field.type === "number" && (
                      <NumberInput
                        value={state[field.key] ?? ""}
                        onChange={(v) => updateField(field.key, v)}
                      />
                    )}
                    {field.type === "phone" && (
                      <PhoneInput
                        value={state[field.key] ?? ""}
                        onChange={(v) => updateField(field.key, v)}
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
                    {field.type === "objectList" && field.schema && objectListItems && (
                      <ObjectListInput
                        fieldKey={field.key}
                        schema={field.schema}
                        max={field.max}
                        items={objectListItems}
                        onChange={(items) =>
                          updateField(field.key, JSON.stringify(items))
                        }
                        assets={assets}
                        updateAsset={updateAsset}
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

/**
 * Parse an `objectList` field's stored value (JSON-stringified array) into
 * a typed array. Invalid JSON or non-array shapes fall back to an empty
 * list so the editor never crashes on a corrupted state. Each item is
 * coerced to a plain Record<string, string> (image data is stored as the
 * empty string here — the actual HTMLImageElement lives in TemplateAssets
 * under the synthesized key `${fieldKey}.${index}.${innerField}`).
 */
function parseObjectList(raw: string): Array<Record<string, string>> {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map((it) =>
      it && typeof it === "object" && !Array.isArray(it)
        ? Object.fromEntries(
            Object.entries(it as Record<string, unknown>).map(([k, v]) => [
              k,
              typeof v === "string" ? v : String(v ?? ""),
            ])
          )
        : {}
    );
  } catch {
    return [];
  }
}

/**
 * Renders the stacked-card UI for an `objectList` field. Each list item
 * is a collapsible card with the schema's inner fields rendered as nested
 * inputs. Add/remove mirror the stringList interaction model from H-7.7.1.
 *
 * Image-asset key convention: `${fieldKey}.${index}.${innerFieldName}`.
 * Remove-item shifts trailing asset entries down by 1 to keep them aligned
 * with the post-splice items array (otherwise an image upload on item 2
 * would visually move to item 1's slot after item 0 is removed).
 *
 * The parent owns state; this component is purely a controlled-input
 * wrapper that calls onChange with the next items array on every edit.
 */
function ObjectListInput({
  fieldKey,
  schema,
  max,
  items,
  onChange,
  assets,
  updateAsset,
}: {
  fieldKey: string;
  schema: ObjectListSchema;
  max?: number;
  items: Array<Record<string, string>>;
  onChange: (next: Array<Record<string, string>>) => void;
  assets: TemplateAssets;
  updateAsset: (key: string, img: HTMLImageElement | null) => void;
}) {
  const canAdd = max === undefined || items.length < max;
  const schemaEntries = Object.entries(schema);
  const imageFieldNames = schemaEntries
    .filter(([, spec]) => spec.type === "image")
    .map(([name]) => name);

  const assetKey = (index: number, innerField: string) =>
    `${fieldKey}.${index}.${innerField}`;

  const updateItemField = (i: number, fieldName: string, value: string) => {
    const next = items.map((item, idx) =>
      idx === i ? { ...item, [fieldName]: value } : item
    );
    onChange(next);
  };

  const addItem = () => {
    const empty: Record<string, string> = {};
    for (const [name] of schemaEntries) empty[name] = "";
    onChange([...items, empty]);
  };

  const removeItem = (i: number) => {
    // Shift any image-asset entries past index i down by 1 so they
    // stay aligned with the post-splice items array.
    for (const imgField of imageFieldNames) {
      for (let j = i; j < items.length - 1; j++) {
        const fromKey = assetKey(j + 1, imgField);
        const toKey = assetKey(j, imgField);
        updateAsset(toKey, assets[fromKey] ?? null);
      }
      // Clear the now-orphaned tail slot.
      updateAsset(assetKey(items.length - 1, imgField), null);
    }
    onChange(items.filter((_, idx) => idx !== i));
  };

  return (
    <div className="space-y-3">
      {items.map((item, i) => (
        <div
          key={i}
          className="bg-neutral-900 border border-neutral-800 rounded-md p-3 space-y-3"
        >
          <div className="flex items-center justify-between">
            <span className="text-[10px] uppercase tracking-[0.15em] text-neutral-500">
              Item {i + 1}
            </span>
            <button
              type="button"
              onClick={() => removeItem(i)}
              className="text-xs text-neutral-500 hover:text-red-400 transition"
              aria-label="Remove item"
            >
              Remove
            </button>
          </div>
          {schemaEntries.map(([fieldName, spec]) => {
            const innerLabelText = spec.label;
            const innerValue = item[fieldName] ?? "";
            const inputClass =
              "w-full bg-neutral-950 border border-neutral-800 rounded-md px-3 py-2 text-base lg:text-sm focus:outline-none focus:border-[#4ef2d9]";
            return (
              <div key={fieldName}>
                <label className="block text-[10px] uppercase tracking-[0.15em] text-neutral-500 mb-1">
                  {innerLabelText}
                </label>
                {spec.type === "text" && (
                  <input
                    type="text"
                    value={innerValue}
                    onChange={(e) =>
                      updateItemField(i, fieldName, e.target.value)
                    }
                    placeholder={spec.placeholder}
                    maxLength={spec.max}
                    className={inputClass}
                  />
                )}
                {spec.type === "textarea" && (
                  <textarea
                    value={innerValue}
                    onChange={(e) =>
                      updateItemField(i, fieldName, e.target.value)
                    }
                    rows={2}
                    placeholder={spec.placeholder}
                    maxLength={spec.max}
                    className={`${inputClass} resize-none`}
                  />
                )}
                {spec.type === "image" && (
                  <ImageField
                    value={assets[assetKey(i, fieldName)] ?? null}
                    onChange={(img) =>
                      updateAsset(assetKey(i, fieldName), img)
                    }
                  />
                )}
                {spec.type === "currency" && (
                  <CurrencyInput
                    value={innerValue}
                    onChange={(v) => updateItemField(i, fieldName, v)}
                    placeholder={spec.placeholder}
                  />
                )}
                {spec.type === "number" && (
                  <NumberInput
                    value={innerValue}
                    onChange={(v) => updateItemField(i, fieldName, v)}
                    placeholder={spec.placeholder}
                  />
                )}
                {spec.type === "phone" && (
                  <PhoneInput
                    value={innerValue}
                    onChange={(v) => updateItemField(i, fieldName, v)}
                    placeholder={spec.placeholder}
                  />
                )}
              </div>
            );
          })}
        </div>
      ))}
      {canAdd && (
        <button
          type="button"
          onClick={addItem}
          className="w-full bg-neutral-900 border border-dashed border-neutral-700 hover:border-[#4ef2d9] rounded-md px-3 py-2 text-xs text-neutral-400 hover:text-neutral-200 transition"
        >
          + Add
        </button>
      )}
    </div>
  );
}

/**
 * Top-of-form brand-color section for migrated templates. Mirrors the
 * pattern shared by Listing Flyer / OH Promo / Listing Presentation
 * forms: a small grid of color pickers (Primary / Accent / Background,
 * plus the qa-card exception slot if present) with a "Reset to brand
 * defaults" affordance that only appears when any slot has been
 * overridden away from its FieldDef default.
 *
 * Empty slot values resolve through the brand profile (primary/accent)
 * or the FieldDef default (background, exceptions); the visible value
 * in the picker is always the resolved effective color so the swatch
 * never reads as missing. Editing the input writes the user's value as
 * an explicit override; clearing it (or clicking Reset) restores the
 * inherited default at the next render.
 */
function BrandColorsSection({
  slots,
  state,
  brand,
  updateField,
}: {
  slots: FieldDef[];
  state: TemplateState;
  brand: BrandSettings;
  updateField: (key: string, value: string) => void;
}) {
  const hasOverride = slots.some(
    (s) => state[s.key] !== undefined && state[s.key] !== s.default
  );
  const resetBrandColors = () => {
    for (const s of slots) updateField(s.key, s.default);
  };

  return (
    <div>
      <div className="flex items-baseline justify-between mb-2">
        <label className="block text-[10px] uppercase tracking-[0.15em] text-neutral-500">
          Brand colors
        </label>
        {hasOverride && (
          <button
            type="button"
            onClick={resetBrandColors}
            className="text-[10px] text-neutral-500 hover:text-[#4ef2d9] transition"
          >
            ↺ Reset to brand defaults
          </button>
        )}
      </div>
      {/* Mobile portrait can't fit 3 pickers in one row at 44pt swatch +
       * usable hex input each; wrap to 2 cols on <sm and a single row at
       * sm+. Mirrors FlyerForm / PromoForm / PresentationForm layout. */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {slots.map((slot) => {
          const effective = state[slot.key] || brandColorFor(slot, brand);
          return (
            <div key={slot.key}>
              <span className="block text-[9px] uppercase tracking-[0.12em] text-neutral-600 mb-1.5">
                {slot.label}
              </span>
              <div className="flex items-center gap-2">
                <label
                  className="relative block w-11 h-11 rounded border border-neutral-800 cursor-pointer overflow-hidden flex-shrink-0"
                  style={{ backgroundColor: effective || "#000000" }}
                >
                  <input
                    type="color"
                    value={effective || "#000000"}
                    onChange={(e) => updateField(slot.key, e.target.value)}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                  />
                </label>
                <input
                  type="text"
                  value={effective}
                  onChange={(e) => updateField(slot.key, e.target.value)}
                  className="flex-1 min-w-0 bg-neutral-900 border border-neutral-800 rounded-md px-2 py-1.5 text-base lg:text-xs font-mono focus:outline-none focus:border-[#4ef2d9]"
                />
              </div>
            </div>
          );
        })}
      </div>
      <p className="text-[10px] text-neutral-600 mt-2 leading-relaxed">
        Override colors for this template only — your brand profile in
        Settings is unchanged.
      </p>
    </div>
  );
}
