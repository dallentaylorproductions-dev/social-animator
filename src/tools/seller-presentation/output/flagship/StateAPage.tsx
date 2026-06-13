import type { CSSProperties } from "react";
import type { HandoutRecord } from "@/lib/share-urls";
import { clampPublicPayload, type PublicPayload } from "../public-payload";
import { consumerRoleVars, deriveConsumerRoles } from "../consumer-roles";
import { PresentationPageMotion } from "../motion";
import { detectReviewsSource } from "../presentation-page";
import { formatAppointment } from "../../engine/appointment";
import { newsreader } from "./fonts";
import { StateAHero } from "./StateAHero";
import { AppointmentBrief } from "./AppointmentBrief";
import { CampaignSpread } from "./CampaignSpread";
import { AgentBand } from "./AgentBand";
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
}: {
  handout: HandoutRecord;
  reviewSourceLogos?: boolean;
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
        {/* 2 · The Appointment Brief - the flagship evidence file. */}
        <AppointmentBrief payload={payload} preparedAt={handout.createdAt} />
        {/* 3 · Your valuation is being prepared (quiet, paced) + the woven
            credibility stat. NO price, no lock, no countdown. */}
        <ValuationPrepared payload={payload} appt={appt} />
        {/* Social proof, collapsed to a small strip (not the full band). */}
        <TestimonialStrip payload={payload} sourceLogos={reviewSourceLogos} />
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
      <PresentationPageMotion />
    </div>
  );
}

type Appt = ReturnType<typeof formatAppointment>;

/**
 * 3 · "Your valuation is being prepared." The honest value moment: no price, no
 * lock, no countdown. Names the appointment day, explains why a real number
 * needs the home seen first, gives the neighborhood range as context beneath the
 * pending-walkthrough pill, and weaves ONE credibility figure (sale-to-list from
 * the track record) as quiet money-proof. Each supporting line flexes out.
 */
function ValuationPrepared({
  payload,
  appt,
}: {
  payload: PublicPayload;
  appt: Appt;
}) {
  const dayLabel = appt ? `${appt.weekday}, ${appt.date}` : null;
  const range = nearbySoldRange(payload);
  const proof = credibilityStat(payload);

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
        Before I recommend a range, I&apos;ll walk the home with you and confirm
        the details buyers respond to. I don&apos;t guess with your money.
      </p>
      <div className="sa-val__status reveal">
        <div className="sa-val__label" data-testid="fs-sa-valuation-label">
          Prepared estimate · pending walkthrough
        </div>
        {range && (
          <p className="sa-val__context" data-testid="fs-sa-valuation-context">
            Homes near you recently sold between {range.low} and {range.high}.
          </p>
        )}
      </div>
      {proof && (
        <p className="sa-val__proof reveal" data-testid="fs-sa-valuation-proof">
          <span className="sa-val__proof-v">{proof.value}</span>
          <span className="sa-val__proof-k">{proof.label}</span>
        </p>
      )}
    </section>
  );
}

/**
 * Supporting trim - social proof collapsed to a SMALL strip: one quote +
 * ★★★★★ + the compliant source mark (e.g. "on Zillow®"). NOT the full reviews
 * band. Flexes out entirely when there is no review to show.
 */
function TestimonialStrip({
  payload,
  sourceLogos,
}: {
  payload: PublicPayload;
  sourceLogos: boolean;
}) {
  const review = payload.reviews?.[0];
  if (!review?.body?.trim()) return null;

  const source = payload.reviewsOutlink
    ? detectReviewsSource(payload.reviewsOutlink.url)
    : null;
  // Match the flagship Reviews compliance: Zillow is a text-only mark.
  const sourceNote =
    sourceLogos && source === "Zillow"
      ? "on Zillow®"
      : source
        ? `on ${source}`
        : null;

  const attribution = [
    review.attributionStreet ? `Sold on ${review.attributionStreet}` : null,
    review.attributionName,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <section
      className="section z-offwhite sa-quote"
      data-testid="fs-sa-testimonial"
    >
      <div className="sa-quote__inner reveal">
        <span className="stars" aria-label="Five out of five stars" role="img">
          ★★★★★
        </span>
        <p className="sa-quote__q">
          <span className="mark" aria-hidden="true">
            &ldquo;
          </span>
          {review.body}
          <span className="mark" aria-hidden="true">
            &rdquo;
          </span>
        </p>
        <div className="sa-quote__attr">
          {attribution || review.attributionName}
          {sourceNote && (
            <span className="sa-quote__src" data-testid="fs-sa-testimonial-src">
              {" "}
              {sourceNote}
            </span>
          )}
        </div>
      </div>
    </section>
  );
}

/**
 * 5 · What happens at our meeting - a calm close. Three FIXED meeting steps in
 * the flagship stepper treatment (reusing the .flow/.fstep DNA), the advocacy
 * "what I'll be looking for" line, then the one decided action (ConfirmTime).
 */
function MeetingClose({ payload, appt }: { payload: PublicPayload; appt: Appt }) {
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
function ConfirmTime({ payload, appt }: { payload: PublicPayload; appt: Appt }) {
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
 * Derive ONE credibility figure from the agent track record - the sale-to-list
 * (a percentage stat) as quiet money-proof near the valuation. Returns null when
 * no such stat is backed, so the proof line flexes out. NOT the subject home's
 * price: this is the agent's record across PAST listings.
 */
function credibilityStat(
  payload: PublicPayload,
): { value: string; label: string } | null {
  const stats = payload.whyUs?.performanceStats ?? [];
  const pct = stats.find((s) =>
    /%/.test((s.yourValue ?? "") + (s.unit ?? "")),
  );
  const stat = pct ?? stats[0];
  if (!stat?.yourValue?.trim()) return null;
  return {
    value: stat.yourValue,
    label: stat.label?.trim()
      ? `${stat.label} across my recent listings`
      : "across my recent listings",
  };
}

/**
 * Derive the nearby-sold price RANGE (lowest and highest comp sold price) as
 * neighborhood context for the valuation block. This is NOT the subject home's
 * price - it is what OTHER homes nearby sold for. Returns null when no parseable
 * comp price exists, so the sentence flexes out.
 */
function nearbySoldRange(
  payload: PublicPayload,
): { low: string; high: string } | null {
  const prices = payload.comps
    .map((c) => parseDollars(c.soldPrice))
    .filter((n): n is number => n != null);
  if (prices.length === 0) return null;
  const lo = Math.min(...prices);
  const hi = Math.max(...prices);
  return { low: formatDollars(lo), high: formatDollars(hi) };
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
