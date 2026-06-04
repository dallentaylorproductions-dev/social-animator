# Brand kit v2 — Engineering contract

Phase E.1, **round 2** (answers locked). One **signature** color in → a 7-role tonal ramp
out, every text-bearing step contrast-clamped per role. Derived shades are **shown, never
asked**.

> **Color space: OKLCh.** All mixing is `color-mix(in oklch, …)` in CSS and the matching
> OKLCh math in `color_engine.js`. The srgb path desaturated the deep/light steps toward
> mud — the exact failure this system prevents. srgb equivalents appear **as reference
> only** (§7).

---

## 1. Data contract

| Field | Status | Source | Validation |
|---|---|---|---|
| `signature` | **renamed label only** | existing `brandAccent` hex | required hex; hex-clamped on load |
| `secondary` | **NEW, optional** | new nullable hex | optional; `''`/null = unset; hex-clamped on load; **never written on mount** |
| `background` | demoted (layout-owned default, overridable) | existing field | optional hex; default `#F1EBE0` |
| `text` | demoted (layout-owned default, overridable) | existing field | optional hex; default `#1A1612` |
| `layout` | enum, locked | existing field | `editorial` (live) · `studio` · `warm` — **studio/warm fall back to the Editorial layout**; no other values |

- `signature` is wire-compatible with E.0 `brandAccent`; **no migration**, rename is
  presentation only.
- `secondary` follows the **exact E.0 optional-field contract**: optional, hex-clamped on
  load, **never written on mount**. Unset is a first-class state.
- `secondary` gets **no ramp of its own (v1)** — full strength, decorative roles only
  (§2 `--decorative`). Derived-from-signature when unset.

---

## 2. Token sheet — name → formula → role

`surface` = `background` (default `#F1EBE0`, the layout **paper**); `ink` = `text`
(default `#1A1612`). Pre-clamp formula, then per-role clamp (§3).

| Token (css var) | Formula (pre-clamp, OKLCh) | Role |
|---|---|---|
| `--signature` | `signature` | eyebrows, dots, badge, glyph, wordmark, **prices & big numbers**, CTA fill |
| `--signature-deep` | `color-mix(in oklch, var(--signature), #000 22%)` | price numerals on the panel |
| `--signature-link` | `signature`, deepened to AA *(was `signature-light`)* | **body-size links** |
| `--tint-12` | `color-mix(in oklch, var(--signature) 12%, var(--surface))` | panel fills behind key numbers |
| `--tint-6` | `color-mix(in oklch, var(--signature) 6%, var(--surface))` | stat-card fills |
| `--line-30` | `color-mix(in oklch, var(--signature) 30%, var(--surface))` | rules / dividers |
| `--on-signature` | `resolveOn(fill, paper, ink)` (§4) | text on signature fills |
| `--decorative` | `secondary ?? signature` (secondary at **full strength**, no derivation) | section numerals, end-marks |

> CSS ships these `color-mix(in oklch, …)` values as the **pre-JS fallback**; the engine
> then writes the **AA-clamped resolved hexes** over the top (clamps can't live in CSS).
> `--signature-link` was `--signature-light` in round 1; renamed because body links need
> *more* contrast (deepen), not less.

---

## 3. Clamp rules (lightness-only in OKLCh, per role)

Each text-bearing step deepens toward `#000` in **5% OKLCh steps** (≤28 iters) until WCAG
contrast vs its surface clears the threshold. Hue + chroma hold. Fills/lines are not clamped.

| Role | Measured against | Threshold | Why |
|---|---|---|---|
| `signature` — prices & big numbers (display scale) | `surface` | **3.0 : 1** | AA-large |
| `signature-link` — body-size links | `surface` | **4.5 : 1** | AA body text |
| `signature-deep` — price numerals on panel | `tint-12` | **4.5 : 1** | carries the headline figure |
| `decorative` — section numerals, end-marks | — | none (full strength) | secondary shown as chosen; Readability advises |
| `on-signature` — label on fill | the fill | **see §4** | button/label legibility |
| `tint-12` · `tint-6` · `line-30` | — | none | decorative fills & hairlines |
| `text` — body | `surface` | reported, not clamped | layout-owned; shown in Readability |

**Why two link standards:** a single "Links & prices" chip conflated AA-large (prices) with
AA-body (links). Split into **"Prices & big numbers" (3:1)** and **"Links" (4.5:1)** so an
agent whose links fail body-size contrast actually sees it. Readability reports the agent's
**raw** (unclamped) signature against each bar; the published page always renders the
clamped tokens, so it stays legible regardless.

---

## 4. `on-signature` resolution (deterministic)

Picks between the layout's **paper** (cream `surface`) and **ink** (`text`) by contrast on
the fill. No per-case judgement:

```
cp = contrast(paper, fill);  ci = contrast(ink, fill)
if (cp >= 4.5 && ci >= 4.5)  ->  paper        // both pass AA → prefer paper (brand cohesion)
else if (cp >= 4.5)          ->  paper
else if (ci >= 4.5)          ->  ink
else  ->  lightness-clamp the FILL (not the text) until paper passes 4.5, then text = paper
```

- **Cobalt `#2C53C4`**: paper 5.43 ✓, ink 2.76 ✗ → **paper (cream)**.
- **Terracotta `#C26A4E`**: paper 3.23 ✗, ink 4.64 ✓ → **ink (dark)**. *(Consequence: the
  CTA label on terracotta is dark, not the round-1 cream. Deterministic and intended.)*
- A pale signature where neither passes → the **fill** deepens until cream passes; text = cream.

---

## 5. Hero / on-photo rule

**Text legibility never depends on photo content.** Signature-colored text sits on **solid
surfaces only**. The hero eyebrow renders in the layout's on-dark cream over the scrim;
signature eyebrows appear only on solid cream or the solid dark band. Applies to the MiniPage
and both ramp pages.

---

## 6. Derivation function spec

Pure, dependency-free (`assets/color_engine.js`). Emits **both** css-var values and resolved
hexes — canvas templates consume hexes later; keep this shape stable.

```js
BrandEngine.derive(signature, { surface, ink, secondary }) => {
  hexes:  { signature, 'signature-deep', 'signature-link',
            'tint-12', 'tint-6', 'line-30', 'on-signature',
            decorative, surface, ink },          // resolved #RRGGBB, post-clamp
  vars:   { '--signature': '#…', … },            // same map, css-var keyed
  report: { rawSignatureOnSurface, signatureOnSurface, linkOnSurface,
            deepOnPanel, onSignature, bodyOnSurface, decorativeOnSurface },
  secondarySet: boolean
}
```

Helpers: `mix` = `mixOklch(a,b,wB)` = `color-mix(in oklch, a, b wB%)` (powerless hue carries
the chromatic endpoint; shorter-arc hue interp); `contrast` = WCAG (luminance linearized);
`clampContrast(color, surface, target, dir)`; `resolveOn(fill, paper, ink)`;
`applyVars(el, derived)`. `mixSrgb` is retained for reference parity only.

---

## 7. srgb reference (NOT the live path)

For audit, the srgb equivalents of the formula steps:
`--signature-deep` ≈ `color-mix(in srgb, signature, #000 22%)`;
tints ≈ `color-mix(in srgb, signature N%, surface)`. These desaturate deep/light steps and
are **documented only** — the build uses OKLCh.

---

## 8. Preserved test IDs

`brand-color-signature`, `brand-color-secondary`, `brand-color-background`,
`brand-color-text`, `brand-palette-strip`, `brand-palette-chip-*`, `brand-readability`,
`brand-readability-ratio`, `brand-readability-fix`, `brand-minipage-preview`.
