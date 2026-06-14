import type { PublicPayload, PublicRecentListing } from "../public-payload";
import {
  streetViewStaticUrl,
  STREET_VIEW_FOV,
  STREET_VIEW_PITCH,
} from "@/lib/seller-presentation/street-view";
import {
  CAPABILITY_PHOTO_LABEL,
  CAPABILITY_PHOTO_SUB,
  CAPABILITY_VIDEO_LABEL,
  CAPABILITY_VIDEO_SUB,
  COVERFLOW_AGGREGATE_SUFFIX,
  COVERFLOW_EYEBROW,
  COVERFLOW_VIEWS_LABEL,
  EXPOSURE_LINE,
} from "./state-a-copy";

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
};

export function CampaignSpread({ payload }: { payload: PublicPayload }) {
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

  // Byte-identical guarantee: with no listings, the guard is unchanged from
  // today (no frames → no section). Listings render the section even in the
  // unlikely case the capability frames are all unset.
  if (frames.length === 0 && listings.length === 0) return null;

  const [lead, ...rest] = frames;

  return (
    <section className="section sa-spread z-offwhite" data-testid="fs-sa-spread">
      <div className="reveal">
        <div className="eyebrow">
          How I&apos;ll Get Your Home Seen{" "}
          <span className="rule" aria-hidden="true" />
        </div>
        <h2 className="head">
          Produced beautifully. <em>Put in front of buyers</em>.
        </h2>
      </div>

      {frames.length > 0 && (
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
      )}

      {listings.length > 0 && <ListingsCoverflow listings={listings} />}

      <p className="sa-spread__reach reveal" data-testid="fs-sa-spread-reach">
        {EXPOSURE_LINE}
      </p>
    </section>
  );
}

/**
 * Zone 5 position in the fan. Center is forward + upright (earns the teal
 * keyline); the inner pair bends back ~23°; the outer pair are quiet ~36° peeks
 * with NO band (they only signal "there's more"). Mapped from the listing index
 * so the arrangement degrades honestly: 1 listing is centered alone, 2 form a
 * gentle pair (no faked peeks), 3–5 fan out symmetrically.
 */
type CoverflowPos = "center" | "in-left" | "in-right" | "out-left" | "out-right";

function coverflowPositions(n: number): CoverflowPos[] {
  if (n <= 1) return ["center"];
  if (n === 2) return ["in-left", "in-right"];
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
  const aggregateTotal = numbered
    .reduce((sum, l) => sum + l.viewCount, 0)
    .toLocaleString("en-US");

  const fanClass =
    listings.length === 1
      ? " sa-cf__fan--single"
      : listings.length === 2
        ? " sa-cf__fan--pair"
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
        <p className="sa-cf__agg" data-testid="fs-sa-cf-aggregate">
          <strong className="sa-cf__aggnum">{aggregateTotal}</strong>{" "}
          {COVERFLOW_AGGREGATE_SUFFIX}
        </p>
      )}
    </div>
  );
}

function ListingCard({
  listing,
  pos,
  index,
}: {
  listing: PublicRecentListing;
  pos: CoverflowPos;
  index: number;
}) {
  // Outer peeks carry no band/label at all — they only signal "there's more".
  const isPeek = pos === "out-left" || pos === "out-right";

  // Photo: hosted upload wins; else the Street View fallback, requested fresh
  // from Google at view time (same pattern as the comp thumbs — no bytes stored).
  const sv = listing.hasStreetView
    ? streetViewStaticUrl(listing.streetViewPanoId, {
        heading: listing.streetViewHeading,
        fov: STREET_VIEW_FOV,
        pitch: STREET_VIEW_PITCH,
      })
    : null;
  const photo = listing.photoUrl?.trim() || sv || undefined;

  // The number is the hero. Optional + never fabricated: when absent the card
  // shows photo + address only, with no empty slot. `sourceLabel` is plumbed for
  // the deferred input but the visible label stays the source-agnostic "Views"
  // (the honesty gate — no named-portal claim on a number we don't control).
  const hasViews = typeof listing.viewCount === "number";

  return (
    <div
      className={`sa-cf__card${pos === "center" ? " sa-cf__card--center" : ""}`}
      data-pos={pos}
      data-testid={`fs-sa-cf-card-${index}`}
    >
      {photo && (
        <span
          className="sa-cf__photo"
          aria-hidden="true"
          style={{ backgroundImage: `url("${photo.replace(/"/g, '\\"')}")` }}
        />
      )}
      {!isPeek && (
        <div className="sa-cf__band">
          {hasViews && (
            <div className="sa-cf__views" data-testid={`fs-sa-cf-views-${index}`}>
              <span className="sa-cf__num">
                {listing.viewCount!.toLocaleString("en-US")}
              </span>
              <span className="sa-cf__vlabel">{COVERFLOW_VIEWS_LABEL}</span>
            </div>
          )}
          <div className="sa-cf__addr">{listing.address}</div>
          {listing.city && <div className="sa-cf__city">{listing.city}</div>}
        </div>
      )}
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
          style={{
            backgroundImage: `url("${frame.image.replace(/"/g, '\\"')}")`,
          }}
        />
      )}
      <div className="sa-frame__cap">
        <span className="sa-frame__label">{frame.label}</span>
        {frame.sub && <span className="sa-frame__sub">{frame.sub}</span>}
      </div>
    </div>
  );
}
