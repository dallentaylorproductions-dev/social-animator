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
  // ", OH" which rendered "TACOMA, WA, WA 98406" (doubled state).
  propertyCity: "Tacoma",
  // Recommended price is a RANGE (LOW $619,000 – HIGH $642,000); this single
  // value is the range midpoint, used only by the v1 count-up + as the range-
  // less fallback. The flagship hero renders the range from property.recommended
  // ListLow/High below.
  recommendedPrice: "$630,000",
  priceRationale:
    "Four recently sold homes within a few blocks anchor the recommendation. Each closed in the last several months and shares the bones of your home: era, footprint, and lot orientation. The $619,000 to $642,000 range sits right where those sales landed, high enough to reflect your updates and the original woodwork, without pricing past what buyers just paid nearby. Expect strong activity in the first two weekends.",
  // North Tacoma (98406) comps. The street-only `address` displays with the
  // city + sqft + built-year appended by the comp card; the Street View aiming
  // data lives on `whyPrice.comps` below (the array the flagship renders).
  comps: [
    {
      address: "4210 N 14th St",
      soldPrice: "$592,000",
      soldDate: "Sold February 19, 2026",
      sqft: "2,740",
      yearBuilt: 1951,
    },
    {
      address: "1705 N Anderson St",
      soldPrice: "$580,000",
      soldDate: "Sold March 6, 2026",
      sqft: "2,020",
      yearBuilt: 1919,
    },
    {
      address: "1722 N Oakes St",
      soldPrice: "$605,000",
      soldDate: "Sold April 17, 2026",
      sqft: "2,010",
      yearBuilt: 1906,
    },
    {
      address: "1008 N Steele St",
      soldPrice: "$700,000",
      soldDate: "Sold May 8, 2026",
      sqft: "2,715",
      yearBuilt: 1925,
    },
  ],
  agentBranding: {
    name: "Marisol Reyes",
    brokerage: "Howard Hanna Real Estate",
    phone: "2165550188",
    email: "marisol@hhanna.com",
    licenseNumber: "SAL.2018003412",
    areasServed: "Tacoma · North End · Proctor District",
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
    // "TACOMA, WA, WA 98406" cosmetic bug A7b.2 smoke caught).
    city: "Tacoma",
    state: "WA",
    zip: "98406",
    // A real, license-safe LOCAL house photo (committed under public/sample-
    // assets) so the preview/sample hero reads as a photo — not a flat block an
    // agent might fear carries to their page. The template renders it as the
    // decorative (aria-hidden) hero background; the scrim band + eyebrow sit
    // over it exactly as on a real page. Fixture DATA only — template untouched.
    heroPhotoUrl: "/sample-assets/exterior.webp",
    // UX-2a recommended price as a LOW/HIGH range. The flagship Price section
    // renders "$619,000 – $642,000"; `recommendedList` stays the single midpoint
    // for the v1 count-up + back-compat, and the area chart reads the midpoint.
    recommendedList: "$630,000",
    recommendedListLow: "$619,000",
    recommendedListHigh: "$642,000",
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
      "Four recently sold homes within a few blocks anchor the recommendation. Each closed in the last several months and shares the bones of your home: era, footprint, and lot orientation. The $619,000 to $642,000 range sits right where those sales landed, high enough to reflect your updates and the original woodwork, without pricing past what buyers just paid nearby. Expect strong activity in the first two weekends.",
    // The flagship comp cards render real, aimed Google Street View photos for
    // each of these 4 North Tacoma (98406) addresses. COMPLIANCE: we persist
    // ONLY the pano id + coverage flag + the derived aiming data (heading +
    // house lat/lng) resolved from the FREE metadata + geocoding endpoints. The
    // image is requested fresh client-side at view time and NEVER stored. The
    // streetView values were resolved via the same `resolveCompCoverage`
    // pipeline a real wizard publish runs (see street-view.ts).
    comps: [
      {
        address: "4210 N 14th St",
        soldPrice: "$592,000",
        soldDate: "Sold February 19, 2026",
        sqft: "2,740",
        yearBuilt: 1951,
        hasStreetView: true,
        streetViewPanoId: "TYJpmYKWYPGef4qYTmb59Q",
        streetViewHeading: 177.49,
        houseLat: 47.262489,
        houseLng: -122.493832,
      },
      {
        address: "1705 N Anderson St",
        soldPrice: "$580,000",
        soldDate: "Sold March 6, 2026",
        sqft: "2,020",
        yearBuilt: 1919,
        hasStreetView: true,
        streetViewPanoId: "Y3d_jpXP8yw2FVY42ukQcA",
        streetViewHeading: 109.15,
        houseLat: 47.265223,
        houseLng: -122.472547,
      },
      {
        address: "1722 N Oakes St",
        soldPrice: "$605,000",
        soldDate: "Sold April 17, 2026",
        sqft: "2,010",
        yearBuilt: 1906,
        hasStreetView: true,
        streetViewPanoId: "hMujcWLJiJ_n5Pb55cBs1A",
        streetViewHeading: 266.46,
        houseLat: 47.265773,
        houseLng: -122.471965,
      },
      {
        address: "1008 N Steele St",
        soldPrice: "$700,000",
        soldDate: "Sold May 8, 2026",
        sqft: "2,715",
        yearBuilt: 1925,
        hasStreetView: true,
        streetViewPanoId: "cPSOW7yEdI4yQQtvg4-xyw",
        streetViewHeading: 259.72,
        houseLat: 47.258835,
        houseLng: -122.468442,
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
      attributionStreet: "N Junett",
    },
    {
      body: "Quiet, calm, prepared. We had a clear plan from week one and never once felt like we were chasing her for an answer.",
      attributionName: "A. Park",
      attributionYear: "2024",
      attributionStreet: "N Stevens",
    },
    {
      body: "She turned what we thought would be a stressful summer into something almost easy. Closed at ask in nine days.",
      attributionName: "E. & T. Chen",
      attributionYear: "2023",
      attributionStreet: "N Cedar",
    },
  ],
  reviewsOutlink: {
    label: "See all reviews on Zillow",
    url: "https://www.zillow.com/profile/marisolreyes",
  },
  // "as of <Mon YYYY>" stamp for the reviews aggregate (used by the v2 review
  // card's Google attribution; harmless for this Zillow sample, which shows the
  // text-only treatment).
  reviewsAsOf: "Jun 2026",
  areaStats: {
    medianSale: "$648k",
    medianSaleDeltaYoy: "+6.2% vs prior year",
    // §05 hides these neighborhood cells (they duplicate the agent track record
    // in By-the-numbers); kept in the payload for coherence + back-compat.
    daysOnMarket: "12",
    daysOnMarketZipAvg: "vs Tacoma avg 21",
    closings90d: "31",
    listToSaleRatio: "100%",
    // A believable North Tacoma monthly median climbing Jul '25 → Jun '26
    // (oldest-first, gentle realistic wiggle), ending near the current market.
    monthlySeries: [
      { month: "Jul '25", medianPrice: "612000" },
      { month: "Aug '25", medianPrice: "618000" },
      { month: "Sep '25", medianPrice: "614000" },
      { month: "Oct '25", medianPrice: "623000" },
      { month: "Nov '25", medianPrice: "629000" },
      { month: "Dec '25", medianPrice: "626000" },
      { month: "Jan '26", medianPrice: "634000" },
      { month: "Feb '26", medianPrice: "641000" },
      { month: "Mar '26", medianPrice: "638000" },
      { month: "Apr '26", medianPrice: "649000" },
      { month: "May '26", medianPrice: "656000" },
      { month: "Jun '26", medianPrice: "662000" },
    ],
  },
  // B0b — the agent-constant "why list with us" layer. Exercises every
  // sub-block: comparison bars (sale-to-list, days-on-market) + single big
  // stats (views, homes sold), differentiators, marketing approach, the
  // numbered process, and a guarantee. Plus the optional tagline + reviews
  // headline the renderer surfaces near the agent / reviews blocks.
  whyUs: {
    differentiators: [
      "You work with me directly — never handed off to an assistant.",
      "Professional photography and video on every listing, no exceptions.",
      "I take on eight families a year so each sale gets real attention.",
    ],
    marketingApproach: [
      {
        title: "Professional photography & video",
        detail:
          "Every listing, shot by a pro — stills, video, and twilight when it helps.",
      },
      {
        title: "Targeted digital ad funnel",
        detail:
          "Your home in front of the right buyers on the platforms they actually use.",
      },
      {
        title: "Featured placement & syndication",
        detail: "Zillow Showcase plus every major portal, the first day it's live.",
      },
    ],
    performanceStats: [
      {
        label: "Average sale-to-list",
        yourValue: "101.3%",
        marketValue: "99.0%",
        unit: "%",
      },
      {
        label: "Average days on market",
        yourValue: "8",
        marketValue: "21",
        unit: "days",
      },
      { label: "Homes sold (last 12 months)", yourValue: "24" },
      { label: "Total reviews", yourValue: "63" },
    ],
    howWeWork: [
      {
        step: "Walk the home together",
        detail: "We see what buyers will see and plan around it.",
      },
      {
        step: "Price it on real comps",
        detail: "A number grounded in what's actually selling nearby.",
      },
      {
        step: "Prep, shoot, and stage",
        detail: "Photography, video, and any quick fixes that pay off.",
      },
      {
        step: "Launch the marketing",
        detail: "Portals, ads, and my network, all on day one.",
      },
      {
        step: "Negotiate and close",
        detail: "I handle every offer and walk you through to the keys.",
      },
    ],
    guarantee:
      "If you're not happy, cancel anytime — no fees, no hard feelings.",
  },
  agentTagline: "Eight families a year, each one a priority.",
  reviewsHeadline: "What sellers say",
  agent: {
    name: "Marisol Reyes",
    brokerage: "Howard Hanna Real Estate",
    phone: "2165550188",
    email: "marisol@hhanna.com",
    licenseNumber: "SAL.2018003412",
    areasServed: "Tacoma · North End · Proctor District",
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
 * LS-1 — partially-filled area snapshot. MINIMAL_PAYLOAD plus an areaStats with
 * only TWO of the six stat fields set and NO monthly chart series. Proves the
 * §05 section renders the fields the agent gave (median sale + days on market),
 * omits the missing ones, mounts no chart (AreaChart no-ops on an empty series),
 * and shows NO "market snapshot on the way" placeholder. Mirrors the empty case
 * (which hides the section entirely) on the other side of the field-by-field line.
 */
export const AREA_PARTIAL_PAYLOAD: PublicPayload = {
  ...MINIMAL_PAYLOAD,
  areaStats: {
    medianSale: "$642k",
    daysOnMarket: "14",
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

/**
 * Seller State A — the prepared invitation (rich). Derived from FULL_PAYLOAD so
 * the supporting data (comps for nearby-sold context, area snapshot, whyUs track
 * record + marketing, reviews) is present and each proof item renders truthfully.
 * The SUBJECT price is stripped EVERYWHERE (recommendedPrice / recommendedList /
 * range / rationale all blank) so the render carries no price for the home being
 * valued; the comp sold prices remain as neighborhood context only. Carries the
 * invitation `valuationStatus` + an `appointmentAt`, so the consumer dispatch
 * resolves to the StateAPage exactly like a real State A publish.
 */
export const STATE_A_FULL_PAYLOAD: PublicPayload = {
  ...FULL_PAYLOAD,
  recommendedPrice: "",
  priceRationale: "",
  property: {
    ...FULL_PAYLOAD.property,
    recommendedList: "",
    recommendedListLow: undefined,
    recommendedListHigh: undefined,
    rationaleShort: "",
  },
  whyPrice: {
    ...FULL_PAYLOAD.whyPrice,
    publicRationale: "",
  },
  // Give the hero personal-message video a real poster (a committed sample asset)
  // so the hero hello renders a concrete image in the preview. State-A fixture
  // only; FULL_PAYLOAD (State B) is untouched.
  video: {
    ...FULL_PAYLOAD.video,
    posterUrl: "/sample-assets/living-room.webp",
  },
  signatureLine:
    "Known for quiet, thorough preparation, so the number we land on is one you can stand behind.",
  // Set-once CAPABILITY samples for the campaign frames — the agent's best listing
  // photography + a recent video tour, DISTINCT from the hero personal message
  // above. Committed sample assets back a concrete preview. valuationMessage /
  // welcomeLine are intentionally LEFT UNSET so the render exercises the strong
  // defaults.
  sampleListingPhotoUrl: "/sample-assets/exterior.webp",
  sampleVideoUrl: "https://example.com/marisol-tour.mp4",
  sampleVideoPosterUrl: "/sample-assets/living-room.webp",
  valuationStatus: "preparing_for_walkthrough",
  appointmentAt: "2026-06-20T14:00",
};

/**
 * Seller State A - mixed Street View coverage (COMP_PHOTOS). Same prepared
 * invitation as STATE_A_FULL_PAYLOAD, but the nearby-sales set interleaves comps
 * WITH resolved coverage and comps WITHOUT (hasStreetView: false, no pano) - the
 * real-world shape when some addresses have no Street View. Proves the brief
 * renders ONLY the photographed comps (no empty frame ever ships) regardless of
 * the order they sit in the payload. The first + third have coverage; the second
 * + fourth do not, so the brief shows exactly two sales.
 */
export const STATE_A_MIXED_COVERAGE_PAYLOAD: PublicPayload = {
  ...STATE_A_FULL_PAYLOAD,
  whyPrice: {
    ...STATE_A_FULL_PAYLOAD.whyPrice,
    comps: [
      {
        address: "4210 N 14th St",
        soldPrice: "",
        hasStreetView: true,
        streetViewPanoId: "TYJpmYKWYPGef4qYTmb59Q",
        streetViewHeading: 177.49,
        houseLat: 47.262489,
        houseLng: -122.493832,
      },
      // No Street View coverage - must NOT render a frame in the brief.
      { address: "9000 Rural Route 1", soldPrice: "", hasStreetView: false },
      {
        address: "1722 N Oakes St",
        soldPrice: "",
        hasStreetView: true,
        streetViewPanoId: "hMujcWLJiJ_n5Pb55cBs1A",
        streetViewHeading: 266.46,
        houseLat: 47.265773,
        houseLng: -122.471965,
      },
      // Resolved, no coverage - also filtered out of the brief.
      { address: "12 Backcountry Ln", soldPrice: "", hasStreetView: false },
    ],
  },
};

/**
 * Seller State A — the minimal invitation: only an address, the agent, the
 * status, and the appointment. NO comps, area, whyUs, or reviews, so every proof
 * item AND every optional block flexes out (no hollow checkmarks, no empty
 * blocks). The appointment + valuation-being-prepared + what-we-confirm + CTA
 * blocks still render so the page reads complete with little data.
 */
export const STATE_A_MINIMAL_PAYLOAD: PublicPayload = {
  ...MINIMAL_PAYLOAD,
  recommendedPrice: "",
  comps: [],
  property: {
    address: "1234 Test Drive NE",
    recommendedList: "",
  },
  whyPrice: {
    publicRationale: "",
    comps: [],
  },
  agent: {
    name: "Aaron Test",
    brokerage: "Test Realty",
    phone: "2532028825",
    email: "aaron@example.com",
  },
  valuationStatus: "preparing_for_walkthrough",
  appointmentAt: "2026-06-20T14:00",
};

/**
 * Seller State A — Zone 1 flex-out: the rich invitation with NO hello video. The
 * whole welcome-video section drops and the hero below stays intact (no empty
 * band). Everything else matches STATE_A_FULL_PAYLOAD.
 */
export const STATE_A_NO_VIDEO_PAYLOAD: PublicPayload = {
  ...STATE_A_FULL_PAYLOAD,
  video: { ...STATE_A_FULL_PAYLOAD.video, videoUrl: "" },
};

/**
 * Seller State A — Zone 2 flex-out: a trend SERIES with no agent-stamped YoY
 * delta. The sparkline panel runs full-width and the `+6%` proof panel collapses
 * (no orphaned slot); the activity line still narrates the trend from its series
 * endpoints. Same rich invitation otherwise.
 */
export const STATE_A_TREND_ONLY_PAYLOAD: PublicPayload = {
  ...STATE_A_FULL_PAYLOAD,
  areaStats: {
    ...STATE_A_FULL_PAYLOAD.areaStats,
    medianSaleDeltaYoy: "",
  } as PublicPayload["areaStats"],
};

/**
 * Seller State A — Zone 4 flex-out: a testimonial quote but NO track-record stat.
 * The quote centers into a complete panel and the 101.3% rail is removed entirely
 * (no empty rail, no top-border stub). Same rich invitation otherwise.
 */
export const STATE_A_NO_STAT_PAYLOAD: PublicPayload = {
  ...STATE_A_FULL_PAYLOAD,
  whyUs: {
    ...STATE_A_FULL_PAYLOAD.whyUs,
    performanceStats: [],
  } as PublicPayload["whyUs"],
};

/**
 * Seller State A · Zone 5 — the listings coverflow, FULL fan. Same prepared
 * invitation as STATE_A_FULL_PAYLOAD, plus five recent listings flexing the
 * coverflow in beneath the capability cards. Exercises every honesty branch at
 * once: portal-scale view counts (the number is the hero), a with/without-number
 * MIX (418 Linden carries no count → that visible card shows address only, no
 * empty slot), and the summed aggregate. The two outer peeks carry numbers that
 * the band hides but the aggregate counts, so 32,246 + 41,184 + 37,610 + 28,560
 * = 139,600 "buyer views" — never authored, always summed from real per-card
 * numbers. The empty / capability-cards-only state is STATE_A_FULL_PAYLOAD
 * itself (no recentListings), so no separate fixture is needed for it.
 */
export const STATE_A_COVERFLOW_PAYLOAD: PublicPayload = {
  ...STATE_A_FULL_PAYLOAD,
  recentListings: [
    // out-left peek (no band shown) — its count feeds the aggregate.
    {
      address: "902 Marsh Ln",
      city: "Eastgate",
      photoUrl: "/sample-assets/backyard.webp",
      viewCount: 32246,
    },
    // in-left (visible) — intentionally NO viewCount: the with/without mix.
    {
      address: "418 Linden Ave",
      city: "Glen Park",
      photoUrl: "/sample-assets/exterior.webp",
    },
    // center (visible, keyline) — the hero number.
    {
      address: "1240 Hawthorne St",
      city: "Maple Heights",
      photoUrl: "/sample-assets/living-room.webp",
      viewCount: 41184,
    },
    // in-right (visible) — with a number.
    {
      address: "77 Cedar Court",
      city: "Westbrook",
      photoUrl: "/sample-assets/kitchen.webp",
      viewCount: 37610,
    },
    // out-right peek (no band shown) — its count feeds the aggregate.
    {
      address: "5530 Brook Hollow",
      city: "Riverton",
      photoUrl: "/sample-assets/bedroom.webp",
      viewCount: 28560,
    },
  ],
};

/**
 * Seller State A · Zone 5 — the 2-listing state (a gentle pair, no faked peeks).
 * Both carry a number, so the aggregate (41,184 + 37,610 = 78,794) renders.
 */
export const STATE_A_COVERFLOW_PAIR_PAYLOAD: PublicPayload = {
  ...STATE_A_FULL_PAYLOAD,
  recentListings: [
    {
      address: "1240 Hawthorne St",
      city: "Maple Heights",
      photoUrl: "/sample-assets/living-room.webp",
      viewCount: 41184,
    },
    {
      address: "77 Cedar Court",
      city: "Westbrook",
      photoUrl: "/sample-assets/kitchen.webp",
      viewCount: 37610,
    },
  ],
};

/**
 * Seller State A · Zone 5 — the single-listing state: one card, centered and
 * upright, keeping the keyline. Only ONE card carries a number, so the aggregate
 * is BELOW the ≥2 gate and hides cleanly (no hollow one-listing total).
 */
export const STATE_A_COVERFLOW_SINGLE_PAYLOAD: PublicPayload = {
  ...STATE_A_FULL_PAYLOAD,
  recentListings: [
    {
      address: "1240 Hawthorne St",
      city: "Maple Heights",
      photoUrl: "/sample-assets/living-room.webp",
      viewCount: 41184,
    },
  ],
};
