import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import path from 'node:path';

/**
 * ONBOARDING_HYBRID_V3 — post-verify consolidated fixes (source-contract).
 *
 * The hybrid is flag-gated DARK and the wizard mounts through a React/listing-
 * profile tree the harness can't drive with a flipped env flag, so these fixes
 * are proven the way the rest of the stack was: source-contract greps on the
 * seams (the address seed + the mirror-match contract it satisfies, the accent
 * and reveal CSS, the example-link target). The rendered result is the Cowork
 * visual re-verify.
 */

function readSrc(rel: string): string {
  return readFileSync(path.resolve(__dirname, '..', rel), 'utf8');
}

/* ── P1: Path B address survives into the wizard ── */

test.describe('Path B address carry-over (P1)', () => {
  test('Path B seeds the listing-profile primitive BEFORE createInstance', () => {
    const src = readSrc('src/app/welcome/WelcomeFlowV3.tsx');
    // It writes the SAME store the wizard's StepProperty reads (not just the draft).
    expect(src).toContain("from '@/lib/listing-profile'");
    expect(src).toContain('saveListingProfile({');
    // Order matters: the primitive must exist before the draft is minted, so the
    // wizard hydrates a populated listing profile.
    expect(src.indexOf('saveListingProfile({')).toBeLessThan(
      src.indexOf('createInstance<SellerPresentationDraft>('),
    );
  });

  test('the seeded draft and the listing profile AGREE (so the mirror cannot clobber)', () => {
    const src = readSrc('src/app/welcome/WelcomeFlowV3.tsx');
    // The draft is stamped with the profile's backfilled propertyId + the same
    // address parts, so StepProperty's mirror sees a match and returns early.
    expect(src).toContain('propertyId: profile.propertyId');
    expect(src).toContain('address: street');
    expect(src).toContain('propertyAddress: street');
  });

  test('the StepProperty mirror still compares ONLY {propertyId,address,city,state,zip,hero}', () => {
    // Contract guard: the fix seeds exactly the fields the mirror compares. If a
    // new field joins the match (a new clobber path), this assertion fails so the
    // seed gets updated too (the discovery stop-condition).
    const src = readSrc(
      'src/tools/seller-presentation/components/StepProperty.tsx',
    );
    expect(src).toContain('draft.propertyId === settings.propertyId');
    expect(src).toContain(
      'draft.propertyAddress === (settings.address || undefined)',
    );
    expect(src).toContain('draftCity === settingsCity');
    expect(src).toContain('draftState === settingsState');
    expect(src).toContain('draftZip === settingsZip');
    expect(src).toContain('draftHero === settingsHero');
  });
});

/* ── Accent + reveal + example-link (CSS / link fixes) ── */

test.describe('onboarding V3 accent + preview fixes', () => {
  test('the V3 shell re-points the accent to studio mint #5BF5C9', () => {
    const css = readSrc('src/app/welcome/welcome-v3.css');
    expect(css).toContain('.onbv3 {');
    expect(css).toContain('--onb-accent: #5bf5c9');
  });

  test('the preview lands every reveal section visible (no motion island, G1)', () => {
    const css = readSrc('src/app/welcome/welcome-v3.css');
    expect(css).toContain('.onbv3__preview-page .reveal');
    expect(css).toContain('opacity: 1 !important');
    // The reveal fix must NOT re-introduce the beacon island — pure CSS only.
    const setup = readSrc('src/app/welcome/AgentLayerSetup.tsx');
    expect(setup).not.toContain('PresentationPageMotion');
    expect(setup).toContain('preview'); // StateAPage still rendered in preview mode
  });

  test('"See an example" points at the State-A home (matches the inline preview)', () => {
    const flow = readSrc('src/app/welcome/WelcomeFlowV3.tsx');
    expect(flow).toContain("'/seller-presentation-preview?fixture=state-a'");
    const setup = readSrc('src/app/welcome/AgentLayerSetup.tsx');
    expect(setup).toContain("'/seller-presentation-preview?fixture=state-a'");
  });
});

/* ── G1 unchanged: the no-mint/no-track surfaces stay clean ── */

test.describe('G1 still holds after the fixes', () => {
  const TRACK = ['markPublished', 'generateSlug', 'publishHandout', 'postViewBeacon'];
  test('the Path A capture + container still import no publish/slug/beacon fn', () => {
    for (const rel of [
      'src/app/welcome/AgentLayerSetup.tsx',
      'src/app/welcome/AgentLayerCapture.tsx',
    ]) {
      const src = readSrc(rel);
      for (const sym of TRACK) {
        expect(src, `${rel} must not reference ${sym}`).not.toContain(sym);
      }
    }
  });
});
