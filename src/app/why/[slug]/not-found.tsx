import { Card, DisplayHeadline } from "@/components/ui";

/**
 * Branded 404 for the /why/[slug] pre-listing page (B0c).
 *
 * Triggered when fetchPrelistingPage returns null — missing, revoked, or
 * expired record. The recipient lands here on a stale link, so the page stays
 * polished rather than generic. Mirrors the /h/[slug] 404 surface.
 */
export default function PrelistingNotFound() {
  return (
    <main className="min-h-screen flex items-center justify-center px-4 py-12 bg-canvas">
      <Card className="max-w-md text-center">
        <DisplayHeadline
          size="2xl"
          text="This page isn't available"
          emphasis="page"
          as="h1"
        />
        <p className="mt-4 text-sm text-text-secondary leading-relaxed">
          The link may have been removed. Ask your agent for a fresh one.
        </p>
      </Card>
    </main>
  );
}
