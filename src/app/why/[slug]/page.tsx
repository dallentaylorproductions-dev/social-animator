import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { fetchPrelistingPage } from "@/lib/share-urls";
import { clampPrelistingPayload } from "@/tools/seller-presentation/output/public-payload";
import { PrelistingPage } from "@/tools/seller-presentation/output/prelisting/PrelistingPage";

/**
 * Public recipient-facing pre-listing page (B0c).
 *
 * The DURABLE, agent-constant "why list with us" page an agent texts a
 * homeowner BEFORE the appointment. Unlike the per-publish seller pages at
 * `/h/[slug]` (a new url every publish), this is ONE page per agent at a STABLE
 * slug derived from the agent's identity (`deriveAgentPageSlug`), so the agent
 * can text the link once and keep it current: republishing updates the SAME
 * url (durable, never GC'd — the cohort-example durable-URL lesson).
 *
 * It reads its own KV namespace (`prelisting:<slug>`) via `fetchPrelistingPage`
 * — entirely separate from the seller pages, so this route never touches
 * `/h/[slug]`. Missing / revoked / expired records render the colocated branded
 * 404 (not-found.tsx).
 *
 * Cache-Control per the seller-page precedent (D10): no CDN caching of the HTML
 * so an edit-then-republish flows through on the next view; KV reads are <10ms.
 */
export const dynamic = "force-dynamic";
export const revalidate = 0;

interface PageProps {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const record = await fetchPrelistingPage(slug);
  if (!record) {
    return { title: "Page not available" };
  }
  const data = clampPrelistingPayload(record.data);
  const agentName = data.agent.name?.trim();
  const title = agentName ? `${agentName} · Why list with us` : "Why list with us";
  const description = "A little about how we work, before we meet.";
  return {
    title,
    description,
    openGraph: { title, description, type: "website" },
    twitter: { card: "summary_large_image", title, description },
  };
}

export default async function PrelistingRoute({ params }: PageProps) {
  const { slug } = await params;
  const record = await fetchPrelistingPage(slug);
  if (!record) notFound();
  return <PrelistingPage record={record} />;
}
