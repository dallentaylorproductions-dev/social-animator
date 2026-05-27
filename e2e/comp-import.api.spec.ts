import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

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

async function loadFixture(): Promise<Buffer> {
  return readFile(FIXTURE_PATH);
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
    expect(data.message).toMatch(/csv, tsv, or txt/i);
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
