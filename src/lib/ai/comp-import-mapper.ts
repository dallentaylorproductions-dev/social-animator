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

function buildPrompt(header: string[], sampleRows: string[][]): string {
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
  "bathrooms":    { "column": "<source column name>", "confidence": 0.0–1.0 }
}

Rules:
- If a target field clearly maps to a source column, confidence ≥ 0.9.
- If multiple source columns could match (e.g. "Selling Price" vs "Current Price"), pick the one that most directly matches the target's intent (sold = closed = Selling Price), confidence 0.7–0.9.
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
    return obj;
  } catch {
    return null;
  }
}

function isColumnMapping(o: unknown): o is ColumnMapping {
  if (!o || typeof o !== 'object') return false;
  const m = o as Record<string, unknown>;
  if (!Array.isArray(m.address_components)) return false;
  if (!m.address_components.every((c) => typeof c === 'string')) return false;
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
  return true;
}
