import { notFound } from "next/navigation";
import type { HandoutRecord } from "@/lib/share-urls";
import { SellerPresentationPage } from "@/tools/seller-presentation/output/presentation-page";
import {
  FULL_PAYLOAD,
  MINIMAL_PAYLOAD,
  OUTLINK_ONLY_PAYLOAD,
  POSTER_AUTO_ONLY_PAYLOAD,
  POSTER_OVERRIDE_WINS_PAYLOAD,
  POSTER_SCRUB_OVER_AUTO_PAYLOAD,
} from "@/tools/seller-presentation/output/__fixtures__/sample-payload";

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
  searchParams: Promise<{ fixture?: string }>;
}

export default async function SellerPresentationPreview({ searchParams }: PageProps) {
  const { fixture } = await searchParams;
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
              : FULL_PAYLOAD;

  // Wrap the fixture payload in a HandoutRecord so the renderer's
  // contract matches the production /h/[slug] path exactly. The
  // `data` field is the public payload; the rest is record chrome.
  const handout: HandoutRecord = {
    slug: `preview-${variant}`,
    type: "seller-presentation",
    ownerEmail: "preview@example.com",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    data: payload as unknown as Record<string, unknown>,
  };

  return <SellerPresentationPage handout={handout} />;
}
