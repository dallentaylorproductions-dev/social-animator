# GreatSchools Integration SPIKE — Findings & GO/NO-GO

**Branch:** `spike/greatschools` · **Flag:** `GREATSCHOOLS_ENABLED` (OFF) · **Date:** 2026-07-01
**Scope:** discovery + thin server-only proof. No consumer UI, no wiring into `/tour/[slug]`, `BuyerTourPage`, the serializer, the `BUYER_TOUR_BRIEF` flag, or the proximity logic.

---

## Verdict: **GO** (live shape CONFIRMED; two design adjustments owned Cowork-side)

The GreatSchools **School Quality** dependency is viable for the V1 school section: the plan returns the rating **bands**, the fetch-only / no-store posture is implementable and is proven green, and the cost fits the budget at 1:1 tour-page volume. No **stop condition** is triggered as a hard blocker. Two terms touch the LOCKED mock 2d and require a design adjustment (badge image + separated section) — those are **design decisions Dallen/Cowork are handling**, not spike blockers.

**Live shape CONFIRMED (2026-07-01)** with real calls on a deployed preview (Austin, TX + San Francisco, CA). The confirmation caught **four things** the packet's assumptions got wrong, all now fixed in the module:
1. **Endpoint needs the `/v2/` prefix:** `https://gs-api.greatschools.org/v2/nearby-schools`. The un-prefixed path returns an API-Gateway `403 {"message":"Forbidden"}`. Auth = **`X-API-Key` header** (not a query param).
2. **Rating-band key is `rating_band` (UNDERSCORE),** not `rating-band`.
3. **Unrated schools return the literal STRING `"null"`** in `rating_band` (not JSON null, not an absent key). Naively surfaced, the word "null" would render as a rating band. The module now maps the `"null"` sentinel (case-insensitive) → real `null`. **This is the #1 correctness gotcha for the build.**
4. **Live band casing is sentence-case** — `"Above average"` / `"Average"` / `"Below average"` — NOT the title-case "Above Average" the attribution PDF lists (see Part A #4). The module passes the API string through **verbatim**; the band→icon mapping in the build MUST be case-insensitive.

Two **product findings** from the live data (Part A #8): near a dense downtown, the closest results are mostly **private / unrated** schools (rated public schools sit further out), and this endpoint returns schools by **proximity, not attendance-zone assignment** — "nearby schools," not "your zoned schools." Both are build-layer filtering/framing decisions, not blockers.

---

## Part A — the dependency questions

### 1. Exact plan needed
**School Quality** ($97.50/mo base) is the plan that returns the rating **bands** ("Below Average / Average / Above Average", relative to state). School Essentials does **not** include ratings. The 1–10 numeric GreatSchools rating is **Enterprise-only** and is *not* on this plan — the product uses bands only, which matches the mock's intent. **No lower plan suffices** if we want any rating signal. *Source: order form + plan matrix, captured 2026-07-01.*

### 2. Response fields (per school) — CONFIRMED LIVE
**Endpoint:** `GET https://gs-api.greatschools.org/v2/nearby-schools?lat=&lon=&limit=` · **Auth:** `X-API-Key: <key>` header.
**Envelope:** `{ schools: [...], cur_page, items_per_page, max_page_num, total_count, links }` (paginated, 25/page default).

**Exact per-school keys returned (verbatim, confirmed):** `universal-id`, `nces-id`, `state-id`, `name`, `school-summary`, `type`, `level-codes`, `level`, `street`, `city`, `state`, `fipscounty`, `zip`, `phone`, `fax`, `county`, `lat`, `lon`, `district-name`, `district-id`, `web-site`, `overview-url`, `rating_band`, `distance`.

| Source key (confirmed) | Normalized field | Notes |
|---|---|---|
| `name` | `name` | required; record dropped if absent |
| `level-codes` | `level` | school-level indicator: `"e"`/`"m"`/`"h"`/`"p"` (+ combos like `"p,e,m"`). **Build maps** e→Elementary, m→Middle, h→High, p→Preschool |
| `level` | `gradeRange` | served-grades LIST, e.g. `"KG,1,2,3,4,5"` / `"9,10,11,12"`. **There is NO `grade-range` field**; build formats the list into a range |
| `district-name` | `district` | populated for public schools; `null` for most private |
| `rating_band` | `ratingBand` | **verbatim** band string, or `null`. Literal `"null"` string ⇒ normalized `null` |
| `overview-url` | `profileUrl` | the school's GS profile page (attribution link target) |
| `distance` | `distanceMi` | miles from the home, float (API-computed) |

**Real normalized samples (live, San Francisco):**
- `{ name: "Mission Montessori", level: "e", gradeRange: "KG,1,2,3,4", district: null, ratingBand: null, profileUrl: ".../33551-Mission-Montessori/", distanceMi: 0.138 }` (private, unrated → band correctly `null`)
- `{ name: "Muir (John) Elementary School", level: "e", gradeRange: "KG,1,2,3,4,5", district: "San Francisco Unified School District", ratingBand: "Average", profileUrl: ".../6414-.../", distanceMi: 0.520 }` (public, rated → verbatim band)

**Deliberately NOT surfaced** (not needed; every surfaced field is a live-render liability under no-store): `universal-id`, `nces-id`, `state-id`, `type`, `school-summary` (a GS-authored blurb — Studio never interprets), `street`/`city`/`state`/`zip`/`county`/`fipscounty`, `phone`/`fax`, `lat`/`lon`, `district-id`, `web-site`.

> A real response is **NOT committed** (a committed copy violates ToS 3.2.2). The repo's fixture is **synthetic** (fabricated values in the confirmed shape): [greatschools-synthetic.ts](../src/lib/buyer-tour-brief/__fixtures__/greatschools-synthetic.ts). The live confirmation was captured via a throwaway, preview-only, uncommitted smoke route (now removed).

### 3. Attribution required (VERBATIM — the build packet MUST enforce all of these)
From "GreatSchools Attribution Requirements, Last Updated December 2024" (`Building Tools/greatschools-attribution/`). Every one of these applies to the public `/tour/[slug]` school section:

1. **Copyright/attribution notice on every page showing GS data:** approved wording — **"School data provided by GreatSchools.org © [year]. All rights reserved."** — with a hyperlink to `https://www.greatschools.org`, the © symbol + current year.
2. **GreatSchools logo displayed + linked** to `https://www.greatschools.org`. Min **95px wide desktop / 85px mobile**, 15px clear space, no stretch/skew, transparent-bg version on any non-white panel. Asset: `GreatSchools Logos/GreatSchools-logo-*.svg|png`.
3. **Every school NAME is a text link** to that school's GS Profile page; anchor text = the school name (or "More information on [school name]"). **No "click here."**
4. **Rating shown via GreatSchools' band ICON image** (not our own text pill). Min **97×95px**, not stretched/modified. Each band icon **links to the school profile**; alt text "[school name] GreatSchools School Rating Band". Asset: `School Summary Rating Band Icons (svg)/rating-band-{above-average,average,below-average,not-available}.svg`.
5. **Exact band language:** "Above Average" / "Average" / "Below Average" (+ N/A). No paraphrase, abbreviation, or manipulation. *(Proven by the passthrough test.)*
6. **All GreatSchools links carry `rel="nofollow"`.**
7. **Explanatory "what is this rating" text/link** (from the GS Data Content) accessible from any page showing ratings.

**"Consumers access free, no login":** our public `/tour/[slug]` is a public, no-login page → **satisfied**. Confirm the eventual page keeps the school section reachable without auth.

### 4. Rating band labels — DISCREPANCY confirmed (flagged)
- The **attribution PDF** (rule #5) lists the exact language as **"Above Average" / "Average" / "Below Average"** (title case).
- The **live API** returns **sentence case**: `"Above average"` / `"Average"` / `"Below average"`.

The module passes the **API's exact string through unchanged** (verbatim is the ToS-safe choice), and returns `null` when there is no band. Because V1 renders the rating as the GS **badge image** (not text — finding (a)), the casing only affects (i) the badge's **alt text** and (ii) the **band→icon mapping**, which the build MUST do **case-insensitively**. A test fails if the code ever re-cases ("Above Average"), abbreviates ("Above avg"), or paraphrases. **Recommendation for the build packet:** map `ratingBand.toLowerCase()` → one of the 4 SVGs; use the verbatim API string for alt text.

### 5. Caching — RESOLVED: no caching, no storing, no derivatives (ToS 3.2.2 / 3.2.8; destroy-on-termination 8.6)
This is an **architecture constraint**, not a preference. The module **imports no `@vercel/kv`, holds no cache, and has no write path** (asserted by the source-contract test). School data is **live-fetched server-side at render** and used for that render only.

**Per-view cost/latency of live-fetch-at-render:** one NearbySchools call **per home, per page view**.
- **Latency:** ~200–500ms per call; homes on a tour fetch **in parallel**, so the added page latency is ≈ one call (~300–500ms). Recommend a Suspense boundary so the rest of the page paints first and the school block streams in.
- **Per-request in-memory dedupe** (within a single render only — if the same coordinate appears twice) is **acceptable** and is *not* a stored cache: it never outlives the render, writes nothing. Recommend it as the only "optimization."

### 6. Cost — fits budget
- **Model:** $97.50/mo base, **15,000 calls/mo included**, overage **$0.006/call** up to a **300,000/mo cap**. 14-day free trial (trial calls don't count toward month 1).
- **(a) Low 1:1 usage:** a tour has ~3–5 homes; a 1:1 link is viewed maybe 5–30 times. `4 homes × 20 views = 80 calls/tour`. **50 tours/mo ≈ 4,000 calls** → inside the base. **Cost ≈ $97.50/mo.**
- **(b) Team usage:** to exceed 15,000 calls needs ≈ **3,750 page-views/mo** (at 4 homes/view) across all tours. At 50,000 calls: `35,000 × $0.006 + $97.50 ≈ $307/mo` — inside the **$300–600 ideal**.
- **Ceiling risk:** the **$1,000 ceiling** is only threatened by extreme viral volume (~150k+ calls/mo ≈ 37,500 views), which is not the 1:1 product shape. **Mitigation:** monitor with the **free "Current Usage" endpoint**; the 300,000/mo **hard cap** bounds worst-case spend. **Verdict: fits budget.**

### 7. No-rating state — CONFIRMED (the `"null"` string sentinel)
Live, an unrated school returns `rating_band` = the **literal string `"null"`** (confirmed on every private/unrated school in both test cities). The normalizer maps that sentinel (case-insensitive) + blank/absent → **`ratingBand: null`**, never a fabricated band and **never the word "null"**. The build renders the **`rating-band-not-available` icon** + honest "no rating" copy. *(Proven: `"null"`-sentinel test, case-variant test, whitespace-band test.)*

### 8. Partial data across homes — CONFIRMED, plus two product findings
"Consistency" = **same LOGIC per home**, not same count. Each home independently returns its `NormalizedSchool[]` (possibly empty); a home with zero renders no block. *(Proven: partial/empty/malformed tests.)* Two things the live data makes concrete for the build packet:
- **Nearest ≠ rated.** In dense areas the closest results are mostly **private/unrated** (band `null`); rated **public** schools sit further out. Raw nearest-25 is noisy. **Build decision:** filter — e.g. nearest **rated** school per level (e/m/h), or public-only, or "nearest N with a band." The module returns the full closest-first list and leaves the filtering policy to the build.
- **Proximity, not assignment.** This endpoint returns schools **near** a coordinate, NOT the home's **attendance-zone/assigned** schools. Copy must say "**nearby** schools," not "your zoned schools," or it overpromises. (GreatSchools does not expose assignment on this plan.)

### 9. Serializer / storage (REVISED for the no-store term)
**No GreatSchools fields enter the stored public payload or the serializer allow-list.** Confirmed by reading [public-payload.ts](../src/tools/buyer-tour-brief/output/public-payload.ts): it is an **explicit field-by-field projection** (`toBuyerTourPublicPayload` → `proj*` helpers, never a spread), so a GS field *cannot* be projected unless someone adds it to the draft type — which the V1 build packet must **not** do.

- **Only new STORED field for V1:** the agent's boolean **school-layer toggle** (on/off). Home **coordinates** are Google-sourced and already stored/allowed.
- **At render:** the `/tour/[slug]` server component (already server-side from the clamped payload) calls `nearbySchools(coords)` **LIVE** for each home when the toggle is on, and renders the school section per request. The GS data exists only for that render. This **fits the existing page architecture** — the school block is a live server fetch layered on top of the clamped payload, not a payload field.

**Serializer allow-list to use in the V1 build packet:** unchanged from today **plus** one boolean (`schoolLayer` on/off). **Zero GS fields.**

### 10. Tests (all green — 17/17)
[greatschools.unit.spec.ts](../tests-unit/greatschools.unit.spec.ts):
- ✅ response-shape normalization to the typed fields
- ✅ **exact rating-band passthrough** (fails on any paraphrase/abbreviation)
- ✅ verbatim passthrough of the source string
- ✅ no-rating → `ratingBand: null`; whitespace band → `null`
- ✅ partial records (present fields kept, rest null)
- ✅ empty response → `[]`; malformed/junk → `[]` (never throws)
- ✅ **sourced-fields-only allow-list** (exact key set; no Studio-authored keys)
- ✅ key-missing → `{ ok:false, code:"key-missing" }`; network failure & non-OK HTTP → `unavailable`; valid-but-empty → `unavailable`
- ✅ success path normalizes; **key travels in the `X-API-Key` header, never in the URL** (no key leak in logs)
- ✅ `hasGreatSchoolsKey()` reflects env presence
- ✅ **no-persistence source contract** — the module has no `@vercel/kv`, no cache/store `.set(`, no `localStorage`/`sessionStorage`/`writeFile`/`fs`

---

## Two findings that touch the LOCKED mock 2d (design, owned Cowork-side)
Per Dallen's kickoff, these are **design decisions handled on the Cowork side**, surfaced here only because the terms drive them:

- **(a) Rating = branded 97×95px BADGE image, not a quiet text chip.** Mock 2d shows a calm "Above Average" text line; the terms **require** the GS ribbon badge image ≥97×95px per school. The school section is visually **heavier/louder** than 2d assumes and must be redesigned around real GS badges. *(The module still just returns the band string; the badge selection happens in the build layer.)*
- **(b) Logo/badge adjacency.** GS terms forbid placing the GS logo/rating images "alongside any other logo … without expressed written permission." Our page carries the **agent's brand**. → the school section must be a **visually distinct, separated block** (not adjacent to any agent logo), OR email `dataproducts@greatschools.org` for written permission. Recommendation: **separated block** (no permission dependency).

---

## Stop conditions — none triggered
- ❌ Terms forbid the mock's rating display → **No.** They require a *heavier* display (badge), a design adjustment, not a block.
- ❌ Require consumer login → **No.** Public `/tour/[slug]` satisfies free/no-login.
- ❌ Attribution we can't meet on a public page → **No.** All 7 requirements are enforceable (logo, notice, nofollow links, band icons, exact language).
- ❌ Caching disallowed AND per-call cost out of budget → **No.** No-cache confirmed; cost fits at expected volume.
- ❌ Band-returning plan materially more expensive than expected → **No.** $97.50/mo base as budgeted.

---

## Session Handoff — for the V1 school-section build packet
- **GO / NO-GO:** **GO**, pending the one live-shape confirmation call (below). Plan = **School Quality**; attribution = the 7 verbatim rules in Part A #3; caching = **none (live-fetch at render)**; cost = **≈$97.50/mo at 1:1, well within budget**.
- **Serializer allow-list:** today's payload **+ one boolean toggle** (`schoolLayer`). **No GS fields stored, ever.**
- **Module (green, unwired):** [greatschools.ts](../src/lib/buyer-tour-brief/greatschools.ts) — render-time entry `nearbySchools(home, deps)`; pure normalizer `parseNearbySchools(raw)`; `hasGreatSchoolsKey()`. Key from `GREATSCHOOLS_API_KEY` (server-only). Graceful on key-missing/failure.
- **Synthetic fixture (not a real response):** [greatschools-synthetic.ts](../src/lib/buyer-tour-brief/__fixtures__/greatschools-synthetic.ts).
- **Flag:** [isGreatSchoolsEnabled()](../src/lib/config/greatschools.ts) — OFF; flag-OFF is byte-identical (only new files added).
- **Assets for the build step:** copy the GS logo + the 4 band SVGs (`above-average`, `average`, `below-average`, `not-available`) from `Building Tools/greatschools-attribution/` into `public/greatschools/`.
- **Design adjustments (Cowork):** (a) badge image ≥97×95px replaces the text chip; (b) separated school block for logo-adjacency compliance.

### Live confirmation — DONE (2026-07-01)
Confirmed with real calls on a deployed preview (Austin + San Francisco) via a throwaway, preview-only, token-guarded, **uncommitted** smoke route (since removed — no real GS data persisted anywhere). Findings folded in above:
- Endpoint `…/v2/nearby-schools` + `X-API-Key` header (the `/v2/` and header were corrected in the module).
- `rating_band` underscore key; `"null"` string = unrated → normalized `null`.
- Sentence-case bands; `level-codes` + `level` (grade list); no `grade-range` field.
- Private/unrated noise + proximity-not-assignment → build-layer filtering/framing.

**Confirmed key value now works end-to-end:** the corrected `parseNearbySchools` produced clean normalized output on live data (unrated → `null`, rated → verbatim band, level/grade populated). No open live items remain for the spike.
