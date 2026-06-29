import { test, expect } from "@playwright/test";
import { loadAgentVoice } from "../src/lib/seller-presentation/prepared-next/voice-source";
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
 * PREPARED_NEXT v1.4 - regression lock for `voice-source.ts`, the neutral floor.
 *
 * `loadAgentVoice` reads the agent's LIVE brand Profile and must be BEST-EFFORT:
 * an empty / missing / failing read can never fail a prepare, it falls to the
 * neutral house voice. `getOwnedBrandSettings` is redirected to an in-memory fake
 * (tsconfig.unit.json) whose `__`-helpers we import from the SAME specifier so we
 * drive the exact record voice-source consumes.
 *
 * `neutral` is true ONLY when tagline + signature + guarantee are all empty.
 */

const EMAIL = "agent@example.com";

test.beforeEach(() => __resetBrand());
test.afterEach(() => __resetBrand());

function record(settings: Record<string, unknown>) {
  return { ownerEmail: EMAIL, updatedAt: "2026-06-01T00:00:00.000Z", settings };
}

test("empty profile (no tagline / signature / guarantee) -> neutral floor", async () => {
  __setBrandFixture(record({ agentName: "Dana Rae", brokerage: "Cedar Realty" }));
  const voice = await loadAgentVoice(EMAIL, "Fallback Name");
  expect(voice.neutral).toBe(true);
  // Identity still carries through; only the tone cues are absent.
  expect(voice.agentName).toBe("Dana Rae");
  expect(voice.brokerage).toBe("Cedar Realty");
  expect(voice.tagline).toBeUndefined();
  expect(voice.signatureLine).toBeUndefined();
  expect(voice.guarantee).toBeUndefined();
});

test("full voice (tagline + signature set) -> not neutral, fields carried through", async () => {
  __setBrandFixture(
    record({
      agentName: "Dana Rae",
      agentTagline: "Calm, steady guidance from list to close.",
      signatureLine: "Always in your corner.",
      whyUs: { guarantee: "Cancel anytime, no questions." },
    }),
  );
  const voice = await loadAgentVoice(EMAIL, "Fallback Name");
  expect(voice.neutral).toBe(false);
  expect(voice.agentName).toBe("Dana Rae");
  expect(voice.tagline).toBe("Calm, steady guidance from list to close.");
  expect(voice.signatureLine).toBe("Always in your corner.");
  expect(voice.guarantee).toBe("Cancel anytime, no questions.");
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
    record({ agentTagline: "   ", signatureLine: "\n\t", whyUs: { guarantee: "" } }),
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
