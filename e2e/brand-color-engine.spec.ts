import { test, expect } from "@playwright/test";

/**
 * Phase E.1 — brand color engine unit specs (node context, repo convention —
 * no Vitest). Exercises the ported derivation engine directly: tint/deep
 * formulas, clamp convergence, on-signature tie-breaks (cobalt→paper,
 * terracotta→ink, pale→fill-clamp), decorative fallback, and secondary-unset
 * as a first-class state. The contract's worked examples (§4) are pinned.
 */

import { BrandEngine } from "../src/lib/brand/color-engine";

const PAPER = "#F1EBE0";
const INK = "#1A1612";
const TERRACOTTA = "#C26A4E"; // default signature
const COBALT = "#2C53C4";
const NAVY = "#1F3A6B";
const GOLD = "#B0863A";

test.describe("BrandEngine — derivation contract", () => {
  test("normHex + contrast: contract §4 threshold relationships hold", () => {
    expect(BrandEngine.normHex("c26a4e")).toBe("#C26A4E");
    expect(BrandEngine.normHex("#abc")).toBe("#AABBCC");
    expect(BrandEngine.normHex("nope")).toBeNull();

    // Contract §4 (engine is the verbatim reference; assert the
    // tie-break-determining relationships, not brittle decimals):
    //   cobalt → paper passes AA(4.5), ink fails  → on = paper
    expect(BrandEngine.contrast(PAPER, COBALT)).toBeGreaterThanOrEqual(4.5);
    expect(BrandEngine.contrast(INK, COBALT)).toBeLessThan(4.5);
    //   terracotta → paper fails, ink passes      → on = ink
    expect(BrandEngine.contrast(PAPER, TERRACOTTA)).toBeLessThan(4.5);
    expect(BrandEngine.contrast(INK, TERRACOTTA)).toBeGreaterThanOrEqual(4.5);
  });

  test("resolveOn tie-breaks: cobalt→paper, terracotta→ink, mid-tone→fill-clamp(null)", () => {
    expect(BrandEngine.resolveOn(COBALT, PAPER, INK)).toBe(PAPER);
    expect(BrandEngine.resolveOn(TERRACOTTA, PAPER, INK)).toBe(INK);
    // A mid-tone where NEITHER paper nor ink clears AA on it → null (caller
    // clamps the fill, then text = paper). #7E746A: paper 3.85, ink 3.93.
    expect(BrandEngine.resolveOn("#7E746A", PAPER, INK)).toBeNull();
  });

  test("derive(terracotta) defaults: on-signature is dark ink (the accepted consequence)", () => {
    const d = BrandEngine.derive(TERRACOTTA, { surface: PAPER, ink: INK });
    expect(d.secondarySet).toBe(false);
    expect(d.hexes["on-signature"]).toBe(INK);
    // signature clamped to AA-large (≥3:1) vs surface
    expect(d.report.signatureOnSurface).toBeGreaterThanOrEqual(3.0);
    // body links clamped to AA (≥4.5:1) vs surface
    expect(d.report.linkOnSurface).toBeGreaterThanOrEqual(4.5);
    // price numerals clamped to ≥4.5 vs the tint-12 panel
    expect(d.report.deepOnPanel).toBeGreaterThanOrEqual(4.5);
    // surface/ink pass through; vars mirror hexes
    expect(d.hexes.surface).toBe(PAPER);
    expect(d.hexes.ink).toBe(INK);
    expect(d.vars["--signature"]).toBe(d.hexes.signature);
    expect(d.vars["--on-signature"]).toBe(d.hexes["on-signature"]);
  });

  test("derive(cobalt): on-signature resolves to cream paper", () => {
    const d = BrandEngine.derive(COBALT, { surface: PAPER, ink: INK });
    expect(d.hexes["on-signature"]).toBe(PAPER);
    // cobalt already clears AA-large vs cream, so signature is unchanged-ish (≥3:1)
    expect(d.report.signatureOnSurface).toBeGreaterThanOrEqual(3.0);
  });

  test("tint/line formulas: tint-6 lighter than tint-12 lighter than line-30 (all signature→surface mixes)", () => {
    const d = BrandEngine.derive(TERRACOTTA, { surface: PAPER, ink: INK });
    const L = (hex: string) => BrandEngine.luminance(hex);
    // more signature mixed in → darker. line-30 (30%) < tint-12 (12%) < tint-6 (6%) < surface
    expect(L(d.hexes["line-30"])).toBeLessThan(L(d.hexes["tint-12"]));
    expect(L(d.hexes["tint-12"])).toBeLessThan(L(d.hexes["tint-6"]));
    expect(L(d.hexes["tint-6"])).toBeLessThan(L(PAPER));
  });

  test("decorative: unset → signature; set → secondary at full strength (no clamp)", () => {
    const unset = BrandEngine.derive(NAVY, { surface: PAPER, ink: INK });
    expect(unset.secondarySet).toBe(false);
    expect(unset.hexes.decorative).toBe(unset.hexes.signature);

    const withSecondary = BrandEngine.derive(NAVY, {
      surface: PAPER,
      ink: INK,
      secondary: GOLD,
    });
    expect(withSecondary.secondarySet).toBe(true);
    // full strength = the normalized secondary itself, NOT a derived/clamped value
    expect(withSecondary.hexes.decorative).toBe(BrandEngine.normHex(GOLD));
  });

  test("clamp convergence: a mid-tone signature hits the fill-clamp path (on = paper, ≤28 iters)", () => {
    // #7E746A: neither paper nor ink clears AA on it → resolveOn null →
    // the FILL deepens until paper clears 4.5, then text = paper.
    const d = BrandEngine.derive("#7E746A", { surface: PAPER, ink: INK });
    expect(d.hexes["on-signature"]).toBe(PAPER);
    expect(d.report.signatureOnSurface).toBeGreaterThanOrEqual(3.0);
    // engine always returns a valid hex (guard kept it finite)
    expect(BrandEngine.isValidHex(d.hexes.signature)).toBe(true);
  });

  test("secondary unset is first-class: '' / null both → secondarySet false", () => {
    expect(BrandEngine.derive(TERRACOTTA, { secondary: "" }).secondarySet).toBe(false);
    expect(BrandEngine.derive(TERRACOTTA, { secondary: null }).secondarySet).toBe(false);
  });
});
