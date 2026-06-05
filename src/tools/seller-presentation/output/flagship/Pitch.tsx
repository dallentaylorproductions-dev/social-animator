import type { PublicPayload } from "../public-payload";
import { Eyebrow } from "./Eyebrow";

/**
 * §03 · Pitch points — quiet-tint band. Each item is an ordinal (decorative,
 * a CSS counter so the numeral is derived, not authored) + heading (--ink) +
 * supporting body (--ink-soft). Hidden entirely when there are no public
 * pitch cards.
 */
export function Pitch({ payload }: { payload: PublicPayload }) {
  const cards = payload.pitchPublicCards;
  if (cards.length === 0) return null;

  return (
    <section className="fs-pitch fs-block tint-quiet" data-testid="fs-pitch">
      <div className="fs-wrap">
        <Eyebrow index="03" label="What I'll do for you" />
        <h2 className="fs-headline reveal">
          A quiet, <em>thorough</em> way to sell.
        </h2>
        <div className="fs-pitch__list">
          {cards.map((card, i) => (
            <div
              className="fs-pitch__item reveal"
              key={i}
              data-testid={`fs-pitch-${i}`}
            >
              <div>
                <div className="fs-pitch__h">{card.title}</div>
                {card.support && <p className="fs-pitch__p">{card.support}</p>}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
