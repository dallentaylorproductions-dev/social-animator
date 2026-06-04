# E.1 fast-follow — hue-locked derivation (the "yellowy divider" fix)

**Branch:** `fix/sp-e1-hue-lock` off `main` @ `bc59391` (E.1 squash).
**Scope:** `src/lib/brand/color-engine.ts` (+ a one-line CSS note + specs). No
serializer / seller-page / data / clamp / threshold changes.

## The problem
The surface-mixed ramp steps (`tint-12`, `tint-6`, `line-30`) interpolated **hue**
along with L/C. The Editorial surface is a warm cream (`#F1EBE0`, hue ≈ 80°), so a
**cool** signature got dragged through a muddy intermediate hue — Dallen's divider
read "yellowy" (worse: a cobalt divider resolved to a salmon-pink, a navy divider to
a sage-green). A derived tone the agent would never associate with their brand and
can't edit.

## The fix
`mixSurfaceHueLocked(surface, sig, w)` — used only for the three surface-mixed steps.
It computes **L and C identically to the old mix** (so tint lightness/chroma character
is unchanged) but **pins hue to the signature's hue** instead of interpolating it. A
pale divider now reads as "a pale version of MY color."

- `signature-deep` (mixes toward `#000`) is already hue-safe — black is hue-powerless
  in OKLCh. Unchanged.
- The paper↔ink neutral ramp (`--paper-deep/-raise/…`, `--ink-*`) is neutral by
  design. Unchanged.
- Clamp logic / `resolveOn` / thresholds. Unchanged.
- **Gray-floor edge case:** hue is unstable at C≈0, so when the signature's OKLCh
  chroma is below `CHROMA_FLOOR = 0.02` we fall back to the plain mix → grays derive
  as clean grays (no injected hue). Floor chosen empirically: saturated brand colors
  sit at C ≈ 0.08–0.20, pure/near grays at C ≲ 0.01.

The published page inlines the engine's **resolved hexes** server-side, so the live
path is fully fixed. The stylesheet's `color-mix(in oklch, …)` pre-JS fallbacks can't
express hue-lock and may differ slightly in hue for cool signatures — a one-line CSS
comment notes the inlined values are authoritative (no hue-locked CSS attempted).

## Before → after (OKLCh hue in °; surface = cream #F1EBE0)
Signature hues for reference: terracotta ≈ 38°, cobalt ≈ 264°, navy ≈ 260°.

| Signature | Step | Before (hue) | After (hue) |
|---|---|---|---|
| **terracotta** `#C26A4E` | tint-12 | `#EADDCB` (76°) | `#F1D9D2` (37°) |
| (default — warm, small delta) | tint-6 | `#EDE4D5` (81°) | `#F4E1DB` (38°) |
| | line-30 | `#E1C7AC` (68°) | `#E9C2B6` (38°) |
| **cobalt** `#2C53C4` | tint-12 | `#ECD5C2` (62°) | `#CEDAF2` (264°) |
| (cool — yellow cast killed) | tint-6 | `#EEE0D0` (71°) | `#DAE3F5` (264°) |
| | line-30 | `#E7B0A7` (29° — salmon) | `#ABBFEB` (266°) |
| **navy** `#1F3A6B` | tint-12 | `#D7D6C3` (104°) | `#CCD5E6` (263°) |
| (cool — green cast killed) | tint-6 | `#E4E0D1` (95°) | `#D9E1EE` (260°) |
| | line-30 | `#A8B9A1` (136° — sage) | `#A5B4CC` (260°) |

The cool signatures are the dramatic cases: cobalt's `line-30` was hue 29° (salmon)
and navy's was 136° (sage) — both now land on the brand's own hue (~265°/260°).
Terracotta shifts only modestly (both endpoints warm) but now tracks its true ~38°.

## Tests
- `e2e/brand-color-engine.spec.ts`: hue-equality for **cobalt / navy / green / magenta**
  on all three steps (each lands on the signature hue vs the old mix, within ε=8° for
  8-bit roundtrip drift, and far from the cream hue); the **gray-floor fallback**
  (byte-identical to plain mix + stays near-neutral); and an **exact baseline pin** of
  the terracotta-default `tint-12`/`tint-6`/`line-30` hexes. (14 engine specs green.)
- `seller-presentation.brand-colors.spec.ts` (zero-cyan + primaries) unchanged + green.
- `settings-brand-kit-v2.spec.ts` (form) unchanged + green — same engine, recomputes.

## Gates
`npm run build` exit 0 · truthful-copy PASS · full chromium suite green (known-
acceptable mobile-webkit binary-missing only).

## Smoke (Dallen, targeted)
Set your brand color in `/settings/brand`, republish, and confirm the **divider** and
**panel tints** read as YOUR hue family (no yellow/salmon/sage cast). Then PR + squash.

Preview URL (branch alias, stable):
https://social-animat-git-ac3526-dallentaylorproductions-5050s-projects.vercel.app
- Form: `/settings/brand` — pick a cool signature, watch the palette strip + divider.
- Seller (cobalt): `/seller-presentation-preview?fixture=full&brandAccent=%232C53C4`
- Seller (navy + gold): `/seller-presentation-preview?fixture=full&brandAccent=%231F3A6B&brandSecondary=%23B0863A`
