import type { GateStateClient } from "../components/SPEntitlementContext";

/**
 * Phase E / E.1 — Seller Presentation theme catalog.
 *
 * Editorial is the live default — the only template actually built, and
 * the look the production `/h/<slug>` page already renders (cream canvas
 * + serif + terracotta accent). Studio and Warm are "coming soon": they
 * don't exist as templates yet, so they surface a neutral "Coming soon"
 * badge (NOT a "Pro/unlock" paywall, which would overpromise — the
 * truthful-copy rule governs). Per Claude Design source-of-truth
 * (README-8612947f) surfaced 2026-06-03, superseding the original
 * Phase 0 §1b#7 placeholder of "Studio live / Editorial+Warm Pro-locked".
 *
 * `id` is what gets persisted on `SellerPresentationDraft.themeId`. The
 * empty/undefined case falls back to DEFAULT_THEME_ID ("editorial") at
 * render time. The id set is the contract the consumer `/h/<slug>` page
 * will eventually consume (v1.48); keep stable.
 *
 * `colorHint` is a small visual chip (background + accent) the picker
 * tile renders so the agent gets a sense of the theme's mood. Values
 * track the Claude Design `THEMES` tokens. NOT a literal preview — the
 * token-driven live MiniPage preview lands in Phase E.2.
 *
 * `typeHint` is one-word typography vibe: "neutral", "literary", "warm".
 *
 * `tier`: "live" = built + selectable; "soon" = not built yet (Coming
 * soon); "pro" = reserved for v1.48 when a theme becomes a paid upsell.
 * When a "soon" template ships, flip it to "live" (free) or "pro" (paid)
 * — a one-field change.
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
  /** "live" = built + selectable; "soon" = not built yet; "pro" = future paid upsell (v1.48). */
  tier: "live" | "soon" | "pro";
}

export const PRESENTATION_THEMES: ReadonlyArray<PresentationTheme> = [
  {
    id: "editorial",
    name: "Editorial",
    blurb: "Magazine-style serif with generous whitespace.",
    colorHint: { bg: "#f4efe5", accent: "#bf512c" },
    typeHint: "literary",
    tier: "live",
  },
  {
    id: "studio",
    name: "Studio",
    blurb: "Calm warm-dark with mint accents. Modern and confident.",
    colorHint: { bg: "#0e0d0c", accent: "#6ee7c7" },
    typeHint: "neutral",
    tier: "soon",
  },
  {
    id: "warm",
    name: "Warm",
    blurb: "Hand-set sans with a muted clay palette.",
    colorHint: { bg: "#e9dccd", accent: "#b0654a" },
    typeHint: "warm",
    tier: "soon",
  },
];

export const DEFAULT_THEME_ID = "editorial";

/** Resolve a persisted themeId to a renderable theme — falls back to the live default (Editorial) if the id is unknown, the theme isn't built yet ("soon"), OR it's a Pro theme the agent's tier can't access. */
export function resolveActiveTheme(
  themeId: string | undefined,
  themeAccess: GateStateClient | null,
): PresentationTheme {
  const liveDefault = PRESENTATION_THEMES.find((t) => t.id === DEFAULT_THEME_ID)!;
  const found = PRESENTATION_THEMES.find((t) => t.id === themeId);
  if (!found) return liveDefault;
  // Coming-soon themes don't render yet — fall back to the live default.
  if (found.tier === "soon") return liveDefault;
  // Future v1.48 path: Pro-tier themes fall back to the live default when
  // the agent isn't Pro.
  if (found.tier === "pro" && themeAccess !== "available") return liveDefault;
  return found;
}
