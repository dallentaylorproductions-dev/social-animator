import type { BrandSettings } from "@/lib/brand";
import type {
  FieldDef,
  TemplateConfig,
  TemplateState,
} from "./types";

/**
 * H-7.13 brand-slot helpers shared between TemplateEditor (which renders
 * the sidebar's BrandColorsSection) and TemplatePreview (the picker-page
 * looping thumbnails). Both surfaces resolve brand-slot color fields
 * identically so the preview matches what the editor would render.
 *
 * The slot set is closed; unrelated color fields stay inline / unresolved.
 */
export const BRAND_SLOT_KEYS = new Set([
  "primary",
  "accent",
  "background",
  // qa-card exception (audit §4.6): question/answer panel pairing is a
  // signature design element that doesn't map cleanly to brand primary/
  // accent, so question panel surfaces as a 4th slot on qa-card.
  "questionPanel",
]);

/**
 * H-7.13-6: third-tier hardcoded fallback. Protects any preview surface
 * that fails to thread brand context (the picker page was the regression
 * that surfaced this need — previews built with state.primary === ""
 * left fillStyle invalid, so canvas ignored the assignment and the
 * thumbnail rendered gray). Values mirror DEFAULT_BRAND in
 * src/lib/brand.ts so the floor matches what an unconfigured-brand
 * user already sees through the brand-profile fallback.
 */
const FALLBACK_PRIMARY = "#4ef2d9";
const FALLBACK_ACCENT = "#ffffff";

export function brandColorSlotsFor(template: TemplateConfig): FieldDef[] {
  return template.fields.filter(
    (f) => f.type === "color" && BRAND_SLOT_KEYS.has(f.key)
  );
}

/**
 * A template is considered migrated to the H-7.13 brand-slot pattern once
 * it declares `primary` or `accent` color fields. Pre-migration templates
 * bypass the brand inheritance layer.
 */
export function isMigratedTemplate(template: TemplateConfig): boolean {
  return template.fields.some(
    (f) => f.key === "primary" || f.key === "accent"
  );
}

/**
 * Resolve the effective fallback color for a brand slot. Primary + accent
 * pull from the brand profile, then the FieldDef default, then the
 * universal hardcoded floor. Background and exception slots use the
 * FieldDef default only (per audit §3.3 — no brand.background in the
 * Social Animator chain).
 */
export function brandColorFor(slot: FieldDef, brand: BrandSettings): string {
  if (slot.key === "primary")
    return brand.primaryColor || slot.default || FALLBACK_PRIMARY;
  if (slot.key === "accent")
    return brand.accentColor || slot.default || FALLBACK_ACCENT;
  return slot.default;
}

/**
 * Build the resolved state passed to template.build(). For migrated
 * templates, empty brand-slot values fall through to the brand profile
 * (primary/accent) or to the FieldDef default (background, exceptions).
 * Non-empty values are user overrides and pass through unchanged. No-op
 * for pre-migration templates (returns the input state unchanged).
 */
export function resolveBrandColors(
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
