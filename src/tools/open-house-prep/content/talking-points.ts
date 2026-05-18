/**
 * Open House Prep — talking-points library.
 *
 * 10 entries. 4 universal defaults pre-selected. Each entry's text is
 * verbatim (NOT a paraphrase) — written to avoid bracketed template
 * placeholders, competitor brand references, fabricated statistics,
 * and post-NAR-settlement legal risk.
 */

export interface TalkingPoint {
  id: string;
  /** Short label — when in the conversation the agent uses this. */
  trigger: string;
  /** The actual line the agent leads with. */
  text: string;
  isDefaultSelected?: boolean;
}

export const TALKING_POINTS: TalkingPoint[] = [
  {
    id: 'welcome-opener',
    trigger: 'Welcome (every visitor)',
    text: "Welcome — thanks for stopping by today. I'm happy to answer anything you want to know about the home or the area.",
    isDefaultSelected: true,
  },
  {
    id: 'property-positioning',
    trigger: "Lead with the home's strength",
    text: "What I'd want you to notice is what makes this home stand out. The seller invested in real quality, and you can see it in the details once you walk through.",
    isDefaultSelected: true,
  },
  {
    id: 'price-reasoning',
    trigger: 'When price comes up',
    text: "Pricing here is based on what comparable homes in this area have actually sold for recently. I have the comparison with me if you want to walk through it.",
  },
  {
    id: 'neighborhood-context',
    trigger: 'Visitor asks about area',
    text: "I've worked this area for a while and I'm happy to give you the honest read on what's been happening here — what's trending, what to watch for.",
  },
  {
    id: 'design-intent',
    trigger: 'Pointing at the layout',
    text: "Walk through and notice how the space flows. There are some decisions in this home that you don't see in standard construction — it's worth taking your time.",
  },
  {
    id: 'buyer-qualifying-question',
    trigger: 'After initial welcome',
    text: "Are you actively looking, or just out exploring today? Either way no pressure — I just want to give you the right level of detail.",
    isDefaultSelected: true,
  },
  {
    id: 'comp-data-hook',
    trigger: 'When interest builds',
    text: "If you want to see what's happening in this neighborhood, I have the recent sales data with me. I can show you what these homes have been going for.",
  },
  {
    id: 'honest-market-read',
    trigger: 'When market direction comes up',
    text: "The honest read on this market right now is that it favors buyers and sellers in different ways. I can walk you through what that means for a home like this if you'd like.",
  },
  {
    id: 'time-on-market',
    trigger: 'If listing has been live a while',
    text: "We've had this on for a bit. The visitors who've come through have generally responded well — the home is priced where it should be based on the recent area sales.",
  },
  {
    id: 'closing-offer',
    trigger: 'Wrap-up with every visitor',
    text: "If you want me to put together a more detailed report on this home or the area, I'm happy to do that — I can text it to you when you get home.",
    isDefaultSelected: true,
  },
];

/**
 * IDs pre-checked when an agent opens a fresh OH Prep form.
 * Reduces decision fatigue with sensible universal defaults. Agent
 * unchecks any they don't want, checks any additional ones.
 */
export const DEFAULT_SELECTED_TALKING_POINT_IDS: readonly string[] = TALKING_POINTS
  .filter((tp) => tp.isDefaultSelected)
  .map((tp) => tp.id);

export function getTalkingPointById(id: string): TalkingPoint | undefined {
  return TALKING_POINTS.find((tp) => tp.id === id);
}
