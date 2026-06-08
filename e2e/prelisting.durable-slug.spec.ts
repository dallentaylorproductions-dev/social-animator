import { test, expect } from "@playwright/test";

/**
 * B0c — durable per-agent slug proof.
 *
 * The standalone page is ONE durable page per agent: republishing must update
 * the SAME url, not mint a new one. That rests on `deriveAgentPageSlug` being a
 * deterministic function of the agent's identity. This spec proves:
 *   - same email in → same slug out (across calls) — the durability guarantee;
 *   - email is case/whitespace-insensitive (the canonical lowercased identity);
 *   - different agents get different slugs;
 *   - the slug is a fixed-length Crockford base32 string, a DIFFERENT length
 *     from the 8-char random seller slug so the two slug spaces never overlap.
 *
 * Pure-Node — no browser, no KV. globalThis.crypto.subtle is available in the
 * test runtime.
 */

import { deriveAgentPageSlug } from "../src/lib/share-urls";

const CROCKFORD = /^[0-9abcdefghjkmnpqrstvwxyz]+$/;

test.describe("deriveAgentPageSlug — durable per-agent slug", () => {
  test("same email → same slug across calls (the durable-url guarantee)", async () => {
    const a = await deriveAgentPageSlug("aaron@example.com");
    const b = await deriveAgentPageSlug("aaron@example.com");
    expect(a).toBe(b);
  });

  test("email is case + whitespace insensitive (canonical lowercased identity)", async () => {
    const base = await deriveAgentPageSlug("aaron@example.com");
    expect(await deriveAgentPageSlug("Aaron@Example.com")).toBe(base);
    expect(await deriveAgentPageSlug("  AARON@EXAMPLE.COM  ")).toBe(base);
  });

  test("different agents get different slugs", async () => {
    const a = await deriveAgentPageSlug("aaron@example.com");
    const b = await deriveAgentPageSlug("dana@example.com");
    expect(a).not.toBe(b);
  });

  test("slug is 12-char Crockford base32 — distinct length from the 8-char seller slug", async () => {
    const slug = await deriveAgentPageSlug("aaron@example.com");
    expect(slug).toHaveLength(12);
    expect(slug).toMatch(CROCKFORD);
    // A different length than the random seller slug (8) is what makes the
    // durable + random slug spaces non-overlapping.
    expect(slug.length).not.toBe(8);
  });
});
