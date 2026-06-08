import { test, expect } from '@playwright/test';
import {
  buildReviewDraftCacheKey,
  PROMPT_VERSION,
} from '../src/lib/ai/review-draft-mapper';
import {
  dailyReviewDraftCap,
  DAILY_REVIEW_DRAFT_CAP_FALLBACK,
} from '../src/lib/entitlements/usage-caps';

/**
 * /api/draft-from-reviews — server contract (B0a).
 *
 * Mirrors the comp-import suite's conventions: pure-unit assertions on the
 * shared helpers (cache key carries PROMPT_VERSION, per-mode caps) + HTTP
 * boundary assertions for the calm failure modes via NODE_ENV-gated force
 * headers (there is no KV in local/CI, so the live counters are skipped and
 * the 429 copy is asserted through the test-force headers instead).
 *
 * The AI call is fixture-mode under E2E_TESTING=1 — draftFromReviewsWithAI
 * short-circuits to a deterministic fixture with no network call. Offline,
 * deterministic, free.
 */

const SAMPLE_REVIEWS = [
  {
    body: 'She walked us through every offer in plain English and never made us feel rushed.',
    attributionName: 'The Halloran family',
    attributionYear: '2025',
  },
  {
    body: 'Sold above asking in a week. Communication was constant and calm.',
    attributionName: 'The Ruiz family',
  },
];

test.describe('review-draft — shared helpers (pure unit)', () => {
  test('cache key folds in PROMPT_VERSION', () => {
    const key = buildReviewDraftCacheKey('abc123');
    expect(key).toBe(`review_draft_cache:v${PROMPT_VERSION}:abc123`);
    expect(key).toContain(`v${PROMPT_VERSION}`);
  });

  test('daily cap resolves per access mode and falls back', () => {
    expect(dailyReviewDraftCap('internal-test')).toBe(100);
    expect(dailyReviewDraftCap('team-invite')).toBe(30);
    expect(dailyReviewDraftCap('trial')).toBe(10);
    expect(dailyReviewDraftCap('paid')).toBe(20);
    expect(dailyReviewDraftCap('something-unrecognized')).toBe(
      DAILY_REVIEW_DRAFT_CAP_FALLBACK,
    );
    expect(dailyReviewDraftCap(undefined)).toBe(10);
  });
});

test.describe('review-draft — happy path (E2E fixture)', () => {
  test('returns editable bio / tagline / reviews-headline suggestions', async ({
    request,
  }) => {
    const res = await request.post('/api/draft-from-reviews?testTier=pro', {
      data: { reviews: SAMPLE_REVIEWS, pastedReviews: '' },
    });
    expect(res.ok()).toBe(true);
    const data = await res.json();
    expect(data.ok).toBe(true);
    expect(typeof data.suggestions.bio).toBe('string');
    expect(typeof data.suggestions.tagline).toBe('string');
    expect(typeof data.suggestions.reviewsHeadline).toBe('string');
    expect(data.suggestions.bio.length).toBeGreaterThan(0);
    // E2E bypass → fixture source, no live model call.
    expect(data.ai.source).toBe('fixture');
  });

  test('a paste-only request (no entered reviews) still drafts', async ({
    request,
  }) => {
    const res = await request.post('/api/draft-from-reviews?testTier=pro', {
      data: {
        reviews: [],
        pastedReviews: 'Best agent we have ever worked with. Honest and responsive.',
      },
    });
    expect(res.ok()).toBe(true);
    const data = await res.json();
    expect(data.ok).toBe(true);
  });
});

test.describe('review-draft — calm failure modes', () => {
  test('feature-disabled (test header) → 503 with manual-fallback copy', async ({
    request,
  }) => {
    // B0b kill switch (parity with comp-import). The header simulates
    // REVIEW_DRAFT_ENABLED=false for one request; the route returns 503 with
    // calm copy that points the agent at writing the fields by hand. Asserted
    // BEFORE auth/tier so it short-circuits even on a Pro tier.
    const res = await request.post('/api/draft-from-reviews?testTier=pro', {
      headers: { 'X-Review-Draft-Test-Disable': '1' },
      data: { reviews: SAMPLE_REVIEWS },
    });
    expect(res.status()).toBe(503);
    const data = await res.json();
    expect(data.ok).toBe(false);
    expect(data.code).toBe('feature-disabled');
    expect(data.message).toMatch(/by hand/i);
  });

  test('no reviews and no paste → 400 no-reviews', async ({ request }) => {
    const res = await request.post('/api/draft-from-reviews?testTier=pro', {
      data: { reviews: [], pastedReviews: '' },
    });
    expect(res.status()).toBe(400);
    const data = await res.json();
    expect(data.ok).toBe(false);
    expect(data.code).toBe('no-reviews');
  });

  test('testTier=base → 403 upgrade-required calm copy', async ({ request }) => {
    const res = await request.post('/api/draft-from-reviews?testTier=base', {
      data: { reviews: SAMPLE_REVIEWS },
    });
    expect(res.status()).toBe(403);
    const data = await res.json();
    expect(data.ok).toBe(false);
    expect(data.code).toBe('upgrade-required');
    // Truthful fallback — offers the self-serve path, no hype.
    expect(data.message).toContain('write these yourself');
  });

  test('forced rate limit → 429 calm copy', async ({ request }) => {
    const res = await request.post('/api/draft-from-reviews?testTier=pro', {
      headers: { 'X-Review-Draft-Test-Force-Rate-Limit': '1' },
      data: { reviews: SAMPLE_REVIEWS },
    });
    expect(res.status()).toBe(429);
    const data = await res.json();
    expect(data.ok).toBe(false);
    expect(data.code).toBe('rate-limited');
  });

  test('forced daily cap → 429 calm copy', async ({ request }) => {
    const res = await request.post('/api/draft-from-reviews?testTier=pro', {
      headers: { 'X-Review-Draft-Test-Force-Daily-Cap': '1' },
      data: { reviews: SAMPLE_REVIEWS },
    });
    expect(res.status()).toBe(429);
    const data = await res.json();
    expect(data.ok).toBe(false);
    expect(data.code).toBe('daily-cap-hit');
  });
});

test.describe('review-draft — entitlements/me feature flag exposure', () => {
  test('GET /api/entitlements/me surfaces reviewDraftEnabled', async ({
    request,
  }) => {
    // The Settings "Draft from your reviews" affordance hides client-side off
    // this flag (parity with compImportEnabled). The suite runs with
    // REVIEW_DRAFT_ENABLED=true (playwright.config.ts), so it reads true here.
    const res = await request.get('/api/entitlements/me');
    expect(res.ok()).toBe(true);
    const data = await res.json();
    expect(data.ok).toBe(true);
    expect(data.features?.reviewDraftEnabled).toBe(true);
  });
});
