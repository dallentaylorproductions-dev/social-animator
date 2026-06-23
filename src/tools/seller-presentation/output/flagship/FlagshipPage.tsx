import type { CSSProperties } from "react";
import type { HandoutRecord } from "@/lib/share-urls";
import { clampPublicPayload } from "../public-payload";
import { consumerRoleVars, deriveConsumerRoles } from "../consumer-roles";
import { PresentationPageMotion } from "../motion";
import {
  isViewedSignalEngagementEnabled,
  viewSignalSlugFor,
} from "@/lib/seller-presentation/viewed-signal";
import { newsreader } from "./fonts";
import { Hero } from "./Hero";
import { Price } from "./Price";
import { AgentNote } from "./AgentNote";
import { WhyPrice } from "./WhyPrice";
import { WhyUs } from "./WhyUs";
import { CampaignSpread } from "./CampaignSpread";
import { Reviews } from "./Reviews";
import { AreaStats } from "./AreaStats";
import { AgentBand } from "./AgentBand";
import "./flagship.css";

/**
 * FlagshipPage — the v2 (templateVersion: 2) consumer-page template (F2).
 *
 * Renders the SAME public payload as v1 (read via clampPublicPayload, the
 * shared privacy boundary), through the converged editorial layout. It
 * consumes ONLY the signature ramp: `deriveConsumerRoles(brandColors.accent)`
 * resolves the full role set (post-clamp hexes + layout-locked neutrals),
 * inlined as CSS custom properties on the flagship root — the ONE place they
 * are declared, so `var(--signature)` etc. are in scope for the whole subtree
 * (declaring on :root would leave them invalid). `brandColors.background/text`
 * are IGNORED — paper + ink are layout-locked.
 *
 * Applying `newsreader.variable` here (and only here) is what attaches the
 * self-hosted display serif. Combined with the dynamic import in
 * presentation-page.tsx, the Newsreader @font-face and `flagship.css` land in
 * FlagshipPage's own code-split chunk — never the v1 CSS chunk — so v1 pages
 * stay byte-identical and load neither.
 *
 * The shared `PresentationPageMotion` island is mounted verbatim (no fork):
 * the flagship markup adopts the same `.reveal` / `.chart` / price count-up
 * (`data-price-countup`) hooks the driver already keys on.
 */
/** Format an instant as "Mon YYYY" (e.g. "Jun 2026"). */
function monthYear(d: Date): string {
  return d.toLocaleDateString("en-US", { month: "short", year: "numeric" });
}

/**
 * "Mon YYYY" from an ISO timestamp, or null when it is missing / unparseable /
 * a sentinel (e.g. the live preview's 1970 placeholder record), so the caller
 * can fall through to a real date.
 */
function monthYearFromIso(iso: string | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime()) || d.getUTCFullYear() < 2005) return null;
  return monthYear(d);
}

/** "Mon YYYY" for the current month - last-resort "as of" fallback. */
function currentMonthYear(): string {
  return monthYear(new Date());
}

export function FlagshipPage({
  handout,
  reviewSourceLogos = false,
}: {
  handout: HandoutRecord;
  /**
   * REVIEW_SOURCE_LOGOS_ENABLED - forwarded to the review card so it shows the
   * detected source's brand-logo chip. Defaults false: a flag-off render (and
   * the wizard live preview before its entitlement resolves) is byte-identical.
   */
  reviewSourceLogos?: boolean;
}) {
  const payload = clampPublicPayload(handout.data);
  const roles = deriveConsumerRoles(payload.brandColors?.accent);

  // "as of <Mon YYYY>" for the Google aggregate-rating attribution: the payload
  // value when set, else the page's published / last-updated month, else the
  // current month. Resolved here (the review card only receives `payload`) so
  // both the published page and the live preview share one source of truth.
  const reviewsAsOf =
    payload.reviewsAsOf ??
    monthYearFromIso(handout.updatedAt) ??
    monthYearFromIso(handout.createdAt) ??
    currentMonthYear();

  // Inline the resolved role hexes as custom properties on the flagship root
  // (the signatured element). These are the live path; no CSS color-mix
  // fallback is needed because the engine already resolved every clamp. The
  // `role → --token` map is shared with the Brand-kit live preview via
  // consumerRoleVars (one color path for preview + real page).
  const roleVars = consumerRoleVars(roles) as CSSProperties;

  return (
    <div
      className={`fs-page ${newsreader.variable}`}
      style={roleVars}
      data-flagship-shell
      data-testid="seller-presentation-flagship"
    >
      <div className="fs-frame">
        <Hero payload={payload} />
        <Price payload={payload} />
        <AgentNote payload={payload} />
        <WhyPrice payload={payload} />
        {/* D1-CLEANUP — the "why list with us" chapter in its SELLER variant: the
            redundant differentiators wall is dropped; the agent's non-marketing
            pitch cards become a "Selling points" section; marketing-themed pitch
            joins "How we market" (cap 4); the guarantee moves to the Agent block.
            Flexes out entirely when nothing renderable is present. */}
        <WhyUs payload={payload} variant="seller" />
        {/* Zone 5 exposure proof — the reach-proof coverflow (recent listings,
            real reach), placed right after the "how we market" story and before
            the social proof, mirroring State A's Zone-5 position. `coverflow-only`
            so it shows ONLY the listings coverflow + reach line (State B already
            tells the marketing story above) — the same CampaignSpread component
            State A uses, no fork. Flexes out entirely when the page carries no
            recentListings (flag-off / no agent data), so it's byte-identical to
            today's State B until the coverflow flag is on AND data exists. */}
        <CampaignSpread payload={payload} variant="coverflow-only" />
        <Reviews
          payload={payload}
          sourceLogos={reviewSourceLogos}
          reviewsAsOf={reviewsAsOf}
        />
        <AreaStats payload={payload} />
        {/* AgentBand now folds in the prototype's agent__foot (wordmark +
            disclaimer). Wordmark is a conditional white-label slot (F4):
            suppressed when the payload's white-label flag is set; the disclaimer
            always renders. */}
        <AgentBand
          payload={payload}
          showWordmark={payload.suppressWordmark !== true}
          showGuarantee
        />
      </div>
      <PresentationPageMotion
        viewSignalSlug={viewSignalSlugFor(handout)}
        engagementEnabled={isViewedSignalEngagementEnabled()}
      />
    </div>
  );
}
