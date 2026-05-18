/**
 * Rotating placeholder hints for "+ Add another" affordances across
 * the SIR and OH Prep wizards (Commit 7; expanded Commit 9).
 *
 * Each new slot pulls hints[index % hints.length] so suggestions stay
 * predictable per slot: Comp 1 always gets hint[0], Comp 2 always
 * gets hint[1], etc. Indexed — NOT random.
 *
 * Commit 9 expanded each array from 6 to 10-12 entries to push back
 * visible cycling past typical-use thresholds (max 4 comps per tool;
 * max 10 commitments; max 6 neighborhood facts).
 *
 * Reused across both SIR and OH Prep — no per-tool variants.
 */

export interface CompHint {
  address: string;
  soldPrice: string;
  daysOnMarket: string;
  saleToList: string;
  squareFeet: string;
  distance: string;
  notes: string;
}

export const COMP_HINTS: readonly CompHint[] = [
  {
    address: "1240 Maple Heights Dr",
    soldPrice: "$680,000",
    daysOnMarket: "12",
    saleToList: "98%",
    squareFeet: "2,840",
    distance: "0.3",
    notes: "Kitchen renovation explains the higher price.",
  },
  {
    address: "1142 Cedar Glen Way",
    soldPrice: "$652,000",
    daysOnMarket: "21",
    saleToList: "96%",
    squareFeet: "2,640",
    distance: "0.5",
    notes: "Same school district, slightly smaller lot.",
  },
  {
    address: "892 Birch Hollow Ln",
    soldPrice: "$671,000",
    daysOnMarket: "8",
    saleToList: "100%",
    squareFeet: "2,720",
    distance: "0.4",
    notes: "Recent paint and new roof; baths not updated.",
  },
  {
    address: "2034 Hawthorn Pl",
    soldPrice: "$695,000",
    daysOnMarket: "14",
    saleToList: "99%",
    squareFeet: "2,910",
    distance: "0.6",
    notes: "Premium positioning comp — water view.",
  },
  {
    address: "1518 Willow Ridge Ct",
    soldPrice: "$640,000",
    daysOnMarket: "32",
    saleToList: "94%",
    squareFeet: "2,580",
    distance: "0.7",
    notes: "Trend marker — listed Jan, closed March; market was cooler.",
  },
  {
    address: "3201 Pine Meadow Ln",
    soldPrice: "$705,000",
    daysOnMarket: "5",
    saleToList: "102%",
    squareFeet: "2,860",
    distance: "0.8",
    notes: "Multiple-offer scenario — buyer waived inspection.",
  },
  {
    address: "847 Sycamore Crossing",
    soldPrice: "$635,000",
    daysOnMarket: "45",
    saleToList: "93%",
    squareFeet: "2,710",
    distance: "0.9",
    notes: "Older comp — included for trend, not direct comparison.",
  },
  {
    address: "1909 Aspen Trail",
    soldPrice: "$688,000",
    daysOnMarket: "9",
    saleToList: "99%",
    squareFeet: "2,800",
    distance: "0.5",
    notes: "Closest match on age, layout, and finishes.",
  },
  {
    address: "412 Riverbend Dr",
    soldPrice: "$725,000",
    daysOnMarket: "18",
    saleToList: "98%",
    squareFeet: "2,990",
    distance: "1.1",
    notes: "Higher comp — bigger lot and finished basement.",
  },
  {
    address: "2156 Spruce Hill Rd",
    soldPrice: "$615,000",
    daysOnMarket: "11",
    saleToList: "97%",
    squareFeet: "2,510",
    distance: "0.6",
    notes: "Smaller floorplan; helps anchor the lower bound.",
  },
  {
    address: "775 Magnolia Ct",
    soldPrice: "$662,000",
    daysOnMarket: "16",
    saleToList: "97%",
    squareFeet: "2,690",
    distance: "0.4",
    notes: "Similar school zone; deck and patio updated last year.",
  },
  {
    address: "1380 Elderwood Pl",
    soldPrice: "$679,000",
    daysOnMarket: "7",
    saleToList: "100%",
    squareFeet: "2,770",
    distance: "0.3",
    notes: "Almost a twin — same year, same builder.",
  },
] as const;

export const COMMITMENT_HINTS: readonly string[] = [
  "Syndicate the listing to 50+ sites within 24 hours of going live",
  "Handle all open house logistics and follow up with every attendee",
  "Provide weekly market updates with showing feedback",
  "Coordinate professional photography, drone, and floor plan",
  "Negotiate offers to maximize your net proceeds, not just the sale price",
  "Walk you through every disclosure document before signing",
  "Pre-screen all buyer agents for serious offers only",
  "Set up a private listing portal with weekly view stats",
  "Stage the home with consulted professional input — at no cost to you",
  "Manage all sign installation, lockbox setup, and showing access",
  "Provide a market re-evaluation at day 14 if showings underperform",
  "Handle all post-acceptance coordination through closing",
] as const;

export const ASK_HINTS: readonly string[] = [
  "Access for showings on short notice — texts work for confirmation",
  "Disclosure paperwork (mandatory state forms) ready by listing day",
  "Approval to use professional photos, drone footage, and floor plan",
  "A heads-up if your timeline or motivation changes",
  "Decision on staging by Friday so the photographer can shoot Monday",
  "Spare key or keypad code for the lockbox",
  "Pets cleared during showings (or kennel arrangement in place)",
  "Pre-listing repair items completed (we'll review the list together)",
  "Yard sign placement approval for the front of the property",
  "Permission to share with my agent network 24 hours before MLS go-live",
] as const;

export interface NeighborhoodFactHint {
  label: string;
  value: string;
}

export const NEIGHBORHOOD_FACT_HINTS: readonly NeighborhoodFactHint[] = [
  { label: "Walk score", value: "82 / 100" },
  { label: "Median home value", value: "$680,000" },
  { label: "Average days on market", value: "14 days" },
  {
    label: "Schools",
    value: "Mary Walker Elementary (8/10), Olympia HS (9/10)",
  },
  { label: "Commute to downtown", value: "12 min off-peak, 22 min rush hour" },
  { label: "Property tax rate", value: "1.05%" },
  { label: "Owner-occupied", value: "78%" },
  { label: "New construction permits (last 12 mo)", value: "24" },
  { label: "Closest grocery", value: "0.4 miles" },
  { label: "HOA dues", value: "$145 / month" },
] as const;

/**
 * Pick a hint at the given slot index. Wraps via modulo so callers
 * don't need to clamp.
 */
export function getHintByIndex<T>(hints: readonly T[], index: number): T {
  return hints[index % hints.length];
}
