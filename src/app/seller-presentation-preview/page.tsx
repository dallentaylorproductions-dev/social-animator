import { notFound } from "next/navigation";
import type { HandoutRecord } from "@/lib/share-urls";
import { SellerPresentationPage } from "@/tools/seller-presentation/output/presentation-page";
import {
  FULL_PAYLOAD,
  MINIMAL_PAYLOAD,
  OUTLINK_ONLY_PAYLOAD,
  POSTER_AUTO_ONLY_PAYLOAD,
  POSTER_NONE_PAYLOAD,
  POSTER_OVERRIDE_WINS_PAYLOAD,
  POSTER_SCRUB_OVER_AUTO_PAYLOAD,
} from "@/tools/seller-presentation/output/__fixtures__/sample-payload";
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
  }>;
}

export default async function SellerPresentationPreview({ searchParams }: PageProps) {
  const { fixture, brandBg, brandText, brandAccent, brandSecondary, embed } =
    await searchParams;
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
    "poster-auto-only",
    "poster-scrub-over-auto",
    "poster-override-wins",
    // A7d.8.1 — never-blank fallback fixture: video set but all three
    // poster slots empty (the iOS capture-timeout scenario).
    "poster-none",
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
        : variant === "poster-auto-only"
          ? POSTER_AUTO_ONLY_PAYLOAD
          : variant === "poster-scrub-over-auto"
            ? POSTER_SCRUB_OVER_AUTO_PAYLOAD
            : variant === "poster-override-wins"
              ? POSTER_OVERRIDE_WINS_PAYLOAD
              : variant === "poster-none"
                ? POSTER_NONE_PAYLOAD
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
  const data = (
    Object.keys(brandColors).length > 0 ? { ...payload, brandColors } : payload
  ) as unknown as Record<string, unknown>;

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
      <SellerPresentationPage handout={handout} />
      {isEmbed && <EmbedBridge />}
    </>
  );
}
