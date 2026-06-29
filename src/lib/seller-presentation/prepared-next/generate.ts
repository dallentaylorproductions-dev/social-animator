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
 * Honesty (v0.5 minimal-claims recap): the model is handed almost nothing to
 * overstate. NO page data — no bullets, no marketing/exposure, no comps, no
 * views, no valuation, no payload sections — reaches generation. The ONLY inputs
 * are the safe, factual `{ sellerName?, propertyLabel, appointmentAt? }`. The
 * recap is a warm re-open that references the page the agent PREPARED and offers
 * to talk; it makes no market/data claims and never implies the seller was seen
 * viewing the page. The model cannot overstate data it is never given.
 */

import {
  getAnthropicClient,
  COMP_IMPORT_MODEL,
  MissingAnthropicKeyError,
} from "@/lib/ai/anthropic-client";
import { GEN_TIMEOUT_MS, MAX_GEN_OUTPUT_TOKENS } from "./constants";
import type { PreparedDraft } from "./work-order";

export interface GenerateInput {
  /** The seller's real name, if known. NEVER invented; absent → warm, no name. */
  sellerName?: string;
  /** The property / page subject (address). The one concrete reference allowed. */
  propertyLabel: string;
  /** The upcoming appointment, if present on the page. Optional reference only. */
  appointmentAt?: string;
  // NOTE: the page link + closing CTA are NOT passed to the model — they are
  // appended by code (composePreparedDraft) after the validator. The model is
  // told to write no URL and no closing line, so it spends no budget on them.
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
  "You write a brief, warm follow-up text message and a brief follow-up email for a real estate agent to send to a seller they prepared a page for.",
  "Voice: calm, warm, clear, one to one, brief. No hype, no pressure, no exclamation points.",
  "Hard rule: never use an em dash. Use periods or commas.",
  "Reference the page the agent PREPARED for the seller's property, and offer to walk them through it. You may mention the upcoming appointment only if one is provided below.",
  "Make NO claims about market data, views, comparable sales, pricing, buyer activity, or trends. Do not mention numbers of any kind.",
  "Never state or imply that you saw, noticed, or know the seller viewed or opened the page. No surveillance tone.",
  "Never invent a seller name or any detail. If no seller name is provided, address the seller warmly without a name (for example: Hi there) and do not fake any personal detail.",
  "Text message: 1 to 2 sentences, about 25 to 45 words.",
  "Email: 2 to 3 sentences, about 50 to 80 words. A short greeting, the warm note, and a light close. No subject line, no headers, no bullet lists, no signature block.",
  "Do not write a closing call-to-action line, and do not write any link, URL, or web address. A page link and a closing line are added automatically after your text, so leave them out entirely.",
  'Return ONLY a JSON object of the form {"textVariant": "...", "emailVariant": "..."} with no markdown and no commentary.',
].join("\n");

function buildUserPrompt(input: GenerateInput): string {
  const lines: string[] = [];
  if (input.sellerName) {
    lines.push(`Seller name: ${input.sellerName}`);
  } else {
    lines.push("No seller name is known. Address the seller warmly without a name; do not invent one.");
  }
  lines.push(`Property the agent prepared a page for: ${input.propertyLabel}`);
  if (input.appointmentAt) {
    lines.push(`Upcoming appointment (you may reference it lightly, do not invent a day of week): ${input.appointmentAt}`);
  }
  lines.push("");
  lines.push("Write the warm text message and the warm email per the rules. Reference the prepared page for the property and offer to talk. Make no data claims and write no link or URL; a page link and closing line are appended automatically.");
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
