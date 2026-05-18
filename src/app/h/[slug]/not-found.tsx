import { Card, DisplayHeadline } from '@/components/ui';

/**
 * Branded 404 for the /h/[slug] route (OH Prep Commit 2 / Audit 1B).
 *
 * Triggered when fetchHandout returns null — covers missing slug,
 * revoked handout, and expired handout (the past-event auto-revoke
 * from D5). Recipient lands here when they tap a stale link, so the
 * page is polished, not generic.
 */
export default function HandoutNotFound() {
  return (
    <main className="min-h-screen flex items-center justify-center px-4 py-12 bg-canvas">
      <Card className="max-w-md text-center">
        <DisplayHeadline
          size="2xl"
          text="This handout isn't available"
          emphasis="handout"
          as="h1"
        />
        <p className="mt-4 text-sm text-text-secondary leading-relaxed">
          The link may have expired or been removed. Ask your agent for a
          fresh one.
        </p>
      </Card>
    </main>
  );
}
