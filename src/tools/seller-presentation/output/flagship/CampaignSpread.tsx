import type { CSSProperties } from "react";
import type { PublicPayload, PublicRecentListing } from "../public-payload";
import {
  streetViewStaticUrl,
  STREET_VIEW_FOV,
  STREET_VIEW_PITCH,
} from "@/lib/seller-presentation/street-view";
import { ListingCardPhoto } from "./ListingCardPhoto";
import {
  CAMPAIGN_GHOST_SUB,
  CAMPAIGN_HEADLINE_BY_EMPHASIS,
  CAMPAIGN_HEADLINE_DEFAULT,
  CAPABILITY_PHOTO_LABEL,
  CAPABILITY_PHOTO_SUB,
  CAPABILITY_VIDEO_LABEL,
  CAPABILITY_VIDEO_SUB,
  COVERFLOW_AGGREGATE_CAP,
  COVERFLOW_AGGREGATE_LABEL,
  COVERFLOW_EYEBROW,
  COVERFLOW_VIEWS_LABEL,
  EXPOSURE_LINE,
  CAMPAIGN_LEADIN,
  INCLUDED_EYEBROW,
  WORK_EYEBROW,
  WORK_NEXT_CHIP,
  WORK_SWIPE_CUE,
} from "./state-a-copy";
import { isLeadEmphasisKey } from "@/lib/seller-presentation/lead-emphasis";
// Co-load the spread/coverflow styles with the component so they are present
// wherever it is composed — State A (StateAPage already imports state-a.css) AND
// State B (FlagshipPage, which imports only flagship.css). The `.sa-spread` /
// `.sa-frame` / `.sa-cf` rules are scoped to `.fs-page` (not `.fs-page.state-a`),
// so they apply under the flagship root too. Without this the coverflow would
// render UNSTYLED on State B (the "invisible cards" failure this guards against).
import "./state-a.css";

/**
 * Seller State A · Signature B - "How I'll get your home seen" (campaign spread).
 *
 * The one net-new visual: a premium, editorial composition of the agent's
 * CAPABILITY, photo-forward, matching the State B DNA. Shows OUTPUT, not strategy,
 * and never an abstract dot field / node graph / logo row / tech-stack map. A slim
 * reach line beneath says WHERE the home is seen without a utilitarian lane wall.
 *
 * Honest by construction: BEFORE the walkthrough this home has no listing photo
 * and no tour yet, so the frames must NOT imply them. They are built from the
 * agent's SET-ONCE capability samples (their best listing photography +  a recent
 * video tour, sourced from Settings and reused across every invitation) plus the
 * agent's authored marketing-plan items (`whyUs.marketingApproach`). The
 * capability video is a DISTINCT asset from the per-invitation hero personal
 * message (`payload.video`), which fixes the "same video, two labels" problem.
 * Nothing is fabricated; each frame flexes out when its sample is unset, and the
 * whole section flexes out when nothing backs it (the written promise still reads
 * complete via the marketing items + reach line when a sample is missing).
 */
type Frame = {
  key: string;
  label: string;
  sub?: string;
  image?: string;
  kind: "photo" | "asset";
  /** Display framing for the image (object/background-position % + zoom). */
  focalX?: number;
  focalY?: number;
  scale?: number;
};

/**
 * Background style for a frame's image, applying its display framing (position +
 * zoom). No framing set → just the image, byte-identical to before.
 */
function frameBgStyle(f: Frame): CSSProperties {
  const style: CSSProperties = {
    backgroundImage: `url("${(f.image ?? "").replace(/"/g, '\\"')}")`,
  };
  if (typeof f.focalX === "number" || typeof f.focalY === "number") {
    style.backgroundPosition = `${f.focalX ?? 50}% ${f.focalY ?? 50}%`;
  }
  if (typeof f.scale === "number" && f.scale > 1) {
    style.transform = `scale(${f.scale})`;
    style.transformOrigin = `${f.focalX ?? 50}% ${f.focalY ?? 50}%`;
  }
  return style;
}

/**
 * `variant`:
 *   - "full" (default, State A) — the complete spread: capability frames +
 *     marketing items + the exposure coverflow + reach line. Byte-identical to
 *     what State A has always rendered.
 *   - "coverflow-only" (State B / FlagshipPage) — JUST the reach-proof exposure:
 *     the headline + the listings coverflow + the reach line, with NO capability
 *     frames and NO emphasis ghost. State B already tells the marketing story in
 *     its own "How we market" (WhyUs) section, so re-rendering the capability
 *     frames there would duplicate it; the coverflow (recent listings, real
 *     reach) is the piece State B genuinely lacks. Same component, same coverflow
 *     — no fork. Flexes out entirely (renders null) when there are no listings.
 */
export function CampaignSpread({
  payload,
  variant = "full",
}: {
  payload: PublicPayload;
  variant?: "full" | "coverflow-only";
}) {
  const frames: Frame[] = [];

  // Set-once capability PHOTO: the agent's best listing photography (NOT this
  // home, which is not shot yet). Relabeled honestly as a capability, never "The
  // listing" / "magazine-grade".
  const samplePhoto = payload.sampleListingPhotoUrl?.trim();
  if (samplePhoto) {
    frames.push({
      key: "photo",
      label: CAPABILITY_PHOTO_LABEL,
      sub: CAPABILITY_PHOTO_SUB,
      image: samplePhoto,
      kind: "photo",
      focalX: payload.sampleListingPhotoFocalX,
      focalY: payload.sampleListingPhotoFocalY,
      scale: payload.sampleListingPhotoScale,
    });
  }

  // Set-once capability VIDEO: a recent video tour the agent produced, DISTINCT
  // from the per-invitation hero personal message (payload.video). Its poster (an
  // auto-captured first frame) backs the frame when present.
  const sampleVideo = payload.sampleVideoUrl?.trim();
  if (sampleVideo) {
    const poster = payload.sampleVideoPosterUrl?.trim();
    frames.push({
      key: "video",
      label: CAPABILITY_VIDEO_LABEL,
      sub: CAPABILITY_VIDEO_SUB,
      image: poster,
      kind: poster ? "photo" : "asset",
    });
  }

  const marketing = payload.whyUs?.marketingApproach ?? [];
  marketing.slice(0, 3).forEach((m, i) => {
    if (!m.title?.trim()) return;
    frames.push({
      key: `mkt-${i}`,
      label: m.title,
      sub: m.detail?.trim() || undefined,
      kind: "asset",
    });
  });

  // Zone 5 — the agent's recent listings (the exposure coverflow). Already
  // flag-gated + clamped at the payload boundary: absent on a flag-off / revealed
  // / no-data publish, so `listings` is empty and the section renders exactly as
  // it ships today (capability cards only). The coverflow is a flex-IN addition
  // beneath the cards, never required for the section to read.
  const listings = payload.recentListings ?? [];

  // Pass 2b — the launch-story headline honors the agent's set-once lead emphasis
  // (onboarding BEAT 5). Unset / unknown -> the shipped default, byte-identical.
  const emphasis = isLeadEmphasisKey(payload.leadEmphasis)
    ? payload.leadEmphasis
    : null;
  const headline = emphasis
    ? CAMPAIGN_HEADLINE_BY_EMPHASIS[emphasis]
    : CAMPAIGN_HEADLINE_DEFAULT;

  // State B (coverflow-only): render ONLY the reach-proof exposure — the headline
  // + the listings coverflow + the reach line. NO capability frames / emphasis
  // ghost (State B's WhyUs already tells the marketing story). Honesty gate:
  // with no listings the whole zone flexes out (renders null), so a real State-B
  // page with no recent-listings data looks complete, never an empty band.
  if (variant === "coverflow-only") {
    if (listings.length === 0) return null;
    return (
      <section
        className="section sa-spread z-offwhite"
        data-testid="fs-sa-spread"
        data-variant="coverflow-only"
      >
        <div className="reveal">
          <div className="eyebrow">
            How I&apos;ll Get Your Home Seen{" "}
            <span className="rule" aria-hidden="true" />
          </div>
          <h2 className="head">
            {headline.lead} <em>{headline.em}</em>.
          </h2>
        </div>
        <ListingsCoverflow listings={listings} />
        <p className="sa-spread__reach reveal" data-testid="fs-sa-spread-reach">
          {EXPOSURE_LINE}
        </p>
      </section>
    );
  }

  // v1.7 Packet C — the redesigned marketing zone (MARKETING_ZONE_REDESIGN, full
  // variant only). The same data, recomposed into the locked three parts: a flat
  // "THE WORK" swipe showcase (the agent's craft media), a "WHAT'S INCLUDED"
  // editorial capabilities list (substance inline, no accordion), and a tinted
  // lead-in into the existing exposure coverflow — deliberately distinct from the
  // 3D coverflow (flat slide vs. perspective bend; "the craft" vs. "real reach";
  // the list + lead-in buffer between them). Flag-off renders the grid below,
  // byte-identical. The coverflow-only (State B) variant returned above ignores it.
  if (payload.marketingZoneRedesign === true) {
    const workFrames: Frame[] = [];
    if (samplePhoto) {
      workFrames.push({
        key: "photo",
        label: CAPABILITY_PHOTO_LABEL,
        sub: CAPABILITY_PHOTO_SUB,
        image: samplePhoto,
        kind: "photo",
        focalX: payload.sampleListingPhotoFocalX,
        focalY: payload.sampleListingPhotoFocalY,
        scale: payload.sampleListingPhotoScale,
      });
    }
    if (sampleVideo) {
      const poster = payload.sampleVideoPosterUrl?.trim();
      workFrames.push({
        key: "video",
        label: CAPABILITY_VIDEO_LABEL,
        sub: CAPABILITY_VIDEO_SUB,
        image: poster,
        kind: poster ? "photo" : "asset",
      });
    }
    // The capability list reuses the agent's authored marketing items verbatim
    // (whyUs.marketingApproach) — substance always visible, never behind a tap.
    const included = marketing.slice(0, 3).filter((m) => m.title?.trim());
    const hasCraftAbove = workFrames.length > 0 || included.length > 0;

    // Honesty: the whole zone flexes out only when nothing backs it AND no lead
    // emphasis is set — same gate as the legacy render, so an empty page is empty
    // here too (never an empty showcase shell or a bare header).
    if (!hasCraftAbove && listings.length === 0 && !emphasis) return null;

    return (
      <section
        className="section sa-spread z-offwhite"
        data-testid="fs-sa-spread"
        data-redesign="1"
      >
        <div className="reveal">
          <div className="eyebrow">
            How I&apos;ll Get Your Home Seen{" "}
            <span className="rule" aria-hidden="true" />
          </div>
          <h2 className="head">
            {headline.lead} <em>{headline.em}</em>.
          </h2>
        </div>

        {hasCraftAbove ? (
          <div className="sa-spread__editorial">
            {workFrames.length > 0 && <WorkShowcase frames={workFrames} />}
            {included.length > 0 && <IncludedList items={included} />}
          </div>
        ) : (
          // No craft media or capability copy yet, but a lead emphasis is set:
          // the same calm ghost the legacy render shows, so the headline has a
          // body to sit over (honest — it names the plan, fabricates nothing).
          emphasis && (
            <div className="sa-spread__grid reveal">
              <div
                className="sa-frame sa-frame--lead sa-frame--ghost"
                data-testid="fs-sa-spread-ghost"
              >
                <div className="sa-frame__cap">
                  <span className="sa-frame__label">{headline.em}</span>
                  <span className="sa-frame__sub">{CAMPAIGN_GHOST_SUB}</span>
                </div>
              </div>
            </div>
          )
        )}

        {listings.length > 0 && (
          <div className="sa-spread__proof">
            {hasCraftAbove && (
              <p
                className="sa-spread__leadin reveal"
                data-testid="fs-sa-spread-leadin"
              >
                {CAMPAIGN_LEADIN}
              </p>
            )}
            <ListingsCoverflow listings={listings} />
          </div>
        )}

        <p className="sa-spread__reach reveal" data-testid="fs-sa-spread-reach">
          {EXPOSURE_LINE}
        </p>
      </section>
    );
  }

  // Byte-identical guarantee: with no frames AND no listings, the section still
  // flexes out EXCEPT when the agent has picked a lead emphasis - then the chosen
  // lever renders as the real headline + a tasteful ghost (the onboarding BEAT 5
  // climax, and any live page where emphasis is set but no capability sample is
  // yet uploaded). A page WITH frames renders identically to today.
  if (frames.length === 0 && listings.length === 0 && !emphasis) return null;

  const [lead, ...rest] = frames;

  return (
    <section className="section sa-spread z-offwhite" data-testid="fs-sa-spread">
      <div className="reveal">
        <div className="eyebrow">
          How I&apos;ll Get Your Home Seen{" "}
          <span className="rule" aria-hidden="true" />
        </div>
        <h2 className="head">
          {headline.lead} <em>{headline.em}</em>.
        </h2>
      </div>

      {frames.length > 0 ? (
        <div className="sa-spread__grid reveal">
          <SpreadFrame frame={lead} lead />
          {rest.length > 0 && (
            <div className="sa-spread__rest">
              {rest.map((f) => (
                <SpreadFrame key={f.key} frame={f} />
              ))}
            </div>
          )}
        </div>
      ) : (
        listings.length === 0 &&
        emphasis && (
          // No capability sample yet, but the agent picked a lead emphasis: render
          // the chosen lever as one calm ghost frame so the headline has a body to
          // sit over. Honest - it names the plan, never a fabricated asset.
          <div className="sa-spread__grid reveal">
            <div
              className="sa-frame sa-frame--lead sa-frame--ghost"
              data-testid="fs-sa-spread-ghost"
            >
              <div className="sa-frame__cap">
                <span className="sa-frame__label">{headline.em}</span>
                <span className="sa-frame__sub">{CAMPAIGN_GHOST_SUB}</span>
              </div>
            </div>
          </div>
        )
      )}

      {listings.length > 0 && <ListingsCoverflow listings={listings} />}

      <p className="sa-spread__reach reveal" data-testid="fs-sa-spread-reach">
        {EXPOSURE_LINE}
      </p>
    </section>
  );
}

/**
 * Zone 5 position in the fan ("gently dimensional", v1.5x). Center is forward +
 * upright (earns the teal keyline); the inner pair bends back; the outer pair are
 * quiet ~36° peeks with NO band (they only signal "there's more"). Mapped from
 * the listing index so the few-card states read intentional, NEVER overlapping or
 * clipping an address:
 *   1 → a centered single (keeps the keyline)
 *   2 → a SEPARATED balanced pair (pair-left/right, pushed to ±54% so the cards
 *       never cross — the old ±30% in-left/in-right overlapped ~118px and clipped
 *       the address); a pair has no single focus, so NO keyline.
 *   3 → a trio (center keyline + an inner pair pushed out to ±52%, no overlap)
 *   4+ → the shipped symmetric fan (center / inner ±23° / outer ±36° peeks)
 */
type CoverflowPos =
  | "center"
  | "in-left"
  | "in-right"
  | "out-left"
  | "out-right"
  | "pair-left"
  | "pair-right";

function coverflowPositions(n: number): CoverflowPos[] {
  if (n <= 1) return ["center"];
  if (n === 2) return ["pair-left", "pair-right"];
  if (n === 3) return ["in-left", "center", "in-right"];
  const center = Math.floor(n / 2);
  return Array.from({ length: n }, (_, i): CoverflowPos => {
    const off = i - center;
    if (off === 0) return "center";
    if (off === -1) return "in-left";
    if (off === 1) return "in-right";
    return off < 0 ? "out-left" : "out-right";
  });
}

/**
 * Zone 5 listings coverflow — the literal proof of reach beneath the capability
 * cards. CSS-first: the 3D bend (desktop) and the near-flat peek-swipe (mobile)
 * live entirely in state-a.css; this component only arranges the cards + computes
 * the honest aggregate. The view number is the hero (white, on the solid dark
 * band); legibility never rides on the raw photo.
 */
function ListingsCoverflow({ listings }: { listings: PublicRecentListing[] }) {
  const positions = coverflowPositions(listings.length);

  // The aggregate is SUMMED from the real per-card view counts — never authored,
  // so it can't be a hollow claim. It renders only when enough cards (≥2) carry
  // a number, matching the honesty gate.
  const numbered = listings.filter(
    (l): l is PublicRecentListing & { viewCount: number } =>
      typeof l.viewCount === "number",
  );
  const showAggregate = numbered.length >= 2;
  const aggregateRaw = numbered.reduce((sum, l) => sum + l.viewCount, 0);
  const aggregateTotal = aggregateRaw.toLocaleString("en-US");

  // Per-count modifier — drives the "gently dimensional" few-card layouts on
  // desktop (state-a.css). 4+ carries no modifier (the symmetric fan).
  const fanClass =
    listings.length === 1
      ? " sa-cf__fan--n1"
      : listings.length === 2
        ? " sa-cf__fan--n2"
        : listings.length === 3
          ? " sa-cf__fan--n3"
          : "";

  return (
    <div className="sa-cf reveal" data-testid="fs-sa-cf">
      <p className="sa-cf__eyebrow">{COVERFLOW_EYEBROW}</p>
      <div className={`sa-cf__fan${fanClass}`}>
        <div className="sa-cf__track">
          {listings.map((listing, i) => (
            <ListingCard
              key={i}
              listing={listing}
              pos={positions[i]}
              index={i}
            />
          ))}
        </div>
      </div>
      {showAggregate && (
        // The aggregate now reads in the shared proof-number language (mono
        // label · Newsreader teal number · mono caption — the same treatment as
        // the brief's stat panels), so every number on the page reads designed,
        // not assembled. The number counts up once on view (data-countup-num,
        // wired by the motion island); the SSR text is the true total so a
        // no-JS / reduced-motion render shows it at rest.
        <div className="sa-cf__agg" data-testid="fs-sa-cf-aggregate">
          <span className="sa-proof__label">{COVERFLOW_AGGREGATE_LABEL}</span>
          <span
            className="sa-proof__num sa-cf__aggnum"
            data-countup-num
            data-countup-final={String(aggregateRaw)}
          >
            {aggregateTotal}
          </span>
          <span className="sa-proof__cap">{COVERFLOW_AGGREGATE_CAP}</span>
        </div>
      )}
    </div>
  );
}

function ListingCard({
  listing,
  pos,
  index,
  idPrefix = "fs-sa-cf",
}: {
  listing: PublicRecentListing;
  pos: CoverflowPos;
  index: number;
  /**
   * Test-id namespace. The default keeps the published coverflow byte-identical
   * (`fs-sa-cf-card-…` / `-photo-…` / `-views-…`). The in-Settings read-only
   * preview (`ListingCardPreview`) passes a distinct prefix so its card never
   * duplicates the live page's test ids when both render on one page (Studio).
   */
  idPrefix?: string;
}) {
  // Photo candidates, in priority order: the hosted upload first, then the
  // Street View fallback (requested fresh from Google at view time, same pattern
  // as the comp thumbs — no bytes stored). The card renders the first that
  // LOADS: a non-empty-but-broken upload URL now falls through to Street View
  // (then a neutral placeholder) at view time instead of leaving a blank white
  // photo area, while empty-photo and valid-photo paths are unchanged.
  const sv = listing.hasStreetView
    ? streetViewStaticUrl(listing.streetViewPanoId, {
        heading: listing.streetViewHeading,
        fov: STREET_VIEW_FOV,
        pitch: STREET_VIEW_PITCH,
      })
    : null;
  const photoSources = [listing.photoUrl?.trim() || undefined, sv].filter(
    (s): s is string => Boolean(s),
  );

  // The number is the hero. Optional + never fabricated: when absent the card
  // shows photo + address only, with no empty slot. `sourceLabel` is plumbed for
  // the deferred input but the visible label stays the source-agnostic "Views"
  // (the honesty gate — no named-portal claim on a number we don't control).
  const hasViews = typeof listing.viewCount === "number";

  return (
    <div
      className={`sa-cf__card${pos === "center" ? " sa-cf__card--center" : ""}`}
      data-pos={pos}
      data-testid={`${idPrefix}-card-${index}`}
    >
      {photoSources.length > 0 && (
        <ListingCardPhoto
          sources={photoSources}
          testId={`${idPrefix}-photo-${index}`}
          focalX={listing.photoFocalX}
          focalY={listing.photoFocalY}
          scale={listing.photoScale}
        />
      )}
      {/* The legibility band is rendered on EVERY card so each is a self-contained
          listing card (image + dark band + count/address/city) — required on the
          mobile scroll-snap carousel, where every card is a full listing the
          agent swipes through. The DESKTOP fan's depth trick (the outer
          `out-left`/`out-right` peeks stay BARE to focus the eye on center) is now
          a CSS concern: `@container page (min-width:720px)` hides the band for
          those two positions, so the desktop look is byte-identical while mobile
          never shows a bare, identity-less card. */}
      <div className="sa-cf__band">
        {hasViews && (
          <div className="sa-cf__views" data-testid={`${idPrefix}-views-${index}`}>
            <span className="sa-cf__num">
              {listing.viewCount!.toLocaleString("en-US")}
            </span>
            <span className="sa-cf__vlabel">{COVERFLOW_VIEWS_LABEL}</span>
          </div>
        )}
        <div className="sa-cf__addr">{listing.address}</div>
        {listing.city && <div className="sa-cf__city">{listing.city}</div>}
      </div>
    </div>
  );
}

/**
 * Read-only, single-card preview of the published coverflow `ListingCard`, for
 * mounting in Settings so an agent sees the GENUINE card (photo framing + dark
 * band + address + views) as they adjust the crop — no longer "cropping blind".
 *
 * It reuses the exact published `ListingCard` inside the minimal wrapper the
 * coverflow CSS needs:
 *   • `.fs-page` — the scope where the State-A design tokens are defined
 *     (`--sa-proof-cream`, `--line`, the type vars), so the card is not unstyled.
 *   • `.fs-frame` — carries `container-type/-name: page`, which the card's `cqi`
 *     units and `@container page` queries resolve against. Without it the card's
 *     numbers blow up against the viewport.
 *   • `.sa-cf__fan--n1 > .sa-cf__track` — the single-card track layout.
 *
 * The `reveal` class is deliberately OMITTED: the entrance animation keeps cards
 * hidden until the motion island adds `.in`, which never runs in Settings, so a
 * static preview must skip it (else the card renders invisible). The `.fs-page`
 * full-page chrome (min-height:100vh, page background) and the `.fs-frame` shell
 * chrome (max-width, shadow, radius) are neutralized inline so the preview is
 * just the card, not a viewport-tall page slab. This does NOT touch the published
 * seller page render in any way — it only adds a read-only view in Settings.
 */
export function ListingCardPreview({
  listing,
}: {
  listing: PublicRecentListing;
}) {
  return (
    <div
      className="fs-page"
      style={{ minHeight: 0, margin: 0, background: "transparent" }}
      data-testid="brand-listing-card-preview"
    >
      <div
        className="fs-frame"
        style={{ background: "transparent", boxShadow: "none", borderRadius: 0 }}
      >
        <div className="sa-cf__fan sa-cf__fan--n1">
          <div className="sa-cf__track">
            <ListingCard
              listing={listing}
              pos="center"
              index={0}
              idPrefix="brand-listing-cardpreview"
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function SpreadFrame({ frame, lead = false }: { frame: Frame; lead?: boolean }) {
  return (
    <div
      className={`sa-frame${lead ? " sa-frame--lead" : ""}${
        frame.image ? " has-photo" : ""
      }`}
      data-testid={`fs-sa-spread-${frame.key}`}
    >
      {frame.image && (
        <span
          /* Both capability frames are property imagery (the agent's listing
             photography + a recent video-tour poster), so both stay centered.
             No face-bias crop is applied here: the per-invitation talking-head
             hello lives in the hero, not this spread. */
          className="sa-frame__photo"
          aria-hidden="true"
          style={frameBgStyle(frame)}
        />
      )}
      <div className="sa-frame__cap">
        <span className="sa-frame__label">{frame.label}</span>
        {frame.sub && <span className="sa-frame__sub">{frame.sub}</span>}
      </div>
    </div>
  );
}

/**
 * v1.7 Packet C · Part 1 — "THE WORK" flat swipe showcase. ONE frame the seller
 * swipes through the agent's craft (photography still → video tour → …). The
 * caption rides a SOLID dark band (legibility never on the raw photo); a dot
 * indicator + a "swipe the craft" micro-cue + a tappable "See the work" chip make
 * it read as clearly swipeable (the fix for "flat, nothing feels clickable").
 *
 * Motion is a FLAT horizontal slide (CSS scroll-snap), deliberately distinct from
 * the coverflow's 3D bend. No auto-advance: the motion island only wires the
 * chip + the active-dot tracking, and reduced-motion collapses to a single static
 * frame (CSS). One frame → a single static still, no dots / chip / cue.
 */
function WorkShowcase({ frames }: { frames: Frame[] }) {
  const single = frames.length === 1;
  return (
    <div
      className="sa-work reveal"
      data-testid="fs-sa-work"
      data-count={frames.length}
    >
      <div className="sa-work__head">
        <span className="sa-work__eyebrow">{WORK_EYEBROW}</span>
        {!single && (
          <span className="sa-work__cue" data-testid="fs-sa-work-cue">
            {WORK_SWIPE_CUE}
          </span>
        )}
      </div>
      <div className="sa-work__viewport">
        <div className="sa-work__track" data-work-track>
          {frames.map((f) => (
            <figure
              key={f.key}
              className={`sa-work__slide${f.image ? " has-photo" : ""}`}
              data-work-slide
              data-testid={`fs-sa-work-${f.key}`}
            >
              {f.image && (
                <span
                  className="sa-work__photo"
                  aria-hidden="true"
                  style={frameBgStyle(f)}
                />
              )}
              <figcaption className="sa-work__band">
                <div className="sa-work__cap">
                  <span className="sa-work__label">{f.label}</span>
                  {f.sub && <span className="sa-work__sub">{f.sub}</span>}
                </div>
                {!single && (
                  <button
                    type="button"
                    className="sa-work__chip"
                    data-work-next
                    aria-label={WORK_NEXT_CHIP}
                  >
                    {WORK_NEXT_CHIP}
                    <span className="sa-work__chip-arrow" aria-hidden="true">
                      →
                    </span>
                  </button>
                )}
              </figcaption>
            </figure>
          ))}
        </div>
      </div>
      {!single && (
        <div className="sa-work__dots" data-work-dots data-testid="fs-sa-work-dots">
          {frames.map((f, i) => (
            <span
              key={f.key}
              className={`sa-work__dot${i === 0 ? " is-active" : ""}`}
              data-work-dot
              aria-hidden="true"
            />
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * v1.7 Packet C · Part 2 — "WHAT'S INCLUDED" editorial capabilities list. The
 * three flat tiles become editorial rows: a teal icon chip + title + the agent's
 * one-line proof sentence shown INLINE (no tap-to-expand — the substance is the
 * thoughtful part, never hidden behind a chevron). Copy is the agent's authored
 * `whyUs.marketingApproach` (with the shipped Settings defaults when unset).
 */
function IncludedList({
  items,
}: {
  items: ReadonlyArray<{ title: string; detail?: string }>;
}) {
  return (
    <div className="sa-incl reveal" data-testid="fs-sa-incl">
      <span className="sa-incl__eyebrow">{INCLUDED_EYEBROW}</span>
      <ul className="sa-incl__list">
        {items.map((m, i) => (
          <li className="sa-incl__row" key={i} data-testid={`fs-sa-incl-${i}`}>
            <span className="sa-incl__icon" aria-hidden="true">
              <IncludedIcon index={i} />
            </span>
            <div className="sa-incl__text">
              <span className="sa-incl__title">{m.title}</span>
              {m.detail?.trim() && (
                <span className="sa-incl__proof">{m.detail}</span>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * Decorative teal icon for a WHAT'S INCLUDED row, by position. The three default
 * capabilities map to camera (photography & video) · broadcast (ad funnel) · badge
 * (featured placement); a 4th+ falls back to the badge. Stroke uses currentColor
 * so the teal is set once on `.sa-incl__icon`. Aria-hidden — purely ornamental.
 */
function IncludedIcon({ index }: { index: number }) {
  const common = {
    width: 18,
    height: 18,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.7,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };
  if (index === 0) {
    // camera — photography & video
    return (
      <svg {...common}>
        <path d="M3 8.5A1.5 1.5 0 0 1 4.5 7h2l1.2-1.8A1 1 0 0 1 8.5 5h7a1 1 0 0 1 .8.4L17.5 7h2A1.5 1.5 0 0 1 21 8.5v9A1.5 1.5 0 0 1 19.5 19h-15A1.5 1.5 0 0 1 3 17.5z" />
        <circle cx="12" cy="13" r="3.2" />
      </svg>
    );
  }
  if (index === 1) {
    // broadcast — targeted digital ad funnel
    return (
      <svg {...common}>
        <path d="M4 9v6l11 4V5z" />
        <path d="M15 8a4 4 0 0 1 0 8" />
        <path d="M4 12H3" />
      </svg>
    );
  }
  // badge — featured placement & syndication
  return (
    <svg {...common}>
      <path d="M12 3l2.4 1.8 3 .2.2 3L19.4 11.4 18 14l1.6 2.6-2.8 1.2-1 2.8-3-1.2-3 1.2-1-2.8-2.8-1.2L5.6 14 4.2 11.4 5.4 8.2l.2-3 3-.2z" />
      <path d="M9.5 12l1.8 1.8L15 10" />
    </svg>
  );
}
