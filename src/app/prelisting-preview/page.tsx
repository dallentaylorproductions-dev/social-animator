import { notFound } from "next/navigation";
import type { HandoutRecord } from "@/lib/share-urls";
import { PrelistingPage } from "@/tools/seller-presentation/output/prelisting/PrelistingPage";
import {
  PRELISTING_FULL,
  PRELISTING_MINIMAL,
  PRELISTING_PARTIAL,
} from "@/tools/seller-presentation/output/__fixtures__/prelisting-payload";

/**
 * Dev preview route for the standalone pre-listing page (B0c). Renders
 * PrelistingPage from a compiled-in fixture without a real publish + auth + KV
 * — the e2e render spec + browser smoke exercise the page directly.
 *
 * URL: `/prelisting-preview?fixture=full|minimal|partial`
 *
 * NOT in the middleware matcher (same pattern as /seller-presentation-preview),
 * so tooling + tests reach it without auth. Safe in production: reads only
 * compiled-in fixtures, accepts no user input.
 */
export const dynamic = "force-dynamic";

interface PageProps {
  searchParams: Promise<{ fixture?: string }>;
}

const FIXTURES = {
  full: PRELISTING_FULL,
  minimal: PRELISTING_MINIMAL,
  partial: PRELISTING_PARTIAL,
} as const;

export default async function PrelistingPreview({ searchParams }: PageProps) {
  const { fixture } = await searchParams;
  const payload = fixture ? FIXTURES[fixture as keyof typeof FIXTURES] : undefined;
  if (!payload) {
    // Force an explicit, known `?fixture=…` so a stray link doesn't render.
    notFound();
  }

  // Wrap the fixture in a HandoutRecord so the renderer's contract matches the
  // production /why/[slug] path exactly (PrelistingPage clamps record.data).
  const handout: HandoutRecord = {
    slug: `preview-${fixture}`,
    type: "prelisting",
    ownerEmail: "preview@example.com",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    data: payload as unknown as Record<string, unknown>,
  };

  return <PrelistingPage record={handout} />;
}
