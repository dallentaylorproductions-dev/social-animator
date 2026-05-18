/**
 * Open House Prep — conversion-prompts library.
 *
 * 6 scripted prompts the agent uses to pivot interested visitors to a
 * next step (text follow-up, similar-property tour, lender intro,
 * private showing, qualifying conversation). Each prompt is verbatim
 * (NOT a paraphrase). 2 universal defaults pre-selected.
 *
 * Constraints honored: no fabricated stats, no template placeholders,
 * no competitor brand references.
 */

export interface ConversionPrompt {
  id: string;
  /** When in the conversation to deploy this prompt. */
  context: string;
  /** The actual line. */
  prompt: string;
  isDefaultSelected?: boolean;
}

export const CONVERSION_PROMPTS: ConversionPrompt[] = [
  {
    id: 'send-market-report',
    context: 'Visitor seems engaged with comps',
    prompt:
      'Would you like the full market report for this area? I can text it to you.',
    isDefaultSelected: true,
  },
  {
    id: 'similar-homes',
    context: 'Visitor early in search',
    prompt:
      "If you're early in your search, I can send you a few similar homes that might be worth a look.",
    isDefaultSelected: true,
  },
  {
    id: 'lender-intro',
    context: 'Visitor asks about financing',
    prompt:
      'Have you been working with a lender yet? I can connect you with a couple I trust who do good work in this area.',
  },
  {
    id: 'private-showing',
    context: 'Visitor wants a second look',
    prompt:
      "If you'd want to see this again with your partner or family, just let me know and we'll set up a private showing.",
  },
  {
    id: 'timeline-question',
    context: 'Qualifying interest',
    prompt:
      "Out of curiosity — what would your timeline look like if you found the right place?",
  },
  {
    id: 'budget-conversation',
    context: 'Qualifying budget',
    prompt:
      "If you want to talk through what your budget gets you in this area, I'm happy to do that over coffee.",
  },
];

export const DEFAULT_SELECTED_PROMPT_IDS: readonly string[] = CONVERSION_PROMPTS
  .filter((p) => p.isDefaultSelected)
  .map((p) => p.id);

export function getPromptById(id: string): ConversionPrompt | undefined {
  return CONVERSION_PROMPTS.find((p) => p.id === id);
}
