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
        {hero && (
          <div
            className="hero__slot"
            aria-hidden="true"
            style={{
              backgroundImage: `url("${hero.replace(/"/g, '\\"')}")`,
              backgroundSize: "cover",
              backgroundPosition: "center",
            }}
          />
        )}
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
