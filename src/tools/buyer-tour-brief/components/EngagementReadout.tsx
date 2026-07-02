"use client";

/**
 * Buyer Tour Brief — the agent's per-tour engagement readout (BUYER_TOUR_ANALYTICS).
 *
 * A small, quiet "How your buyer engaged" block for the `/buyer-tour` builder. It
 * fetches the owner-authenticated summary from `GET /api/buyer-tour/track?slug=…` and
 * renders a handful of calm, factual lines derived from the stored counters (e.g.
 * "Opened 3 times. Reached the comparison. Tapped Home A and Home C."). No hype, no
 * surveillance-flavored copy — consistent with the product's calm, non-AI voice.
 *
 * Shown only once a tour has a slug (after publish/update). With no data yet it renders
 * a calm "No views yet." Only mounted when analytics is enabled (the builder gates it),
 * so it never appears while the flag is dark.
 */

import { useCallback, useEffect, useState } from "react";
import type { EngagementSummary } from "../engine/engagement";

type LoadState =
  | { kind: "loading" }
  | { kind: "error" }
  | { kind: "ready"; summary: EngagementSummary };

export function EngagementReadout({ slug }: { slug: string }) {
  const [state, setState] = useState<LoadState>({ kind: "loading" });

  // Fetch the summary WITHOUT synchronously setting "loading" (the initial state is
  // already "loading", and the refresh handler sets it before calling this) — so the
  // effect never triggers a cascading synchronous setState.
  const fetchSummary = useCallback(async () => {
    try {
      const res = await fetch(
        `/api/buyer-tour/track?slug=${encodeURIComponent(slug)}`,
        { cache: "no-store" },
      );
      const json = (await res.json()) as
        | { ok: true; summary: EngagementSummary }
        | { ok: false; code: string };
      setState(json.ok ? { kind: "ready", summary: json.summary } : { kind: "error" });
    } catch {
      setState({ kind: "error" });
    }
  }, [slug]);

  const refresh = useCallback(() => {
    setState({ kind: "loading" });
    void fetchSummary();
  }, [fetchSummary]);

  useEffect(() => {
    // Legitimate data-fetch-on-mount: setState happens only AFTER the awaited fetch
    // resolves (never synchronously in the effect body), so there's no cascading
    // render. The rule can't see through the async boundary.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void fetchSummary();
  }, [fetchSummary]);

  return (
    <div
      className="mt-4 rounded-md border border-neutral-800 bg-neutral-900/40 p-4"
      data-testid="btb-engagement-readout"
    >
      <div className="flex items-center justify-between">
        <p className="text-xs uppercase tracking-wide text-neutral-400">
          How your buyer engaged
        </p>
        <button
          type="button"
          onClick={refresh}
          className="text-[11px] text-neutral-500 hover:text-neutral-300"
          data-testid="btb-engagement-refresh"
        >
          Refresh
        </button>
      </div>

      {state.kind === "loading" && (
        <p className="mt-2 text-sm text-neutral-500">Checking…</p>
      )}

      {state.kind === "error" && (
        <p className="mt-2 text-sm text-neutral-500" data-testid="btb-engagement-error">
          Couldn&apos;t load engagement just now.
        </p>
      )}

      {state.kind === "ready" && state.summary.empty && (
        <p className="mt-2 text-sm text-neutral-400" data-testid="btb-engagement-empty">
          No views yet.
        </p>
      )}

      {state.kind === "ready" && !state.summary.empty && (
        <ul className="mt-2 space-y-1" data-testid="btb-engagement-lines">
          {state.summary.lines.map((line, i) => (
            <li key={i} className="text-sm text-neutral-200">
              {line}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
