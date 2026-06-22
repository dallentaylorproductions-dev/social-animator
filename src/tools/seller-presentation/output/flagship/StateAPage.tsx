import type { CSSProperties } from "react";
import type { HandoutRecord } from "@/lib/share-urls";
import { clampPublicPayload, type PublicPayload } from "../public-payload";
import { consumerRoleVars, deriveConsumerRoles } from "../consumer-roles";
import { PresentationPageMotion } from "../motion";
import {
  isViewedSignalEngagementEnabled,
  viewSignalSlugFor,
} from "@/lib/seller-presentation/viewed-signal";
import { detectReviewsSource } from "../presentation-page";
import { formatAppointment } from "../../engine/appointment";
import { newsreader } from "./fonts";
import { StateAHero } from "./StateAHero";
import { StateAHello } from "./StateAHello";
import { AppointmentBrief } from "./AppointmentBrief";
import { CampaignSpread } from "./CampaignSpread";
import { AgentBand } from "./AgentBand";
import { ProofPanel } from "./ProofPanel";
import { defaultValuationMessage, PROOF_RANGE_LABEL } from "./state-a-copy";
import "./flagship.css";
import "./state-a.css";

/**
 * StateAPage - the Seller State A "prepared invitation" (refined).
 *
 * The BEFORE-the-appointment state of the living seller page, rebuilt to feel
 * like a private dossier a serious agent already prepared (at least as premium
 * as the revealed State B, but quieter and materially shorter). Governing
 * principle: show preparation as EVIDENCE ARTIFACTS, not claims. Five sections:
 *
 *   1. Map-dossier hero (Signature A.1) - StateAHero.
 *   2. Appointment Brief (Signature A.2, the flagship file) - AppointmentBrief.
 *   3. Your valuation is being prepared (quiet, paced) - local, with the woven
 *      credibility stat + the small testimonial strip as supporting trims.
 *   4. How I'll get your home seen (Signature B, campaign spread) - CampaignSpread.
 *   5. What happens at our meeting (calm close) - local MeetingClose + ConfirmTime.
 *
 * Rendered for any payload whose baked `valuationStatus` is an invitation status
 * (a `revealed` payload renders the existing presentation untouched, see
 * presentation-page.tsx dispatch). NO subject price, no recommended marker, no
 * lock, no countdown anywhere. Every block + every artifact flexes out cleanly
 * when its backing data is absent, so the page reads complete with few or many.
 */
export function StateAPage({
  handout,
  reviewSourceLogos = false,
  preview = false,
}: {
  handout: HandoutRecord;
  reviewSourceLogos?: boolean;
  /**
   * Read-only preview discriminator (ONBOARDING_HYBRID_V3, Phase 4a). When true
   * the page renders identically EXCEPT the {@link PresentationPageMotion} island
   * is not mounted — so the engagement beacon (and any view-signal write) is
   * structurally unreachable, not merely gated by a missing slug. Lets the
   * onboarding "sample home, real you" mirror render the genuine page with ZERO
   * side effects (G1). Defaults false, so every live caller (/h/[slug] via
   * SellerPresentationPage, the fixture preview route) is byte-identical to today.
   */
  preview?: boolean;
}) {
  const payload = clampPublicPayload(handout.data);
  const roles = deriveConsumerRoles(payload.brandColors?.accent);
  const roleVars = consumerRoleVars(roles) as CSSProperties;
  const appt = formatAppointment(payload.appointmentAt);

  return (
    <div
      className={`fs-page state-a ${newsreader.variable}`}
      style={roleVars}
      data-flagship-shell
      data-testid="seller-presentation-state-a"
      data-valuation-status={payload.valuationStatus}
    >
      <div className="fs-frame">
        {/* 1 · The private map-dossier hero (address + appointment + agent). */}
        <StateAHero payload={payload} appt={appt} />
        {/* 1b · The agent's hello video, its own centered moment below the hero
            (relocated out of the hero so it no longer over-sizes the cover). */}
        <StateAHello payload={payload} />
        {/* 2 · The Appointment Brief - the flagship evidence file. */}
        <AppointmentBrief payload={payload} preparedAt={handout.createdAt} />
        {/* 3 · Your valuation is being prepared (quiet, paced). NO price, no
            lock, no countdown, and NO stat - the value moment stays purely about
            "your number is being prepared". */}
        <ValuationPrepared payload={payload} appt={appt} />
        {/* Trust band: the one compact testimonial strip paired with the agent's
            track-record stat (relocated out of the valuation block), so all
            trust-proof lives in one small band. */}
        <TrustStrip payload={payload} sourceLogos={reviewSourceLogos} />
        {/* 4 · How I'll get your home seen - the campaign spread (Signature B). */}
        <CampaignSpread payload={payload} />
        {/* 5 · What happens at our meeting - the calm close + the one action. */}
        <MeetingClose payload={payload} appt={appt} />
        {/* Agent identity + legal disclaimer close. CTAs suppressed (the one
            decided action is ConfirmTime above); the guarantee stays held. */}
        <AgentBand
          payload={payload}
          showWordmark={payload.suppressWordmark !== true}
          showCtas={false}
        />
      </div>
      {/* The ONLY side-effecting island on the page. Omitted in preview mode so
          the onboarding mirror has no write path at all (G1) — the beacon import
          is never reached. Live renders (preview=false) mount it exactly as before. */}
      {!preview && (
        <PresentationPageMotion
          viewSignalSlug={viewSignalSlugFor(handout)}
          engagementEnabled={isViewedSignalEngagementEnabled()}
        />
      )}
    </div>
  );
}

type Appt = ReturnType<typeof formatAppointment>;

/**
 * 3 · "Your valuation is being prepared." The honest value moment: no price, no
 * lock, no countdown, and no stat. Names the appointment day, explains why a real
 * number needs the home seen first, and gives the neighborhood range as context
 * beneath the pending-walkthrough pill. The credibility figure deliberately lives
 * in the trust band below (not here), so this block can never read like part of
 * the home's valuation or a guarantee. Each supporting line flexes out.
 */
export function ValuationPrepared({
  payload,
  appt,
}: {
  payload: PublicPayload;
  appt: Appt;
}) {
  const dayLabel = appt ? `${appt.weekday}, ${appt.date}` : null;
  const range = nearbySoldRange(payload);
  // Editable valuation voice line with a strong, universally-comfortable default
  // (set once in Settings). The default keeps the substance without the blunt
  // "I don't guess with your money"; an agent can rewrite it in their own voice.
  const valuationMessage =
    payload.valuationMessage?.trim() || defaultValuationMessage();

  return (
    <section className="section z-ink sa-val" data-testid="fs-sa-valuation">
      <div className="reveal">
        <div className="eyebrow on-dark">
          Your Valuation <span className="rule" aria-hidden="true" />
        </div>
        <h2 className="head on-dark">
          Being <em>prepared</em>
          {dayLabel ? <> for {dayLabel}.</> : "."}
        </h2>
      </div>
      <p className="sa-val__body reveal" data-testid="fs-sa-valuation-body">
        {valuationMessage}
      </p>
      {/* Two tinted status chips (the prepared chip carries the status dot), then
          the shared dark proof-panel for the nearby-sold range, then the sentence.
          FLEX-OUT: range absent -> the proof panel + sentence drop and the band
          stays composed on the heading + chips alone. */}
      <div className="sa-val__status reveal">
        <div className="sa-val__chips" data-testid="fs-sa-valuation-label">
          <span className="sa-val__chip sa-val__chip--status">
            <span className="sa-val__dot" aria-hidden="true" />
            Prepared estimate
          </span>
          <span className="sa-val__chip">Pending walkthrough</span>
        </div>
        {range && (
          <ProofPanel
            variant="dark"
            label={PROOF_RANGE_LABEL}
            testid="fs-sa-proof-z3"
            numAriaLabel={`${range.lowAbbr} to ${range.highAbbr}`}
          >
            <span className="sa-range">
              <span className="sa-range__v">{range.lowAbbr}</span>
              <span className="sa-range__track" aria-hidden="true">
                <span className="sa-range__dot sa-range__dot--fill" />
                <span className="sa-range__seg" />
                <span className="sa-range__dot sa-range__dot--open" />
              </span>
              <span className="sa-range__v">{range.highAbbr}</span>
            </span>
          </ProofPanel>
        )}
        {range && (
          <p className="sa-val__context" data-testid="fs-sa-valuation-context">
            Homes near you recently sold between {range.low} and {range.high}.
          </p>
        )}
      </div>
    </section>
  );
}

/**
 * The reviews section (v1.5x) - its own confident moment, not a leftover strip.
 * With the agent track-record stat relocated to the Appointment Brief, this is
 * the emotional proof: a prominent quote paired with a trust block - a sized-up
 * 5.0 rating + stars and a clearly-clickable "See all of [Agent]'s reviews on
 * [source]" link-out (reusing the full-presentation reviewsOutlink pattern).
 *
 * COMPLIANCE: the review source is TEXT ONLY (e.g. "on Zillow®"), never a logo,
 * per each platform's trademark terms - the same flag-gated mark the flagship
 * Reviews uses. The rating is a clean 5.0 (matching flagship), no invented count.
 *
 * FLEX-OUT: quote-only -> the link-out block drops and the quote centers; outlink
 * only -> the block stands alone; neither -> the whole section drops.
 */
export function TrustStrip({
  payload,
  sourceLogos,
}: {
  payload: PublicPayload;
  sourceLogos: boolean;
}) {
  const review = payload.reviews?.[0];
  const hasQuote = !!review?.body?.trim();
  const outlink = payload.reviewsOutlink;
  if (!hasQuote && !outlink) return null;

  const source = outlink ? detectReviewsSource(outlink.url) : null;
  // Match the flagship Reviews compliance: Zillow is a TEXT-ONLY mark (no logo);
  // the "®" rides the source-logos flag, exactly as the flagship treats it.
  const sourceNote =
    sourceLogos && source === "Zillow"
      ? "on Zillow®"
      : source
        ? `on ${source}`
        : null;

  const first = payload.agent.name?.trim().split(/\s+/)[0];
  const seeAllLabel = first
    ? `See all of ${first}'s reviews`
    : "See all reviews";

  const attribution = hasQuote
    ? [
        review!.attributionStreet
          ? `Sold on ${review!.attributionStreet}`
          : null,
        review!.attributionName,
      ]
        .filter(Boolean)
        .join(" · ")
    : "";

  const solo = !(hasQuote && outlink);

  return (
    <section
      className="section z-offwhite sa-quote"
      data-testid="fs-sa-testimonial"
    >
      <div className="reveal">
        <div className="eyebrow">
          Reviews <span className="rule" aria-hidden="true" />
        </div>
        <h2 className="head">
          Sellers, in <em>their words</em>.
        </h2>
      </div>
      {/* Quote on the left; the rating + link-out as a confident trust block on
          the right. FLEX-OUT: one side absent -> the panel centers the survivor. */}
      <div
        className={`sa-quote__panel reveal${solo ? " sa-quote__panel--solo" : ""}`}
      >
        {hasQuote && (
          <div className="sa-quote__main">
            <span
              className="stars"
              aria-label="Five out of five stars"
              role="img"
            >
              ★★★★★
            </span>
            <p className="sa-quote__q">
              <span className="mark" aria-hidden="true">
                &ldquo;
              </span>
              {review!.body}
              <span className="mark" aria-hidden="true">
                &rdquo;
              </span>
            </p>
            <div className="sa-quote__attr">
              {attribution || review!.attributionName}
            </div>
          </div>
        )}
        {outlink && (
          <div className="sa-reviews" data-testid="fs-sa-reviews">
            <div className="sa-reviews__rate">
              <span
                className="stars sa-reviews__stars"
                aria-label="Five out of five stars"
                role="img"
              >
                ★★★★★
              </span>
              <span className="sa-reviews__score">5.0</span>
              {sourceNote && (
                <span
                  className="sa-reviews__of"
                  data-testid="fs-sa-reviews-src"
                >
                  Average rating {sourceNote}
                </span>
              )}
            </div>
            <a
              className="sa-reviews__link"
              href={outlink.url}
              target="_blank"
              rel="noopener noreferrer"
              data-testid="fs-sa-reviews-outlink"
            >
              {seeAllLabel}
              {sourceNote ? ` ${sourceNote}` : ""}{" "}
              <span className="sa-reviews__arrow" aria-hidden="true">
                →
              </span>
            </a>
          </div>
        )}
      </div>
    </section>
  );
}

/**
 * 5 · What happens at our meeting - a calm close. Three FIXED meeting steps in
 * the flagship stepper treatment (reusing the .flow/.fstep DNA), the advocacy
 * "what I'll be looking for" line, then the one decided action (ConfirmTime).
 */
export function MeetingClose({ payload, appt }: { payload: PublicPayload; appt: Appt }) {
  const steps = [
    {
      step: "Walk the home together",
      detail: "We see what buyers will see and plan around it.",
    },
    {
      step: "Show you the range, and the sales behind it",
      detail: "The number I would recommend, grounded in what is selling nearby.",
    },
    {
      step: "Map the launch plan",
      detail: "How we bring buyers to your door in the first week.",
    },
  ];

  return (
    <>
      <section className="section work z-mist sa-meet" data-testid="fs-sa-meeting">
        <div className="reveal">
          <div className="eyebrow">
            At Our Meeting <span className="rule" aria-hidden="true" />
          </div>
          <h2 className="head">
            What happens when we <em>walk it together</em>.
          </h2>
        </div>
        <div className="flow" data-count={steps.length}>
          {steps.map((s, i) => (
            <div className="fstep reveal" key={i} data-testid={`fs-sa-step-${i}`}>
              <div className="fstep__badge">{i + 1}</div>
              <div className="fstep__title">{s.step}</div>
              <p className="fstep__body">{s.detail}</p>
            </div>
          ))}
        </div>
        <p className="sa-meet__advocacy reveal" data-testid="fs-sa-advocacy">
          As we walk, I&apos;ll be looking for the details buyers remember: the
          updates, the light, the way it lives.
        </p>
      </section>
      <ConfirmTime payload={payload} appt={appt} />
    </>
  );
}

/**
 * One action - "Confirm our time" + the agent's direct line. Not a form, not a
 * hard ask. Flexes out entirely when the agent has no reachable contact.
 */
export function ConfirmTime({ payload, appt }: { payload: PublicPayload; appt: Appt }) {
  const a = payload.agent;
  const email = a.email?.trim();
  const phone = a.phone?.trim();
  const telHref = phone ? phone.replace(/[^0-9+]/g, "") : "";
  if (!email && !phone) return null;

  const first = a.name?.trim().split(/\s+/)[0];
  const subject = appt
    ? `Confirming our time on ${appt.weekday}`
    : "Confirming our time";

  return (
    <section className="section z-offwhite sa-cta" data-testid="fs-sa-confirm-cta">
      <div className="reveal">
        <div className="eyebrow">
          One Thing <span className="rule" aria-hidden="true" />
        </div>
        <h2 className="head">
          Just <em>confirm our time</em>.
        </h2>
        {appt && (
          <p className="sa-cta__lede" data-testid="fs-sa-confirm-when">
            A quick yes for {appt.full} is all I need.
          </p>
        )}
      </div>
      <div className="sa-cta__actions reveal">
        {email && (
          <a
            className="sa-cta__btn sa-cta__btn--primary"
            href={`mailto:${email}?subject=${encodeURIComponent(subject)}`}
            data-testid="fs-sa-confirm-email"
          >
            Confirm our time
          </a>
        )}
        {phone && (
          <a
            className="sa-cta__btn sa-cta__btn--ghost"
            href={`tel:${telHref}`}
            data-testid="fs-sa-confirm-phone"
          >
            {first ? `Call or text ${first}` : "Call or text me"}
          </a>
        )}
      </div>
    </section>
  );
}

/**
 * Derive the nearby-sold price RANGE (lowest and highest comp sold price) as
 * neighborhood context for the valuation block. This is NOT the subject home's
 * price - it is what OTHER homes nearby sold for. Returns null when no parseable
 * comp price exists, so the sentence flexes out.
 */
function nearbySoldRange(
  payload: PublicPayload,
): { low: string; high: string; lowAbbr: string; highAbbr: string } | null {
  const prices = payload.comps
    .map((c) => parseDollars(c.soldPrice))
    .filter((n): n is number => n != null);
  if (prices.length === 0) return null;
  const lo = Math.min(...prices);
  const hi = Math.max(...prices);
  // Full form ("$580,000") for the context sentence; abbreviated ("$580K") for
  // the compact proof-panel range display.
  return {
    low: formatDollars(lo),
    high: formatDollars(hi),
    lowAbbr: formatDollarsAbbrev(lo),
    highAbbr: formatDollarsAbbrev(hi),
  };
}

/** "$695,000" / "$695k" / "695000" -> 695000. */
function parseDollars(raw: string | undefined): number | null {
  if (!raw) return null;
  const s = raw.trim().toLowerCase();
  const k = /k$/.test(s);
  const m = /m$/.test(s);
  const n = parseFloat(s.replace(/[^0-9.]/g, ""));
  if (!Number.isFinite(n)) return null;
  if (m) return Math.round(n * 1_000_000);
  if (k) return Math.round(n * 1000);
  return Math.round(n);
}

/** 695000 -> "$695,000" (whole-dollar, grouped). */
function formatDollars(n: number): string {
  return `$${Math.round(n).toLocaleString("en-US")}`;
}

/** 580000 -> "$580K"; 1250000 -> "$1.25M" (compact range-display form). */
function formatDollarsAbbrev(n: number): string {
  if (n >= 1_000_000) {
    const m = n / 1_000_000;
    return `$${(Math.round(m * 100) / 100).toString()}M`;
  }
  return `$${Math.round(n / 1000)}K`;
}
