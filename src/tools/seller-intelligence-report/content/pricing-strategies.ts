export interface PricingStrategy {
  id: string;
  name: string;
  oneLineDescription: string;     // shown in the form's radio picker
  detailedDescription: string;    // shown in the PDF + form's expanded view
  talkingPoints: string[];        // 2-3 bullets the agent can reference
  bestFor: string;                // when this framework applies
}

export const PRICING_STRATEGIES: PricingStrategy[] = [
  {
    id: 'strategic-quick-sale',
    name: 'Strategic Pricing for Quick Sale',
    oneLineDescription: 'Price 2–3% under comps to drive multiple offers within 7–14 days.',
    detailedDescription:
      "Pricing slightly below comparable sales creates competitive tension among buyers. The goal is multiple offers within the first 7–14 days, which lets the seller choose not just the highest price but the strongest terms (financial qualification, contingencies, closing timeline).",
    talkingPoints: [
      'Multiple-offer scenarios let us select the strongest buyer, not just the highest bid.',
      'The first 14 days draw the most online attention; we use that window deliberately.',
      'Lowest list price + strongest marketing often nets a higher final sale price than pricing-to-asking.',
    ],
    bestFor:
      'Strong buyer demand, healthy comp activity in the last 90 days, seller comfortable with a fast process.',
  },
  {
    id: 'market-aligned',
    name: 'Market-Aligned Pricing',
    oneLineDescription: 'Price at the median of recent comparable sales.',
    detailedDescription:
      "Set the price at the median of recent comps adjusted for your home's specifics. This is the most defensible price for appraisal and the most neutral starting point — neither aggressive nor passive.",
    talkingPoints: [
      "Comp-aligned pricing reduces appraisal risk for the buyer's lender.",
      'Predictable timeline — typical days-on-market matches the local average.',
      "Easy to defend if questioned by a buyer's agent or appraiser.",
    ],
    bestFor:
      'Balanced market, tight comp set, seller wants steady predictable progress over speed or premium pricing.',
  },
  {
    id: 'premium-positioning',
    name: 'Premium Positioning',
    oneLineDescription: 'Price 3–5% above comps based on a specific differentiator (renovation, view, lot, etc.).',
    detailedDescription:
      "Justify a premium with a concrete differentiator the buyer can see: recent kitchen renovation, water view, larger lot, recent roof or systems upgrades. The premium is anchored to the differentiator — not aspirational.",
    talkingPoints: [
      'The premium is anchored to a verifiable feature, not speculation.',
      'Marketing leads with the differentiator so the buyer understands the price gap.',
      "If the differentiator doesn't resonate in two weeks of showings, we adjust quickly.",
    ],
    bestFor:
      'Recently improved home with a concrete, marketable differentiator; seller has time to test market reaction.',
  },
  {
    id: 'test-then-adjust',
    name: 'Test Then Adjust',
    oneLineDescription: 'Price 5–10% above comps with a clear 10–14 day re-evaluation window.',
    detailedDescription:
      "Higher initial price to test whether the market supports a premium. Critical element: a pre-agreed adjustment date (10–14 days in) where the seller commits to reducing if showings or offers haven't materialized. Without the adjustment commitment, this becomes an overpriced listing that sits.",
    talkingPoints: [
      'We agree up front on the date and the size of the adjustment.',
      'The first two weeks tell us whether the market supports the premium.',
      'Discipline on the adjustment date is what separates this from passive overpricing.',
    ],
    bestFor:
      'Seller insists on testing a higher price, comp set has gaps, agent has commitment from seller to adjust if the test fails.',
  },
];

export function getPricingStrategyById(id: string): PricingStrategy | undefined {
  return PRICING_STRATEGIES.find((strategy) => strategy.id === id);
}
