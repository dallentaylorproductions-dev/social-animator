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
  pageUrl: string;
  voice: GenerateVoice;
  /** Present only when known (enrichment); NEVER invented. */
  sellerName?: string;
}

export type GenerateResult =
  | { ok: true; draft: PreparedDraft; tokenCapHit: boolean }
  | { ok: false; reason: "missing-key" | "timeout" | "malformed" | "error" };

const SYSTEM_PROMPT = [
  "You draft a short follow-up text message and a short follow-up email for a real estate agent to review before sending.",
  "Voice: calm, clear, professional, brief. No hype. No pressure. No exclamation points.",
  "Hard rule: never use an em dash. Use periods or commas.",
  "Honesty: restate only the points you are given. Do not add qualifiers, opinions, market claims, statistics, or any detail that is not in the provided sections. Restate, do not embellish.",
  "Never invent a seller name or any personal detail. If no seller name is provided, open without a name (for example: Hi there).",
  "Keep the text message to a few sentences. Keep the email to a short greeting, two or three sentences, and a sign off with the agent name.",
  "Do not write a call-to-action closing line; one is added separately.",
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
  lines.push(`Page link to include: ${input.pageUrl}`);
  lines.push("");
  lines.push("Points to restate (do not add any others):");
  input.bullets.forEach((b, i) => {
    lines.push(`${i + 1}. ${b.label}: ${b.text}`);
  });
  lines.push("");
  lines.push("Write the text message and the email that restate the points above and include the page link.");
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
    return { ok: false, reason: "error" };
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
    return { ok: true, draft, tokenCapHit: result.stop_reason === "max_tokens" };
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      return { ok: false, reason: "timeout" };
    }
    return { ok: false, reason: "error" };
  } finally {
    clearTimeout(timer);
  }
}
