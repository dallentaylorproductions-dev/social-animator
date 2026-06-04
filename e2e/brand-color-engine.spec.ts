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

/* --------------------------------------------------------------------------
 * Hue-locked derivation (the "yellowy divider" fix). The surface-mixed steps
 * (tint-12 / tint-6 / line-30) must hold the SIGNATURE hue when mixing toward
 * the warm cream surface, so cool brands don't pick up a yellow cast. Hue is
 * compared in OKLCh; assertions are quantization-robust (8-bit rgb roundtrip
 * drifts hue at low chroma, so we assert both "closer to signature than to the
 * old mix / to the surface" and a generous absolute bound, not brittle decimals).
 * ------------------------------------------------------------------------ */
function hueDist(a: number, b: number): number {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
}
const SURFACE_STEPS = [
  ["tint-12", 0.12],
  ["tint-6", 0.06],
  ["line-30", 0.3],
] as const;

test.describe("BrandEngine — hue-locked surface mixes", () => {
  const COOL = {
    cobalt: "#2C53C4",
    navy: "#1F3A6B",
    green: "#2E8B57",
    magenta: "#B5179E",
  };

  for (const [name, sig] of Object.entries(COOL)) {
    test(`${name}: tint-12 / tint-6 / line-30 hold the signature hue (no yellow drag)`, () => {
      const d = BrandEngine.derive(sig, { surface: PAPER, ink: INK });
      const hSig = BrandEngine.rgbToOklch(sig).h;
      const hSurface = BrandEngine.rgbToOklch(PAPER).h;
      for (const [step, w] of SURFACE_STEPS) {
        const newHue = BrandEngine.rgbToOklch(d.hexes[step]).h;
        // plain (old) mix interpolated hue → drifted toward the cream
        const oldHue = BrandEngine.rgbToOklch(
          BrandEngine.mixOklch(PAPER, sig, w),
        ).h;
        const dNew = hueDist(newHue, hSig);
        const dOld = hueDist(oldHue, hSig);
        // the fix pulls the step's hue toward the signature vs the old mix...
        expect(dNew).toBeLessThan(dOld);
        // ...lands on the signature hue (generous ε for low-chroma 8-bit drift)...
        expect(dNew).toBeLessThan(8);
        // ...and sits far from the warm-cream hue that caused the cast
        expect(hueDist(newHue, hSig)).toBeLessThan(hueDist(newHue, hSurface));
      }
    });
  }

  test("baseline pin: terracotta-default tint-12 / tint-6 / line-30 (hue-locked engine output)", () => {
    // Re-pinned for the hue-lock change. Terracotta + cream are both warm, so
    // the delta is small, but the hue now tracks the signature (~38°) instead
    // of being dragged toward the cream (~80°). Exact engine output:
    const d = BrandEngine.derive(TERRACOTTA, { surface: PAPER, ink: INK });
    expect(d.hexes["tint-12"]).toBe("#F1D9D2");
    expect(d.hexes["tint-6"]).toBe("#F4E1DB");
    expect(d.hexes["line-30"]).toBe("#E9C2B6");
  });

  test("gray-floor fallback: a near-neutral signature derives clean grays (plain mix, no injected hue)", () => {
    const GRAY = "#808080";
    const d = BrandEngine.derive(GRAY, { surface: PAPER, ink: INK });
    // below CHROMA_FLOOR the hue-lock falls back to the plain OKLCh mix — assert
    // the three steps are byte-identical to mixOklch (proves the fallback path)
    for (const [step, w] of SURFACE_STEPS) {
      expect(d.hexes[step]).toBe(BrandEngine.mixOklch(PAPER, GRAY, w));
    }
    // and the result stays near-neutral (no third hue injected)
    expect(BrandEngine.rgbToOklch(d.hexes["line-30"]).C).toBeLessThan(0.03);
  });
});
