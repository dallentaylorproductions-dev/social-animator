import type { PublicPayload } from "../public-payload";
import { AutoIcon } from "./icons";

/**
 * §03 · What I'll do for you — the per-presentation pitch points. The locked
 * prototype has no dedicated pitch beat, so this preserved agent content is
 * rendered with the prototype's own primitives (cream band + auto-icon `.rcard`s)
 * to stay visually consistent. Hidden entirely when there are no public pitch
 * cards.
 */
export function Pitch({ payload }: { payload: PublicPayload }) {
  const cards = payload.pitchPublicCards;
  if (cards.length === 0) return null;

  return (
    <section className="section reasons z-white" data-testid="fs-pitch">
      <div className="reveal">
        <div className="eyebrow">
          <span className="num">03</span> · What I&apos;ll Do For You{" "}
          <span className="rule" aria-hidden="true" />
        </div>
        <h2 className="head">
          A quiet, <em>thorough</em> way to sell.
        </h2>
      </div>
      <div className="rcards" data-count={cards.length}>
        {cards.map((card, i) => (
          <div className="rcard reveal" key={i} data-testid={`fs-pitch-${i}`}>
            <div className="card-mark">
              <AutoIcon title={card.title} body={card.support} />
            </div>
            <div className="rcard__title">{card.title}</div>
            {card.support && <p className="rcard__body">{card.support}</p>}
          </div>
        ))}
      </div>
    </section>
  );
}
