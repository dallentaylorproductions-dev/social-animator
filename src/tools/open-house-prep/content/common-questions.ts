/**
 * Open House Prep — common visitor questions library.
 *
 * 15 entries across 5 categories. 4 universal defaults pre-selected.
 * Each entry's response is verbatim (NOT a paraphrase).
 *
 * Constraints applied per Audit 1C subagent review:
 *   - Seller motivation category is DEFLECTION-ONLY (agent fiduciary
 *     duty to seller). Responses redirect to property facts rather
 *     than disclosing seller circumstances.
 *   - HOA responses point visitors to the HOA's own disclosures
 *     instead of asserting jurisdiction-variable rules.
 *   - No competitor brand references.
 *   - Directional language ("typically", "generally") instead of
 *     fabricated statistics.
 *   - No bracketed template placeholders — entries are self-contained.
 *   - Post-NAR-settlement-safe: no commission/buyer-agent framing.
 */

export interface CommonQuestion {
  id: string;
  category: string;
  /** The visitor's question, agent-facing label form. */
  trigger: string;
  /** Verbatim agent response. */
  response: string;
  isDefaultSelected?: boolean;
}

export const COMMON_QUESTIONS: CommonQuestion[] = [
  // ---------- Schools / Commute ----------
  {
    id: 'school-district',
    category: 'Schools / Commute',
    trigger: '"What\'s the school district like?"',
    response:
      "The local district has good resources, but the right answer depends on what matters to your family. I'd recommend looking at the district's own data and, if you can, walking through the schools your kids would attend. I can point you to those resources.",
    isDefaultSelected: true,
  },
  {
    id: 'commute',
    category: 'Schools / Commute',
    trigger: '"What\'s the commute like?"',
    response:
      "It depends where you're heading. In typical traffic, getting to the nearby commercial center takes about what you'd expect for this area. I can give you a more specific read once I know where you're commuting to.",
  },
  {
    id: 'public-transit',
    category: 'Schools / Commute',
    trigger: '"Is there public transportation?"',
    response:
      "There's transit access in the broader area, though most people in this neighborhood drive. I can show you the closest options if that matters for your commute.",
  },

  // ---------- Property / Renovations ----------
  {
    id: 'recent-renovations',
    category: 'Property / Renovations',
    trigger: '"What\'s been renovated recently?"',
    response:
      "The seller has put real work into this home — I can walk you through the specific updates and when they were done. The disclosures will have the full timeline.",
    isDefaultSelected: true,
  },
  {
    id: 'systems-age',
    category: 'Property / Renovations',
    trigger: '"How old is the roof / HVAC / electrical?"',
    response:
      "Those details are in the seller's disclosures — I have copies here if you'd like to look at them. I can also walk you through what I know about each system.",
  },
  {
    id: 'known-issues',
    category: 'Property / Renovations',
    trigger: '"Are there any known issues?"',
    response:
      "Everything material is captured in the seller's disclosures, which I have available. If you decide to move forward, the inspection process will surface anything else worth knowing.",
  },
  {
    id: 'inspection-report',
    category: 'Property / Renovations',
    trigger: '"Has there been an inspection?"',
    response:
      "If the seller had a pre-listing inspection done, the report is in the disclosures. Either way, you'd run your own inspection if you move forward — that's your protection.",
  },

  // ---------- Market / Pricing ----------
  {
    id: 'compare-to-recent-sales',
    category: 'Market / Pricing',
    trigger: '"How does this compare to other recent sales?"',
    response:
      "I have the recent area sales data right here. The short answer: the price reflects what comparable homes have sold for in the last 90 days. I'm happy to walk through the comparison with you.",
    isDefaultSelected: true,
  },
  {
    id: 'price-history',
    category: 'Market / Pricing',
    trigger: '"Has the price changed since it was listed?"',
    response:
      "I'll be straight with you on the pricing history. If you want context on why the home is priced where it is now, the comp data tells the story.",
  },
  {
    id: 'other-nearby-homes',
    category: 'Market / Pricing',
    trigger: '"What other homes are available nearby?"',
    response:
      "There are a handful of comparable homes on the market — I can put together a short list and text it to you, so you can compare side by side.",
  },

  // ---------- Seller motivation (DEFLECTION-ONLY) ----------
  {
    id: 'why-selling',
    category: 'Seller motivation',
    trigger: '"Why are they selling?"',
    response:
      "I'm not in a position to share that — it's the seller's private business. What I can tell you is what's happening with the home itself and how it compares to what's available.",
    isDefaultSelected: true,
  },
  {
    id: 'seller-motivation',
    category: 'Seller motivation',
    trigger: '"Is the seller motivated? Will they negotiate?"',
    response:
      "Every offer gets reviewed. What I'd suggest is putting forward what makes sense for you based on the home's value and where you are financially — that's the right starting point.",
  },

  // ---------- HOA / Logistics ----------
  {
    id: 'hoa',
    category: 'HOA / Logistics',
    trigger: '"What\'s the HOA situation?"',
    response:
      "I'd point you to the HOA's own disclosures for the current dues, rules, and reserve status — they'll have the most accurate information. I can flag the HOA documents in the disclosure packet.",
  },
  {
    id: 'property-taxes',
    category: 'HOA / Logistics',
    trigger: '"What are the property taxes?"',
    response:
      "The current tax assessment is in the disclosures — I can pull that for you. Keep in mind that property tax reassesses on sale in most cases, so your tax basis would be based on the sale price.",
  },
  {
    id: 'seller-timeline',
    category: 'HOA / Logistics',
    trigger: '"When is the seller hoping to close?"',
    response:
      "There's some flexibility on timing. If you write an offer, you'd propose a closing timeline that works for you, and we'd see whether it works for the seller side.",
  },
];

/**
 * IDs pre-checked on a fresh draft. 4 universal defaults span the
 * most common visitor question categories.
 */
export const DEFAULT_SELECTED_QUESTION_IDS: readonly string[] = COMMON_QUESTIONS
  .filter((q) => q.isDefaultSelected)
  .map((q) => q.id);

export function getQuestionById(id: string): CommonQuestion | undefined {
  return COMMON_QUESTIONS.find((q) => q.id === id);
}
