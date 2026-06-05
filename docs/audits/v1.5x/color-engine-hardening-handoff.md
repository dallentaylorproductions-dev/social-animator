# Color engine hardening — diagnosis + fixes (pre-redesign gate)

**Branch:** `fix/sp-color-engine-hardening` off `main` @ `3da5a22` (Brand kit v3).
**Stress combo:** background `#E61E1E`, signature `#030303`, body `#FF9E3D`.

## Confirmed root causes (with evidence)

1. **Deepen-only clamp → dead "Bump contrast".**
   `clampContrast` (was `src/lib/brand/color-engine.ts:252`) walked ONE direction
   (toward `#000`), passed in by every caller as `"deepen"` (`:302/307/312/315` and the
   form's `bumpSignature`). Evidence (engine run on the stress combo): raw signature
   contrast = **4.487** (< 4.5 → Links fails → button shown); the deepen bump returned
   `#030303` **unchanged** (`changed=false`) — a silent no-op. Sharper than the original
   hypothesis: `#030303` is already at the deepen extreme, so deepening has no headroom,
   AND **4.5 is unreachable in either direction** (max 4.487 both ways) — no shade of the
   signature can read on this red.

2. **Body/surface pair had NO one-tap fix path.** The Body chip rendered no fix button
   (form `Sample` had a single signature-only `onFix`). Evidence: body raw **2.235**;
   even the render clamp only reached **3.886** (lightness alone can't clear 4.5 on this
   pair), and the agent got zero in-form help.

3. **Instrument rendered on the raw page background.** `.sample__ratio` / `.sample__fix`
   sat inside `.sample { background: var(--sample-bg) }` (the user's background), so the
   readability instrument's own pills/buttons degraded with hostile colors.

## Fixes

### 1. Bidirectional clamp (`color-engine.ts`)
`clampContrast` / new `clampContrastEx` now evaluate BOTH directions (lighten + deepen,
hue+chroma held) and walk whichever raises contrast with the **smallest change first**.
`derive()`'s render clamps + the body-text clamp use AUTO direction. At the production
defaults every output is **unchanged** (deepen is still the minimal-change direction) —
the pinned baselines (terracotta tints, zero-cyan, body-clamp NO-OP) stay green.

### 2. Reachability honesty (no dead buttons, ever)
New `maxAchievableContrast(fg, surface)` is the reachability oracle; new
`softenSurfaceFor(surface, fg, target)` finds the minimal surface lightness shift (either
direction, smallest first) that makes a role reachable. The form computes reachability
**before** rendering a fix: reachable → a foreground "Bump contrast"; unreachable → the
honest line *"Your background is too strong for readable links/text at any shade — soften
the background instead."* + a one-tap **Soften the background** button. `clampContrastEx`
returns an explicit `reached` flag — never a silent identity. **A rendered fix button
always changes a value.**

### 3. Body-text one-tap fixes
The Body chip now offers **"Use a readable text shade"** (adjust ink) and **"Soften the
background"** (adjust surface), smallest-change-first; the ink fix is dropped when
unreachable (→ background fix only, with the honest note). The render-time body clamp
stays as the final best-effort safety net.

### 4. Instrument legibility (`brand-kit.css`)
The sample keeps the honest swatch (role color on the actual background), but the ratio
pill, fix buttons, the "adjusted" pill, and the unreachable note now sit on the fixed
**panel** surface (`--ui-panel` / `--ui-panel-2`), so the instrument stays readable at any
user colors.

## Before → after (stress combo)
| | Before | After |
|---|---|---|
| Links "Bump contrast" | shown, **silent no-op** (#030303 → #030303) | unreachable detected → honest note + **Soften the background** (changes bg) |
| Body text | **no fix offered** | "Use a readable text shade" and/or "Soften the background" (working) |
| Clamp direction | deepen-only | bidirectional, smallest-change-first |
| Instrument pills/buttons | on raw `#E61E1E` | on panel surface (legible) |

## Kept (no regressions)
Never-block-save; verdict advisory (doesn't gate Brand ready); "adjusted" copy only when a
clamp moved a value; fix-persistence (accordion stays open until Hide details); truthful
copy; render clamps unchanged at defaults.

## Specs
- `brand-color-engine.spec.ts` (+5): bidirectional dark-on-dark(lighten)/light-on-light
  (deepen); unreachable → `reached:false` (stress links); NO-OP-when-already-passing;
  `softenSurfaceFor` makes an unreachable role reachable with a real surface change.
- `settings-brand-kit-stress.spec.ts` (new, 4): stress combo — every rendered fix button
  changes a value (no dead buttons); unreachable Links → background-fix + honest note;
  body text gets a working fix; reachable pale-signature → Bump contrast changes the
  signature.
- Defaults no-op: existing pinned baselines (zero-cyan, terracotta tints, body-clamp) stay
  green.

## Gates
`npm run build` exit 0 · truthful-copy PASS · full chromium suite green (known-acceptable
reds only).

## Smoke (Dallen)
Reproduce the exact combo (`#E61E1E` bg / `#030303` sig / `#FF9E3D` body): every visible
button does something, the Body chip gets real help, the panel stays legible. Also try a
near-neutral gray signature and a pale signature on cream. Then PR + squash.

Preview URL (branch alias, stable):
https://social-animat-git-e9199a-dallentaylorproductions-5050s-projects.vercel.app → `/settings/brand`
(Set the stress combo in Page surface + Signature: bg `#E61E1E`, signature `#030303`,
body text `#FF9E3D`, then open the Readability "View details".)
