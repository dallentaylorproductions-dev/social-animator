import type { PublicPayload } from "../public-payload";

/**
 * §1 · Hero — DARK beat. Ported from the locked prototype's `Hero` DOM
 * (.hero > .hero__photo + .hero__band). Desktop = side-by-side 1.15fr photo /
 * .85fr band (the ported CSS @container query); mobile = stacked. Cover photo is
 * an optional slot over the diagonal-striped empty state. The personalization
 * line carries the rare --mint dot.
 */
export function Hero({ payload }: { payload: PublicPayload }) {
  const { property, preparedFor } = payload;
  const hero = property.heroPhotoUrl;
  const family = preparedFor?.trim();
  const addr = property.address || "Your home";
  const cityStateZip = [
    property.city,
    [property.state, property.zip].filter((v) => v?.trim()).join(" "),
  ]
    .filter((v) => v?.trim())
    .join(", ");
  const eyebrowCity = property.city ? property.city.toUpperCase() : null;

  return (
    <section className="hero" data-testid="fs-hero">
      <div className="hero__photo">
        {family && (
          <div className="hero__pers" data-testid="fs-hero-pers">
            {/* `preparedFor` is a free-form greeting (the wizard promises
                "Appears as For {X}"): render it verbatim, matching the v1
                page + footer disclaimer. Never re-wrap as "For the X Family"
                — the value already carries its own article/noun, and a
                surname template would double ("the Halloran family") and
                mangle non-"Family" greetings ("The Smiths", "Mr. Smith"). */}
            <span>For {family}</span>
            <span className="dot" aria-hidden="true" />
          </div>
        )}
        <div className="hero__empty">
          <span>Cover photo · optional</span>
        </div>
        {hero && <HeroSlot hero={hero} property={property} />}
      </div>
      <div className="hero__band">
        <div className="hero__eyebrow">
          — A Recommendation{eyebrowCity ? ` · ${eyebrowCity}` : ""}
        </div>
        <h1 className="hero__addr">{addr}</h1>
        {cityStateZip && <div className="hero__loc">{cityStateZip}</div>}
      </div>
    </section>
  );
}

/**
 * The cover-photo slot. DEFAULT (no crop) renders byte-identical to the pre-crop
 * markup — `background-position: center`, no transform. CROPPED (off-center focal
 * OR zoom) maps the focal point via `background-position` + anchors the zoom at
 * the focal origin, a pure DISPLAY transform (image bytes untouched). Reads
 * `property.heroCropFocal*` — the SAME fields the State-A `StateAHero` cover
 * reads, so one crop drives both renders.
 */
function HeroSlot({
  hero,
  property,
}: {
  hero: string;
  property: PublicPayload["property"];
}) {
  const fx = typeof property.heroCropFocalX === "number" ? property.heroCropFocalX : 50;
  const fy = typeof property.heroCropFocalY === "number" ? property.heroCropFocalY : 50;
  const scale = typeof property.heroCropScale === "number" ? property.heroCropScale : 1;
  const repositioned = fx !== 50 || fy !== 50 || scale > 1;
  return (
    <div
      className="hero__slot"
      aria-hidden="true"
      style={{
        backgroundImage: `url("${hero.replace(/"/g, '\\"')}")`,
        backgroundSize: "cover",
        backgroundPosition: repositioned ? `${fx}% ${fy}%` : "center",
        ...(repositioned && scale > 1
          ? { transform: `scale(${scale})`, transformOrigin: `${fx}% ${fy}%` }
          : null),
      }}
    />
  );
}
