import type { PublicPayload } from "../public-payload";

/**
 * §1 · Hero — full-bleed photo over the dark band, then a solid dark scrim
 * carrying the topline / for-line / address / meta. On-photo text sits ONLY
 * on the solid scrim band (never floated over the image), per the design's
 * on-scrim rule. eyebrow dot = --signature; all reading text = --on-dark;
 * scrim bg = --dark-band.
 */
export function Hero({ payload }: { payload: PublicPayload }) {
  const { property, preparedFor } = payload;
  const hero = property.heroPhotoUrl;
  const forName = preparedFor?.trim();
  const addr = property.address || "Your home";
  const metaLine = [
    property.city,
    [property.state, property.zip].filter((v) => v?.trim()).join(" "),
  ]
    .filter((v) => v?.trim())
    .join(", ");
  const subLabel = property.city
    ? `A recommendation · ${property.city}`
    : "A recommendation";

  return (
    <section className="fs-hero" data-testid="fs-hero">
      <div
        className={`fs-hero__photo${hero ? "" : " fs-hero__photo--monogram"}`}
        aria-hidden="true"
        style={
          hero
            ? { backgroundImage: `url("${hero.replace(/"/g, '\\"')}")` }
            : undefined
        }
      >
        {forName && (
          <div className="fs-hero__topline">Prepared for {forName}</div>
        )}
      </div>
      <div className="fs-hero__band">
        <div className="fs-wrap">
          {forName && (
            <div className="fs-hero__forline">
              <span className="fs-hero__dot" aria-hidden="true" />
              For {forName}
            </div>
          )}
          <div className="fs-hero__sub">
            <span className="fs-hero__rule" aria-hidden="true" />
            {subLabel}
          </div>
          <h1 className="fs-hero__addr">{addr}</h1>
          {metaLine && <div className="fs-hero__meta">{metaLine}</div>}
        </div>
      </div>
    </section>
  );
}
