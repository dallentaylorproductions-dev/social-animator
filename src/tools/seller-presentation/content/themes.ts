/**
 * Phase E — Seller Presentation theme catalog.
 *
 * Studio is the live default (the existing wizard appearance); Editorial
 * and Warm are locked Pro tiles per Phase 0 decision 7. The locked tiles
 * surface the upcoming Pro-tier template differentiation — Base/cohort
 * agents see + scrub them but the renderer falls back to Studio.
 *
 * `id` is what gets persisted on `SellerPresentationDraft.themeId`. The
 * empty/undefined case falls back to "studio" at render time. The id set
 * is the contract the consumer `/h/<slug>` page will eventually consume
 * (v1.48); keep stable.
 *
 * `colorHint` is a small visual chip (background + accent) the locked
 * tile renders so the agent gets a sense of the theme's mood before it
 * actually applies. NOT a literal preview — just a teaser swatch per
 * Phase 0 decision 4 ("name + color/type hint + lock + Pro badge").
 *
 * `typeHint` is one-word typography vibe: "neutral", "literary", "warm".
 */
export interface PresentationTheme {
  id: string;
  name: string;
  /** One short sentence describing the mood. */
  blurb: string;
  /** Background + accent pair for the picker chip. */
  colorHint: { bg: string; accent: string };
  /** One-word typography vibe. */
  typeHint: string;
  /** "live" today; "pro" gated until v1.48 Pro tier ships. */
  tier: "live" | "pro";
}

export const PRESENTATION_THEMES: ReadonlyArray<PresentationTheme> = [
  {
    id: "studio",
    name: "Studio",
    blurb: "The default — calm warm-dark with mint accents.",
    colorHint: { bg: "#1A1D1F", accent: "#A8C5B8" },
    typeHint: "neutral",
    tier: "live",
  },
  {
    id: "editorial",
    name: "Editorial",
    blurb: "Magazine-style serif with generous whitespace.",
    colorHint: { bg: "#F4F1EA", accent: "#222222" },
    typeHint: "literary",
    tier: "pro",
  },
  {
    id: "warm",
    name: "Warm",
    blurb: "Hand-set sans with muted clay palette.",
    colorHint: { bg: "#2A2220", accent: "#D4A37A" },
    typeHint: "warm",
    tier: "pro",
  },
];

export const DEFAULT_THEME_ID = "studio";

/** Resolve a persisted themeId to a renderable theme — falls back to Studio if the id is unknown OR the agent's tier can't access it. */
export function resolveActiveTheme(
  themeId: string | undefined,
  themeAccess:
    | "available"
    | "preview-only"
    | "upgrade-required"
    | "policy-locked"
    | "usage-capped"
    | null,
): PresentationTheme {
  const found = PRESENTATION_THEMES.find((t) => t.id === themeId);
  if (!found) return PRESENTATION_THEMES[0];
  // Pro-only themes fall back to Studio when the agent isn't Pro.
  if (found.tier === "pro" && themeAccess !== "available") {
    return PRESENTATION_THEMES[0];
  }
  return found;
}
