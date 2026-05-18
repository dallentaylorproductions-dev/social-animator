/**
 * Rotating placeholder hints for "+ Add another" affordances across
 * the SIR and OH Prep wizards (Commit 7).
 *
 * Each new slot pulls hints[index % hints.length] so suggestions stay
 * predictable per slot: Comp 1 always gets hint[0], Comp 2 always
 * gets hint[1], etc. Indexed — NOT random. Predictability lets agents
 * mentally fill in repeated slots without re-reading prompts.
 *
 * Reused across both SIR and OH Prep — no per-tool variants. If the
 * hint sets need to diverge in v1.5+, split into per-tool files then.
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
    address: '1240 Maple Heights Dr',
    soldPrice: '$680,000',
    daysOnMarket: '12',
    saleToList: '98%',
    squareFeet: '2,840',
    distance: '0.3',
    notes: 'Kitchen renovation explains the higher price.',
  },
  {
    address: '1142 Cedar Glen Way',
    soldPrice: '$652,000',
    daysOnMarket: '21',
    saleToList: '96%',
    squareFeet: '2,640',
    distance: '0.5',
    notes: 'Same school district, slightly smaller lot.',
  },
  {
    address: '892 Birch Hollow Ln',
    soldPrice: '$671,000',
    daysOnMarket: '8',
    saleToList: '100%',
    squareFeet: '2,720',
    distance: '0.4',
    notes: 'Recent paint and new roof; baths not updated.',
  },
  {
    address: '2034 Hawthorn Pl',
    soldPrice: '$695,000',
    daysOnMarket: '14',
    saleToList: '99%',
    squareFeet: '2,910',
    distance: '0.6',
    notes: 'Premium positioning comp — water view.',
  },
] as const;

export const COMMITMENT_HINTS: readonly string[] = [
  'Syndicate the listing to 50+ sites within 24 hours of going live',
  'Handle all open house logistics and follow up with every attendee',
  'Provide weekly market updates with showing feedback',
  'Coordinate professional photography, drone, and floor plan',
  'Negotiate offers to maximize your net proceeds, not just the sale price',
  'Walk you through every disclosure document before signing',
] as const;

export const ASK_HINTS: readonly string[] = [
  'Access for showings on short notice (texts work)',
  'Disclosure paperwork ready to share',
  'Approval to use professional photos and drone footage',
  'A heads-up if your timeline changes',
  'Decision on staging by Friday',
] as const;

export interface NeighborhoodFactHint {
  label: string;
  value: string;
}

export const NEIGHBORHOOD_FACT_HINTS: readonly NeighborhoodFactHint[] = [
  { label: 'Walk score', value: '82 / 100' },
  { label: 'Median home value', value: '$680,000' },
  { label: 'Average days on market', value: '14 days' },
  { label: 'Schools', value: 'Mary Walker Elementary (8/10), Olympia HS (9/10)' },
  { label: 'Commute to downtown', value: '12 min off-peak, 22 min rush hour' },
  { label: 'Property tax rate', value: '1.05%' },
] as const;

/**
 * Pick a hint at the given slot index. Wraps via modulo so callers
 * don't need to clamp.
 */
export function getHintByIndex<T>(hints: readonly T[], index: number): T {
  return hints[index % hints.length];
}
