import { getAnthropicClient, COMP_IMPORT_MODEL } from './anthropic-client';

/**
 * Comp-import column mapper (v1.47 Lane C friction-AI).
 *
 * Sends the header row + first 3 data rows of an MLS export to Claude
 * Haiku 4.5 and asks it to identify which source columns map to the
 * Comp schema. Returns a typed mapping the route applies in code.
 *
 * Cost discipline (substrate §5.5):
 *   - ONE call per file (mapping), NOT per row. The route then
 *     projects every remaining row using the same mapping locally.
 *   - Cheapest sufficient model — Haiku-tier.
 *   - Cached on file content hash by the route (24h KV TTL).
 *   - 12s hard timeout (inside the route's 15s overall budget).
 *   - One retry on malformed JSON; then fall back to manual.
 *   - E2E bypass: when E2E_TESTING === '1' the function returns a
 *     canonical fixture mapping without calling the model — keeps
 *     Playwright tests offline + deterministic + free.
 *
 * Privacy (§5.4):
 *   - The model NEVER sees individual data rows beyond the first 3.
 *   - The model NEVER sees Owner Name, Agent Cellular, Phone to Show,
 *     etc. — those columns are present in the header row name only;
 *     the model returns a column-NAME mapping, not values.
 *   - Raw upload is not persisted (route enforces).
 */

/** Single-field column mapping with the model's confidence. */
export interface FieldMapping {
  column: string | null;
  confidence: number;
  reasoning?: string;
}

/** The full mapping returned by the AI for one file. */
export interface ColumnMapping {
  address_components: string[];
  sold_price: FieldMapping;
  sold_date: FieldMapping;
  sqft: FieldMapping;
  year_built: FieldMapping;
  bedrooms: FieldMapping;
  bathrooms: FieldMapping;
  // FR-2 — richer comp fields that unlock the §05 area-snapshot auto-fill.
  // `days_on_market` feeds the snapshot's DOM cell; `list_price` is paired
  // with `sold_price` in the projector to compute the list-to-sale ratio
  // (we store the ratio, never the raw list price, on the Comp shape).
  days_on_market: FieldMapping;
  list_price: FieldMapping;
}

interface MapColumnsArgs {
  header: string[];
  sampleRows: string[][]; // first 3 data rows
}

interface MapColumnsResult {
  mapping: ColumnMapping;
  latencyMs: number;
  retried: boolean;
  /** 'live' if the model was called; 'fixture' for E2E bypass; 'cache' set by caller after cache lookup. */
  source: 'live' | 'fixture';
}

const TIMEOUT_MS = 12_000;

/**
 * Bump every time the prompt template OR the mapping behavior (rules,
 * canonical overrides) changes. The route folds this into the KV cache
 * key so a behavior change auto-invalidates every prior cache entry —
 * no manual flush, no stale mapping served against a smarter prompt.
 *
 * v1 → original prompt. v2 → a35ec44 sample-value-inspection rule
 * (untracked constant). v3 → DISQUALIFY rule + NWMLS canonical override.
 * v4 → FR-2 days_on_market + list_price targets (area-snapshot auto-fill).
 */
export const PROMPT_VERSION = 4;

/** KV cache key for a file's mapping, versioned by PROMPT_VERSION. */
export function buildCacheKey(fileHash: string): string {
  return `comp_import_mapping_cache:v${PROMPT_VERSION}:${fileHash}`;
}

/**
 * Deterministic safety net for KNOWN canonical MLS schemas. The AI is the
 * primary mapper for UNKNOWN schemas, but for column names we already
 * recognize we prefer them in code rather than relying on Haiku's judgment.
 *
 * Each entry: if the AI picked `avoidColumn` for `target` AND the
 * `preferredColumn` exists in the header, override to the preferred column.
 * Narrow (only documented canonical cases), explicit (logs every override),
 * additive (no effect on schemas not listed here).
 */
type FieldMappingKey =
  | 'sold_price'
  | 'sold_date'
  | 'sqft'
  | 'year_built'
  | 'bedrooms'
  | 'bathrooms'
  | 'days_on_market'
  | 'list_price';

const KNOWN_CANONICAL_OVERRIDES: Array<{
  target: FieldMappingKey;
  preferredColumn: string;
  avoidColumn: string;
  reason: string;
}> = [
  {
    target: 'sqft',
    preferredColumn: 'Square Footage',
    avoidColumn: 'Finished Sqft',
    reason:
      'NWMLS Matrix: Square Footage is the headline column; Finished Sqft is often 0 for condos',
  },
  // Future canonical overrides for other MLS systems land here.
];

/**
 * Apply the KNOWN_CANONICAL_OVERRIDES to a mapping in place and return it.
 * Logs (info level) every override it applies. No-op for any mapping that
 * doesn't hit a documented mis-pick.
 */
export function applyCanonicalOverrides(
  mapping: ColumnMapping,
  header: string[],
): ColumnMapping {
  for (const override of KNOWN_CANONICAL_OVERRIDES) {
    const aiPick = mapping[override.target]?.column;
    if (aiPick === override.avoidColumn && header.includes(override.preferredColumn)) {
      console.log(
        `[comp-import] applying canonical override for ${override.target}: ${aiPick} → ${override.preferredColumn}. Reason: ${override.reason}`,
      );
      mapping[override.target] = {
        column: override.preferredColumn,
        confidence: 0.95,
        reasoning: `Overridden from ${aiPick} to ${override.preferredColumn} per canonical NWMLS rule. AI's pick was disqualified because ${override.reason}.`,
      };
    }
  }
  return mapping;
}

/**
 * E2E test-mode bypass. Returns a canonical mapping for the NWMLS
 * Matrix "Full" header shape, derived from Appendix B.3 of the spec
 * packet. Production never sets E2E_TESTING.
 */
const NWMLS_FIXTURE_MAPPING: ColumnMapping = {
  address_components: [
    'Street Number',
    'Street Direction',
    'Street Name',
    'Street Suffix',
    'Unit',
    'City',
    'State',
    'Zip Code',
  ],
  sold_price: { column: 'Selling Price', confidence: 0.95 },
  sold_date: { column: 'Selling Date', confidence: 0.95 },
  sqft: { column: 'Square Footage', confidence: 0.9 },
  year_built: { column: 'Year Built', confidence: 0.98 },
  bedrooms: { column: 'Bedrooms', confidence: 0.98 },
  bathrooms: { column: 'Bathrooms', confidence: 0.95 },
  // FR-2 — NWMLS Matrix "Full" carries DOM + List Price alongside the
  // sale fields; the synthetic fixture mirrors that shape.
  days_on_market: { column: 'DOM', confidence: 0.95 },
  list_price: { column: 'List Price', confidence: 0.95 },
};

export async function mapColumnsWithAI(
  args: MapColumnsArgs,
): Promise<MapColumnsResult> {
  // E2E bypass — also handles dev environments where the agent hasn't
  // configured an API key yet but is exercising the UI flow.
  if (process.env.E2E_TESTING === '1') {
    return {
      mapping: NWMLS_FIXTURE_MAPPING,
      latencyMs: 0,
      retried: false,
      source: 'fixture',
    };
  }

  const start = Date.now();
  const prompt = buildPrompt(args.header, args.sampleRows);

  let raw: string;
  let retried = false;
  try {
    raw = await callModel(prompt);
  } catch (err) {
    throw err;
  }

  let mapping = tryParse(raw);
  if (!mapping) {
    retried = true;
    const retryPrompt = `${prompt}\n\nYour previous response was not valid JSON. Return JSON only, no markdown, no prose.`;
    raw = await callModel(retryPrompt);
    mapping = tryParse(raw);
  }

  if (!mapping) {
    throw new Error('ai-malformed-json');
  }

  // Deterministic safety net for KNOWN canonical schemas (e.g. NWMLS
  // Square Footage). Fires only on documented mis-picks; no-op otherwise.
  mapping = applyCanonicalOverrides(mapping, args.header);

  return {
    mapping,
    latencyMs: Date.now() - start,
    retried,
    source: 'live',
  };
}

async function callModel(prompt: string): Promise<string> {
  const client = getAnthropicClient();
  // AbortController is the SDK's documented way to enforce timeout.
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const result = await client.messages.create(
      {
        model: COMP_IMPORT_MODEL,
        max_tokens: 1024,
        messages: [{ role: 'user', content: prompt }],
      },
      { signal: controller.signal },
    );
    const block = result.content[0];
    if (block && block.type === 'text') return block.text;
    return '';
  } finally {
    clearTimeout(t);
  }
}

export function buildPrompt(header: string[], sampleRows: string[][]): string {
  const headerLine = header.join('\t');
  const rowLines = sampleRows
    .map((row, i) => `Row ${i + 1}:\n${row.join('\t')}`)
    .join('\n\n');

  return `You are mapping the columns of an MLS data export to a fixed real-estate-comp schema.

Here is the TARGET SCHEMA (the only fields that matter):
- address_components (an ORDERED LIST of source column names that, concatenated in order, form a human-readable street address)
- sold_price            (numeric, the price the property sold for)
- sold_date             (date, when the sale closed)
- sqft                  (numeric, finished living area in square feet)
- year_built            (4-digit year)
- bedrooms              (integer)
- bathrooms             (decimal, e.g. 2.5 = 2 full + 1 half)
- days_on_market        (integer, days the listing was active before it sold; often "DOM" or "CDOM"/"Cumulative DOM" — prefer the plain DOM)
- list_price            (numeric, the asking/list price the home was sold against; often "List Price", "Current Price", or "LP". NOT the sold/selling price)

Here is the HEADER ROW of the agent's export:
${headerLine}

Here are the first 3 DATA ROWS so you can see real values:
${rowLines}

Return ONLY a JSON object with this exact shape:
{
  "address_components": [<ordered list of source column names>],
  "sold_price":   { "column": "<source column name>", "confidence": 0.0–1.0 },
  "sold_date":    { "column": "<source column name>", "confidence": 0.0–1.0 },
  "sqft":         { "column": "<source column name>", "confidence": 0.0–1.0 },
  "year_built":   { "column": "<source column name>", "confidence": 0.0–1.0 },
  "bedrooms":     { "column": "<source column name>", "confidence": 0.0–1.0 },
  "bathrooms":    { "column": "<source column name>", "confidence": 0.0–1.0 },
  "days_on_market": { "column": "<source column name>", "confidence": 0.0–1.0 },
  "list_price":     { "column": "<source column name>", "confidence": 0.0–1.0 }
}

Rules:
- If a target field clearly maps to a source column AND the column's sample values are populated, confidence ≥ 0.9. If the column name matches but its sample values are all empty / 0 / null, drop confidence to ≤ 0.6 and prefer a populated alternative even if its name match is less direct.
- If multiple source columns could match (e.g. "Selling Price" vs "Current Price"), pick the one that most directly matches the target's intent (sold = closed = Selling Price), confidence 0.7–0.9.
- **DISQUALIFY columns whose sample values are consistently empty / 0 / null across the sample rows.** A column whose name matches the target perfectly but whose values are all 0 or empty is NOT a valid candidate for that target. Drop it from consideration entirely; pick the next-best populated alternative even if its name match is less direct. This rule OVERRIDES the "direct name match = higher confidence" rule above.
- **MLS-schema gotcha (NWMLS-specific but general principle):** if the header contains both \`Square Footage\` and \`Finished Sqft\`, prefer \`Square Footage\` for the sqft target. The verbose-named \`Square Footage\` column is the headline finished-area value in NWMLS Matrix exports; \`Finished Sqft\` is a legacy sub-field that is often 0 or duplicative. The same logic applies when a schema has a "headline" vs a "sub-field" pair for any target — prefer the one whose sample values are populated AND look like the actual headline number for the property type.
- \`days_on_market\` and \`list_price\` are OPTIONAL enrichments — many exports omit them. If the header has no DOM column, or no list/asking price column distinct from the sold price, return { "column": null, "confidence": 0 } for that field rather than forcing a wrong match. NEVER map \`list_price\` to the same column you chose for \`sold_price\`.
- If no source column matches, return { "column": null, "confidence": 0 } for that field.
- Never invent column names. Only use names that appear verbatim in the header row.
- For address_components, prefer the most granular set (Street Number, Modifier, Direction, Name, Suffix, Post Direction, Unit, City, State, Zip Code) when available. Skip components that are uniformly empty in the sample rows.
- Return only the JSON. No prose before or after.`;
}

function tryParse(raw: string): ColumnMapping | null {
  if (!raw) return null;
  // Some models occasionally wrap JSON in markdown code fences despite
  // "no markdown" instructions. Strip ```json ... ``` and ``` ... ```.
  const stripped = raw.trim().replace(/^```(?:json)?\s*\n?/, '').replace(/\n?```$/, '');
  try {
    const obj = JSON.parse(stripped) as unknown;
    if (!isColumnMapping(obj)) return null;
    // FR-2 — days_on_market / list_price are OPTIONAL enrichments. A model
    // (or an older cached shape) that omits them is still a valid mapping;
    // default the missing field to "unmapped" so the projector reads '' and
    // simply yields no DOM / ratio for that import.
    const NONE: FieldMapping = { column: null, confidence: 0 };
    return {
      ...obj,
      days_on_market: obj.days_on_market ?? NONE,
      list_price: obj.list_price ?? NONE,
    };
  } catch {
    return null;
  }
}

function isColumnMapping(o: unknown): o is ColumnMapping {
  if (!o || typeof o !== 'object') return false;
  const m = o as Record<string, unknown>;
  if (!Array.isArray(m.address_components)) return false;
  if (!m.address_components.every((c) => typeof c === 'string')) return false;
  // Core fields are required; days_on_market / list_price are validated only
  // when present (defaulted in tryParse otherwise).
  for (const key of [
    'sold_price',
    'sold_date',
    'sqft',
    'year_built',
    'bedrooms',
    'bathrooms',
  ] as const) {
    const f = m[key];
    if (!f || typeof f !== 'object') return false;
    const fm = f as Record<string, unknown>;
    if (fm.column !== null && typeof fm.column !== 'string') return false;
    if (typeof fm.confidence !== 'number') return false;
  }
  for (const key of ['days_on_market', 'list_price'] as const) {
    const f = m[key];
    if (f === undefined) continue;
    if (!f || typeof f !== 'object') return false;
    const fm = f as Record<string, unknown>;
    if (fm.column !== null && typeof fm.column !== 'string') return false;
    if (typeof fm.confidence !== 'number') return false;
  }
  return true;
}
