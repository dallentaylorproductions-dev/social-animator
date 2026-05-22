import type { CallableSkill } from "@/skills/types";

/**
 * Seller Presentation — skill record (v1.47 / A5a).
 *
 * The first SEP skill built directly on the converged substrate
 * (WorkflowInstance + SkillRuntime registry). Lands as a Base-tier
 * core workflow per A5a's pinned decisions; the runtime registration
 * lives at sibling module ./runtime.ts and self-registers on import
 * via the side-effect line in src/skills/registry.ts.
 *
 * Categorization: `'Seller pitch'` (existing bucket — no new
 * SkillCategory needed; the A5a prompt's `category: 'seller'` was a
 * label slip that doesn't match the type union, which only accepts
 * sentence-case display strings the dashboard renders verbatim).
 * Audit §5.8 explicitly recommended `'Seller pitch'`.
 *
 * Declared but NOT implemented in this lane (per A5a pin):
 *   - SELLER_PRESENTATION_AI_PLUG_POINTS — Lane C builds the photo-
 *     to-comp / address-autofill / copy-suggestion runtimes
 *   - SELLER_PRESENTATION_EMITS_EVENTS — the Event endpoint itself
 *     is separate scope; emission is a no-op until that lands
 *
 * These declarations live as SIBLING named exports rather than as
 * new fields on `CallableSkill` — same one-concern-per-commit rule
 * the A4 pin applied to `availability`: a declaration with no
 * consumer yet stays out of the shared `CallableSkill` shape until
 * the consumer exists. Lane C and the Event endpoint will import
 * these constants by name when they land.
 */

export const SELLER_PRESENTATION_SKILL: CallableSkill = {
  id: "seller-presentation",
  name: "Seller Presentation",
  purpose:
    "Build a listing presentation for a seller appointment. Agent prep plus a premium seller-facing page.",
  category: "Seller pitch",
  inputs: {
    required: [
      {
        key: "propertyAddress",
        type: "string",
        description: "Property address (from the shared listing profile)",
        source: "listing-profile",
      },
    ],
    optional: [
      // Step 1 — property pull-throughs from the listing profile
      {
        key: "propertyCity",
        type: "string",
        description: "City/state line",
        source: "listing-profile",
      },
      // Step 3 (A5b) — pricing & strategy
      {
        key: "recommendedPrice",
        type: "string",
        description: "Agent's recommended list price",
        source: "user-input",
      },
      {
        key: "priceRationale",
        type: "string",
        description:
          "Short public-safe rationale for the recommended price (≠ private pricingStrategyId/confidence)",
        source: "user-input",
      },
      {
        key: "pricingStrategyId",
        type: "enum",
        description: "Internal pricing-strategy framework id (private)",
        source: "user-input",
      },
      {
        key: "confidence",
        type: "enum",
        description: "Agent's confidence in the comp set (private)",
        source: "user-input",
      },
      // Step 2 (A5b) — comparable sales
      {
        key: "comps",
        type: "objectArray",
        description:
          "Comparable recent sales (≤4); supports Lane C's photo-to-comp plug-point",
        source: "user-input",
      },
      // Step 4 (A5b) — pitch points
      {
        key: "pitchPoints",
        type: "objectArray",
        description:
          "Selling-points with per-point visibility flag (public points appear on the published web page; private ones stay in the prep PDF)",
        source: "user-input",
      },
      // Step 5 (A5b) — review notes
      {
        key: "preAppointmentNotes",
        type: "string",
        description: "Agent's private pre-appointment notes (never published)",
        source: "user-input",
      },
      {
        key: "commitments",
        type: "stringArray",
        description: "What the agent commits to if the seller signs",
        source: "user-input",
      },
      {
        key: "asks",
        type: "stringArray",
        description: "What the agent needs from the seller",
        source: "user-input",
      },
      // Optional personalization
      {
        key: "clientId",
        type: "string",
        description:
          "Stable Client primitive id when the presentation is personalized",
        source: "user-input",
      },
      // Agent-profile pull-throughs (used by output renderers in A6)
      {
        key: "agentBio",
        type: "string",
        description: "Agent bio for credibility blocks",
        source: "agent-profile",
      },
      {
        key: "homesSold",
        type: "string",
        description: "Career homes sold (track-record stat)",
        source: "agent-profile",
      },
      {
        key: "averageDaysOnMarket",
        type: "string",
        description: "Average DOM (track-record stat)",
        source: "agent-profile",
      },
      {
        key: "saleToListRatio",
        type: "string",
        description: "Sale-to-list ratio (track-record stat)",
        source: "agent-profile",
      },
      // Color overrides (mirror SIR + OH Prep)
      {
        key: "primaryColor",
        type: "colorHex",
        description: "Primary brand color override",
        source: "agent-profile",
      },
      {
        key: "accentColor",
        type: "colorHex",
        description: "Accent brand color override",
        source: "agent-profile",
      },
      {
        key: "backgroundColor",
        type: "colorHex",
        description: "Background color override",
        source: "agent-profile",
      },
    ],
  },
  outputs: [
    // A6 wires the actual rendering; the contract is fixed here so the
    // skill record describes the full eventual surface.
    {
      type: "agent-facing",
      format: "pdf",
      description:
        "Private prep document for the listing appointment — full draft including private notes",
      aspectRatio: "letter",
    },
    {
      type: "client-facing",
      format: "url",
      description:
        "Premium mobile-first seller-facing web page (published via /h/[slug]); public-payload-allowlisted",
    },
  ],
  costProfile: "free",
  supportedStates: [
    "pre_listing_state",
    "seller_appointment_state",
    "seller_conversion_state",
  ],
  // Audit Q-3 recommendation A: after a presentation, the natural next
  // step is launching the listing. The 'listing-launch' workflow's
  // primary skill is currently `listing-flyer`, so point there directly.
  recommendedNextSkills: ["listing-flyer"],
};

// ---- AI plug-point declarations (Lane C consumes) ----

export type SellerPresentationPlugPointType =
  | "photo-to-comp"
  | "address-autofill"
  | "copy-suggestion";

export type SellerPresentationStepId =
  | "property"
  | "comps"
  | "strategy"
  | "pitch"
  | "review";

export interface SellerPresentationAiPlugPoint {
  /** Wizard step the plug-point hangs off of. */
  at: SellerPresentationStepId;
  type: SellerPresentationPlugPointType;
  /** Draft field the plug-point's accepted proposal writes into. */
  proposesTo: string;
  /** Whether the agent must review the proposal before it's accepted. v1 always true. */
  requiresReview: boolean;
  /** Comp field carrying per-cell confidence — only meaningful for photo-to-comp. */
  confidenceField?: "fieldConfidence";
  /** Human description of what the agent falls back to when the AI is unavailable. */
  fallbackBehavior: string;
}

export const SELLER_PRESENTATION_AI_PLUG_POINTS: SellerPresentationAiPlugPoint[] =
  [
    {
      at: "comps",
      type: "photo-to-comp",
      proposesTo: "comps",
      requiresReview: true,
      confidenceField: "fieldConfidence",
      fallbackBehavior: "manual comp entry",
    },
    {
      at: "property",
      type: "address-autofill",
      proposesTo: "property",
      requiresReview: true,
      fallbackBehavior: "manual property entry",
    },
    {
      at: "pitch",
      type: "copy-suggestion",
      proposesTo: "pitchPoints",
      requiresReview: true,
      fallbackBehavior: "agent writes own pitch",
    },
  ];

// ---- Event declarations (Event endpoint, separate scope) ----

export type SellerPresentationEvent =
  | "workflow_started"
  | "workflow_completed"
  | "page_published";

export const SELLER_PRESENTATION_EMITS_EVENTS: SellerPresentationEvent[] = [
  "workflow_started",
  "workflow_completed",
  "page_published",
];
