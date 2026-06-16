import { test, expect } from '@playwright/test';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { defaultWhyUs } from '../src/lib/whyus';

/**
 * Truthful-copy gate.
 *
 * The product promise is honesty: the tool does not scrape, fetch, or write
 * "in your voice," and there is no "AI magic." This spec greps the user-facing
 * Settings + Seller-Presentation TSX for marketing-hype phrases that would
 * over-claim, and fails if any appear. New copy must stay on the right side of
 * this line.
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
  // Seller State A — evergreen fixed labels + strong defaults. Each must stay
  // present (no silent regression to the old assumptive copy: a duration, "the
  // listing", "magazine-grade", or the blunt valuation line) and carry no em-dash.
  {
    file: 'src/tools/seller-presentation/output/flagship/state-a-copy.ts',
    phrase: 'A quick hello from',
  },
  {
    file: 'src/tools/seller-presentation/output/flagship/state-a-copy.ts',
    phrase: 'Your home in front of buyers wherever they are already looking',
  },
  {
    file: 'src/tools/seller-presentation/output/flagship/state-a-copy.ts',
    phrase: 'Photography that sells',
  },
  {
    file: 'src/tools/seller-presentation/output/flagship/state-a-copy.ts',
    phrase: 'A recent video tour',
  },
  {
    file: 'src/tools/seller-presentation/output/flagship/state-a-copy.ts',
    phrase: 'grounded in your home, not a guess',
  },
  {
    file: 'src/tools/seller-presentation/output/flagship/state-a-copy.ts',
    phrase: 'I put this together ahead of our visit',
  },
  // Zone 5 listings coverflow — evergreen, source-agnostic, no em-dash.
  {
    file: 'src/tools/seller-presentation/output/flagship/state-a-copy.ts',
    phrase: 'Recent listings, real reach',
  },
  {
    file: 'src/tools/seller-presentation/output/flagship/state-a-copy.ts',
    phrase: 'Across recent listings',
  },
  {
    file: 'src/tools/seller-presentation/output/flagship/state-a-copy.ts',
    phrase: 'Buyer views',
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

/**
 * B0c-followup — no-em-dash guard over SHIPPED DEFAULT copy.
 *
 * `defaultWhyUs()` seeds the "Why us" editor and, unedited, publishes verbatim
 * onto real /why pages — so it's user-facing copy and must meet the no-em-dash
 * standard. The UX-1 guard above scans hand-listed source phrases; this one
 * walks the actual default object's string values, so reintroducing an em-dash
 * into any default (now or in a new field) fails CI without needing to be
 * re-listed by hand.
 *
 * Pure-Node test — no browser.
 */
function collectStrings(value: unknown, out: string[] = []): string[] {
  if (typeof value === 'string') out.push(value);
  else if (Array.isArray(value)) for (const v of value) collectStrings(v, out);
  else if (value && typeof value === 'object')
    for (const v of Object.values(value)) collectStrings(v, out);
  return out;
}

test.describe('shipped default copy', () => {
  test('defaultWhyUs() carries no em-dash', () => {
    const offenders = collectStrings(defaultWhyUs()).filter((s) =>
      s.includes('—'),
    );
    expect(
      offenders,
      `Em-dash in default why-us copy:\n${offenders.join('\n')}`,
    ).toEqual([]);
  });
});

/**
 * LS-1 — no-em-dash gate over STATIC user-facing copy (the broad scan).
 *
 * The hand-listed UX-1 guard and the defaultWhyUs() walk above protect only
 * specific surfaces. They never saw the static template strings baked into the
 * published seller-page components or the wizard UI/helper copy — which is how
 * live em-dashes shipped (the AgentNote "…what I'd do first — so nothing…", the
 * StepStrategy confidence blurbs, etc.). This guard scans every .ts/.tsx under
 * the user-facing trees and FAILS on a clause-break em-dash (or an en-dash
 * misused as one), so a regression can't slip back in.
 *
 * Comments are stripped before scanning — the codebase deliberately uses
 * em-dashes in code comments and JSDoc, which are not user-facing.
 *
 * Allow-listed by construction (no hand list needed): a clause break joins two
 * WORDS, so the matcher requires a LETTER on both sides of the dash. That keeps
 * two intentional patterns green automatically:
 *   • numeric-range en-dash — "$720,000 – $780,000" (digits flank the dash)
 *   • empty-value placeholder — a standalone "—" (quotes/brackets flank it)
 *
 * Pure-Node test — no browser.
 */
const STATIC_COPY_DIRS = [
  path.resolve(__dirname, '../src/tools/seller-presentation/components'),
  path.resolve(__dirname, '../src/tools/seller-presentation/output'),
  path.resolve(__dirname, '../src/app/settings'),
];

function collectSource(dir: string): string[] {
  let out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) {
      // Fixtures are test data, never published — skip them.
      if (entry === '__fixtures__') continue;
      out = out.concat(collectSource(full));
    } else if (
      // The prep PDF is a SEPARATE surface (the agent's private prep doc, not
      // the published seller page or the wizard) and is explicitly out of LS-1's
      // scope. Leave its copy untouched and unscanned here; sweep it under its
      // own change if/when that surface is in scope.
      entry !== 'prep-pdf.tsx' &&
      (entry.endsWith('.tsx') || entry.endsWith('.ts'))
    ) {
      out.push(full);
    }
  }
  return out;
}

// Drop block comments (incl. JSDoc and {/* JSX */}) and line comments, so the
// scan only sees code + copy. The line-comment strip preserves "//" that follows
// a colon (e.g. "https://…" inside a string literal).
function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/[^\n]*/gm, '$1');
}

// A clause-break dash joins two words: a LETTER on each side (whitespace, incl.
// line wraps, allowed between). Matches em-dash (U+2014) and en-dash (U+2013)
// used the same way. Digit- or punctuation-flanked dashes (numeric ranges, the
// "—" empty placeholder) never match.
const CLAUSE_BREAK_DASH = /[A-Za-z]\s*[—–]\s*[A-Za-z]/;

function findClauseBreakDashes(text: string): string[] {
  const hits: string[] = [];
  const re = new RegExp(CLAUSE_BREAK_DASH.source, 'g');
  for (const line of stripComments(text).split('\n')) {
    if (re.test(line)) hits.push(line.trim());
    re.lastIndex = 0;
  }
  return hits;
}

test.describe('static copy em-dash gate', () => {
  test('no clause-break em-dash in published template + wizard copy', () => {
    const files = STATIC_COPY_DIRS.flatMap(collectSource);
    expect(files.length).toBeGreaterThan(0);

    const violations: string[] = [];
    for (const file of files) {
      for (const line of findClauseBreakDashes(readFileSync(file, 'utf8'))) {
        violations.push(`${path.relative(process.cwd(), file)} → ${line}`);
      }
    }

    expect(
      violations,
      `Clause-break em/en-dash in user-facing static copy:\n${violations.join('\n')}`,
    ).toEqual([]);
  });

  test('detector fails on a seeded clause-break dash, allow-list stays green', () => {
    // Fails-before proof: the detector catches a clause-break em-dash and an
    // en-dash misused as one.
    expect(findClauseBreakDashes('Pick a lane — it matters.')).toHaveLength(1);
    expect(findClauseBreakDashes('Pick a lane – it matters.')).toHaveLength(1);

    // Allow-listed by construction: numeric range, standalone empty placeholder,
    // and a code comment carrying an em-dash all stay green.
    expect(findClauseBreakDashes('$720,000 – $780,000')).toEqual([]);
    expect(findClauseBreakDashes('return "—";')).toEqual([]);
    expect(findClauseBreakDashes('// a comment — with a dash')).toEqual([]);
  });
});
