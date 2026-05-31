import { getAnthropicClient, COMP_IMPORT_MODEL } from "./anthropic-client";
import type { ImportedComp, MappingNote } from "./comp-import-project";
import type {
  CompFieldName,
  ConfidenceLevel,
} from "@/tools/seller-intelligence-report/engine/types";

/**
 * PDF comp-import mapper — v1.48, the AIPlugPoint `vision` mode of the
 * already-shipped `import-to-comp` plug-point.
 *
 * Differs from the CSV/TSV mapper in TWO ways:
 *   1. Input is a base64-encoded PDF, sent to Claude Haiku 4.5 via the
 *      Messages API's `document` content block. The model reads the PDF
 *      pages directly (text + layout — no OCR layer needed).
 *   2. Returns the projected Comp[] DIRECTLY rather than a column
 *      mapping. PDFs have no parseable columns to project against, so
 *      the model does extraction in one pass and we feed the same
 *      canonical Comp shape into the existing review modal.
 *
 * Response contract MATCHES the CSV mapper's downstream shape — the
 * route assembles `{ candidates, mappingNotes, totalRows, ... }` the
 * same way regardless of mode, so the review modal renders unchanged.
 *
 * Cost / privacy discipline mirrors CSV:
 *   - One paid call per file (extraction), not per row.
 *   - Independent PROMPT_VERSION_PDF + own cache key namespace so PDF
 *     prompt tuning doesn't invalidate CSV cache, and a SHA-256
 *     coincidence across modes can't serve the wrong shape.
 *   - 25s hard timeout (route maxDuration sits above this + buffer).
 *   - E2E bypass returns a synthetic fixture without any network call.
 *   - Raw upload never persisted by the route; this module never
 *     touches disk.
 */

export const PROMPT_VERSION_PDF = 1;

/**
 * KV cache key — independent namespace from the CSV mapper's
 * `comp_import_mapping_cache:v3:<hash>`. Versioned by PROMPT_VERSION_PDF
 * so tuning the PDF prompt auto-invalidates only PDF cache entries.
 */
export function buildPdfCacheKey(fileHash: string): string {
  return `comp_import_mapping_cache:v${PROMPT_VERSION_PDF}:pdf:${fileHash}`;
}

const TIMEOUT_MS = 25_000;

/**
 * Threshold the route uses to decide whether to surface the
 * "PDF parsing wasn't confident — try CSV/TSV" fallback. If more
 * than this fraction of extracted rows fall below LOW_CONFIDENCE
 * the route refuses the result rather than render a bad modal.
 */
export const LOW_CONFIDENCE_ROW_FRACTION = 0.3;
const LOW_CONFIDENCE_THRESHOLD = 0.55;

interface ExtractedComp {
  address: string | null;
  sold_price: number | null;
  sold_date: string | null;
  sqft: number | null;
  bedrooms: number | null;
  bathrooms: number | null;
  year_built: number | null;
  confidence: number;
}

interface ExtractedPayload {
  comps: ExtractedComp[];
}

export interface ExtractPdfResult {
  comps: ImportedComp[];
  mappingNotes: MappingNote[];
  totalRows: number;
  skippedRowCount: number;
  lowConfidenceRowCount: number;
  latencyMs: number;
  retried: boolean;
  source: "live" | "fixture";
}

/**
 * The E2E bypass returns a deterministic 2-comp fixture that mirrors
 * the real NWMLS Resi Agent Detail shape. Production never sets
 * E2E_TESTING; the route still hashes the actual file bytes and
 * exercises the same cache path.
 */
// Values mirror the v1.48 calibration audit (rows 1–2 of the real
// Resi Agent Detail fixture). Keeping the test stub aligned with the
// audited extraction means the e2e contract assertions double-document
// the gate result: ASF chosen over SFF (comp 1: 2,742 vs 2,472), BR
// single-total parsed (5), BTH decimal parsed (2.00 → "2"), MM/DD/YYYY
// → ISO date conversion held.
const PDF_FIXTURE: ExtractedPayload = {
  comps: [
    {
      address: "4210 N 14th St, Tacoma, WA 98406",
      sold_price: 591000,
      sold_date: "2026-03-04",
      sqft: 2742,
      bedrooms: 5,
      bathrooms: 2,
      year_built: 1951,
      confidence: 0.95,
    },
    {
      address: "1705 N Anderson St, Tacoma, WA 98406",
      sold_price: 580000,
      sold_date: "2026-03-05",
      sqft: 2024,
      bedrooms: 2,
      bathrooms: 1,
      year_built: 1919,
      confidence: 0.95,
    },
  ],
};

export async function extractCompsFromPdf(
  pdfBase64: string,
): Promise<ExtractPdfResult> {
  if (process.env.E2E_TESTING === "1") {
    const { comps, lowConfidenceRowCount } = projectExtracted(PDF_FIXTURE.comps);
    return {
      comps,
      mappingNotes: buildPdfMappingNotes(),
      totalRows: PDF_FIXTURE.comps.length,
      skippedRowCount: PDF_FIXTURE.comps.length - comps.length,
      lowConfidenceRowCount,
      latencyMs: 0,
      retried: false,
      source: "fixture",
    };
  }

  const start = Date.now();
  const prompt = buildPdfPrompt();

  let raw: string;
  let retried = false;
  raw = await callModelWithPdf(pdfBase64, prompt);
  let parsed = tryParse(raw);
  if (!parsed) {
    retried = true;
    raw = await callModelWithPdf(
      pdfBase64,
      `${prompt}\n\nYour previous response was not valid JSON. Return JSON only, no markdown, no prose.`,
    );
    parsed = tryParse(raw);
  }
  if (!parsed) {
    throw new Error("ai-malformed-json");
  }

  const { comps, lowConfidenceRowCount } = projectExtracted(parsed.comps);

  return {
    comps,
    mappingNotes: buildPdfMappingNotes(),
    totalRows: parsed.comps.length,
    skippedRowCount: parsed.comps.length - comps.length,
    lowConfidenceRowCount,
    latencyMs: Date.now() - start,
    retried,
    source: "live",
  };
}

async function callModelWithPdf(
  pdfBase64: string,
  prompt: string,
): Promise<string> {
  const client = getAnthropicClient();
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const result = await client.messages.create(
      {
        model: COMP_IMPORT_MODEL,
        max_tokens: 4096,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "document",
                source: {
                  type: "base64",
                  media_type: "application/pdf",
                  data: pdfBase64,
                },
              },
              { type: "text", text: prompt },
            ],
          },
        ],
      },
      { signal: controller.signal },
    );
    const block = result.content[0];
    if (block && block.type === "text") return block.text;
    return "";
  } finally {
    clearTimeout(t);
  }
}

/**
 * Builds the extraction prompt. NWMLS Resi Agent Detail field glossary
 * comes from the v1.48 packet appendix — the same fixture this prompt
 * is calibrated against. The glossary is embedded verbatim so Haiku
 * has exactly the cues it needs for the format most cohort agents
 * reach for (NWMLS Matrix Print → PDF).
 */
export function buildPdfPrompt(): string {
  return `You are extracting comparable real-estate sale rows from an MLS PDF report.

Return ONLY a JSON object with this exact shape — no markdown, no prose:
{
  "comps": [
    {
      "address":     "<street>, <city>, <state> <zip>" | null,
      "sold_price":  <number, USD, no commas, no $> | null,
      "sold_date":   "YYYY-MM-DD" | null,
      "sqft":        <number, total above-grade finished area> | null,
      "bedrooms":    <integer> | null,
      "bathrooms":   <decimal, e.g. 2.5> | null,
      "year_built":  <4-digit year> | null,
      "confidence":  0.0–1.0
    }
  ]
}

Return ONE entry per distinct comparable property. Do NOT duplicate rows
across pages. If a value is illegible or absent on the page, set it to
null and lower the row's confidence.

NWMLS Matrix "Resi Agent Detail" format cues (this is the cohort's
default PDF export — calibrated against a real 10-comp fixture):

- A new comparable starts on every page whose body begins with
  \`Listing #<digits>\`. Each comp may span 2 pages: page A holds the
  data block, page B holds Marketing Remarks. Treat both pages as the
  same record.
- IGNORE the page header (\`<agent name>  Residential Agent Detail Report
  Page X of Y\`) and the footer (\`Information Deemed Reliable But Cannot
  Be Guaranteed. ... <timestamp>\`). The header agent name is the agent
  who pulled the report, NOT the listing agent. These appear on every
  page and are template chrome, not comp data.
- IGNORE the property photo embedded on page A. All data fields you need
  are textual.

Field abbreviations (map exactly as listed):

  Listing #<n>      → mlsNumber (skip — not in output shape)
  STAT: Sold        → only return rows where STAT is "Sold"
  LP:               → list price (not in output)
  SP:               → sold_price        (this is the headline number)
  SLDT:             → sold_date         (parse MM/DD/YYYY → YYYY-MM-DD)
  BR:               → bedrooms          (the SINGLE total, e.g. "BR: 4",
                                         NOT the per-floor breakdown row
                                         that looks like "BR: 2 3 0 0 0 0")
  BTH:              → bathrooms         (decimal: 1.25 / 1.5 / 1.75 / 2.00)
  YBT:              → year_built

  sqft — IMPORTANT OVERRIDE:
    The PDF typically shows BOTH \`ASF\` and \`SFF\` close together.
    ALWAYS prefer \`ASF\` (Above-grade Square Footage) for the sqft
    field. They're equal when there's no unfinished space; \`ASF\` is
    larger when there's a partially-finished basement (\`SFU\`).
    NEVER use \`SFF\` as primary sqft — it can omit unfinished area.
    If only one is present, use whichever is present.

Address parsing:
  - The address line follows the listing number on page A and looks
    like \`<street>, <city> <zip>\` (sometimes with extra whitespace,
    e.g. \`4210 N 14th St , Tacoma 98406\` — robust to spacing).
  - Always assume state = WA (NWMLS is a WA MLS). Output in the form
    \`<street>, <city>, WA <zip>\`.

Date parsing:
  - PDF dates are \`MM/DD/YYYY\`. Convert to ISO \`YYYY-MM-DD\`. Never
  invent a date — if a row has no \`SLDT:\` value, return null.

Robustness:
  - Some rows show \`BBC: 2.5%%\` (a documented NWMLS double-percent
    typo). Do not let this throw off the surrounding field parsing —
    it is not a sold_price.
  - If two listings appear on the same page (unusual), still split them
    by \`Listing #\` boundary. Never merge rows.
  - Drop any row whose STAT is not "Sold".

Confidence guidance:
  - 0.95+ : every required field cleanly read.
  - 0.7–0.9: at least one field required some interpretation.
  - <0.6 : multiple fields illegible or missing.

Return ONLY the JSON. No prose, no markdown fences.`;
}

function projectExtracted(extracted: ExtractedComp[]): {
  comps: ImportedComp[];
  lowConfidenceRowCount: number;
} {
  const comps: ImportedComp[] = [];
  let lowConfidenceRowCount = 0;
  for (const row of extracted) {
    if (!row.address || row.sold_price === null) continue;
    if (typeof row.confidence === "number" && row.confidence < LOW_CONFIDENCE_THRESHOLD) {
      lowConfidenceRowCount += 1;
    }
    comps.push(buildImportedComp(row));
  }
  return { comps, lowConfidenceRowCount };
}

function buildImportedComp(row: ExtractedComp): ImportedComp {
  const fieldConfidence: Partial<Record<CompFieldName, ConfidenceLevel>> = {
    address: bucketConfidence(row.confidence, !!row.address),
    soldPrice: bucketConfidence(row.confidence, row.sold_price !== null),
    soldDate: bucketConfidence(row.confidence, !!row.sold_date),
    squareFeet: bucketConfidence(row.confidence, row.sqft !== null),
  };

  return {
    address: row.address ?? "",
    soldPrice:
      row.sold_price !== null
        ? `$${Math.round(row.sold_price).toLocaleString("en-US")}`
        : "",
    soldDate: row.sold_date ?? undefined,
    squareFeet:
      row.sqft !== null ? row.sqft.toLocaleString("en-US") : undefined,
    yearBuilt: row.year_built ?? undefined,
    bedrooms: row.bedrooms !== null ? String(row.bedrooms) : undefined,
    bathrooms: row.bathrooms !== null ? String(row.bathrooms) : undefined,
    source: "imported",
    fieldConfidence,
  };
}

function bucketConfidence(score: number, hasValue: boolean): ConfidenceLevel {
  if (!hasValue) return "low";
  if (score >= 0.85) return "high";
  if (score >= 0.6) return "medium";
  return "low";
}

/**
 * Synthetic mapping notes for the PDF path. The CSV mapper surfaces
 * "we read 'Selling Price' as Sold Price" — for PDFs there are no
 * source column names, so we surface the field provenance instead.
 * The review modal renders these in the same hint line.
 */
export function buildPdfMappingNotes(): MappingNote[] {
  const PDF_NOTE = "PDF (vision)";
  return [
    { schemaField: "address", sourceColumn: PDF_NOTE, confidence: 0.9 },
    { schemaField: "soldPrice", sourceColumn: "SP", confidence: 0.95 },
    { schemaField: "soldDate", sourceColumn: "SLDT", confidence: 0.9 },
    { schemaField: "squareFeet", sourceColumn: "ASF", confidence: 0.9 },
    { schemaField: "yearBuilt", sourceColumn: "YBT", confidence: 0.95 },
    { schemaField: "bedrooms", sourceColumn: "BR", confidence: 0.9 },
    { schemaField: "bathrooms", sourceColumn: "BTH", confidence: 0.9 },
  ];
}

function tryParse(raw: string): ExtractedPayload | null {
  if (!raw) return null;
  const stripped = raw.trim().replace(/^```(?:json)?\s*\n?/, "").replace(/\n?```$/, "");
  try {
    const obj = JSON.parse(stripped) as unknown;
    if (!isExtractedPayload(obj)) return null;
    return obj;
  } catch {
    return null;
  }
}

function isExtractedPayload(o: unknown): o is ExtractedPayload {
  if (!o || typeof o !== "object") return false;
  const m = o as Record<string, unknown>;
  if (!Array.isArray(m.comps)) return false;
  for (const c of m.comps) {
    if (!c || typeof c !== "object") return false;
    const r = c as Record<string, unknown>;
    if (r.address !== null && typeof r.address !== "string") return false;
    if (r.sold_price !== null && typeof r.sold_price !== "number") return false;
    if (r.sold_date !== null && typeof r.sold_date !== "string") return false;
    if (r.sqft !== null && typeof r.sqft !== "number") return false;
    if (r.bedrooms !== null && typeof r.bedrooms !== "number") return false;
    if (r.bathrooms !== null && typeof r.bathrooms !== "number") return false;
    if (r.year_built !== null && typeof r.year_built !== "number") return false;
    if (typeof r.confidence !== "number") return false;
  }
  return true;
}
