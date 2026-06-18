import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { buildOnboardingStateAPayload } from '../src/lib/onboarding/state-a-payload';
import {
  EMPTY_DRAFT,
  type SellerPresentationDraft,
} from '../src/tools/seller-presentation/engine/types';
import type { BrandSettings } from '../src/lib/brand';

/**
 * ONBOARDING_FIRST_RUN_V2 · phase 3c - the seller-name fallback (locked Q2).
 *
 * There is NO reliable owner-name inference source (RentCast drops owner data),
 * so the locked behaviour is: the hero opens with a NEUTRAL byline, and the
 * name is set ONLY when the agent optionally taps "who's this for?" and types
 * it - never inferred, never auto-asserted, never typed-required. These specs
 * prove the data path (preparedFor flows when set, absent when not) and the
 * source contract (the name is sourced ONLY from the optional chip, never from
 * the prepare/autofill result). The chip render is a Cowork preview check.
 */

const draft = (
  over: Partial<SellerPresentationDraft> = {},
): SellerPresentationDraft => ({
  ...EMPTY_DRAFT,
  valuationStatus: 'preparing_for_walkthrough',
  propertyAddress: '123 Oak St',
  ...over,
});

const brand = (over: Partial<BrandSettings> = {}): BrandSettings =>
  ({ agentName: 'Sarah', ...over }) as unknown as BrandSettings;

test.describe('seller name flows into the hero byline only when set', () => {
  test('unset -> no preparedFor (StateAHero renders its neutral byline)', () => {
    const payload = buildOnboardingStateAPayload(draft(), brand());
    expect(payload.preparedFor).toBeUndefined();
  });

  test('set -> preparedFor carries the agent-typed value verbatim', () => {
    const payload = buildOnboardingStateAPayload(
      draft({ preparedFor: 'the Johnson family' }),
      brand(),
    );
    expect(payload.preparedFor).toBe('the Johnson family');
  });

  test('a blank / whitespace name never asserts a byline (the hero trims)', () => {
    // The flow trims before the draft (`sellerName.trim() || undefined`), AND
    // StateAHero independently guards the byline behind a trimmed preparedFor, so
    // a whitespace value can never surface a "For   " byline. Assert that hero
    // guarantee at the source that renders it.
    const hero = readFileSync(
      path.resolve(
        __dirname,
        '../src/tools/seller-presentation/output/flagship/StateAHero.tsx',
      ),
      'utf8',
    );
    expect(hero).toContain('const family = preparedFor?.trim();');
    expect(hero).toContain('{family && (');
  });
});

/* ─────────────── source contract: optional, never inferred ─────────────── */

const FLOW = readFileSync(
  path.resolve(__dirname, '../src/app/welcome/WelcomeFlowV2.tsx'),
  'utf8',
);

test.describe('seller name - never inferred, never required (source contract)', () => {
  test('sellerName starts empty and is never prefilled', () => {
    expect(FLOW).toContain("const [sellerName, setSellerName] = useState('')");
  });

  test('preparedFor is sourced ONLY from the optional typed name', () => {
    expect(FLOW).toContain('preparedFor: sellerName.trim() || undefined');
  });

  test('the name is never derived from the prepare / autofill result', () => {
    // The only writer of sellerName is the chip commit. No inference path may
    // set it from the property prepare (`prepared`) or the autofill response.
    expect(FLOW).not.toMatch(/setSellerName\(\s*prepared/);
    expect(FLOW).not.toMatch(/setSellerName\(\s*data/);
    expect(FLOW).not.toMatch(/preparedFor:\s*prepared/);
    // The prepare result shape carries no owner/seller name to infer from.
    expect(FLOW).not.toMatch(/\bownerName\b|\bowner:|\bsellerName\?:/);
  });

  test('the BEAT 2 continue advances regardless of the name (never required)', () => {
    // The hero Continue goes straight to the brief with no sellerName guard.
    expect(FLOW).toContain("data-testid=\"onbv2-hero-continue\"");
    expect(FLOW).toContain("onClick={() => p.onAdvance('brief')}");
    // And the chip's ghost entry point is optional, not a required field.
    expect(FLOW).toContain('data-testid="onbv2-seller-open"');
  });
});
