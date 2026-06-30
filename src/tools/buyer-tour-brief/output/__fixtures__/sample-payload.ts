/**
 * Buyer Tour Brief — render fixtures (BUYER_TOUR_BRIEF).
 *
 * Hand-populated public payloads for the dev preview route + the e2e render/
 * interaction specs, without round-tripping through a real publish + auth + KV.
 * Every value is FACTUAL / agent-authored — these double as the corpus the Fair
 * Housing guard scans, so they stay clean (no qualitative or familial-status copy).
 *
 * NATIONAL USABILITY: the South Sound / JBLM values below are SAMPLE DATA only —
 * the commute label rides each fixture's own `commuteAnchor.label`, never a product
 * default. `MN_PAYLOAD` is a second, non-Washington sample (Minneapolis) that proves
 * the page carries no region-specific assumptions.
 *
 * Photos: some homes point at a real loadable image (so the preview shows the photo
 * treatment), one is absent and one is an intentionally non-loadable URL — together
 * they exercise the photo + branded-placeholder fallback paths.
 */

import type { BuyerTourPublicPayload } from "../public-payload";

const img = (seed: string) => `https://picsum.photos/seed/${seed}/800/600`;

/** A rich, fully-populated WA sample: 4 homes across distinct South Sound areas. */
export const FULL_PAYLOAD: BuyerTourPublicPayload = {
  templateVersion: 1,
  buyerName: "Maya & Chris",
  tourDate: "Saturday, Jul 11",
  startTime: "9:30 AM",
  length: "About 2.5 hrs",
  meetingPoint: "Stop 1, 1423 Bobs Hollow Ln",
  agentNote:
    "I lined these up north to south so the day flows, and saved the one with the " +
    "most character for last. Text me anytime if you want to add a home or shift " +
    "the start.",
  priorities: ["schools", "commute", "parks", "coffee", "grocery"],
  // CUSTOM buyer priorities (Planned around) — what the buyer cares about, in the
  // agent's words. Distinct from the factual map layers above.
  buyerPriorities: ["Short commute", "Home office", "Parks & coffee"],
  brandAccent: "#7c3aed",
  // Sample anchor — drives every commute label dynamically. JBLM appears ONLY
  // because THIS fixture's anchor label is "JBLM main gate".
  commuteAnchor: { label: "JBLM main gate", lat: 47.0879, lng: -122.5807 },
  agent: {
    name: "Jordan Avery",
    brokerage: "Aaron Thomas Home Team",
    phone: "253-555-0142",
    email: "jordan@aaronthomas.example",
    photoUrl: "https://images.example.com/agent/jordan.jpg", // fails → monogram "JA"
    schedulingUrl: "https://cal.com/jordan-avery/tour",
  },
  homes: [
    {
      stop: 1,
      address: "1423 Bobs Hollow Ln, DuPont, WA",
      photoUrl: img("dupont-cedar"), // real loadable → shows the photo treatment
      price: 629000,
      beds: 4,
      baths: 2.5,
      sqft: 2410,
      lat: 47.0979,
      lng: -122.6307,
      whyOnList:
        "Closest to base, and it has the main-floor den you wanted for an office. We start here so it sets the bar.",
      watchFor: "Check the den's light, and listen for parkway noise on the north side.",
      proximity: [
        { category: "commute", label: "JBLM main gate", value: "6 min" },
        { category: "schools", label: "DuPont elementary", value: "0.4 mi" },
        { category: "parks", label: "Sequalitchew trail", value: "0.3 mi" },
      ],
    },
    {
      stop: 2,
      address: "6402 Grandview Dr W, University Place, WA",
      photoUrl: "https://images.example.com/homes/grandview.jpg", // fails → placeholder
      price: 712500,
      beds: 4,
      baths: 3,
      sqft: 2680,
      lat: 47.2129,
      lng: -122.5471,
      whyOnList:
        "Stretches the budget, but it's the one with a partial water view and a dedicated office off the entry.",
      watchFor: "See if the view holds when the trees leaf out. This is the longest drive of the four.",
      proximity: [
        { category: "commute", label: "JBLM main gate", value: "22 min" },
        { category: "schools", label: "Curtis high school", value: "0.7 mi" },
        { category: "coffee", label: "Chambers Bay cafes", value: "5 min" },
      ],
    },
    {
      stop: 3,
      // No photoUrl → branded placeholder (the absent-photo path).
      address: "8910 Onyx Dr SW, Lakewood, WA",
      price: 575000,
      beds: 3,
      baths: 2,
      sqft: 2050,
      lat: 47.1718,
      lng: -122.5185,
      whyOnList:
        "The value pick. Most house for the money and backs to green space, though the office would be a converted bedroom.",
      watchFor: "Picture your desk in the third bedroom, and walk to the back fence to see the park trail.",
      proximity: [
        { category: "commute", label: "JBLM main gate", value: "14 min" },
        { category: "parks", label: "Fort Steilacoom Park", value: "0.2 mi" },
        { category: "schools", label: "Lakewood K-8", value: "0.5 mi" },
      ],
    },
    {
      stop: 4,
      address: "211 Wilkes St, Steilacoom, WA",
      photoUrl: img("steilacoom-wilkes"), // real loadable
      price: 655000,
      beds: 3,
      baths: 2.5,
      sqft: 2220,
      lat: 47.1698,
      lng: -122.6021,
      whyOnList:
        "The wildcard. Most character and the walkable-town feel, with coffee and the waterfront a short walk away. Saved for last on purpose.",
      watchFor: "Older home, so check the windows and mechanicals, then imagine the Saturday walk to coffee.",
      proximity: [
        { category: "commute", label: "JBLM main gate", value: "17 min" },
        { category: "coffee", label: "Topside coffee & waterfront", value: "0.2 mi" },
        { category: "schools", label: "Steilacoom elementary", value: "0.6 mi" },
      ],
    },
  ],
};

/**
 * NATIONAL sanity sample — a Minneapolis buyer. Proves the page carries no
 * region-specific assumptions: the commute label reads "Downtown Minneapolis",
 * the map tag is not JBLM, and Planned-around is the agent's own words.
 */
export const MN_PAYLOAD: BuyerTourPublicPayload = {
  templateVersion: 1,
  buyerName: "Priya",
  tourDate: "Sunday, Sep 14",
  startTime: "10:00 AM",
  meetingPoint: "Stop 1, 4100 W 44th St",
  agentNote:
    "Three to compare on Sunday. I put the walkable one first while we're fresh, " +
    "and grouped them so we're never backtracking. Text me to tweak anything.",
  priorities: ["schools", "commute", "parks", "coffee", "grocery"],
  buyerPriorities: ["Short commute to downtown", "Backyard", "Walkable coffee"],
  brandAccent: "#1d4ed8",
  commuteAnchor: { label: "Downtown Minneapolis", lat: 44.9778, lng: -93.265 },
  agent: {
    name: "Morgan Lee",
    brokerage: "North Loop Realty",
    phone: "612-555-0199",
    email: "morgan@northloop.example",
    // No photoUrl → monogram "ML".
    schedulingUrl: "https://cal.com/morgan-lee/tour",
  },
  homes: [
    {
      stop: 1,
      address: "4100 W 44th St, Edina, MN",
      photoUrl: img("edina-44th"),
      price: 689000,
      beds: 4,
      baths: 3,
      sqft: 2560,
      lat: 44.9126,
      lng: -93.329,
      whyOnList:
        "Walkable to 50th & France, which you said you'd trade yard space for. Start here while we're fresh.",
      watchFor: "Smaller lot. See if the kitchen flow works for how you cook.",
      proximity: [
        { category: "commute", label: "Downtown Minneapolis", value: "18 min" },
        { category: "coffee", label: "50th & France cafes", value: "0.2 mi" },
        { category: "parks", label: "Pamela Park", value: "0.5 mi" },
      ],
    },
    {
      stop: 2,
      address: "2840 Inglewood Ave S, St. Louis Park, MN",
      price: 575000,
      beds: 3,
      baths: 2,
      sqft: 1980,
      lat: 44.9418,
      lng: -93.3469,
      whyOnList:
        "The value pick and the biggest backyard, with a quick hop to the trail you liked.",
      watchFor: "One full bath up. Picture how the morning routine would flow.",
      proximity: [
        { category: "commute", label: "Downtown Minneapolis", value: "15 min" },
        { category: "parks", label: "Cedar Lake trail", value: "0.3 mi" },
        { category: "grocery", label: "Co-op", value: "0.4 mi" },
      ],
    },
    {
      stop: 3,
      address: "1925 Johnson St NE, Minneapolis, MN",
      photoUrl: img("ne-johnson"),
      price: 615000,
      beds: 3,
      baths: 2,
      sqft: 2100,
      lat: 45.0118,
      lng: -93.247,
      whyOnList:
        "Most character of the three and the shortest commute, in the arts district you mentioned.",
      watchFor: "Older home, so we'll want a close look at the windows and mechanicals.",
      proximity: [
        { category: "commute", label: "Downtown Minneapolis", value: "9 min" },
        { category: "coffee", label: "NE coffee row", value: "0.1 mi" },
        { category: "schools", label: "Northeast elementary", value: "0.4 mi" },
      ],
    },
  ],
};

/** Minimal valid tour: 3 homes, no photos, no geocode (no map), one layer. */
export const MINIMAL_PAYLOAD: BuyerTourPublicPayload = {
  templateVersion: 1,
  buyerName: "Sam",
  tourDate: "Sunday, August 3",
  priorities: ["commute"],
  buyerPriorities: ["Short commute", "Low maintenance"],
  agent: { name: "Alex Rivera", phone: "253-555-0142" },
  commuteAnchor: { label: "Capitol campus" },
  homes: [
    {
      stop: 1,
      address: "100 Main St, Olympia, WA",
      whyOnList: "Closest to your price ceiling with the garage you asked for.",
      watchFor: "Roof age. Ask the listing agent when it was last done.",
      proximity: [{ category: "commute", label: "Capitol campus", value: "9 min" }],
    },
    {
      stop: 2,
      address: "240 Legion Way, Olympia, WA",
      whyOnList: "Walkable to downtown, which you said you'd trade yard space for.",
      watchFor: "Small kitchen. See if the layout works for you.",
      proximity: [{ category: "commute", label: "Capitol campus", value: "6 min" }],
    },
    {
      stop: 3,
      address: "55 Boundary St, Olympia, WA",
      whyOnList: "Newest build on the list, lowest maintenance to start.",
      watchFor: "HOA dues. We'll confirm what they cover.",
      proximity: [{ category: "commute", label: "Capitol campus", value: "14 min" }],
    },
  ],
};

export const FIXTURES: Record<string, BuyerTourPublicPayload> = {
  full: FULL_PAYLOAD,
  mn: MN_PAYLOAD,
  minimal: MINIMAL_PAYLOAD,
};
