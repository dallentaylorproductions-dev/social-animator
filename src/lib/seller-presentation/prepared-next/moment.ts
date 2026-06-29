/**
 * PREPARED_NEXT — the Moment envelope (adapter-ready, ONE source wired).
 *
 * The wrapper core only ever sees a normalized `Moment`. v0 wires exactly ONE
 * adapter (`viewed_signal`); FUTURE sources (FUB, RentCast, ...) drop in as new
 * adapters that emit this same shape. Do not build them here — this is the seam,
 * not the integration.
 *
 * `contextPointers` are REFERENCES into existing stores (slug → handout/views),
 * never copies, so the Moment stays tiny and the core re-reads authoritative
 * data at prepare time.
 */
export type Moment = {
  /** v0 wires only this (covers "viewed" / "created-not-followed-up"). */
  type: "page_viewed";
  /** The ONE adapter in v0. */
  source: "viewed_signal";
  /** The page slug (pageId). */
  subject: string;
  /** ISO 8601; the qualifying external-view time. */
  timestamp: string;
  contextPointers: {
    slug: string;
    ownerEmail: string;
    /** = the content-version signal (handout `updatedAt`); see work-order.ts. */
    handoutUpdatedAt: string;
  };
};

/**
 * The ONE v0 adapter: build a `page_viewed` Moment from a qualifying external
 * view of a published seller page. The caller (the view beacon route) has
 * already excluded the owner's own preview + bots, so this just normalizes the
 * shape — it does not re-decide eligibility.
 */
export function viewedSignalMoment(input: {
  slug: string;
  ownerEmail: string;
  handoutUpdatedAt: string;
  timestamp: string;
}): Moment {
  return {
    type: "page_viewed",
    source: "viewed_signal",
    subject: input.slug,
    timestamp: input.timestamp,
    contextPointers: {
      slug: input.slug,
      ownerEmail: input.ownerEmail.toLowerCase(),
      handoutUpdatedAt: input.handoutUpdatedAt,
    },
  };
}
