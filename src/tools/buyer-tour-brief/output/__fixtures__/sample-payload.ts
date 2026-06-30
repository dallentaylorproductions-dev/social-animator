/**
 * Buyer Tour Brief — render fixtures (BUYER_TOUR_BRIEF).
 *
 * Hand-populated public payloads for the dev preview route + the e2e render/
 * interaction specs, without round-tripping through a real publish + auth + KV.
 * Every value is FACTUAL / agent-authored — these double as the corpus the Fair
 * Housing guard scans, so they stay clean (no qualitative or familial-status copy).
 *
 * LEGITIMACY: homes carry ONLY geocoded `lat`/`lng` — never pixel positions. The
 * map is projected from these coordinates by `projectTourMap` (map-geometry.ts), so
 * it is truthfully generated, not hand-placed art. The national fixtures below
 * (Minneapolis / Dallas / rural Montana) would expose any hardcoded WA map or copy.
 *
 * PHOTOS: real photos use BUNDLED same-origin SVGs under /public/buyer-tour-samples
 * (load reliably, no network). One home + the FULL agent use an intentionally
 * missing same-origin path that 404s fast, proving the failed-load → clean
 * placeholder / monogram path. One home is photoless (the absent path).
 */

import type { BuyerTourPublicPayload } from "../public-payload";

const SAMPLE_1 = "/buyer-tour-samples/home-1.svg";
const SAMPLE_2 = "/buyer-tour-samples/home-2.svg";
const SAMPLE_AGENT = "/buyer-tour-samples/agent-1.svg";
/** A same-origin path that 404s fast → fires <img> onError → clean fallback. */
const MISSING = "/buyer-tour-samples/__missing__.jpg";

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
    photoUrl: MISSING, // 404 → monogram "JA" (proves the headshot fallback)
    schedulingUrl: "https://cal.com/jordan-avery/tour",
  },
  homes: [
    {
      stop: 1,
      address: "1423 Bobs Hollow Ln, DuPont, WA",
      photoUrl: SAMPLE_1, // bundled → shows the photo treatment
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
      photoUrl: MISSING, // 404 → branded placeholder (proves the failed-load path)
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
      photoUrl: SAMPLE_2, // bundled → shows the photo treatment
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
 * NATIONAL sample — Minneapolis. Anchor is WITHIN the tour area, so the on-map tag
 * shows. Proves no region assumptions: commute reads "Downtown Minneapolis".
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
      photoUrl: SAMPLE_1,
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
      photoUrl: SAMPLE_2,
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

/**
 * NATIONAL sample — Dallas suburbs, homes far apart, with a FAR anchor (Love Field,
 * ~20+ mi south). The far anchor must NOT be jammed into the tour view: the on-map
 * tag is omitted, commute stays as drive-time chips. Agent has a bundled headshot.
 */
export const TX_PAYLOAD: BuyerTourPublicPayload = {
  templateVersion: 1,
  buyerName: "The Okafors",
  tourDate: "Saturday, Oct 4",
  startTime: "9:00 AM",
  meetingPoint: "Stop 1, 8800 Lebanon Rd",
  agentNote:
    "These are spread across the north suburbs, so I ordered them to keep the drive " +
    "sane. Commute times to Love Field are on each card.",
  priorities: ["schools", "commute", "parks", "grocery"],
  buyerPriorities: ["Newer build", "Yard for the dog", "Quick airport runs"],
  brandAccent: "#0e7c73",
  commuteAnchor: { label: "Dallas Love Field", lat: 32.8471, lng: -96.8518 },
  agent: {
    name: "Renee Carter",
    brokerage: "Lone Star Collective",
    phone: "214-555-0133",
    email: "renee@lonestar.example",
    photoUrl: SAMPLE_AGENT, // bundled → shows the real headshot treatment
    schedulingUrl: "https://cal.com/renee-carter/tour",
  },
  homes: [
    {
      stop: 1,
      address: "8800 Lebanon Rd, Frisco, TX",
      photoUrl: SAMPLE_1,
      price: 712000,
      beds: 4,
      baths: 3,
      sqft: 2900,
      lat: 33.1199,
      lng: -96.8102,
      whyOnList: "Newest of the four and the biggest yard, which topped your list.",
      watchFor: "Long airport runs from this far north. Check the morning traffic.",
      proximity: [
        { category: "commute", label: "Dallas Love Field", value: "34 min" },
        { category: "schools", label: "Frisco elementary", value: "0.5 mi" },
        { category: "grocery", label: "Market St", value: "0.6 mi" },
      ],
    },
    {
      stop: 2,
      address: "1400 Custer Rd, Plano, TX",
      photoUrl: SAMPLE_2,
      price: 639000,
      beds: 4,
      baths: 2.5,
      sqft: 2610,
      lat: 33.0487,
      lng: -96.7299,
      whyOnList: "Closest to the price you wanted, with a shorter airport hop than Frisco.",
      watchFor: "Older roof. We'll want the inspection notes.",
      proximity: [
        { category: "commute", label: "Dallas Love Field", value: "26 min" },
        { category: "parks", label: "Bob Woodruff Park", value: "0.4 mi" },
        { category: "schools", label: "Plano middle school", value: "0.7 mi" },
      ],
    },
    {
      stop: 3,
      address: "300 N Tennessee St, McKinney, TX",
      price: 585000,
      beds: 3,
      baths: 2,
      sqft: 2240,
      lat: 33.1986,
      lng: -96.6156,
      whyOnList: "Walkable historic square, the character pick, and the value of the three.",
      watchFor: "Farthest from the airport. Saved for last so we end on the fun one.",
      proximity: [
        { category: "commute", label: "Dallas Love Field", value: "41 min" },
        { category: "grocery", label: "Downtown grocer", value: "0.2 mi" },
        { category: "parks", label: "Towne Lake Park", value: "0.9 mi" },
      ],
    },
  ],
};

/**
 * NATIONAL sample — a smaller/rural market (Gallatin Valley, MT) with homes farther
 * apart. Anchor "Downtown Bozeman" sits within the tour area, so the tag shows.
 */
export const RURAL_PAYLOAD: BuyerTourPublicPayload = {
  templateVersion: 1,
  buyerName: "Dana",
  tourDate: "Friday, May 22",
  startTime: "1:00 PM",
  meetingPoint: "Stop 1, 415 E Main St",
  agentNote:
    "These are spread across the valley, so we'll cover some ground. I ordered them " +
    "to loop back toward town for coffee at the end.",
  priorities: ["schools", "commute", "grocery"],
  buyerPriorities: ["Acreage", "Mountain views", "Short drive to town"],
  brandAccent: "#b45309",
  commuteAnchor: { label: "Downtown Bozeman", lat: 45.6796, lng: -111.0386 },
  agent: {
    name: "Sawyer Boone",
    brokerage: "Big Sky Land Co.",
    phone: "406-555-0177",
    email: "sawyer@bigsky.example",
    schedulingUrl: "https://cal.com/sawyer-boone/tour",
  },
  homes: [
    {
      stop: 1,
      address: "415 E Main St, Bozeman, MT",
      photoUrl: SAMPLE_1,
      price: 749000,
      beds: 3,
      baths: 2,
      sqft: 1980,
      lat: 45.6796,
      lng: -111.034,
      whyOnList: "In-town and walkable, the shortest commute, so we start here.",
      watchFor: "Small lot for the area. See if it's enough yard.",
      proximity: [
        { category: "commute", label: "Downtown Bozeman", value: "4 min" },
        { category: "grocery", label: "Co-op", value: "0.3 mi" },
        { category: "schools", label: "Bozeman elementary", value: "0.6 mi" },
      ],
    },
    {
      stop: 2,
      address: "92 Gallatin Rd, Belgrade, MT",
      photoUrl: SAMPLE_2,
      price: 689000,
      beds: 4,
      baths: 3,
      sqft: 2520,
      lat: 45.7758,
      lng: -111.1769,
      whyOnList: "The acreage you wanted and the big mountain view off the back deck.",
      watchFor: "Longer drive to town. Picture the daily commute.",
      proximity: [
        { category: "commute", label: "Downtown Bozeman", value: "18 min" },
        { category: "schools", label: "Belgrade elementary", value: "1.2 mi" },
        { category: "grocery", label: "Town & Country", value: "0.8 mi" },
      ],
    },
    {
      stop: 3,
      address: "55 Cottonwood Rd, Four Corners, MT",
      price: 815000,
      beds: 4,
      baths: 3,
      sqft: 2980,
      lat: 45.6588,
      lng: -111.2007,
      whyOnList: "Most house and the biggest views, the splurge of the three.",
      watchFor: "Well and septic out here. We'll review the records.",
      proximity: [
        { category: "commute", label: "Downtown Bozeman", value: "16 min" },
        { category: "schools", label: "Monforton school", value: "1.0 mi" },
        { category: "grocery", label: "Four Corners market", value: "0.5 mi" },
      ],
    },
  ],
};

/** Geocode-fail sample — homes carry NO coordinates → "Map unavailable" fallback. */
export const NOMAP_PAYLOAD: BuyerTourPublicPayload = {
  templateVersion: 1,
  buyerName: "Riley",
  tourDate: "Saturday, Jun 7",
  startTime: "11:00 AM",
  priorities: ["schools", "commute"],
  buyerPriorities: ["Garage", "Quiet street"],
  agent: { name: "Casey Nguyen", brokerage: "Harbor Homes", phone: "503-555-0150" },
  commuteAnchor: { label: "Downtown Portland" },
  homes: [
    {
      stop: 1,
      address: "12 Elm Ct, Beaverton, OR",
      whyOnList: "The quiet cul-de-sac you asked for, and the deepest garage.",
      watchFor: "Confirm the address with me; the pin didn't resolve cleanly.",
      proximity: [{ category: "commute", label: "Downtown Portland", value: "24 min" }],
    },
    {
      stop: 2,
      address: "88 Birch Way, Beaverton, OR",
      whyOnList: "Closest to the school you liked, and the newest of the three.",
      watchFor: "Smaller yard. See if it works.",
      proximity: [{ category: "commute", label: "Downtown Portland", value: "22 min" }],
    },
    {
      stop: 3,
      address: "210 Maple Loop, Beaverton, OR",
      whyOnList: "The value pick with the most flexible floor plan.",
      watchFor: "Older kitchen. Budget for an update.",
      proximity: [{ category: "commute", label: "Downtown Portland", value: "27 min" }],
    },
  ],
};

/** Single-pin sample — only one home geocoded → one pin, no route line. */
export const ONEPIN_PAYLOAD: BuyerTourPublicPayload = {
  templateVersion: 1,
  buyerName: "Theo",
  tourDate: "Sunday, Jul 20",
  priorities: ["commute", "parks"],
  buyerPriorities: ["Walkable", "Near the park"],
  brandAccent: "#0e7c73",
  commuteAnchor: { label: "Midtown", lat: 39.0997, lng: -94.5786 },
  agent: { name: "Iris Park", brokerage: "Crossroads Realty", phone: "816-555-0145" },
  homes: [
    {
      stop: 1,
      address: "3800 Walnut St, Kansas City, MO",
      photoUrl: SAMPLE_1,
      price: 459000,
      beds: 3,
      baths: 2,
      sqft: 1820,
      lat: 39.0911,
      lng: -94.5836,
      whyOnList: "Walkable to the park and the shortest commute. The one to beat.",
      watchFor: "Street parking only. See how it feels in the evening.",
      proximity: [
        { category: "commute", label: "Midtown", value: "7 min" },
        { category: "parks", label: "Theis Park", value: "0.2 mi" },
      ],
    },
    {
      stop: 2,
      address: "5410 Brookside Blvd, Kansas City, MO",
      whyOnList: "Bigger lot, a little farther out; we'll confirm the exact spot on the day.",
      watchFor: "Pin didn't resolve, so I'll send the exact address before we go.",
      proximity: [{ category: "commute", label: "Midtown", value: "12 min" }],
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
  tx: TX_PAYLOAD,
  rural: RURAL_PAYLOAD,
  nomap: NOMAP_PAYLOAD,
  onepin: ONEPIN_PAYLOAD,
  minimal: MINIMAL_PAYLOAD,
};
