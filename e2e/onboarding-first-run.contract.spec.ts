import { test, expect } from '@playwright/test';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import {
  buildPreviewFromDraft,
  type PreviewModel,
} from '../src/lib/onboarding/preview-model';
import { SAMPLE_PREVIEW } from '../src/lib/onboarding/sample-listing';
import {
  ONBOARDING_EVENTS,
  ONBOARDING_EVENT_NAMES,
} from '../src/lib/onboarding/events';
import { ONBOARDING_SPOTLIGHTS } from '../src/lib/onboarding/spotlights';
import type { SellerPresentationDraft } from '../src/tools/seller-presentation/engine/types';

/**
 * ONBOARDING_FIRST_RUN (Pass 2) - pure + source-contract specs.
 *
 * The flow is flag-gated DARK and the harness can't flip a server env flag
 * mid-suite, so the behaviour is proven the same way the DASHBOARD_HOME_V2 and
 * Pages-Library DARK passes were: pure assertions on the view-model + the
 * fixture, plus source-contract greps on the gate + the copy. Flag-on render is
 * a Cowork preview check.
 *
 * Pure-Node tests - no browser.
 */

const baseDraft = (
  over: Partial<SellerPresentationDraft> = {},
): SellerPresentationDraft => ({
  comps: [],
  pitchPoints: [],
  commitments: [],
  asks: [],
  ...over,
});

test.describe('preview view-model', () => {
  test('a thin draft ghosts every earned section (awaiting review, not error)', () => {
    const model = buildPreviewFromDraft(baseDraft({ propertyAddress: '12 Oak St' }));
    expect(model.isSample).toBe(false);
    expect(model.addressLine).toBe('12 Oak St');
    expect(model.hasPrice).toBe(false);
    expect(model.hasComps).toBe(false);
    expect(model.hasPhoto).toBe(false);
    expect(model.hasSubjectFacts).toBe(false);
  });

  test('a full draft surfaces price, comps, facts and photo', () => {
    const model = buildPreviewFromDraft(
      baseDraft({
        propertyAddress: '1742 Kenilworth Avenue',
        propertyCity: 'Tacoma',
        propertyState: 'WA',
        propertyZip: '98406',
        heroPhotoUrl: '/sample-assets/exterior.webp',
        recommendedPriceLow: '$619,000',
        recommendedPriceHigh: '$642,000',
        subjectBedrooms: '4',
        comps: [
          { address: '4210 N 14th St', soldPrice: '$592,000', squareFeet: '2,740' },
        ],
      }),
    );
    expect(model.cityLine).toBe('Tacoma, WA 98406');
    expect(model.hasPrice).toBe(true);
    expect(model.hasComps).toBe(true);
    expect(model.hasPhoto).toBe(true);
    expect(model.hasSubjectFacts).toBe(true);
    expect(model.comps[0]).toEqual({
      addressLine: '4210 N 14th St',
      soldLine: 'Sold $592,000',
      sqft: '2,740',
    });
  });

  test('a best-effort prepare fills the gaps the draft left empty', () => {
    const model = buildPreviewFromDraft(baseDraft({ propertyAddress: '9 Pine' }), {
      beds: '3',
      comps: [{ addressLine: '5 Elm', soldLine: 'Sold $500,000', sqft: '1,900' }],
    });
    expect(model.hasSubjectFacts).toBe(true);
    expect(model.hasComps).toBe(true);
    expect(model.hasPrice).toBe(false); // prepare carried no price -> still ghosted
  });
});

test.describe('sample fixture', () => {
  test('is clearly marked sample and impressive-but-not-thin', () => {
    expect(SAMPLE_PREVIEW.isSample).toBe(true);
    expect(SAMPLE_PREVIEW.addressLine.length).toBeGreaterThan(0);
    expect(SAMPLE_PREVIEW.hasPhoto && SAMPLE_PREVIEW.hasPrice && SAMPLE_PREVIEW.hasComps).toBe(
      true,
    );
    expect(SAMPLE_PREVIEW.comps.length).toBe(4);
  });

  test('carries only listing content - no fabricated agent identity / reviews', () => {
    const keys = Object.keys(SAMPLE_PREVIEW) as (keyof PreviewModel)[];
    const allowed = new Set<keyof PreviewModel>([
      'isSample',
      'addressLine',
      'cityLine',
      'heroPhotoUrl',
      'priceLow',
      'priceHigh',
      'subjectBeds',
      'subjectBaths',
      'subjectSqft',
      'comps',
      'hasPhoto',
      'hasPrice',
      'hasComps',
      'hasSubjectFacts',
    ]);
    for (const k of keys) expect(allowed.has(k)).toBe(true);
  });
});

test.describe('funnel vocabulary', () => {
  test('event names are unique and registered in the validator set', () => {
    const values = Object.values(ONBOARDING_EVENTS);
    expect(new Set(values).size).toBe(values.length);
    for (const name of values) expect(ONBOARDING_EVENT_NAMES.has(name)).toBe(true);
    // The packet's funnel coverage: path, preview, publish, conversion, drop-off.
    expect(values).toContain('onboarding_path_chosen');
    expect(values).toContain('onboarding_preview_reached');
    expect(values).toContain('onboarding_published');
    expect(values).toContain('onboarding_sample_converted');
    expect(values).toContain('onboarding_step_entered');
  });
});

test.describe('ambient spotlights', () => {
  test('at most five lines, each teaching value, never the backend', () => {
    const lines = Object.values(ONBOARDING_SPOTLIGHTS);
    expect(lines.length).toBeLessThanOrEqual(5);
    const backend = /rentcast|street ?view|beacon|zillow|\bAI\b|autofill|api/i;
    for (const line of lines) {
      expect(line.includes('-'), `em-dash in spotlight: "${line}"`).toBe(false);
      expect(backend.test(line), `spotlight names a backend: "${line}"`).toBe(false);
    }
  });
});

/* ─────────────────── source-contract: the gate + the copy ────────────────── */

function collectFiles(dir: string, exts: string[]): string[] {
  let out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) out = out.concat(collectFiles(full, exts));
    else if (exts.some((e) => entry.endsWith(e))) out.push(full);
  }
  return out;
}

test.describe('first-run gate - source contract', () => {
  test('the flag reads ONBOARDING_FIRST_RUN and nothing else', () => {
    const src = readFileSync(
      path.resolve(__dirname, '../src/lib/config/onboarding-first-run.ts'),
      'utf8',
    );
    expect(src).toContain('process.env.ONBOARDING_FIRST_RUN === "true"');
  });

  test('DashboardEntry is a pure pass-through when the flag is off', () => {
    const src = readFileSync(
      path.resolve(__dirname, '../src/app/dashboard/DashboardEntry.tsx'),
      'utf8',
    );
    // Flag-off branch returns DashboardClient directly (no gate, no fetch).
    expect(src).toContain('if (!onboardingFirstRun)');
    expect(src).toContain('<DashboardClient');
    // Flag-on routes a brand-new agent into the flow.
    expect(src).toContain("router.replace('/welcome')");
  });

  test('the /welcome server shell redirects when the flag is dark', () => {
    const src = readFileSync(
      path.resolve(__dirname, '../src/app/welcome/page.tsx'),
      'utf8',
    );
    expect(src).toContain('isOnboardingFirstRunEnabled()');
    expect(src).toContain("redirect(\"/dashboard\")");
  });
});

/**
 * Strip block + line comments (line-count preserving) and path-like string
 * literals so the copy guard scans the words a USER reads, not the words a
 * developer types. Mirrors the intent of scripts/check-truthful-copy.sh, whose
 * GLOB_ROOTS do not cover the welcome surface.
 */
function stripNonCopy(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1')
    .replace(/^\s*import\b[^\n]*$/gm, '')
    .replace(/["'`](?:\/|@\/|\.\.?\/|[a-z][a-z0-9+.-]*:\/\/)[^"'`]*["'`]/g, '');
}

const EM_DASH = '—';

test.describe('first-run copy - honest + no em-dash', () => {
  test('no over-claiming copy, no backend nouns, no em-dash on the welcome surface', () => {
    const files = collectFiles(
      path.resolve(__dirname, '../src/app/welcome'),
      ['.tsx', '.ts'],
    );
    expect(files.length).toBeGreaterThan(0);

    // Over-claim phrases + backend nouns that must never appear in seller-facing
    // copy. Scanned against comment-stripped source so a code path string like
    // "/api/.../autofill" or a developer comment is not a false positive.
    const FORBIDDEN = [
      'ai magic',
      'magically',
      'we pulled',
      'we fetched',
      'we scraped',
      'in your voice',
      'drafted in your voice',
      'autofill',
      'rentcast',
      'street view',
      'beacon',
    ];
    const problems: string[] = [];
    for (const file of files) {
      const copy = stripNonCopy(readFileSync(file, 'utf8'));
      const lower = copy.toLowerCase();
      for (const phrase of FORBIDDEN) {
        if (lower.includes(phrase)) problems.push(`${file} -> "${phrase}"`);
      }
      if (copy.includes(EM_DASH)) problems.push(`${file} -> em-dash`);
      // A thin / slow / disabled prepare must never read as an error to a user.
      if (/\bfailed\b/i.test(copy)) problems.push(`${file} -> "failed" framing`);
    }
    expect(problems, `welcome copy guard:\n${problems.join('\n')}`).toEqual([]);
  });
});
