# Session Handoff — wire the State A polish batch into live components (v1.5x)

**Branch:** `v1.5x-state-a-polish-wire` (off `main`). **Not committed, not merged, not pushed** — working tree only, ready for Cowork preview + Dallen smoke.
**Source of truth built to:** [`docs/state-a-polish/spec.md`](./spec.md) + [`docs/state-a-polish/prototype.html`](./prototype.html) (4 approved rounds).

> ⚠️ **Live-on-merge:** Zone B (chart + two-stat), the 101.3% relocation, the reviews strip, and Zone C are State A elements NOT behind the coverflow flag. State A is live (`SELLER_STATE_A_ENABLED` on), so these ship on the next deploy when merged — verify at live stakes. Zone A coverflow few-card is behind `SELLER_LISTINGS_COVERFLOW_ENABLED` (OFF in prod) and stays dark until flipped; this work clears the blocker on flipping it.

---

## What shipped, per zone

### Zone A — coverflow few-card + motion (flag-gated; dark until flip)
- **`coverflowPositions`** ([CampaignSpread.tsx](../../src/tools/seller-presentation/output/flagship/CampaignSpread.tsx)): n=2 → `pair-left`/`pair-right` (separated **±54%**, no overlap/clip, **no keyline**); n=3 → trio (`in-left`/`center`/`in-right`, inner pair **±52%**); n=1 single (keyline); n≥4 the shipped fan. Count classes `sa-cf__fan--n1/--n2/--n3` drive the desktop transforms ([state-a.css](../../src/tools/seller-presentation/output/flagship/state-a.css)).
- **Entrance settle** (gated on the shared `.reveal.in`): cards ease in from behind+below, staggered peeks→inner→center, keyline fade-settles after the center lands; mobile = fade-up (swipe/snap unchanged) + lone-card centering.
- **Aggregate** is now the shared **proof-number lockup** (mono label · Newsreader teal number · mono caption) and **counts up once** (`data-countup-num`, wired in the motion island; SSR text is the true total so no-JS/reduced-motion shows it at rest).
- View counts are real agent data; the band holds 5–6 digits (`tabular-nums`) + long addresses without clipping (proven by the `state-a-coverflow-trio` fixture's "15117 Prescott Loop SE").

### Zone B — fuller chart + stacked two-stat proof column (LIVE on merge)
- The axis-less `Sparkline` → **`AreaTrendChart`** ([AppointmentBrief.tsx](../../src/tools/seller-presentation/output/flagship/AppointmentBrief.tsx)): §05 vocabulary — gridlines, a `$k` y-axis, month x-labels, a subtle **teal** area fill, current-point halo; keeps the `.sa-spark__line` draw-on + the "Up about X% this year." takeaway. New `.sa-chart__*` CSS mirrors the flagship `.chart` values, scoped to State A.
- Right column → **stacked two `ProofPanel`s**: market `+X%` over the relocated agent `101.3%`, both in the one shared treatment. Motion: line draws, area rises, halo single-pulse, the relocated stat reveals just after.

### 101.3% relocation (State-A-only; no payload/serializer change)
- `credibilityStat()` lifted to a shared helper [credibility-stat.ts](../../src/tools/seller-presentation/output/flagship/credibility-stat.ts), imported by `AppointmentBrief` (was a local fn in `StateAPage`). Reads the **same** `whyUs.performanceStats` field. State B untouched.

### Trust strip → reviews strip (LIVE on merge)
- 101.3% rail removed; section gains the header ("Sellers, in *their words*.") + a confident **reviews block** ([StateAPage.tsx](../../src/tools/seller-presentation/output/flagship/StateAPage.tsx)): sized-up `5.0` rating + stars + a clearly-clickable **teal pill** link-out ("See all of [Agent]'s reviews on Zillow →") using `reviewsOutlink` + `detectReviewsSource`. **Zillow text-only, no logo.** Clean 5.0 (matches flagship), no invented count. Flexes: quote-only / outlink-only / neither.

### Zone C — rebalanced pedestal + waveform (LIVE on merge)
- Player `min(100%,182px)` → **`min(100%,300px)`**, slab `520`→**`468px`**, tightened rhythm + mobile (`360`/`86%`). Player internals (#79 object-fit/poster/`:fullscreen`) untouched.
- Mint "Press play" pill → **teal audio waveform** ([StateAHello.tsx](../../src/tools/seller-presentation/output/flagship/StateAHello.tsx)): play glyph + 22 bars + runtime. **Always-on but calm** (`scaleY .72↔1`, `3.6s ease-in-out`); **static under reduced motion**. The **whole pill is one play target** — `data-wave-play` + `role=button` + Enter/Space, wired in the motion island to the same `<video>.play()` (no player rewrite).
- **Mint retired:** `--sa-mint` (true mint, used only by the now-gone cap dot) removed. The brand-derived `--mint` (blue-grey, hero cue dots) is a different token and is **left untouched** — confirmed via grep + an e2e mint-absence assertion.

### Shared motion island ([motion.ts](../../src/tools/seller-presentation/output/motion.ts))
- Added (additive, State-A-only selectors → State B no-op): aggregate count-up (`[data-countup-num]`), the optional mobile swipe cue (`.sa-cf__fan`, reduced-motion-skipped, **droppable in verification**), and the waveform play-target wiring (`[data-wave-play]`).

---

## Verification run (all green)
- `next build` ✓ · `tsc --noEmit` (src) ✓ clean · `eslint` — changed files clean (84 pre-existing errors live in untouched files, e.g. WizardPreview).
- `truthful-copy.spec` (incl. no-em-dash gate) ✓ 5/5.
- `state-a-zones-polish` ✓ · `state-a-coverflow` (incl. new trio + **pair no-overlap bbox** regression) ✓ · `state-a-render` ✓ · `state-a-video-padding` (State-B byte-identical guard) ✓ · `brand-colors` ✓ · `settings-recent-listings.projection` ✓.
- **State B / flag-off byte-identical:** `publish-allowlist` (coverflow flag-off → no `recentListings`) ✓ · `flagship` (revealed page) ✓ · zones-polish "no State-A primitives leak" ✓.
- New/updated fixtures: `state-a-coverflow-trio` (n=3); `state-a-trend-only` now clears BOTH proofs (it must, since the stat lives in that column now).

## Judgment calls / divergences (flagged for review)
1. **Chart source label omitted** — the prototype's "Neighborhood median · trailing 12 mo" caption was redundant with the adjacent proof label one column over; spec marked it optional. The `$k` y-axis + gridlines already signal "real data."
2. **Relocated stat label** uses the real derived `credibilityStat` text ("[Agent]'s average sale-to-list across recent listings"), not the prototype's illustrative uppercase shorthand. Truthful, data-derived; CSS uppercases it.
3. **Reduced-motion coverflow** keeps the **shipped flat-row** fallback (the prototype kept a static 3D layout). Lower-risk, already tested, still calm/legible — flag if you want the static-3D instead.
4. **`®` on "on Zillow"** rides the existing `REVIEW_SOURCE_LOGOS` flag exactly as the flagship does (default preview → "on Zillow", flag-on → "on Zillow®"); both text-only, no logo. Not baked unconditionally.
5. **Mobile swipe cue** is included but **droppable** — kill it in verification if it doesn't earn its place (one-line removal: drop the `cueObserver` block in motion.ts).

## Do NOT / stop-conditions — none tripped
- No public payload field added; no serializer change; State B + coverflow-flag-off byte-identical (guarded). Player internals (#79), the `valuationStatus` machine, and the coverflow data/flag/serializer logic were not touched (layout only).

## Next steps (Cowork + Dallen)
1. Preview-verify all states: coverflow 1/2/3/4+ (no overlap/clip; entrance + count-up), the chart + two-stat column (market vs agent labels), the reviews block (clickable, text-only Zillow), the waveform (always-on calm + plays on tap), reduced-motion static, State B + flag-off byte-identical.
2. Dallen real-iPhone smoke (waveform feel; pedestal proportion; reviews tap target).
3. **Do not merge** until verified. These chart/trust/video changes go LIVE on merge — quick prod check after deploy closes it. Then the coverflow few-card clears the last blocker on flipping `SELLER_LISTINGS_COVERFLOW_ENABLED`.
4. Changes are uncommitted on the branch — say the word and I'll commit (and push for a preview deploy).
