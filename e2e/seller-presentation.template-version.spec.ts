import { test, expect } from "@playwright/test";

/**
 * Flagship templateVersion discriminator specs (node context, repo
 * convention — no Vitest). Proves the rollout rails:
 *   - new publishes are stamped with PUBLISH_TEMPLATE_VERSION (F3: 2 → flagship)
 *   - the read clamp (trust boundary) coerces anything that isn't EXACTLY the
 *     number 2 back to 1 — so old slugs (no field), tampered, and garbage all
 *     render today's v1 look.
 *
 * Pure-Node — the discriminator is data, not routing.
 */

import {
  toPublicPayload,
  clampPublicPayload,
} from "../src/tools/seller-presentation/output/public-payload";
import { PUBLISH_TEMPLATE_VERSION } from "../src/tools/seller-presentation/config/template-version";
import type { SellerPresentationDraft } from "../src/tools/seller-presentation/engine/types";

// Minimal draft — toPublicPayload only needs comps/pitchPoints arrays + the
// scalar address/price fields for this concern.
const minimalDraft = {
  propertyAddress: "1 Test St",
  recommendedPrice: "$675,000",
  comps: [],
  pitchPoints: [],
} as unknown as SellerPresentationDraft;

test.describe("Seller Presentation — templateVersion (F3)", () => {
  test("toPublicPayload stamps the publish-time version (2 in F3)", () => {
    const p = toPublicPayload(minimalDraft, {});
    expect(p.templateVersion).toBe(PUBLISH_TEMPLATE_VERSION);
    expect(PUBLISH_TEMPLATE_VERSION).toBe(2); // F3 flips new publishes to flagship
  });

  test("read clamp: an EXACT numeric 2 survives", () => {
    expect(clampPublicPayload({ templateVersion: 2 }).templateVersion).toBe(2);
  });

  test("read clamp: missing field (old published slug) → 1", () => {
    // a payload published before F1 carries no templateVersion at all
    expect(clampPublicPayload({}).templateVersion).toBe(1);
    expect(clampPublicPayload({ propertyAddress: "x" }).templateVersion).toBe(1);
  });

  test("read clamp: an explicit 1 stays 1", () => {
    expect(clampPublicPayload({ templateVersion: 1 }).templateVersion).toBe(1);
  });

  test("read clamp: tampered / wrong-type values all coerce to 1", () => {
    const tampered = [3, 0, -1, 2.0001, "2", "2.0", true, null, {}, [], NaN];
    for (const v of tampered) {
      expect(
        clampPublicPayload({ templateVersion: v }).templateVersion,
        `templateVersion=${JSON.stringify(v)} must clamp to 1`,
      ).toBe(1);
    }
  });

  test("non-object input → empty payload defaults to v1", () => {
    expect(clampPublicPayload(null).templateVersion).toBe(1);
    expect(clampPublicPayload(undefined).templateVersion).toBe(1);
    expect(clampPublicPayload("nope").templateVersion).toBe(1);
  });

  test("the string '2' must NOT be treated as v2 (strict numeric identity)", () => {
    expect(clampPublicPayload({ templateVersion: "2" }).templateVersion).toBe(1);
  });
});
