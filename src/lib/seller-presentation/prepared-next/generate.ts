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
 * Honesty (v0.5 minimal-claims recap): the model is handed almost no FACTS to
 * overstate. NO page data — no bullets, no marketing/exposure, no comps, no
 * views, no valuation, no payload sections — reaches generation. The only factual
 * inputs are the safe `{ sellerName?, propertyLabel, appointmentAt? }`.
 *
 * v0.8: the agent's Studio Profile `voice` is re-added so the recap sounds like
 * the agent. Voice is TONE and word choice, not facts: it never adds, changes, or
 * embellishes a fact, and the honesty / no-claims rules OVERRIDE voice on any
 * conflict. Absent voice falls to the neutral Studio floor (warm, no fake
 * personalization). The model still cannot overstate data it is never given.
 */

import {
  getAnthropicClient,
  COMP_IMPORT_MODEL,
  MissingAnthropicKeyError,
} from "@/lib/ai/anthropic-client";
import { GEN_TIMEOUT_MS, MAX_GEN_OUTPUT_TOKENS } from "./constants";
import type { PreparedDraft } from "./work-order";

/**
 * The agent's Studio Profile voice — TONE cues only (no facts). `neutral` is true
 * when no usable cue exists, so the model uses the neutral Studio floor.
 */
export interface GenerateVoice {
  agentName: string;
  brokerage?: string;
  tagline?: string;
  signatureLine?: string;
  guarantee?: string;
  neutral: boolean;
}

export interface GenerateInput {
  /** The seller's real name, if known. NEVER invented; absent → warm, no name. */
  sellerName?: string;
  /** The property / page subject (address). The one concrete reference allowed. */
  propertyLabel: string;
  /** The upcoming appointment, if present on the page. Optional reference only. */
  appointmentAt?: string;
  /** Studio Profile voice (tone only). Absent → the neutral Studio floor. */
  voice?: GenerateVoice;
  // NOTE: the page link + closing CTA are NOT passed to the model — they are
  // appended by code (composePreparedDraft) after the validator. The model is
  // told to write no URL and no closing line, so it spends no budget on them.
}

export type GenerateResult =
  | {
      ok: true;
      draft: PreparedDraft;
      tokenCapHit: boolean;
    }
  | {
      ok: false;
      reason: "missing-key" | "timeout" | "malformed" | "error";
    };

const SYSTEM_PROMPT = [
  "You write a brief, warm follow-up text message and a brief follow-up email for a real estate agent to send to a seller they prepared a private overview for.",
  "Voice: calm, warm, clear, one to one, brief. No hype, no pressure, no exclamation points.",
  "Hard rule: never use an em dash. Use periods or commas.",
  "Naming: call the prepared thing 'a private overview' of the property, for example 'a private overview of 4270 Dudley Dr NE' or 'your private overview'. Always refer to it as a private overview. Never call it a page, a presentation, a report, a proposal, a packet, or a website. Keep the sentence natural and warm.",
  "Reference the private overview the agent PREPARED for the seller's property. You may mention the upcoming appointment only if one is provided below. Do not add your own offer to talk; that closing line is appended automatically.",
  "Make NO claims about market data, views, comparable sales, pricing, buyer activity, or trends. Do not mention numbers of any kind.",
  "Make NO claim about the home itself or about what the overview shows or reveals. The overview has not assessed the home yet. Never use words like showcases, special, stunning, beautiful, impressive, or really captures. Reference only that a private overview was prepared for the property.",
  "Do not write a closing offer or call-to-action line of your own, such as 'happy to walk you through', 'let me know', or 'reach out anytime'. A closing line is appended automatically, so end your text before any closer.",
  "If the email runs a little longer than the text, the extra content must be faithful only, for example that the private overview was prepared ahead of the upcoming appointment when one is provided. Never add an invented claim, a characterization, or filler. If there is nothing faithful to add, keep the email as short as the text.",
  "Never state or imply that you saw, noticed, or know the seller viewed or opened the overview. No surveillance tone.",
  "Never invent a seller name or any detail. If no seller name is provided, address the seller warmly without a name (for example: Hi there) and do not fake any personal detail.",
  "Voice: when voice cues are provided below, write in the agent's voice and match their warmth, tone, and word choice. Voice shapes warmth and word choice ONLY. It must never add, change, or embellish a fact, and never introduce hype, superlatives, or claims, even if the agent's described voice is energetic or salesy. All of the honesty and no-claims rules above take priority over voice on any conflict.",
  "If no voice cues are provided, write in a neutral, warm, professional, brief Studio voice. Either way, never invent a name or any personal detail.",
  "Text message: 1 to 2 sentences, about 25 to 45 words.",
  "Email: 2 to 3 sentences, about 50 to 80 words. A short greeting and the warm note. No subject line, no headers, no bullet lists, no signature block, and no closing line of your own.",
  "Do not write a closing call-to-action line, and do not write any link, URL, or web address. A link and a closing line are added automatically after your text, so leave them out entirely.",
  'Return ONLY a JSON object of the form {"textVariant": "...", "emailVariant": "..."} with no markdown and no commentary.',
].join("\n");

function buildUserPrompt(input: GenerateInput): string {
  const lines: string[] = [];
  const voice = input.voice;
  if (voice && !voice.neutral) {
    if (voice.agentName) {
      lines.push(`Agent: ${voice.agentName}${voice.brokerage ? `, ${voice.brokerage}` : ""}`);
    }
    const cues = [voice.tagline, voice.signatureLine, voice.guarantee].filter(Boolean);
    if (cues.length) {
      lines.push(
        `Agent voice cues (match their tone and word choice ONLY; never restate these as claims or facts): ${cues.join(" / ")}`,
      );
    }
  } else {
    lines.push("No agent voice is defined. Write in a neutral, warm, professional Studio voice.");
  }
  if (input.sellerName) {
    lines.push(`Seller name: ${input.sellerName}`);
  } else {
    lines.push("No seller name is known. Address the seller warmly without a name; do not invent one.");
  }
  lines.push(`Property the agent prepared a private overview for: ${input.propertyLabel}`);
  if (input.appointmentAt) {
    lines.push(`Upcoming appointment (you may reference it lightly, do not invent a day of week): ${input.appointmentAt}`);
  }
  lines.push("");
  lines.push("Write the warm text message and the warm email per the rules. Reference the prepared private overview for the property, and call it a private overview (never a page). Do not assess the home, do not add a closing offer of your own, and write no link or URL; a closing line and link are appended automatically.");
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
    return {
      ok: true,
      draft,
      tokenCapHit: result.stop_reason === "max_tokens",
    };
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      return { ok: false, reason: "timeout" };
    }
    return { ok: false, reason: "error" };
  } finally {
    clearTimeout(timer);
  }
}
