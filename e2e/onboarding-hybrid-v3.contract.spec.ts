import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { seedBrandProfile } from './fixtures/seed-helpers';

/**
 * ONBOARDING_HYBRID_V3 (Onboarding rebuild, Phase 3) - source-contract specs.
 *
 * The hybrid SHELL is flag-gated DARK and the harness can't flip a server env
 * flag mid-suite, so the routing + the no-mint guarantees are proven the same
 * way the V1/V2 DARK passes were: source-contract greps on the seams, plus the
 * one flag-off browser proof. Flag-on render (the first screen, the two CTAs +
 * the example link, the Path B draft handoff into the wizard) is a Cowork
 * preview check at the end of the stack.
 *
 * The two things this phase MUST prove structurally:
 *   1. Precedence - V3 supersedes V2 supersedes V1 at /welcome, and with ALL
 *      THREE flags off the route still redirects (byte-identical entry).
 *   2. G1 - the no-instance surfaces (the first screen, the Path A container,
 *      "See an example") have NO write path. Path B's draft is the ONLY mint,
 *      and it is an explicit DRAFT via the EXISTING wizard creation call.
 */

function readSrc(rel: string): string {
  return readFileSync(path.resolve(__dirname, '..', rel), 'utf8');
}

/* ─────────────────── source-contract: the routing seams ────────────────── */

test.describe('onboarding V3 routing - source contract', () => {
  test('the V3 flag reads ONBOARDING_HYBRID_V3 and nothing else', () => {
    const src = readSrc('src/lib/config/onboarding-first-run-v3.ts');
    expect(src).toContain('process.env.ONBOARDING_HYBRID_V3 === "true"');
  });

  test('/welcome selects V3 with precedence V3 > V2 > V1', () => {
    const src = readSrc('src/app/welcome/page.tsx');
    expect(src).toContain('isOnboardingHybridV3Enabled()');
    expect(src).toContain('<WelcomeFlowV3');
    // V3 is chosen BEFORE V2 in the render selection (strict precedence).
    expect(src.indexOf('<WelcomeFlowV3')).toBeLessThan(src.indexOf('<WelcomeFlowV2'));
  });

  test('/welcome redirects when ALL THREE flags are off (byte-identical entry)', () => {
    const src = readSrc('src/app/welcome/page.tsx');
    expect(src).toContain('!isOnboardingFirstRunEnabled() && !v2 && !v3');
    expect(src).toContain('redirect("/dashboard")');
  });

  test('V2 and V1 remain as fallbacks (parallel dark paths, untouched)', () => {
    const src = readSrc('src/app/welcome/page.tsx');
    expect(src).toContain('<WelcomeFlowV2');
    expect(src).toContain('<WelcomeFlow');
  });
});

/* ───────── source-contract: G1 - the no-mint surfaces mint nothing ──────── */

test.describe('onboarding V3 no-mint guarantee (G1) - source contract', () => {
  test('the Path A container has NO write path (no mint imports at all)', () => {
    const src = readSrc('src/app/welcome/AgentLayerSetup.tsx');
    // The Agent-Layer container cannot create an instance, push a draft,
    // publish, mint a slug, or fire a beacon - it imports none of them.
    expect(src).not.toContain('createInstance');
    expect(src).not.toContain('putServerDraft');
    expect(src).not.toContain('markPublished');
    expect(src).not.toContain('generateSlug');
    expect(src).not.toContain('/api/seller-presentation/publish');
    // No form fields / preview either - Phase 4 owns that, preview-led (G2/G7).
    expect(src).not.toContain('<input');
  });

  test('"See an example" targets the read-only fixture route (mints nothing)', () => {
    const src = readSrc('src/app/welcome/WelcomeFlowV3.tsx');
    expect(src).toContain("'/seller-presentation-preview?fixture=full'");
    // The example link is an anchor navigation, not a mint.
    expect(src).toContain('data-testid="onbv3-cta-example"');
  });

  test('Path B is the ONLY mint and it uses the EXISTING wizard creation call', () => {
    const src = readSrc('src/app/welcome/WelcomeFlowV3.tsx');
    // Exactly one createInstance call site (plus its import) - no second path.
    const callSites = src.split('createInstance<SellerPresentationDraft>(').length - 1;
    expect(callSites).toBe(1);
    // The existing call shape: seller-presentation skill, property step.
    expect(src).toContain("skillId: 'seller-presentation'");
    expect(src).toContain("currentStep: 'property'");
    // Address is seeded into the draft (momentum), matching V2's draftSeed.
    expect(src).toContain('propertyAddress: street');
    // Hands off into the EXISTING wizard on THAT draft via ?id=.
    expect(src).toContain('/seller-presentation?id=${created.instanceId}');
  });

  test('Path B creates a DRAFT - it never publishes or mints a slug here', () => {
    const src = readSrc('src/app/welcome/WelcomeFlowV3.tsx');
    // createInstance never sets publishedSlug/publishedAt, so the handoff is a
    // private draft. The shell must not reach for publish/slug machinery.
    expect(src).not.toContain('markPublished');
    expect(src).not.toContain('generateSlug');
    expect(src).not.toContain('/api/seller-presentation/publish');
  });
});

/* ─────────────────────── flag off (byte-identical entry) ────────────────── */

test.describe('onboarding V3 - flag off (byte-identical entry)', () => {
  test('/welcome redirects and never mounts the V3 (or V2/V1) flow', async ({
    page,
  }) => {
    await seedBrandProfile(page);
    await page.goto('/welcome');
    await expect(page).not.toHaveURL(/\/welcome/i);
    await expect(page).not.toHaveURL(/\/login/i);
    await expect(page.getByTestId('onbv3-root')).toHaveCount(0);
    await expect(page.getByTestId('onbv2-root')).toHaveCount(0);
    await expect(page.getByTestId('onb-root')).toHaveCount(0);
  });
});
