import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import {
  buildPrompt,
  mapColumnsWithAI,
  applyCanonicalOverrides,
  buildCacheKey,
  PROMPT_VERSION,
  type ColumnMapping,
} from '../src/lib/ai/comp-import-mapper';
import {
  buildPdfCacheKey,
  buildPdfDocumentBlock,
  buildPdfPrompt,
  PROMPT_VERSION_PDF,
} from '../src/lib/ai/comp-import-pdf-mapper';

/**
 * /api/comp-import — server contract (v1.47 Lane C).
 *
 * Covers: happy-path mapping with the NWMLS-shape fixture (10 rows,
 * Appendix B.5-derived), test-mode AI-bypass returns the canonical
 * column mapping, candidate Comps include source + fieldConfidence,
 * private NWMLS columns (Owner Name, Listing Agent ID, Phone to Show,
 * Agent Only Remarks) never appear in the response.
 *
 * Also covers the calm-copy failure modes: feature-disabled (test
 * header), upgrade-required (testTier=base), rate-limited (test
 * header), file-format (bad/empty file), file-too-large.
 *
 * The AI call itself is fixture-mode under E2E_TESTING=1 — the
 * comp-import-mapper short-circuits to NWMLS_FIXTURE_MAPPING without
 * an external network call. Tests stay offline, deterministic, free.
 */

const FIXTURE_PATH = path.resolve(
  __dirname,
  'fixtures/comp-import/nwmls-kirkland-sample.tsv',
);
const PDF_FIXTURE_PATH = path.resolve(
  __dirname,
  'fixtures/comp-import/nwmls-resi-agent-detail-synthetic.pdf',
);

async function loadFixture(): Promise<Buffer> {
  return readFile(FIXTURE_PATH);
}

async function loadPdfFixture(): Promise<Buffer> {
  return readFile(PDF_FIXTURE_PATH);
}

test.describe('/api/comp-import — happy path', () => {
  test('maps the NWMLS fixture cleanly and returns 10 candidate Comps', async ({
    request,
  }) => {
    const bytes = await loadFixture();
    const res = await request.post('/api/comp-import?testTier=pro', {
      multipart: {
        file: {
          name: 'sample.tsv',
          mimeType: 'text/tab-separated-values',
          buffer: bytes,
        },
      },
    });
    expect(res.ok()).toBe(true);
    const data = await res.json();
    expect(data.ok).toBe(true);
    expect(data.delimiter).toBe('tab');
    expect(data.candidates).toHaveLength(10);
    expect(data.totalRows).toBe(10);
    expect(data.returnedCount).toBe(10);
    expect(data.skippedRowCount).toBe(0);

    // First candidate should match the Appendix B.5 row 1 (post-format).
    const first = data.candidates[0];
    expect(first.address).toContain('NE 68th St');
    expect(first.address).toContain('Kirkland, WA 98033');
    expect(first.soldPrice).toBe('$258,889'); // rounded from 258888.88
    expect(first.soldDate).toBe('2026-03-17');
    expect(first.squareFeet).toBe('720');
    expect(first.yearBuilt).toBe(1968);
    expect(first.bedrooms).toBe('1');
    expect(first.bathrooms).toBe('1');
    expect(first.source).toBe('imported');
    expect(first.fieldConfidence).toBeDefined();

    // AI source = fixture per the E2E bypass.
    expect(data.ai?.source).toBe('fixture');
  });

  test('mapping notes surface the "we read X as Y" hints', async ({
    request,
  }) => {
    const bytes = await loadFixture();
    const res = await request.post('/api/comp-import?testTier=pro', {
      multipart: {
        file: {
          name: 'sample.tsv',
          mimeType: 'text/tab-separated-values',
          buffer: bytes,
        },
      },
    });
    const data = await res.json();
    const notesByField = Object.fromEntries(
      data.mappingNotes.map((n: { schemaField: string; sourceColumn: string | null }) => [
        n.schemaField,
        n.sourceColumn,
      ]),
    );
    expect(notesByField.soldPrice).toBe('Selling Price');
    expect(notesByField.soldDate).toBe('Selling Date');
    expect(notesByField.squareFeet).toBe('Square Footage');
    expect(notesByField.yearBuilt).toBe('Year Built');
    expect(notesByField.bedrooms).toBe('Bedrooms');
    expect(notesByField.bathrooms).toBe('Bathrooms');
    // Address is composite — surfaced as the joined component list.
    expect(notesByField.address).toContain('Street Number');
    expect(notesByField.address).toContain('Zip Code');
  });

  test('PRIVATE NWMLS columns never appear in the response (allowlist boundary)', async ({
    request,
  }) => {
    const bytes = await loadFixture();
    const res = await request.post('/api/comp-import?testTier=pro', {
      multipart: {
        file: {
          name: 'sample.tsv',
          mimeType: 'text/tab-separated-values',
          buffer: bytes,
        },
      },
    });
    const data = await res.json();
    const serialized = JSON.stringify(data);

    // The fixture seeds 4 private sentinel strings across 10 rows.
    // NONE of them should appear anywhere in the response — the
    // projector is the privacy boundary at the AI/Lane-C interface.
    for (const sentinel of [
      'PRIVATE_OWNER_SENTINEL',
      'PRIVATE_AGENT_SENTINEL',
      'PRIVATE-A',
      'PRIVATE_REMARKS_SENTINEL',
    ]) {
      expect(serialized).not.toContain(sentinel);
    }

    // And neither should the column names — they were never even
    // referenced by the AI mapping, so the response has no concept
    // of "Owner Name" / "Listing Agent ID" / "Phone to Show Number".
    for (const columnName of [
      'Owner Name',
      'Listing Agent ID',
      'Phone to Show Number',
      'Agent Only Remarks',
    ]) {
      expect(serialized).not.toContain(`"${columnName}"`);
    }
  });
});

test.describe('/api/comp-import — calm failure modes', () => {
  test('feature-disabled (test header) → 503 with manual-fallback copy', async ({
    request,
  }) => {
    const bytes = await loadFixture();
    const res = await request.post('/api/comp-import', {
      headers: { 'X-Comp-Import-Test-Disable': '1' },
      multipart: {
        file: {
          name: 'sample.tsv',
          mimeType: 'text/tab-separated-values',
          buffer: bytes,
        },
      },
    });
    expect(res.status()).toBe(503);
    const data = await res.json();
    expect(data.ok).toBe(false);
    expect(data.code).toBe('feature-disabled');
    expect(data.message).toMatch(/add comps by hand/i);
  });

  test('testTier=base → 403 with upgrade-required calm copy', async ({
    request,
  }) => {
    const bytes = await loadFixture();
    const res = await request.post('/api/comp-import?testTier=base', {
      multipart: {
        file: {
          name: 'sample.tsv',
          mimeType: 'text/tab-separated-values',
          buffer: bytes,
        },
      },
    });
    expect(res.status()).toBe(403);
    const data = await res.json();
    expect(data.code).toBe('upgrade-required');
    expect(data.message).toMatch(/upgrade to pro/i);
    expect(data.message).toMatch(/add comps by hand/i);
  });

  test('rate-limited (test header) → 429 with calm copy', async ({
    request,
  }) => {
    const bytes = await loadFixture();
    const res = await request.post('/api/comp-import?testTier=pro', {
      headers: { 'X-Comp-Import-Test-Force-Rate-Limit': '1' },
      multipart: {
        file: {
          name: 'sample.tsv',
          mimeType: 'text/tab-separated-values',
          buffer: bytes,
        },
      },
    });
    expect(res.status()).toBe(429);
    const data = await res.json();
    expect(data.code).toBe('rate-limited');
    expect(data.message).toMatch(/too many imports/i);
  });

  test('wrong file extension → 400 with file-format calm copy', async ({
    request,
  }) => {
    const res = await request.post('/api/comp-import?testTier=pro', {
      multipart: {
        file: {
          name: 'sample.json',
          mimeType: 'application/json',
          buffer: Buffer.from('{}'),
        },
      },
    });
    expect(res.status()).toBe(400);
    const data = await res.json();
    expect(data.code).toBe('file-format');
    expect(data.message).toMatch(/csv, tsv, txt, or pdf/i);
  });

  test('empty CSV body → 400', async ({ request }) => {
    const res = await request.post('/api/comp-import?testTier=pro', {
      multipart: {
        file: {
          name: 'empty.csv',
          mimeType: 'text/csv',
          buffer: Buffer.from(''),
        },
      },
    });
    expect(res.status()).toBe(400);
    const data = await res.json();
    expect(data.code).toBe('file-format');
  });

  test('no file at all → 400', async ({ request }) => {
    const res = await request.post('/api/comp-import?testTier=pro', {
      multipart: {},
    });
    expect(res.status()).toBe(400);
    const data = await res.json();
    expect(data.code).toBe('file-format');
  });
});

test.describe('AI column-mapping prompt — sqft disambiguation (Lane C polish)', () => {
  // Header carries BOTH the trap column ('Finished Sqft', reliably 0 for
  // NWMLS condos) and the headline column ('Square Footage'). The prompt
  // must steer Haiku to inspect sample VALUES, not just match names —
  // 'Finished Sqft' is the closer name match but is empty in real exports.
  const header = [
    'Listing Number',
    'Street Number',
    'Street Name',
    'Selling Price',
    'Selling Date',
    'Finished Sqft',
    'Square Footage',
    'Year Built',
    'Bedrooms',
    'Bathrooms',
  ];
  const sampleRows = [
    ['2480166', '12505', 'NE 68th St', '258888.88', '3/17/2026 12:00:00 AM', '0', '720', '1968', '1', '1'],
    ['2504697', '211', 'Kirkland Ave', '430000', '4/02/2026 12:00:00 AM', '0', '848', '1979', '2', '1.75'],
    ['2491011', '300', '6th St', '999000', '4/20/2026 12:00:00 AM', '0', '1100', '2025', '3', '2.25'],
  ];

  test('prompt carries the DISQUALIFY rule and the named NWMLS Square Footage gotcha (v3)', () => {
    const prompt = buildPrompt(header, sampleRows);

    // v3 replaces the gentle "prefer the populated alternative" worked
    // example with an authoritative DISQUALIFY rule...
    expect(prompt).toMatch(/DISQUALIFY columns whose sample values are consistently empty/i);
    expect(prompt).toContain('This rule OVERRIDES the "direct name match = higher confidence" rule');
    // ...plus a named NWMLS gotcha that steers Haiku directly for the cohort.
    expect(prompt).toContain('MLS-schema gotcha');
    expect(prompt).toContain('for the sqft target');
    expect(prompt).toContain('headline finished-area value in NWMLS Matrix exports');
    // The unchanged confidence-downgrade guidance for name-match-but-empty.
    expect(prompt).toMatch(/sample values are all empty \/ 0 \/ null/i);
    expect(prompt).toContain('≤ 0.6');

    // The sample VALUES must still reach the model so it can SEE that
    // Finished Sqft is 0 while Square Footage is populated.
    expect(prompt).toContain('720');
    expect(prompt).toContain('848');
    expect(prompt).toContain('1100');
  });

  test('maps sqft to Square Footage, not Finished Sqft, when Finished Sqft is 0 in samples', async () => {
    // Drive the fixture-mode bypass deterministically (no model call, no
    // API key) so the offline suite stays free + repeatable. Mirrors the
    // real NWMLS condo case: Finished Sqft = 0, Square Footage > 0.
    const prev = process.env.E2E_TESTING;
    process.env.E2E_TESTING = '1';
    try {
      const { mapping, source } = await mapColumnsWithAI({ header, sampleRows });
      expect(source).toBe('fixture');
      expect(mapping.sqft.column).toBe('Square Footage');
      expect(mapping.sqft.column).not.toBe('Finished Sqft');
      expect(mapping.sqft.confidence).toBeGreaterThanOrEqual(0.8);
    } finally {
      if (prev === undefined) delete process.env.E2E_TESTING;
      else process.env.E2E_TESTING = prev;
    }
  });
});

test.describe('AI column-mapping — canonical override + cache versioning (Lane C polish)', () => {
  // Header carries BOTH the trap ('Finished Sqft') and the canonical
  // headline ('Square Footage'). The deterministic post-process overrides
  // the AI when it falls for the trap on a KNOWN NWMLS schema.
  const header = [
    'Listing Number',
    'Street Number',
    'Street Name',
    'Selling Price',
    'Selling Date',
    'Finished Sqft',
    'Square Footage',
    'Year Built',
    'Bedrooms',
    'Bathrooms',
  ];

  function baseMapping(sqftColumn: string): ColumnMapping {
    return {
      address_components: ['Street Number', 'Street Name'],
      sold_price: { column: 'Selling Price', confidence: 0.95 },
      sold_date: { column: 'Selling Date', confidence: 0.9 },
      sqft: { column: sqftColumn, confidence: 0.92 },
      year_built: { column: 'Year Built', confidence: 0.98 },
      bedrooms: { column: 'Bedrooms', confidence: 0.95 },
      bathrooms: { column: 'Bathrooms', confidence: 0.9 },
    };
  }

  function captureOverrideLogs(fn: () => ColumnMapping): {
    result: ColumnMapping;
    logs: string[];
  } {
    const logs: string[] = [];
    const orig = console.log;
    console.log = (...args: unknown[]) => {
      logs.push(args.map(String).join(' '));
    };
    try {
      return { result: fn(), logs };
    } finally {
      console.log = orig;
    }
  }

  test('override fires when the AI picks Finished Sqft and Square Footage exists', () => {
    const { result, logs } = captureOverrideLogs(() =>
      applyCanonicalOverrides(baseMapping('Finished Sqft'), header),
    );

    expect(result.sqft.column).toBe('Square Footage');
    expect(result.sqft.confidence).toBeGreaterThanOrEqual(0.95);
    expect(result.sqft.reasoning).toContain('Overridden');
    // Every override is logged at info level (console.log).
    expect(logs.some((l) => l.includes('canonical override'))).toBe(true);
  });

  test('override does NOT fire when the AI already picked Square Footage (no spurious log)', () => {
    const { result, logs } = captureOverrideLogs(() =>
      applyCanonicalOverrides(baseMapping('Square Footage'), header),
    );

    // Unchanged: same column, original confidence, no override reasoning.
    expect(result.sqft.column).toBe('Square Footage');
    expect(result.sqft.confidence).toBe(0.92);
    expect(result.sqft.reasoning).toBeUndefined();
    expect(logs.some((l) => l.includes('canonical override'))).toBe(false);
  });

  test('cache key is versioned: comp_import_mapping_cache:v3:<64-hex-sha>', () => {
    expect(PROMPT_VERSION).toBe(3);
    const fakeHash = 'a'.repeat(64);
    const key = buildCacheKey(fakeHash);
    expect(key).toBe(`comp_import_mapping_cache:v3:${fakeHash}`);
    expect(key).toMatch(/^comp_import_mapping_cache:v3:[0-9a-f]{64}$/);
  });
});

test.describe('/api/comp-import — PDF (vision-mode) dispatch (v1.48)', () => {
  test('uploads a .pdf and returns candidates with mode=pdf + delimiter=pdf', async ({
    request,
  }) => {
    const bytes = await loadPdfFixture();
    const res = await request.post('/api/comp-import?testTier=pro', {
      multipart: {
        file: {
          name: 'resi-agent-detail.pdf',
          mimeType: 'application/pdf',
          buffer: bytes,
        },
      },
    });
    expect(res.ok()).toBe(true);
    const data = await res.json();
    expect(data.ok).toBe(true);
    expect(data.mode).toBe('pdf');
    expect(data.delimiter).toBe('pdf');
    // Fixture short-circuits to a 2-comp PDF_FIXTURE.
    expect(data.candidates).toHaveLength(2);
    expect(data.totalRows).toBe(2);
    expect(data.returnedCount).toBe(2);
    expect(data.skippedRowCount).toBe(0);

    // Mirrors the v1.48 calibration-audited row 1 — ASF override
    // (2,742 > SFF 2,472), MM/DD/YYYY date conversion, BR single total.
    const first = data.candidates[0];
    expect(first.address).toContain('Tacoma');
    expect(first.address).toContain('WA');
    expect(first.soldPrice).toBe('$591,000');
    expect(first.soldDate).toBe('2026-03-04');
    expect(first.squareFeet).toBe('2,742');
    expect(first.yearBuilt).toBe(1951);
    expect(first.bedrooms).toBe('5');
    expect(first.source).toBe('imported');

    // Synthetic PDF mappingNotes surface field provenance (no source columns).
    const notesByField = Object.fromEntries(
      data.mappingNotes.map((n: { schemaField: string; sourceColumn: string | null }) => [
        n.schemaField,
        n.sourceColumn,
      ]),
    );
    expect(notesByField.squareFeet).toBe('ASF');
    expect(notesByField.soldPrice).toBe('SP');
    expect(notesByField.soldDate).toBe('SLDT');

    // E2E bypass routes the AI to the fixture branch, no live call.
    expect(data.ai?.source).toBe('fixture');
  });

  test('PDF cache key is its own namespace: comp_import_mapping_cache:v1:pdf:<64-hex-sha>', () => {
    expect(PROMPT_VERSION_PDF).toBe(1);
    const fakeHash = 'a'.repeat(64);
    const key = buildPdfCacheKey(fakeHash);
    expect(key).toBe(`comp_import_mapping_cache:v1:pdf:${fakeHash}`);
    expect(key).toMatch(/^comp_import_mapping_cache:v1:pdf:[0-9a-f]{64}$/);

    // Cross-mode collision check: CSV key with the same hash has no `:pdf:` discriminator.
    expect(buildCacheKey(fakeHash)).not.toContain(':pdf:');
  });

  test('PDF prompt embeds the NWMLS-specific cues (ASF override, %% normalization, MM/DD/YYYY)', () => {
    const prompt = buildPdfPrompt();
    expect(prompt).toContain('ASF');
    expect(prompt).toContain('SFF');
    // The override is the single biggest correctness lever — assert it's in the prompt.
    expect(prompt).toMatch(/ALWAYS prefer .?ASF.?/i);
    // BBC %% typo robustness.
    expect(prompt).toContain('%%');
    // Date format.
    expect(prompt).toContain('MM/DD/YYYY');
    // Sold-only filter (cohort guidance).
    expect(prompt).toMatch(/STAT.*Sold/);
    // Header / footer ignore directives (template chrome). The prompt
    // spans both header and footer in one bullet — match across the
    // newline rather than requiring the directive on a single line.
    expect(prompt).toMatch(/IGNORE the page header/i);
    expect(prompt).toMatch(/IGNORE[\s\S]*footer/i);
    // Per-comp boundary cue.
    expect(prompt).toMatch(/Listing #/);
  });

  test('PDF document block matches Anthropic\'s documented base64 shape (v1.48 prod-502 structural guard)', async () => {
    // Routine specs mock the Anthropic call (E2E_TESTING=1), so the real
    // document-block shape is otherwise only exercised in production. This
    // pins it byte-for-byte to the format Anthropic accepts — the v1.48 502
    // was Anthropic rejecting the bytes inside `data`, NOT the wrapper, so
    // this asserts the wrapper can never silently drift.
    // https://docs.anthropic.com/en/docs/build-with-claude/pdf-support
    const bytes = await loadPdfFixture();
    const base64 = bytes.toString('base64');
    const block = buildPdfDocumentBlock(base64);

    expect(block.type).toBe('document');
    expect(block.source.type).toBe('base64');
    expect(block.source.media_type).toBe('application/pdf');
    // data is the exact base64 we hand in — non-empty, no whitespace, no
    // data: URI prefix. A real PDF's base64 begins with "JVBERi0" ("%PDF-").
    expect(block.source.data).toBe(base64);
    expect(block.source.data.length).toBeGreaterThan(0);
    expect(block.source.data).not.toMatch(/\s/);
    expect(block.source.data.startsWith('data:')).toBe(false);
    expect(block.source.data.startsWith('JVBERi0')).toBe(true);
    // Round-trips back to the exact source bytes (encode is lossless).
    expect(Buffer.from(block.source.data, 'base64').equals(bytes)).toBe(true);
  });

  test('PDF upload counts against the daily cap (header-forced 429)', async ({
    request,
  }) => {
    const bytes = await loadPdfFixture();
    const res = await request.post('/api/comp-import?testTier=pro', {
      headers: { 'X-Comp-Import-Test-Force-Daily-Cap': '1' },
      multipart: {
        file: {
          name: 'resi-agent-detail.pdf',
          mimeType: 'application/pdf',
          buffer: bytes,
        },
      },
    });
    expect(res.status()).toBe(429);
    const data = await res.json();
    expect(data.code).toBe('daily-cap-hit');
    expect(data.message).toMatch(/today's import limit/i);
  });

  test('PDF upload counts against the rate limit (header-forced 429)', async ({
    request,
  }) => {
    const bytes = await loadPdfFixture();
    const res = await request.post('/api/comp-import?testTier=pro', {
      headers: { 'X-Comp-Import-Test-Force-Rate-Limit': '1' },
      multipart: {
        file: {
          name: 'resi-agent-detail.pdf',
          mimeType: 'application/pdf',
          buffer: bytes,
        },
      },
    });
    expect(res.status()).toBe(429);
    const data = await res.json();
    expect(data.code).toBe('rate-limited');
  });
});

test.describe('/api/entitlements/me — feature-flag wiring', () => {
  test('returns features.compImportEnabled and aiAccess state', async ({
    request,
  }) => {
    const res = await request.get('/api/entitlements/me');
    expect(res.ok()).toBe(true);
    const data = await res.json();
    expect(data.ok).toBe(true);
    expect(data.features).toBeDefined();
    expect(typeof data.features.compImportEnabled).toBe('boolean');
    expect(data.features.compImportEnabled).toBe(true); // Playwright env sets the flag on.
    expect(data.aiAccess).toBeDefined();
    expect(['available', 'preview-only', 'upgrade-required']).toContain(
      data.aiAccess.state,
    );
  });

  test('?testTier=base flips aiAccess to upgrade-required', async ({
    request,
  }) => {
    const res = await request.get('/api/entitlements/me?testTier=base');
    const data = await res.json();
    expect(data.tier).toBe('base');
    // SELLER_PRESENTATION_SKILL declares aiPlugPoints: 'pro' — under
    // tier 'base' the resolver returns upgrade-required.
    expect(data.aiAccess.state).toBe('upgrade-required');
    expect(data.aiAccess.label).toMatch(/upgrade to pro/i);
  });
});
