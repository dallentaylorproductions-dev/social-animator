"use client";

import { useEffect, useState } from "react";
import { drawImageContain } from "@/engine/draw";
import type { Review } from "@/tools/seller-presentation/engine/types";
import { type WhyUs, clampWhyUs } from "@/lib/whyus";

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

export function saveBrandSettings(settings: BrandSettings): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // localStorage disabled or full — silently skip
  }
}

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

  useEffect(() => {
    setSettings(loadBrandSettings());
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
    setSettings(next);
    saveBrandSettings(next);
  };

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
