import { getAnthropicClient, COMP_IMPORT_MODEL } from './anthropic-client';

/**
 * Review-draft helper (B0a — second AI plug-point in the repo).
 *
 * Runs Haiku over the agent's OWN reviews (the ones already entered in
 * Settings, plus any they paste in) and returns editable suggestions for a
 * short bio, a tagline, and a reviews-block headline. The agent applies/edits
 * the output — it is never auto-written.
 *
 * Reuses the comp-import infra verbatim in pattern: same client + model, an
 * independent PROMPT_VERSION folded into the KV cache key, a 12s hard timeout
 * inside the route budget, one retry on malformed JSON, and an E2E_TESTING=1
 * offline bypass returning a deterministic fixture.
 *
 * COMPLIANCE (standing landmine — see memory `sep-path-b-viability`): this
 * operates ONLY on review text the route hands it. It NEVER fetches or scrapes
 * a reviews URL. No network call here except the model call itself.
 *
 * PRIVACY: the route hashes the input for the cache key and caches ONLY the
 * derived suggestions — never the raw review text (same contract as
 * comp-import, which caches the mapping and discards the upload).
 */

/** The three editable suggestions returned for one set of reviews. */
export interface ReviewDraftSuggestions {
  bio: string;
  tagline: string;
  reviewsHeadline: string;
}

interface DraftResult {
  suggestions: ReviewDraftSuggestions;
  latencyMs: number;
  retried: boolean;
  /** 'live' if the model was called; 'fixture' for E2E bypass; 'cache' set by caller after cache lookup. */
  source: 'live' | 'fixture';
}

export const REVIEW_DRAFT_MODEL = COMP_IMPORT_MODEL;

const TIMEOUT_MS = 12_000;

/**
 * Bump whenever the prompt template OR the output contract changes. The route
 * folds this into the KV cache key (via buildReviewDraftCacheKey) so a prompt
 * change auto-invalidates every prior cached suggestion — no manual flush.
 * Independent of comp-import's PROMPT_VERSION.
 *
 * v1 → original draft-from-reviews prompt.
 */
export const PROMPT_VERSION = 1;

/** KV cache key for a review-text hash, versioned by PROMPT_VERSION. */
export function buildReviewDraftCacheKey(inputHash: string): string {
  return `review_draft_cache:v${PROMPT_VERSION}:${inputHash}`;
}

/**
 * E2E / offline bypass fixture. Production never sets E2E_TESTING; this also
 * covers dev environments without an API key that are exercising the UI flow.
 * Deterministic so the route spec can assert exact values.
 */
const REVIEW_DRAFT_FIXTURE: ReviewDraftSuggestions = {
  bio: 'Known for steady communication and a calm hand through every offer — sellers describe a process that never felt rushed.',
  tagline: 'Plain-English guidance, start to close.',
  reviewsHeadline: 'What sellers say',
};

export async function draftFromReviewsWithAI(reviewsText: string): Promise<DraftResult> {
  // E2E bypass — also handles dev environments where the agent hasn't
  // configured an API key yet but is exercising the UI flow.
  if (process.env.E2E_TESTING === '1') {
    return {
      suggestions: REVIEW_DRAFT_FIXTURE,
      latencyMs: 0,
      retried: false,
      source: 'fixture',
    };
  }

  const start = Date.now();
  const prompt = buildReviewDraftPrompt(reviewsText);

  let raw = await callModel(prompt);
  let suggestions = tryParse(raw);
  let retried = false;
  if (!suggestions) {
    retried = true;
    const retryPrompt = `${prompt}\n\nYour previous response was not valid JSON. Return JSON only, no markdown, no prose.`;
    raw = await callModel(retryPrompt);
    suggestions = tryParse(raw);
  }

  if (!suggestions) {
    throw new Error('ai-malformed-json');
  }

  return {
    suggestions,
    latencyMs: Date.now() - start,
    retried,
    source: 'live',
  };
}

async function callModel(prompt: string): Promise<string> {
  const client = getAnthropicClient();
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const result = await client.messages.create(
      {
        model: REVIEW_DRAFT_MODEL,
        max_tokens: 1024,
        messages: [{ role: 'user', content: prompt }],
      },
      { signal: controller.signal },
    );
    const block = result.content[0];
    if (block && block.type === 'text') return block.text;
    return '';
  } finally {
    clearTimeout(t);
  }
}

export function buildReviewDraftPrompt(reviewsText: string): string {
  return `You are helping a real-estate agent turn their own client reviews into three short, editable pieces of profile copy. The agent will review and edit whatever you suggest before anything is published.

Here are the agent's reviews (verbatim, entered by the agent):
"""
${reviewsText}
"""

Write three things, grounded ONLY in what these reviews actually say. Do not invent facts, awards, numbers, or specifics that are not supported by the reviews. Keep the tone plain and credible — not salesy.

1. bio — one to two sentences (max ~240 characters), written in third person, describing how this agent works based on the recurring themes in the reviews.
2. tagline — a short phrase (max ~60 characters) capturing what sellers value most.
3. reviewsHeadline — a short heading for a reviews section (2 to 4 words, e.g. "What sellers say").

Return ONLY a JSON object with this exact shape, no markdown, no prose:
{
  "bio": "<string>",
  "tagline": "<string>",
  "reviewsHeadline": "<string>"
}`;
}

function tryParse(raw: string): ReviewDraftSuggestions | null {
  if (!raw) return null;
  // Models occasionally wrap JSON in markdown fences despite instructions.
  const stripped = raw
    .trim()
    .replace(/^```(?:json)?\s*\n?/, '')
    .replace(/\n?```$/, '');
  try {
    const obj = JSON.parse(stripped) as unknown;
    if (!isSuggestions(obj)) return null;
    return {
      bio: obj.bio.trim(),
      tagline: obj.tagline.trim(),
      reviewsHeadline: obj.reviewsHeadline.trim(),
    };
  } catch {
    return null;
  }
}

function isSuggestions(o: unknown): o is ReviewDraftSuggestions {
  if (!o || typeof o !== 'object') return false;
  const m = o as Record<string, unknown>;
  return (
    typeof m.bio === 'string' &&
    typeof m.tagline === 'string' &&
    typeof m.reviewsHeadline === 'string'
  );
}
