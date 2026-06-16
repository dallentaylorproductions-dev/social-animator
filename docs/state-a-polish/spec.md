# State A · polish batch — build spec (Zones A / B / C + Trust strip) — round 3

Build-ready spec. Hi-fi: [`prototype.html`](./prototype.html). Refinements within the
existing system, not redesigns. Tokens lifted verbatim from the shipped surfaces; bind
the brand tokens (`--teal-700` / `--teal-500`), never hard-code.

> **Scope guard (locked):** prototype only. Do NOT modify live components or wire anything
> until Cowork + Dallen review. The coverflow few-card fix gates flipping
> `SELLER_LISTINGS_COVERFLOW_ENABLED`.

## Locked picks (rounds 1–2)
- **Zone A** "gently dimensional", fan at 4+; n=1 single (keyline) · n=2 separated pair
  (±54%, no keyline) · n=3 trio · n≥4 shipped fan.
- **Zone B** "fuller" §05 chart vocabulary (gridlines + `$k` y-axis + month x-labels +
  area fill + halo).
- **Zone C** rebalanced pedestal (player 182→300px, slab 520→468px, tightened rhythm).
- **Motion** (round 2): a few earned entrance moments, CSS-first, reduced-motion-safe.

## Round-3 changes (this doc)
1. Coverflow view counts → real **Beacon scale (30–40k)**; aggregate ~146k; band re-checked
   for 5-digit + long address.
2. Optional **mobile swipe cue** (proposed; toggle to judge; drop if not clearly better).
3. Zone B stretched stat pill → **stacked two-stat proof column** (+5% neighborhood **and**
   the relocated 101.3% sale-to-list); chart area fill confirmed **teal**.
4. **Trust strip restructured:** 101.3% moves out → quote + **reviews link-out** ("See all
   of [Agent]'s reviews on Zillow®", text-only, no logo).
5. Zone C mint "Press play" pill → **teal audio-waveform** affordance. **Mint retired** on
   the page.
6. Holistic: **ONE proof-number language** — coverflow aggregate + both chart stats share
   the `ProofPanel` treatment.

---

## ⚑ Shared-component touches to scope for the build
- **101.3% sale-to-list relocation.** Today `credibilityStat()` (StateAPage.tsx) feeds a
  `ProofPanel variant="light"` as the `.sa-quote__rail` inside **`TrustStrip`**. It moves
  into **`AppointmentBrief`**'s `.sa-trend` column (the second stacked proof). Lift
  `credibilityStat()` to a shared State-A helper (or import it) so both the move and the
  flex-out logic travel with it. Both are State-A-only components → **State B stays
  byte-identical.**
- **Trust strip becomes a confident reviews block (round 4).** Today State A only shows the
  source as a text note on the attribution (`.sa-quote__src` "on Zillow®"). The proposed
  block (rating proof number + filled-pill link-out) reuses the full-presentation
  **`Reviews.tsx`** outlink: `payload.reviewsOutlink` + `detectReviewsSource(url)`. The
  rating (`5.0`) should come from real review data, not be invented; **no fabricated count**.
  Compliance: **Zillow = text-only "on Zillow®", NO logo** (Google gets its "G"; Zillow must
  not — a logo is a separate explicit call, do not bake in). `reviewsOutlink` is already read
  by `TrustStrip`, so no new payload plumbing — but the **`Reviews` link row markup is a
  shared pattern**; factor the shared bits rather than fork.
- **Zone C waveform play target (round 4).** The waveform pill must fire the SAME `play()`
  the center control does (one extra bound target on the existing `<video>` — `StateAHello`).
  No player rewrite; the internal fitment/poster/fullscreen rules stay verbatim. Keyboard:
  `role="button"`, `tabindex=0`, Enter/Space.
- **Mint retirement.** The Z1 caption dot was mint's one earned use. With the waveform
  (teal), **mint is no longer rendered anywhere on the page.** Keep the `--sa-mint` token
  defined (system) but unused. Flag for sign-off: this retires the "one earned mint moment"
  rule entirely.
- **No new perpetual motion** beyond the (leashed, hover/tap-default) waveform.

---

## Shared proof-number language (the ONE treatment)
The `ProofPanel` primitive (cream fill + 2px `--teal-700` left keyline + mono label +
Newsreader number + optional caption). Now used by **all** page numbers:

| Surface | Label | Number | Caption |
|---|---|---|---|
| Coverflow aggregate | `ACROSS RECENT LISTINGS` | `145,940` (tabular, counts up) | `BUYER VIEWS` |
| Chart stat 1 (market) | `NEIGHBORHOOD · TRAILING 12 MO` | `+5%` | `VS. LAST YEAR` |
| Chart stat 2 (agent) | `MARISOL'S AVG SALE-TO-LIST · RECENT LISTINGS` | `101.3%` | `AGENT TRACK RECORD` |

Values: label `--f-mono 11px / .18em / uppercase / --t-mute`; number `--f-display 500 /
clamp(34–54px) / --teal-700 / tabular`; caption `--f-mono 10px / --t-soft`.
The aggregate sits centered beneath the fan (no left keyline — it's a centered lockup, not
a rail); its number is sized a touch smaller (`clamp(26px,5cqi,40px)`) for the placement.
**Same family/color/weight/tabular = reads as one system.**

---

## ZONE A — coverflow (round-3 values)
- **View counts:** `32,246 / 37,610 / 41,184 / 34,900` (5th listing intentionally
  view-less → photo+address only, honesty gate). **Aggregate = 145,940**, shown when ≥2
  cards carry a number.
- **Band re-check:** the hero number scales to `clamp(28px,8.4cqi,36px)` (desktop 38px),
  `font-variant-numeric: tabular-nums` so 5–6 digits sit cleanly; the long
  "15117 Prescott Loop SE" fits the 288/296px band at center/inner sizes; peeks carry no
  band (no clip risk). Layout transforms unchanged from round 2.
- **Aggregate** → the proof-number lockup above (was a serif sentence). Still counts up
  once on `.cf` reveal.

### Mobile swipe cue (PROPOSED — optional; drop if not clearly better)
One-time scroll nudge as the carousel settles: `fan.scrollTo({left:32,behavior:'smooth'})`
then back to `0` after ~520ms, fired ~700ms after the entrance. Only when scrollable
(`scrollWidth - clientWidth ≥ 24`, i.e. 2+ cards). **Interaction otherwise unchanged.**
| Trigger | Behavior | Reduced motion |
|---|---|---|
| Carousel `.in` (mobile, 2+ cards) | nudge +32px → 0, once | **skipped** (no nudge) |
Prototype: toggle **Mobile swipe cue** to compare on/off. If kept, build it as a tiny
one-shot in the motion driver (CSS can't drive scroll position); it's the only scroll-JS.

---

## ZONE B — stacked two-stat proof column (round-3 values)
Right column (`1fr`) becomes a flex column of **two `ProofPanel`s**, each `flex:1`
(fills the column, no dead space):
```
.sa-trend__proofs { display:flex; flex-direction:column; gap:14px; }
.sa-trend__proofs > .sa-proof { flex:1; justify-content:center; }
```
- Stat 1 = `+5%`, label `NEIGHBORHOOD · TRAILING 12 MO`, caption `VS. LAST YEAR`
  (`PROOF_NEIGHBORHOOD_LABEL` / `_CAPTION`).
- Stat 2 = `101.3%` (relocated), label `MARISOL'S AVG SALE-TO-LIST · RECENT LISTINGS`
  (from `credibilityStat()`), caption `AGENT TRACK RECORD`.
- **Area fill** = `--teal-700 @ opacity .08` (subtle teal, not grey) — confirmed.
- Mobile: the 2.4fr/1fr grid already stacks to one column; the two proofs then sit beneath
  the chart in order (keyline left border → top border on stack, per the shipped phone rule).

---

## TRUST STRIP — quote + confident reviews block  (round-4 elevation)
- **Out:** the 101.3% `.sa-quote__rail` (relocated to Zone B).
- **In:** a reviews block that **balances** the quote (no longer a faint caption cluster).
  A tinted inset rail (`--sa-proof-inset` + 2px `--teal-700` left keyline, `border-radius:18px`,
  `padding: clamp(22px,3cqi,32px)`, `flex:0 1 290px`, `align-self:stretch`):
  - **Rating as a confident proof number** — `★★★★★` (`--teal-700`, 19px, `.letterspacing 4px`)
    + **`5.0`** in Newsreader `clamp(40px,6cqi,56px) / 500 / --t-ink` + a mono sub
    `AVERAGE RATING ON ZILLOW®`. (Real rating, **no invented count**.)
  - **Link-out as an obvious button** — "See all of {first}'s reviews →" as a filled teal
    pill: `--white` text on `--teal-700`, `--f-mono 11px/500/uppercase`, `padding:12px 18px`,
    `border-radius:999px`, arrow nudges + darkens on hover, `:active` press. Reads "clickable"
    at a glance — not caption text.
  - Reuse `Reviews.tsx`'s outlink (`payload.reviewsOutlink` + `detectReviewsSource`).
- **Zillow = TEXT ONLY, no logo** (trademark guidelines: logos need express written approval;
  permitted use is text + ®). The "on Zillow®" lives in the rating sub-line. Google would get
  its "G" asset; **Zillow must not.** A logo is a separate explicit call — do not bake in.
- **Quote keeps presence:** header "Sellers, in *their words*." + `flex:1 1 360px`, Newsreader
  `clamp(22–32px)`, teal quote marks + stars. On mobile (≤560px) the reviews rail wraps full
  width and its keyline moves left→top. Reads as its own intentional section.
- Flex-out preserved: quote-only → block drops; block-only → quote drops.

---

## ZONE C — audio-waveform affordance (round-4 FINAL)
Replaces `.sa-hello__cap` (mint dot + "PRESS PLAY · {runtime}") with a teal waveform on the
solid pedestal surface (never over the video). Order/proportions (round-2) unchanged.
```
.ped__wave      inline-flex pill; border var(--line-pap); bg color-mix(--t-pap 5%);
                cursor:pointer; hover brightens bg + teal-tints border; :focus-visible outline
.ped__wave-play left-pointing triangle, border-left:10px solid var(--teal-500)
.ped__wave-bars 22 bars, 3px wide, gap 2.5px, height 18px; each height var(--h)%
                (envelope 32–90), background var(--teal-500); transform-origin center
.ped__wave-rt   mono runtime "0:31", --t-pap-mute  (keep — it helps)
```
**Motion — ALWAYS-ON, calm (Dallen's call; approved exception to "no perpetual motion"):**
- Desktop **and** mobile — no hover-gating (hover doesn't exist on mobile and was inconsistent).
- Deliberately calmer than round 3: **`wavePulse scaleY(.72 ↔ 1)`** (low amplitude),
  **`3.6s`** period, **`ease-in-out`** (sinusoidal), stagger `calc(var(--i) * -.14s)`.
  Ambient sway, not an equalizer. If it ever reads busy, slow further / lower amplitude.

| State | Animation | Reduced motion |
|---|---|---|
| Default (desktop + mobile) | `wavePulse scaleY(.72↔1)`, `3.6s ease-in-out`, staggered `-.14s` | **static** (`animation:none`, bars rest at `--h`) |

**Play target — the whole pill plays the video:** `.ped__wave` (play glyph + waveform +
runtime) is one click/tap/keyboard target that fires the SAME `play()` as the center
control. `role="button"`, `tabindex=0`, Enter/Space activate. This removes the "is this
clickable / will it play?" confusion next to the player. Even under reduced motion (static
waveform) it stays a valid play target. (Prototype shows a "playing" state — center button
fades, poster dims, runtime → "Playing"; the build wires it to the real player.)
- **Teal, no mint.** `--teal-500` on the dark pedestal (brand-bound, re-hues per agent).
  **Mint stays retired.**
- Buildability: pure CSS keyframes (always-on) + static inline `--h`/`--i`; the play wiring is
  the existing player `play()` bound to one extra target — **no new lib, no SVG.**

---

# MOTION SPEC (cumulative; round-3 additions marked ★)

Reuse the shipped `PresentationPageMotion` `.reveal.in` driver; it adds `.in` immediately
under reduced motion / no-JS, so the 3D coverflow finals (gated on `.in`) land statically.

| # | Moment | Trigger | Property → from → to | Duration · delay · easing | Reduced motion |
|---|---|---|---|---|---|
| A1 | Coverflow card settle (desktop) | `.cf` `.in` | per-position transform + opacity from `translateY(42) translateZ(-140) scale(.9)`/`0` | `.6s` · stagger peeks `0`/inner `.10`/center `.18–.20s` · `--ease` | final, no transition |
| A2 | Keyline settle | `.in` | `::after` `opacity 0→1`, `scale 1.04→1` | `.5s` · `.42s` · `--ease` | final |
| A3 | Aggregate count-up | `.in` | text `0→145,940` (rAF, easeOutCubic) | `~1.1s` | final number |
| A4 | Coverflow settle (mobile) | `.cf` `.in` | cards `opacity 0/translateY(26)`→`1/none`, sequential | `.5s` · nth `.04–.28s` | final. Swipe unchanged |
| ★A5 | **Mobile swipe cue** | `.cf` `.in` (2+ cards) | scroll `+32px → 0` | nudge after `.7s`, return `.52s` later | **skipped** |
| B1 | Chart line draw | `.trend` `.in` | `stroke-dashoffset var(--len)→0` | `1.4s` · `.15s` · `--ease` | drawn |
| B2 | Area fill rise | `.in` | `scaleY 0→1` + `opacity 0→.08` (teal) | `.8s` · `.35s` | final |
| B3 | Halo pulse (single) | `.in` | `scale .4→1.14→1`, `opacity 0→.24→.16` (1×) | `.9s` · `1.15s` | final |
| B4 | Grid / axis / labels / dots | `.in` | `opacity 0→1` | `.5s` · `.05s` | final |
| B5 | Takeaway + stat 1 reveal | `.in` | `opacity 0→1`, `translateY(8)→0` | takeaway `.6s`·`1.0s`; num `.5s`·`.25s` | final |
| ★B6 | **Relocated 101.3% reveal** | `.in` | same as B5 num, staggered after stat 1 | `.5s` · `.5s` | final |
| ★T1 | **Trust panel arrival** | `.sa-quote__panel` `.in` | `opacity 0→1`, `translateY(14)→0` | `.6s` · `0` | final |
| C1 | Pedestal arrival | `.pedestal` `.in` | `opacity 0→1`, `translateY(14) scale(.985)→none` | `.7s` · `0` | final |
| C2 | Play-button pulse (single) | `.in` | paper-white ring `0→15px→0` (1×) | `1.25s` · `.55s` | none |
| ★C3 | **Waveform (always-on, calm)** | page (no trigger) | `wavePulse scaleY(.72↔1)` staggered `-.14s` | `3.6s ease-in-out` loop | **static** |
| C4 | Play hover lift (desktop) | `:hover` | video `translateY(-3px)`, glyph `scale(1.08)` | `.3–.4s` | harmless |

Notes: **no mint in motion**; C2 ring is paper-white. One earned entrance per section;
B3/C2 are single-iteration. Count-up (A3) + swipe cue (A5) are the only JS beyond the
observer — small, no lib.

## CSS-buildability flags
- All motion pure CSS + SVG `stroke-dashoffset` + `transform-box: fill-box`. No lib.
- Non-CSS: A3 count-up (rAF, already an app pattern) and ★A5 swipe nudge (CSS can't drive
  scroll position) — both reduced-motion-gated.
- The flagged design choices: (1) keyline "draw" = CSS border fade-settle, not a literal
  stroke (would need an inset SVG rect); (2) waveform is **always-on** (Dallen-approved
  exception to "no perpetual motion"; static under reduced motion); (3) mint fully retired —
  needs sign-off.

## Deliverables in this folder
- `prototype.html` — hi-fi + motion, desktop + mobile, current→proposed, all round-3 work.
- `spec.md` — this file.
