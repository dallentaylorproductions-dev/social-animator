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
