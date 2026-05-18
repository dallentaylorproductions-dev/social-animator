import type { WorkflowState } from '@/skills/types';

/**
 * Rule-based WorkflowState detection from localStorage. Phase 1 logic per
 * W-1 Half B audit section 7: no backend tracking, no AI, just deterministic
 * rules over the localStorage keys the 4 existing tools already use.
 *
 * Call from a useEffect — `window` access guarded for SSR safety.
 *
 * Storage keys (verified against current code):
 *   socanim_brand_settings           — src/lib/brand.ts
 *   socanim_listing_profile          — src/lib/listing-profile.ts
 *   listingFlyer:draft               — src/tools/listing-flyer/engine/draft-storage.ts
 *   openHousePromo:draft             — src/tools/open-house-promo/engine/draft-storage.ts
 *   listingPresentation:draft        — src/tools/listing-presentation/engine/draft-storage.ts
 *   sellerIntelligenceReport:draft   — src/tools/seller-intelligence-report/engine/draft-storage.ts
 *   openHousePrep:draft              — src/tools/open-house-prep/engine/draft-storage.ts
 */

function readJson<T>(key: string): T | null {
  if (typeof window === 'undefined' || !window.localStorage) return null;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

export function detectActiveStates(): WorkflowState[] {
  if (typeof window === 'undefined' || !window.localStorage) return [];

  const active: WorkflowState[] = [];

  const listingProfile = readJson<{ address?: string; status?: string }>(
    'socanim_listing_profile'
  );
  if (listingProfile?.address) {
    active.push('listing_launch_state');
    if (listingProfile.status === 'Just Sold') active.push('just_sold_state');
    if (listingProfile.status === 'Coming Soon') active.push('pre_listing_state');
  }

  const ohPromoDraft = readJson<{ eventDate?: string }>('openHousePromo:draft');
  if (ohPromoDraft?.eventDate) {
    const eventTs = new Date(ohPromoDraft.eventDate).getTime();
    if (Number.isFinite(eventTs)) {
      const diffDays = (eventTs - Date.now()) / (1000 * 60 * 60 * 24);
      if (diffDays >= 0 && diffDays < 30) {
        active.push('open_house_state');
        if (diffDays < 3) active.push('pre_event_state');
        if (diffDays < 1) active.push('event_today_state');
      }
    }
  }

  const presentationDraft = readJson<{ propertyAddress?: string }>(
    'listingPresentation:draft'
  );
  if (presentationDraft?.propertyAddress) {
    active.push('seller_appointment_state');
  }

  // SIR draft — seller appointment prep. Tracks the agent-facing companion
  // to Listing Presentation (audit-spec'd Workflow 5 surface).
  const sirDraft = readJson<{
    propertyAddress?: string;
    recommendedListPrice?: string;
    comps?: Array<{ address?: string; soldPrice?: string }>;
  }>('sellerIntelligenceReport:draft');
  if (sirDraft?.propertyAddress) {
    if (!active.includes('seller_appointment_state')) {
      active.push('seller_appointment_state');
    }
    // Mirror validateForExport: address + price + at least one comp with
    // address + soldPrice means the SIR is "done enough" and the agent
    // can transition to the conversion / next-step phase.
    const firstComp = sirDraft.comps?.[0];
    if (
      sirDraft.recommendedListPrice?.trim() &&
      firstComp?.address?.trim() &&
      firstComp?.soldPrice?.trim()
    ) {
      active.push('seller_conversion_state');
    }
  }

  // OH Prep draft — agent-facing prep doc + visitor handout for an
  // upcoming open house (Commit 6 wiring of the workflow audited in 1C).
  const ohPrepDraft = readJson<{
    propertyAddress?: string;
    eventDate?: string;
  }>('openHousePrep:draft');
  if (ohPrepDraft?.propertyAddress?.trim() && ohPrepDraft.eventDate?.trim()) {
    const eventTs = new Date(ohPrepDraft.eventDate).getTime();
    if (Number.isFinite(eventTs)) {
      const now = new Date();
      const todayStart = new Date(
        now.getFullYear(),
        now.getMonth(),
        now.getDate(),
      ).getTime();
      const todayEnd = todayStart + 24 * 60 * 60 * 1000;
      // Event today: between today's 00:00 and 23:59 local time.
      if (eventTs >= todayStart && eventTs < todayEnd) {
        active.push('open_house_active_state');
        active.push('open_house_prep_state');
      } else if (eventTs >= todayStart) {
        // Event still in the future (including today's-onward but after now).
        active.push('open_house_prep_state');
      }
    }
  }

  // Cadence-based states surface as always-on in Phase 1. Phase 2 will gate
  // these on "last action" timestamps once behavior tracking lands.
  active.push('visibility_gap_state');
  active.push('authority_building_state');

  return active;
}

/**
 * Whether the agent has completed minimum onboarding (brand profile with
 * agent name). The dashboard surfaces an empty-state CTA until this is true.
 */
export function hasBrandProfileConfigured(): boolean {
  const brand = readJson<{ agentName?: string }>('socanim_brand_settings');
  return Boolean(brand?.agentName?.trim());
}
