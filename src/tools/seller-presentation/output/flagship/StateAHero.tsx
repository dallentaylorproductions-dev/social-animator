import type { PublicPayload } from "../public-payload";
import type { FormattedAppointment } from "../../engine/appointment";
import { effectivePosterUrl, withFirstFrameHint } from "../../engine/types";

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
  // The hero cover is the agent's OWN material only: the uploaded/selected
  // listing photo on `property.heroPhotoUrl` (sourced from the agent's listing
  // profile, never a scrape). We deliberately do NOT import the Street View
  // helpers here - auto-pulling a Street View of the SUBJECT home into the hero
  // would read as surveillance before the agent has even walked the property.
  // With no agent photo we fall to the calm dossier treatment below (gradient +
  // faint grid), never the subject's address imagery. (The Appointment Brief's
  // mini cards do use Street View, but of OTHER sold comps, which is fine.)
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
        {hero ? (
          /* A real cover photo renders cleanly, full-bleed - no grid, no
             marker over it. */
          <div
            className="sa-hero__photo"
            aria-hidden="true"
            data-testid="fs-sa-hero-photo"
            style={{
              backgroundImage: `url("${hero.replace(/"/g, '\\"')}")`,
            }}
          />
        ) : (
          /* No cover photo: a calm dossier fallback (dark editorial gradient +
             a very faint grid texture), so the hero never reads as a blank
             gradient. No marker in either case. */
          <div className="sa-hero__fallback" aria-hidden="true" />
        )}
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
 * The hero hello. Reuses the EXACT poster-precedence + first-frame helpers the
 * flagship AgentNote video uses (effectivePosterUrl / withFirstFrameHint), so
 * State A and the revealed page never drift on iOS first-frame painting.
 *
 * Framing note: unlike the revealed-page AgentNote inlay (which `cover`-crops to
 * the agent's chosen focal point), the dossier hero shows the FULL video frame
 * via `object-fit: contain` on a deliberate portrait-friendly box — a portrait
 * talking-head hello is never chopped mid-face, and any letterbox reads as an
 * intentional dark mat (the .sa-hero__video ink background), not an accident. So
 * the agent's cover-crop framing (focalX/Y/zoom) is intentionally NOT applied
 * here. Fullscreen uses the same contain treatment (see state-a.css).
 */
function HeroVideo({ payload }: { payload: PublicPayload }) {
  const v = payload.video!;
  const poster = effectivePosterUrl(v);

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
          objectFit: "contain",
          objectPosition: "center",
        }}
      />
      <span className="sa-hero__video-cap" aria-hidden="true">
        Watch a 15-second hello
      </span>
    </div>
  );
}
