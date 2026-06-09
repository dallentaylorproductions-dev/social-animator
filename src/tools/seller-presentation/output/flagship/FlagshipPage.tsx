import type { CSSProperties } from "react";
import type { HandoutRecord } from "@/lib/share-urls";
import { clampPublicPayload } from "../public-payload";
import { consumerRoleVars, deriveConsumerRoles } from "../consumer-roles";
import { PresentationPageMotion } from "../motion";
import { newsreader } from "./fonts";
import { Hero } from "./Hero";
import { Price } from "./Price";
import { AgentNote } from "./AgentNote";
import { WhyPrice } from "./WhyPrice";
import { Pitch } from "./Pitch";
import { WhyUs } from "./WhyUs";
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
export function FlagshipPage({ handout }: { handout: HandoutRecord }) {
  const payload = clampPublicPayload(handout.data);
  const roles = deriveConsumerRoles(payload.brandColors?.accent);

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
        <Pitch payload={payload} />
        {/* B0b — the agent-constant "why list with us" chapter, framing the
            seller's reasons-to-choose alongside the home-specific story. Flexes
            out entirely when no why-us content was configured. */}
        <WhyUs payload={payload} />
        <Reviews payload={payload} />
        <AreaStats payload={payload} />
        {/* AgentBand now folds in the prototype's agent__foot (wordmark +
            disclaimer). Wordmark is a conditional white-label slot (F4):
            suppressed when the payload's white-label flag is set; the disclaimer
            always renders. */}
        <AgentBand
          payload={payload}
          showWordmark={payload.suppressWordmark !== true}
        />
      </div>
      <PresentationPageMotion />
    </div>
  );
}
