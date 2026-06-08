import type { CSSProperties } from "react";
import type { HandoutRecord } from "@/lib/share-urls";
import {
  clampPrelistingPayload,
  type AgentBranding,
  type PublicPayload,
  type StandalonePrelistingPayload,
} from "../public-payload";
import { consumerRoleVars, deriveConsumerRoles } from "../consumer-roles";
import { PresentationPageMotion } from "../motion";
import { newsreader } from "../flagship/fonts";
import { WhyUs } from "../flagship/WhyUs";
import { Reviews } from "../flagship/Reviews";
import { AgentBand } from "../flagship/AgentBand";
import { Footer } from "../flagship/Footer";
import "../flagship/flagship.css";
import "./prelisting.css";

/**
 * PrelistingPage — the standalone, agent-constant "why list with us" page
 * (B0c). The durable page an agent texts a homeowner BEFORE the listing
 * appointment: the "before I show up, here's a little about us" surface.
 *
 * It is NOT a seller page: it carries NONE of the listing-specific data (no
 * comps, recommended price, hero photo of a home, area chart). It composes the
 * agent-constant flagship blocks verbatim — AgentBand (identity), the B0b WhyUs
 * package, Reviews — and closes on ONE intentional CTA (no menu of options).
 *
 * Design language: the flagship system, reused wholesale. The same signature
 * ramp (`deriveConsumerRoles(brandColors.accent)` → role vars on the `.fs-page`
 * root, the one place they're declared), the same self-hosted Newsreader serif
 * (`newsreader.variable`, attached here so it lands in THIS page's code-split
 * chunk), and the same motion island. Paper + ink are layout-locked; brand
 * background/text are ignored — exactly as the seller flagship does.
 *
 * The reused sections type their prop as `PublicPayload`, so we project the
 * narrow `StandalonePrelistingPayload` onto a render view with empty listing
 * defaults (`renderView`). The privacy boundary is `clampPrelistingPayload`
 * (field-by-field); renderView only fills the listing slots the agent-constant
 * page never shows with empties.
 *
 * FLEX: each block hides cleanly when its content is empty (WhyUs flexes per
 * sub-block and absents itself when nothing was configured; Reviews absents
 * when there are no reviews and no outlink; AgentBand absents with no agent
 * name; the CTA absents with no email/phone). The page reads complete with
 * whatever the agent has filled.
 */
export function PrelistingPage({ record }: { record: HandoutRecord }) {
  const data = clampPrelistingPayload(record.data);
  const roles = deriveConsumerRoles(data.brandColors?.accent);
  const roleVars = consumerRoleVars(roles) as CSSProperties;
  const view = renderView(data);

  return (
    <div
      className={`fs-page ${newsreader.variable}`}
      style={roleVars}
      data-flagship-shell
      data-testid="prelisting-flagship"
    >
      <div className="fs-frame">
        {/* Agent identity — the opener. The dual seller-page CTA is suppressed
            (showCtas={false}) so the page has ONE decided close below; the
            section index is dropped (eyebrowIndex="") for a clean un-numbered
            standalone composition. */}
        <AgentBand payload={view} eyebrowIndex="" showCtas={false} />
        {/* The agent-constant "why list with us" case. */}
        <WhyUs payload={view} />
        {/* Curated reviews + outlink, agent-constant. */}
        <Reviews payload={view} eyebrowIndex="" />
        {/* The intentional close — ONE next step. */}
        <PrelistingCta agent={view.agent} />
        {/* Footer: disclaimer always; wordmark gated by the white-label flag. */}
        <Footer payload={view} showWordmark={data.suppressWordmark !== true} />
      </div>
      <PresentationPageMotion />
    </div>
  );
}

/**
 * The single intentional close (B0c "arrives done" handoff): ONE "Schedule a
 * listing consultation" action — never a menu. Reuses the flagship primary
 * button markup + the agent's reassurance line verbatim. Prefers email
 * (mailto); falls back to a tel: link when the agent set only a phone. Absent
 * cleanly when the agent has neither.
 */
function PrelistingCta({ agent }: { agent: AgentBranding }) {
  const email = agent.email?.trim();
  const phone = agent.phone?.replace(/[^0-9+]/g, "");
  if (!email && !phone) return null;

  const href = email
    ? `mailto:${email}?subject=${encodeURIComponent("Listing consultation")}`
    : `tel:${phone}`;

  return (
    <section className="pl-cta fs-block" data-testid="pl-cta">
      <div className="fs-wrap">
        <h2 className="pl-cta__head">
          When you&apos;re ready, <em>let&apos;s talk</em>.
        </h2>
        <p className="pl-cta__lead">
          No pressure and no commitment. A short conversation about your home,
          your timeline, and what listing with us would look like.
        </p>
        <div className="fs-agent__cta">
          <a
            className="fs-btn-primary reveal"
            href={href}
            data-testid="pl-cta-primary"
          >
            Schedule a listing consultation
            <span className="fs-btn__ic" aria-hidden="true">
              <svg
                width="16"
                height="16"
                viewBox="0 0 16 16"
                fill="none"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M3 8h10M9 4l4 4-4 4" />
              </svg>
            </span>
          </a>
          {agent.ctaReassurance && (
            <div className="fs-btn-reassure">{agent.ctaReassurance}</div>
          )}
        </div>
      </div>
    </section>
  );
}

/**
 * Project the narrow standalone payload onto a `PublicPayload` render view for
 * the reused flagship sections. The agent-constant fields carry the real,
 * clamped data; every listing slot is an empty default the standalone page
 * never renders (the sections read only the agent-constant keys above). This
 * is render glue, NOT the privacy boundary — `clampPrelistingPayload` already
 * allowlisted the data.
 */
function renderView(data: StandalonePrelistingPayload): PublicPayload {
  return {
    templateVersion: 2,
    suppressWordmark: data.suppressWordmark,
    // ---- agent-constant content (the only data this page shows) ----
    agent: data.agent,
    agentBranding: data.agent,
    agentTagline: data.agentTagline,
    whyUs: data.whyUs,
    reviews: data.reviews,
    reviewsOutlink: data.reviewsOutlink,
    reviewsHeadline: data.reviewsHeadline,
    brandColors: data.brandColors,
    // ---- empty listing defaults (never rendered on the standalone page) ----
    propertyAddress: "",
    recommendedPrice: "",
    comps: [],
    pitchPublicPoints: [],
    property: { address: "", recommendedList: "" },
    whyPrice: { publicRationale: "", comps: [] },
    pitchPublicCards: [],
  };
}
