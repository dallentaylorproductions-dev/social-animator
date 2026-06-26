"use client";

import type { CSSProperties } from "react";
import type { PublicPayload } from "@/tools/seller-presentation/output/public-payload";
import {
  consumerRoleVars,
  deriveConsumerRoles,
} from "@/tools/seller-presentation/output/consumer-roles";
import { formatAppointment } from "@/tools/seller-presentation/engine/appointment";
import { newsreader } from "@/tools/seller-presentation/output/flagship/fonts";
import { AgentBand } from "@/tools/seller-presentation/output/flagship/AgentBand";
import { StateAHero } from "@/tools/seller-presentation/output/flagship/StateAHero";
import { CampaignSpread } from "@/tools/seller-presentation/output/flagship/CampaignSpread";
import {
  ConfirmTime,
  TrustStrip,
} from "@/tools/seller-presentation/output/flagship/StateAPage";
// Co-load the REAL seller-page styles so the isolated section paints exactly as
// it does on the published State-A page (the rules are `.fs-page`-scoped, so
// they don't leak into the studio chrome). This is what makes the preview the
// real component, not a visual copy.
import "@/tools/seller-presentation/output/flagship/flagship.css";
import "@/tools/seller-presentation/output/flagship/state-a.css";
import type { SegmentKey } from "@/lib/studio-profile/setup-state";

/**
 * AssetPreviewFrame — the live asset-preview stage (Studio Profile, Slice 1).
 *
 * Renders ONE real State-A seller-page section, isolated, from an injected
 * (unsaved) PublicPayload — so each field visibly improves a real asset. It is a
 * PURE render: no engagement beacon, no publish, no instance, no KV. The
 * side-effecting `PresentationPageMotion` island is NEVER mounted here (it lives
 * only on the full page wrappers), so this stage has no write path at all.
 *
 * The wrapper reproduces what the page roots (StateAPage/FlagshipPage) do so the
 * `.fs-page`-scoped CSS + the `var(--signature)` ramp resolve: the `.fs-page
 * state-a` shell carries the role vars + the Newsreader serif, and the section
 * sits inside a `.fs-frame`. Only ONE asset shows at a time — never the whole
 * page — so the agent never gets the "this is huge" feeling.
 *
 *   You   → AgentBand identity-only (the real agent-identity band: headshot /
 *           initials + name + brokerage; CTAs + foot suppressed) — the exact
 *           seller-facing identity asset the You step improves, NOT the property
 *           hero (which is too broad and crops to a washed-out blank on mobile).
 *   Reach → ConfirmTime (the real contact / CTA block)
 *   Proof → TrustStrip (the real cream testimonial)
 *   Sell  → CampaignSpread (the real redesigned "How I'll get your home seen")
 *   Work  → CampaignSpread (showcase media + the real recent-listings coverflow)
 *   Brand → AgentBand (accent CTA buttons + the logo lockup — color & logo plain)
 *
 * When a section has nothing to render yet (no contact / no proof), it flexes
 * out to null on the real page — here we show a calm ghost so the stage is never
 * an empty void, and the agent sees the slot the field will fill.
 */
export function AssetPreviewFrame({
  payload,
  asset,
  saved,
  reducedMotion,
  youIdentity = false,
}: {
  payload: PublicPayload;
  asset: SegmentKey;
  /** True briefly after a commit — plays the dedicated "finished" animation. */
  saved: boolean;
  reducedMotion: boolean;
  /**
   * MOBILE-only: render the You step as the isolated AgentBand AGENT IDENTITY
   * (the mobile editing lens). Desktop leaves this false and keeps the original
   * StateAHero hero — so the desktop console preview is byte-identical to before.
   */
  youIdentity?: boolean;
}) {
  const roleVars = consumerRoleVars(
    deriveConsumerRoles(payload.brandColors?.accent),
  ) as CSSProperties;
  const appt = formatAppointment(payload.appointmentAt);

  let body: React.ReactNode = null;
  let ghost: string | null = null;

  if (asset === "you") {
    // MOBILE (youIdentity): the isolated AGENT IDENTITY band (identity-only: no
    // contact CTAs, no disclaimer foot) — the real seller-facing identity asset
    // the You step improves. DESKTOP keeps the original StateAHero hero so the
    // desktop console preview stays byte-identical. AgentBand returns null without
    // a name; the You preview payload seeds a sample identity so it's never blank.
    body = youIdentity ? (
      <AgentBand payload={payload} showCtas={false} showFoot={false} />
    ) : (
      <StateAHero payload={payload} appt={appt} />
    );
  } else if (asset === "reach") {
    const hasContact = !!(payload.agent.email || payload.agent.phone);
    if (hasContact) body = <ConfirmTime payload={payload} appt={appt} />;
    else ghost = "Your contact buttons appear here once you add a way to reach you.";
  } else if (asset === "proof") {
    const hasProof = !!(payload.reviews?.length || payload.reviewsOutlink);
    if (hasProof) body = <TrustStrip payload={payload} sourceLogos={false} />;
    else ghost = "The proof a seller can trust appears here once you add a review.";
  } else if (asset === "sell") {
    // The redesigned marketing zone (payload carries marketingZoneRedesign).
    body = <CampaignSpread payload={payload} />;
  } else if (asset === "work") {
    // Full marketing zone so EVERY field this step captures is visible: the
    // sample photo/video in "the work" showcase AND the recent-listings
    // coverflow (the redesigned zone renders both).
    body = <CampaignSpread payload={payload} />;
  } else if (asset === "brand") {
    // The agent band — accent-colored CTA buttons + the logo lockup — so the
    // signature color AND the logo are both plainly visible as they change.
    body = <AgentBand payload={payload} />;
  }

  const animate = saved && !reducedMotion;

  return (
    <div
      className={`sp-asset${animate ? " sp-asset--saved" : ""}`}
      data-testid={`sp-asset-${asset}`}
      data-saved={saved ? "true" : "false"}
    >
      <div
        className={`fs-page state-a ${newsreader.variable} sp-asset__page`}
        style={roleVars}
        data-flagship-shell
      >
        <div className="fs-frame">
          {body ?? (
            <div className="sp-asset__ghost" data-testid={`sp-asset-ghost-${asset}`}>
              {ghost}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
