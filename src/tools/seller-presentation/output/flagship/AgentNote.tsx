import type { PublicPayload } from "../public-payload";
import { effectivePosterUrl } from "../../engine/types";
import { Eyebrow } from "./Eyebrow";

/**
 * §01 · Agent note + walkthrough — quiet-tint band. The note text is always
 * present; the walkthrough video is an OPTIONAL slot (flexes out cleanly
 * when absent — the section still reads complete as a written note). On wide
 * frames the note text optically centers against the video card.
 *
 * Video reuses the v1 inline-playback treatment: a real <video controls
 * playsInline preload="metadata"> with the never-blank poster precedence
 * (override > scrub > auto first-frame). Caption = the agent's video title
 * when set, else the design's walkthrough caption.
 */
export function AgentNote({ payload }: { payload: PublicPayload }) {
  const v = payload.video;
  const hasVideo = !!v?.videoUrl;
  const poster = v ? effectivePosterUrl(v) : undefined;
  const caption = v?.title?.trim() || "Let's walk through your plan.";

  return (
    <section className="fs-note fs-block tint-quiet" data-testid="fs-note">
      <div className="fs-wrap fs-note__inner">
        <div className="fs-note__text">
          <Eyebrow index="01" label="A short note from your agent" />
          <h2 className="fs-headline reveal">
            Two <em>minutes</em>, on your home.
          </h2>
          <p className="fs-lead reveal">
            A quick walkthrough of how I arrived at this number and what I&apos;d
            do first — so nothing about the plan is a surprise.
          </p>
        </div>
        {hasVideo && (
          <div
            className="fs-note__video reveal"
            data-testid="fs-note-video"
            {...(poster ? {} : { "data-no-poster": "true" })}
          >
            <video
              className="fs-note__player"
              src={v!.videoUrl}
              {...(poster ? { poster } : {})}
              controls
              playsInline
              preload="metadata"
              aria-label={v!.title ?? "Walk-through video"}
              data-poster-source={
                v!.posterUrl
                  ? "override"
                  : v!.scrubPosterUrl
                    ? "scrub"
                    : v!.autoPosterUrl
                      ? "auto"
                      : "none"
              }
            />
            <div className="fs-note__cap">{caption}</div>
          </div>
        )}
      </div>
    </section>
  );
}
