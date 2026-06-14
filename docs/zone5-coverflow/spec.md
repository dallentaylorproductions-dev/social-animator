# State A · Zone 5 — Listings Coverflow — build spec

Build-ready elaboration of the approved coverflow concept ("Put in front of buyers"),
sitting beneath the existing capability cards in `CampaignSpread`. Hi-fi:
[`prototype.html`](./prototype.html). Restrained 3D coverflow of the agent's recent
listings = literal proof of reach. **The view count is the hero of each card.** Mint is
reserved (Z1 dot); teal is the one earned accent.

> **Resolved (was flagged in v1):**
> - **Tokens — shipped values win.** Bind the brand tokens, never hard-code: teal keyline =
>   `--teal-700` light (`#06647D`) / `--teal-500` dark; section bg = `--offwhite` (`#F8F3E8`,
>   the shipped `z-offwhite`). The handoff's `#037290` / `#f1ebe0` were stale — do not use them.
>   The keyline + view number re-hue per agent exactly like the proof panels.
> - **Source:** `Building Tools/v1.5x-…-direction.md` is not in this repo; spec built from the handoff.

> **Copy — use SHIPPED constants verbatim** (the handoff's recalled labels were also stale):
> - Capability frames: `CAPABILITY_PHOTO_LABEL` "Photography that sells" / `_SUB` "How I shoot every
>   listing"; `CAPABILITY_VIDEO_LABEL` "A recent video tour" / `_SUB` "From a recent listing of mine".
>   3rd+ frames are agent-authored marketing items (`whyUs.marketingApproach`, up to 3) — not fixed.
> - Reach line: shipped `EXPOSURE_LINE` verbatim (no em-dash) —
>   "Your home in front of buyers wherever they are already looking: the major search sites, my own
>   buyer list, and the feeds they scroll." The invented reach line was removed.

---

## 1. Colors (role → hex)

| Role | Token (bind, don't hard-code) | Resolved hex |
|---|---|---|
| Section background | `--offwhite` (`z-offwhite`) | `#F8F3E8` |
| Card surface (no photo) | `--sa-proof-cream` | `#fbf8f2` |
| Inset fill | `--sa-proof-inset` | `#f4eee3` |
| **Card base dark band** | `--sa-proof-dark` | `#12171a` |
| **Teal keyline + view number (light)** | `--teal-700` | `#06647D` |
| Teal on dark band | `--teal-500` | `color-mix(in oklab, var(--teal-700), #fff 24%)` |
| Ink / headline | `--t-ink` | `#1B2A2E` |
| Body / reach line | `--t-soft` | `#4C5D61` |
| Muted labels | `--t-mute` | `#74858A` |
| Band address text | (paper white) | `#fff` on band |
| Band sub-text ("Views", city) | `--t-pap-mute` | `#7C8D90` |
| Hairline | `--line` | `rgba(20,36,40,.13)` |
| **Mint — RESERVED, do NOT use** | `--sa-mint` | `#4ef2d9` |

## 2. Type (two families only)

| Element | Family | Mobile → Desktop | Weight | Tracking / transform |
|---|---|---|---|---|
| Section headline `h2.head` | Newsreader | 30 → `clamp(30px,6.2cqi,50px)` | 400, `em` italic | -.015em |
| Section eyebrow | IBM Plex Mono | 11.5px | 500 | .2em, UPPERCASE |
| Coverflow eyebrow | IBM Plex Mono | 10.5px | 400 | .2em, UPPERCASE |
| **View number (THE HERO)** | Newsreader | **36px → 40px** | 400, **color WHITE (`#fff`)**, `tabular-nums`, line-height .92 | -.01em |
| **"Views" label** | IBM Plex Mono | 10px | 400, `--t-pap-mute` | .2em, UPPERCASE |
| Card address | Newsreader | 14.5px | 400, `#fff` | normal, lh 1.15 |
| Card city | IBM Plex Mono | 9px | 400, `--t-pap-mute` | .14em, UPPERCASE |
| Aggregate line | Newsreader | `clamp(16px,2.4cqi,20px)` | 400, total `--teal-700` 500-wt | normal |

**The number is the proof — it dominates the card.** Big Newsreader, **WHITE** on the dark band,
with "Views" as the small mono label beside it. This is the first thing the eye lands on. Address +
city sit smaller beneath it. **Teal is reserved** for the card keyline + the single aggregate line
(one earned accent per card) — a teal number on every card re-introduces the single-accent overuse
the polish pass fixed.

## 3. Data magnitude (test at real proportions)

Portal-scale per Beacon/ATHT. Prototype seeds: **41,184 / 37,610 / 32,246 Views**, aggregate
**139,600 buyer views**. Five-to-six digits must fit the band cleanly (`tabular-nums`, the band
auto-sizes to the number). Sub-thousand numbers read as weakness and must never be the design target.

## 4. One view label (decided)

**`Views`** — plain, source-agnostic. Sidesteps the honesty problem of claiming a specific portal
(no per-card "Zillow views"), and stays consistent with the aggregate. (`buyer views` is the only
acceptable alternative; do not label individual cards with a named portal.) The aggregate prose
reads "{total} buyer views across recent listings".

## 5. Spacing & radii

- Card radius **16px**. Card size desktop fan **296 × 392px**; flat detail 264 × 348; single 280 × 368.
- Mobile swipe card **264 × 348px**, gap 14px, side padding `max(16px, calc(50% - 132px))` (center-snap).
- Coverflow block `margin-top:48px`, separated from capability cards by a `1px var(--line)` top border + 28px to the eyebrow.
- Fan stage height **460px** desktop (400px for the 2-card state). Aggregate 26px below.
- Band padding `14px 16px 15px`, gap 6px; view row gap 8px.

## 6. The 3D transform values (desktop fan)

Stage: `perspective:1700px; perspective-origin:50% 42%`. Track `transform-style:preserve-3d`.
Cards centered (`left/top:50%` + negative half-margins), `transform-origin:50% 50%`.

| Position | translateX | translateZ | rotateY | scale | opacity | filter | label? | z |
|---|---|---|---|---|---|---|---|---|
| **center** | 0 | **+70px** | 0° | **1.0** | 1 | `saturate(1.04)` | yes + **2px teal keyline** + grounding shadow | 6 |
| inner-left | −44% | 0 | **+23°** | **.92** | **.82** | — | yes | 5 |
| inner-right | +44% | 0 | **−23°** | .92 | .82 | — | yes | 5 |
| outer-left | −82% | **−50px** | **+36°** | **.82** | **.4** | `saturate(.55) brightness(.98)` | **no** (quiet peek) | 4 |
| outer-right | +82% | −50px | −36° | .82 | .4 | `saturate(.55) brightness(.98)` | no | 4 |

- translateX percentages are relative to card width (negative-margin centering) → slight overlap. Tune ±4% on real photos; keep overlap + restraint.
- **Center grounding shadow:** `0 1px 0 rgba(255,255,255,.6) inset, 0 28px 52px -26px rgba(60,44,27,.55)`.
- **Center keyline:** `::after`, `border:2px solid var(--teal-700)`, full radius, `pointer-events:none`.
- Saturation recedes outward — restrained cinematic: keep bend + depth, drop the dark drama.

### Small-count fans (no faked peeks)
- **2 listings:** inner-left / inner-right only — translateX ±30%, rotateY ±16°, scale .95, opacity 1.
- **1 listing:** single center card upright (`translateZ(40px) rotateY(0) scale(1)`), keeps keyline.

## 7. Mobile-degraded equivalents (primary surface)

**Not the fan shrunk.** Near-flat peeking swipe carousel:
- `overflow-x:auto; scroll-snap-type:x mandatory; scroll-snap-align:center` per card.
- Active card upright, full opacity, grounding shadow + teal keyline.
- Off-center peek: **`scale(.95) rotateY(5deg)`, opacity .82, `transform-origin:left center`** — minimal tilt.
- Card 264×348, gap 14px, view number 36px. Progress dots (active = teal pill 18px, rest = 6px `--line`).
- Touch swipe only; **no hover states; no autoplay.**

## 8. Card dark-band treatment (the honesty rule)

- Solid band `#12171a`, flush to card bottom, full width. **Legibility never rides on the photo.**
- DOM order top→bottom: **view row (number + "Views") → address → city.** The number is the hero.
- **View count OPTIONAL, never fabricated.** Absent → band omits the view row entirely (address + city
  only, no empty slot). With/without cards coexist in one fan.
- **Outer peek cards carry no band/label** — they only signal "there's more."
- Video-slot variant: same band (`Tour · {address}` + `{city} · {duration} walkthrough`), centered play
  affordance (58px circle, translucent ink, white triangle). No autoplay.

## 9. Aggregate line

- Renders only when **≥ 2 listings carry a view count**; otherwise omitted (no placeholder).
- Present: `**{total} buyer views** across recent listings` — total `--teal-700` 500-wt, rest `--t-soft` Newsreader, centered below the fan.

## 10. Flex behavior (per-state)

| State | Condition | Render |
|---|---|---|
| **Default** | 0 listings | Capability cards + shipped reach line only — reads complete. No coverflow, no aggregate. |
| Full fan | 3–5 listings | 5-card fan (center + 2 inner + 2 outer peeks). |
| 1–2 listings | 1 or 2 | Tightened small-count fan, no faked peeks. |
| Per-card number | each card | with-number & without-number cards coexist. |
| Video slot | agent has a tour | one center slot becomes the video card. |

The whole coverflow is a **flex-IN enhancement** — never required for the section to read.

## 11. Motion (motivated only)

- **Entrance:** `@keyframes settle { from { opacity:0; transform: translateZ(-30px) scale(.96) } }`,
  `.6s cubic-bezier(.22,.61,.36,1) both`, stagger inner +60ms / outer +120ms. Trigger on intersection, not load.
- **Swipe** is the only other motion (CSS scroll-snap; `.4s ease`). **No autoplay / auto-advance.**
- **`prefers-reduced-motion: reduce`** → `perspective:none`, flat static peek row (wrap, 14px gap, cards
  upright 220×290, opacity/filter reset, all bands visible), no settle, no transitions.

## 12. Companion: Settings "recent listings" input (lighter priority)

Noted, **not mocked** (rides with parked onboarding/agent-UI work, handoff §7). Set-once block: per
listing → address, photo upload **OR** auto Street View fallback, optional view count, optional source
label. Manual entry only — **no portal scraping.** Editable after onboarding.

---

## Build notes for Claude Code (the eventual packet)
- New section appended inside `CampaignSpread` (or sibling `<ListingsCoverflow>`), gated by the State A
  flag; **State B + every other section + flag-off must stay byte-identical.**
- Reuse shipped tokens (`--teal-700/500`, `--sa-proof-dark`, `--offwhite`, `--f-display`, `--f-mono`,
  `--line`) — **no new palette, no hard-coded hexes.** Teal/cream bind to brand tokens so they re-hue per agent.
- Capability copy: shipped `CAPABILITY_*` constants + agent-authored `whyUs.marketingApproach`. Reach line:
  shipped `EXPOSURE_LINE`. Do not invent copy; no em-dashes.
- Card photo: agent's listing photo, else Street View fallback. **Never fabricate views.**
- All transforms CSS-only; no JS for the fan (intersection-trigger for entrance, native scroll-snap on mobile).
