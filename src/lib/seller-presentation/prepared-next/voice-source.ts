/**
 * PREPARED_NEXT — resolve the recap's voice from the agent's LIVE brand Profile.
 *
 * v1.1: voice is agent-constant IDENTITY (like the headshot / track record), not
 * per-page data, so it must always be current — it must not depend on whether a
 * given page was republished after the agent set their voice in Settings. We read
 * it from the same owner-scoped brand store Settings writes to (`brand:<email>`),
 * NOT from the frozen per-page published payload (which only carries State-A
 * snapshot values and was the v1.0 gap: invitation pages fell to `neutral`).
 *
 * The page's DATA stays frozen at publish (correct for honesty); only the
 * tone/voice cues become live. Fields mirror `brandToPublishInputs`: agentName /
 * brokerage / agentTagline / signatureLine / whyUs.guarantee. `neutral` is true
 * only when the live tagline + signature + guarantee are all genuinely empty.
 */

import { getOwnedBrandSettings } from "@/lib/brand-settings-store";
import type { BrandSettings } from "@/lib/brand";
import type { GenerateVoice } from "./generate";

function trimmed(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

/**
 * Build the {@link GenerateVoice} from the owner's current brand Profile. Best-
 * effort: a missing record or a KV hiccup falls back to the neutral floor with
 * the supplied fallback agent name, so a prepare never fails on the voice read.
 */
export async function loadAgentVoice(
  email: string,
  fallbackAgentName: string,
): Promise<GenerateVoice> {
  let brand: BrandSettings | undefined;
  try {
    const record = await getOwnedBrandSettings(email);
    brand = record?.settings;
  } catch {
    brand = undefined;
  }

  const agentName =
    trimmed(brand?.agentName) ?? trimmed(fallbackAgentName) ?? "Your agent";
  const brokerage = trimmed(brand?.brokerage);
  const tagline = trimmed(brand?.agentTagline);
  const signatureLine = trimmed(brand?.signatureLine);
  const guarantee = trimmed(brand?.whyUs?.guarantee);

  return {
    agentName,
    brokerage,
    tagline,
    signatureLine,
    guarantee,
    neutral: !tagline && !signatureLine && !guarantee,
  };
}
