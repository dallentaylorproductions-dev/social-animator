/**
 * PREPARED_NEXT — the single capped generation call.
 *
 * Triggered ONLY by an explicit "Prepare follow-up" click (no background, no
 * auto). ONE model call produces a structured `{ textVariant, emailVariant }` —
 * one short text message + one email/recap variant — NOT two calls. Exactly one
 * call per invocation: there is NO automatic retry here; the route enforces the
 * two-generation cap (one initial + one manual retry) by counting WO generations.
 *
 * Limits are set at THIS new call site (the shared client enforces none):
 *   - `max_tokens: MAX_GEN_OUTPUT_TOKENS`
 *   - `AbortController` with `GEN_TIMEOUT_MS` (route maxDuration stays 60)
 *   - model: the existing Haiku 4.5 integration (`COMP_IMPORT_MODEL`)
 *
 * Honesty (input clip = the primary defense): the model is handed ONLY the <=3
 * clipped public sections + the agent's public voice/identity. It RESTATES each
 * passed section in the agent's voice. It may not add qualifiers, opinions, or
 * any claim absent from the source. Calm house voice, no em dashes. Thin-profile
 * floor: a neutral Studio voice with no fake personalization.
 */

import {
  getAnthropicClient,
  COMP_IMPORT_MODEL,
  MissingAnthropicKeyError,
} from "@/lib/ai/anthropic-client";
import { GEN_TIMEOUT_MS, MAX_GEN_OUTPUT_TOKENS } from "./constants";
import type { BulletCandidate } from "./bullets";
import type { PreparedDraft } from "./work-order";

export interface GenerateVoice {
  agentName: string;
  brokerage?: string;
  tagline?: string;
  signatureLine?: string;
  guarantee?: string;
  /** True when the profile has no defined voice → draft in the neutral Studio voice. */
  neutral: boolean;
}

export interface GenerateInput {
  bullets: BulletCandidate[];
  voice: GenerateVoice;
  /** Present only when known (enrichment); NEVER invented. */
  sellerName?: string;
  // NOTE: the page link is NOT passed to the model — it is appended by code
  // (composePreparedDraft) after the validator, like FALLBACK_CTA. The model is
  // told not to write any URL, so it spends no budget on the link (v0.2 fix).
}

export type GenerateResult =
  | {
      ok: true;
      draft: PreparedDraft;
      tokenCapHit: boolean;
      // TEMP (remove before flag flip): raw usage for the debug endpoint so the
      // walk can verify length directly. The route never branches on these.
      outputTokens?: number;
      stopReason?: string;
    }
  | {
      ok: false;
      reason: "missing-key" | "timeout" | "malformed" | "error";
      // TEMP (remove before flag flip): surface the caught exception so the
      // prepare route's PREPARED_NEXT walk log can record WHY a gen_exception
      // failed. Diagnostic only — the route never branches on these fields.
      errorName?: string;
      errorMessage?: string;
    };

const SYSTEM_PROMPT = [
  "You draft a short follow-up text message and a short follow-up email for a real estate agent to review before sending.",
  "Voice: calm, clear, professional, brief. No hype. No pressure. No exclamation points.",
  "Hard rule: never use an em dash. Use periods or commas.",
  "Honesty: restate only the points you are given. Do not add qualifiers, opinions, market claims, statistics, or any detail that is not in the provided sections. Restate, do not embellish.",
  "Never invent a seller name or any personal detail. If no seller name is provided, open without a name (for example: Hi there).",
  "Text message: 2 to 3 sentences, about 40 to 60 words total. One warm opener, the single most relevant point, and stop.",
  "Email: 3 to 5 sentences, about 90 to 130 words. A short greeting, one or two points, and a light close. No subject line, no headers, no bullet lists, no signature block.",
  "Do not enumerate. Never list more than one example address or listing. Summarize comparable sales as a count, for example 'a few recent nearby sales' or 'four recent closings nearby', not a list of addresses. Refer to exposure as reach, for example 'recent listings reaching thousands of buyers', not a roster of properties.",
  "Brevity must not become invention: restate only what the points contain, just more concisely.",
  "Do not write a closing call-to-action line, and do not write any link, URL, or web address. A page link and a closing line are added automatically after your text, so leave them out entirely.",
  'Return ONLY a JSON object of the form {"textVariant": "...", "emailVariant": "..."} with no markdown and no commentary.',
].join("\n");

function buildUserPrompt(input: GenerateInput): string {
  const { voice } = input;
  const lines: string[] = [];
  lines.push(`Agent: ${voice.agentName}${voice.brokerage ? `, ${voice.brokerage}` : ""}`);
  if (input.sellerName) lines.push(`Seller first name: ${input.sellerName}`);
  if (!voice.neutral) {
    const v: string[] = [];
    if (voice.tagline) v.push(voice.tagline);
    if (voice.signatureLine) v.push(voice.signatureLine);
    if (voice.guarantee) v.push(voice.guarantee);
    if (v.length) lines.push(`Agent voice cues: ${v.join(" / ")}`);
  } else {
    lines.push("No agent voice is defined. Use a neutral, warm, professional Studio voice.");
  }
  lines.push("");
  lines.push("Points to restate (do not add any others):");
  input.bullets.forEach((b, i) => {
    lines.push(`${i + 1}. ${b.label}: ${b.text}`);
  });
  lines.push("");
  lines.push("Write the text message and the email that restate the points above. Do not write any link or URL; a page link and closing line are appended automatically.");
  return lines.join("\n");
}

/** Strip a markdown code fence if the model wrapped its JSON in one. */
function stripFence(raw: string): string {
  return raw
    .trim()
    .replace(/^```(?:json)?\s*\n?/i, "")
    .replace(/\n?```$/i, "")
    .trim();
}

function parseDraft(raw: string): PreparedDraft | null {
  if (!raw) return null;
  try {
    const obj = JSON.parse(stripFence(raw)) as unknown;
    if (!obj || typeof obj !== "object") return null;
    const rec = obj as Record<string, unknown>;
    const textVariant = typeof rec.textVariant === "string" ? rec.textVariant : "";
    const emailVariant = typeof rec.emailVariant === "string" ? rec.emailVariant : "";
    if (!textVariant.trim() || !emailVariant.trim()) return null;
    return { textVariant: textVariant.trim(), emailVariant: emailVariant.trim() };
  } catch {
    return null;
  }
}

/**
 * Make the ONE capped generation call. Returns the parsed draft + whether the
 * model stopped at the token cap (so the validator can reject a truncated draft),
 * or a typed failure the route maps to the calm fallback. NO retry here.
 */
export async function generateFollowUpDraft(
  input: GenerateInput,
): Promise<GenerateResult> {
  let client: ReturnType<typeof getAnthropicClient>;
  try {
    client = getAnthropicClient();
  } catch (err) {
    if (err instanceof MissingAnthropicKeyError) return { ok: false, reason: "missing-key" };
    // TEMP (remove before flag flip): carry the exception detail for the walk log.
    return {
      ok: false,
      reason: "error",
      errorName: err instanceof Error ? err.name : "Unknown",
      errorMessage: err instanceof Error ? err.message : String(err),
    };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), GEN_TIMEOUT_MS);
  try {
    const result = await client.messages.create(
      {
        model: COMP_IMPORT_MODEL,
        max_tokens: MAX_GEN_OUTPUT_TOKENS,
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: buildUserPrompt(input) }],
      },
      { signal: controller.signal },
    );
    const block = result.content[0];
    const text = block && block.type === "text" ? block.text : "";
    const draft = parseDraft(text);
    if (!draft) return { ok: false, reason: "malformed" };
    return {
      ok: true,
      draft,
      tokenCapHit: result.stop_reason === "max_tokens",
      // TEMP (remove before flag flip): raw usage for the debug endpoint.
      outputTokens: result.usage?.output_tokens,
      stopReason: result.stop_reason ?? undefined,
    };
  } catch (err) {
    // TEMP (remove before flag flip): carry the exception detail for the walk log.
    if (err instanceof Error && err.name === "AbortError") {
      return { ok: false, reason: "timeout", errorName: err.name, errorMessage: err.message };
    }
    return {
      ok: false,
      reason: "error",
      errorName: err instanceof Error ? err.name : "Unknown",
      errorMessage: err instanceof Error ? err.message : String(err),
    };
  } finally {
    clearTimeout(timer);
  }
}
