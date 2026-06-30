/**
 * Buyer Tour Brief — render fixtures (BUYER_TOUR_BRIEF).
 *
 * Hand-populated public payloads for the dev preview route + the e2e render/
 * interaction specs, without round-tripping through a real publish + auth + KV.
 * Every value is FACTUAL / agent-authored — these double as the corpus the Fair
 * Housing guard scans, so they must stay clean (no qualitative school/neighborhood
 * claims) on purpose.
 */

import type { BuyerTourPublicPayload } from "../public-payload";

/** A rich, fully-populated tour: 4 homes, all 5 layers, geocoded near Tacoma, WA. */
export const FULL_PAYLOAD: BuyerTourPublicPayload = {
  templateVersion: 1,
  buyerName: "Jordan",
  tourDate: "Saturday, July 12",
  meetingPoint: "Starbucks on 6th Ave, 9:30am",
  agentNote:
    "I lined these up so we move north to south and end near your office. " +
    "Each one fits something you told me mattered. Notes below on what to look at.",
  priorities: ["schools", "commute", "parks", "coffee", "grocery"],
  // A non-default accent so the preview + e2e prove brandAccent threads through the
  // tour-thread set (pins/route/CTA/step numbers/why-bar) without tinting the
  // fixed category-color legend.
  brandAccent: "#7c3aed",
  commuteAnchor: { label: "JBLM main gate", lat: 47.0879, lng: -122.5807 },
  agent: {
    name: "Alex Rivera",
    brokerage: "Cascade & Sound Realty",
    phone: "253-555-0142",
    email: "alex@cascadesound.example",
    photoUrl: "https://images.example.com/agent/alex.jpg",
    schedulingUrl: "https://cal.com/alex-rivera/tour",
  },
  homes: [
    {
      stop: 1,
      address: "1420 N Cedar St, Tacoma, WA",
      photoUrl: "https://images.example.com/homes/cedar.jpg",
      price: 615000,
      beds: 3,
      baths: 2,
      sqft: 1840,
      lat: 47.2712,
      lng: -122.4901,
      whyOnList:
        "Single level like you wanted, and the kitchen was redone last year so it's move-in ready.",
      watchFor: "The driveway is steep. Check how the garage feels backing out.",
      proximity: [
        { category: "schools", label: "Cedar Elementary", value: "0.3 mi" },
        { category: "commute", label: "JBLM main gate", value: "22 min drive" },
        { category: "parks", label: "Wright Park", value: "0.6 mi" },
        { category: "coffee", label: "Bluebeard Coffee", value: "0.2 mi" },
        { category: "grocery", label: "Stadium Thriftway", value: "0.5 mi" },
      ],
    },
    {
      stop: 2,
      address: "905 S Ainsworth Ave, Tacoma, WA",
      photoUrl: "https://images.example.com/homes/ainsworth.jpg",
      price: 549000,
      beds: 3,
      baths: 1,
      sqft: 1560,
      lat: 47.2489,
      lng: -122.4585,
      whyOnList:
        "Biggest yard on the list and the price leaves room for the bathroom update we talked about.",
      watchFor: "One bath only. Picture how the morning routine would flow.",
      proximity: [
        { category: "schools", label: "Lincoln High School", value: "0.4 mi" },
        { category: "commute", label: "JBLM main gate", value: "18 min drive" },
        { category: "grocery", label: "Lincoln District Market", value: "0.3 mi" },
      ],
    },
    {
      stop: 3,
      address: "3110 N 8th St, Tacoma, WA",
      price: 689000,
      beds: 4,
      baths: 2,
      sqft: 2210,
      lat: 47.2668,
      lng: -122.5121,
      whyOnList:
        "The extra bedroom doubles as the office you need, and it's the closest to your sister.",
      watchFor: "Busy street out front. Listen for road noise in the front rooms.",
      proximity: [
        { category: "schools", label: "Sherman Elementary", value: "0.5 mi" },
        { category: "commute", label: "JBLM main gate", value: "25 min drive" },
        { category: "parks", label: "Puget Park", value: "0.4 mi" },
        { category: "coffee", label: "Valhalla Coffee", value: "0.3 mi" },
      ],
    },
    {
      stop: 4,
      address: "612 S Proctor St, Tacoma, WA",
      photoUrl: "https://images.example.com/homes/proctor.jpg",
      price: 725000,
      beds: 4,
      baths: 3,
      sqft: 2480,
      lat: 47.2601,
      lng: -122.4789,
      whyOnList:
        "Walk-to-everything block in Proctor, and it's the only one with a finished basement.",
      watchFor: "Top of budget. We'd want the inspection to come back clean.",
      proximity: [
        { category: "schools", label: "Washington Elementary", value: "0.2 mi" },
        { category: "commute", label: "JBLM main gate", value: "27 min drive" },
        { category: "parks", label: "Proctor Playground", value: "0.3 mi" },
        { category: "coffee", label: "Pomodoro", value: "0.1 mi" },
        { category: "grocery", label: "Metropolitan Market", value: "0.2 mi" },
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
  agent: { name: "Alex Rivera", phone: "253-555-0142" },
  homes: [
    {
      stop: 1,
      address: "100 Main St, Olympia, WA",
      whyOnList: "Closest to your price ceiling with the garage you asked for.",
      watchFor: "Roof age. Ask the listing agent when it was last done.",
      proximity: [{ category: "commute", label: "Capitol campus", value: "9 min drive" }],
    },
    {
      stop: 2,
      address: "240 Legion Way, Olympia, WA",
      whyOnList: "Walkable to downtown, which you said you'd trade yard space for.",
      watchFor: "Small kitchen. See if the layout works for you.",
      proximity: [{ category: "commute", label: "Capitol campus", value: "6 min drive" }],
    },
    {
      stop: 3,
      address: "55 Boundary St, Olympia, WA",
      whyOnList: "Newest build on the list, lowest maintenance to start.",
      watchFor: "HOA dues. We'll confirm what they cover.",
      proximity: [{ category: "commute", label: "Capitol campus", value: "14 min drive" }],
    },
  ],
};

export const FIXTURES: Record<string, BuyerTourPublicPayload> = {
  full: FULL_PAYLOAD,
  minimal: MINIMAL_PAYLOAD,
};
