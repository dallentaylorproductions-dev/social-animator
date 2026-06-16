/**
 * Open House Prep — public-payload serializer (data-minimization fix).
 *
 * The privacy boundary for the visitor handout. The publish route calls
 * `toPublicHandoutData` and passes ONLY the returned object to
 * `publishHandout`; the raw `OpenHousePrepDraft` NEVER reaches the public
 * KV record. (Found by the v1.47 A1 audit / memory
 * `sep-ohprep-publish-data-minimization-gap`: the route used to spread
 * `{ ...draft, agentContact }` into `data`, leaving agent-only fields such
 * as `preEventNotes` sitting in the public record at rest even though the
 * visitor HTML never rendered them.)
 *
 * Mirrors the Seller Presentation's `toPublicPayload` boundary
 * (src/tools/seller-presentation/output/public-payload.ts) — the SP route
 * is explicitly the template this cleanup follows.
 *
 * Allowlist guarantee: every field is built by EXPLICIT field-by-field
 * projection — never a spread. Per memory
 * `sep-allowlist-serializer-test-construction`, spreading leaks any
 * tampered/extra nested fields, so each field is projected deliberately.
 * The boundary is used at BOTH ends: `toPublicHandoutData` at publish, and
 * `clampPublicHandoutData` at read (so an old/over-broad KV record can't
 * surface private fields either).
 *
 * The public field set is exactly what the visitor surfaces render — the
 * web handout (handout-page.tsx), the visitor PDF (OpenHouseHandoutPdf in
 * pdf-export.tsx), and the OG card (og-image.tsx). Agent-only fields
 * (talking points, common questions, conversion prompts, pre-event notes,
 * follow-up commitments, the v2 `dataSource` provenance, the brand color
 * overrides) are dropped — they live only on the agent side.
 */

import type { NeighborhoodFact, OpenHousePrepDraft } from '../engine/types';

/**
 * Public projection of the agent's contact card. Sourced from the agent's
 * BrandSettings by the publish route; these are the only agent fields the
 * visitor handout's "Your agent" section renders.
 */
export interface PublicAgentContact {
  name?: string;
  brokerage?: string;
  phone?: string;
  email?: string;
  licenseNumber?: string;
}

/**
 * Public projection of a comp — exactly the keys the visitor handout
 * (Section 3) and the visitor PDF render: address, soldPrice, plus the
 * optional stat columns and the agent's per-comp commentary `notes`
 * (rendered to visitors in the OH design, so it is public here — unlike
 * SP, where comp notes stay private). Everything else on the shared `Comp`
 * primitive (source, fieldConfidence, counted, yearBuilt, photo /
 * Street-View data) is agent-only / v2 and stays out of the public record.
 */
export interface PublicComp {
  address: string;
  soldPrice: string;
  daysOnMarket?: string;
  saleToListPercent?: string;
  squareFeet?: string;
  distanceMiles?: string;
  soldDate?: string;
  notes?: string;
}

/**
 * The PUBLIC, at-rest shape stored in KV for an open-house handout. Field
 * names mirror the draft so the existing renderers (which read the record
 * as a `Partial<OpenHousePrepDraft>`) keep working byte-for-byte — the only
 * change is that private fields are no longer present in the record.
 */
export interface OpenHouseHandoutPublicData {
  propertyAddress: string;
  propertyCity?: string;
  propertyPhotoUrl?: string;
  listPrice: string;
  beds?: string;
  baths?: string;
  squareFeet?: string;
  eventDate: string;
  eventStartTime?: string;
  eventEndTime?: string;
  positioningNarrative?: string;
  comps: PublicComp[];
  neighborhoodFacts: NeighborhoodFact[];
  marketContext?: string;
  /** Absent when the source carried no agent block — the reader applies its
   *  own ownerEmail fallback, exactly as before. */
  agentContact?: PublicAgentContact;
}

/** Trim-tolerant string read: returns the string only when it IS a string. */
function str(v: unknown): string | undefined {
  return typeof v === 'string' ? v : undefined;
}

/** OH Prep keeps at most 4 comps (mirror of clampDraft). */
const COMP_CAP = 4;
/** OH Prep keeps at most 6 neighborhood facts (mirror of clampDraft). */
const NEIGHBORHOOD_FACT_CAP = 6;

/**
 * Project ONE comp field-by-field. Address + soldPrice always emit (coerced
 * to "" when absent, so the renderer's `value || '—'` fallback is
 * byte-identical to today); every optional stat / the notes line is added
 * ONLY when it is a string, so a private sibling (source, fieldConfidence,
 * counted, yearBuilt, photoUrl, Street-View aiming) can never ride through.
 * Used at BOTH the write and read boundary.
 */
function projectComp(raw: unknown): PublicComp {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const out: PublicComp = {
    address: str(r.address) ?? '',
    soldPrice: str(r.soldPrice) ?? '',
  };
  const daysOnMarket = str(r.daysOnMarket);
  if (daysOnMarket !== undefined) out.daysOnMarket = daysOnMarket;
  const saleToListPercent = str(r.saleToListPercent);
  if (saleToListPercent !== undefined) out.saleToListPercent = saleToListPercent;
  const squareFeet = str(r.squareFeet);
  if (squareFeet !== undefined) out.squareFeet = squareFeet;
  const distanceMiles = str(r.distanceMiles);
  if (distanceMiles !== undefined) out.distanceMiles = distanceMiles;
  const soldDate = str(r.soldDate);
  if (soldDate !== undefined) out.soldDate = soldDate;
  const notes = str(r.notes);
  if (notes !== undefined) out.notes = notes;
  return out;
}

/** Project the comp array, capped at COMP_CAP. */
function projectComps(raw: unknown): PublicComp[] {
  if (!Array.isArray(raw)) return [];
  return raw.slice(0, COMP_CAP).map(projectComp);
}

/**
 * Project ONE neighborhood fact — drops a row that lacks a string
 * label/value (matches clampDraft's filter), so the public record carries
 * only renderable rows. Used at both boundaries.
 */
function projectNeighborhoodFact(raw: unknown): NeighborhoodFact | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.label !== 'string' || typeof r.value !== 'string') return null;
  return { label: r.label, value: r.value };
}

/** Project the neighborhood-facts array, capped at NEIGHBORHOOD_FACT_CAP. */
function projectNeighborhoodFacts(raw: unknown): NeighborhoodFact[] {
  if (!Array.isArray(raw)) return [];
  const out: NeighborhoodFact[] = [];
  for (const item of raw) {
    if (out.length >= NEIGHBORHOOD_FACT_CAP) break;
    const fact = projectNeighborhoodFact(item);
    if (fact) out.push(fact);
  }
  return out;
}

/**
 * Project the agent-contact card field-by-field — never a spread, so a
 * rogue/private field on a tampered contact object can't leak into the
 * public record. Returns undefined when there is no contact object at all
 * (the reader then applies its ownerEmail fallback, as before).
 */
function projectAgentContact(raw: unknown): PublicAgentContact | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const r = raw as Record<string, unknown>;
  return {
    name: str(r.name),
    brokerage: str(r.brokerage),
    phone: str(r.phone),
    email: str(r.email),
    licenseNumber: str(r.licenseNumber),
  };
}

/**
 * The shared allowlist core. Both entrypoints funnel through this so the
 * write-time projection and the read-time clamp produce an IDENTICAL shape
 * — a field is public iff it is enumerated here.
 */
function buildPublicData(
  rawDraft: Record<string, unknown>,
  rawAgent: unknown,
): OpenHouseHandoutPublicData {
  const out: OpenHouseHandoutPublicData = {
    propertyAddress: str(rawDraft.propertyAddress) ?? '',
    listPrice: str(rawDraft.listPrice) ?? '',
    eventDate: str(rawDraft.eventDate) ?? '',
    comps: projectComps(rawDraft.comps),
    neighborhoodFacts: projectNeighborhoodFacts(rawDraft.neighborhoodFacts),
  };
  const propertyCity = str(rawDraft.propertyCity);
  if (propertyCity !== undefined) out.propertyCity = propertyCity;
  const propertyPhotoUrl = str(rawDraft.propertyPhotoUrl);
  if (propertyPhotoUrl !== undefined) out.propertyPhotoUrl = propertyPhotoUrl;
  const beds = str(rawDraft.beds);
  if (beds !== undefined) out.beds = beds;
  const baths = str(rawDraft.baths);
  if (baths !== undefined) out.baths = baths;
  const squareFeet = str(rawDraft.squareFeet);
  if (squareFeet !== undefined) out.squareFeet = squareFeet;
  const eventStartTime = str(rawDraft.eventStartTime);
  if (eventStartTime !== undefined) out.eventStartTime = eventStartTime;
  const eventEndTime = str(rawDraft.eventEndTime);
  if (eventEndTime !== undefined) out.eventEndTime = eventEndTime;
  const positioningNarrative = str(rawDraft.positioningNarrative);
  if (positioningNarrative !== undefined) out.positioningNarrative = positioningNarrative;
  const marketContext = str(rawDraft.marketContext);
  if (marketContext !== undefined) out.marketContext = marketContext;

  const agentContact = projectAgentContact(rawAgent);
  if (agentContact !== undefined) out.agentContact = agentContact;
  return out;
}

/**
 * Build the PUBLIC handout payload from an agent's draft + contact card.
 * Pure — same inputs always produce the same payload. ONLY this object is
 * written to the public KV record; the agent-only fields on `draft`
 * (preEventNotes, talking points, questions, prompts, follow-up
 * commitments, dataSource, brand color overrides) are dropped here and
 * never persist publicly.
 */
export function toPublicHandoutData(
  draft: OpenHousePrepDraft,
  agentContact: PublicAgentContact,
): OpenHouseHandoutPublicData {
  return buildPublicData(
    draft as unknown as Record<string, unknown>,
    agentContact,
  );
}

/**
 * Defense-at-boundary clamp for the visitor-facing reader. When `/h/[slug]`
 * (and the OG route) load a HandoutRecord whose `data` was written by
 * `toPublicHandoutData`, the reader calls this to coerce the unknown JSON
 * into the public shape. Re-runs the SAME allowlist as the projector, so a
 * hand-edited / pre-fix KV record that still carries `preEventNotes` (or any
 * other private field) has it dropped before it can reach the renderer or be
 * serialized to the client.
 */
export function clampPublicHandoutData(raw: unknown): OpenHouseHandoutPublicData {
  if (!raw || typeof raw !== 'object') {
    return { propertyAddress: '', listPrice: '', eventDate: '', comps: [], neighborhoodFacts: [] };
  }
  const r = raw as Record<string, unknown>;
  return buildPublicData(r, r.agentContact);
}
