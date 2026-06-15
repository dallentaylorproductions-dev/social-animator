"use client";

import { useEffect, useRef, useState } from "react";
import { drawImageContain } from "@/engine/draw";
import type { Review } from "@/tools/seller-presentation/engine/types";
import { type WhyUs, clampWhyUs } from "@/lib/whyus";
import {
  type SettingsRecentListing,
  clampStoredRecentListings,
} from "@/lib/seller-presentation/recent-listings";
import { useServerBrandSettingsEnabled } from "@/lib/brand-settings-flag";
import {
  fetchServerBrandSettings,
  putServerBrandSettings,
} from "@/lib/brand-settings-client";
import { planBrandMigration } from "@/lib/brand-settings-migration";

export interface BrandSettings {
  logoDataUrl: string | null;
  agentName: string;
  primaryColor: string;
  accentColor: string;
  /**
   * Page/output background color. Reserved for tools that render their own
   * artifact (e.g. Listing Flyer PDF). Brand-profile UI does not currently
   * expose this — empty string means "use the tool's safe default".
   */
  backgroundColor: string;
  contactEmail: string;
  contactPhone: string;
  licenseNumber: string;
  brokerage: string;
  /**
   * A7c — Seller Presentation agent-profile extensions. All optional;
   * the SP wizard flows these through `agentContact` to the publish
   * route via the same path the existing brand fields use, so the
   * page renderer's `agent.{areasServed, photoUrl, bioShort,
   * yearsInArea, ctaReassurance}` can read them without a per-
   * presentation override. Set-once, reused across presentations.
   */
  agentPhotoUrl?: string;
  /**
   * UX-2b — repositionable headshot. A pure DISPLAY transform stored
   * ALONGSIDE `agentPhotoUrl` (the uploaded image is never re-cropped or
   * re-encoded). `agentHeadshotFocalX` / `agentHeadshotFocalY` are the CSS
   * object/background-position as 0–100% (default centered 50/50);
   * `agentHeadshotScale` is a 1.0–2.0 display zoom (default 1). All optional
   * — unset means centered at no zoom, so every existing agent's published
   * page renders byte-identical. Set by the Settings reposition control; the
   * renderer maps them onto the agent band avatar on every surface.
   */
  agentHeadshotFocalX?: number;
  agentHeadshotFocalY?: number;
  agentHeadshotScale?: number;
  agentBioShort?: string;
  agentAreasServed?: string;
  agentYearsInArea?: string;
  agentCtaReassurance?: string;
  /**
   * A7d.2 — curated reviews. AGENT-CONSTANT: entered once in Settings,
   * surfaced on every Seller Presentation. The wizard's editorial step
   * no longer captures per-presentation reviews; the projector reads
   * from these via the publish route's `brandReviews` arg. Soft cap is
   * enforced in the form; persistence is permissive.
   */
  agentReviews?: Review[];
  /** A7d.2 — outlink URL for the reviews block (renderer pairs with a fixed "See all reviews on Zillow" label). */
  reviewsOutlinkUrl?: string;
  /**
   * B0a — short agent tagline. AGENT-CONSTANT, set once. One of the three
   * text fields the "Draft from your reviews" helper can suggest (alongside
   * `agentBioShort` and `reviewsHeadline`); the agent applies/edits, never
   * auto-overwritten. Data-IN only this phase — B0b renders it.
   */
  agentTagline?: string;
  /**
   * B0a — headline for the reviews block (e.g. "What sellers say"). The
   * third "Draft from your reviews" suggestion target. Optional; B0b renders.
   */
  reviewsHeadline?: string;
  /**
   * Seller State A — the agent's "quiet signature" line, set once in Settings.
   * Flows through `brandWhyUs.signatureLine` to the publish payload and is
   * rendered ONLY by the State A hero (State B / full presentation ignores it).
   * Optional; unset → the hero flexes the signature out. The Settings input was
   * deferred in the State A refinement PR and is wired here.
   */
  signatureLine?: string;
  /**
   * Seller State A — the editable VALUATION message (the "your number is being
   * prepared" voice line). Agent-constant, set once. Optional: unset → the State
   * A page renders a strong universal default; set → the agent's own words. Only
   * the State A page reads it; State B / full / flag-off are unaffected.
   */
  valuationMessage?: string;
  /**
   * Seller State A — the editable personal WELCOME line shown near the agent in
   * the hero. Agent-constant, set once. Optional: unset → a warm default renders;
   * set → the agent's own words. State A only.
   */
  welcomeLine?: string;
  /**
   * Seller State A — set-once CAPABILITY sample assets for the "How I'll get your
   * home seen" campaign frames. These show the agent's CAPABILITY (their best
   * listing photography + a recent video tour), NOT this not-yet-shot home, and
   * are reused across every invitation. Hosted Vercel Blob URLs (camera-roll →
   * /api/upload-image|upload-video). All optional; each frame flexes out when its
   * sample is unset. `sampleVideoPosterUrl` is the auto-captured first frame so
   * the video frame can render a concrete poster.
   */
  sampleListingPhotoUrl?: string;
  sampleVideoUrl?: string;
  sampleVideoPosterUrl?: string;
  /**
   * Seller State A · Zone 5 — the agent's OWN recent listings for the exposure
   * coverflow ("Recent listings, real reach"). Set-once, agent-constant; same
   * provenance + path as the capability samples above. Each carries a photo
   * (camera-roll upload OR a Street View pano resolved from the address — never
   * image bytes), a street address + city, and an OPTIONAL agent-entered view
   * count (the public-portal number, never scraped, never fabricated). Capped at
   * RECENT_LISTINGS_CAP. Rides `brandWhyUs.recentListings` to the publish
   * projector, which is the public-safe boundary (field-by-field, clamped,
   * capped); projected ONLY behind the SELLER_LISTINGS_COVERFLOW flag AND a State
   * A invitation, so a flag-off / revealed / State B publish is byte-identical.
   * The Settings input is gated behind the SELLER_STATE_A entitlement.
   */
  recentListings?: SettingsRecentListing[];
  /**
   * B0a — "Why us" agent-constant content group (differentiators, marketing
   * approach, performance stats, how-we-work, guarantee). Set once in
   * Settings; flows into every Seller Presentation in B0b. `undefined` means
   * "never configured" — the form seeds blank state from `defaultWhyUs()` but
   * does NOT persist on mount (mirrors the E.0 brand-color contract). See
   * `src/lib/whyus.ts`.
   */
  whyUs?: WhyUs;
  /**
   * E.0 — Brand Kit color foundation. Three optional brand colors that
   * flow into every published seller page as CSS custom properties on
   * the consumer `/h/<slug>` root. All optional + hex-validated on load.
   * Undefined means "use the production Editorial defaults" via the CSS
   * `var()` cascade — an agent who never opens `/settings/brand`
   * publishes pages byte-identical to today (cohort safety). The
   * `/settings/brand` form pre-populates its pickers from
   * `EDITORIAL_BRAND_DEFAULTS` but does NOT persist them on mount; only
   * an explicit change writes a value here.
   */
  // no longer user-editable; v2 locks paper+ink; retained for frozen v1 pages
  brandBackground?: string;
  // no longer user-editable; v2 locks paper+ink; retained for frozen v1 pages
  brandText?: string;
  brandAccent?: string;
  /**
   * E.1 — optional SECONDARY brand color. `brandAccent` is now the
   * "signature" (label-only rename in the UI; no field rename, no
   * migration). The secondary is decorative-only (section numerals,
   * end-marks) at full strength; the seller-page engine derives it from
   * the signature when unset. Follows the E.0 optional-field contract
   * verbatim: hex-clamped on load, NEVER written on mount, unset (absent /
   * empty) is a first-class state.
   */
  brandSecondary?: string;
  /**
   * E.0 — brand-level default layout id. Seeds a fresh draft's
   * `themeId` at creation time. "editorial" | "studio" | "warm";
   * undefined falls back to "editorial" at render. Only "editorial" is
   * a built layout today (Phase E); Studio/Warm are Coming soon.
   */
  defaultThemeId?: string;
  /**
   * Server-persistence plumbing (SERVER_BRAND_SETTINGS) — NOT brand content.
   * The lowercased owner email stamped into the localStorage blob the first
   * time settings are saved while signed in with the feature on. It scopes the
   * one-time localStorage→server migration to ONLY-already-owned settings,
   * mirroring `WorkflowInstance.ownerEmail` in the draft store: legacy no-owner
   * settings (and any left by another agent on a shared browser) are never
   * swept into this account at load — the hard privacy gate. Never read by the
   * publish serializer (`brandToPublishInputs` enumerates fields and never
   * spreads), so it cannot reach a public page. Undefined when the feature is
   * off, so the flag-off localStorage blob stays byte-identical.
   */
  ownerEmail?: string;
}

/**
 * The Editorial palette `BrandKitForm` pre-populates its pickers + Reset
 * targets with. surface/ink are the layout-locked page register; `accent` is
 * the default SIGNATURE a never-customized agent starts from.
 *
 * F3 — the default signature flipped terracotta `#c26a4e` → flagship blue
 * `#037290` (passes 3:1 display + 4.5:1 links/body on the paper surface
 * clamp-free). Because new publishes are flagship (v2), a never-customized
 * agent now publishes the blue default ramp.
 *
 * COHORT CONTRACT (read carefully): this constant is the FORM default only —
 * it is NOT consumed by either renderer. The v1 path's unset-brand default
 * lives in `E1_DEFAULTS.signature` (presentation-page.tsx) and is DELIBERATELY
 * still terracotta, so already-published v1 pages stay byte-identical; the v1
 * CSS `var()` fallbacks (presentation-page.css) are likewise still the
 * terracotta hexes. So the form default (blue) and the v1 fallback (terracotta)
 * intentionally diverge here at F3 — they are no longer the same hex.
 *
 * NOTE: surface/ink are the REAL production hexes, NOT Claude Design's
 * published `#f4efe5 / #221d16` (which never shipped — see the E.0 packet's
 * "Palette truth" correction).
 */
export const EDITORIAL_BRAND_DEFAULTS = {
  background: "#f1ebe0",
  text: "#1a1612",
  accent: "#037290",
} as const;

/** E.0 — default brand layout id; the only built layout today. */
export const DEFAULT_BRAND_THEME_ID = "editorial";

/**
 * E.0 — strict 6-digit hex validator for the brand color fields.
 * Defense-at-boundary: invalid / non-string values silently become
 * `undefined` (which the CSS cascade then treats as "use the Editorial
 * default"), so a malformed stored value never reaches the consumer page.
 */
function clampBrandHex(value: unknown): string | undefined {
  return typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value)
    ? value
    : undefined;
}

/**
 * UX-2b — headshot focal-point clamp. A finite number in [0, 100] (a CSS
 * position percentage); anything else → undefined ("centered"). Defense-at-
 * boundary so a tampered localStorage value can't render the frame off the
 * edge of the photo.
 */
function clampStoredPct(value: unknown): number | undefined {
  return typeof value === "number" &&
    Number.isFinite(value) &&
    value >= 0 &&
    value <= 100
    ? value
    : undefined;
}

/**
 * UX-2b — headshot zoom clamp. A finite number in [1.0, 2.0]; anything else
 * → undefined ("no zoom"). The lower bound of 1 guarantees the photo always
 * at least covers the frame (never zoomed out to bare edges).
 */
function clampStoredScale(value: unknown): number | undefined {
  return typeof value === "number" &&
    Number.isFinite(value) &&
    value >= 1 &&
    value <= 2
    ? value
    : undefined;
}

// Storage key kept as `socanim_*` for backwards compatibility with users who
// already have brand settings saved from before the Studio refactor.
const STORAGE_KEY = "socanim_brand_settings";

const DEFAULT_BRAND: BrandSettings = {
  logoDataUrl: null,
  agentName: "",
  primaryColor: "#4ef2d9",
  accentColor: "#ffffff",
  backgroundColor: "",
  contactEmail: "",
  contactPhone: "",
  licenseNumber: "",
  brokerage: "",
};

const str = (v: unknown, fallback = ""): string =>
  typeof v === "string" ? v : fallback;

/**
 * Derive a sensible default accent color from the user's primary
 * brand color: same hue + saturation, lightness reduced by 20
 * percentage points. Produces a darker companion shade that pairs
 * with primary — e.g. mint #4ef2d9 → #1ec9b3 (darker mint),
 * coral #f97056 → #f33d18 (darker coral). Used by tools that want
 * an "accent" role distinct from primary when the user hasn't
 * explicitly picked one (the BrandSettings legacy default of
 * #ffffff produces poor results against most page backgrounds).
 *
 * Returns the primary input unchanged if the hex string is
 * malformed (rather than throwing — auto-derivation is a quality-
 * of-life feature, not load-bearing).
 */
export function deriveAccentFromPrimary(primaryHex: string): string {
  const h = primaryHex.replace("#", "").trim();
  const expanded =
    h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  if (expanded.length !== 6 || !/^[0-9a-fA-F]{6}$/.test(expanded)) {
    return primaryHex;
  }
  const r = parseInt(expanded.slice(0, 2), 16) / 255;
  const g = parseInt(expanded.slice(2, 4), 16) / 255;
  const b = parseInt(expanded.slice(4, 6), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  let hue = 0;
  let sat = 0;
  if (max !== min) {
    const d = max - min;
    sat = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r:
        hue = (g - b) / d + (g < b ? 6 : 0);
        break;
      case g:
        hue = (b - r) / d + 2;
        break;
      default:
        hue = (r - g) / d + 4;
    }
    hue /= 6;
  }
  // Reduce lightness by 20 percentage points (clamped to ≥0.05 so
  // the result never collapses to pure black, which would be
  // useless against any page bg).
  const newL = Math.max(0.05, l - 0.2);
  return hslToHex(hue, sat, newL);
}

function hslToHex(h: number, s: number, l: number): string {
  const hueToRgb = (p: number, q: number, t: number) => {
    let tt = t;
    if (tt < 0) tt += 1;
    if (tt > 1) tt -= 1;
    if (tt < 1 / 6) return p + (q - p) * 6 * tt;
    if (tt < 1 / 2) return q;
    if (tt < 2 / 3) return p + (q - p) * (2 / 3 - tt) * 6;
    return p;
  };
  let r: number;
  let g: number;
  let b: number;
  if (s === 0) {
    r = g = b = l;
  } else {
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    r = hueToRgb(p, q, h + 1 / 3);
    g = hueToRgb(p, q, h);
    b = hueToRgb(p, q, h - 1 / 3);
  }
  const toHex = (n: number) =>
    Math.round(n * 255)
      .toString(16)
      .padStart(2, "0");
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

/**
 * Resolve the effective accent color for a tool that wants the
 * auto-derive-when-unset behavior. Treats the empty string AND
 * the legacy BrandSettings default of "#ffffff" as "unset" and
 * derives a darker shade from primary instead. A user who really
 * wants white can pick "#fefefe" or any other near-white hex to
 * escape the auto-derivation.
 */
export function effectiveBrandAccent(brand: BrandSettings): string {
  const raw = brand.accentColor.trim();
  const lower = raw.toLowerCase();
  if (!raw || lower === "#ffffff" || lower === "#fff") {
    return deriveAccentFromPrimary(brand.primaryColor || "#4ef2d9");
  }
  return raw;
}

/**
 * Strip everything except digits, cap at 10 (US phone numbers). iOS phone
 * keypad lets `# * +` through type="tel" inputs — strip those out so they
 * never reach storage. Pasted formatted numbers ("253-202-8825") become
 * raw digits ready to re-format.
 */
export function extractPhoneDigits(input: string): string {
  return input.replace(/\D/g, "").slice(0, 10);
}

/**
 * Format raw digits as "(xxx) xxx-xxxx", accepting any input form (already
 * formatted, partial, or raw digits) by extracting digits first. Idempotent
 * — pass formatted output back in and you get the same formatted output.
 * Empty input returns empty string (don't render "(   )    -    " for blanks).
 */
export function formatPhone(input: string): string {
  const digits = extractPhoneDigits(input);
  if (digits.length === 0) return "";
  if (digits.length <= 3) return `(${digits}`;
  if (digits.length <= 6) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
}

export function loadBrandSettings(): BrandSettings {
  if (typeof window === "undefined") return DEFAULT_BRAND;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_BRAND;
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    return {
      logoDataUrl:
        typeof parsed.logoDataUrl === "string" ? parsed.logoDataUrl : null,
      agentName: str(parsed.agentName),
      primaryColor: str(parsed.primaryColor, DEFAULT_BRAND.primaryColor),
      accentColor: str(parsed.accentColor, DEFAULT_BRAND.accentColor),
      backgroundColor: str(parsed.backgroundColor),
      contactEmail: str(parsed.contactEmail),
      // Normalize on load: drafts saved before H-1.7 stored "(253) 202-8825";
      // strip to raw digits so the input mask + downstream renders are
      // consistent. Idempotent for fresh-format storage.
      contactPhone: extractPhoneDigits(str(parsed.contactPhone)),
      licenseNumber: str(parsed.licenseNumber),
      brokerage: str(parsed.brokerage),
      agentPhotoUrl:
        typeof parsed.agentPhotoUrl === "string" && parsed.agentPhotoUrl.length > 0
          ? parsed.agentPhotoUrl
          : undefined,
      // UX-2b — clamp the stored display transform at the load boundary:
      // focal as a 0–100 percentage, scale within the 1.0–2.0 bounds. Any
      // out-of-range / non-numeric value drops to undefined ("centered, no
      // zoom"), so a tampered record can never push the frame off the photo.
      agentHeadshotFocalX: clampStoredPct(parsed.agentHeadshotFocalX),
      agentHeadshotFocalY: clampStoredPct(parsed.agentHeadshotFocalY),
      agentHeadshotScale: clampStoredScale(parsed.agentHeadshotScale),
      agentBioShort:
        typeof parsed.agentBioShort === "string" && parsed.agentBioShort.length > 0
          ? parsed.agentBioShort
          : undefined,
      agentAreasServed:
        typeof parsed.agentAreasServed === "string" && parsed.agentAreasServed.length > 0
          ? parsed.agentAreasServed
          : undefined,
      agentYearsInArea:
        typeof parsed.agentYearsInArea === "string" && parsed.agentYearsInArea.length > 0
          ? parsed.agentYearsInArea
          : undefined,
      agentCtaReassurance:
        typeof parsed.agentCtaReassurance === "string" &&
        parsed.agentCtaReassurance.length > 0
          ? parsed.agentCtaReassurance
          : undefined,
      agentReviews: clampStoredReviews(parsed.agentReviews),
      reviewsOutlinkUrl:
        typeof parsed.reviewsOutlinkUrl === "string" &&
        parsed.reviewsOutlinkUrl.length > 0
          ? parsed.reviewsOutlinkUrl
          : undefined,
      agentTagline:
        typeof parsed.agentTagline === "string" && parsed.agentTagline.length > 0
          ? parsed.agentTagline
          : undefined,
      reviewsHeadline:
        typeof parsed.reviewsHeadline === "string" &&
        parsed.reviewsHeadline.length > 0
          ? parsed.reviewsHeadline
          : undefined,
      // Seller State A — editable voice lines + set-once capability samples. All
      // optional; a non-string / empty value drops to undefined ("use the strong
      // default" / "flex the frame out"), so an agent who sets nothing publishes
      // a byte-identical State B / flag-off page.
      signatureLine:
        typeof parsed.signatureLine === "string" &&
        parsed.signatureLine.length > 0
          ? parsed.signatureLine
          : undefined,
      valuationMessage:
        typeof parsed.valuationMessage === "string" &&
        parsed.valuationMessage.length > 0
          ? parsed.valuationMessage
          : undefined,
      welcomeLine:
        typeof parsed.welcomeLine === "string" && parsed.welcomeLine.length > 0
          ? parsed.welcomeLine
          : undefined,
      sampleListingPhotoUrl:
        typeof parsed.sampleListingPhotoUrl === "string" &&
        parsed.sampleListingPhotoUrl.length > 0
          ? parsed.sampleListingPhotoUrl
          : undefined,
      sampleVideoUrl:
        typeof parsed.sampleVideoUrl === "string" &&
        parsed.sampleVideoUrl.length > 0
          ? parsed.sampleVideoUrl
          : undefined,
      sampleVideoPosterUrl:
        typeof parsed.sampleVideoPosterUrl === "string" &&
        parsed.sampleVideoPosterUrl.length > 0
          ? parsed.sampleVideoPosterUrl
          : undefined,
      // Seller State A · Zone 5 — clamp the recent listings to their declared
      // shape + cap on load; undefined means "none". Empty-address rows survive
      // (an in-progress row the agent hasn't filled in yet); the publish
      // projector drops them. A tampered record can't smuggle nested junk here.
      recentListings: clampStoredRecentListings(parsed.recentListings),
      // B0a — clamp the "Why us" group to its declared shape + soft caps on
      // load; undefined means "never configured" (form seeds from defaults).
      whyUs: clampWhyUs(parsed.whyUs),
      // E.0 — brand colors are hex-validated on load; invalid drops to
      // undefined ("use Editorial default" via the consumer CSS cascade).
      brandBackground: clampBrandHex(parsed.brandBackground),
      brandText: clampBrandHex(parsed.brandText),
      brandAccent: clampBrandHex(parsed.brandAccent),
      brandSecondary: clampBrandHex(parsed.brandSecondary),
      defaultThemeId:
        typeof parsed.defaultThemeId === "string" &&
        parsed.defaultThemeId.length > 0
          ? parsed.defaultThemeId
          : undefined,
      // Server-persistence plumbing — preserve the owner stamp so the
      // migration planner can scope to only-already-owned settings. Undefined
      // for a flag-off / never-signed-in blob (byte-identical to today).
      ownerEmail:
        typeof parsed.ownerEmail === "string" && parsed.ownerEmail.length > 0
          ? parsed.ownerEmail
          : undefined,
    };
  } catch {
    return DEFAULT_BRAND;
  }
}

/**
 * Defense-at-boundary clamp for stored reviews. Mirrors the public-
 * payload Review shape (body + attributionName + optional year/street).
 * Strings only, no nested junk, no rows missing the required body or
 * attributionName. Returns undefined when nothing usable survives so
 * the consumer side can treat "no reviews" as a single state.
 */
function clampStoredReviews(raw: unknown): Review[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const out: Review[] = [];
  for (const r of raw) {
    if (!r || typeof r !== "object") continue;
    const rec = r as Record<string, unknown>;
    const body = typeof rec.body === "string" ? rec.body : "";
    const attributionName =
      typeof rec.attributionName === "string" ? rec.attributionName : "";
    if (!body.trim() || !attributionName.trim()) continue;
    out.push({
      body,
      attributionName,
      attributionYear:
        typeof rec.attributionYear === "string" && rec.attributionYear.length > 0
          ? rec.attributionYear
          : undefined,
      attributionStreet:
        typeof rec.attributionStreet === "string" &&
        rec.attributionStreet.length > 0
          ? rec.attributionStreet
          : undefined,
    });
  }
  return out.length ? out : undefined;
}

/**
 * Same-tab reactivity channel for brand settings. The native `storage` event
 * only fires in OTHER tabs, so a component that reads brand state (e.g. the
 * pre-listing publish gate) would never hear an edit made by another component
 * in the SAME tab (the brand profile form) until a reload. Every writer goes
 * through `saveBrandSettings`, so it emits this event and `useBrandSettings`
 * subscribes — live, no reload.
 */
export const BRAND_SETTINGS_EVENT = "socanim:brand-settings";

export function saveBrandSettings(settings: BrandSettings): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    window.dispatchEvent(new Event(BRAND_SETTINGS_EVENT));
  } catch {
    // localStorage disabled or full — silently skip
  }
}

// SERVER_BRAND_SETTINGS debounced-autosave tuning (mirrors the draft store's
// useSellerPresentationState): coalesce rapid edits, then a bounded backoff on
// transient failures before falling back to the local cache.
const BRAND_AUTOSAVE_DEBOUNCE_MS = 1500;
const BRAND_RETRY_BASE_DELAY_MS = 2000;
const BRAND_MAX_RETRIES = 4;

/**
 * Hook: loads brand settings + materializes the logo as an HTMLImageElement
 * (since canvas drawing needs an image element, not a data URL string).
 */
export function useBrandSettings() {
  // v1.45.1 hydration fix: initialize state to DEFAULT_BRAND on BOTH server
  // and client first-render so SSR HTML matches client hydration. Reading
  // localStorage in the useState initializer (the prior pattern) caused
  // React error #418 — server returned DEFAULT_BRAND (no window), client
  // returned whatever the user had stored, downstream JSX trees diverged
  // (BrandBanner especially). Load via useEffect post-mount so the first
  // render is identity across environments.
  const [settings, setSettings] = useState<BrandSettings>(DEFAULT_BRAND);
  const [logoImg, setLogoImg] = useState<HTMLImageElement | null>(null);

  // SERVER_BRAND_SETTINGS — server-backed, owner-scoped persistence (mirrors
  // the SP-KEYSTONE draft store). The flag arrives via the root-layout context.
  // When OFF, every path below short-circuits to the localStorage-only behavior
  // this hook has always had (byte-identical). When ON, the server is the
  // source of truth: load from it (server wins), migrate an owned local blob up
  // once, and debounced-autosave every edit through it (flush on unmount).
  const serverEnabled = useServerBrandSettingsEnabled();
  // The authenticated owner email, learned from the load route. Needed to stamp
  // ownership into the local cache (so the migration is only-already-owned) and
  // to gate the migration push. Null until the load resolves / when anon.
  const emailRef = useRef<string | null>(null);
  // Debounced server autosave plumbing (mirrors useSellerPresentationState).
  const flushTimerRef = useRef<number | null>(null);
  const pendingRef = useRef<{ settings: BrandSettings; updatedAt: string } | null>(
    null,
  );
  const retryCountRef = useRef(0);

  useEffect(() => {
    setSettings(loadBrandSettings());

    // Stay live with edits made elsewhere: same-tab writes (BRAND_SETTINGS_EVENT,
    // emitted by saveBrandSettings) and cross-tab writes (the native storage
    // event). Both just re-read from localStorage — the single source of truth.
    const reload = () => setSettings(loadBrandSettings());
    const onStorage = (e: StorageEvent) => {
      if (e.key === null || e.key === STORAGE_KEY) reload();
    };
    window.addEventListener(BRAND_SETTINGS_EVENT, reload);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener(BRAND_SETTINGS_EVENT, reload);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  // Server resolve (flag-on only): load the owner's settings; the server copy
  // wins (cached to localStorage so it survives offline). If the server has
  // none yet, migrate an ALREADY-OWNED local blob up exactly once — never
  // clobbering server data, never claiming another agent's localStorage.
  useEffect(() => {
    if (!serverEnabled) return;
    let cancelled = false;
    void (async () => {
      const result = await fetchServerBrandSettings();
      if (cancelled || !result) {
        // null = offline / 503 (flag race) / anon / 5xx — keep the local cache.
        return;
      }
      emailRef.current = result.email;
      if (result.record) {
        // Server wins. Merge over DEFAULT_BRAND so a partial/older record can
        // never drop a required field; cache it locally for the next offline load.
        const serverSettings = { ...DEFAULT_BRAND, ...result.record.settings };
        setSettings(serverSettings);
        saveBrandSettings(serverSettings);
        return;
      }
      // Server has nothing yet — claim the local blob only if this agent owns it.
      const local = loadBrandSettings();
      const plan = planBrandMigration({
        localSettings: local,
        serverPresent: false,
        sessionEmail: result.email,
      });
      if (!plan.shouldPush) return;
      const owned: BrandSettings = {
        ...local,
        ownerEmail: result.email.toLowerCase(),
      };
      const res = await putServerBrandSettings(owned, new Date().toISOString());
      if (!cancelled && res.ok && res.record) {
        const merged = { ...DEFAULT_BRAND, ...res.record.settings };
        setSettings(merged);
        saveBrandSettings(merged);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [serverEnabled]);

  // Flush any pending debounced edit when the component unmounts (mirrors the
  // draft store's flush-on-unmount), so an edit made right before navigating
  // away is not lost. Best-effort; the local cache already holds it.
  useEffect(() => {
    return () => {
      if (flushTimerRef.current !== null) {
        window.clearTimeout(flushTimerRef.current);
      }
      const pending = pendingRef.current;
      if (pending) {
        void putServerBrandSettings(pending.settings, pending.updatedAt);
      }
    };
  }, []);

  useEffect(() => {
    if (!settings.logoDataUrl) {
      setLogoImg(null);
      return;
    }
    const img = new Image();
    img.onload = () => setLogoImg(img);
    img.onerror = () => setLogoImg(null);
    img.src = settings.logoDataUrl;
  }, [settings.logoDataUrl]);

  const update = (next: BrandSettings) => {
    if (!serverEnabled) {
      // Flag-off: today's localStorage-only path, byte-identical.
      setSettings(next);
      saveBrandSettings(next);
      return;
    }
    // Flag-on: stamp ownership (so the migration stays only-already-owned),
    // write the optimistic local cache, then debounced-autosave to the server.
    const email = emailRef.current;
    const stamped: BrandSettings = email
      ? { ...next, ownerEmail: email.toLowerCase() }
      : next;
    setSettings(stamped);
    saveBrandSettings(stamped);
    pendingRef.current = { settings: stamped, updatedAt: new Date().toISOString() };
    if (flushTimerRef.current !== null) {
      window.clearTimeout(flushTimerRef.current);
    }
    flushTimerRef.current = window.setTimeout(flushServerBrand, BRAND_AUTOSAVE_DEBOUNCE_MS);
  };

  // Push the latest pending edit to the server with a bounded retry/backoff on
  // transient (5xx / network) failures. Last-write-wins is enforced server-side
  // by updatedAt, so a stale push can never clobber a fresher edit elsewhere.
  function flushServerBrand(): void {
    const pending = pendingRef.current;
    if (!pending) return;
    void putServerBrandSettings(pending.settings, pending.updatedAt).then((res) => {
      if (res.ok) {
        retryCountRef.current = 0;
        pendingRef.current = null;
        return;
      }
      if (res.retryable && retryCountRef.current < BRAND_MAX_RETRIES) {
        retryCountRef.current += 1;
        if (flushTimerRef.current !== null) {
          window.clearTimeout(flushTimerRef.current);
        }
        flushTimerRef.current = window.setTimeout(
          flushServerBrand,
          BRAND_RETRY_BASE_DELAY_MS * retryCountRef.current,
        );
        return;
      }
      // Out of retries (or a 4xx). The edit is safe in the local cache; drop
      // the pending push so a later edit starts a clean retry budget.
      retryCountRef.current = 0;
      pendingRef.current = null;
    });
  }

  return { settings, logoImg, update };
}

/**
 * Draw brand overlay on a canvas. Bottom-right logo (rounded square) with
 * optional agent name to the left. Designed for 1080-wide canvases.
 */
export function drawBrandOverlay(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  logoImg: HTMLImageElement | null,
  agentName: string,
  alpha: number = 1
): void {
  if (!logoImg && !agentName) return;
  if (alpha <= 0) return;

  const logoHeight = 80;
  const margin = 40;
  const gap = 16;
  const fontSize = 26;

  // Compute logo width from natural aspect ratio so wordmarks display wide,
  // square logos stay square, etc. Cap at 60-220 to keep brand area sensible.
  let logoWidth = logoHeight;
  if (logoImg && logoImg.complete && logoImg.naturalWidth > 0) {
    const aspect = logoImg.naturalWidth / logoImg.naturalHeight;
    logoWidth = Math.max(60, Math.min(220, logoHeight * aspect));
  }

  ctx.save();
  ctx.globalAlpha = alpha;

  const logoX = width - margin - logoWidth;
  const logoY = height - margin - logoHeight;

  // Logo: use contain (no cropping) so any logo aspect renders fully
  if (logoImg && logoImg.complete && logoImg.naturalWidth > 0) {
    drawImageContain(ctx, logoImg, logoX, logoY, logoWidth, logoHeight, 0);
  }

  // Agent name to the left of the logo (or pinned to right edge if no logo)
  if (agentName) {
    ctx.fillStyle = "#ffffff";
    ctx.font = `600 ${fontSize}px Inter, system-ui, sans-serif`;
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";
    ctx.shadowColor = "rgba(0,0,0,0.6)";
    ctx.shadowBlur = 6;
    ctx.shadowOffsetY = 1;
    const nameX = logoImg ? logoX - gap : width - margin;
    ctx.fillText(agentName, nameX, logoY + logoHeight / 2);
  }

  ctx.restore();
}
