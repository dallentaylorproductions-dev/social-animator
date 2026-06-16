import type { HandoutRecord } from "@/lib/share-urls";
import {
  clampPublicPayload,
  type AgentBranding,
  type PublicComp,
  type PublicPayload,
  type AreaStatsMonthly,
} from "./public-payload";
import { effectivePosterUrl } from "../engine/types";
import { PresentationPageMotion } from "./motion";
import dynamic from "next/dynamic";
import { BrandEngine } from "@/lib/brand/color-engine";
import {
  isViewedSignalEngagementEnabled,
  viewSignalSlugFor,
} from "@/lib/seller-presentation/viewed-signal";
import "./presentation-page.css";

// Flagship (v2) template — code-split so its module graph (and the self-hosted
// Newsreader @font-face it carries) lands in a SEPARATE chunk, never the v1
// seller-presentation CSS chunk. It only renders for templateVersion 2 (no
// production publish writes that in F1), so v1 pages load neither the chunk nor
// the font — keeping the v1 CSS byte-identical and the font off every live page.
const FlagshipPage = dynamic(() =>
  import("./flagship/FlagshipPage").then((m) => m.FlagshipPage),
);

// Seller State A — the prepared-invitation template, code-split like the
// flagship so its module graph (state-a.css + the flagship blocks it composes)
// never loads on a revealed page. Renders ONLY when the baked valuationStatus is
// an invitation status; a revealed/absent status keeps the existing dispatch.
const StateAPage = dynamic(() =>
  import("./flagship/StateAPage").then((m) => m.StateAPage),
);

// E.1 — v1 unset-brand defaults (the cohort-safe palette). Signature = the
// agent's brandAccent; surface/ink = layout-owned defaults, overridable.
//
// F3 LOCK: `signature` stays terracotta `#C26A4E` ON PURPOSE. F3 flipped the
// FORM default + the engine's last-resort fallback to blue `#037290`, but the
// v1 renderer reads its unset default from THIS local constant (never the live
// default), and v1 always hands the engine a valid signature so it never hits
// the engine's blue fallback. Keeping this terracotta is what makes an
// already-published unset-brand v1 page render byte-identical before/after F3.
// (v2/flagship unset pages render blue via the engine fallback — intended.)
const E1_DEFAULTS = {
  signature: "#C26A4E",
  surface: "#F1EBE0",
  ink: "#1A1612",
} as const;

/**
 * Seller Presentation — premium consumer-facing page (v1.47 / A7b + A7d.1).
 *
 * Server-rendered React component consumed by /h/[slug]/page.tsx
 * when handout.type === 'seller-presentation'. Reads `handout.data`
 * via `clampPublicPayload` (defense-at-boundary) so unknown KV keys
 * are dropped before the renderer touches them.
 *
 * A7d.1 subtraction: the personal-note, track-record, buyer-quote,
 * and editorial-photo sections were removed entirely (Dallen's
 * 2026-05-22 smoke). What remains is the tighter editorial spine.
 *
 * Graceful states for the optional blocks that survived:
 *   - video null         → video block hidden entirely
 *   - reviews null/empty AND outlink null → reviews block hidden entirely
 *   - reviews populated, outlink null → full block, no trailing CTA link
 *   - reviews null/empty, outlink set → compact outlink-only CTA (A7d.5)
 *   - areaStats null     → "snapshot coming soon" treatment
 *   - agent.photoUrl null → monogram well in same dimensions
 */

/**
 * Public consumer-page entry point + flagship-version dispatcher (F1 → F3).
 *
 * Branches on the clamped `templateVersion`: an exact `2` renders the flagship
 * (v2) template; everything else — including every already-published payload
 * (which carries no templateVersion → clamped to 1) — renders the v1 markup
 * exactly as today. F3 flips publishes to v2, so NEW slugs take the flagship
 * arm while every pre-F3 slug stays v1.
 *
 * Read-time presentation override (a pure presentation switch — no data /
 * storage / serialization change — wired by the `/h/` route's `?template=`
 * query and the dev preview route):
 *   - `"flagship"` forces the flagship arm for ANY stored version (F2). Post-F3
 *     it's also how an agent previews a still-v1 slug's flagship upgrade before
 *     republishing.
 *   - `"v1"` is the inverse (F3): force the v1 arm even for a v2 payload — same
 *     read-only switch in the other direction.
 * An override always wins over the stored version. With NO override AND a v1
 * payload, this renders v1 BYTE-IDENTICALLY to before.
 */
export function SellerPresentationPage({
  handout,
  templateOverride,
  reviewSourceLogos,
}: {
  handout: HandoutRecord;
  /** Read-time presentation override. "flagship" forces v2; "v1" forces v1. */
  templateOverride?: "flagship" | "v1";
  /**
   * REVIEW_SOURCE_LOGOS_ENABLED - show the source's brand-logo chip on the
   * flagship review card. Defaults to the server env flag (OFF unless set), so
   * the published `/h/` page picks it up with no route change; the preview
   * route passes an explicit value to force it on for QA/e2e. v1-only renders
   * never see it. Flag-off is byte-identical to today.
   */
  reviewSourceLogos?: boolean;
}) {
  const { templateVersion, valuationStatus } = clampPublicPayload(handout.data);
  const logosOn =
    reviewSourceLogos ?? process.env.REVIEW_SOURCE_LOGOS_ENABLED === "true";

  // Seller State A — the baked valuation status is the first discriminator,
  // exactly like templateVersion. An invitation status renders the prepared
  // invitation; `revealed` (every pre-State-A slug, coerced by the read clamp)
  // falls through to the existing template dispatch BYTE-IDENTICALLY. The
  // decision rides the payload (not a runtime flag re-check), so a published
  // State A page stays correct regardless of later flag state, and a flag-off
  // publish never wrote an invitation status in the first place.
  if (valuationStatus !== "revealed") {
    return <StateAPage handout={handout} reviewSourceLogos={logosOn} />;
  }

  // "v1" override wins outright — render the v1 arm regardless of stored version.
  if (templateOverride !== "v1" && (templateVersion === 2 || templateOverride === "flagship")) {
    // Render the real flagship (v2) template. FlagshipPage is dynamically
    // imported so its module graph — the Newsreader @font-face and the
    // flagship stylesheet — stays in a SEPARATE chunk that never loads on a
    // v1 page, keeping v1 byte-identical.
    return <FlagshipPage handout={handout} reviewSourceLogos={logosOn} />;
  }
  return <SellerPresentationV1 handout={handout} />;
}

/**
 * v1 consumer page — the production Editorial markup. Rendered for every
 * stored payload (and any templateVersion: 1 publish). Kept verbatim; the
 * flagship dispatcher and FlagshipPage stub delegate here so the v1 output
 * stays byte-identical.
 */
export function SellerPresentationV1({
  handout,
}: {
  handout: HandoutRecord;
}) {
  const payload = clampPublicPayload(handout.data);

  // E.1 — derive the full 7-role ramp from the agent's signature
  // (brandColors.accent) + layout-owned surface/ink, then inline the
  // CLAMPED RESOLVED HEXES as CSS vars on <main>. The engine runs at render
  // (server-side, pure) — contrast clamps can't live in CSS, so the inlined
  // values are the live path; the stylesheet's color-mix(in oklch, …)
  // values are only the pre-JS fallback. Unset brand → engine runs with the
  // production defaults, so the page renders the Editorial family (NO cyan).
  const bc = payload.brandColors;
  const derived = BrandEngine.derive(bc?.accent ?? E1_DEFAULTS.signature, {
    surface: bc?.background ?? E1_DEFAULTS.surface,
    ink: bc?.text ?? E1_DEFAULTS.ink,
    secondary: bc?.secondary ?? null,
  });
  const brandStyle = derived.vars as React.CSSProperties;

  return (
    <main
      className="sep-presentation"
      data-testid="seller-presentation-public"
      style={brandStyle}
    >
      <article className="page" data-screen-label="Seller Presentation">
        <Hero payload={payload} />
        <CaptionCard payload={payload} />
        <PricePanel payload={payload} />
        <VideoBlock payload={payload} />
        <WhyPriceSection payload={payload} />
        <PitchSection payload={payload} />
        <ReviewsSection payload={payload} />
        <AreaSection payload={payload} />
        <AgentSection payload={payload} />
        <EndMark />
        <Foot payload={payload} />
      </article>
      <PresentationPageMotion
        viewSignalSlug={viewSignalSlugFor(handout)}
        engagementEnabled={isViewedSignalEngagementEnabled()}
      />
    </main>
  );
}

// =====================================================================
// HERO + CAPTION
// =====================================================================

function Hero({ payload }: { payload: PublicPayload }) {
  const hero = payload.property.heroPhotoUrl;
  const preparedFor = payload.preparedFor?.trim();
  const headerLabel = preparedFor
    ? `Prepared for ${preparedFor}`
    : "A presentation for your home";

  return (
    <header className="hero" data-testid="sep-hero">
      <div
        className={`hero-photo${hero ? "" : " monogram"}`}
        aria-hidden="true"
        style={
          hero
            ? {
                backgroundImage: `url("${hero.replace(/"/g, '\\"')}")`,
              }
            : undefined
        }
      />
      <div className="appbar">
        <div className="prepared">{headerLabel}</div>
        <button
          type="button"
          className="share"
          data-share
          aria-label="Share this page"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M4 12v7a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-7" />
            <path d="M16 6l-4-4-4 4" />
            <path d="M12 2v13" />
          </svg>
        </button>
      </div>
    </header>
  );
}

function CaptionCard({ payload }: { payload: PublicPayload }) {
  const { property, preparedFor } = payload;
  const addressLine = property.address || "Your home";
  // Pull a graceful "city, state ZIP" line from whatever we have.
  const locationLine = [
    property.city,
    [property.state, property.zip].filter((v) => v?.trim()).join("  "),
  ]
    .filter((v) => v?.trim())
    .join(", ");
  const kicker = preparedFor
    ? `A Recommendation · ${property.city ?? "Your home"}`
    : "A Recommendation";

  return (
    <div className="caption-wrap">
      <div className="caption-card" data-testid="sep-caption-card">
        {preparedFor && (
          <div className="for" data-testid="sep-prepared-for">
            For {preparedFor}
          </div>
        )}
        <div className="kicker">{kicker}</div>
        <h1 className="addr">{addressLine}</h1>
        {locationLine && <div className="city">{locationLine}</div>}
      </div>
    </div>
  );
}

// =====================================================================
// PRICE PANEL — hero value moment
// =====================================================================

function PricePanel({ payload }: { payload: PublicPayload }) {
  const recommended = payload.property.recommendedList || payload.recommendedPrice;
  const rationale = payload.property.rationaleShort;
  // A7c.8: gate the scroll-triggered count-up to clean integer dollar
  // amounts (e.g. "$675,000"). Fancy inputs like "$675k", "Call for
  // price", or decimals fall through to the static SSR render — the
  // count-up enhancement is opt-in via the data-attributes below.
  const cleanInteger = /^\$?\s*\d{1,3}(?:,\d{3})*$/.test((recommended ?? "").trim());
  const finalNumeric = cleanInteger ? parsePriceToNumber(recommended) : null;
  // Need >= 100 so the start floor (10^(digits-1)) is strictly below
  // the final — otherwise the climb has zero range and is a no-op.
  const countupAttrs =
    finalNumeric !== null && finalNumeric >= 100
      ? {
          "data-price-countup": "",
          "data-price-final": String(Math.floor(finalNumeric)),
        }
      : {};
  return (
    <section className="price-panel" data-testid="sep-price-panel">
      <div className="lbl">Recommended list</div>
      <div className="price" {...countupAttrs}>
        <PriceDisplay value={recommended} />
      </div>
      {rationale && <p className="rationale">{rationale}</p>}
    </section>
  );
}

/**
 * Split a formatted price like "$675,000" into the locked-design
 * shape: small brick dollar sign + large ink digits with a muted
 * comma separator. Falls back to the raw string when the format
 * doesn't match (e.g. "Call for price").
 *
 * The digit groups are wrapped in a [data-price-digits] span so the
 * A7c.8 count-up enhancement can mutate just the digits without
 * touching the brick "$" or any trailing suffix.
 */
function PriceDisplay({ value }: { value: string }) {
  const raw = (value ?? "").trim();
  if (!raw) return <span>—</span>;
  // Match "$675,000", "$1,234,567", "$675K" (or no $ prefix).
  const match = raw.match(/^\$?\s*(\d{1,3}(?:,\d{3})*(?:\.\d+)?)(.*)$/);
  if (!match) {
    return <span>{raw}</span>;
  }
  const [, digits, tail] = match;
  const parts = digits.split(",");
  return (
    <>
      <span className="dollar">$</span>
      <span data-price-digits>
        {parts.map((part, i) => (
          <span key={i}>
            {i > 0 && <span className="sep">,</span>}
            {part}
          </span>
        ))}
      </span>
      {tail && <span>{tail}</span>}
    </>
  );
}

// =====================================================================
// VIDEO BLOCK (optional)
// =====================================================================

function VideoBlock({ payload }: { payload: PublicPayload }) {
  const v = payload.video;
  if (!v || !v.videoUrl) return null;

  // A7d.8 — never-blank precedence: manual override > scrub-pick > auto
  // first-frame. The auto first-frame is captured at upload time so
  // there is always *some* poster as long as a video has been uploaded
  // (the seller page is never a black box pre-play).
  const poster = effectivePosterUrl(v);

  return (
    <section className="video-block" data-testid="sep-video">
      <div className="sec-label reveal">
        <span className="num">01</span>
        <span className="lbl" />
        <span className="name">
          {v.title ? "A short note from your agent" : "A short note"}
        </span>
      </div>
      <h2 className="sec-title reveal">
        Two <em>minutes,</em> on your home.
      </h2>
      {/* A7d.3: inline playback.
          - `playsInline` — required so iOS Safari doesn't force
            fullscreen the moment the buyer hits play.
          - `preload="metadata"` — fetch only the moov atom on page
            load. The actual stream doesn't pull until play; protects
            bandwidth for the 99% of visits that won't tap play.
          - `poster` — resolved via A7d.8 precedence (override > scrub
            > auto first-frame). The auto first-frame is captured at
            upload time so the block is never blank.
          - `controls` — native browser chrome (play / scrub / mute).
            Keeps the implementation framework-free and accessible.

          A7d.8.1 never-blank fallback: when poster is missing (e.g.
          iOS capture timed out before the auto first-frame landed),
          OMIT the attribute entirely rather than emit poster="".
          With preload="metadata" the browser falls back to painting
          the video's native first frame, which is far better than the
          black box `poster=""` renders. Capture working is the
          primary path; this is the safety net so a capture timeout
          never reintroduces the blank poster A7d.8 set out to kill.

          A7d.8.5 never-blank safety net: on iOS Safari the
          "native first frame" fallback is unreliable — a posterless
          <video> just renders a solid black box until the buyer taps
          play. So when ALL three poster slots are empty, mark the
          wrapper with `data-no-poster` so the CSS swaps the dark
          fallback surface for a tasteful branded panel. The video
          element still mounts on top and plays normally; the panel
          shows through wherever the paused video would be black. */}
      <div
        className="video-poster reveal"
        data-testid="sep-video-player"
        {...(poster ? {} : { "data-no-poster": "true" })}
      >
        <video
          className="video-player"
          src={v.videoUrl}
          {...(poster ? { poster } : {})}
          controls
          playsInline
          preload="metadata"
          aria-label={v.title ?? "Video message from your agent"}
          data-testid="sep-video-el"
          data-poster-source={
            v.posterUrl
              ? "override"
              : v.scrubPosterUrl
                ? "scrub"
                : v.autoPosterUrl
                  ? "auto"
                  : "none"
          }
        />
        {(v.title || v.runtime || v.recordedOn) && (
          <span className="meta">
            {v.title && <span className="ttl">{v.title}</span>}
            {(v.runtime || v.recordedOn) && (
              <span className="runtime">
                {[v.runtime, v.recordedOn].filter(Boolean).join(" · ")}
              </span>
            )}
          </span>
        )}
      </div>
    </section>
  );
}

// =====================================================================
// WHY THIS PRICE
// =====================================================================

function WhyPriceSection({ payload }: { payload: PublicPayload }) {
  const { whyPrice } = payload;
  const rationale = whyPrice.publicRationale?.trim();
  const comps = whyPrice.comps;
  // Hide the block when both rationale AND comps are empty.
  if (!rationale && comps.length === 0) return null;

  return (
    <section className="block paper" data-testid="sep-why-price">
      <div className="sec-label reveal">
        <span className="num">02</span>
        <span className="lbl" />
        <span className="name">Why this price</span>
      </div>
      <h2 className="sec-title reveal">
        A confident, <em>defensible</em> number.
      </h2>
      {rationale && (
        <p className="sec-body drop-cap reveal">{rationale}</p>
      )}
      {comps.length > 0 && (
        <div className="comps">
          {comps.map((c, i) => (
            <CompRow key={i} comp={c} index={i} />
          ))}
        </div>
      )}
      <div className="comps-note reveal">Source · Public record</div>
    </section>
  );
}

function CompRow({ comp, index }: { comp: PublicComp; index: number }) {
  const indexLabel = String(index + 1).padStart(2, "0");
  const subline = [
    comp.soldDate,
    comp.sqft ? `${comp.sqft} sqft` : null,
    comp.yearBuilt !== undefined ? `Built ${comp.yearBuilt}` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="comp reveal" data-testid={`sep-comp-${index}`}>
      <div className="idx">{indexLabel}</div>
      <div className="addr">
        {comp.address || "—"}
        {subline && <small>{subline}</small>}
      </div>
      <div className="sold">
        {comp.soldPrice || "—"}
        <small>Closed</small>
      </div>
    </div>
  );
}

// =====================================================================
// PITCH POINTS
// =====================================================================

function PitchSection({ payload }: { payload: PublicPayload }) {
  const cards = payload.pitchPublicCards;
  if (cards.length === 0) return null;

  return (
    <section className="pitch" data-testid="sep-pitch">
      <div className="sec-label reveal">
        <span className="num">03</span>
        <span className="lbl" />
        <span className="name">What I&apos;ll do for you</span>
      </div>
      <h2 className="sec-title reveal">
        A quiet, <em>thorough</em> way to sell.
      </h2>
      <div className="pitches">
        {cards.map((card, i) => (
          <div className="pp reveal" key={i} data-testid={`sep-pp-${i}`}>
            <div className="n">
              <em>{i + 1}.</em>
            </div>
            <div className="t">
              {card.title}
              {card.support && <small>{card.support}</small>}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

// =====================================================================
// REVIEWS (optional)
// =====================================================================

function ReviewsSection({ payload }: { payload: PublicPayload }) {
  const reviews = payload.reviews ?? [];
  const outlink = payload.reviewsOutlink;

  // Block hides only when BOTH are empty. With typed reviews, render
  // the full editorial block; with no typed reviews but an outlink set,
  // render the compact CTA-only variant (Dallen smoke 2026-05-23 — agents
  // commonly configure only the Zillow link and skip typed quotes).
  if (reviews.length === 0 && !outlink) return null;

  // A7d.6 — detect the friendly source name from the outlink URL so the
  // CTA wording adapts ("…on Google", "…on Realtor.com") instead of
  // hardcoding Zillow. Source = null → clean generic fallback with no
  // raw domain in the copy. Render-time only — the payload contract
  // (label + url) is unchanged.
  const sourceName = outlink ? detectReviewsSource(outlink.url) : null;
  const agentFirst = (payload.agent?.name ?? "").trim().split(/\s+/)[0];
  const cardCopy = reviewsCardCopy(agentFirst, sourceName);
  const seeAllCopy = seeAllReviewsCopy(sourceName);

  if (reviews.length === 0 && outlink) {
    return (
      <section
        className="reviews reviews--outlink-only"
        data-testid="sep-reviews"
        data-variant="outlink-only"
        data-reviews-source={sourceName ?? "generic"}
      >
        <div className="sec-label reveal">
          <span className="num">04</span>
          <span className="lbl" />
          <span className="name">In their words</span>
        </div>
        <a
          className="reviews-outlink-card reveal"
          href={outlink.url}
          target="_blank"
          rel="noopener noreferrer"
          data-testid="sep-reviews-outlink-cta"
        >
          <span className="reviews-outlink-card-copy">{cardCopy}</span>
          <span className="reviews-outlink-card-meta">{seeAllCopy}</span>
        </a>
      </section>
    );
  }

  return (
    <section
      className="reviews"
      data-testid="sep-reviews"
      data-reviews-source={sourceName ?? "generic"}
    >
      <div className="sec-label reveal">
        <span className="num">04</span>
        <span className="lbl" />
        <span className="name">In their words</span>
      </div>
      <h2 className="sec-title reveal">
        From families <em>like yours.</em>
      </h2>

      <div className="reviews-list">
        {reviews.map((r, i) => (
          <article className="review reveal" key={i}>
            <div className="qm">&ldquo;</div>
            <div>
              <p className="rv-body">{r.body}</p>
              <div className="att">
                <span className="nm">{r.attributionName}</span>
                {(r.attributionStreet || r.attributionYear) && (
                  <span>
                    {" "}
                    ·{" "}
                    {[
                      r.attributionStreet && `Sold on ${r.attributionStreet}`,
                      r.attributionYear,
                    ]
                      .filter(Boolean)
                      .join(", ")}
                  </span>
                )}
              </div>
            </div>
          </article>
        ))}
      </div>

      {outlink && (
        <a
          className="reviews-outlink reveal"
          href={outlink.url}
          target="_blank"
          rel="noopener noreferrer"
        >
          {seeAllCopy}
        </a>
      )}
    </section>
  );
}

/**
 * A7d.6 — small, extensible map from outlink hostname to the friendly
 * source name the CTA copy uses. Hostnames are lowercased and stripped
 * of a leading `www.` before lookup. An unknown host returns null so
 * the renderer falls back to source-free copy (it must never expose a
 * raw domain in the visible CTA).
 *
 * Add a new source by appending one entry — the regex form supports
 * the common multi-TLD cases (google.* / fb.com aliases / maps.google.*)
 * without bloating the table.
 */
const REVIEWS_SOURCE_PATTERNS: { match: RegExp; label: string }[] = [
  { match: /(^|\.)zillow\.com$/, label: "Zillow" },
  { match: /(^|\.)google\.[a-z.]+$/, label: "Google" },
  { match: /(^|\.)maps\.google\.[a-z.]+$/, label: "Google" },
  { match: /^g\.page$/, label: "Google" },
  { match: /^goo\.gl$/, label: "Google" },
  { match: /(^|\.)realtor\.com$/, label: "Realtor.com" },
  { match: /(^|\.)yelp\.com$/, label: "Yelp" },
  { match: /(^|\.)facebook\.com$/, label: "Facebook" },
  { match: /(^|\.)fb\.com$/, label: "Facebook" },
  { match: /(^|\.)redfin\.com$/, label: "Redfin" },
  { match: /(^|\.)homes\.com$/, label: "Homes.com" },
];

export function detectReviewsSource(url: string | undefined): string | null {
  if (!url || typeof url !== "string") return null;
  let host: string;
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    // Bare-host strings (no protocol) — best-effort parse.
    const trimmed = url.trim().toLowerCase();
    const m = /^(?:https?:\/\/)?([^/?#]+)/.exec(trimmed);
    host = m ? m[1] : "";
  }
  if (!host) return null;
  if (host.startsWith("www.")) host = host.slice(4);
  for (const { match, label } of REVIEWS_SOURCE_PATTERNS) {
    if (match.test(host)) return label;
  }
  return null;
}

/**
 * A7d.6 — outlink-only CTA copy. Names the detected source when known,
 * personalizes with the agent's first name when present, and degrades
 * to a calm nameless / source-free fallback otherwise. NEVER renders a
 * literal `{{token}}` — the agent name comes from `payload.agent.name`
 * and is substituted directly (no template engine).
 */
export function reviewsCardCopy(
  agentFirst: string | undefined,
  sourceName: string | null,
): string {
  const name = agentFirst?.trim();
  if (name && sourceName) return `Read ${name}'s reviews on ${sourceName}`;
  if (name && !sourceName) return `Read ${name}'s reviews`;
  if (!name && sourceName) return `Read these reviews on ${sourceName}`;
  return "Read past-client reviews";
}

/**
 * A7d.6 — "see all" link copy used for both the full-block underlined
 * link and the outlink-only card's meta line. The trailing arrow is
 * supplied by CSS (.reviews-outlink::after / .reviews-outlink-card-meta
 * ::after), so the string itself stays arrow-free.
 */
export function seeAllReviewsCopy(sourceName: string | null): string {
  return sourceName ? `See all reviews on ${sourceName}` : "See all reviews";
}

// =====================================================================
// AREA SALES + CHART
// =====================================================================

function AreaSection({ payload }: { payload: PublicPayload }) {
  const stats = payload.areaStats;
  // No areaStats at all → "coming soon" empty treatment. We still
  // render the section so the editorial rhythm doesn't break.
  const isEmpty = !stats;
  return (
    <section
      className={isEmpty ? "area area--empty" : "area"}
      data-testid="sep-area"
    >
      <div className="area-head">
        <div className="sec-label reveal" style={{ marginBottom: 0 }}>
          <span className="num">05</span>
          <span className="lbl" />
          <span className="name">Recent area sales</span>
        </div>
      </div>
      <h2 className="sec-title reveal" style={{ marginBottom: 28 }}>
        A neighborhood that <em>moves.</em>
      </h2>

      {stats && (
        <>
          <AreaStats stats={stats} />
          <AreaChart
            series={stats.monthlySeries}
            recommended={payload.property.recommendedList || payload.recommendedPrice}
          />
        </>
      )}

      <div className="area-empty" aria-hidden={!isEmpty}>
        <div className="icon">
          <svg
            width="12"
            height="12"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth="1.6"
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M3 17l6-6 4 4 8-8" />
            <path d="M17 7h4v4" />
          </svg>
        </div>
        <div className="h">A market snapshot is on the way.</div>
        <div className="p">
          We&apos;re cross-checking the freshest closings before showing them
          here. You&apos;ll see this section update within a few days.
        </div>
      </div>
    </section>
  );
}

function AreaStats({ stats }: { stats: NonNullable<PublicPayload["areaStats"]> }) {
  // Render a 2x2 grid of the four most-load-bearing stats. Each cell
  // is optional individually — render only the present ones, padding
  // empty cells if needed isn't necessary (CSS grid handles it).
  const cells: Array<{ label: string; value: string; ctx?: string }> = [];
  if (stats.medianSale)
    cells.push({
      label: "Median sale · 90 days",
      value: stats.medianSale,
      ctx: stats.medianSaleDeltaYoy,
    });
  if (stats.daysOnMarket)
    cells.push({
      label: "Days on market",
      value: stats.daysOnMarket,
      ctx: stats.daysOnMarketZipAvg,
    });
  if (stats.closings90d)
    cells.push({
      label: "Closings · 90 days",
      value: stats.closings90d,
    });
  if (stats.listToSaleRatio)
    cells.push({
      label: "List-to-sale ratio",
      value: stats.listToSaleRatio,
    });
  if (cells.length === 0) return null;

  return (
    <div className="area-stats">
      {cells.map((c, i) => (
        <div className="as reveal" key={i}>
          <div className="l">{c.label}</div>
          <div className="v">{c.value}</div>
          {c.ctx && <div className="ctx">{c.ctx}</div>}
        </div>
      ))}
    </div>
  );
}

/**
 * Data-driven port of the locked design's 12-point area chart.
 * Computes the SVG path + circle positions from `monthlySeries`
 * (1–12 entries). Y-axis auto-scales to the data range.
 *
 * Graceful: if series is missing or empty, render nothing — the
 * area-stats block above already conveys the snapshot.
 *
 * F2 — EXPORTED for reuse by the flagship (v2) AreaStats section. The
 * geometry / scales / label-placement / draw-on motion are FROZEN and
 * shared verbatim between v1 and v2; the flagship applies ONLY a color/
 * type skin via its own scoped stylesheet (TOKEN_MAP §7), overriding the
 * chart's class-based colors (.line-stroke, .area-fill, …) — no edit to
 * this geometry is made. Adding `export` is the sole change here.
 */
export function AreaChart({
  series,
  recommended,
}: {
  series?: AreaStatsMonthly[];
  recommended: string;
}) {
  if (!series || series.length === 0) return null;

  // Parse "$642,000" / "$642k" / "642000" → a numeric for scaling.
  const parsed = series
    .map((m) => parsePriceToNumber(m.medianPrice))
    .filter((n): n is number => n !== null);
  if (parsed.length === 0) return null;

  const min = Math.min(...parsed);
  const max = Math.max(...parsed);
  const range = Math.max(max - min, 1);

  // Plot area (viewBox 400x234 — match the locked design exactly).
  const X0 = 40;
  const X1 = 388;
  const Y_TOP = 104;
  const Y_BOTTOM = 184;
  const plotHeight = Y_BOTTOM - Y_TOP;

  const points = series.map((m, i) => {
    const n = parsePriceToNumber(m.medianPrice) ?? min;
    const x =
      series.length === 1
        ? (X0 + X1) / 2
        : X0 + ((X1 - X0) * i) / (series.length - 1);
    const y = Y_BOTTOM - ((n - min) / range) * (plotHeight - 6);
    return { x, y, month: m.month, value: n };
  });

  const lineD = points
    .map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)} ${p.y.toFixed(1)}`)
    .join(" ");
  const areaD = `${lineD} L${points[points.length - 1].x.toFixed(1)} ${Y_BOTTOM} L${points[0].x.toFixed(1)} ${Y_BOTTOM} Z`;

  const yLabels = [
    {
      y: 107,
      label: formatCompact(min + (range * 5) / 6),
    },
    { y: 137, label: formatCompact(min + range / 2) },
    { y: 167, label: formatCompact(min) },
  ];

  // Tick labels: first / a middle / a later / last when ≥4 points.
  const ticks =
    series.length >= 4
      ? [
          { index: 0, anchor: "start" as const },
          {
            index: Math.floor(series.length / 3),
            anchor: "middle" as const,
          },
          {
            index: Math.floor((series.length * 2) / 3),
            anchor: "middle" as const,
          },
          { index: series.length - 1, anchor: "end" as const },
        ]
      : series.map((_, i) => ({
          index: i,
          anchor: (i === 0
            ? "start"
            : i === series.length - 1
              ? "end"
              : "middle") as "start" | "middle" | "end",
        }));

  const current = points[points.length - 1];
  const recommendedNumeric = parsePriceToNumber(recommended);

  // A7d.10 — recommended price renders as a fixed reference banner that
  // mirrors the right-side current-value callout. The dashed line + labels
  // pin to a fixed band JUST BELOW the chart's header row (caption +
  // value), decoupled from the y-scale. The NUMBER communicates the value;
  // vertical position no longer encodes it (Dallen's deliberate call:
  // clean > positionally-encoded). Supersedes A7d.6/.7 placeRecAnnotation
  // — in this band there's clear space, so chip-collision / edge-swap
  // gymnastics are gone. Left-side stack mirrors the right: "RECOMMENDED"
  // caption on top, price chip below, then the dashed line.

  return (
    <div className="chart-wrap reveal">
      <div className="chart-head">
        <div className="l">
          <strong>Median sale price</strong>
          {series.length} months
        </div>
      </div>
      <svg
        className="chart"
        viewBox="0 0 400 234"
        role="img"
        aria-label="Median sale price trend"
        preserveAspectRatio="none"
      >
        <defs>
          <linearGradient id="sepChartFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#3F6C8E" stopOpacity="0.30" />
            <stop offset="55%" stopColor="#3F6C8E" stopOpacity="0.10" />
            <stop offset="100%" stopColor="#3F6C8E" stopOpacity="0" />
          </linearGradient>
        </defs>

        <text className="callout-sub" x={X1} y={52} textAnchor="end">
          {current.month} · current
        </text>
        <text className="callout-text" x={X1} y={73} textAnchor="end">
          {formatCompact(current.value)}
        </text>

        <g>
          <line className="gridline" x1={X0} x2={X1} y1={104} y2={104} />
          <line className="gridline" x1={X0} x2={X1} y1={134} y2={134} />
          <line className="gridline" x1={X0} x2={X1} y1={164} y2={164} />
          <line className="baseline" x1={X0} x2={X1} y1={184} y2={184} />
        </g>
        <g>
          {yLabels.map((y, i) => (
            <text key={i} className="y-label" x={4} y={y.y}>
              {y.label}
            </text>
          ))}
        </g>

        <g className="line-group">
          <path className="area-fill" d={areaD} />
          <path className="line-stroke" pathLength={600} d={lineD} />
          {points.slice(0, -1).map((p, i) => (
            <circle
              key={i}
              className="point"
              cx={p.x}
              cy={p.y}
              r={2.8}
            />
          ))}
          {points.length > 0 && (
            <>
              <circle
                className="point-current-pulse"
                cx={current.x}
                cy={current.y}
                r={5}
              />
              <circle
                className="point-current-pulse delay"
                cx={current.x}
                cy={current.y}
                r={5}
              />
              <circle
                className="point-current-ring"
                cx={current.x}
                cy={current.y}
                r={11}
              />
              <circle
                className="point-current"
                cx={current.x}
                cy={current.y}
                r={5}
              />
            </>
          )}
        </g>

        {recommended && (
          <g className="rec-annotation">
            <line
              className="rec-line"
              x1={X0}
              x2={X1}
              y1={REC_LINE_Y}
              y2={REC_LINE_Y}
            />
            <rect
              className="rec-tag-bg"
              x={REC_NUM_CHIP.x}
              y={REC_NUM_CHIP.y}
              width={REC_NUM_CHIP.width}
              height={REC_NUM_CHIP.height}
              rx={2}
              ry={2}
            />
            <text
              className="rec-tag-num"
              x={REC_LEFT_X}
              y={REC_NUM_Y}
              textAnchor="start"
            >
              {formatCompact(recommendedNumeric ?? max)}
            </text>
            <rect
              className="rec-tag-bg"
              x={REC_LABEL_CHIP.x}
              y={REC_LABEL_CHIP.y}
              width={REC_LABEL_CHIP.width}
              height={REC_LABEL_CHIP.height}
              rx={2}
              ry={2}
            />
            <text
              className="rec-tag-text"
              x={REC_LEFT_X}
              y={REC_LABEL_Y}
              textAnchor="start"
            >
              Recommended
            </text>
          </g>
        )}

        <g>
          {ticks.map((t, i) => {
            const p = points[t.index];
            return (
              <text
                key={i}
                className="x-label"
                x={p.x}
                y={204}
                textAnchor={t.anchor}
              >
                {p.month}
              </text>
            );
          })}
        </g>
      </svg>
    </div>
  );
}

/**
 * A7d.10.2 — fixed reference banner for the recommended-price line,
 * with a CLEAN HEADER BAND: both header values share one baseline.
 *
 * The dashed line sits at a fixed y JUST BELOW both header values, NOT
 * at the data-scaled y. The "RECOMMENDED" caption + price chip on the
 * left and the "{month} · CURRENT" caption + current value on the right
 * are aligned to the same two-row header band: captions at y=52, values
 * at y=70. The dashed line sits BELOW both values at y=80, so it can
 * never overlap either number — for any data (recommended < current OR
 * recommended > current).
 *
 * A7d.10.1 left the current value pinned at y=86 (its locked-design
 * baseline), which placed it in the SAME row as the dashed line at y=80
 * and let the line slice through the number whenever the recommended
 * price was below the current value. Aligning both values to y=70 and
 * keeping the line at y=80 fixes the collision for every data shape.
 *
 * Supersedes A7d.6/A7d.7 placeRecAnnotation (chip-on-line, edge-swap,
 * callout-avoidance) — in this band there's clear space, so the
 * gymnastics are no longer needed. Vertical position no longer encodes
 * the recommended price relative to the trend; the number communicates
 * the value.
 *
 * Geometry (viewBox 400 × 234, SVG y grows downward):
 *   - REC_LABEL_Y = 52: caption baseline (aligned with right callout-sub)
 *   - REC_NUM_Y   = 70: price baseline   (aligned with right callout-text)
 *   - REC_LINE_Y  = 80: dashed line BELOW both header values
 *   - plot band   = y ∈ [104, 184]
 *   - upper-right callout (≈ x ∈ [278, 388], y ∈ [25, 95]) is untouched
 *     since the left-anchored chips never reach that x band; the line
 *     lives in the gap between the callout band and the plot grid.
 */
export const REC_LINE_Y = 80;
const REC_LEFT_INSET = 6;
export const REC_LEFT_X = 40 + REC_LEFT_INSET;
export const REC_LABEL_Y = 52;
export const REC_NUM_Y = 70;

const REC_NUM_TEXT_WIDTH = 50; // "$685k" / "$1.2m" visible width
const REC_NUM_TEXT_HEIGHT = 14; // cap-height + descender for 16px display
const REC_LABEL_TEXT_WIDTH = 72; // "RECOMMENDED" small caps + letter-spacing
const REC_LABEL_TEXT_HEIGHT = 7; // cap-height for 8.5px small caps
const REC_CHIP_PAD_X = 5;
const REC_CHIP_PAD_Y = 2;

function leftChip(
  baselineY: number,
  textWidth: number,
  textHeight: number,
): { x: number; y: number; width: number; height: number } {
  return {
    x: REC_LEFT_X - REC_CHIP_PAD_X,
    y: baselineY - textHeight - REC_CHIP_PAD_Y + 1,
    width: textWidth + REC_CHIP_PAD_X * 2,
    height: textHeight + REC_CHIP_PAD_Y * 2,
  };
}

export const REC_NUM_CHIP = leftChip(
  REC_NUM_Y,
  REC_NUM_TEXT_WIDTH,
  REC_NUM_TEXT_HEIGHT,
);
export const REC_LABEL_CHIP = leftChip(
  REC_LABEL_Y,
  REC_LABEL_TEXT_WIDTH,
  REC_LABEL_TEXT_HEIGHT,
);

/** Parse a price string like "$642,000" or "642000" into a number. */
function parsePriceToNumber(v: string | undefined): number | null {
  if (!v) return null;
  const stripped = v.replace(/[^0-9.kKmM]/g, "");
  if (!stripped) return null;
  const lower = stripped.toLowerCase();
  if (lower.endsWith("k")) {
    const n = parseFloat(lower.slice(0, -1));
    return Number.isFinite(n) ? n * 1000 : null;
  }
  if (lower.endsWith("m")) {
    const n = parseFloat(lower.slice(0, -1));
    return Number.isFinite(n) ? n * 1_000_000 : null;
  }
  const n = parseFloat(stripped);
  return Number.isFinite(n) ? n : null;
}

/** "642000" → "$642k", "1,200,000" → "$1.2m". */
function formatCompact(n: number): string {
  if (!Number.isFinite(n)) return "—";
  if (n >= 1_000_000) {
    return `$${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}m`;
  }
  if (n >= 1_000) {
    return `$${Math.round(n / 1_000)}k`;
  }
  return `$${Math.round(n)}`;
}

// =====================================================================
// AGENT — DARK CHAPTER
// =====================================================================

function AgentSection({ payload }: { payload: PublicPayload }) {
  const a = payload.agent;
  if (!a.name?.trim()) return null;

  const monogram = a.name
    .split(/\s+/)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <section className="agent" data-testid="sep-agent">
      <div className="sec-label reveal">
        <span className="num">06</span>
        <span className="lbl" />
        <span className="name">Your agent</span>
      </div>
      <h2 className="sec-title reveal">{a.name}.</h2>

      <div className="agent-card reveal">
        <div
          className={`agent-photo${a.photoUrl ? "" : " agent-photo--monogram"}`}
          data-monogram={monogram}
          style={
            a.photoUrl
              ? {
                  backgroundImage: `url("${a.photoUrl.replace(/"/g, '\\"')}")`,
                }
              : undefined
          }
        >
          <div className="verify" aria-label="Verified agent">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M5 12l4 4 10-10" />
            </svg>
          </div>
        </div>
        <div>
          <div className="agent-name">{a.name}</div>
          {(a.brokerage || a.areasServed) && (
            <div className="agent-role">
              {a.brokerage}
              {a.brokerage && a.areasServed && <br />}
              {a.areasServed && <em>{a.areasServed}</em>}
            </div>
          )}
        </div>
      </div>

      {a.bioShort && <p className="agent-bio reveal">&ldquo;{a.bioShort}&rdquo;</p>}

      <AgentMeta agent={a} />
      <AgentCtas agent={a} />
    </section>
  );
}

function AgentMeta({ agent }: { agent: AgentBranding }) {
  const cells: Array<{ label: string; value: string; mono?: boolean }> = [];
  if (agent.phone)
    cells.push({ label: "Direct", value: formatPhoneDisplay(agent.phone), mono: true });
  if (agent.email) cells.push({ label: "Email", value: agent.email, mono: true });
  if (agent.licenseNumber)
    cells.push({ label: "License", value: agent.licenseNumber, mono: true });
  if (agent.yearsInArea)
    cells.push({ label: "Years of experience", value: agent.yearsInArea });
  if (cells.length === 0) return null;
  return (
    <div className="agent-meta">
      {cells.map((c, i) => (
        <div className="am reveal" key={i}>
          <div className="l">{c.label}</div>
          <div className={c.mono ? "v mono" : "v"}>{c.value}</div>
        </div>
      ))}
    </div>
  );
}

function AgentCtas({ agent }: { agent: AgentBranding }) {
  const phone = agent.phone?.replace(/[^0-9+]/g, "");
  const email = agent.email;
  if (!phone && !email) return null;
  return (
    <div className="agent-ctas">
      {email && (
        <a
          href={`mailto:${email}?subject=${encodeURIComponent("Listing call")}`}
          className="cta primary reveal"
        >
          <span>Schedule a listing call</span>
          <span className="ar">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M5 12h14M13 6l6 6-6 6" />
            </svg>
          </span>
        </a>
      )}
      {agent.ctaReassurance && (
        <div className="cta-reassure">{agent.ctaReassurance}</div>
      )}
      {phone && (
        <a href={`tel:${phone}`} className="cta outline reveal">
          <span>
            Call {agent.name?.split(/\s+/)[0] ?? "the agent"} directly
          </span>
          <span className="ar">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.79 19.79 0 0 1 2.12 4.18 2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z" />
            </svg>
          </span>
        </a>
      )}
    </div>
  );
}

function formatPhoneDisplay(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 10) {
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)} · ${digits.slice(6)}`;
  }
  return raw;
}

// =====================================================================
// END MARK + FOOTER
// =====================================================================

function EndMark() {
  return (
    <div className="end-mark">
      <span className="rule" />
      <span className="dot" aria-hidden="true" />
      <span className="rule" />
    </div>
  );
}

function Foot({ payload }: { payload: PublicPayload }) {
  const preparedFor = payload.preparedFor?.trim();
  const disclaimer = preparedFor
    ? `Prepared privately for ${preparedFor}. The information above is drawn from public record. This page is not an advertisement and does not constitute an offer.`
    : "The information above is drawn from public record. This page is not an advertisement and does not constitute an offer.";

  return (
    <footer className="foot">
      <div className="row">
        <div className="brand">
          <div className="glyph">S</div>
          <div className="wm">
            Studio <em>SEP</em>
          </div>
        </div>
      </div>
      <div className="small">{disclaimer}</div>
    </footer>
  );
}
