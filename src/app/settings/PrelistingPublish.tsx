"use client";

import { useEffect, useRef, useState } from "react";
import { useBrandSettings } from "@/lib/brand";
import { brandToPublishInputs } from "@/tools/seller-presentation/components/preview/preview-payload";

/**
 * B0c — "Publish my pre-listing page" Settings action.
 *
 * Snapshots the agent-constant brand fields (identity, "Why us", tagline,
 * reviews, brand color) into a DURABLE per-agent page and shows a copyable
 * link. Republishing updates the SAME url — the agent texts it once and keeps
 * it current. Reads Settings via the SAME `brandToPublishInputs` the seller
 * page + wizard preview use, so the standalone page never drifts from them.
 *
 * Self-contained: its own `useBrandSettings` (localStorage), its own publish
 * state machine. No new paywall logic — the route resolves entitlements
 * server-side exactly like the seller publish.
 */

type PublishState =
  | { kind: "idle" }
  | { kind: "publishing" }
  | { kind: "published"; url: string }
  | { kind: "error"; message: string };

export function PrelistingPublish() {
  const { settings: brand } = useBrandSettings();
  const [state, setState] = useState<PublishState>({ kind: "idle" });

  const hasName = !!brand.agentName?.trim();

  async function handlePublish() {
    const { agentContact, brandReviews, brandColors, brandWhyUs } =
      brandToPublishInputs(brand);
    setState({ kind: "publishing" });
    try {
      const res = await fetch("/api/seller-presentation/publish-prelisting", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          agentContact,
          brandWhyUs,
          brandReviews,
          brandColors,
        }),
      });
      const body = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        slug?: string;
        error?: string;
      };
      if (!res.ok || !body.ok || !body.slug) {
        setState({
          kind: "error",
          message: body.error ?? `Publish failed (${res.status})`,
        });
        return;
      }
      const origin =
        typeof window !== "undefined" ? window.location.origin : "";
      setState({ kind: "published", url: `${origin}/why/${body.slug}` });
    } catch (err) {
      setState({
        kind: "error",
        message: err instanceof Error ? err.message : "Publish failed",
      });
    }
  }

  return (
    <div className="space-y-4" data-testid="prelisting-publish">
      {!hasName && (
        <p className="text-[11px] text-amber-400/90 leading-relaxed">
          Set your agent / team name in the brand profile above first. The
          page leads with your identity.
        </p>
      )}

      {state.kind === "published" ? (
        <div className="space-y-3" data-testid="prelisting-published">
          <div className="flex items-center gap-2">
            <span
              className="inline-block w-2 h-2 rounded-full bg-mint"
              aria-hidden
            />
            <span className="text-sm font-medium text-text-primary">
              Pre-listing page published
            </span>
          </div>
          <div className="flex items-center gap-2">
            <code
              className="flex-1 truncate rounded-md border border-neutral-800 bg-neutral-900 px-3 py-2 text-xs text-neutral-300"
              data-testid="prelisting-url"
            >
              {state.url}
            </code>
            <CopyButton value={state.url} />
          </div>
          <p className="text-[11px] text-neutral-600 leading-relaxed">
            This is your permanent link. Edit your brand profile and publish
            again any time. The same link updates, so it stays good to text.
          </p>
          <button
            type="button"
            onClick={handlePublish}
            className="text-xs text-mint hover:underline"
            data-testid="prelisting-republish"
          >
            Update this page
          </button>
        </div>
      ) : state.kind === "error" ? (
        <div className="space-y-2" data-testid="prelisting-error">
          <p className="text-sm text-red-400">Something went wrong</p>
          <p className="text-xs text-neutral-500">{state.message}</p>
          <button
            type="button"
            onClick={handlePublish}
            className="rounded border border-neutral-700 px-3 py-1.5 text-xs text-text-primary hover:bg-neutral-800"
          >
            Try again
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={handlePublish}
          disabled={!hasName || state.kind === "publishing"}
          data-testid="prelisting-publish-btn"
          className="rounded-md bg-mint px-4 py-2 text-sm font-medium text-black hover:bg-mint/90 disabled:opacity-40 disabled:hover:bg-mint transition"
        >
          {state.kind === "publishing"
            ? "Publishing…"
            : "Publish my pre-listing page"}
        </button>
      )}
    </div>
  );
}

/** Small copy-to-clipboard button with a 2-second confirmation. */
function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current !== null) clearTimeout(timerRef.current);
    };
  }, []);

  const handleClick = () => {
    try {
      void navigator.clipboard?.writeText(value);
    } catch {
      // best-effort
    }
    setCopied(true);
    if (timerRef.current !== null) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setCopied(false), 2000);
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      aria-live="polite"
      data-testid="prelisting-copy"
      className="rounded-md border border-neutral-700 px-3 py-2 text-xs text-text-primary hover:bg-neutral-800 whitespace-nowrap"
    >
      {copied ? "Copied!" : "Copy link"}
    </button>
  );
}
