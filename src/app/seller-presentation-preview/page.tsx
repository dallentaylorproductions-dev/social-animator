import { notFound } from "next/navigation";
import type { HandoutRecord } from "@/lib/share-urls";
import { SellerPresentationPage } from "@/tools/seller-presentation/output/presentation-page";
import {
  computeValuationRange,
  type PublicPayload,
} from "@/tools/seller-presentation/output/public-payload";
import {
  AREA_PARTIAL_PAYLOAD,
  FLAGSHIP_PRIVACY_PAYLOAD,
  FULL_PAYLOAD,
  MINIMAL_PAYLOAD,
  OUTLINK_ONLY_PAYLOAD,
  POSTER_AUTO_ONLY_PAYLOAD,
  POSTER_NONE_PAYLOAD,
  POSTER_OVERRIDE_WINS_PAYLOAD,
  POSTER_SCRUB_OVER_AUTO_PAYLOAD,
  STATE_A_COVERFLOW_PAYLOAD,
  STATE_A_COVERFLOW_PAIR_PAYLOAD,
  STATE_A_COVERFLOW_TRIO_PAYLOAD,
  STATE_A_COVERFLOW_SINGLE_PAYLOAD,
  STATE_A_COVERFLOW_NO_MEDIA_PAYLOAD,
  STATE_A_COVERFLOW_PHOTO_ONLY_PAYLOAD,
  STATE_A_COVERFLOW_BROKEN_PHOTO_PAYLOAD,
  STATE_A_FULL_PAYLOAD,
  STATE_A_MINIMAL_PAYLOAD,
  STATE_A_MIXED_COVERAGE_PAYLOAD,
  STATE_A_NO_STAT_PAYLOAD,
  STATE_A_NO_VIDEO_PAYLOAD,
  STATE_A_TREND_ONLY_PAYLOAD,
} from "@/tools/seller-presentation/output/__fixtures__/sample-payload";
import { SAMPLE_RECENT_LISTINGS } from "@/lib/onboarding/sample-listing-draft";
import { EmbedBridge } from "./EmbedBridge";

/**
 * Dev preview route for the locked premium consumer page
 * (v1.47 / A7b). Renders the SellerPresentationPage from one of
 * the hand-populated fixtures without round-tripping through a
 * real publish + auth + KV.
 *
 * URL: `/seller-presentation-preview?fixture=full|minimal`
 *
 * Why it exists: A7c hasn't shipped wizard capture UI for the
 * locked-design fields yet, so a published `/h/[slug]` would be
 * stuck in the bridge state (only Step 1/2/3 fields). This route
 * lets the e2e render spec + Dallen's browser smoke exercise the
 * full premium page directly.
 *
 * NOT in the middleware matcher (src/middleware.ts) — same Base-
 * routing pattern as `/seller-presentation`, so dev tooling + tests
 * reach it without auth.
 *
 * Safe in production: only reads from compiled-in fixtures; never
 * touches user data; doesn't accept any user input. The route stays
 * even after A7c lands wizard capture — it's a fast designer/QA
 * surface for iterating on the renderer.
 */
export const dynamic = "force-dynamic";

interface PageProps {
  searchParams: Promise<{
    fixture?: string;
    brandBg?: string;
    brandText?: string;
    brandAccent?: string;
    brandSecondary?: string;
    embed?: string;
    /**
     * F4 — `?suppressWordmark=1` merges `suppressWordmark: true` onto the
     * fixture payload (routed through the same clamp as a real publish), so the
     * suite + Dallen's smoke can see the white-labeled flagship footer without
     * an entitled account. Any other value → wordmark shows.
     */
    suppressWordmark?: string;
    // Read-time template override (the same switch the /h/ route exposes):
    //   • `?template=flagship` — render the fixture through the flagship (v2)
    //     template (lets the suite + browser smoke exercise v2).
    //   • `?template=v1` — the F3 inverse: render through the v1 template. Used
    //     with the `full-v2` fixture (a templateVersion: 2 payload) to prove a
    //     v2 payload can be forced back to the v1 renderer.
    template?: string;
    /**
     * REVIEW_SOURCE_LOGOS_ENABLED - `?reviewSourceLogos=1` forces the review
     * card's source-logo chip on for this preview render (independent of the
     * server env flag), so the suite + Dallen's smoke can see the Zillow/Google
     * mark without flipping a global env. Any other value falls back to the env default.
     */
    reviewSourceLogos?: string;
    /**
     * MARKETING_ZONE_REDESIGN (v1.7 Packet C) — `?redesign=1` merges
     * `marketingZoneRedesign: true` onto the fixture payload (routed through the
     * same clamp as a real publish), so the suite + Dallen's smoke can see the
     * redesigned "How I'll get your home seen" zone on any state-a fixture without
     * flipping the server env flag. Any other value → the current grid renders.
     */
    redesign?: string;
    /**
     * VALUATION_REDESIGN (v1.7 Packet B) — `?valrange=1` merges the
     * `valuationRedesign` discriminator AND a comp-derived `valuationRange`
     * (computed from the fixture's own comps with the SAME `computeValuationRange`
     * the projector uses) onto a state-a fixture, then routes it through the same
     * clamp as a real publish — so the suite + Dallen's smoke can see the
     * redesigned valuation section on any state-a fixture without flipping the
     * server env flag. Any other value → today's valuation block renders.
     */
    valrange?: string;
  }>;
}

export default async function SellerPresentationPreview({ searchParams }: PageProps) {
  const {
    fixture,
    brandBg,
    brandText,
    brandAccent,
    brandSecondary,
    embed,
    template,
    suppressWordmark,
    reviewSourceLogos,
    redesign,
    valrange,
  } = await searchParams;
  // `?reviewSourceLogos=1` forces the chip on; otherwise leave undefined so
  // SellerPresentationPage falls back to the server env flag (off in tests).
  const reviewSourceLogosOverride =
    reviewSourceLogos === "1" ? true : undefined;
  const templateOverride =
    template === "flagship" ? "flagship" : template === "v1" ? "v1" : undefined;
  // v3 — embed mode: the Brand kit settings preview iframes this route with
  // `embed=1`. EmbedBridge then hides non-page chrome and applies vars pushed
  // live (same-origin postMessage) so dialing a color repaints with no reload.
  const isEmbed = embed === "1";
  // A7d.8 — added three poster-precedence variants. The renderer's
  // VideoBlock emits `data-poster-source` so the e2e suite can assert
  // which branch of the override > scrub > auto cascade fired without
  // parsing the rendered URL.
  const VARIANTS = [
    "full",
    "minimal",
    "outlink-only",
    // LS-1 — partially-filled area snapshot (two stat fields, no chart series).
    "area-partial",
    "poster-auto-only",
    "poster-scrub-over-auto",
    "poster-override-wins",
    // A7d.8.1 — never-blank fallback fixture: video set but all three
    // poster slots empty (the iOS capture-timeout scenario).
    "poster-none",
    // F2 — flagship privacy fixture: FULL payload + rogue private keys, to
    // prove the clamp boundary strips them before the flagship renders.
    "flagship-privacy",
    // F3 — a real v2-stamped payload (templateVersion: 2). Renders the flagship
    // with NO `?template` param (proving the publish-version stamp routes on its
    // own), and `&template=v1` forces it back through the v1 renderer (the
    // inverse override).
    "full-v2",
    // REVIEW_SOURCE_LOGOS - the full sample with a Google reviews link (the base
    // sample is Zillow), so the suite + smoke can exercise the Google "G"
    // treatment. Pair with `&template=flagship&reviewSourceLogos=1`.
    "full-google",
    // SELLER_STATE_A - the prepared invitation. `state-a` is the rich
    // (price-less, full supporting data) variant; `state-a-minimal` flexes every
    // proof item + optional block out. Both carry an invitation valuationStatus,
    // so SellerPresentationPage dispatches to the StateAPage on its own (no
    // `?template` needed) - the same way a v2 stamp routes to the flagship.
    "state-a",
    "state-a-minimal",
    // COMP_PHOTOS - some nearby sales have Street View coverage, some don't. The
    // brief must render only the photographed ones (no empty frame).
    "state-a-mixed-coverage",
    // v1.5x zone-polish flex-out fixtures: Z1 no-video (welcome section drops),
    // Z2 trend-only (sparkline full-width, +6% proof collapses), Z4 stat-absent
    // (quote centers, 101.3% rail removed). Z3 range-absent reuses state-a-minimal.
    "state-a-no-video",
    "state-a-trend-only",
    "state-a-no-stat",
    // Zone 5 listings coverflow (exposure proof). `state-a-coverflow` = the full
    // fan (5 listings, portal-scale numbers, with/without mix, aggregate);
    // `-pair` = the 2-listing gentle pair; `-single` = one centered card with the
    // aggregate hidden. The capability-cards-only (empty) state is `state-a`.
    "state-a-coverflow",
    "state-a-coverflow-pair",
    "state-a-coverflow-trio",
    "state-a-coverflow-single",
    // v1.7 Packet C — redesigned-zone flex case: list + coverflow, NO showcase
    // media (pair with `&redesign=1` to see the zone read complete with 0 frames).
    "state-a-coverflow-no-media",
    "state-a-coverflow-photo-only",
    // Zone 5 broken-photo guard: a card whose non-empty photoUrl 404s (no Street
    // View coverage) must fall back to the neutral placeholder, never a blank.
    "state-a-coverflow-broken",
    // Zone 5 on STATE B (the full presentation): the full payload, stamped v2 so
    // it renders through the flagship (the real State-B template), with the
    // SAMPLE recent listings fed in so the exposure coverflow is VISIBLE in the
    // preview. Demo/QA only — real published State-B pages carry recentListings
    // only when the agent has data AND the coverflow flag is on (never sample).
    "full-coverflow",
  ] as const;
  type Variant = (typeof VARIANTS)[number];
  const variant = (VARIANTS as readonly string[]).includes(fixture ?? "")
    ? (fixture as Variant)
    : null;
  if (!variant) {
    // No (or unknown) fixture → 404. Forces explicit `?fixture=…`
    // so an accidental link doesn't render a default page.
    notFound();
  }

  const payload =
    variant === "minimal"
      ? MINIMAL_PAYLOAD
      : variant === "outlink-only"
        ? OUTLINK_ONLY_PAYLOAD
        : variant === "area-partial"
          ? AREA_PARTIAL_PAYLOAD
          : variant === "poster-auto-only"
          ? POSTER_AUTO_ONLY_PAYLOAD
          : variant === "poster-scrub-over-auto"
            ? POSTER_SCRUB_OVER_AUTO_PAYLOAD
            : variant === "poster-override-wins"
              ? POSTER_OVERRIDE_WINS_PAYLOAD
              : variant === "poster-none"
                ? POSTER_NONE_PAYLOAD
                : variant === "flagship-privacy"
                  ? FLAGSHIP_PRIVACY_PAYLOAD
                  : variant === "full-v2"
                    ? { ...FULL_PAYLOAD, templateVersion: 2 }
                    : variant === "full-coverflow"
                    ? {
                        ...FULL_PAYLOAD,
                        templateVersion: 2,
                        recentListings: SAMPLE_RECENT_LISTINGS,
                      }
                    : variant === "full-google"
                      ? {
                          ...FULL_PAYLOAD,
                          reviewsOutlink: {
                            label: "See all reviews on Google",
                            url: "https://www.google.com/maps/place/?cid=12345",
                          },
                        }
                      : variant === "state-a"
                        ? STATE_A_FULL_PAYLOAD
                        : variant === "state-a-minimal"
                          ? STATE_A_MINIMAL_PAYLOAD
                          : variant === "state-a-mixed-coverage"
                            ? STATE_A_MIXED_COVERAGE_PAYLOAD
                            : variant === "state-a-no-video"
                              ? STATE_A_NO_VIDEO_PAYLOAD
                              : variant === "state-a-trend-only"
                                ? STATE_A_TREND_ONLY_PAYLOAD
                                : variant === "state-a-no-stat"
                                  ? STATE_A_NO_STAT_PAYLOAD
                                  : variant === "state-a-coverflow"
                                    ? STATE_A_COVERFLOW_PAYLOAD
                                    : variant === "state-a-coverflow-pair"
                                      ? STATE_A_COVERFLOW_PAIR_PAYLOAD
                                      : variant === "state-a-coverflow-trio"
                                        ? STATE_A_COVERFLOW_TRIO_PAYLOAD
                                        : variant === "state-a-coverflow-single"
                                          ? STATE_A_COVERFLOW_SINGLE_PAYLOAD
                                        : variant === "state-a-coverflow-no-media"
                                          ? STATE_A_COVERFLOW_NO_MEDIA_PAYLOAD
                                        : variant === "state-a-coverflow-photo-only"
                                          ? STATE_A_COVERFLOW_PHOTO_ONLY_PAYLOAD
                                        : variant === "state-a-coverflow-broken"
                                          ? STATE_A_COVERFLOW_BROKEN_PHOTO_PAYLOAD
                                        : FULL_PAYLOAD;

  // E.0 — optional brand-color override (drives the brand-colors e2e
  // regression spec + Dallen's browser smoke). Validated hex only; merged
  // onto the fixture payload's `brandColors`, then routed through the SAME
  // clampPublicPayload boundary as a real publish (SellerPresentationPage
  // re-clamps handout.data). No params → no brandColors → the page renders
  // the production Editorial palette via the CSS var() fallbacks.
  const isHex = (v: string | undefined): v is string =>
    typeof v === "string" && /^#[0-9a-f]{6}$/i.test(v);
  const brandColors: Record<string, string> = {};
  if (isHex(brandBg)) brandColors.background = brandBg;
  if (isHex(brandText)) brandColors.text = brandText;
  if (isHex(brandAccent)) brandColors.accent = brandAccent;
  if (isHex(brandSecondary)) brandColors.secondary = brandSecondary; // E.1
  // F4 — optional white-label override. Merged onto the fixture payload and
  // re-clamped by SellerPresentationPage (clampPublicPayload) exactly like a
  // real publish, so the rendered footer matches the production white-label path.
  const merged: Record<string, unknown> = { ...payload };
  if (Object.keys(brandColors).length > 0) merged.brandColors = brandColors;
  if (suppressWordmark === "1") merged.suppressWordmark = true;
  // MARKETING_ZONE_REDESIGN — `?redesign=1` flips the redesigned marketing zone
  // on for this preview render (re-clamped like a real publish). Render-only.
  if (redesign === "1") merged.marketingZoneRedesign = true;
  // VALUATION_REDESIGN — `?valrange=1` flips the redesigned valuation section on
  // for this preview render. The range is computed from the fixture's OWN comps
  // (which carry sold prices, unlike a real stripped invitation publish) with the
  // same helper the projector uses, then re-clamped like a real publish. Absent
  // range (e.g. the minimal fixture) → the v3 meter flexes out, honesty-only.
  if (valrange === "1") {
    merged.valuationRedesign = true;
    const fixtureComps = Array.isArray((payload as PublicPayload).comps)
      ? (payload as PublicPayload).comps
      : [];
    merged.valuationRange = computeValuationRange(fixtureComps);
  }
  const data = merged as Record<string, unknown>;

  // Wrap the fixture payload in a HandoutRecord so the renderer's
  // contract matches the production /h/[slug] path exactly. The
  // `data` field is the public payload; the rest is record chrome.
  const handout: HandoutRecord = {
    slug: `preview-${variant}`,
    type: "seller-presentation",
    ownerEmail: "preview@example.com",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    data,
  };

  return (
    <>
      <SellerPresentationPage
        handout={handout}
        templateOverride={templateOverride}
        reviewSourceLogos={reviewSourceLogosOverride}
      />
      {isEmbed && <EmbedBridge />}
    </>
  );
}
