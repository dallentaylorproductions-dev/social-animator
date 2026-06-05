import type { PublicPayload } from "../public-payload";

/**
 * Hand-populated sample payloads for the consumer page (v1.47 / A7b + A7d.2).
 *
 * Two variants:
 *   - FULL_PAYLOAD     — every locked-design block populated; lets
 *                        the renderer prove all five "earned" moments
 *                        (hero ken-burns, price reveal, comp cards,
 *                        chart draw-on, agent verify-tick).
 *   - MINIMAL_PAYLOAD  — only required fields; proves every optional
 *                        block hides gracefully (no half-populated
 *                        objects, no empty holes).
 *
 * A7d.2 note: `reviews` + `reviewsOutlink` are still emitted here as
 * top-level payload fields (that's where the renderer reads them).
 * In production the projector now sources them from BrandSettings
 * (the publish route's `brandReviews` arg) rather than from the
 * per-presentation draft — the fixture short-circuits that pipe by
 * setting the projected output directly.
 *
 * Why fixtures instead of wizard input: A7c hasn't shipped wizard
 * capture UI for the new fields yet. The fixtures let the e2e
 * render spec + Dallen's browser smoke exercise the rendered page
 * without round-tripping through a real publish + auth + KV.
 */

export const FULL_PAYLOAD: PublicPayload = {
  // ---- A6 flat fields (still emitted for the bridge state) ----
  propertyAddress: "1742 Kenilworth Avenue",
  // A7c cosmetic fix: city WITHOUT state baked in. The renderer
  // composes `${city}, ${state} ${zip}` — pre-A7c the city included
  // ", OH" which rendered "TREMONT, OH, OH 44113" (doubled state).
  propertyCity: "Tremont",
  recommendedPrice: "$675,000",
  priceRationale:
    "Three recently-sold homes within four blocks anchor the recommendation. Each closed in the last ninety days and shares the bones of your home — era, footprint, lot orientation. At $675,000 you're a step above the average closing price for the block, which reflects the original woodwork, the south-facing kitchen, and the recent mechanicals — without pricing past the comparable range. We'll see strong activity in the first two weekends.",
  comps: [
    {
      address: "2218 W 14th Street",
      soldPrice: "$648,000",
      soldDate: "Sold March 14, 2026",
      sqft: "1,810",
      yearBuilt: 1908,
    },
    {
      address: "1908 Castle Avenue",
      soldPrice: "$691,000",
      soldDate: "Sold April 02, 2026",
      sqft: "1,920",
      yearBuilt: 1924,
    },
    // Third comp intentionally omits yearBuilt so the FULL fixture
    // also exercises the graceful-hide path on the comp card.
    {
      address: "2401 Professor Avenue",
      soldPrice: "$662,000",
      soldDate: "Sold April 28, 2026",
      sqft: "1,760",
    },
  ],
  agentBranding: {
    name: "Marisol Reyes",
    brokerage: "Howard Hanna Real Estate",
    phone: "2165550188",
    email: "marisol@hhanna.com",
    licenseNumber: "SAL.2018003412",
    areasServed: "Tremont · Ohio City · Detroit-Shoreway",
    photoUrl: undefined,
    bioShort:
      "I work with eight families a year, on purpose. It means your sale gets the time and attention I'd want for my own.",
    yearsInArea: "Eleven.",
    ctaReassurance:
      "A 20-minute call, no obligation — just a plan for your home.",
  },
  pitchPublicPoints: [
    "A photographer the magazines use.",
    "A launch built around the first weekend.",
    "A Friday-evening update, every week.",
    "Negotiation handled in person.",
  ],

  // ---- A7a grouped fields (the locked-design renderer reads these) ----
  property: {
    address: "1742 Kenilworth Avenue",
    // A7c: city WITHOUT state baked in (the renderer composes
    // "${city}, ${state} ${zip}" — doubling produced the
    // "TREMONT, OH, OH 44113" cosmetic bug A7b.2 smoke caught).
    city: "Tremont",
    state: "OH",
    zip: "44113",
    // A real, license-safe LOCAL house photo (committed under public/sample-
    // assets) so the preview/sample hero reads as a photo — not a flat block an
    // agent might fear carries to their page. The template renders it as the
    // decorative (aria-hidden) hero background; the scrim band + eyebrow sit
    // over it exactly as on a real page. Fixture DATA only — template untouched.
    heroPhotoUrl: "/sample-assets/exterior.webp",
    recommendedList: "$675,000",
    rationaleShort:
      "A price the market will meet quickly — and one that gives the right buyer room to fall in love.",
  },
  preparedFor: "the Halloran family",
  video: {
    posterUrl: undefined,
    videoUrl: "https://example.com/marisol-note.mp4",
    title: "A walk-through of your plan — recorded yesterday.",
    runtime: "2 min 14 sec",
    recordedOn: "Recorded May 19",
  },
  whyPrice: {
    publicRationale:
      "Three recently-sold homes within four blocks anchor the recommendation. Each closed in the last ninety days and shares the bones of your home — era, footprint, lot orientation. At $675,000 you're a step above the average closing price for the block, which reflects the original woodwork, the south-facing kitchen, and the recent mechanicals — without pricing past the comparable range. We'll see strong activity in the first two weekends.",
    comps: [
      {
        address: "2218 W 14th Street",
        soldPrice: "$648,000",
        soldDate: "Sold March 14, 2026",
        sqft: "1,810",
        yearBuilt: 1908,
      },
      {
        address: "1908 Castle Avenue",
        soldPrice: "$691,000",
        soldDate: "Sold April 02, 2026",
        sqft: "1,920",
        yearBuilt: 1924,
      },
      {
        address: "2401 Professor Avenue",
        soldPrice: "$662,000",
        soldDate: "Sold April 28, 2026",
        sqft: "1,760",
      },
    ],
  },
  pitchPublicCards: [
    {
      title: "A photographer the magazines use.",
      support:
        "Two-hour session, twilight pass, and a drone exterior — staged by my team the morning of, at no cost to you.",
    },
    {
      title: "A launch built around the first weekend.",
      support:
        "Pre-market push on Thursday, broker preview Friday, public open Saturday — designed to compress the offer window.",
    },
    {
      title: "A Friday-evening update, every week.",
      support:
        "A short, written note — showings, feedback, and what we're adjusting. No dashboards to check.",
    },
    {
      title: "Negotiation handled in person.",
      support:
        "Offers reviewed face-to-face, not over text. You'll see every term, in plain English, before we respond.",
    },
  ],
  reviews: [
    {
      body: "Marisol made us feel like the only clients she had. She knew the neighborhood cold and was honest with us about which offers to take seriously and which to pass on.",
      attributionName: "J. Mendoza",
      attributionYear: "2024",
      attributionStreet: "W 14th",
    },
    {
      body: "Quiet, calm, prepared. We had a clear plan from week one and never once felt like we were chasing her for an answer.",
      attributionName: "A. Park",
      attributionYear: "2024",
      attributionStreet: "Professor Avenue",
    },
    {
      body: "She turned what we thought would be a stressful summer into something almost easy. Closed at ask in nine days.",
      attributionName: "E. & T. Chen",
      attributionYear: "2023",
      attributionStreet: "Castle Avenue",
    },
  ],
  reviewsOutlink: {
    label: "See all reviews on Zillow",
    url: "https://www.zillow.com/profile/marisolreyes",
  },
  areaStats: {
    medianSale: "$642k",
    medianSaleDeltaYoy: "+4.1% vs prior year",
    daysOnMarket: "14",
    daysOnMarketZipAvg: "vs Tremont avg 21",
    closings90d: "38",
    listToSaleRatio: "101%",
    monthlySeries: [
      { month: "Jun '25", medianPrice: "605000" },
      { month: "Jul '25", medianPrice: "612000" },
      { month: "Aug '25", medianPrice: "608000" },
      { month: "Sep '25", medianPrice: "621000" },
      { month: "Oct '25", medianPrice: "628000" },
      { month: "Nov '25", medianPrice: "625000" },
      { month: "Dec '25", medianPrice: "631000" },
      { month: "Jan '26", medianPrice: "634000" },
      { month: "Feb '26", medianPrice: "637000" },
      { month: "Mar '26", medianPrice: "639000" },
      { month: "Apr '26", medianPrice: "640000" },
      { month: "May '26", medianPrice: "642000" },
    ],
  },
  agent: {
    name: "Marisol Reyes",
    brokerage: "Howard Hanna Real Estate",
    phone: "2165550188",
    email: "marisol@hhanna.com",
    licenseNumber: "SAL.2018003412",
    areasServed: "Tremont · Ohio City · Detroit-Shoreway",
    photoUrl: undefined,
    bioShort:
      "I work with eight families a year, on purpose. It means your sale gets the time and attention I'd want for my own.",
    yearsInArea: "Eleven.",
    ctaReassurance:
      "A 20-minute call, no obligation — just a plan for your home.",
  },
};

export const MINIMAL_PAYLOAD: PublicPayload = {
  // ---- A6 flat (only required minimum) ----
  propertyAddress: "1234 Test Drive NE",
  recommendedPrice: "$685,000",
  comps: [
    {
      address: "5678 Elm Ave NE",
      soldPrice: "$695,000",
    },
  ],
  agentBranding: {
    name: "Aaron Test",
    brokerage: "Test Realty",
  },
  pitchPublicPoints: [],

  // ---- A7a grouped — same minimal content, NO optional blocks ----
  property: {
    address: "1234 Test Drive NE",
    recommendedList: "$685,000",
  },
  whyPrice: {
    publicRationale: "",
    comps: [
      {
        address: "5678 Elm Ave NE",
        soldPrice: "$695,000",
      },
    ],
  },
  pitchPublicCards: [],
  agent: {
    name: "Aaron Test",
    brokerage: "Test Realty",
  },
  // preparedFor, video, reviews, reviewsOutlink, areaStats — all
  // intentionally absent. The renderer must hide each block cleanly
  // with no empty holes. (A7d.1 removed agentNote, trackRecord,
  // buyerQuote, and editorialPhotoUrl entirely. A7d.2 relocated
  // reviews + reviewsOutlink to Settings; the fixture still leaves
  // them off the MINIMAL payload to prove the "no reviews in
  // Settings → block hides cleanly" graceful state.)
};

/**
 * A7d.5 — outlink-only payload variant. An agent who has set the Zillow
 * reviews link in Settings but has not typed any reviews. The reviews
 * block must render the compact standalone CTA card (no
 * "From families like yours" lead-in, no empty quote rows).
 *
 * Mirrors MINIMAL_PAYLOAD except for the reviewsOutlink presence — keeps
 * the rest of the editorial surface minimal so the render proof isolates
 * the reviews-block variant.
 */
export const OUTLINK_ONLY_PAYLOAD: PublicPayload = {
  ...MINIMAL_PAYLOAD,
  reviewsOutlink: {
    label: "See all reviews on Zillow",
    url: "https://www.zillow.com/profile/aarontest",
  },
};

/**
 * A7d.8 — poster-precedence fixtures. Three siblings of MINIMAL_PAYLOAD
 * that each set a different subset of the three poster slots so the
 * renderer's `override > scrub > auto first-frame` cascade can be
 * proven independently. The helper that resolves the cascade lives in
 * engine/types.ts (`effectivePosterUrl`); the renderer also emits a
 * `data-poster-source` attribute on <video> so tests can assert which
 * branch fired without parsing the rendered URL.
 *
 * Each variant uses obviously-distinct URLs so an off-by-one in the
 * cascade is immediately visible in test failure output.
 */
export const POSTER_AUTO_ONLY_PAYLOAD: PublicPayload = {
  ...MINIMAL_PAYLOAD,
  video: {
    videoUrl: "https://example.com/walkthrough.mp4",
    autoPosterUrl: "https://blob.example.com/auto-first-frame.jpg",
  },
};

export const POSTER_SCRUB_OVER_AUTO_PAYLOAD: PublicPayload = {
  ...MINIMAL_PAYLOAD,
  video: {
    videoUrl: "https://example.com/walkthrough.mp4",
    autoPosterUrl: "https://blob.example.com/auto-first-frame.jpg",
    scrubPosterUrl: "https://blob.example.com/scrub-picked-frame.jpg",
  },
};

export const POSTER_OVERRIDE_WINS_PAYLOAD: PublicPayload = {
  ...MINIMAL_PAYLOAD,
  video: {
    videoUrl: "https://example.com/walkthrough.mp4",
    autoPosterUrl: "https://blob.example.com/auto-first-frame.jpg",
    scrubPosterUrl: "https://blob.example.com/scrub-picked-frame.jpg",
    posterUrl: "https://blob.example.com/manual-override-thumbnail.jpg",
  },
};

/**
 * A7d.8.1 — never-blank fallback fixture. Video is set but ALL THREE
 * poster slots are empty (the iOS-Safari capture-timeout scenario, post
 * decouple + soft-fail). The renderer must omit the poster attribute
 * entirely rather than emit poster="", so the browser's
 * preload="metadata" path paints the native first frame instead of a
 * blank black box.
 */
export const POSTER_NONE_PAYLOAD: PublicPayload = {
  ...MINIMAL_PAYLOAD,
  video: {
    videoUrl: "https://example.com/walkthrough.mp4",
  },
};

/**
 * F2 — flagship privacy fixture. FULL_PAYLOAD with ROGUE private keys glued
 * onto the raw record (the hand-tampered-KV scenario): private top-level
 * fields, a per-comp `counted` flag + note, and a private-pitch array. None
 * are part of the public payload type; `clampPublicPayload` reads only the
 * allowlisted keys, so NONE may reach the rendered flagship HTML. The
 * flagship privacy spec injects this through the SAME clamp boundary as a
 * real publish and asserts every sentinel — and the literal "counted" key —
 * is absent. (Projection-level guarantees — set-aside filtering, private
 * pitch dropping, strategy/confidence stripping at publish time — are proven
 * by seller-presentation.publish-allowlist.spec.ts.)
 */
export const FLAGSHIP_PRIVACY_SENTINELS = {
  strategy: "SENTINELSTRATEGYIDQ9",
  confidence: "SENTINELCONFIDENCEQ9",
  compNote: "SENTINELCOMPNOTEQ9",
  fieldConfidence: "SENTINELFIELDCONFQ9",
  privatePitch: "SENTINELPRIVATEPITCHQ9",
} as const;

export const FLAGSHIP_PRIVACY_PAYLOAD = {
  ...FULL_PAYLOAD,
  // rogue private top-level keys — clamp ignores unknown keys entirely.
  strategyId: FLAGSHIP_PRIVACY_SENTINELS.strategy,
  strategyLabel: FLAGSHIP_PRIVACY_SENTINELS.strategy,
  confidence: FLAGSHIP_PRIVACY_SENTINELS.confidence,
  pitchPrivatePoints: [FLAGSHIP_PRIVACY_SENTINELS.privatePitch],
  // a comp carrying the set-aside flag + private projection-only fields —
  // clampPublicComp emits ONLY {address, soldPrice, soldDate, sqft, yearBuilt},
  // so `counted`, `notes`, `fieldConfidence` are dropped at the boundary.
  whyPrice: {
    ...FULL_PAYLOAD.whyPrice,
    comps: FULL_PAYLOAD.whyPrice.comps.map((c, i) =>
      i === 0
        ? {
            ...c,
            counted: false,
            notes: FLAGSHIP_PRIVACY_SENTINELS.compNote,
            fieldConfidence: FLAGSHIP_PRIVACY_SENTINELS.fieldConfidence,
          }
        : c,
    ),
  },
} as unknown as PublicPayload;
