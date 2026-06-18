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
 * ONBOARDING_FIRST_RUN_V2 - preview-smoke fixes: the reveal beats must show REAL
 * content (not empty frames), with honest empty/awaiting states only when data
 * is genuinely absent.
 *
 *   - Cause A: the slice lands `.reveal` at its final state (no motion island).
 *   - BEAT 3: AppointmentBrief shows the found comps without requiring a photo.
 *   - BEAT 5: CampaignSpread renders the chosen lever's headline + a ghost even
 *     with no capability frames; the lever tap lights the headline in place.
 *   - BEAT 7: the account email is folded in as the reach method.
 *
 * Pure (the BEAT 7 payload) + source-contract on the shared-component relaxations.
 * The render is a Cowork preview check; the live-page byte-identical guarantee is
 * proven by the unchanged state-a-render / publish-allowlist suites.
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

const read = (rel: string) =>
  readFileSync(path.resolve(__dirname, '..', rel), 'utf8');

test.describe('BEAT 7 - the account email is the reach of last resort', () => {
  test('no brand contact -> the slice agent carries the account email', () => {
    const payload = buildOnboardingStateAPayload(
      draft(),
      brand(),
      'sarah@account.com',
    );
    expect(payload.agent.email).toBe('sarah@account.com');
  });

  test("the agent's brand contact still wins over the account email", () => {
    const payload = buildOnboardingStateAPayload(
      draft(),
      brand({ contactEmail: 'sarah@brokerage.com' }),
      'sarah@account.com',
    );
    expect(payload.agent.email).toBe('sarah@brokerage.com');
  });

  test('no account email -> nothing fabricated (honest empty)', () => {
    const payload = buildOnboardingStateAPayload(draft(), brand(), '');
    expect(payload.agent.email ?? '').toBe('');
  });
});

test.describe('Cause A - the slice reveals content at rest (no motion island)', () => {
  test('welcome-v2.css lands .reveal at its final state inside the slice', () => {
    const css = read('src/app/welcome/welcome-v2.css');
    expect(css).toMatch(/\.onbv2__slice \.reveal\s*\{[\s\S]*opacity:\s*1/);
  });
});

test.describe('BEAT 3 - AppointmentBrief shows found comps without a photo', () => {
  const brief = read(
    'src/tools/seller-presentation/output/flagship/AppointmentBrief.tsx',
  );
  const slice = read(
    'src/tools/seller-presentation/output/flagship/StateASlice.tsx',
  );

  test('the photo gate is a prop that DEFAULTS to the shipped behavior', () => {
    expect(brief).toContain('requireCompPhoto = true');
  });

  test('relaxed, it backfills with unphotographed comps (placeholder card)', () => {
    expect(brief).toMatch(/!compHasPhoto/);
  });

  test('the onboarding slice opts into the relaxed gate', () => {
    expect(slice).toContain('requireCompPhoto={false}');
  });
});

test.describe('BEAT 5 - CampaignSpread renders the chosen lever even with no frames', () => {
  const spread = read(
    'src/tools/seller-presentation/output/flagship/CampaignSpread.tsx',
  );
  const flow = read('src/app/welcome/WelcomeFlowV2.tsx');

  test('the null-guard makes an exception for a chosen lead emphasis', () => {
    expect(spread).toContain(
      'frames.length === 0 && listings.length === 0 && !emphasis',
    );
    expect(spread).toContain('fs-sa-spread-ghost');
  });

  test('the lever tap lights the headline in place, then Continue advances', () => {
    // chooseExposure must NOT advance on its own; a Continue button does.
    const choose = flow.slice(
      flow.indexOf('const chooseExposure'),
      flow.indexOf('const chooseExposure') + 600,
    );
    expect(choose).not.toContain("setBeat('trust')");
    expect(flow).toContain('testid="onbv2-campaign-continue"');
  });
});
