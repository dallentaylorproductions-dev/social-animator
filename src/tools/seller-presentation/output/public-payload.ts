/**
 * Public-payload serializer (Substrate §3.4, §4, v1.47 / A6).
 *
 * The privacy boundary for the Seller Presentation made code. The
 * publish route calls `toPublicPayload` and passes ONLY the returned
 * object to `publishHandout`; the raw `SellerPresentationDraft`
 * NEVER reaches KV. This closes Risk R-1 (the OH Prep publish path
 * spreads the full draft into KV — see audit §3) by construction:
 * a private field can't leak if it doesn't enter the persistence
 * path.
 *
 * Allowlist per audit §6 — exactly these fields, nothing else:
 *
 *   propertyAddress       — from draft.propertyAddress
 *   recommendedPrice      — from draft.recommendedPrice
 *   priceRationale        — from draft.priceRationale (agent's voice;
 *                           distinct from PRIVATE pricingStrategyId +
 *                           confidence)
 *   comps.public[]        — projection of draft.comps that DROPS
 *                           notes, source, fieldConfidence
 *   agentBranding         — subset of agentContact passed by the
 *                           publish route from useBrandSettings
 *   pitchPublicPoints[]   — projection of draft.pitchPoints filtered
 *                           by visibility === 'public', mapped to .text
 *
 * Explicitly NEVER allowlisted (proven by the spec):
 *   - draft.pricingStrategyId, draft.confidence (StepStrategy private half)
 *   - draft.preAppointmentNotes, draft.commitments, draft.asks
 *     (declared but currently inhabited by A5b stubs only; A5b's
 *     wizard doesn't surface them yet — the audit lists them as
 *     private and the serializer pre-emptively excludes them)
 *   - draft.themeId (A7 — concerns the renderer's theme choice, not
 *     anything published)
 *   - draft.clientId (a stable id reference; the personalization
 *     itself shows up via the address / public pitch points)
 *   - comps[].notes / source / fieldConfidence (per-comp private)
 *   - any pitch point with visibility !== 'public'
 *
 * Construction style: build the result object explicitly, field by
 * field. Never spread the draft. The TypeScript compiler is the
 * first line of defense — `PublicPayload` doesn't allow private
 * keys; the spec in e2e/seller-presentation.publish-allowlist.spec.ts
 * is the second.
 *
 * Pure function — no I/O, no React, no `window`. Lives outside the
 * "use client" graph so the publish route can import it server-side
 * without dragging react-pdf or any browser-only dep.
 */

import type { Comp, SellerPresentationDraft } from "../engine/types";

/**
 * Agent-contact projection passed by the publish route (which sources
 * it from `useBrandSettings` at the client). Note: A5b's StepReview
 * also has access to `logoDataUrl` / colors on BrandSettings, but the
 * v1 functional consumer page doesn't render branding chrome beyond
 * agent name + brokerage + license + contact CTAs. A7's premium-themed
 * renderer can extend `AgentBranding` with logo/color refs then.
 */
export interface AgentBranding {
  name?: string;
  brokerage?: string;
  phone?: string;
  email?: string;
  licenseNumber?: string;
}

/** Public projection of a comp — strict subset of `Comp`'s fields. */
export interface PublicComp {
  address: string;
  soldPrice: string;
  daysOnMarket?: string;
  saleToListPercent?: string;
  squareFeet?: string;
  distanceMiles?: string;
  soldDate?: string;
  // Intentionally absent: notes, source, fieldConfidence.
}

export interface PublicPayload {
  propertyAddress: string;
  propertyCity?: string;
  recommendedPrice: string;
  priceRationale?: string;
  comps: PublicComp[];
  agentBranding: AgentBranding;
  pitchPublicPoints: string[];
}

/**
 * Build the PUBLIC projection of a comp. Explicitly enumerates the
 * fields that go out; everything not listed here (notes, source,
 * fieldConfidence) is dropped. If a private field is added to `Comp`
 * in the future, it stays private by default — only an edit to this
 * function (and the corresponding spec assertion) opens the gate.
 */
function projectComp(comp: Comp): PublicComp {
  return {
    address: comp.address,
    soldPrice: comp.soldPrice,
    daysOnMarket: comp.daysOnMarket,
    saleToListPercent: comp.saleToListPercent,
    squareFeet: comp.squareFeet,
    distanceMiles: comp.distanceMiles,
    soldDate: comp.soldDate,
  };
}

/**
 * Build the public payload from a raw draft + the agent's contact
 * card. Pure — same draft + agentContact in always produces the
 * same payload out.
 */
export function toPublicPayload(
  draft: SellerPresentationDraft,
  agentContact: AgentBranding,
): PublicPayload {
  return {
    propertyAddress: draft.propertyAddress ?? "",
    propertyCity: draft.propertyCity,
    recommendedPrice: draft.recommendedPrice ?? "",
    priceRationale: draft.priceRationale,
    comps: draft.comps.map(projectComp),
    agentBranding: {
      name: agentContact.name,
      brokerage: agentContact.brokerage,
      phone: agentContact.phone,
      email: agentContact.email,
      licenseNumber: agentContact.licenseNumber,
    },
    pitchPublicPoints: draft.pitchPoints
      .filter((p) => p.visibility === "public")
      .map((p) => p.text),
  };
}

/**
 * Defense-at-boundary helper for the consumer page renderer. When
 * `/h/[slug]` loads a HandoutRecord whose `data` was serialized by
 * `toPublicPayload`, the renderer calls `clampPublicPayload` to
 * coerce the unknown JSON into a typed shape. Any rogue keys (e.g.
 * if a record was hand-edited in KV with private fields glued on)
 * are silently dropped — the renderer never sees them.
 */
export function clampPublicPayload(raw: unknown): PublicPayload {
  if (!raw || typeof raw !== "object") {
    return {
      propertyAddress: "",
      recommendedPrice: "",
      comps: [],
      agentBranding: {},
      pitchPublicPoints: [],
    };
  }
  const r = raw as Record<string, unknown>;
  return {
    propertyAddress: typeof r.propertyAddress === "string" ? r.propertyAddress : "",
    propertyCity: typeof r.propertyCity === "string" ? r.propertyCity : undefined,
    recommendedPrice:
      typeof r.recommendedPrice === "string" ? r.recommendedPrice : "",
    priceRationale:
      typeof r.priceRationale === "string" ? r.priceRationale : undefined,
    comps: Array.isArray(r.comps)
      ? r.comps.map(clampPublicComp).filter((c): c is PublicComp => c !== null)
      : [],
    agentBranding: clampAgentBranding(r.agentBranding),
    pitchPublicPoints: Array.isArray(r.pitchPublicPoints)
      ? r.pitchPublicPoints.filter((t): t is string => typeof t === "string")
      : [],
  };
}

function clampPublicComp(raw: unknown): PublicComp | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.address !== "string" || typeof r.soldPrice !== "string") {
    return null;
  }
  return {
    address: r.address,
    soldPrice: r.soldPrice,
    daysOnMarket:
      typeof r.daysOnMarket === "string" ? r.daysOnMarket : undefined,
    saleToListPercent:
      typeof r.saleToListPercent === "string" ? r.saleToListPercent : undefined,
    squareFeet:
      typeof r.squareFeet === "string" ? r.squareFeet : undefined,
    distanceMiles:
      typeof r.distanceMiles === "string" ? r.distanceMiles : undefined,
    soldDate: typeof r.soldDate === "string" ? r.soldDate : undefined,
  };
}

function clampAgentBranding(raw: unknown): AgentBranding {
  if (!raw || typeof raw !== "object") return {};
  const r = raw as Record<string, unknown>;
  return {
    name: typeof r.name === "string" ? r.name : undefined,
    brokerage: typeof r.brokerage === "string" ? r.brokerage : undefined,
    phone: typeof r.phone === "string" ? r.phone : undefined,
    email: typeof r.email === "string" ? r.email : undefined,
    licenseNumber:
      typeof r.licenseNumber === "string" ? r.licenseNumber : undefined,
  };
}
