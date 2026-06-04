# Handoff: Brand kit v2 + dynamic seller-page color pass

## Overview

Phase E.1. Agents pick **one signature color** (plus an optional secondary). The system
**derives** a full 7-role tonal ramp from it — lightness-led, hue/chroma held, every
text-bearing step contrast-clamped — and the **Editorial layout distributes** those roles
across the published seller page. Derived shades are **shown read-only**, never asked as
extra pickers.

Two deliverables:
1. **Brand kit v2 settings screen** (`/settings/brand`) — a calm-dark form where the agent
   sets the signature/secondary and watches the derived palette, a live phone preview, and a
   readability verdict recompute in real time.
2. **Seller-page color pass** (`/h/<slug>`) — the published Editorial page re-rendered
   through the derived ramp, shown in three signatures to prove distribution.

## About the design files

The files in this bundle are **design references created in HTML/CSS + a little React (via
Babel-in-browser)** — prototypes showing the intended look, the exact derivation math, and
the role distribution. **They are not production code to ship directly.** The task is to
**recreate these designs in the target codebase's environment** (this is a React/TS web app
in the E.0 context) using its established component library, theming, and state patterns.

**One file is the exception and SHOULD be ported close to verbatim:** `assets/color_engine.js`
is the pure derivation function — framework-agnostic, dependency-free, and the canonical
reference implementation of the contract. Port its math exactly (it emits both CSS-var values
and resolved hexes; canvas templates consume the hexes in a later phase, so keep the return
shape stable). Everything else — the dark settings chrome, the MiniPage, the seller layout —
is a visual/behavioral spec to rebuild in the app's own primitives.

`ENGINEERING_CONTRACT.md` (included) is the authoritative spec for tokens, formulas, clamp
thresholds, the data contract, and preserved test IDs. **Where this README and the contract
overlap, the contract wins.**

## Fidelity

**High-fidelity.** Final colors, typography, spacing, derivation math, and interaction
behavior. Recreate pixel-accurately using the codebase's existing libraries. The signature
families and the derived ramp are computed — do **not** hardcode the swatch hexes you see in
screenshots; run them through the ported engine so they stay correct for any signature.

---

## Color space (read first)

All mixing is **OKLCh** — `color-mix(in oklch, …)` in CSS and the matching OKLab/OKLCh math in
`color_engine.js`. This was a round-2 decision: the earlier sRGB path desaturated the deep and
tint steps toward mud. Do not reintroduce sRGB mixing on the live path. sRGB equivalents exist
in the contract as audit reference only.

---

## Screens / Views

### 1. Brand kit v2 — settings screen (`brand_kit_v2.html`)

**Purpose:** the agent sets their signature (and optional secondary), sees the full derived
palette, previews a real seller page, and gets a never-blocking readability read.

**Layout:**
- Calm-dark canvas (`#0A0E0C`) with a faint mint radial glow top-left (two stacked
  `radial-gradient`s, fixed, non-interactive).
- Max content width **1320px**, padding `34px 40px 96px`, centered.
- **Top bar:** a mono "← Studio" link in mint, then a pill tab strip (`Profile` | **Brand**).
  Active tab = cream fill `#ECE7DD` with dark text.
- **Header:** "Brand kit" at 52px/700/-0.025em, plus a one-line muted subhead.
- **Two columns**, `minmax(0,1fr) 420px`, gap **72px**, top-aligned:
  - **Left = the form** (color rows, palette strip, advanced group, layout select,
    readability panel, footer notes).
  - **Right = sticky preview** (`top: 34px`): a phone frame containing the live MiniPage.
- **Responsive:** ≤940px collapses to one column (preview drops below, becomes static);
  palette strip goes 7→4 per row. ≤560px: header shrinks, palette 2 per row, phone full-width,
  swatches/hex inputs shrink. This matches the current Brand kit stacking.

**Components (left column, top to bottom):**

1. **Signature color row** — `testid="brand-color-signature"`. The hero input, highest
   prominence. Grid `64px 1fr`, gap 22px: a 64×64 rounded swatch (radius 12px, inset
   hairline) showing the live color, then a header row (`Signature color` 17px/600 + a mono
   "THE ONE COLOR" tag), a field row (mono hex input 148px wide + a "Reset" ghost button), and
   an italic-serif helper line: "Pick one color. We build your palette from it — prices,
   buttons, links, accents and dividers all derive from here." Reset → `#C26A4E`.

2. **Secondary color row** — `testid="brand-color-secondary"`. Same structure, visually
   quieter (label 500 weight), tag reads "OPTIONAL". When unset the swatch shows a diagonal
   hatch (empty state) and the input shows placeholder "Optional"; the button reads **"Add"**.
   When set the button reads **"Clear"**. Helper: "Used for decorative moments — section
   numerals, end-marks — when set. Derived from your signature when not."

3. **"Your palette" strip** — `testid="brand-palette-strip"`, read-only. A header
   (`Your palette` 14px/600 + mono "DERIVED · READ-ONLY"), then a 7-column grid of chips
   (`PaletteStrip`, see component spec). NOT clickable, NOT pickers.

4. **Page surface (advanced)** — a disclosure, collapsed by default. Toggle button: a caret
   (rotates 90° when open), "Page surface" 15px/600, and a right-aligned italic-serif subnote
   "Layout-owned defaults you can override." Expanded body holds two color rows: **Background**
   (`brand-color-background`, reset `#F1EBE0`) and **Text** (`brand-color-text`, reset
   `#1A1612`). These were demoted from the round-1 prominence, not removed.

5. **Default layout** — a styled native `<select>` (custom caret via inline SVG bg). Options:
   `Editorial` (value `editorial`) · `Studio` (`studio`) · `Warm` (`warm`). Helper notes that
   Studio and Warm currently fall back to the Editorial layout. Default `editorial`.

6. **Readability panel** — `testid="brand-readability"`. A card (`#111714`, hairline border,
   radius 16px, padding 24px). Contains:
   - A **verdict pill**: a 16px round dot (✓ or !) + label. Good = mint "Easy to read";
     warn = amber "Worth a look". The verdict tracks the **load-bearing** roles
     (body + prices + secondary-if-set) — the Links chip carries its own finer warning so a
     link-only contrast miss does not flip the whole verdict.
   - A descriptive line (good vs. warn copy; warn copy notes published pages auto-clamp).
   - **Sample chips** (each a row on a `--sample-bg` = the page background): a label rendered
     in the role's resolved color, a mono ratio pill (`Clear N.N` green / `Low N.N` amber), and
     — only when failing — a "Bump contrast" button (`brand-readability-fix`). The chips are:
     **Body text** (target 4.5), **Prices & big numbers** (target **3.0**), **Links** (target
     **4.5**), and — only when secondary is set — **Section numerals** (target 3.0). The
     Prices and Links chips both read the agent's **raw** signature contrast but grade it
     against different thresholds (this is the round-2 split — see Interactions).
   - **Never blocks save.** Everything persists regardless; the panel only advises.

7. **Footer notes** — two lines: a mint-dot "Saved automatically." and an ⓘ note, verbatim:
   **"Existing published pages keep their original colors. New publishes use your latest
   brand."** (Keep this string exactly.)

**Right column — preview:**
- Header: mono "PREVIEW" + a mint "LIVE" with a glowing dot.
- **Phone:** 384px wide, body `#060807`, radius 44px, 11px padding, big soft drop shadow.
  Screen: radius 34px, **720px tall, scrolls internally** (hidden scrollbar), background
  `#F1EBE0`. Holds the **MiniPage** (see component). The full derived ramp is written as CSS
  vars onto the MiniPage root whenever the signature/secondary/surface changes.
- Italic-serif caption below: "This is what your seller sees. It updates as you dial each
  color."

### 2–4. Seller pages (`seller_page_ramp_{terracotta,cobalt,navy_gold}.html`)

One Editorial template (`assets/seller.css`, `sp-*` classes); only the signature differs
(navy_gold also sets a secondary). **Purpose:** prove the derived ramp distributes across
real page roles. **Layout** (single column, max 760px, generous vertical rhythm):

- **Nav** — wordmark "Thomas *Realty*" (the emphasized word is signature) + a mono meta note.
- **Hero** — a 16:12 photo placeholder with a bottom scrim; the scrim holds the eyebrow
  (rendered in **on-dark cream**, see the on-photo rule), a large serif address, and a mono
  meta line with signature-colored `•` separators.
- **Price** — a `tint-12` panel (radius 18px, padding 40px) with a giant `signature-deep`
  numeral, a short signature rule, and an italic note.
- **Note + video** — a 16:9 video placeholder with a circular signature play button
  (`on-signature` glyph).
- **Plan** — a 3-item ordered list; **italic serif numerals in the decorative role**, rows
  divided by `line-30` hairlines, ending in a `signature-link` "See the full plan" link.
- **End-mark** — a centered ◆ in the **decorative role** (signature, or secondary when set).
- **Stats** — a 2×2 grid of `tint-6` cards on a `line-30` grid, values in `signature`.
- **Agent deep band** — layout-owned dark `#1A1612`: signature eyebrow, big serif name, an
  avatar + verified badge (badge = signature family), and two CTAs — primary = signature fill
  with `on-signature` label, ghost = cream outline. A mono footer with a decorative ◆ glyph.
- **Demo switcher** (`.sp-demo`, bottom-right, **not production chrome** — strip on
  implementation): preset swatches + a hex input + a "secondary" toggle, all driving the same
  engine live.

**The 8 spots that were hardcoded cyan** and must now read as the signature family:
eyebrows, the `•` dots, the verified badge, the footer glyph, and the wordmark emphasis.

---

## Interactions & behavior

- **Live derivation.** Any change to signature / secondary / background / text re-runs
  `BrandEngine.derive(...)` and rewrites the CSS-var set on the MiniPage root (settings) or
  `:root` (seller). No reload. In React, derive in a `useMemo` keyed on those four inputs and
  apply via an effect.
- **Hex fields** keep a local draft; commit on blur or Enter. Invalid input shows an error
  border and does **not** commit (last good value stays). Empty + has-placeholder (secondary)
  commits as unset.
- **Reset / Add / Clear** buttons set the field to its default, set secondary, or clear it.
- **Readability grading (round 2, important):**
  - **Prices & big numbers** = display scale → pass at **3.0:1** (AA-large).
  - **Links** = body scale → pass at **4.5:1** (AA). Both grade the agent's *raw* signature
    against the page surface, so an agent whose links fail body contrast actually sees it even
    when prices pass. The published page always renders the **clamped** tokens, so it stays
    legible regardless of the warning.
  - **Bump contrast** sets the signature to the engine's clamp result for that chip's target
    (3.0 for prices, 4.5 for links; secondary bumps to 3.0).
  - Verdict = good when body + prices + secondary(if set) pass; the Links chip warns
    independently without flipping the verdict.
- **on-signature (CTA/label text on a signature fill) — deterministic:**
  1. both cream(paper) and ink pass AA(4.5) on the fill → **prefer paper** (brand cohesion);
  2. only one passes → use it;
  3. neither passes → lightness-clamp the **fill** (not the text) until paper passes, then
     text = paper.
  Consequence to expect, not a bug: **terracotta `#C26A4E` resolves its CTA label to DARK
  ink** (paper 3.23 fails, ink 4.64 passes). Cobalt and navy resolve to cream.
- **On-photo / hero rule:** signature-colored text sits on **solid surfaces only**. Text over
  a photo (hero eyebrow) uses the layout's on-dark cream, never the signature — legibility must
  never depend on photo content.
- **Persistence:** the settings screen writes the four fields + layout to storage on user
  edit. **Never write on mount** (E.0 contract) — load, hex-clamp, render; only persist on an
  actual change. Unset secondary is a first-class state, not a persisted empty string.

## State management

State shape (settings screen):
```
{ signature: hex,            // required; = existing brandAccent field (label rename only)
  secondary: hex | '',       // NEW optional; '' = unset
  background: hex,           // layout-owned default, overridable (#F1EBE0)
  text:       hex,           // layout-owned default, overridable (#1A1612)
  layout:     'editorial' | 'studio' | 'warm' }
```
Derived (never stored): the full ramp + the readability report, both from
`BrandEngine.derive(signature, { surface: background, ink: text, secondary })`.

## Design tokens

**Derived ramp** (formulas pre-clamp; the engine then AA-clamps text-bearing steps — see the
contract for thresholds). `surface` = background, `ink` = text:

| Token | Formula (OKLCh) | Role |
|---|---|---|
| `--signature` | `signature` (clamped ≥3:1 vs surface) | eyebrows, dots, badge, glyph, wordmark, prices, big stats, CTA fill |
| `--signature-deep` | `mix(signature, #000, 22%)` (≥4.5 vs tint-12) | price numerals |
| `--signature-link` | `signature` deepened (≥4.5 vs surface) | body links |
| `--tint-12` | `mix(surface, signature, 12%)` | panel fills |
| `--tint-6` | `mix(surface, signature, 6%)` | stat-card fills |
| `--line-30` | `mix(surface, signature, 30%)` | rules / dividers |
| `--on-signature` | `resolveOn(fill, paper, ink)` | text on signature fills |
| `--decorative` | `secondary ?? signature` (full strength) | section numerals, end-marks |

**Settings chrome (fixed UI palette, not derived):**
bg `#0A0E0C` · panel `#111714` · panel-2 `#151C18` · field `#0E1411` · line `rgba(255,255,255,.09)` ·
text `#ECEAE4` · text-2 `#8E968F` · text-3 `#5E665F` · mint `#63C9A1` · amber `#E0A45C` ·
cream tab `#ECE7DD`. Radii 16/12/9px.

**Layout-owned (seller, fixed):** paper `#F1EBE0` · ink `#1A1612` · dark band `#1A1612` ·
on-band cream `#F1EBE0` · photo placeholders = neutral diagonal hatch.

**Default signatures used in the demos:** terracotta `#C26A4E`, cobalt `#2C53C4`,
navy `#1F3A6B` + gold secondary `#B0863A`.

**Type:**
- Settings UI: **Hanken Grotesk** (400–700).
- Editorial seller + serif accents: **Newsreader** (incl. italics, used for numerals).
- Mono (eyebrows, hex, meta, ratios): **JetBrains Mono**.
- Pairing is a designer choice for these prototypes — map to the codebase's equivalent UI
  sans, editorial serif, and mono if the app already has a type system.

## Assets

No raster assets. All imagery is **placeholders** (diagonal-hatch blocks with mono captions)
— wire to the app's real photo/video components. Icons used are plain Unicode glyphs
(✓ ▶ ◆ ⓘ ←) — swap for the codebase's icon set. Fonts load from Google Fonts in the
prototypes.

## Preserved test IDs

`brand-color-signature`, `brand-color-secondary`, `brand-color-background`,
`brand-color-text`, `brand-palette-strip`, `brand-palette-chip-*`, `brand-readability`,
`brand-readability-ratio`, `brand-readability-fix`, `brand-minipage-preview`.

## ⚠️ Two consequences to pin consciously

1. **Default-look delta:** the 8 ex-cyan spots become the signature family — **terracotta at
   defaults**. This is the one deliberate cohort change. **No cyan anywhere.** Pin the new
   computed-style baseline (visual regression) on purpose.
2. **Terracotta CTA label is now dark** (the `on-signature` rule). Expected, not a regression.

## Files in this bundle

- `brand_kit_v2.html` — Artifact 1 (settings screen). Loads `assets/brand_kit.css`,
  `assets/color_engine.js`, `palette_strip.jsx`, `assets/minipage.jsx`.
- `seller_page_ramp_terracotta.html` / `_cobalt.html` / `_navy_gold.html` — Artifact 2 (a–c).
  Each loads `assets/seller.css` + `assets/color_engine.js`.
- `palette_strip.jsx` — the read-only ramp strip component.
- `assets/color_engine.js` — **port verbatim**; the derivation contract reference.
- `assets/minipage.jsx` — the live MiniPage (role-coverage reference).
- `assets/brand_kit.css` / `assets/seller.css` — styling specs.
- `ENGINEERING_CONTRACT.md` — **authoritative** tokens / formulas / clamp rules / data +
  function contract / preserved test IDs.

To run a prototype: open any HTML file directly in a browser (no build step — React + Babel
load from CDN).
