# Handoff — Flagship seller page (color-first redesign)

> **For: Claude Code / cowork, next iteration pass.**
> This package is optimized to **view, iterate, and diagnose** — not to rebuild from
> zero. The design already exists as one self-contained HTML file that runs as-is.
> Your job next pass is to *upgrade* it (and/or port it), not re-derive it.

> **⟳ Round 4 — converged & build-ready.** Start at **`BUILD_PACKET.md`** (the engineering
> implementation entry point), then `TOKEN_MAP.md`. Round-4 state: anchor sentence
> de-duplicated (price = "Based on N recent sales nearby."); tint rhythm finalized
> (price·note-quiet·why-confident·pitch-quiet·**reviews-paper**·area-confident — every
> boundary contrasts); footer "S" mark removed and **Studio SEP wordmark is now an optional
> white-label slot**; the **area chart is frozen** (restyle-only skin on engineering-owned
> geometry). Two engine questions remain open: **tint surface (§A)** and **pale-signature
> big numbers (§D)** in `DESIGN_README.md`.

---

## 0. TL;DR — what this is

A premium, warm, mobile-first **1:1 seller presentation page** an agent sends to ONE
homeowner before/after a listing conversation. Calm, editorial, trustworthy — no FOMO,
no popups, no hype. This redesign keeps every section, slot, and order of the shipped
"Editorial" template and changes only the **visual treatment** and **how the 7-role brand
color system lands** on the page.

The single most important idea: **the agent picks ONE signature color, and the engine
derives a 7-role ramp from it.** The page must look rich and intentional for *any*
signature — so we ship it live-switchable across three (blue default, green, terracotta)
to prove the system, not one colorway.

---

## 1. How to view it (do this first)

1. Open `flagship_template.html` in a browser. It's fully self-contained (fonts via
   Google Fonts CDN; everything else inline). No build step.
2. Use the **Mock states** bar pinned at the top (this is review chrome — see §5):
   - **View**: Mobile ↔ Desktop frame.
   - **Signature**: blue `#037290` (default) / green `#1c6b45` / terracotta `#b5532e`.
     Click through all three — this is the core thing to evaluate.
   - **Optional**: toggle Video / Reviews / Stats off to confirm the page still reads
     complete when slots are empty.
3. **Scroll slowly.** Two motivated motions fire on scroll: the price counts up, and the
   area chart strokes in. Both are reduced-motion- and print-safe.

### ⚠️ Diagnosing gotcha — don't trust DOM-snapshot screenshots for two things
- **The area chart's stroked SVG line** renders in real browsers + print, but html-to-image
  capture tools render it blank. Verify with `eval_js`, not a screenshot:
  `document.getElementById('chartLine').getBBox().width` (~320) and
  `getComputedStyle(chartLine).stroke` (a resolved `rgb(...)`, not `var(...)`); after a
  scroll event `chartLine.style.strokeDashoffset === '0'`.
- **The agent-note headline/lead** shows a *false* overlap in capture during font-swap.
  Verify live geometry: `lead.getBoundingClientRect().top > headline.bottom` (≈ +14px gap).

Both were investigated and confirmed to be capture-tool artifacts, not page bugs. Keep this
in mind so you don't "fix" something that isn't broken.

---

## 2. Architecture — where everything lives

One file, `flagship_template.html`, ~722 lines, three zones:

| Lines (approx) | Zone | What |
|---|---|---|
| `<style>` header | **Color contract** | layout-owned neutrals → 3 signature ramps → reset |
| mid `<style>` | **Component CSS** | one block per section, in template order |
| bottom `<style>` | **Wide-frame enhance** | `@container (min-width:820px)` multi-column rules |
| `<body>` | **Markup** | review bar, then `.stage > .frame >` 9 sections in order |
| `<script>` | **Behavior** | switchers, reveal driver, price count-up, chart draw-on |

### The color contract (the heart of the system)
- **Layout-owned neutrals** (`:root`): `--paper`, `--paper-sunk`, `--ink`, `--ink-soft`,
  `--ink-faint`, `--dark-band`, `--dark-band-2`. Constant across every signature. Labelled.
- **7 derived roles**, defined three times — once per `[data-signature="…"]` block:
  `--signature`, `--signature-deep`, `--signature-link`, `--tint-12`, `--tint-6`,
  `--line-30`, `--on-signature`.
- **No brand hex appears anywhere in the layout below the header.** Every brand pixel reads
  a `--signature*` var. Swapping the `data-signature` attribute on `<body>` repaints the
  whole page. This is the contract engineering wires to the live ramp engine.

> Full element→role mapping is in **`TOKEN_MAP.md`** (one row per element). Design
> rationale, the contrast math, and the body-text recommendation are in
> **`DESIGN_README.md`**.

### Responsive model — important for diagnosis
Multi-column layouts are driven by **`@container` queries on `.frame`** (which is
`container-type: inline-size`), *not* by the Mobile/Desktop toggle or by `vw`. All fluid
type uses **`cqi`** (container-inline) units, so type scales to the frame, not the window.
This is deliberate: it's what makes "Desktop" degrade gracefully in a narrow window and
keeps captures deterministic. If you add layout, **keep using `@container` + `cqi`**, don't
reach for `vw`/media queries inside the frame.

### Motion driver
A single `check()` runs on scroll/load/resize and on `beforeprint`. It reveals anything in
view, runs the price count-up once, and draws the chart once. It deliberately replaced a
high-threshold IntersectionObserver because IO could strand the price/chart invisible on
fast scroll or deep landings. **Don't reintroduce a bare IO for these** — the scroll-check
is the robust version. `prefers-reduced-motion: reduce` short-circuits to end-states.

---

## 3. The section inventory (template order — do not reorder or add)

1. **Hero** — photo + solid dark scrim band (eyebrow, address, meta). On-photo text only
   ever sits on the solid scrim, never the photo.
2. **Recommended list price** — the count-up moment; `$687,298` in `--signature`.
3. **Agent note + walkthrough video** *(video optional)* — note copy + portrait video slot.
4. **Why this price (comps)** — giant count + comps list with prices in `--signature-deep`.
5. **Pitch points** — numbered "what I'll do for you" list on a `--tint-12` band.
6. **Reviews** *(optional)* — single pulled quote + "see all reviews" link.
7. **Area stats + chart** *(optional)* — 4 stat cards (`--tint-6`) + median-price chart.
8. **Dark agent band** — headshot, name, bio, contact grid, primary + ghost CTAs,
   reassurance line.
9. **Footer / disclaimer**.

**Truthful structure rule:** only design with content the template actually has. No invented
features, badges, agents, nav, or AI/automation claims. No FOMO/urgency. Sentence case.

---

## 4. Known issues, risks & open decisions (diagnose / decide next pass)

### Open product decisions (need Dallen's call — flagged in DESIGN_README §7)
1. **Body-text lock** — current recommendation is to make reading text **non-overridable
   `--ink`** (rationale: signatures pass *accent* contrast at 3:1 but body needs 4.5:1, so
   agent-chosen body color risks "warning-colored paragraphs"). Not yet signed off. If
   reversed, you'd expose a body-text role — but read the reasoning first.
2. **Tint-12 strength** — production blue tint `#cadfe8` is a confident sky tint on the
   full-section bands. Decision pending whether to keep or drop one notch quieter.
3. **Final copy** — walkthrough caption + reassurance line are placeholders.

### Engine / ramp watch-items
- **Terracotta link role:** on the warm paper, `#b5532e` as a *link/body* color only reaches
  ~4.33:1 and is clamped deeper to `#a8492a` in the file. Blue and green pass unclamped.
  If terracotta stays available, confirm the clamp is intended (it's the engine doing the
  right thing, not a hack). **Do not change the engine math here** — flag ramp limitations
  as engine requests, don't work around them in the layout.
- **On-signature as CTA fill:** the primary CTA on the dark band is an `--on-signature`
  (cream) pill with `--ink` label. Fine for any mid-dark signature; re-check the pill
  against `--dark-band` if the engine ever derives a very pale on-signature.

### Capture artifacts (NOT bugs — see §1)
- Chart line blank in snapshots; note headline false overlap in snapshots. Verify via
  `eval_js`/geometry, never "fix" from a screenshot alone.

---

## 5. The Mock states bar (strip on port)

The fixed bar at the top (`.reviewbar` + its `<script>` handlers) is **review chrome**, not
part of the template. It drives `data-vp` on `.stage`, `data-signature` on `<body>`, and
`.is-hidden` on `[data-opt-block]`. When porting into a real codebase, **remove it** — in
production, `data-signature` comes from the agent's saved brand kit and optional sections
are present/absent based on real content.

---

## 6. Suggested upgrade backlog for the next pass

Ordered roughly by leverage. Pick from these or bring your own — all are *treatment*
upgrades, none change IA.

1. **Stress-test more signatures.** Add 2–3 hostile signatures to the switcher (a very pale
   yellow, a near-black navy, a high-chroma magenta) and audit every zone. The system claims
   to sing for *any* signature; prove or break that, then report failures as engine requests.
2. **Tint-zone rhythm.** Evaluate whether tint-12 bands want to be one notch quieter
   (decision #2). Try `--tint-9`-ish intermediate and compare side-by-side.
3. **Chart richness.** The chart is intentionally minimal. Consider: a subtle "your home"
   marker against the trend, or a comps scatter — but only if it stays truthful to data the
   template has, and stays mobile-cheap.
4. **Hero treatment variants.** Explore 2–3 scrim/address compositions (e.g. address
   overlapping the photo edge, or a split hero) while keeping the on-scrim text rule.
5. **Desktop layout depth.** The wide-frame enhance is currently conservative. There's room
   for a more editorial desktop (e.g. the price as a full-bleed left rail, comps as a
   two-column ledger) — gate it all behind `@container`.
6. **Print/PDF pass.** A seller may save this. Audit the `beforeprint` end-states and add a
   dedicated print stylesheet (page breaks between major sections, hide the review bar).
7. **Port to the target framework.** If moving into React/Vue/etc., the cleanest mapping is:
   one component per section, the 7 roles as CSS custom properties on a wrapper, signature
   as a prop that sets `data-signature`. Keep the `@container`/`cqi` responsive model.

---

## 7. Files in this package

| File | What |
|---|---|
| `flagship_template.html` | The redesigned page — open this. Self-contained. |
| `TOKEN_MAP.md` | Every section/element → which of the 7 roles paints it. |
| `DESIGN_README.md` | Design rationale, `#037290` threshold math, body-text recommendation, deltas/risks/open questions. |
| `reference/current_template_screenshot.png` | The shipped template (section inventory + content source-of-truth). |
| `reference/brand_kit_screenshot.png` | The `/settings/brand` editing instrument — also the de-facto role contract (gave the production hexes for the blue ramp). |

> **Missing on purpose:** the brief's `ENGINEERING_CONTRACT.md` (the formal OKLCh ramp math)
> was never supplied as a separate file — the role mapping + production hexes were inferred
> from the brand-kit screenshot. If the real contract's math differs, reconcile the three
> `[data-signature]` ramps against it; the layout below the color header won't need to change.

---

## 8. Fidelity

**High-fidelity.** Final colors (via roles), typography, spacing, and interactions are all
intended as shown. The HTML here is a **design reference**, not production code to paste:
recreate it in the target codebase's environment (or pick the best framework if none exists),
preserving the color-contract architecture, the `@container`/`cqi` responsive model, and the
scroll-check motion driver described above.

### Type intent (engineering maps to self-hosted faces)
| Role | Prototype face | Intent |
|---|---|---|
| Display serif (headlines, address, prices, numerals, quote) | **Newsreader** (true italic) | warm screen-tuned transitional serif w/ real italic for emphasis words |
| Body/UI sans (leads, pitch body, contact values) | **Hanken Grotesk** | quiet humanist grotesque |
| Mono (eyebrows, labels, meta, comps, axis) | **IBM Plex Mono** | clean monospace for "spec sheet" labels |

Italic emphasis is a **type** device, never a color device — it never uses brand color.
