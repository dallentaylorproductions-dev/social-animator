import { NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { kv } from "@vercel/kv";
import { auth } from "@/lib/auth";
import { loadAgentProfile } from "@/lib/entitlements/load-agent-profile";
import { resolveEntitlements, resolveSkill } from "@/lib/entitlements/resolver";
import { dailyCompImportCap } from "@/lib/entitlements/usage-caps";
import { SELLER_PRESENTATION_SKILL } from "@/tools/seller-presentation/skill";
import { parse as parseCsvTsv } from "@/lib/csv-tsv-parse";
import {
  mapColumnsWithAI,
  buildCacheKey,
  type ColumnMapping,
} from "@/lib/ai/comp-import-mapper";
import {
  MissingAnthropicKeyError,
} from "@/lib/ai/anthropic-client";
import { projectCompRows } from "@/lib/ai/comp-import-project";
import type { ImportedComp, MappingNote } from "@/lib/ai/comp-import-project";
import {
  extractCompsFromPdf,
  buildPdfCacheKey,
  LOW_CONFIDENCE_ROW_FRACTION,
} from "@/lib/ai/comp-import-pdf-mapper";

/**
 * POST /api/comp-import (v1.47 Lane C friction-AI).
 *
 * The agent uploads their own MLS export (NWMLS Matrix "Full" is the
 * lead fixture — tab-separated, ~140 columns); a cheap text-model
 * column-mapping call infers which export columns map to the Comp
 * schema; the route returns candidate Comp records the review screen
 * renders for the agent to pick/edit/apply.
 *
 * Discipline (substrate §5.4–5.6):
 *   - Feature-flag controllable. COMP_IMPORT_ENABLED=false → 503.
 *   - Auth + tier gate. aiAccess.state must be 'available'.
 *   - Rate limit. rate_limit_comp_import:<email> 10/hr, mirrors the
 *     /login pattern in src/lib/auth.ts.
 *   - Daily cap. ai_comp_import_count:<email>:<YYYY-MM-DD>, per access
 *     mode (internal-test 100 / team-invite 50 / trial 15 / paid 25,
 *     fallback 10) — see DAILY_COMP_IMPORT_CAPS.
 *   - Raw upload never persisted. Bytes read into memory, hashed for
 *     cache, fed to parser, discarded. (kv.set / blob writes do NOT
 *     touch the raw upload — only the AI MAPPING is cached, keyed by
 *     content hash.)
 *   - One AI call per file (mapping), never per row. The remaining
 *     rows project locally via the returned mapping.
 *   - 24h cache on file hash. Same export re-uploaded = one paid call.
 *   - 5 MB cap on the upload (NWMLS 90-day full export is ~500 KB).
 *
 * The Comp shape's existing public-payload boundary is the privacy
 * enforcer downstream. This route projects ONLY the Comp fields —
 * the 130+ MLS columns that don't map (Owner Name, Listing Agent ID,
 * Phone to Show, Agent Only Remarks, etc.) are never even named in
 * this response.
 */

export const runtime = "nodejs";
// Must exceed the internal AI timeouts so a slow Anthropic call trips its own
// timeout (and surfaces the calm ai-unavailable fallback) rather than Vercel
// killing the lambda first (silent 502, no log). PDF extraction is meaningfully
// slower than CSV column-mapping (~25s budget vs 12s) so the outer headroom
// bumps from 30s to 60s.
export const maxDuration = 60;

const MAX_BYTES = 5 * 1024 * 1024;
const RATE_LIMIT_WINDOW_SECONDS = 3600;
const RATE_LIMIT_MAX_PER_HOUR = 10;
const CACHE_TTL_SECONDS = 24 * 3600;
const MAX_CANDIDATES_RETURNED = 50;

const CSV_EXTENSIONS = new Set([".csv", ".tsv", ".txt"]);
const PDF_EXTENSIONS = new Set([".pdf"]);

type InputMode = "csv" | "pdf";

interface ApiOk {
  ok: true;
  candidates: ImportedComp[];
  mappingNotes: MappingNote[];
  totalRows: number;
  returnedCount: number;
  skippedRowCount: number;
  cacheHit: boolean;
  /** "tab"/"comma" for the CSV path; "pdf" for the vision path. */
  delimiter: "tab" | "comma" | "pdf";
  /** Which input mode produced the candidates. UI surfaces a vision-mode hint when "pdf". */
  mode: InputMode;
  /** Diagnostic — never PII. Useful for the handoff cost table. */
  ai?: { source: "live" | "fixture" | "cache"; latencyMs: number; retried: boolean };
}

interface ApiErr {
  ok: false;
  code:
    | "feature-disabled"
    | "not-authenticated"
    | "upgrade-required"
    | "rate-limited"
    | "daily-cap-hit"
    | "file-too-large"
    | "file-format"
    | "ai-unavailable"
    | "ai-malformed"
    | "internal";
  message: string;
}

export async function POST(req: Request): Promise<NextResponse<ApiOk | ApiErr>> {
  // 1) Feature flag — killable in prod without a redeploy.
  // Test-only override: in non-production, the header
  // `X-Comp-Import-Test-Disable: 1` simulates COMP_IMPORT_ENABLED=false
  // for a single request so the feature-flag-off spec doesn't have to
  // restart the dev server. Production ignores the header.
  const testForceDisabled =
    process.env.NODE_ENV !== "production" &&
    req.headers.get("x-comp-import-test-disable") === "1";
  if (process.env.COMP_IMPORT_ENABLED !== "true" || testForceDisabled) {
    return NextResponse.json(
      {
        ok: false,
        code: "feature-disabled",
        message:
          "Comp import is not enabled. You can still add comps by hand below.",
      } satisfies ApiErr,
      { status: 503 },
    );
  }

  // 2) Auth — must be a signed-in user. Under E2E_TESTING (non-prod
  //    only, set by playwright.config.ts), allow unauthenticated
  //    callers to reach the route; loadAgentProfile gets `null` so
  //    KV is never touched, and the test can ?testTier= to choose
  //    a tier. Production requires a real session.
  const e2eBypass =
    process.env.NODE_ENV !== "production" && process.env.E2E_TESTING === "1";
  const session = await auth();
  const email = session?.user?.email ?? null;
  if (!email && !e2eBypass) {
    return NextResponse.json(
      {
        ok: false,
        code: "not-authenticated",
        message: "Please sign in to import comps.",
      } satisfies ApiErr,
      { status: 401 },
    );
  }
  // Stable KV key fallback for the rate-limit / daily-cap counters in
  // E2E (no real session). Production never hits this branch — the
  // !email && !e2eBypass gate above already 401's.
  const kvKeyEmail = email ?? "e2e-anonymous@example.test";

  // 3) Tier gate — resolve aiAccess via the same path as the dashboard.
  //    `email || null` mirrors src/app/dashboard/page.tsx so empty
  //    sessions short-circuit loadAgentProfile (no KV reads under E2E).
  //    ?testTier= URL knob threads through loadAgentProfile.
  const url = new URL(req.url);
  const testTier = url.searchParams.get("testTier");
  const agentProfile = await loadAgentProfile(email || null, { testTier });
  const ent = resolveEntitlements(agentProfile);
  const resolved = resolveSkill(SELLER_PRESENTATION_SKILL, ent);
  if (resolved.aiAccess.state !== "available") {
    return NextResponse.json(
      {
        ok: false,
        code: "upgrade-required",
        message:
          "Upgrade to Pro to import comps from your MLS export. You can still add comps by hand below.",
      } satisfies ApiErr,
      { status: 403 },
    );
  }

  // 4) Rate limit — mirrors src/lib/auth.ts's pattern. 10/hr/email.
  // Test-only header forces the 429 so the calm copy is e2e-asserted
  // without needing a live KV that can be exhausted.
  const testForceRateLimit =
    process.env.NODE_ENV !== "production" &&
    req.headers.get("x-comp-import-test-force-rate-limit") === "1";
  if (testForceRateLimit) {
    return NextResponse.json(
      {
        ok: false,
        code: "rate-limited",
        message: "Too many imports — try again in a moment.",
      } satisfies ApiErr,
      { status: 429 },
    );
  }
  try {
    const rlKey = `rate_limit_comp_import:${kvKeyEmail}`;
    const count = (await kv.incr(rlKey)) as number;
    if (count === 1) await kv.expire(rlKey, RATE_LIMIT_WINDOW_SECONDS);
    if (count > RATE_LIMIT_MAX_PER_HOUR) {
      return NextResponse.json(
        {
          ok: false,
          code: "rate-limited",
          message: "Too many imports — try again in a moment.",
        } satisfies ApiErr,
        { status: 429 },
      );
    }
  } catch (err) {
    // KV unavailable in dev/test — skip the rate limit. Cost-discipline
    // sits on top of (a) the daily cap (also KV but skipped on KV
    // failure) AND (b) the feature flag AND (c) the per-call hard
    // timeout, so a temporarily-degraded KV doesn't open the floodgates.
    if (!e2eBypass) console.warn("[comp-import] rate-limit KV unavailable:", err);
  }

  // 5) Daily cap. ai_comp_import_count:<email>:<YYYY-MM-DD>, per access mode.
  // Test-only header forces the daily-cap 429 so its calm copy is
  // e2e-asserted without a live KV that can be exhausted — mirrors the
  // x-comp-import-test-force-rate-limit pattern above. Inert in prod.
  const dailyCap = dailyCompImportCap(ent.accessMode);
  const testForceDailyCap =
    process.env.NODE_ENV !== "production" &&
    req.headers.get("x-comp-import-test-force-daily-cap") === "1";
  if (testForceDailyCap) {
    return NextResponse.json(
      {
        ok: false,
        code: "daily-cap-hit",
        message:
          "You've hit today's import limit. Add comps by hand below or try again tomorrow.",
      } satisfies ApiErr,
      { status: 429 },
    );
  }
  try {
    const today = new Date().toISOString().slice(0, 10);
    const capKey = `ai_comp_import_count:${kvKeyEmail}:${today}`;
    const used = (await kv.incr(capKey)) as number;
    if (used === 1) await kv.expire(capKey, 2 * 24 * 3600);
    if (used > dailyCap) {
      return NextResponse.json(
        {
          ok: false,
          code: "daily-cap-hit",
          message:
            "You've hit today's import limit. Add comps by hand below or try again tomorrow.",
        } satisfies ApiErr,
        { status: 429 },
      );
    }
  } catch (err) {
    if (!e2eBypass) console.warn("[comp-import] daily-cap KV unavailable:", err);
  }

  // 6) Read the upload. multipart/form-data with one File field.
  //    Mode is decided here by file extension — CSV/TSV/TXT goes through
  //    the column-mapping path, PDF goes through the vision-extraction
  //    path. Anything else returns the calm "wrong file type" error.
  let mode: InputMode;
  let csvText: string = "";
  let pdfBytes: Buffer | null = null;
  try {
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json(
        {
          ok: false,
          code: "file-format",
          message: "No file was uploaded.",
        } satisfies ApiErr,
        { status: 400 },
      );
    }
    if (file.size > MAX_BYTES) {
      return NextResponse.json(
        {
          ok: false,
          code: "file-too-large",
          message: "File is larger than 5 MB. Try a narrower MLS search.",
        } satisfies ApiErr,
        { status: 413 },
      );
    }
    const lower = file.name.toLowerCase();
    const ext = lower.includes(".")
      ? lower.slice(lower.lastIndexOf("."))
      : "";
    if (CSV_EXTENSIONS.has(ext)) {
      mode = "csv";
      csvText = await file.text();
    } else if (PDF_EXTENSIONS.has(ext)) {
      mode = "pdf";
      // Read raw bytes — NEVER file.text() (UTF-8 decode mangles binary).
      // The v1.48 prod 502 was a corrupt PDF read on Vercel's Lambda
      // (instrumentation: hasPdfMagic=false, byteLength != file size) while
      // local Node read it cleanly. readPdfBytesResilient tries three
      // File->bytes paths and uses the first that yields valid %PDF magic,
      // and logs which one (and why the others failed) for the smoke.
      pdfBytes = await readPdfBytesResilient(file, !e2eBypass);
    } else {
      return NextResponse.json(
        {
          ok: false,
          code: "file-format",
          message:
            "Please upload a CSV, TSV, TXT, or PDF file from your MLS export.",
        } satisfies ApiErr,
        { status: 400 },
      );
    }
  } catch (err) {
    if (!e2eBypass) console.warn("[comp-import] upload read failed:", err);
    return NextResponse.json(
      {
        ok: false,
        code: "file-format",
        message: "I couldn't read that file clearly.",
      } satisfies ApiErr,
      { status: 400 },
    );
  }

  if (mode === "pdf" && pdfBytes) {
    return handlePdf(pdfBytes, e2eBypass);
  }

  // 7) Parse delimiter + rows. Raw is discarded after this block —
  //    everything downstream operates on string[][].
  let parsed: ReturnType<typeof parseCsvTsv>;
  try {
    parsed = parseCsvTsv(csvText);
  } catch {
    return NextResponse.json(
      {
        ok: false,
        code: "file-format",
        message: "I couldn't recognize the file format.",
      } satisfies ApiErr,
      { status: 400 },
    );
  }
  const { delimiter, header, rows } = parsed;

  if (header.length === 0 || rows.length === 0) {
    return NextResponse.json(
      {
        ok: false,
        code: "file-format",
        message: "The file looks empty.",
      } satisfies ApiErr,
      { status: 400 },
    );
  }

  // 8) Hash the FILE CONTENT (not the bytes that just rode through —
  //    they're identical, but hashing the typed string keeps it
  //    encoding-stable). Cache lookup, 24h TTL.
  const hash = createHash("sha256").update(csvText).digest("hex");
  csvText = ""; // Drop the reference; not persisted anywhere else.
  // Versioned by PROMPT_VERSION — bumping it auto-invalidates prior entries.
  const cacheKey = buildCacheKey(hash);

  let mapping: ColumnMapping | null = null;
  let cacheHit = false;
  try {
    const cached = (await kv.get(cacheKey)) as ColumnMapping | null;
    if (cached) {
      mapping = cached;
      cacheHit = true;
    }
  } catch (err) {
    if (!e2eBypass) console.warn("[comp-import] cache read failed:", err);
  }

  let aiSource: "live" | "fixture" | "cache" = "cache";
  let aiLatencyMs = 0;
  let aiRetried = false;

  if (!mapping) {
    try {
      const sampleRows = rows.slice(0, 3);
      const ai = await mapColumnsWithAI({ header, sampleRows });
      mapping = ai.mapping;
      aiSource = ai.source;
      aiLatencyMs = ai.latencyMs;
      aiRetried = ai.retried;
      try {
        await kv.set(cacheKey, mapping, { ex: CACHE_TTL_SECONDS });
      } catch (err) {
        if (!e2eBypass) console.warn("[comp-import] cache write failed:", err);
      }
    } catch (err) {
      console.error("[comp-import] AI mapping failure", {
        message: err instanceof Error ? err.message : String(err),
        stack: err instanceof Error ? err.stack : undefined,
      });
      if (err instanceof MissingAnthropicKeyError) {
        return NextResponse.json(
          {
            ok: false,
            code: "ai-unavailable",
            message:
              "I couldn't read that file clearly. You can still add comps by hand below.",
          } satisfies ApiErr,
          { status: 502 },
        );
      }
      const message =
        err instanceof Error && err.message === "ai-malformed-json"
          ? "I couldn't read the column layout clearly. You can still add comps by hand below."
          : "I couldn't read that file clearly. You can still add comps by hand below.";
      return NextResponse.json(
        {
          ok: false,
          code:
            err instanceof Error && err.message === "ai-malformed-json"
              ? "ai-malformed"
              : "ai-unavailable",
          message,
        } satisfies ApiErr,
        { status: 502 },
      );
    }
  }

  // 9) Project every remaining row using the AI's mapping. Pure local.
  const result = projectCompRows(header, rows, mapping);
  const trimmedCandidates = result.comps.slice(0, MAX_CANDIDATES_RETURNED);

  return NextResponse.json({
    ok: true,
    candidates: trimmedCandidates,
    mappingNotes: result.mappingNotes,
    totalRows: rows.length,
    returnedCount: trimmedCandidates.length,
    skippedRowCount: result.skippedRowCount,
    cacheHit,
    delimiter: delimiter === "\t" ? "tab" : "comma",
    mode: "csv",
    ai: { source: aiSource, latencyMs: aiLatencyMs, retried: aiRetried },
  } satisfies ApiOk);
}

/**
 * PDF dispatch path — vision-mode extraction via the AIPlugPoint's
 * already-declared `vision` mode. The model returns a flat ImportedComp
 * shape directly (no column-mapping intermediate), and the response
 * shape matches the CSV path so the review modal renders unchanged.
 */
/**
 * Resilient PDF byte read (v1.48 prod-502 read-path fix).
 *
 * The prod 502 was Anthropic rejecting a corrupt base64 PDF: on Vercel's
 * Lambda the multipart File read returned non-PDF bytes (instrumentation:
 * hasPdfMagic=false, byteLength != the real file size) while local Node read
 * it cleanly. CSV (UTF-8-safe) survived; binary PDF did not.
 *
 * Rather than bet on one read method, try the three File->bytes paths in
 * order and use the FIRST whose bytes start with the "%PDF-" magic. Each
 * stresses a different layer:
 *   - arrayBuffer: the canonical path (what was failing in prod).
 *   - bytes():     Uint8Array straight from undici, skips the ArrayBuffer.
 *   - stream():    re-reads through a fresh Response, sidestepping whatever
 *                  mangled the File's own buffer.
 *
 * Logs file.size/type + each method's length/first8/magic, so a single smoke
 * tells us which path is intact — or, if none is (the File is corrupt at
 * parse time, e.g. file.size is already wrong), that the client-base64
 * escalation is the next step. Falls back to the first successful read so the
 * downstream %PDF guard in handlePdf still fires the calm CSV fallback.
 */
async function readPdfBytesResilient(
  file: File,
  log: boolean,
): Promise<Buffer> {
  const attempts: Array<[string, () => Promise<Buffer>]> = [
    [
      "arrayBuffer",
      async () => Buffer.from(new Uint8Array(await file.arrayBuffer())),
    ],
    [
      "bytes",
      async () => {
        const f = file as unknown as { bytes?: () => Promise<Uint8Array> };
        if (typeof f.bytes !== "function") {
          throw new Error("file.bytes() unavailable on this runtime");
        }
        return Buffer.from(await f.bytes());
      },
    ],
    [
      "stream",
      async () => Buffer.from(await new Response(file.stream()).arrayBuffer()),
    ],
  ];

  const diag: Record<string, unknown> = {
    fileSize: file.size,
    fileType: file.type,
    fileName: file.name,
  };
  let chosen: { bytes: Buffer; method: string } | null = null;
  let fallback: Buffer | null = null;

  for (const [name, read] of attempts) {
    try {
      const bytes = await read();
      fallback ??= bytes;
      const magic = bytes.subarray(0, 5).toString("latin1") === "%PDF-";
      diag[name] = {
        len: bytes.length,
        first8: bytes.toString("base64").slice(0, 8),
        magic,
      };
      if (magic && !chosen) chosen = { bytes, method: name };
    } catch (err) {
      diag[name] = { error: err instanceof Error ? err.message : String(err) };
    }
  }

  if (log) {
    console.log("[comp-import] PDF read diag", {
      chosen: chosen?.method ?? "none",
      ...diag,
    });
  }

  if (chosen) return chosen.bytes;
  // No method produced valid magic — hand back the first successful read (or
  // an empty buffer if every read threw) so the %PDF guard surfaces the calm
  // fallback rather than crashing.
  return fallback ?? Buffer.alloc(0);
}

async function handlePdf(
  pdfBytes: Buffer,
  e2eBypass: boolean,
): Promise<NextResponse<ApiOk | ApiErr>> {
  const hash = createHash("sha256").update(pdfBytes).digest("hex");
  const cacheKey = buildPdfCacheKey(hash);

  interface PdfCached {
    candidates: ImportedComp[];
    mappingNotes: MappingNote[];
    totalRows: number;
    skippedRowCount: number;
  }
  let cached: PdfCached | null = null;
  try {
    cached = (await kv.get(cacheKey)) as PdfCached | null;
  } catch (err) {
    if (!e2eBypass) console.warn("[comp-import] pdf cache read failed:", err);
  }

  if (cached) {
    const trimmedCandidates = cached.candidates.slice(0, MAX_CANDIDATES_RETURNED);
    return NextResponse.json({
      ok: true,
      candidates: trimmedCandidates,
      mappingNotes: cached.mappingNotes,
      totalRows: cached.totalRows,
      returnedCount: trimmedCandidates.length,
      skippedRowCount: cached.skippedRowCount,
      cacheHit: true,
      delimiter: "pdf",
      mode: "pdf",
      ai: { source: "cache", latencyMs: 0, retried: false },
    } satisfies ApiOk);
  }

  const pdfBase64 = pdfBytes.toString("base64");

  // Defensive instrumentation + early guard (v1.48 prod-502 fix).
  // Anthropic rejected the prod request with invalid_request_error
  // "The PDF specified was not valid" at messages.0.content.0...source.base64.data
  // — i.e. the decoded bytes weren't a valid PDF. That read cleanly under
  // local Node, so the corruption is runtime-specific. A valid PDF's bytes
  // begin with "%PDF" (base64 prefix "JVBERi0"). If the magic bytes are
  // wrong here, the byte read corrupted the binary — fail fast with the calm
  // fallback (and a greppable log) rather than burn a paid Anthropic call on
  // a payload we already know it will reject.
  const hasPdfMagic = pdfBytes.subarray(0, 5).toString("latin1") === "%PDF-";
  if (!e2eBypass) {
    console.log("[comp-import] PDF bytes check", {
      byteLength: pdfBytes.length,
      base64Length: pdfBase64.length,
      base64First8: pdfBase64.slice(0, 8),
      hasPdfMagic,
    });
  }
  if (!hasPdfMagic) {
    console.error("[comp-import] PDF read corrupted before extraction", {
      byteLength: pdfBytes.length,
      base64First8: pdfBase64.slice(0, 8),
    });
    return NextResponse.json(
      {
        ok: false,
        code: "ai-unavailable",
        message:
          "I couldn't read that PDF clearly. For the cleanest results, try the CSV or TSV export from your MLS — or add comps by hand below.",
      } satisfies ApiErr,
      { status: 502 },
    );
  }

  let result;
  try {
    result = await extractCompsFromPdf(pdfBase64);
  } catch (err) {
    console.error("[comp-import] PDF extraction failure", {
      message: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack : undefined,
    });
    if (err instanceof MissingAnthropicKeyError) {
      return NextResponse.json(
        {
          ok: false,
          code: "ai-unavailable",
          message:
            "I couldn't read that PDF clearly. For the cleanest results, try the CSV or TSV export from your MLS — or add comps by hand below.",
        } satisfies ApiErr,
        { status: 502 },
      );
    }
    const malformed = err instanceof Error && err.message === "ai-malformed-json";
    return NextResponse.json(
      {
        ok: false,
        code: malformed ? "ai-malformed" : "ai-unavailable",
        message:
          "I couldn't read that PDF clearly. For the cleanest results, try the CSV or TSV export from your MLS — or add comps by hand below.",
      } satisfies ApiErr,
      { status: 502 },
    );
  }

  // Fallback gate: if the model couldn't extract any rows, OR more than
  // LOW_CONFIDENCE_ROW_FRACTION of returned rows were low-confidence, the
  // PDF wasn't a good fit — surface the calm "try CSV" copy rather than
  // render a bad modal that wastes the agent's confirmation budget.
  const tooFewRows = result.comps.length === 0;
  const lowConfFrac =
    result.comps.length === 0
      ? 1
      : result.lowConfidenceRowCount / result.comps.length;
  if (tooFewRows || lowConfFrac > LOW_CONFIDENCE_ROW_FRACTION) {
    return NextResponse.json(
      {
        ok: false,
        code: "ai-unavailable",
        message:
          "PDF parsing wasn't confident on this file — for the cleanest results, try the CSV or TSV export from your MLS.",
      } satisfies ApiErr,
      { status: 502 },
    );
  }

  try {
    await kv.set(
      cacheKey,
      {
        candidates: result.comps,
        mappingNotes: result.mappingNotes,
        totalRows: result.totalRows,
        skippedRowCount: result.skippedRowCount,
      },
      { ex: CACHE_TTL_SECONDS },
    );
  } catch (err) {
    if (!e2eBypass) console.warn("[comp-import] pdf cache write failed:", err);
  }

  const trimmedCandidates = result.comps.slice(0, MAX_CANDIDATES_RETURNED);
  return NextResponse.json({
    ok: true,
    candidates: trimmedCandidates,
    mappingNotes: result.mappingNotes,
    totalRows: result.totalRows,
    returnedCount: trimmedCandidates.length,
    skippedRowCount: result.skippedRowCount,
    cacheHit: false,
    delimiter: "pdf",
    mode: "pdf",
    ai: {
      source: result.source,
      latencyMs: result.latencyMs,
      retried: result.retried,
    },
  } satisfies ApiOk);
}
