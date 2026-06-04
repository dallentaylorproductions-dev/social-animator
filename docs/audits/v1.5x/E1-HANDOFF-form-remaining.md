# Phase E.1 — mid-build handoff (Brand kit v2 form remaining)

**Branch:** `feat/sp-brand-unification-e1` (pushed, NO PR yet). Branched off `main` @
`d0f1aac` (#26). Resume here in a fresh session, finish Item 3 + form specs, then open ONE
PR for all of E.1.

**Authoritative spec:** `docs/design/brand-unification/ENGINEERING_CONTRACT.md` (wins over
README on overlap). README = behavior. `color_engine.js` = the ported engine reference.
Packet test-ID rule overrides the design's IDs (see "Test IDs" below).

## DONE + verified + committed (seller-side = the packet's ratified first priority)
- **Engine** `src/lib/brand/color-engine.ts` — verbatim OKLCh port. API:
  `BrandEngine.derive(signature, { surface, ink, secondary }) => { hexes, vars, report,
  secondarySet, surface, ink }`. `hexes`/`vars` keys: `signature`, `signature-deep`,
  `signature-link`, `tint-12`, `tint-6`, `line-30`, `on-signature`, `decorative`,
  `surface`, `ink`. Also `BrandEngine.contrast/clampContrast/resolveOn/normHex/applyVars`.
  8 node specs in `e2e/brand-color-engine.spec.ts` (green).
- **Data** `src/lib/brand.ts` — `brandSecondary?` (hex-clamped on load, never on mount,
  unset first-class). `brandAccent` = the signature (label-only rename in UI).
- **Serializer** `output/public-payload.ts` — `BrandColorsInput.brandSecondary` +
  `PublicBrandColors.secondary`; `projectBrandColors`/`clampBrandColors` extended
  field-by-field. `StepReview` assembles it; preview route has `&brandSecondary=`.
  Allowlist tests added (round-trip/absent/non-hex drop).
- **Seller page** `output/presentation-page.tsx` runs `BrandEngine.derive()` at render and
  inlines the clamped ramp on `<main>` (`derived.vars`). `presentation-page.css` token
  block rewritten to the ramp (`--signature` family + `--tint-12/6` + `--line-30` +
  `--on-signature` + `--decorative` + `--signature-on-dark`/`--decorative-on-dark`
  helpers), with `color-mix(in oklch,…)` pre-JS fallbacks. Production aliases
  (`--paper`/`--brick`/`--paper-*`/`--ink-*`/`--gold*`/`--rose`) re-derived to track the
  brand; `--pos*`/`--chart-*` kept semantic. **All 8 ex-cyan spots remapped**; NO `#4ef2d9`
  anywhere. Verified terracotta/cobalt/navy+gold (screenshots `docs/audits/v1.5x/e1-seller-*.png`).
- **No-cyan baseline** `e2e/seller-presentation.brand-colors.spec.ts` re-pinned (scans
  every element for `#4ef2d9` → 0; UNSET/SET/secondary/invalid). Green. Page-render +
  privacy suites green. Invariants byte-identical; truthful-copy passes; `npm run build`
  clean.

## REMAINING — Item 3: Brand kit v2 form (`/settings/brand`)
Rebuild `src/tools/seller-presentation/components/BrandKitForm.tsx` (currently the E.0
version, still functional) per `docs/design/brand-unification/brand_kit_v2.html` + README §1,
in the app's primitives. The form is CONTROLLED (parent `src/app/settings/brand/page.tsx`
owns values + persists). Wire `BrandEngine.derive()` in a `useMemo` keyed on
signature/secondary/background/text; apply `derived.vars` onto the MiniPage root.

Pieces:
1. **Values shape:** add `secondary` (+ keep background/text/accent/defaultThemeId).
   `accent` = signature. Page wiring: persist `brandSecondary` (already in `lib/brand.ts`).
2. **Signature row** — relabel the accent row "Signature" + "THE ONE COLOR" tag + helper
   (README §1.1). Reset → `#C26A4E`. KEEP testid `brand-color-accent`.
3. **Secondary row** — NEW testid `brand-color-secondary`: hatch empty state, Add/Clear,
   helper (README §1.2). Unset persists as absent (not "").
4. **Palette strip** — NEW `brand-palette-strip` + `brand-palette-chip-<token>`, read-only,
   7 chips from `derived.hexes` per `palette_strip.jsx` (role name + label + hex).
5. **Page-surface disclosure** — NEW `brand-surface-disclosure`, collapsed default,
   contains the existing Background (`brand-color-background`) + Text (`brand-color-text`)
   rows + subnote "Layout-owned defaults you can override."
6. **Default layout select** — keep `brand-default-theme` (editorial/studio/warm).
7. **Readability v2** — keep `brand-readability-verdict` + `brand-readability-fixes`.
   Chips: Body(4.5), Prices & big numbers(3.0), Links(4.5 — warns independently, doesn't
   flip verdict), Section numerals(3.0 — only when secondary set). Grade the agent's RAW
   signature; "Bump contrast" sets the field to `BrandEngine.clampContrast(...)` result
   (3.0 prices / 4.5 links / 3.0 secondary). NEVER blocks save. Verdict = body+prices+
   secondary(if set).
8. **MiniPage** — extend role coverage per `minipage.jsx` (price tint-12 panel +
   signature-deep numerals, decorative plan numerals + end-mark, on-signature CTA/play/
   badge, line-30 dividers); apply `derived.vars` on its root. Keep `brand-minipage-preview`.
9. **Footer** verbatim: "Existing published pages keep their original colors. New publishes
   use your latest brand."
10. `brand-kit.css` additions (palette strip, disclosure, secondary hatch). Fonts =
    Hanken/JetBrains/Instrument Serif (project self-hosted).

**Test IDs — production is truth (packet §3 overrides the design contract's IDs):** keep
`brand-color-accent` (= signature row — do NOT rename to `brand-color-signature`),
`brand-color-background`, `brand-color-text`, `brand-readability-verdict`,
`brand-readability-fixes`, `brand-autosave-indicator`, `brand-minipage-preview`. NEW:
`brand-color-secondary`, `brand-palette-strip`, `brand-palette-chip-<token>`,
`brand-surface-disclosure`.

## Item 6 remaining (form specs)
Secondary add/clear/unset-persistence; strip read-only; disclosure collapsed default;
readability chips incl. Links LOW + Bump contrast; save-never-blocked; no-write-on-mount
(E.0 critical gate). List every spec change in the final handoff.

## Final
`npm run build` clean; truthful-copy PASS; full suite green; invariants byte-identical
(`prep-pdf.tsx`, `revoke/route.ts`, `entitlements/resolver.ts`, `engine/types.ts`, all
`skill.ts`, `BrandProfileForm.tsx` — all currently CLEAN). Commit:
`feat(sp): Phase E.1 — brand color unification …`. PR; Dallen smokes (a) unset publish →
no cyan; (b) cobalt one family; (c) navy+gold; (d) Brand kit UX; (e) published page frozen.

---

## ✅ DONE — Item 3 + Item 6 (form) complete

**Item 3 — Brand kit v2 form, rebuilt in the app's primitives:**
- `BrandKitForm.tsx` rebuilt to the v2 layout: signature (hero) row, optional
  secondary row (hatched empty state, Add/Clear), the read-only **palette strip**
  (7 chips from `derived.hexes`), a collapsed **Page surface** disclosure
  (background + text), the default-layout select, the round-2 **Readability**
  panel, footer notes, and the sticky phone preview. `BrandEngine.derive()` runs
  in a `useMemo` keyed on signature/secondary/background/text; the resolved ramp
  is applied to the MiniPage root as inline CSS vars.
- `MiniPage.tsx` rewritten to consume the **derived ramp** (`--signature` family,
  `--tint-12/6`, `--line-30`, `--on-signature`, `--decorative`, `--surface/--ink`)
  with full role coverage per `minipage.jsx` — tint-12 price panel + signature-deep
  numeral, decorative plan numerals + end-mark, on-signature play/CTA, line-30
  dividers, signature stats. No srgb color-mix on the live path.
- `brand-kit.css` form + MiniPage + responsive blocks replaced with a port of
  `brand_kit.css`, scoped under `.bk-scope`, self-hosted fonts (Hanken /
  Instrument Serif / JetBrains Mono); added v2 chrome tokens.
- `settings/brand/page.tsx` wires `secondary` (value = `brandSecondary ?? ""`),
  persists `brandSecondary` as **ABSENT when unset** (never `""`), updated the
  signature-centric subhead.
- **Test IDs:** kept `brand-color-accent` (= signature row — NOT renamed),
  `brand-color-background/-text`, `brand-readability-verdict`,
  `brand-autosave-indicator`, `brand-default-theme`, `brand-minipage-preview`.
  Added `brand-color-secondary`, `brand-palette-strip`, `brand-palette-chip-<token>`,
  `brand-surface-disclosure`, `brand-readability-fixes`, `brand-readability-ratio`,
  `brand-readability-fix`.

**Item 6 — form specs** (`e2e/settings-brand-kit-v2.spec.ts`, 7 specs, green):
1. renders v2 structure (signature + secondary rows, 7 read-only palette chips
   with NO inputs, MiniPage preview);
2. **NO write on mount** — empty storage stays empty (E.0 critical gate);
3. **Page-surface disclosure** collapsed by default, reveals background/text on toggle;
4. **secondary** Add→type sets it (Section-numerals chip appears, persists as hex),
   Clear unsets to **ABSENT** (key dropped, not `""`);
5. invalid hex does not commit (error border, last good value stays);
6. **readability** — low-contrast signature flips verdict to "Worth a look", Bump
   contrast deepens the field + recovers the verdict, change persists (save never gated);
7. defaults (terracotta) — verdict good, but the **Links chip warns independently**.

**Gates:** `npm run build` exit 0 · truthful-copy PASS · full chromium suite 305
passed · mobile-webkit 2 passed · invariants untouched.
