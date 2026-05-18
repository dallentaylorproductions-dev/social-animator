/**
 * Open House Prep — visitor handout section definitions.
 *
 * 7 sections per Audit 1C §3 (D11 locked). Section order follows
 * Aaron's "valuable things in the front" principle — Hero / Why this
 * home / Recent area sales lead because they answer the buyer's two
 * implicit questions (is this home for me, is it fairly priced) before
 * any neighborhood context.
 *
 * Each entry describes WHAT goes in the section — Commit 5 implements
 * the actual rendering using these as the data-flow contract.
 */

export interface HandoutSectionDef {
  id: string;
  /** Section heading rendered in the handout. */
  title: string;
  /** 1-line description of what the section delivers to the visitor. */
  purpose: string;
  /** Does the handout require this section to render (vs hide-when-empty)? */
  required: boolean;
  /** Which OpenHousePrepDraft fields feed this section. */
  dataKeys: string[];
}

export const HANDOUT_SECTIONS: readonly HandoutSectionDef[] = [
  {
    id: 'hero',
    title: 'Hero',
    purpose:
      'Property photo, address, key stats, price — anchor the visitor and set the tone.',
    required: true,
    dataKeys: [
      'propertyAddress',
      'propertyCity',
      'propertyPhotoUrl',
      'listPrice',
      'beds',
      'baths',
      'squareFeet',
    ],
  },
  {
    id: 'why-this-home',
    title: 'Why this home',
    purpose:
      "Agent's positioning paragraph — what makes this home distinct in this market.",
    required: true,
    dataKeys: ['positioningNarrative'],
  },
  {
    id: 'recent-area-sales',
    title: 'Recent area sales',
    purpose:
      'Up to 4 comparable recent sales with simple context — establishes price defensibility.',
    required: false,
    dataKeys: ['comps'],
  },
  {
    id: 'neighborhood-at-a-glance',
    title: 'Neighborhood at a glance',
    purpose:
      '4–6 quick facts about the area (walk score, schools, median price, commute).',
    required: false,
    dataKeys: ['neighborhoodFacts'],
  },
  {
    id: 'market-context',
    title: 'Market context',
    purpose:
      "2–3 sentence positioning statement about the local market — agent's expert read.",
    required: false,
    dataKeys: ['marketContext'],
  },
  {
    id: 'your-agent',
    title: 'Your agent',
    purpose:
      'Bio, headshot, track record, contact CTA. Pulls from BrandSettings cross-tool.',
    required: true,
    dataKeys: [],
  },
  {
    id: 'what-to-do-next',
    title: 'What to do next',
    purpose:
      'Clear CTA — text, call, schedule a private showing. Sticky on scroll.',
    required: true,
    dataKeys: [],
  },
] as const;

export function getHandoutSectionById(
  id: string,
): HandoutSectionDef | undefined {
  return HANDOUT_SECTIONS.find((s) => s.id === id);
}
