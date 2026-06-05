# Flagship seller page — color-first redesign (round 2)

Redesign of the **Editorial** seller-presentation template. Same sections, same slots, same
order as the shipped template — what changed is the **visual treatment** and **how the brand
color system lands**. Round 2 reconciles against the real `ENGINEERING_CONTRACT.md` and
applies Dallen + Cowork's corrections.

- `flagship_template.html` — the redesigned full-length page (mobile-first + desktop). The
  engine's role variables are the only color inputs; layout-owned neutrals are labelled.
- `TOKEN_MAP.md` — every section/element → role.
- `flagship_template_v1.html` — round-1 version, kept for diff.
- **Mock states** bar (top): viewport · 6 signatures (3 real + 3 hostile stress tests) ·
  optional Video/Reviews/Comp-note · stats Ready/Pending/Off. Engineering strips it.

---

## Round 4 deltas (current — convergence)

1. **Anchor sentence de-duplicated.** The price-section note is now the short subordinate form
   **"Based on 4 recent sales nearby."** (credibility tag at the reveal); section 02 keeps the full
   claim (big numeral + "recent sales nearby anchor this number."). Same derived count, n-aware in both.
2. **Tint map amended — Reviews → paper.** Round-3 had confident bands on 04 + 05 adjacent (they
   fused). Final: price=paper · note=quiet · why=confident · pitch=quiet · **reviews=paper** ·
   area=confident — every section boundary now contrasts. Supersedes the round-3 table.
3. **Footer reworked.** Floating "S" mark deleted. The **Studio SEP wordmark is now an optional
   white-label slot** (`data-opt-block="wordmark"`, toggle in the Mock states bar) that flexes
   in/out like the optional sections; the footer reads balanced with it present or absent, and the
   disclaimer is always present. Wordmark styling (Studio = on-dark, SEP = signature) unchanged.
4. Untouched per instruction: the frozen chart skin, count B-side, §01 centering, desktop layout,
   body-text lock, disclaimer copy.

---

## Round 3 deltas (current)

1. **Chart is FROZEN — restyle only.** Stopped re-deriving it. The chart is now a **static
   faithful replica** of `reference/production_chart.png` (the JS geometry renderer is gone),
   wearing only the role skin: trend line + dots + end marker + current value = `--signature`;
   recommended dashed line + label + pill = `--signature-deep`; area fill = flat 8% `--signature`;
   gridlines `--line-30`; all chart type → mono. It reskins with any signature (verified blue +
   terracotta). Geometry/scales/labels/motion are engineering-owned; `TOKEN_MAP §7` has the
   one-row skin map. *(Bonus: being static, it now also renders in screenshots/PDF.)*
2. **Count locked to digit-beside-sentence.** Inline variant + the count toggle removed; the
   beside variant refined (tighter digit↔sentence size ratio, baseline-married).
3. **Per-section tint rhythm (locked):** note=quiet · why=confident · pitch=quiet ·
   reviews=confident · area=confident. Applied as `.tint-quiet`/`.tint-confident` classes; the
   global tint toggle is removed. (why + reviews are now tinted bands; previously paper.)
4. **Desktop §01 note alignment:** the agent-note text now sits optically centered against the
   video card (true center, nudged ~14px above), as a relational `align-items:center` rule that
   degrades toward top alignment if the note grows — no longer pinned to the top.
5. Carry-forwards intact: Studio SEP footer + verbatim disclaimer, n-aware count grammar,
   pending state, body locked to ink, motivated motion, on-scrim text only.

> **Two direct user edits observed & handled:** the price eyebrow was hand-simplified to plain
> `RECOMMENDED LIST` (dot + rule removed) — left as the user set it (it now differs from the
> other eyebrows; decide whether to propagate or restore). The footer "S" mark had been cleared
> — restored, since round-3 reaffirms the Studio SEP wordmark spec.

---

## A. The tint discrepancy (read first — engine clarification, not a workaround)

The contract derives tints as `color-mix(in oklch, signature N%, --surface)`. But `--surface`
is the **warm cream** `#F1EBE0`, so the literal formula computes a **muted, warm-leaning**
tint, not the confident sky tint the brand-kit preview shows and that you asked me to keep:

| Blue `#037290` tint-12 | result | reads as |
|---|---|---|
| `12% → cream surface` (literal contract) | `#c8ceb4` | muted **olive** |
| `24% → cream surface` | `#c8ceb4`-ish, still warm | warm grey-green |
| `22% → white` ≈ brand-kit `#cadfe8` | `#cedfe6` | **confident sky** ✓ |

So the brand-kit's confident tint is produced by mixing the signature into a **neutral base**,
not the warm surface. To deliver the strength you approved while keeping `--signature` the only
brand input, the page mixes tints into a layout-owned neutral `--tint-base` (`#FBF8F2`):
`--tint-12 = mix(signature 24%, --tint-base)`, etc. The **Quiet** mode shows the quieter
`--tint-9`-ish notch for comparison; **Confident is the default**, per your decision.

> **Engine request:** confirm production's tint surface. If production already tints against a
> neutral (it must, to look like the brand-kit on a cream page), encode `--tint-base` in the
> engine and the page matches exactly. If it literally uses the cream `--surface`, the bands
> on the real page are muted olive and the contract formula should change. This is the one
> ramp item I couldn't resolve from the documents alone.

---

## B. Round-2 corrections applied

1. **Reconciled to the contract.** Paper `#F1EBE0`, ink `#1A1612`. Roles derived in OKLCh per
   §2 (deep = +22% black; tints; line-30). Clamped roles seeded with engine-modelled resolved
   hexes — my values reproduce the contract's worked examples (blue 4.64 on cream unclamped;
   terracotta link clamps deeper; terracotta on-signature → ink).
2. **CTA fixed to the contract (§2/§4).** Primary CTA is now **fill = `--signature`, label =
   `--on-signature`**. Consequence, exactly as the contract documents: on **terracotta** the
   label resolves **dark**, not cream. The ghost CTA (on the dark band) uses the layout cream
   `--on-dark`, never `--on-signature` — otherwise a terracotta page renders dark-on-dark.
   New token `--on-dark` carries all dark-band reading text.
3. **Comps count block rebuilt.** The giant slot renders **only the derived digit** (count of
   comp rows), never freeform text — kills the "giant first letter" failure by architecture.
   Size brought down to ~60–84px and **married to the sentence** so they read as one
   statement (two treatments — *Beside* and *Inline* — toggle in the bar). n-aware grammar:
   `4 recent sales nearby anchor this number.` / `1 recent sale nearby anchors this number.`
   ("nearby", one word — the production typo is not reproduced.) An optional agent message
   renders as a normal `--ink` italic lead **below** the block (toggle "Comp note"), never the
   numeral treatment. The count digit uses `--signature` (a substantive big number → 3:1
   display role), not `--decorative`.
4. **Desktop got the real pass.**
   - **Chart distortion fixed.** The chart is now drawn by JS sized to the container (viewBox
     = actual width, `xMidYMid meet`) — no `preserveAspectRatio="none"` stretch, axis labels
     are HTML. It redraws on resize / frame-width change (ResizeObserver) and looks composed at
     every width.
   - **Editorial depth** behind `@container (min-width:820px)`: price becomes a digit + side-note
     composition, comps become a **two-column ledger**, note/stats/contact go multi-column.
   - Leads/measures audited so line lengths stay readable wide.
5. **Two truthful-structure restorations.**
   - **Recommended reference line** on the chart: a dashed `--signature-deep` line + label at
     the recommended price, drawn as part of the chart's draw-on. The median-vs-recommendation
     juxtaposition is the section's argument.
   - **Area-stats pending state:** calm placeholder with the production copy and a quiet
     shimmer — never looks broken (toggle stats → Pending).
6. **Footer:** real **Studio SEP** wordmark (small "S" mark, "SEP" serif-italic in `--signature`)
   + the verbatim disclaimer (`{ClientName}` interpolated to "the Harland family").
7. **Copy:** walkthrough caption "Let's walk through your plan", reassurance line "No pressure,
   reach out anytime."

---

## C. Your locked answers — carried as final
- **Body text locked to `--ink`**, non-overridable. Links are the only brand-colored text run.
- **Tint = confident strength** (default); Quiet toggle for comparison.
- **Terracotta link clamp** confirmed intended — no engine change.

---

## D. Hostile-signature stress test (3 added to the switcher)

| Signature | Finding |
|---|---|
| **Pale yellow `#E8C547`** | **Display FAILS 3:1** on cream (1.42) — the count digit / stat values can't reach legibility by foreground-only clamp. This is the contract A4 "adjust background" case. Link deepens 7 steps to dark gold `#7A5900` (legible). **Decorative** numerals (eyebrow index, pitch ordinals) go near-invisible — that's the contract's intended "decorative = full strength, Readability advises", but it's the weakest moment; see engine request below. |
| **Near-black navy `#15263F`** | Everything passes; on-signature → cream; bidirectional clamp (A1) means nothing needed lightening here, but the ramp stays usable. Footer wordmark on the dark band is low-contrast for very dark signatures (display size, minor). |
| **High-chroma magenta `#C8197B`** | Passes display + link unclamped (4.56); on-signature → cream. Tints stay clean. Sings. |

> **Engine request (from the stress test):** for *pale* signatures, the giant **count digit**
> and **stat values** are informational big numbers but can't reach 3:1 on cream by foreground
> clamp. Recommend the engine treat these as display text and apply the A4 background-adjust
> (e.g. seat them on a `--tint-12` chip) rather than leaving them full-strength. Decorative
> numerals can stay unclamped, but informational numbers shouldn't.

---

## E. Type intent (engineering maps to self-hosted faces)
Display serif **Newsreader** (true italic) · body sans **Hanken Grotesk** · mono **IBM Plex
Mono**. Italic emphasis is a type device, never color.

---

## F. Motion (motivated, mobile-cheap, reduced-motion + print safe)
- **Price** counts up once in view. **Chart** strokes its median line, fades the area, then the
  Recommended reference line, then the end marker.
- Reveal driver is a single scroll/load/resize check (no stranded-invisible failure); the chart
  commits its visible end-state synchronously and animates *from* hidden, so a throttled/
  background tab never leaves the line undrawn. `beforeprint` forces all end-states.
  `prefers-reduced-motion` shows end-states immediately.

---

## G. Risks / open questions
- **Tint surface (§A)** — the one ramp item needing your/engineering confirmation.
- **Pale-signature informational numbers (§D)** — engine request to clamp/seat them.
- **Capture artifacts (unchanged):** screenshot tools can't rasterize the stroked chart line
  and show a false font-swap overlap on the note headline. Verify those via eval/geometry, not
  snapshots — both confirmed clean live (line `dashoffset:0`, resolved stroke; note gap +14px).
