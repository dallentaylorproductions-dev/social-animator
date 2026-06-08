import { test, expect } from '@playwright/test';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

/**
 * B0a — truthful-copy gate.
 *
 * The product promise is honesty: the "Draft from your reviews" helper drafts
 * FROM reviews the agent already entered — it does not scrape, fetch, or write
 * "in your voice," and there is no "AI magic." This spec greps the user-facing
 * Settings + Seller-Presentation TSX for marketing-hype phrases that would
 * over-claim, and fails if any appear. New copy must stay on the right side of
 * this line.
 *
 * Allowed framing (intentionally NOT forbidden): "Draft from your reviews",
 * "Suggested bio", "Edit".
 *
 * Pure-Node test — no browser. Honesty doesn't ride on rendering.
 */

const SCAN_DIRS = [
  path.resolve(__dirname, '../src/app/settings'),
  path.resolve(__dirname, '../src/tools/seller-presentation/components'),
];

// Case-insensitive substrings that must never appear in user-facing copy.
const FORBIDDEN = [
  'in your voice',
  'drafted in your voice',
  'we scraped',
  'we pulled',
  'we fetched',
  'ai magic',
  'magically',
];

function collectTsx(dir: string): string[] {
  let out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) {
      out = out.concat(collectTsx(full));
    } else if (entry.endsWith('.tsx')) {
      out.push(full);
    }
  }
  return out;
}

test.describe('truthful-copy gate', () => {
  test('user-facing settings + seller-presentation TSX carry no over-claiming copy', () => {
    const files = SCAN_DIRS.flatMap(collectTsx);
    // Sanity: the scan actually found the surfaces we care about.
    expect(files.length).toBeGreaterThan(0);
    expect(files.some((f) => f.endsWith('WhyUsSection.tsx'))).toBe(true);

    const violations: string[] = [];
    for (const file of files) {
      const lower = readFileSync(file, 'utf8').toLowerCase();
      for (const phrase of FORBIDDEN) {
        if (lower.includes(phrase)) {
          violations.push(`${path.relative(process.cwd(), file)} → "${phrase}"`);
        }
      }
    }

    expect(violations, `Forbidden copy found:\n${violations.join('\n')}`).toEqual([]);
  });
});

/**
 * Phase UX-1 — no-em-dash guard over the touched copy.
 *
 * Dallen reads em-dashes as an AI tell; the codebase is being scrubbed of
 * them. There is no blanket scan (some older copy still carries em-dashes
 * outside this phase's scope), so this guard is scoped to the exact strings
 * UX-1 introduced or relabeled. Each entry asserts (a) the phrase is still
 * present in its source file — so a silent regression to the old wording
 * fails loudly — and (b) the phrase itself carries no em-dash.
 *
 * Pure-Node test — no browser.
 */
const UX1_TOUCHED_COPY: Array<{ file: string; phrase: string }> = [
  {
    file: 'src/tools/seller-presentation/components/StepEditorial.tsx',
    phrase: 'Your video message',
  },
  {
    file: 'src/tools/seller-presentation/components/StepEditorial.tsx',
    phrase:
      'A 60 to 90 second video walking your seller through your plan. Not a tour of the home.',
  },
  {
    file: 'src/tools/seller-presentation/components/StepReview.tsx',
    phrase: 'Now send this to your seller',
  },
  {
    file: 'src/app/settings/BrandProfileForm.tsx',
    phrase: 'Years of experience',
  },
  {
    file: 'src/tools/seller-presentation/output/presentation-page.tsx',
    phrase: 'Years of experience',
  },
  {
    file: 'src/tools/seller-presentation/output/flagship/AgentBand.tsx',
    phrase: 'Years of experience',
  },
  {
    file: 'src/tools/seller-presentation/components/BrandKitForm.tsx',
    phrase: 'resetLabel="Default"',
  },
];

test.describe('UX-1 touched copy', () => {
  test('relabeled / reworded strings are present and carry no em-dash', () => {
    const problems: string[] = [];
    for (const { file, phrase } of UX1_TOUCHED_COPY) {
      const full = path.resolve(__dirname, '..', file);
      const src = readFileSync(full, 'utf8');
      if (!src.includes(phrase)) {
        problems.push(`${file} → missing expected copy: "${phrase}"`);
      }
      if (phrase.includes('—')) {
        problems.push(`${file} → em-dash in copy: "${phrase}"`);
      }
    }
    expect(problems, `UX-1 copy guard:\n${problems.join('\n')}`).toEqual([]);
  });
});
