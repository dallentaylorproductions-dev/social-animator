import type { PublicPayload } from "../public-payload";
import {
  effectivePosterUrl,
  effectiveFraming,
  withFirstFrameHint,
} from "../../engine/types";
import {
  HELLO_CAPTION,
  HELLO_EYEBROW,
  HERO_VIDEO_ARIA,
  heroVideoLabel,
} from "./state-a-copy";

/**
 * Seller State A · the hello video as its OWN section, directly below the hero.
 *
 * Relocated out of the hero recognition column (where it inflated that column and
 * over-sized the cover photo) into a calm, centered dark band of its own. This is a
 * DOM relocation, NOT a player rewrite: the <video> element, its class
 * (.sa-hero__video-player), the inlay fitment (object-fit: cover + the agent's
 * focal/zoom framing inline), the shared poster-precedence + first-frame helpers
 * (effectivePosterUrl / withFirstFrameHint / effectiveFraming), and the fullscreen
 * `:fullscreen` / `:-webkit-full-screen` contain rules (keyed off the CLASS in
 * state-a.css, so position-independent) are all preserved verbatim. The only
 * subtraction is the in-frame caption: the section title now carries the evergreen
 * label, so the overlaid cap would have been a duplicate.
 *
 * The frame stays on the same dark context it had in the hero, so its paper-toned
 * border + lift-dark shadow read identically. Centered horizontally on desktop AND
 * mobile (no longer reliant on the agent column's width), which also gives the
 * mobile video a proper centered home. Flexes out entirely when no video is set.
 */
export function StateAHello({ payload }: { payload: PublicPayload }) {
  const v = payload.video;
  if (!v?.videoUrl) return null;

  const poster = effectivePosterUrl(v);
  const framing = effectiveFraming(v);
  // Evergreen, accurate label: names the agent's personal message with no duration
  // assumed (the message can run 60 to 90 seconds) and never calls it a tour.
  const label = heroVideoLabel(payload.agent.name);
  // Data-driven runtime ("2 min 14 sec"), shown in the caption when set; it flexes
  // out of the pill when the agent never recorded a duration.
  const runtime = v.runtime?.trim();

  // The welcome-video pedestal: a lifted dark slab holding eyebrow -> heading ->
  // portrait player -> caption pill. Centered on desktop; a left-aligned stack on
  // mobile (state-a.css). The relocated <video> keeps its class, inlay fitment,
  // poster precedence + fullscreen rules verbatim — only its surrounding chrome
  // changed. The caption always sits on the solid pedestal surface, never over
  // the video, and carries the single earned mint status dot.
  return (
    <section className="section sa-hello z-ink" data-testid="fs-sa-hello">
      <div className="sa-hello__pedestal reveal">
        <div className="sa-hello__eyebrow">{HELLO_EYEBROW}</div>
        <h2 className="sa-hello__title">{label}</h2>
        <div
          className="sa-hero__video"
          data-testid="fs-sa-hero-video"
          {...(poster ? {} : { "data-no-poster": "true" })}
        >
          <video
            className="sa-hero__video-player"
            src={poster ? v.videoUrl : withFirstFrameHint(v.videoUrl)}
            {...(poster ? { poster } : {})}
            controls
            playsInline
            preload="metadata"
            aria-label={v.title ?? HERO_VIDEO_ARIA}
            style={{
              // Same fitment as the revealed-page inlay: cover the frame and let the
              // agent's framing drive the crop. The :fullscreen rule (state-a.css)
              // resets all three to contain/center/none for the native fullscreen view.
              objectFit: "cover",
              objectPosition: `${framing.focalX}% ${framing.focalY}%`,
              transform: `scale(${framing.zoom})`,
            }}
          />
        </div>
        <div className="sa-hello__cap" data-testid="fs-sa-hello-cap">
          <span className="sa-hello__cap-dot" aria-hidden="true" />
          {HELLO_CAPTION}
          {runtime && <span className="sa-hello__cap-rt"> · {runtime}</span>}
        </div>
      </div>
    </section>
  );
}
