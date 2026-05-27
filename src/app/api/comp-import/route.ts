import { NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { kv } from "@vercel/kv";
import { auth } from "@/lib/auth";
import { loadAgentProfile } from "@/lib/entitlements/load-agent-profile";
import { resolveEntitlements, resolveSkill } from "@/lib/entitlements/resolver";
import { SELLER_PRESENTATION_SKILL } from "@/tools/seller-presentation/skill";
import { parse as parseCsvTsv } from "@/lib/csv-tsv-parse";
import {
  mapColumnsWithAI,
  type ColumnMapping,
} from "@/lib/ai/comp-import-mapper";
import {
  MissingAnthropicKeyError,
} from "@/lib/ai/anthropic-client";
import { projectCompRows } from "@/lib/ai/comp-import-project";

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
 *   - Daily cap. ai_comp_import_count:<email>:<YYYY-MM-DD> 10/day.
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

const MAX_BYTES = 5 * 1024 * 1024;
const RATE_LIMIT_WINDOW_SECONDS = 3600;
const RATE_LIMIT_MAX_PER_HOUR = 10;
const DAILY_CAP = 10;
const CACHE_TTL_SECONDS = 24 * 3600;
const MAX_CANDIDATES_RETURNED = 50;

const ALLOWED_EXTENSIONS = new Set([".csv", ".tsv", ".txt"]);

interface ApiOk {
  ok: true;
  candidates: ReturnType<typeof projectCompRows>["comps"];
  mappingNotes: ReturnType<typeof projectCompRows>["mappingNotes"];
  totalRows: number;
  returnedCount: number;
  skippedRowCount: number;
  cacheHit: boolean;
  delimiter: "tab" | "comma";
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

  // 5) Daily cap. ai_comp_import_count:<email>:<YYYY-MM-DD>, 10/day.
  try {
    const today = new Date().toISOString().slice(0, 10);
    const capKey = `ai_comp_import_count:${kvKeyEmail}:${today}`;
    const used = (await kv.incr(capKey)) as number;
    if (used === 1) await kv.expire(capKey, 2 * 24 * 3600);
    if (used > DAILY_CAP) {
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
  let raw: string;
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
    if (!ALLOWED_EXTENSIONS.has(ext)) {
      return NextResponse.json(
        {
          ok: false,
          code: "file-format",
          message:
            "Please upload a CSV, TSV, or TXT file from your MLS export.",
        } satisfies ApiErr,
        { status: 400 },
      );
    }
    raw = await file.text();
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

  // 7) Parse delimiter + rows. Raw is discarded after this block —
  //    everything downstream operates on string[][].
  let parsed: ReturnType<typeof parseCsvTsv>;
  try {
    parsed = parseCsvTsv(raw);
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
  const hash = createHash("sha256").update(raw).digest("hex");
  raw = ""; // Drop the reference; not persisted anywhere else.
  const cacheKey = `comp_import_mapping_cache:${hash}`;

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
    ai: { source: aiSource, latencyMs: aiLatencyMs, retried: aiRetried },
  } satisfies ApiOk);
}
