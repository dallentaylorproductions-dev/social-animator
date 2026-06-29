import { test, expect } from "@playwright/test";
import {
  loadAgentVoice,
  voiceFields,
  voiceSignature,
} from "../src/lib/seller-presentation/prepared-next/voice-source";
import type { BrandSettings } from "../src/lib/brand";
// Controls imported by RELATIVE path; voice-source.ts reaches the same file via
// the remapped "@/lib/brand-settings-store" specifier (tsconfig.unit.json). Same
// absolute path => same module singleton. Relative import keeps the spec type-clean
// under the MAIN tsconfig, so `next build` never sees fake-only exports.
import {
  __setBrandFixture,
  __setBrandThrows,
  __resetBrand,
} from "./_fakes/brand-settings-store";

/**
 * PREPARED_NEXT v1.2 - regression lock for `voice-source.ts`, the neutral floor.
 *
 * `loadAgentVoice` reads the agent's LIVE brand Profile and must be BEST-EFFORT:
 * an empty / missing / failing read can never fail a prepare, it falls to the
 * neutral house voice. `getOwnedBrandSettings` is redirected to an in-memory fake
 * (tsconfig.unit.json) whose `__`-helpers we import from the SAME specifier so we
 * drive the exact record voice-source consumes.
 *
 * v1.2 HONEST INPUTS: the voice is shaped by the fields the agent can SEE and SET
 * - Tagline (`agentTagline`), signature line (`signatureLine`), and the visible
 * CTA reassurance line (`agentCtaReassurance`). The hidden `whyUs.guarantee` is no
 * longer consulted. `neutral` is true ONLY when all three visible cues are empty.
 */

const EMAIL = "agent@example.com";

test.beforeEach(() => __resetBrand());
test.afterEach(() => __resetBrand());

function record(settings: Record<string, unknown>) {
  return { ownerEmail: EMAIL, updatedAt: "2026-06-01T00:00:00.000Z", settings };
}

test("empty profile (no tagline / signature / reassurance) -> neutral floor", async () => {
  __setBrandFixture(record({ agentName: "Dana Rae", brokerage: "Cedar Realty" }));
  const voice = await loadAgentVoice(EMAIL, "Fallback Name");
  expect(voice.neutral).toBe(true);
  // Identity still carries through; only the tone cues are absent.
  expect(voice.agentName).toBe("Dana Rae");
  expect(voice.brokerage).toBe("Cedar Realty");
  expect(voice.tagline).toBeUndefined();
  expect(voice.signatureLine).toBeUndefined();
  expect(voice.ctaReassurance).toBeUndefined();
});

test("full voice (tagline + signature + reassurance) -> not neutral, fields carried through", async () => {
  __setBrandFixture(
    record({
      agentName: "Dana Rae",
      agentTagline: "Calm, steady guidance from list to close.",
      signatureLine: "Always in your corner.",
      agentCtaReassurance: "No pressure. Reach out whenever you are ready.",
    }),
  );
  const voice = await loadAgentVoice(EMAIL, "Fallback Name");
  expect(voice.neutral).toBe(false);
  expect(voice.agentName).toBe("Dana Rae");
  expect(voice.tagline).toBe("Calm, steady guidance from list to close.");
  expect(voice.signatureLine).toBe("Always in your corner.");
  expect(voice.ctaReassurance).toBe("No pressure. Reach out whenever you are ready.");
});

test("the visible CTA reassurance line alone -> not neutral (the agent set a voice)", async () => {
  __setBrandFixture(
    record({ agentCtaReassurance: "No pressure, whenever the time is right." }),
  );
  const voice = await loadAgentVoice(EMAIL, "Fallback Name");
  expect(voice.neutral).toBe(false);
  expect(voice.ctaReassurance).toBe("No pressure, whenever the time is right.");
});

test("the hidden whyUs.guarantee is NO LONGER a voice cue -> still neutral", async () => {
  // v1.2: the guarantee is not a field the agent sets as voice, so it must not
  // silently color the recap. With only guarantee set, the voice stays neutral.
  __setBrandFixture(
    record({ whyUs: { guarantee: "Cancel anytime, no questions." } }),
  );
  const voice = await loadAgentVoice(EMAIL, "Fallback Name");
  expect(voice.neutral).toBe(true);
  expect(voice.tagline).toBeUndefined();
  expect(voice.signatureLine).toBeUndefined();
  expect(voice.ctaReassurance).toBeUndefined();
});

test("partial voice (only tagline set) -> not neutral", async () => {
  __setBrandFixture(record({ agentTagline: "Local expertise, honest advice." }));
  const voice = await loadAgentVoice(EMAIL, "Fallback Name");
  expect(voice.neutral).toBe(false);
  expect(voice.tagline).toBe("Local expertise, honest advice.");
  expect(voice.signatureLine).toBeUndefined();
});

test("whitespace-only cues do NOT count as voice -> neutral floor", async () => {
  __setBrandFixture(
    record({ agentTagline: "   ", signatureLine: "\n\t", agentCtaReassurance: "" }),
  );
  const voice = await loadAgentVoice(EMAIL, "Fallback Name");
  expect(voice.neutral).toBe(true);
});

test("missing record (undefined) -> neutral floor with the fallback agent name", async () => {
  __setBrandFixture(null);
  const voice = await loadAgentVoice(EMAIL, "Fallback Name");
  expect(voice.neutral).toBe(true);
  expect(voice.agentName).toBe("Fallback Name");
});

test("a read failure (store throws) NEVER throws -> neutral floor, prepare survives", async () => {
  __setBrandThrows();
  const voice = await loadAgentVoice(EMAIL, "Fallback Name");
  expect(voice.neutral).toBe(true);
  expect(voice.agentName).toBe("Fallback Name");
});

test("no brand name AND no fallback -> the 'Your agent' floor name", async () => {
  __setBrandFixture(record({}));
  const voice = await loadAgentVoice(EMAIL, "");
  expect(voice.neutral).toBe(true);
  expect(voice.agentName).toBe("Your agent");
});

/**
 * voiceSignature — the cache-key half of the SAME one-place field set. A change to
 * any VOICE field changes the signature (busts an already-prepared recap); a
 * change to a NON-voice field (name, brokerage, color, the old guarantee) does
 * not. Pure, so no KV is needed.
 */
test.describe("voiceSignature", () => {
  const base = {
    agentTagline: "Steady from list to close.",
    signatureLine: "In your corner.",
    agentCtaReassurance: "No pressure.",
  } as unknown as BrandSettings;

  const sig = (b: Partial<BrandSettings>) =>
    voiceSignature({ ...base, ...b } as BrandSettings);

  test("is stable across calls for the same values", () => {
    expect(sig({})).toBe(sig({}));
  });

  test("changes when the tagline changes", () => {
    expect(sig({})).not.toBe(sig({ agentTagline: "A different tagline." }));
  });

  test("changes when the signature line changes", () => {
    expect(sig({})).not.toBe(sig({ signatureLine: "Different signature." }));
  });

  test("changes when the CTA reassurance line changes", () => {
    expect(sig({})).not.toBe(
      sig({ agentCtaReassurance: "Different reassurance." }),
    );
  });

  test("does NOT change on an unrelated brand edit (name / brokerage / guarantee / color)", () => {
    const unrelated = {
      agentName: "Someone Else",
      brokerage: "Other Brokerage",
      whyUs: { guarantee: "Some guarantee that no longer feeds voice." },
      brandPrimaryColor: "#ff0000",
    } as unknown as Partial<BrandSettings>;
    expect(sig(unrelated)).toBe(sig({}));
  });

  test("empty voice yields a stable signature (undefined brand too)", () => {
    expect(voiceSignature(undefined)).toBe(voiceSignature({} as BrandSettings));
  });

  test("voiceFields reads exactly the three visible fields, trimmed", () => {
    const f = voiceFields({
      agentTagline: "  Tag  ",
      signatureLine: "Sig",
      agentCtaReassurance: "  ",
      whyUs: { guarantee: "ignored" },
    } as unknown as BrandSettings);
    expect(f).toEqual({
      tagline: "Tag",
      signatureLine: "Sig",
      ctaReassurance: undefined,
    });
  });
});
