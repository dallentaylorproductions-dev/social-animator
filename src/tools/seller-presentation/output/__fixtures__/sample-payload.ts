import type { PublicPayload } from "../public-payload";

/**
 * Hand-populated sample payloads for the consumer page (v1.47 / A7b).
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
 * Why fixtures instead of wizard input: A7c hasn't shipped wizard
 * capture UI for the new fields yet. The fixtures let the e2e
 * render spec + Dallen's browser smoke exercise the rendered page
 * without round-tripping through a real publish + auth + KV.
 */

export const FULL_PAYLOAD: PublicPayload = {
  // ---- A6 flat fields (still emitted for the bridge state) ----
  propertyAddress: "1742 Kenilworth Avenue",
  propertyCity: "Tremont, OH",
  recommendedPrice: "$675,000",
  priceRationale:
    "Three recently-sold homes within four blocks anchor the recommendation. Each closed in the last ninety days and shares the bones of your home — era, footprint, lot orientation. At $675,000 you're a step above the average closing price for the block, which reflects the original woodwork, the south-facing kitchen, and the recent mechanicals — without pricing past the comparable range. We'll see strong activity in the first two weekends.",
  comps: [
    {
      address: "2218 W 14th Street",
      soldPrice: "$648,000",
      soldDate: "Sold March 14, 2026",
      sqft: "1,810",
    },
    {
      address: "1908 Castle Avenue",
      soldPrice: "$691,000",
      soldDate: "Sold April 02, 2026",
      sqft: "1,920",
    },
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
    city: "Tremont, OH",
    state: "OH",
    zip: "44113",
    heroPhotoUrl: undefined,
    recommendedList: "$675,000",
    rationaleShort:
      "A price the market will meet quickly — and one that gives the right buyer room to fall in love.",
  },
  preparedFor: "the Halloran family",
  agentNote:
    "Here's exactly what I'd do to sell your home — and why I'm so confident in the number.",
  // A7b.1: a small inline SVG so the editorial-band render path is
  // exercised without depending on a network image. Renders as a
  // warm-toned solid block (the locked design's fallback color) —
  // proves the band reserves height + the renderer paints it.
  // Wizard capture (A7c) will replace this with a real agent-entered
  // photo URL.
  editorialPhotoUrl:
    "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 1 1' preserveAspectRatio='none'><rect width='1' height='1' fill='%23b9a78a'/></svg>",
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
      },
      {
        address: "1908 Castle Avenue",
        soldPrice: "$691,000",
        soldDate: "Sold April 02, 2026",
        sqft: "1,920",
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
  trackRecord: {
    figures: [
      {
        label: "Homes sold in Tremont",
        value: "40",
        ctx: "Closed by Marisol · trailing 36 months",
      },
      {
        label: "Average days on market",
        value: "11 days",
        ctx: "Her listings, vs. 21 days area-wide.",
      },
      {
        label: "List-to-sale ratio",
        value: "102%",
        ctx: "How close her listings close to ask price.",
      },
    ],
    testimonial: {
      body: "She walked us through every offer in plain English and never once made us feel rushed. We closed at $24k over ask and still felt like the decision was ours.",
      attributionShort: "D. & K. Bauer",
      areaOrYear: "Sold on Castle Avenue, 2025",
    },
  },
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
  buyerQuote: {
    body: "A house like this doesn't sit on the market — it gets chosen, quickly, by the right person.",
    source: "From a buyer's offer letter · April 2026",
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
  // preparedFor, agentNote, video, trackRecord, reviews,
  // reviewsOutlink, areaStats, buyerQuote — all intentionally absent.
  // The renderer must hide each block cleanly with no empty holes.
};
