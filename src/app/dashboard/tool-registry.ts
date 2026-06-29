/**
 * Dashboard tool registry (DASHBOARD_HOME_V2, launch model).
 *
 * The single source the V2 dashboard renders from. Today's dashboard
 * decided what to show with hardcoded category filters + per-stage tile
 * orders (WIN_TILE_ORDER / LAUNCH_TILE_ORDER + getSkillsByCategory) and a
 * COHORT_LIVE_SKILLS "coming soon" gate. That made promoting a tool a
 * LAYOUT change. This registry makes it a DATA change: each tool declares
 * its availability MODE and presentation, and the dashboard renders each
 * mode in its correct treatment.
 *
 * This does NOT replace the skill registry (src/skills/registry.ts) — that
 * stays the source of truth for what a skill IS (routing, entitlements,
 * inputs/outputs). This registry is the dashboard's IA layer: how each
 * tool is FRAMED and WHERE it sits in the operating home. `id` matches a
 * CallableSkill id where one exists (so the poster + testid bind), except
 * `social-studio`, which is the aggregate flagship marquee, not a single
 * skill.
 *
 * Launch model (supersedes the earlier "Quick Outputs visible tier" plan):
 * the home surfaces exactly TWO tools — the Seller Presentation flagship and
 * Social Studio — and nothing else. Every other built tool (Listing
 * One-Pager, Listing Flyer, Open House Promo, Open House Prep, SIR, etc.) is
 * `hidden`: it keeps its registry record so a later anticipation-layer
 * moment can surface it with a single data flip, but it renders NO card, NO
 * "Coming soon" tile, NO graveyard.
 *
 * Availability MODES drive presentation (never greyed flagship cards):
 *   - active-flagship — the one prominent Seller Presentation card.
 *   - active-social   — the Social Studio secondary section.
 *   - hidden          — not surfaced; a data flip away from returning later.
 *
 * `tier` carries the pricing-ladder dimension so a later pass can surface
 * upgrade framing — captured in data ONLY here; renders NO paywall/upgrade
 * UI (dev_access cohort: no paid framing).
 */

export type ToolAvailability =
  | "active-flagship"
  | "active-social"
  | "hidden";

/** Pricing-ladder tier. Data-only in Pass 1 — no UI reads this yet. */
export type ToolTier = "base" | "pro" | "ai";

/**
 * Editorial section the tool belongs to. Preserves the v1.47 "Win the
 * listing / Launch the marketing / Stay visible" language; section
 * PLACEMENT in the render is driven by `availability`, while `category`
 * keeps the human framing for grouping + the later pricing ladder.
 */
export type ToolCategory =
  | "Win the listing"
  | "Launch the marketing"
  | "Stay visible";

export interface DashboardTool {
  /** Matches a CallableSkill id where one exists (poster + testid bind). */
  id: string;
  /** Job-reframed display name (e.g. "Listing Flyer Generator"). */
  name: string;
  category: ToolCategory;
  availability: ToolAvailability;
  /** Pricing-ladder dimension. Data-only in Pass 1; no UI surfaces it. */
  tier: ToolTier;
  /** Primary CTA label for the card (kept on hidden tools for the later flip). */
  primaryActionLabel: string;
  /** Where the primary CTA points. */
  primaryHref: string;
  /** Job-framed one-liner. */
  description: string;
}

/**
 * The canonical Seller Presentation entry point. Both the flagship's
 * "Create seller page" and the Today card's create CTA route here — the
 * same destination the v1.47 hero "Get started" used, so behavior is
 * unchanged: with the library on this is "Your pages" (create lives
 * there); with it off it's the wizard. "Open Your Pages" points at the
 * same canonical surface.
 */
export const SELLER_PRESENTATION_HREF = "/seller-presentation";

export const DASHBOARD_TOOLS: DashboardTool[] = [
  // ── Flagship ────────────────────────────────────────────────────────
  {
    id: "seller-presentation",
    name: "Seller Presentation",
    category: "Win the listing",
    availability: "active-flagship",
    tier: "base",
    primaryActionLabel: "Create seller page",
    primaryHref: SELLER_PRESENTATION_HREF,
    description:
      "Win the listing appointment with agent prep plus a premium seller-facing page.",
  },

  // ── Social Studio (the secondary "Stay visible" section) ────────────
  {
    id: "social-studio",
    name: "Social Studio",
    category: "Stay visible",
    availability: "active-social",
    tier: "base",
    primaryActionLabel: "Open studio",
    primaryHref: "/social-animator",
    description: "Stay visible with animated social templates. One studio, ten formats.",
  },

  // ── Hidden (built, NOT surfaced at launch) ──────────────────────────
  // These keep their records so a later anticipation-layer moment can flip
  // one to a surfaced mode with a data change. At launch they render
  // nothing: no card, no "Coming soon" tile, no graveyard.
  {
    id: "listing-presentation",
    name: "Listing Presentation One-Pager",
    category: "Win the listing",
    availability: "hidden",
    tier: "base",
    primaryActionLabel: "Create one-pager",
    primaryHref: "/listing-presentation",
    description: "A one-page leave-behind for the appointment.",
  },
  {
    id: "listing-flyer",
    name: "Listing Flyer Generator",
    category: "Launch the marketing",
    availability: "hidden",
    tier: "base",
    primaryActionLabel: "Create a listing flyer",
    primaryHref: "/listing-flyer",
    description: "Create a branded listing flyer in a minute.",
  },
  {
    id: "open-house-promo",
    name: "Open House Promo Generator",
    category: "Launch the marketing",
    availability: "hidden",
    tier: "base",
    primaryActionLabel: "Create open house promo",
    primaryHref: "/open-house-promo",
    description: "Create open house promo assets for the event.",
  },
  {
    id: "seller-intelligence-report",
    name: "Seller Intelligence Report",
    category: "Win the listing",
    availability: "hidden",
    tier: "pro",
    primaryActionLabel: "Open the report",
    primaryHref: "/seller-intelligence-report",
    description: "Deep market intel to back your pricing.",
  },
  {
    id: "open-house-prep",
    name: "Open House Prep",
    category: "Win the listing",
    availability: "hidden",
    tier: "base",
    primaryActionLabel: "Open house prep",
    primaryHref: "/open-house-prep",
    description: "Everything ready before the open house.",
  },
];

/** Every tool in a given availability mode, in declared order. */
export function toolsByAvailability(
  availability: ToolAvailability,
): DashboardTool[] {
  return DASHBOARD_TOOLS.filter((t) => t.availability === availability);
}

/** The single flagship tool (Seller Presentation), or null if undeclared. */
export function flagshipTool(): DashboardTool | null {
  return DASHBOARD_TOOLS.find((t) => t.availability === "active-flagship") ?? null;
}

/** The Social Studio "Stay visible" tool, or null if undeclared. */
export function socialTool(): DashboardTool | null {
  return DASHBOARD_TOOLS.find((t) => t.availability === "active-social") ?? null;
}

/** Built-but-not-surfaced tools, in declared order (render nothing at launch). */
export function hiddenTools(): DashboardTool[] {
  return toolsByAvailability("hidden");
}
