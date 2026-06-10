import type { PublicComp, PublicPayload } from "../public-payload";
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
  const hasPhoto = !!comp.photoUrl;
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
      {hasPhoto && (
        <div
          className="comp-card__photo"
          data-testid={`fs-comp-${index}-photo`}
          aria-hidden="true"
          style={{
            backgroundImage: `url("${comp.photoUrl!.replace(/"/g, '\\"')}")`,
            backgroundSize: "cover",
            backgroundPosition: "center",
          }}
        />
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
