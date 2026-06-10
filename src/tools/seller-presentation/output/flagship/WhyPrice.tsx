import type { PublicComp, PublicPayload } from "../public-payload";
import { streetViewStaticUrl } from "@/lib/seller-presentation/street-view";
import { countSentence, hasCount } from "./copy";

/**
 * §02 · Why this price (comps) — ported from the prototype's `WhyPrice` DOM.
 * Big derived numeral + n-aware sentence, optional agent rationale, then the
 * comp cards (slim 116px photo strip on mobile / 16:10 photo on top on desktop —
 * the photo SLOT flexes out cleanly when absent; D1 ships text-only, D3 wires the
 * real upload). `SOURCE · PUBLIC RECORD` preserved.
 */
export function WhyPrice({ payload }: { payload: PublicPayload }) {
  const { whyPrice } = payload;
  const rationale = whyPrice.publicRationale?.trim();
  const comps = whyPrice.comps;
  const n = comps.length;
  if (!rationale && n === 0) return null;

  const city = payload.property.city?.trim();

  return (
    <section className="section whyprice" data-testid="fs-why">
      <div className="reveal">
        <div className="eyebrow">
          <span className="num">02</span> · Why This Price{" "}
          <span className="rule" aria-hidden="true" />
        </div>
        <h2 className="head">
          A confident, <em>defensible</em> number.
        </h2>
      </div>

      <div className="why__lead">
        {hasCount(n) && (
          <div className="why__numblock reveal">
            <span className="why__num" data-testid="fs-count-digit">
              {n}
            </span>
            <span className="why__numtext" data-testid="fs-count-say">
              {countSentence(n)}
            </span>
          </div>
        )}
        {rationale && (
          <p className="why__agentnote reveal" data-testid="fs-count-msg">
            {rationale}
          </p>
        )}
      </div>

      {n > 0 && (
        <div className="comps" data-testid="fs-comps">
          {comps.map((c, i) => (
            <CompCard key={i} comp={c} index={i} city={city} />
          ))}
        </div>
      )}
      {n > 0 && (
        <div className="comp__src reveal">Source · Public Record</div>
      )}
    </section>
  );
}

function CompCard({
  comp,
  index,
  city,
}: {
  comp: PublicComp;
  index: number;
  city?: string;
}) {
  const idx = String(index + 1).padStart(2, "0");
  // Manual upload (the agent's own image) takes precedence over Street View.
  const manualPhoto = comp.photoUrl?.trim() || "";
  // Street View only when there's no manual photo, coverage was resolved, and
  // a browser key is configured (streetViewStaticUrl returns null otherwise).
  // COMPLIANCE: this is a URL only — the browser fetches the image fresh from
  // Google via the <img> below; we never request or store the bytes, and the
  // baked-in Google attribution is preserved (the image is not cropped past
  // its bottom-left watermark; see flagship.css `.comp-card__photo img`).
  const streetViewUrl =
    !manualPhoto && comp.hasStreetView === true
      ? streetViewStaticUrl(comp.streetViewPanoId)
      : null;
  const hasPhoto = !!manualPhoto || !!streetViewUrl;
  const meta = [
    city || null,
    comp.sqft ? `${comp.sqft} SQFT` : null,
    comp.yearBuilt !== undefined ? `BUILT ${comp.yearBuilt}` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div
      className={`comp-card reveal${hasPhoto ? " has-photo" : ""}`}
      data-testid={`fs-comp-${index}`}
    >
      {manualPhoto && (
        <div
          className="comp-card__photo"
          data-testid={`fs-comp-${index}-photo`}
          aria-hidden="true"
          style={{
            backgroundImage: `url("${manualPhoto.replace(/"/g, '\\"')}")`,
            backgroundSize: "cover",
            backgroundPosition: "center",
          }}
        />
      )}
      {!manualPhoto && streetViewUrl && (
        <div
          className="comp-card__photo"
          data-testid={`fs-comp-${index}-photo`}
        >
          {/* Fetched fresh from Google in the buyer's browser; never proxied
              or stored. `loading="lazy"` + browser cache keep billing low.
              No referrerPolicy override: the default sends our origin as the
              Referer so Google's referrer-restricted key validates. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={streetViewUrl}
            alt=""
            aria-hidden="true"
            loading="lazy"
            decoding="async"
            data-testid={`fs-comp-${index}-streetview`}
          />
        </div>
      )}
      <div className="comp-card__body">
        <div className="comp-card__info">
          <span className="comp-card__idx">{idx}</span>
          <div className="comp-card__addr">{comp.address || "—"}</div>
          {meta && <div className="comp-card__meta">{meta}</div>}
        </div>
        <div className="comp-card__price">
          <b>{comp.soldPrice || "—"}</b>
          <span>Sold</span>
        </div>
      </div>
    </div>
  );
}
