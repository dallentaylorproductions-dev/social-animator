#!/usr/bin/env node
/**
 * Calibration harness for the v1.48 PDF (vision-mode) comp-import mapper.
 *
 * Hits Claude Haiku 4.5 directly with the same prompt + document-block
 * shape the production route uses, against a real NWMLS Resi Agent Detail
 * PDF. Prints a per-comp table for manual audit + a per-field accuracy
 * roll-up the v1.48 acceptance gate (#8) demands ≥85% on.
 *
 * NOT shipped to production — lives alongside the e2e suite as the gate
 * receipt. The prompt is duplicated from buildPdfPrompt() in
 * src/lib/ai/comp-import-pdf-mapper.ts intentionally: the calibration
 * receipt should be tied to the exact prompt bytes that were graded,
 * not whatever the mapper imports at audit time.
 *
 * Usage:
 *   ANTHROPIC_API_KEY=sk-... node scripts/calibrate-pdf-mapper.mjs <pdf-path>
 *
 * Output:
 *   - One JSON-ish line per extracted comp.
 *   - A summary block: per-field hits / total, % accuracy.
 *   - Token usage for the cost ledger.
 *
 * Re-run after prompt tuning by re-invoking with the same PDF. The
 * fixture is stable; the prompt is the variable.
 */

import Anthropic from "@anthropic-ai/sdk";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const MODEL = "claude-haiku-4-5-20251001";
const TIMEOUT_MS = 25_000;

/**
 * MUST mirror buildPdfPrompt() in src/lib/ai/comp-import-pdf-mapper.ts.
 * If you tune one, tune the other and re-run the calibration.
 */
const PROMPT = `You are extracting comparable real-estate sale rows from an MLS PDF report.

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

async function main() {
  const pdfPath = process.argv[2];
  if (!pdfPath) {
    console.error(
      "usage: ANTHROPIC_API_KEY=... node scripts/calibrate-pdf-mapper.mjs <pdf-path>",
    );
    process.exit(2);
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error("ANTHROPIC_API_KEY not set in env.");
    process.exit(2);
  }

  const abs = resolve(pdfPath);
  const bytes = await readFile(abs);
  const base64 = bytes.toString("base64");
  console.error(`[calibrate] PDF ${abs} loaded (${bytes.length} bytes)`);

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), TIMEOUT_MS);

  const start = Date.now();
  let response;
  try {
    response = await client.messages.create(
      {
        model: MODEL,
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
                  data: base64,
                },
              },
              { type: "text", text: PROMPT },
            ],
          },
        ],
      },
      { signal: controller.signal },
    );
  } finally {
    clearTimeout(t);
  }
  const elapsed = Date.now() - start;

  const textBlock = response.content.find((b) => b.type === "text");
  if (!textBlock) {
    console.error("[calibrate] model returned no text block");
    process.exit(1);
  }
  const raw = textBlock.text;
  const stripped = raw
    .trim()
    .replace(/^```(?:json)?\s*\n?/, "")
    .replace(/\n?```$/, "");

  let parsed;
  try {
    parsed = JSON.parse(stripped);
  } catch (err) {
    console.error("[calibrate] model returned invalid JSON:");
    console.error(raw);
    process.exit(1);
  }

  const comps = parsed.comps ?? [];

  console.log(`\n=== Extracted ${comps.length} comps in ${elapsed}ms ===\n`);
  for (let i = 0; i < comps.length; i++) {
    const c = comps[i];
    console.log(`Comp ${i + 1}:`);
    console.log(`  address:    ${c.address ?? "(null)"}`);
    console.log(`  sold_price: ${c.sold_price ?? "(null)"}`);
    console.log(`  sold_date:  ${c.sold_date ?? "(null)"}`);
    console.log(`  sqft:       ${c.sqft ?? "(null)"}`);
    console.log(`  beds:       ${c.bedrooms ?? "(null)"}`);
    console.log(`  baths:      ${c.bathrooms ?? "(null)"}`);
    console.log(`  year_built: ${c.year_built ?? "(null)"}`);
    console.log(`  confidence: ${c.confidence ?? "(null)"}`);
    console.log("");
  }

  // Coverage roll-up — counts non-null per field. Manual ground-truth
  // comparison still required for the per-field accuracy gate, but the
  // coverage % is a useful first sanity check (a field that's null
  // across all comps is almost certainly a prompt miss).
  const fields = [
    "address",
    "sold_price",
    "sold_date",
    "sqft",
    "bedrooms",
    "bathrooms",
    "year_built",
  ];
  console.log("=== Per-field coverage (non-null / total) ===");
  for (const f of fields) {
    const populated = comps.filter((c) => c[f] !== null && c[f] !== undefined)
      .length;
    const pct = comps.length === 0 ? 0 : (populated / comps.length) * 100;
    console.log(
      `  ${f.padEnd(12)} ${String(populated).padStart(2)}/${comps.length} (${pct.toFixed(0)}%)`,
    );
  }

  console.log("\n=== Tokens / cost ===");
  console.log(`  input_tokens:  ${response.usage?.input_tokens ?? "?"}`);
  console.log(`  output_tokens: ${response.usage?.output_tokens ?? "?"}`);
  console.log(`  latency_ms:    ${elapsed}`);
  console.log(`  model:         ${MODEL}`);
  console.log(
    "\nNext: hand-audit each comp against the source PDF to score per-field accuracy.",
  );
  console.log("Acceptance gate: ≥85% across all 70 fixture data points.");
}

main().catch((err) => {
  console.error("[calibrate] fatal:", err);
  process.exit(1);
});
