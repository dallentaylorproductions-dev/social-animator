"use client";

/**
 * Buyer Tour Brief — live preview of the in-progress draft (BUYER_TOUR_BUILDER_V2,
 * Lever 1). Renders the REAL buyer page (`BuyerTourPage`) from the current draft so
 * the agent sees exactly what the buyer will see as they build — form-filling becomes
 * making. It runs the SAME allow-list projection the publish route uses
 * (`toBuyerTourPublicPayload`), so the preview can never show a field the published
 * page would not, and it renders the v0 or V1 arrangement per the live buyer flag
 * (passed in server-resolved as `v1`, since the client cannot read the server-only
 * BUYER_TOUR_BRIEF_V1 env var itself).
 *
 * Read-only: no publish needed, no engagement tracking (`analytics={false}` → the
 * tracker island never mounts), no slug. The parent workspace hands this a DEBOUNCED
 * draft, so typing is never blocked by a synchronous re-render.
 *
 * School section: the real GreatSchools "School context" is a LIVE server fetch at
 * render on `/tour/[slug]` (never client-side, ToS 3.2.2 / 3.2.8), so the preview
 * cannot reproduce it faithfully. When the agent's toggle is on (and the flag is
 * available) we render a calm PLACEHOLDER node in its place so the agent knows the
 * section will appear on the published page — matching the packet's "the preview does
 * not need to live-fetch."
 */

import { useMemo, type ReactNode } from "react";
import type { BuyerTourAgent, BuyerTourDraft } from "../engine/types";
import {
  toBuyerTourPublicPayload,
} from "../output/public-payload";
import { BuyerTourPage } from "../output/BuyerTourPage";

export interface BuyerTourPreviewProps {
  /** The (debounced) in-progress draft. */
  draft: BuyerTourDraft;
  /** Commute-anchor label/address, held separately in the builder until publish. */
  anchorLabel: string;
  anchorAddress: string;
  /** Agent identity + brand accent, resolved from Brand Settings by the workspace. */
  agent: BuyerTourAgent;
  brandAccent?: string;
  /** BUYER_TOUR_BRIEF_V1 — the live buyer arrangement (server-resolved, passed down). */
  v1: boolean;
  /** GREATSCHOOLS_ENABLED — whether to show the school-section placeholder. */
  schoolLayerAvailable: boolean;
}

export function BuyerTourPreview({
  draft,
  anchorLabel,
  anchorAddress,
  agent,
  brandAccent,
  v1,
  schoolLayerAvailable,
}: BuyerTourPreviewProps) {
  // Merge the separately-held anchor into the draft exactly as the publish path does,
  // so the preview's map pin matches what will publish.
  const payload = useMemo(() => {
    const resolved: BuyerTourDraft = {
      ...draft,
      commuteAnchor:
        anchorLabel || anchorAddress
          ? {
              label: anchorLabel,
              address: anchorAddress,
              ...(draft.commuteAnchor?.lat !== undefined &&
              draft.commuteAnchor?.lng !== undefined
                ? { lat: draft.commuteAnchor.lat, lng: draft.commuteAnchor.lng }
                : {}),
            }
          : draft.commuteAnchor,
    };
    return toBuyerTourPublicPayload(resolved, agent, brandAccent);
  }, [draft, anchorLabel, anchorAddress, agent, brandAccent]);

  const schoolSection: ReactNode =
    schoolLayerAvailable && draft.schoolLayer === true ? (
      <section
        aria-label="School context (preview placeholder)"
        style={{
          margin: "0 auto",
          maxWidth: 640,
          padding: "20px 24px",
          borderRadius: 16,
          border: "1px dashed #cbbfa6",
          background: "#faf6ee",
          color: "#6b5f49",
          fontFamily:
            '"Iowan Old Style", "Palatino Linotype", Palatino, Georgia, serif',
          fontSize: 14,
          lineHeight: 1.5,
          textAlign: "center",
        }}
      >
        The GreatSchools “School context” section appears here on the published
        page — the nearest rated school for each home, fetched live when the tour
        is opened. It is not shown in this preview.
      </section>
    ) : null;

  return (
    <BuyerTourPage
      payload={payload}
      schoolSection={schoolSection}
      v1={v1}
      analytics={false}
    />
  );
}
