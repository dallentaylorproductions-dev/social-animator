import type { PublicPayload } from "../public-payload";
import { effectivePosterUrl } from "../../engine/types";

/**
 * §01 · Note from your agent — cream band, ported from the prototype's `Note`
 * DOM (.note__grid > .note__copy + .video). The video is an OPTIONAL slot: when
 * the agent attached a walkthrough it renders a real inline player in the
 * prototype's video frame; absent, the column flexes out and the note still
 * reads complete (the grid collapses to one column).
 */
export function AgentNote({ payload }: { payload: PublicPayload }) {
  const v = payload.video;
  const hasVideo = !!v?.videoUrl;
  const poster = v ? effectivePosterUrl(v) : undefined;
  const caption = v?.title?.trim() || "Let's walk through your plan.";

  return (
    <section className="section note z-offwhite" data-testid="fs-note">
      <div
        className="note__grid"
        style={hasVideo ? undefined : { gridTemplateColumns: "1fr" }}
      >
        <div className="note__copy reveal">
          <div className="eyebrow">
            <span className="num">01</span> · A Short Note From Your Agent
          </div>
          <h2 className="head">
            Two <em>minutes</em>, on your home.
          </h2>
          <p className="lede">
            A quick walkthrough of how I arrived at this number and what I&apos;d
            do first, so nothing about the plan is a surprise.
          </p>
        </div>
        {hasVideo && (
          <div
            className="video reveal"
            data-testid="fs-note-video"
            {...(poster ? {} : { "data-no-poster": "true" })}
          >
            <video
              className="video__player"
              src={v!.videoUrl}
              {...(poster ? { poster } : {})}
              controls
              playsInline
              preload="metadata"
              aria-label={v!.title ?? "Video message from your agent"}
              style={{
                position: "absolute",
                inset: 0,
                width: "100%",
                height: "100%",
                objectFit: "cover",
              }}
            />
            <div className="video__cap">{caption}</div>
          </div>
        )}
      </div>
    </section>
  );
}
