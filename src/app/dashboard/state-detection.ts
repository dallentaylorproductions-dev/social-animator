import type { WorkflowState } from '@/skills/types';

/**
 * Rule-based WorkflowState detection from localStorage. Phase 1 logic per
 * W-1 Half B audit section 7: no backend tracking, no AI, just deterministic
 * rules over the localStorage keys the 4 existing tools already use.
 *
 * Call from a useEffect — `window` access guarded for SSR safety.
 *
 * Storage keys (verified against current code):
 *   socanim_brand_settings        — src/lib/brand.ts
 *   socanim_listing_profile       — src/lib/listing-profile.ts
 *   listingFlyer:draft            — src/tools/listing-flyer/engine/draft-storage.ts
 *   openHousePromo:draft          — src/tools/open-house-promo/engine/draft-storage.ts
 *   listingPresentation:draft     — src/tools/listing-presentation/engine/draft-storage.ts
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
