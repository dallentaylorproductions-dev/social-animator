import type { PublicPayload } from "../public-payload";
import type { FormattedAppointment } from "../../engine/appointment";
import {
  effectivePosterUrl,
  effectiveFraming,
  withFirstFrameHint,
} from "../../engine/types";

/**
 * Seller State A · Signature A.1 - the private map-dossier hero.
 *
 * Replaces the reused flagship `<Hero>` on a State A render (State B keeps the
 * flagship hero untouched). Reads as a private dossier a serious agent already
 * prepared, NOT a landing page: editorial "PREPARED PRIVATELY · FOR [family]"
 * framing, the address in large serif, a calm location line, and the named
 * appointment moment as a chip. The cover is the agent's uploaded image layered
 * over a subtle CSS street-grid + a located home marker (the dossier motif);
 * with no image the grid + dark editorial gradient carry it (never a blank
 * gradient or clip-art roofline). Agent presence is a calm guide: headshot /
 * initials + name + the quiet signature line + the existing walkthrough video
 * folded in as "Watch a 15-second hello." Every optional piece flexes out.
 */
export function StateAHero({
  payload,
  appt,
}: {
  payload: PublicPayload;
  appt: FormattedAppointment | null;
}) {
  const { property, preparedFor } = payload;
  const hero = property.heroPhotoUrl;
  const family = preparedFor?.trim();
  const addr = property.address || "Your home";
  const location = [
    property.city,
    [property.state, property.zip].filter((v) => v?.trim()).join(" "),
  ]
    .filter((v) => v?.trim())
    .join(", ")
    .toUpperCase();

  return (
    <section className="sa-hero" data-testid="fs-hero">
      <div className="sa-hero__cover" data-testid="fs-sa-hero-cover">
        {/* The located-dossier motif: a faint street grid + a marker for the
            home. Always present, so a cover-less hero still reads as a located
            file rather than a blank gradient. */}
        <div className="sa-hero__grid" aria-hidden="true" />
        {hero && (
          <div
            className="sa-hero__photo"
            aria-hidden="true"
            data-testid="fs-sa-hero-photo"
            style={{
              backgroundImage: `url("${hero.replace(/"/g, '\\"')}")`,
            }}
          />
        )}
        {/* A subtle grid + vignette sits ON TOP of the photo too, so the
            dossier motif reads over real imagery without hiding it. */}
        <div className="sa-hero__mapover" aria-hidden="true" />
        <div className="sa-hero__marker" aria-hidden="true">
          <span className="sa-hero__marker-ring" />
          <span className="sa-hero__marker-dot" />
        </div>
        {family && (
          <div className="sa-hero__pers" data-testid="fs-sa-hero-pers">
            Prepared privately
            <span className="sa-hero__pers-dot" aria-hidden="true" />
            For {family}
          </div>
        )}
      </div>

      <div className="sa-hero__band">
        <div className="sa-hero__eyebrow reveal">A prepared invitation</div>
        <h1 className="sa-hero__addr reveal">{addr}</h1>
        {location && <div className="sa-hero__loc reveal">{location}</div>}

        {appt && (
          <div className="sa-hero__chip reveal" data-testid="fs-sa-hero-appt">
            <span className="sa-hero__chip-k">Our appointment</span>
            <span className="sa-hero__chip-v">
              {appt.weekday}, {appt.date} · {appt.time}
            </span>
          </div>
        )}

        <HeroAgent payload={payload} />
      </div>
    </section>
  );
}

/**
 * The calm guide: the agent's headshot / initials, name, the quiet signature
 * line, and the walkthrough video folded in as a short hello. Each piece flexes
 * out independently - an agent with only a name still reads complete.
 */
function HeroAgent({ payload }: { payload: PublicPayload }) {
  const a = payload.agent;
  const name = a.name?.trim();
  const signature = payload.signatureLine?.trim();
  const v = payload.video;
  const hasVideo = !!v?.videoUrl;
  if (!name && !signature && !hasVideo) return null;

  const monogram = name
    ? name
        .split(/\s+/)
        .map((p) => p[0])
        .join("")
        .slice(0, 2)
        .toUpperCase()
    : "";

  return (
    <div className="sa-hero__agent reveal" data-testid="fs-sa-hero-agent">
      {name && (
        <div className="sa-hero__who">
          {a.photoUrl ? (
            <span
              className="sa-hero__avatar"
              data-testid="fs-sa-hero-avatar"
              style={{
                backgroundImage: `url("${a.photoUrl.replace(/"/g, '\\"')}")`,
              }}
              aria-hidden="true"
            />
          ) : (
            <span className="sa-hero__avatar" data-monogram={monogram}>
              {monogram}
            </span>
          )}
          <span className="sa-hero__whotext">
            <span className="sa-hero__agentname">{name}</span>
            {a.brokerage?.trim() && (
              <span className="sa-hero__agentrole">{a.brokerage}</span>
            )}
          </span>
        </div>
      )}
      {signature && (
        <p className="sa-hero__sig" data-testid="fs-sa-hero-signature">
          {signature}
        </p>
      )}
      {hasVideo && <HeroVideo payload={payload} />}
    </div>
  );
}

/**
 * The hero hello. Reuses the EXACT poster-precedence + framing + first-frame
 * helpers the flagship AgentNote video uses (effectivePosterUrl /
 * effectiveFraming / withFirstFrameHint), so State A and the revealed page never
 * drift on iOS first-frame painting or the agent's "use this frame" pick.
 */
function HeroVideo({ payload }: { payload: PublicPayload }) {
  const v = payload.video!;
  const poster = effectivePosterUrl(v);
  const framing = effectiveFraming(v);

  return (
    <div
      className="sa-hero__video reveal"
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
        aria-label={v.title ?? "A short hello from your agent"}
        style={{
          objectFit: "cover",
          objectPosition: `${framing.focalX}% ${framing.focalY}%`,
          transform: `scale(${framing.zoom})`,
        }}
      />
      <span className="sa-hero__video-cap" aria-hidden="true">
        Watch a 15-second hello
      </span>
    </div>
  );
}
