"use client";

/**
 * Account-scoped client-cache isolation (v1.6x auth fix).
 *
 * Identity is the authenticated email. Server accounts are correctly
 * per-email (`brand:<email>` in KV), but the CLIENT cache (localStorage) was
 * never scoped to the signed-in agent: sign-out cleared only the session
 * cookie, so per-account blobs (brand, listing, drafts, onboarding markers)
 * persisted and the dashboard rendered them for whoever signed in next —
 * leaking the prior agent's name/listing/draft and, worse, letting the
 * Phase-2 brand migration push a prior agent's brand UP into a fresh
 * account's empty server record on a shared device.
 *
 * The fix is "clear on account CHANGE", not "clear on sign-out":
 *   - We stamp the authenticated owner email (`socanim_owner_email`).
 *   - On every authenticated client entry (dashboard load + beta-code
 *     sign-in success), `reconcileAccountOwnership(email)` compares the
 *     stamp to the authenticated email. A MISMATCH means a different agent
 *     is now signed in on this browser → wipe the per-account keys before
 *     anything hydrates, then re-stamp.
 *
 * Why NOT clear on sign-out: several per-account keys are localStorage-ONLY
 * (listing profile, clients, the per-tool drafts, saved template colors).
 * Clearing them on sign-out would destroy the legitimate single user's
 * in-progress work on a normal sign-out→sign-in-as-themselves round-trip
 * (the data-loss stop condition in the packet). Clearing on account-CHANGE
 * instead is strictly safer AND more robust — it also catches a reused
 * incognito window, an expired session, and "switch account while signed
 * in", none of which fire a sign-out event. A same-email round-trip never
 * mismatches, so that agent's local-only data survives and the server-backed
 * data (brand) rehydrates server-wins.
 */

/**
 * The stamp recording which email this browser's per-account cache belongs
 * to. App-global (one per browser), NOT itself account content — managed by
 * the reconcile/stamp helpers, never cleared by `clearAccountScopedStorage`.
 */
const OWNER_STAMP_KEY = "socanim_owner_email";

/**
 * Exact per-account keys to wipe on an account change. Each holds content or
 * an advisory marker scoped to a single agent. Kept in sync with every
 * `localStorage.setItem` site that writes per-user data:
 *   - socanim_brand_settings            (src/lib/brand.ts — server-backed)
 *   - socanim_listing_profile           (src/lib/listing-profile.ts — LOCAL-ONLY)
 *   - socanim_clients                   (src/lib/client-profile.ts — LOCAL-ONLY)
 *   - socanim_onboarding_*              (src/lib/onboarding/seen.ts — advisory)
 *   - socanim_studio_setup             (src/lib/studio-profile/setup-storage.ts — crash-safety buffer)
 *   - workflowInstance:index            (the draft index; records swept by prefix)
 *   - sep-pages-order                   (cache of THIS agent's page order)
 *   - <tool>:draft                      (per-tool in-progress drafts — LOCAL-ONLY)
 *
 * Deliberately NOT included (app-global UI preference, no account content):
 *   - sep-library-view-mode             (grid/list toggle)
 */
const ACCOUNT_SCOPED_KEYS: readonly string[] = [
  "socanim_brand_settings",
  "socanim_listing_profile",
  "socanim_clients",
  "socanim_onboarding_seen",
  "socanim_onboarding_sample_walked",
  "socanim_onboarding_path_a_complete",
  "socanim_studio_setup",
  "workflowInstance:index",
  "sep-pages-order",
  "listingFlyer:draft",
  "listingPresentation:draft",
  "openHousePrep:draft",
  "openHousePromo:draft",
  "sellerIntelligenceReport:draft",
];

/**
 * Per-account key PREFIXES — every key starting with one of these is wiped.
 * These are multi-record stores (one key per record), so they can't be
 * enumerated as fixed strings:
 *   - workflowInstance:<id>   (one key per converged draft record)
 *   - socanim_colors_<id>     (one key per template's saved colors)
 */
const ACCOUNT_SCOPED_PREFIXES: readonly string[] = [
  "workflowInstance:",
  "socanim_colors_",
];

function hasStorage(): boolean {
  return typeof window !== "undefined" && !!window.localStorage;
}

function normalizeEmail(email: string | null | undefined): string | null {
  if (typeof email !== "string") return null;
  const trimmed = email.trim().toLowerCase();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * Read the brand blob's embedded owner stamp without importing the (heavier)
 * brand module. Used only as a corroborating "different agent" signal during
 * the one-time transition before the global stamp exists.
 */
function readBrandOwnerEmail(): string | null {
  if (!hasStorage()) return null;
  try {
    const raw = window.localStorage.getItem("socanim_brand_settings");
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { ownerEmail?: unknown };
    return normalizeEmail(
      typeof parsed.ownerEmail === "string" ? parsed.ownerEmail : null,
    );
  } catch {
    return null;
  }
}

/** The email this browser's cache is stamped to, or null if unstamped. */
export function readOwnerStamp(): string | null {
  if (!hasStorage()) return null;
  try {
    return normalizeEmail(window.localStorage.getItem(OWNER_STAMP_KEY));
  } catch {
    return null;
  }
}

/** Stamp the browser's cache as belonging to `email` (lowercased). No-op off-browser. */
export function stampOwner(email: string): void {
  const normalized = normalizeEmail(email);
  if (!normalized || !hasStorage()) return;
  try {
    window.localStorage.setItem(OWNER_STAMP_KEY, normalized);
  } catch {
    // storage disabled / full — reconcile degrades to re-clearing next time.
  }
}

/**
 * Remove every per-account key (exact + prefixed). Scoped: never a blanket
 * `localStorage.clear()`, so unrelated/app-global state (UI prefs, the owner
 * stamp, the PWA cache) survives. The owner stamp is managed separately by
 * the caller (reconcile re-stamps immediately after).
 */
export function clearAccountScopedStorage(): void {
  if (!hasStorage()) return;
  try {
    const store = window.localStorage;
    // Collect prefixed keys first — removing while iterating `key(i)` would
    // shift indices.
    const toRemove = new Set<string>(ACCOUNT_SCOPED_KEYS);
    for (let i = 0; i < store.length; i++) {
      const k = store.key(i);
      if (k && ACCOUNT_SCOPED_PREFIXES.some((p) => k.startsWith(p))) {
        toRemove.add(k);
      }
    }
    for (const k of toRemove) {
      store.removeItem(k);
    }
  } catch {
    // storage disabled — nothing to clear.
  }
}

export type ReconcileReason =
  | "no-email" // not authenticated — nothing to reconcile
  | "match" // same agent — keep everything
  | "switch" // stamp present + different → cleared + re-stamped
  | "foreign-brand" // unstamped, but the brand blob proves a different owner → cleared
  | "adopt"; // unstamped + no conflicting signal → adopt (stamp, keep data)

export interface ReconcileResult {
  cleared: boolean;
  reason: ReconcileReason;
}

/**
 * Reconcile this browser's per-account cache against the authenticated email.
 * Call on every authenticated client entry, BEFORE per-account hydration runs.
 *
 *   - stamp matches email            → keep (the legitimate same-agent case).
 *   - stamp present + differs        → a different agent signed in → CLEAR + re-stamp.
 *   - no stamp, brand owner differs  → provably another agent's data (one-time
 *                                      pre-fix transition) → CLEAR + stamp.
 *   - no stamp, no conflict          → adopt: stamp this email, keep the data
 *                                      (legacy single-user upgrade — never
 *                                      destroy their local-only work).
 *
 * Returns whether anything was cleared + why (for logging / tests).
 */
export function reconcileAccountOwnership(
  email: string | null | undefined,
): ReconcileResult {
  const normalized = normalizeEmail(email);
  if (!normalized) return { cleared: false, reason: "no-email" };

  const stamp = readOwnerStamp();

  if (stamp === normalized) {
    return { cleared: false, reason: "match" };
  }

  if (stamp && stamp !== normalized) {
    clearAccountScopedStorage();
    stampOwner(normalized);
    return { cleared: true, reason: "switch" };
  }

  // No global stamp yet (pre-fix browser). Use the brand blob's embedded
  // owner as a corroborating signal so a shared device still can't leak a
  // prior agent's identity during the one-time transition.
  const brandOwner = readBrandOwnerEmail();
  if (brandOwner && brandOwner !== normalized) {
    clearAccountScopedStorage();
    stampOwner(normalized);
    return { cleared: true, reason: "foreign-brand" };
  }

  // Unstamped, no conflicting owner — this is the legitimate agent's own
  // legacy cache (or a fresh browser). Adopt it without clearing.
  stampOwner(normalized);
  return { cleared: false, reason: "adopt" };
}
