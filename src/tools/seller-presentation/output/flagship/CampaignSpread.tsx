import type { PublicPayload } from "../public-payload";
import {
  CAPABILITY_PHOTO_LABEL,
  CAPABILITY_PHOTO_SUB,
  CAPABILITY_VIDEO_LABEL,
  CAPABILITY_VIDEO_SUB,
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

  if (frames.length === 0) return null;

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

      <p className="sa-spread__reach reveal" data-testid="fs-sa-spread-reach">
        {EXPOSURE_LINE}
      </p>
    </section>
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
