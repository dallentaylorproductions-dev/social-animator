import { test, expect } from "@playwright/test";

/**
 * Flagship F1 — deriveConsumerRoles unit specs (node context, repo convention —
 * no Vitest; see brand-color-engine.spec.ts). Proves the role-resolution entry
 * point the flagship (v2) template will consume: brand-kit-truth signature ramp
 * (hue-locked, NOT a warm/olive mix), default-ramp fallback on invalid input,
 * determinism, and the layout-locked neutral scaffold.
 */

import { deriveConsumerRoles } from "../src/tools/seller-presentation/output/consumer-roles";
import { BrandEngine } from "../src/lib/brand/color-engine";

const PAPER = "#F1EBE0";
const INK = "#1A1612";
const DEFAULT_SIG = "#C26A4E"; // engine default signature

function hueDist(a: number, b: number): number {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
}

test.describe("deriveConsumerRoles — flagship role resolution", () => {
  test("brand-kit truth: accent #037290 → sky-family panel tint (hue-locked, no warm/olive drag)", () => {
    const SKY = "#037290";
    const r = deriveConsumerRoles(SKY);

    const hSig = BrandEngine.rgbToOklch(SKY).h;
    const hPaper = BrandEngine.rgbToOklch(PAPER).h;
    const hTint12 = BrandEngine.rgbToOklch(r.tint12).h;

    // the panel tint holds the SIGNATURE (sky) hue, not the warm cream hue —
    // this is the production brand-kit behavior the flagship inherits
    expect(hueDist(hTint12, hSig)).toBeLessThan(8);
    expect(hueDist(hTint12, hSig)).toBeLessThan(hueDist(hTint12, hPaper));

    // every signature-ramp role resolves to a valid hex
    for (const hex of [
      r.signature,
      r.signatureDeep,
      r.signatureLink,
      r.tint12,
      r.tint9,
      r.tint6,
      r.line30,
      r.onSignature,
    ]) {
      expect(BrandEngine.isValidHex(hex)).toBe(true);
    }
  });

  test("tint9 sits between tint12 and tint6 (the quiet band tint)", () => {
    const r = deriveConsumerRoles("#037290");
    const L = (h: string) => BrandEngine.luminance(h);
    expect(L(r.tint12)).toBeLessThan(L(r.tint9));
    expect(L(r.tint9)).toBeLessThan(L(r.tint6));
  });

  test("invalid / undefined accent → the production DEFAULT ramp (terracotta)", () => {
    const fromUndefined = deriveConsumerRoles(undefined);
    const fromGarbage = deriveConsumerRoles("not-a-hex");
    const expected = deriveConsumerRoles(DEFAULT_SIG);

    expect(fromUndefined).toEqual(expected);
    expect(fromGarbage).toEqual(expected);

    // and it matches the engine's own default ramp on the locked surface/ink
    const eng = BrandEngine.derive(DEFAULT_SIG, { surface: PAPER, ink: INK });
    expect(fromUndefined.signature).toBe(eng.hexes.signature);
    expect(fromUndefined.tint12).toBe(eng.hexes["tint-12"]);
    expect(fromUndefined.tint9).toBe(eng.hexes["tint-9"]);
  });

  test("deterministic — same accent, identical roles", () => {
    expect(deriveConsumerRoles("#037290")).toEqual(
      deriveConsumerRoles("#037290"),
    );
  });

  test("layout neutrals are LOCKED — paper/ink never track the accent", () => {
    const a = deriveConsumerRoles("#037290");
    const b = deriveConsumerRoles("#C9A341");
    // paper/ink/onDark/darkBands are fixed regardless of brand accent
    expect(a.paper).toBe(PAPER);
    expect(a.ink).toBe(INK);
    expect(b.paper).toBe(PAPER);
    expect(b.ink).toBe(INK);
    expect(a.onDark).toBe(b.onDark);
    expect(a.darkBand).toBe(b.darkBand);
    expect(a.darkBand2).toBe(b.darkBand2);
    // inkSoft/inkFaint are layout-locked too (paper/ink derived, brand-independent)
    expect(a.inkSoft).toBe(b.inkSoft);
    expect(a.inkFaint).toBe(b.inkFaint);
    // and they sit between ink and paper in lightness (soft darker than faint)
    const L = (h: string) => BrandEngine.luminance(h);
    expect(L(a.ink)).toBeLessThan(L(a.inkSoft));
    expect(L(a.inkSoft)).toBeLessThan(L(a.inkFaint));
    expect(L(a.inkFaint)).toBeLessThan(L(a.paper));
  });
});
