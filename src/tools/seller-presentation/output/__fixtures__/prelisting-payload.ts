import type { StandalonePrelistingPayload } from "../public-payload";

/**
 * B0c — hand-populated fixtures for the standalone pre-listing page. Mirror the
 * seller-page fixtures: a maximal FULL payload, a MINIMAL one (only identity —
 * proves the page reads complete and every optional block flexes out), and a
 * PARTIAL one (some why-us, no reviews) to exercise mixed flex states. Drive
 * the dev preview route + e2e render specs without auth + KV.
 */

export const PRELISTING_FULL: StandalonePrelistingPayload = {
  templateVersion: 2,
  agent: {
    name: "Aaron Thomas",
    brokerage: "Cascade & Co.",
    phone: "2532028825",
    email: "aaron@example.com",
    licenseNumber: "WA-99231",
    areasServed: "Tacoma & the South Sound",
    photoUrl: undefined,
    bioShort:
      "I work with a small number of sellers each year so every listing gets my full attention from prep to closing.",
    yearsInArea: "12",
    ctaReassurance: "A 20-minute call, no pressure, no commitment.",
  },
  agentTagline: "Eight families a year, each one a priority.",
  whyUs: {
    differentiators: [
      "We average more buyer views per listing than any team in the area.",
      "Every home is staged and shot by a professional, on us.",
      "You work with me directly, not a junior on the team.",
    ],
    marketingApproach: [
      {
        title: "Professional photography & video",
        detail: "Every listing, shot by a pro the day before we go live.",
      },
      {
        title: "Targeted social campaign",
        detail: "Your home in front of the buyers most likely to act.",
      },
      { title: "Featured placement", detail: "Premium spots on the portals." },
    ],
    performanceStats: [
      { label: "Sale-to-list", yourValue: "99.4%", marketValue: "97.1%", unit: "%" },
      { label: "Days on market", yourValue: "11", marketValue: "23", unit: "days" },
      { label: "Average buyer views", yourValue: "1,240", unit: "views" },
      { label: "Homes sold", yourValue: "186" },
    ],
    howWeWork: [
      { step: "Walk the home together", detail: "We see what buyers will see." },
      { step: "Prep & stage", detail: "Small fixes with outsized payoff." },
      { step: "Shoot & launch", detail: "Pro media, then live everywhere at once." },
      { step: "Drive demand", detail: "Targeted ads through the first weekend." },
      { step: "Negotiate & close", detail: "I'm at the table the whole way." },
    ],
    guarantee:
      "If you're not happy, cancel any time before we go live. No fees, no hard feelings.",
  },
  reviews: [
    {
      body: "Aaron sold our home in a week for over asking. Calm, clear, and on top of everything.",
      attributionName: "The Halloran family",
      attributionStreet: "N 21st",
      attributionYear: "2025",
    },
    {
      body: "We interviewed three agents. Aaron was the only one with an actual plan.",
      attributionName: "Marcus & Lena P.",
      attributionYear: "2024",
    },
  ],
  reviewsOutlink: { label: "See all reviews on Zillow", url: "https://www.zillow.com/profile/aaron" },
  reviewsHeadline: "What sellers say",
  brandColors: { accent: "#1f6f5c" },
};

/**
 * UX-2b — a headshot with a reposition applied. Identity-focused (so the agent
 * band is the surface under test) with a hosted photo, the focal point pulled
 * UP toward the top of the frame (the "face cut off at the top" case Aaron
 * hit), and a slight zoom. Drives the render spec that proves the agent band
 * maps the focal point onto the avatar. The image is a 1×1 transparent PNG data
 * URL — the spec asserts computed `background-position` / `transform`, which the
 * browser reports without fetching pixels.
 */
const HEADSHOT_DATA_URL =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M8AAAMBAQDJ/pLvAAAAAElFTkSuQmCC";

export const PRELISTING_HEADSHOT: StandalonePrelistingPayload = {
  templateVersion: 2,
  agent: {
    name: "Aaron Thomas",
    brokerage: "Cascade & Co.",
    email: "aaron@example.com",
    photoUrl: HEADSHOT_DATA_URL,
    photoFocalX: 50,
    photoFocalY: 18,
    photoScale: 1.3,
  },
};

/**
 * UX-2b — a headshot with NO reposition set (the existing-agent case). Proves
 * the agent who never touched the control renders the byte-identical default
 * avatar: a plain `.fs-agent__avatar--photo` with the photo as its own
 * background, no `--adj` variant and no inner clip/image layer.
 */
export const PRELISTING_HEADSHOT_CENTERED: StandalonePrelistingPayload = {
  templateVersion: 2,
  agent: {
    name: "Aaron Thomas",
    brokerage: "Cascade & Co.",
    email: "aaron@example.com",
    photoUrl: HEADSHOT_DATA_URL,
  },
};

/** Identity only — every optional block flexes out; the page still reads complete. */
export const PRELISTING_MINIMAL: StandalonePrelistingPayload = {
  templateVersion: 2,
  agent: {
    name: "Dana Reyes",
    email: "dana@example.com",
  },
};

/** Some why-us, NO reviews — mixed flex (why-us present, reviews absent). */
export const PRELISTING_PARTIAL: StandalonePrelistingPayload = {
  templateVersion: 2,
  agent: {
    name: "Dana Reyes",
    brokerage: "Harbor Realty",
    email: "dana@example.com",
    phone: "2065551234",
  },
  agentTagline: "Straight answers, start to finish.",
  whyUs: {
    differentiators: ["You work with me directly, every step."],
    marketingApproach: [],
    performanceStats: [{ label: "Sale-to-list", yourValue: "98.9%", marketValue: "97.0%", unit: "%" }],
    howWeWork: [],
  },
};
