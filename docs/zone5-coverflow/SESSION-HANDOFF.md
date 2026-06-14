# Session Handoff — Zone 5 listings coverflow wired into CampaignSpread

**Build phase:** v1.5x · State A exposure section (Zone 5) · consumer wiring
**Status:** built, all checks green, **NOT merged.** Flag stays **OFF**.
**Branch:** `main` (working tree — branch + PR per your flow).

> Do NOT merge yet — pending Cowork verify (preview, all flex states, mobile,
> white numbers, byte-identical flag-off) + Dallen real-iPhone smoke.

---

## What shipped (the consumer render + payload plumbing + fixtures)

A restrained 3D listings coverflow flexes in **beneath the existing capability
cards** in `CampaignSpread`, reading from a new `recentListings` payload field,
behind a new sub-flag, byte-identical when off / no data.

### STEP 0 — spec corrections locked first
- **Per-card view numbers are WHITE** (`--white`), not teal. Teal is reserved for
  the center keyline + the single aggregate total. Updated `docs/zone5-coverflow/spec.md`
  + `prototype.html`.
- **Mobile parity** — portal-scale numbers + the hero size + plain "Views" carry
  to mobile; swept the prototype/spec of the stale `3,180 / Zillow views / 11,400`.
- **Tokens bound, not hard-coded** — `--teal-700` (`#06647D`) + `--offwhite`
  (`#F8F3E8`), so the section re-hues per agent like the proof panels. The
  handoff's stale `#037290 / #f1ebe0` are gone.

### Code
| File | Change |
|---|---|
| `src/lib/seller-presentation/listings-coverflow.ts` | **NEW** — `isSellerListingsCoverflowEnabled()` kill switch (`SELLER_LISTINGS_COVERFLOW_ENABLED`). |
| `output/public-payload.ts` | `PublicRecentListing` type + `RECENT_LISTINGS_CAP=5`; `recentListings` on `PublicPayload` (gated) + `BrandWhyUsInput` (wire-permissive `unknown`); `projectRecentListing`/`projectRecentListings` (field-by-field, view count → non-negative **integer**, capped, Street-View re-clamped); `listingsCoverflow` param on `toPublicPayload`, gated inside `stateAFields`; re-clamped in `clampStateAFields`. |
| `api/seller-presentation/publish/route.ts` | Passes `isSellerListingsCoverflowEnabled()` as the new arg. |
| `output/flagship/CampaignSpread.tsx` | `ListingsCoverflow` + `ListingCard` (position mapping, summed aggregate, photo = hosted URL → Street-View fallback, white hero number on the solid band). Capability cards/copy untouched. |
| `output/flagship/state-a-copy.ts` | `COVERFLOW_EYEBROW`, `COVERFLOW_VIEWS_LABEL`, `COVERFLOW_AGGREGATE_SUFFIX` (no em-dash). |
| `output/flagship/state-a.css` | Mobile-first peek-swipe base + desktop 3D fan (center +70z/0°, inner ±23°/.92/.82, outer ±36°/.82/.4, pair/single variants) + reduced-motion flat fallback. White number, teal keyline + aggregate. |
| `__fixtures__/sample-payload.ts` | `STATE_A_COVERFLOW_PAYLOAD` (5, mixed, sums 139,600), `_PAIR_` (2), `_SINGLE_` (1, aggregate hidden). Empty state = `STATE_A_FULL_PAYLOAD`. |
| `seller-presentation-preview/page.tsx` | Variants `state-a-coverflow` / `-pair` / `-single`. |

### Tests (all green)
- `publish-allowlist.spec.ts` — `recentListings` in `ALLOWED_TOP_LEVEL_KEYS` + **6 new** tests: field-by-field projection, integer/negative/fractional clamp, rogue-key drop, hard cap, **flag-off gated**, **revealed-status gated**, read-clamp re-run. (43 pass)
- `state-a-coverflow.spec.ts` — **NEW**, 10 tests: full fan, white-hero-number (light + larger than address), with/without mix, summed teal aggregate, center keyline, desktop bend vs **mobile peek** (perspective none + overflow-x auto), **reduced-motion flat**, pair, single (aggregate hidden), **byte-identical** (no listings → no `fs-sa-cf`, cards intact), State B clean.
- `truthful-copy.spec.ts` — registered both new phrases in the no-em-dash guard.

### Checks
`next build` ✅ · `eslint` (changed files) ✅ · `check-truthful-copy.sh` ✅ ·
no-em-dash ✅ · adjacent State A suites (state-a / zones-polish / campaign-status /
render = 50+12) ✅ · `tsc` clean for all changed `src/` files (pre-existing e2e
tsc errors in unrelated specs are not part of `next build`).

---

## How to verify on the preview
```
/seller-presentation-preview?fixture=state-a-coverflow          # full fan (5, mixed, aggregate 139,600)
/seller-presentation-preview?fixture=state-a-coverflow-pair     # 2-listing pair
/seller-presentation-preview?fixture=state-a-coverflow-single   # 1 listing, aggregate hidden
/seller-presentation-preview?fixture=state-a                    # EMPTY → capability cards only (byte-identical)
```
Narrow the window → mobile peek-swipe. OS reduce-motion → flat static row.

---

## One flagged deviation (not a silent substitution)
- **Entrance motion** reuses the page's existing `.reveal` fade+rise (calm,
  reduced-motion-safe) instead of the spec's bespoke per-card `settle` keyframe.
  Reason: a per-card keyframe fights the `data-pos` 3D transforms (the cards' end
  state IS the transform), risking a flicker. The reveal fade satisfies the
  "calm entrance, no autoplay" intent. Easy to add a track-level settle later if
  Dallen wants more; flagging rather than quietly dropping it.

## Not in this slice (deferred, per packet)
- **The agent-facing Settings "recent listings" INPUT UI** — next slice (reuses
  `ImageUploadField` + the Street-View fallback; may ride with the parked
  onboarding work). Until it ships there is **no real data source**, so the
  feature **cannot go live to agents** even with the flag on — the flag stays OFF.
  `BrandWhyUsInput.recentListings` is plumbed end-to-end and verified via fixtures.
- `sourceLabel` is plumbed in the payload but the render shows the source-agnostic
  "Views" label only (the one-label honesty decision); wired for the future input.

## Flag
`SELLER_LISTINGS_COVERFLOW_ENABLED` — OFF. Merges dark. Gates only the new block;
`SELLER_STATE_A_ENABLED` + every other section untouched.
