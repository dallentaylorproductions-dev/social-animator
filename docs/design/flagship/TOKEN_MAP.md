# TOKEN_MAP.md — section/element → role checklist (round 2)

`flagship_template.html` reads the engine's derived roles as its only brand inputs. The
**only authored brand value is `--signature`**; every other brand role is derived from it
in OKLCh (contract §2). The two clamped roles (`--signature-link`, `--on-signature`) are
seeded per signature with the engine's *resolved* hex, because WCAG clamps can't live in
CSS. Layout-owned neutrals are labelled and are NOT derived from the signature.

## Roles (engine output)

| Variable | Derivation | Paints |
|---|---|---|
| `--signature` | authored | accent dots, **big numbers** (price, count digit, stat values), chart line/dot, CTA fill, footer wordmark (conditional) |
| `--signature-deep` | `mix(signature, #000 22%)` | comp prices, chart marker + **Recommended** reference line/label, price-note emphasis |
| `--signature-link` | signature clamped to **4.5:1** on surface | body-size links only |
| `--tint-12` | `mix(signature 24%/13%, --tint-base)` ¹ | full-bleed tinted section bands (per-section rhythm, §below) |
| `--tint-6` | `mix(signature 13%, --tint-base)` ¹ | stat-card fills, pending-card fill |
| `--line-30` | `mix(signature 34%, --tint-base)` ¹ | every hairline / divider / card border |
| `--on-signature` | `resolveOn(signature, paper, ink)` (§4) | label on the signature-filled CTA only |
| `--decorative` | `secondary ?? signature` (secondary retired → = signature) | eyebrow index numerals, pitch ordinals, quote end-marks |

¹ **Tint derivation differs from the literal contract on purpose — see README §A.** Tints mix
into a layout-owned neutral `--tint-base`, not the warm cream surface. **Per-section tint rhythm
(round 4, locked — supersedes round 3):** tinted bands carry a `.tint-confident` or `.tint-quiet`
class; untinted bands are plain `--paper` so every section boundary contrasts —
price = paper · 01 note = quiet · 02 why/comps = confident · 03 pitch = quiet ·
04 reviews = **paper** · 05 area = confident. (The old global Confident/Quiet toggle was removed.)

## Layout-owned neutrals (constant across every signature; labelled in CSS)

| Variable | Value | Paints |
|---|---|---|
| `--surface` / `--paper` | `#F1EBE0` | page surface (contract default `background`) |
| `--ink` | `#1A1612` | all reading text (contract default `text`) |
| `--ink-soft` | `#6B6256` | secondary text, eyebrows, leads, meta |
| `--ink-faint` | `#9C9384` | tertiary (comp index, source, marker axis) |
| `--tint-base` | `#FBF8F2` | neutral base the tints mix into (README §A) |
| `--on-dark` | `#F1EBE0` | **cream text on the dark band / hero scrim** (NOT `--on-signature`) |
| `--dark-band` / `--dark-band-2` | `#17120C` / `#221B12` | dark section base / raised card |

> **`--on-dark` vs `--on-signature` — the round-2 correction.** `--on-signature` is resolved
> per signature (cream for blue, **dark ink for terracotta**, etc.) and is ONLY correct on a
> signature-colored fill. Text on the layout's dark band must use the fixed layout cream
> `--on-dark`, or a terracotta page would render dark-on-dark. The dark band uses
> `--on-signature` in exactly one place: the primary CTA label.

---

## Section-by-section (template order — frozen)

### 1 · Hero
Photo (no token) · topline/eyebrow/address/meta = `--on-dark` · eyebrow dot = `--signature` ·
scrim band bg = `--dark-band`. On-photo text only on the solid scrim (contract §5).

### 2 · Recommended list price
bg `--paper` · eyebrow label `--ink-soft`, rule `--line-30`, dot `--signature` ·
`$687,298` (+ `$`) = `--signature` · price-note count emphasis = `--signature-deep` · rest `--ink-soft`.
Note copy = the short subordinate form "Based on N recent sales nearby." (n-aware; the full
claim lives in §4). *(Note: the eyebrow here was user-simplified to plain text — no dot/rule.)*

### 3 · Agent note + walkthrough *(video optional)*
bg `--tint-12` · eyebrow index `--decorative` · headline/lead `--ink`/`--ink-soft` ·
video play fill `--on-dark`, glyph `--signature`.

### 4 · Why this price (comps)
bg `--paper` · eyebrow index `--decorative` ·
**count digit** = `--signature` (a substantive big number, NOT decorative — gets the 3:1
display role; the slot renders ONLY the derived digit, never freeform text) ·
count sentence = `--ink` · optional agent message (`.count__msg`) = `--ink` italic lead
(never the numeral treatment) · comp rules `--line-30` · comp index `--ink-faint` ·
comp address `--ink` · comp meta `--ink-soft` · **comp price `--signature-deep`** ·
tag / source `--ink-faint`.

### 5 · Pitch points
bg `--tint-12` · eyebrow index `--decorative` · item ordinals `--decorative` ·
item rules `--line-30` · heading `--ink` · body `--ink-soft`.

### 6 · Reviews *(optional)*
bg `--paper` · eyebrow index `--decorative` · quote marks `--decorative` · quote `--ink` ·
attribution rule `--signature`, text `--ink-soft` · "See all reviews" link `--signature-link`.

### 7 · Area stats + chart *(optional · ready / pending)* — band tint = **confident**
**Ready:** stat grid border/dividers `--line-30` · stat-card fill `--tint-6` ·
stat key/sub `--ink-soft`/`--ink-faint` · **stat value `--signature`**.

**FROZEN chart (round 3 §1) — restyle-only skin.** The chart is a static faithful replica of
`reference/production_chart.png`; geometry, scales, label positions, data shape and motion are
engineering-owned. Design owns ONLY this color/type/chrome skin:

| Chart element (class) | Role |
|---|---|
| card (`.chart`) | fill `--paper`, border `--line-30` (card chrome = yours) |
| title / subtitle (`.chart__title/__sub`) | mono, `--ink-soft` / `--ink-faint` |
| trend line + data dots + end marker (`.cl-line/.cl-dot/.cl-end/.cl-halo`) | `--signature` (dot/ring centre filled `--paper`) |
| current value label (`.cl-curv`) | `--signature` · its eyebrow (`.cl-curk`) `--ink-faint` |
| recommended dashed line + label + pill (`.cl-ref/.cl-refv/.cl-refk/.cl-pill`) | `--signature-deep` (pill fill `--tint-12`) |
| area fill under line (`.cl-area`) | flat low-opacity `--signature` (8%) |
| gridlines (`.cl-grid`) | `--line-30` |
| axis text, x/y labels (`.cl-axis`) | mono, `--ink-faint` |

**Pending:** pending card `--tint-6`/`--line-30` · "Market snapshot" label `--ink-soft`, shimmer accent `--signature` · message `--ink`.

### 8 · Dark agent band
bg `--dark-band` · eyebrow index `--decorative` · name/bio/card text/fields = `--on-dark` ·
card avatar status dot `--signature` · field grid cells `--dark-band` ·
**Primary CTA: fill `--signature`, label + icon `--on-signature`, icon chip `--on-signature`@16%** (contract §2/§4) ·
reassurance line `--on-dark`@alpha ·
**Ghost CTA: border + label + icon `--on-dark`** (it's on the dark band, so NOT `--on-signature`).

### 9 · Footer
bg `--dark-band` · hairline `--on-dark`@low-alpha · **wordmark (`.foot__word`, CONDITIONAL slot)**:
"Studio" = `--on-dark`, "SEP" em = `--signature` — white-label off for top-tier agents
(`data-opt-block="wordmark"`; flexes in/out like optional sections; footer reads balanced either way) ·
disclaimer `--on-dark`@low-alpha, **always present**. Disclaimer copy is the verbatim production
string; `{ClientName}` is interpolated (shown here as "the Harland family"). *(The round-3 floating
"S" mark was removed in round 4.)*

---

## Conversion notes for engineering
- Swap `data-signature` on `<body>` to repaint; the layout never reaches past the role vars.
- The derived roles are declared on `[data-signature]` (NOT `:root`) so `var(--signature)` is
  in scope — declaring them at `:root` computes them invalid (the bug that bit round-2 dev).
- Replace the per-signature *seed* blocks with the engine's live `derive()` output
  (`--signature`, `--signature-link`, `--on-signature` resolved hexes + the tint base decision).
- Hairlines are always `--line-30`; tint-12 for section bands, tint-6 only for cards inside them.
- The Mock-states bar, the `data-tint`/`data-count`/`data-stats` attributes, and the hostile
  signatures are review chrome — strip them.
