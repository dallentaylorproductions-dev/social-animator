# BUILD_PACKET — Flagship seller page redesign → production

> **For: Claude cowork / engineering, implementing in the real codebase.**
> Repo context: `social-animator` · `src/tools/seller-presentation/output/` (the consumer
> page renderer + chart) + the brand engine (`assets/color_engine.js`, the 7-role
> `derive()`) + `/settings/brand` brand kit.
>
> This is a **treatment redesign**, not an IA change. Same sections, slots, order. The
> design reference is `flagship_template.html` (HTML/CSS prototype) — **recreate its look
> in the production React/TS component using existing patterns**; don't ship the HTML.

---

## 0. Read order
1. **This file** — what to build, what's frozen, the gotchas, acceptance criteria.
2. **`TOKEN_MAP.md`** — the authoritative element → role checklist (build by this).
3. **`DESIGN_README.md`** — rationale + §A/§D open engine questions + round 1–4 deltas.
4. `flagship_template.html` — the running reference. `reference/` — production ground truth.

---

## 1. Design surface vs. engineering-owned (read before touching anything)

| Area | Status |
|---|---|
| Colors / role application, type, spacing, tinted-band rhythm, card chrome, CTA structure, footer, count block, optional-slot behavior | **Design surface — apply this redesign** |
| **Area chart** — geometry, value scales, label-placement logic, the recommended dashed reference line, the data-dependent current-value label, draw-on motion | **FROZEN / engineering-owned.** Apply ONLY the color/type/card skin (TOKEN_MAP §7). Do not change geometry, data shape, label logic, or motion. The HTML chart is a *static replica* for visual eval — your real component already exists; just reskin it. |
| The 7-role engine math (OKLCh derivation, clamps) | **Do not change.** Open questions go to §A/§D as engine requests, not workarounds. |

---

## 2. The token system (the whole redesign rides on this)

**Only authored brand input = `--signature`.** Everything else is derived. Wire the engine's
`derive(signature, {surface, ink})` output to these CSS custom properties on the page root /
a wrapper, and the page repaints for any agent color.

### Derived roles (from the engine)
| Variable | Derivation | Notes |
|---|---|---|
| `--signature` | authored | big numbers, accents, CTA fill, links-base, footer wordmark |
| `--signature-deep` | `mix(signature, #000 22%)` | comp prices, chart recommended line/label |
| `--signature-link` | signature **clamped to 4.5:1** on surface | **resolved hex from `derive()`** — clamp can't live in CSS |
| `--tint-12 / --tint-6 / --line-30` | `mix(signature N%, tint-base)` | band fills / card fills / hairlines — **see §A** |
| `--on-signature` | `resolveOn(signature, paper, ink)` | **resolved hex from `derive()`**; dark for terracotta |
| `--decorative` | `secondary ?? signature` (secondary retired → signature) | eyebrow indices, pitch ordinals, quote marks |

### Layout-owned neutrals (constant; not derived; labelled in the CSS)
`--surface`/`--paper` `#F1EBE0` · `--ink` `#1A1612` · `--ink-soft` `#6B6256` · `--ink-faint`
`#9C9384` · `--tint-base` `#FBF8F2` · `--on-dark` `#F1EBE0` · `--dark-band` `#17120C` ·
`--dark-band-2` `#221B12`.

### Four implementation gotchas that WILL bite if missed
1. **Declare derived roles where `--signature` is in scope** (on the signatured element / a
   `[data-signature]` wrapper), **NOT on `:root`** — at `:root` `--signature` is undefined and
   the whole derived chain computes invalid (silently falls back to ink). This cost a full
   debug cycle in dev.
2. **`--on-dark` ≠ `--on-signature`.** `--on-signature` is resolved per signature (cream for
   blue, **dark for terracotta**) and is correct ONLY on a signature-filled element (the
   primary CTA label). All dark-band reading text uses the fixed layout cream `--on-dark`, or a
   terracotta page renders dark-on-dark.
3. **Primary CTA = fill `--signature`, label `--on-signature`.** Ghost CTA (on the dark band) =
   `--on-dark` border/label. (Contract §2/§4 — verified: terracotta label resolves dark.)
4. **Responsive = `@container` + `cqi`**, scoped to the page frame — not `vw`/media queries —
   so one page reshapes to any width and degrades gracefully.

---

## 3. Per-section build checklist

Build each section against **`TOKEN_MAP.md`** (it has every element→role). Section surfaces
(round-4 locked rhythm — every boundary contrasts):

| Section | Surface | Notes |
|---|---|---|
| Hero | dark scrim | on-photo text only on the solid scrim |
| Price | paper | `$` + amount = `--signature`; count-up motion; note = "Based on N recent sales nearby." (n-aware) |
| 01 Agent note + video | **quiet tint** (`.tint-quiet`) | video optional; desktop text optically centered vs video |
| 02 Why this price | **confident tint** | **count digit slot renders ONLY the derived numeral** (count of comps), beside the sentence; full claim copy |
| 03 Pitch points | **quiet tint** | |
| 04 Reviews | paper | optional; pull-quote classic editorial |
| 05 Area stats + chart | **confident tint** | stats optional w/ **ready / pending / off**; chart = frozen skin |
| 06 Agent band | dark | primary + ghost CTA per gotcha #2/#3 |
| Footer | dark | disclaimer always; **wordmark = conditional white-label slot** |

**Conditional / flex-in-out slots** (must read complete when absent): walkthrough video,
reviews, area-stats (3-state: ready/pending/off — pending shows the calm "market snapshot on
the way" card), footer wordmark (white-label off). The optional agent message in §02 renders
as a plain `--ink` lead, never the numeral treatment.

**Derived, not authored, content:** the §02 numeral + both anchor sentences come from the
comp count (n-aware grammar: "1 recent sale … anchors" / "N recent sales … anchor"). The
chart's current-value label is data-dependent (engineering-owned).

---

## 4. Decisions needed (carry into the build — don't silently resolve)

- **§A Tint surface** *(DESIGN_README)* — the literal contract tint formula (`12% → cream
  surface`) computes a muted olive; the approved confident sky tint requires mixing into a
  neutral base (`--tint-base`). **Confirm production's tint surface / encode `--tint-base`.**
  If production already tints against neutral, the page matches as-is.
- **§D Pale-signature big numbers** — informational big numbers (count digit, stat values)
  can't reach 3:1 on cream for pale signatures by foreground clamp alone. **Engine request:**
  seat them on a tint chip (the A4 background-adjust path). Decorative numerals stay unclamped.
- **Price eyebrow** — currently user-simplified to plain text (no dot/rule), diverging from the
  other eyebrows. Decide: propagate the quieter eyebrow system-wide, or restore the dot/rule.
- **Body text** — locked to `--ink`, non-overridable (approved). Links are the only
  brand-colored text run.

---

## 5. Acceptance / QA (how to know the build is right)

- **Signature sweep:** set 6 signatures (blue/green/terracotta + pale-yellow/navy/magenta).
  Every one must keep body text ink, paper cream, and a legible role distribution. Yellow is the
  known display-contrast failure → §D.
- **Terracotta CTA:** primary CTA label must be **dark** on terracotta (cream on the others).
- **Tint boundaries:** adjacent sections must contrast (no two confident bands fused).
- **Optional slots:** drop video / reviews / stats(off) / wordmark — page stays complete; stats
  pending shows the calm card.
- **Chart:** reskins with signature (trend/current = signature, recommended = signature-deep);
  geometry unchanged from `reference/production_chart.png`.
- **Motion:** price count-up + (engineering's) chart draw-on; reduced-motion shows end-states;
  print/PDF complete.
- **Strip the review chrome:** the `Mock states` bar + `data-vp`/`data-stats`/`data-opt-block`
  hooks + the 3 hostile signatures are prototype-only.
- **Verify SVG/derived bits via DOM/eval, not screenshots** where noted in DESIGN_README §G.

---

## 6. Files in this packet
| File | Purpose |
|---|---|
| `BUILD_PACKET.md` | this — implementation entry point |
| `TOKEN_MAP.md` | authoritative element → role checklist (build by this) |
| `DESIGN_README.md` | rationale, §A/§D engine questions, round 1–4 deltas, risks |
| `NEXT_PASS_BRIEF.md` | diagnose/iterate notes + invariants to preserve |
| `flagship_template.html` | running design reference (recreate, don't ship) |
| `reference/production_chart.png` | frozen-chart visual ground truth |
| `reference/current_template_screenshot.png` | original template (section inventory) |
| `reference/brand_kit_screenshot.png` | the brand-kit editing instrument |

**Fidelity:** high — final colors (via roles), type, spacing, interactions are as shown.
Recreate in the codebase's environment, preserving the token architecture, the
`@container`/`cqi` model, and the design-vs-frozen split above.
