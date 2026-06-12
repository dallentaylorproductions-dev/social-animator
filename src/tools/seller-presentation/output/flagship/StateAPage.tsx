import type { CSSProperties } from "react";
import type { HandoutRecord } from "@/lib/share-urls";
import { clampPublicPayload, type PublicPayload } from "../public-payload";
import { consumerRoleVars, deriveConsumerRoles } from "../consumer-roles";
import { PresentationPageMotion } from "../motion";
import { formatAppointment } from "../../engine/appointment";
import { newsreader } from "./fonts";
import { Hero } from "./Hero";
import { AgentNote } from "./AgentNote";
import { WhyUs } from "./WhyUs";
import { Reviews } from "./Reviews";
import { AreaStats } from "./AreaStats";
import { AgentBand } from "./AgentBand";
import "./flagship.css";
import "./state-a.css";

/**
 * StateAPage — the Seller State A "prepared invitation" (Slice 1).
 *
 * The BEFORE-the-appointment state of the living seller page. It proves the
 * agent has already done the market prep: the home's value reads as being
 * PREPARED, never a price, never a lock. Rendered for any payload whose baked
 * `valuationStatus` is an invitation status (preparing_for_walkthrough /
 * ready_to_review); a `revealed` payload renders the existing presentation
 * untouched (see presentation-page.tsx dispatch). Slice 2 adds the reveal
 * transition; this slice builds only the State A visual.
 *
 * Composed almost entirely from the EXISTING flagship blocks (Hero / AgentNote
 * video / AreaStats / WhyUs / Reviews / AgentBand) inside the same `.fs-page`
 * shell, plus a few State A-only blocks. Governing principle: anticipation
 * through PREPARATION, not restriction. Every block + every proof item flexes
 * out cleanly when its backing data is absent (the page reads complete with few
 * or many). No price, no lock icon, no countdown anywhere.
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
        {/* 1 · Prepared for [family] · [address] — reuse the hero (no price). */}
        <Hero payload={payload} />
        {/* 2 · Your appointment is set for [moment]. */}
        <AppointmentBlock appt={appt} />
        {/* 3 · A personal welcome from me — reuse the video field with State A
            copy (the welcome must not reference "this number"). */}
        <AgentNote
          payload={payload}
          testId="fs-note"
          eyebrow={
            <>
              <span className="num">01</span> · A Personal Welcome
            </>
          }
          heading={
            <>
              Hello, <em>before we meet</em>.
            </>
          }
          lede="A short hello and how I am already getting ready for our walkthrough, so the time we spend together is time well used."
        />
        {/* 4 · What I have already reviewed — proof of preparation. */}
        <ProofReviewed payload={payload} />
        {/* 5 · What we will confirm during the walkthrough — honest unknowns. */}
        <WhatWeConfirm />
        {/* 6 · Your neighborhood right now — reuse the area snapshot with NO
            subject price overlay. Flexes out when there is no area data. */}
        <AreaStats payload={payload} showRecommended={false} />
        {/* 7 · Your valuation is being prepared (no price, no lock, no countdown). */}
        <ValuationBeingPrepared payload={payload} appt={appt} />
        {/* 8 · Why my team is equipped to help — reuse the why-us / track-record
            chapter (supporting, not the headline). Flexes out when empty. */}
        <WhyUs payload={payload} variant="seller" />
        {/* 9 · What past sellers say — reuse reviews. Flexes out when empty. */}
        <Reviews payload={payload} sourceLogos={reviewSourceLogos} />
        {/* 10 · One action — confirm our time + the agent's direct line. */}
        <ConfirmTime payload={payload} appt={appt} />
        {/* Agent identity + legal disclaimer close. CTAs are suppressed (the one
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
 * 2 · The named, dated appointment moment. The page's whole premise, so it is
 * required in an invitation publish — but flex out defensively if it is somehow
 * absent rather than render a blank "set for".
 */
function AppointmentBlock({ appt }: { appt: Appt }) {
  if (!appt) return null;
  return (
    <section className="section z-paper sa-appt" data-testid="fs-sa-appointment">
      <div className="reveal">
        <div className="eyebrow">
          Your Appointment <span className="rule" aria-hidden="true" />
        </div>
        <h2 className="head">
          We meet <em>{appt.weekday}</em>.
        </h2>
      </div>
      <p className="sa-appt__when reveal" data-testid="fs-sa-appointment-when">
        Your appointment is set for {appt.full}.
      </p>
    </section>
  );
}

/**
 * 4 · "What I have already reviewed" — proof of preparation. Renders a check
 * item ONLY when its backing data is truthfully present on the page (the
 * honesty rule: no hollow checkmarks). The whole block flexes out when nothing
 * is backed yet.
 */
function ProofReviewed({ payload }: { payload: PublicPayload }) {
  const hasComps = payload.comps.length > 0;
  const hasArea = !!payload.areaStats;
  const hasMarketing =
    (payload.whyUs?.marketingApproach?.length ?? 0) > 0 ||
    (payload.whyUs?.differentiators?.length ?? 0) > 0;
  const hasTrackRecord = (payload.whyUs?.performanceStats?.length ?? 0) > 0;
  const hasReviews = (payload.reviews?.length ?? 0) > 0;

  const items: Array<{ key: string; label: string; sub: string }> = [];
  if (hasComps || hasArea) {
    items.push({
      key: "nearby-sales",
      label: "Recent nearby sales",
      sub: "Pulled the homes that recently sold around you.",
    });
  }
  if (hasArea) {
    items.push({
      key: "neighborhood",
      label: "Neighborhood context",
      sub: "Looked at how your area is moving right now.",
    });
  }
  if (hasMarketing) {
    items.push({
      key: "marketing",
      label: "A marketing plan for your home",
      sub: "Mapped out how I would bring buyers to your door.",
    });
  }
  if (hasTrackRecord) {
    items.push({
      key: "track-record",
      label: "My track record",
      sub: "Gathered the numbers from my recent listings.",
    });
  }
  if (hasReviews) {
    items.push({
      key: "reviews",
      label: "What past sellers say",
      sub: "Lined up references from families I have worked with.",
    });
  }

  if (items.length === 0) return null;

  return (
    <section
      className="section z-offwhite sa-proof"
      data-testid="fs-sa-proof"
    >
      <div className="reveal">
        <div className="eyebrow">
          Already Underway <span className="rule" aria-hidden="true" />
        </div>
        <h2 className="head">
          What I have <em>already reviewed</em>.
        </h2>
      </div>
      <ul className="sa-proof__list">
        {items.map((it) => (
          <li
            className="sa-proof__item reveal"
            key={it.key}
            data-testid={`fs-sa-proof-${it.key}`}
          >
            <span className="sa-proof__check" aria-hidden="true">
              <CheckMark />
            </span>
            <span className="sa-proof__copy">
              <span className="sa-proof__label">{it.label}</span>
              <span className="sa-proof__sub">{it.sub}</span>
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * 5 · "What we will confirm during the walkthrough" — an honest short list of
 * what genuinely needs eyes on the home. Being upfront about what cannot be
 * known yet is itself the proof. No data dependency: the same honest list for
 * every home, so it always renders.
 */
function WhatWeConfirm() {
  const items = [
    "The condition, room by room",
    "Updates and improvements you have made",
    "How the layout actually lives",
    "Finishes and the little details photos miss",
    "Your timeline and what matters most to you",
  ];
  return (
    <section className="section z-paper sa-confirm" data-testid="fs-sa-confirm">
      <div className="reveal">
        <div className="eyebrow">
          At The Walkthrough <span className="rule" aria-hidden="true" />
        </div>
        <h2 className="head">
          What we will <em>confirm together</em>.
        </h2>
      </div>
      <ul className="sa-confirm__list reveal">
        {items.map((it, i) => (
          <li className="sa-confirm__item" key={i}>
            {it}
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * 7 · "Your valuation is being prepared." The honest value moment: no price, no
 * lock, no countdown. Names the appointment day, explains why a real number
 * needs the home seen first, and (only when nearby sold data exists) gives the
 * neighborhood range as context. Small "Prepared estimate" label.
 */
function ValuationBeingPrepared({
  payload,
  appt,
}: {
  payload: PublicPayload;
  appt: Appt;
}) {
  const dayLabel = appt ? `${appt.weekday}, ${appt.date}` : null;
  const range = nearbySoldRange(payload);

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
        A real number means seeing your home first. I will review the condition,
        updates, layout, and recent sales, then show you the range I would
        recommend and why.
        {range && (
          <>
            {" "}
            Nearby homes recently sold between {range.low} and {range.high}.
          </>
        )}
      </p>
      <div className="sa-val__label reveal" data-testid="fs-sa-valuation-label">
        Prepared estimate · pending walkthrough
      </div>
    </section>
  );
}

/**
 * 10 · One action — "Confirm our time" + the agent's direct line. Not a form,
 * not a hard ask. Flexes out entirely when the agent has no reachable contact.
 */
function ConfirmTime({
  payload,
  appt,
}: {
  payload: PublicPayload;
  appt: Appt;
}) {
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

function CheckMark() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="14"
      height="14"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M20 6L9 17l-5-5" />
    </svg>
  );
}

/**
 * Derive the nearby-sold price RANGE (lowest and highest comp sold price) as
 * neighborhood context for the valuation block. This is NOT the subject home's
 * price — it is what OTHER homes nearby sold for, exactly the sentence the
 * locked design prescribes. Returns null when fewer than one parseable comp
 * price exists, so the sentence flexes out.
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
