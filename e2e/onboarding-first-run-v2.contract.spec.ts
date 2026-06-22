import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { buildOnboardingStateAPayload } from '../src/lib/onboarding/state-a-payload';
import { ONBOARDING_V2_SPOTLIGHTS } from '../src/lib/onboarding/v2-spotlights';
import {
  EMPTY_DRAFT,
  isInvitationStatus,
  type SellerPresentationDraft,
} from '../src/tools/seller-presentation/engine/types';
import type { BrandSettings } from '../src/lib/brand';
import { seedBrandProfile } from './fixtures/seed-helpers';

/**
 * ONBOARDING_FIRST_RUN_V2 (Pass 2b / Gate 3) - pure + source-contract specs.
 *
 * The 9-beat flow is flag-gated DARK and the harness can't flip a server env
 * flag mid-suite, so behaviour is proven the same way the V1 flow + the
 * DASHBOARD_HOME_V2 / Pages-Library DARK passes were: pure assertions on the
 * payload the slices render, a copy guard on the tested constants, and
 * source-contract greps on the routing seams. Flag-on render (the beats, the
 * single-tap advance, the honest states, the funnel) is a Cowork preview check.
 *
 * Pure-Node tests except the one flag-off browser proof.
 */

const draft = (
  over: Partial<SellerPresentationDraft> = {},
): SellerPresentationDraft => ({
  ...EMPTY_DRAFT,
  valuationStatus: 'preparing_for_walkthrough',
  ...over,
});

const brand = (over: Partial<BrandSettings> = {}): BrandSettings =>
  ({ agentName: 'Sarah', ...over }) as unknown as BrandSettings;

test.describe('onboarding V2 slice payload - real, not mock', () => {
  test('resolves to the prepared-invitation State A render (no price)', () => {
    const payload = buildOnboardingStateAPayload(
      draft({ propertyAddress: '123 Oak St' }),
      brand(),
    );
    // Invitation status emitted (sellerStateA + an invitation draft), never the
    // priced "revealed" presentation.
    expect(isInvitationStatus(payload.valuationStatus)).toBe(true);
    expect(payload.valuationStatus).not.toBe('revealed');
    // The prepared invitation deliberately carries NO subject price.
    expect(payload.property.recommendedList).toBeFalsy();
    expect(payload.property.recommendedListLow).toBeUndefined();
  });

  test("the agent's name and headshot flow into the hero block", () => {
    const payload = buildOnboardingStateAPayload(
      draft({ propertyAddress: '123 Oak St' }),
      brand({ agentName: 'Sarah', agentPhotoUrl: 'https://cdn.example/headshot.jpg' }),
    );
    expect(payload.agent.name).toBe('Sarah');
    expect(payload.agent.photoUrl).toBe('https://cdn.example/headshot.jpg');
  });

  test('absence GHOSTS - no review present means no fabricated review', () => {
    const payload = buildOnboardingStateAPayload(
      draft({ propertyAddress: '123 Oak St' }),
      brand(),
    );
    expect(payload.reviews ?? []).toHaveLength(0);
    // And the honest-sample stat substitution is NOT applied (that is a
    // wizard-preview-only behaviour; the onboarding reveal is publish-looking).
    expect(payload.whyUsStatsSample).toBeFalsy();
  });

  test('an added review and the appointment flow through to the payload', () => {
    const payload = buildOnboardingStateAPayload(
      draft({
        propertyAddress: '123 Oak St',
        appointmentAt: '2026-07-01T17:00',
      }),
      brand({
        agentReviews: [{ body: 'They made it easy.', attributionName: 'A recent seller' }],
      }),
    );
    expect(payload.reviews?.[0]?.body).toBe('They made it easy.');
    expect(payload.appointmentAt).toBe('2026-07-01T17:00');
  });

  test('prepared comps flow into the nearby-sold proof', () => {
    const payload = buildOnboardingStateAPayload(
      draft({
        propertyAddress: '123 Oak St',
        comps: [
          { address: '5 Elm', soldPrice: '$500,000' },
        ] as SellerPresentationDraft['comps'],
      }),
      brand(),
    );
    expect(payload.whyPrice.comps.length).toBe(1);
    expect(payload.whyPrice.comps[0].address).toBe('5 Elm');
  });
});

test.describe('onboarding V2 spotlights - honest, no scaffolding', () => {
  test('one short value line per beat, no backend noun, no dash, no internal term', () => {
    const lines = Object.values(ONBOARDING_V2_SPOTLIGHTS);
    expect(lines.length).toBeGreaterThan(0);
    const backend = /rentcast|street ?view|beacon|zillow|\bAI\b|autofill|\bapi\b/i;
    const scaffold = /lead ?emphasis|publicpayload|brandsettings|valuationstatus|worthfollowup|stateaslice|\bbeat\b/i;
    for (const line of lines) {
      expect(line.includes('—'), `em-dash: "${line}"`).toBe(false);
      expect(line.includes('-'), `hyphen-as-dash: "${line}"`).toBe(false);
      expect(backend.test(line), `names a backend: "${line}"`).toBe(false);
      expect(scaffold.test(line), `leaks scaffolding: "${line}"`).toBe(false);
      expect(line.length).toBeLessThanOrEqual(90);
    }
  });
});

/* ─────────────────── source-contract: the routing seams ────────────────── */

function readSrc(rel: string): string {
  return readFileSync(path.resolve(__dirname, '..', rel), 'utf8');
}

test.describe('onboarding V2 routing - source contract', () => {
  test('the V2 flag reads ONBOARDING_FIRST_RUN_V2 and nothing else', () => {
    const src = readSrc('src/lib/config/onboarding-first-run-v2.ts');
    expect(src).toContain('process.env.ONBOARDING_FIRST_RUN_V2 === "true"');
  });

  test('/welcome selects V2 (precedence) and still redirects when BOTH flags are off', () => {
    const src = readSrc('src/app/welcome/page.tsx');
    expect(src).toContain('isOnboardingFirstRunV2Enabled()');
    expect(src).toContain('<WelcomeFlowV2');
    // Redirect only when NEITHER flag is on -> flag-off is byte-identical.
    expect(src).toContain('!isOnboardingFirstRunEnabled() && !v2');
    expect(src).toContain('redirect("/dashboard")');
  });

  test('the dashboard entry gate fires for EITHER flag', () => {
    const src = readSrc('src/app/dashboard/page.tsx');
    expect(src).toContain('isOnboardingFirstRunEnabled() ||');
    expect(src).toContain('isOnboardingFirstRunV2Enabled()');
  });

  test('the funnel route stays dark unless EITHER flag is on', () => {
    const src = readSrc('src/app/api/onboarding/event/route.ts');
    // Formatting-agnostic: the gate negates both flags (Phase 5 appended a third,
    // V3, on its own line — asserted in the V3 dashboard contract spec).
    expect(src).toContain('!isOnboardingFirstRunEnabled()');
    expect(src).toContain('!isOnboardingFirstRunV2Enabled()');
  });

  test('the V1 flow is untouched (parallel dark path)', () => {
    const src = readSrc('src/app/welcome/WelcomeFlow.tsx');
    // Still its own component, still its own scoped root.
    expect(src).toContain('export function WelcomeFlow(');
    expect(src).toContain('data-testid="onb-root"');
  });
});

/* ─────────────────── flag-off browser proof (byte-identical) ────────────── */

test.describe('onboarding V2 - flag off (byte-identical entry)', () => {
  test('/welcome redirects and never mounts the V2 flow', async ({ page }) => {
    await seedBrandProfile(page);
    await page.goto('/welcome');
    await expect(page).not.toHaveURL(/\/welcome/i);
    await expect(page).not.toHaveURL(/\/login/i);
    await expect(page.getByTestId('onbv2-root')).toHaveCount(0);
    await expect(page.getByTestId('onb-root')).toHaveCount(0);
  });
});
