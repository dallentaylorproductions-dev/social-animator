# Audit 2B — Dashboard Simplification (v1.46)

The dashboard today is two surfaces stacked: a state-aware "Next best action" rail at the top and a flat "All skills" grid bucketed by category. The grid is a breadth surface — it puts every shipped skill at equal weight and contradicts the new operational-confidence frame, which says the working agent should see the next weekly habit, not a tool menu. v1.46 should keep the rail, collapse the grid behind a disclosure, and add a deterministic "resume draft" affordance that uses the localStorage signals already wired by state-detection.

## Current dashboard composition

The dashboard shell is a server component at [src/app/dashboard/page.tsx](src/app/dashboard/page.tsx). It renders an auth-aware header (email-derived greeting, `Settings →` link, `Sign out` form) and delegates everything below the header to [src/app/dashboard/DashboardClient.tsx](src/app/dashboard/DashboardClient.tsx), a client island that reads localStorage.

`DashboardClient` has three render branches:

1. **Loading placeholder.** `brandConfigured === null` → an empty `h-32` div with `data-testid="dashboard-loading"`. Avoids layout shift during hydration.
2. **Empty state.** `hasBrandProfileConfigured()` returns `false` → the `EmptyState` card: mint-bordered panel, "Set up your brand profile to unlock skills" headline, CTA button to `/settings`. Brand profile means `socanim_brand_settings.agentName` is set ([src/app/dashboard/state-detection.ts:127](src/app/dashboard/state-detection.ts)).
3. **Configured state.** Two stacked sections: `NextBestActionSection` (or a `NoActiveWorkflowsState` fallback) and the always-rendered `AllSkillsSection`.

`NextBestActionSection` reads workflows whose `triggerStates` overlap with the active states detected from localStorage. Six workflows are wired in [src/app/dashboard/workflows.ts](src/app/dashboard/workflows.ts): `listing-launch`, `seller-win`, `open-house-prep`, `momentum`, `content`, `open-house`. Each renders as a `NextBestActionCard` ([src/app/dashboard/components/NextBestActionCard.tsx](src/app/dashboard/components/NextBestActionCard.tsx)) — mint-bordered panel with a workflow name, emotional-driver subtitle, the primary skill's `purpose` body copy, a CTA button to the skill, and "After this:" chips for `recommendedNextSkills`.

`AllSkillsSection` reads `getCategorizedSkills()` from [src/skills/registry.ts](src/skills/registry.ts) and renders one `SkillGroup` per non-empty category in `SKILL_CATEGORY_ORDER`: Marketing assets → Seller pitch → Social content → Open house. Each group is a `text-[11px]` lowercase header above a 3-column grid of `SkillTile` cards ([src/app/dashboard/components/SkillTile.tsx](src/app/dashboard/components/SkillTile.tsx)). Tiles show the skill name, an output-format badge (e.g. "PDF + 2x MP4"), a 2-line clamped purpose, and a hover-revealed "Open →" affordance.

There is no recent-activity surface, no last-used skill memory, no workflow-stage hint surfacing beyond the existing `triggerStates` matching. The state-detection layer reads seven localStorage keys but the dashboard only uses them to flip workflow cards on or off — it never surfaces "you have an unfinished draft" to the user.

## Skill registry inventory

The registry is `ALL_SKILLS` in [src/skills/registry.ts:22](src/skills/registry.ts) and contains 15 skills across four categories:

**Marketing assets (2)**
- `listing-flyer` — Listing Flyer Generator. PDF + JPEG + 2× MP4. Shipped, full implementation at [src/tools/listing-flyer/](src/tools/listing-flyer/).
- `open-house-promo` — Open House Promo Generator. PDF + JPEG + 2× MP4 + PNG QR. Shipped, full implementation at [src/tools/open-house-promo/](src/tools/open-house-promo/).

**Seller pitch (2)**
- `listing-presentation` — Listing Presentation One-Pager. Client-facing PDF + JPEG. Shipped. [src/tools/listing-presentation/](src/tools/listing-presentation/).
- `seller-intelligence-report` — Seller Intelligence Report. Agent-facing PDF (first agent-facing skill in the system per SIR audit). Shipped. [src/tools/seller-intelligence-report/](src/tools/seller-intelligence-report/).

**Open house (1)**
- `open-house-prep` — Open House Prep. Agent-facing PDF + client-facing visitor handout URL. Shipped (dual-output). [src/tools/open-house-prep/](src/tools/open-house-prep/).

**Social content (10)** — all from [src/templates/skills.ts](src/templates/skills.ts), all MP4 outputs only:
- `social-animator-listing-card` — Listing Card
- `social-animator-listing-showcase` — Listing Showcase Reel
- `social-animator-listing-carousel` — Listing Carousel
- `social-animator-before-after` — Before / After
- `social-animator-qa-card` — Q&A Card
- `social-animator-testimonial-card` — Testimonial Card
- `social-animator-numbered-process` — Numbered Process
- `social-animator-grid-comparison` — Grid Comparison
- `social-animator-stat-highlight` — Stat Highlight
- `social-animator-market-update` — Market Update

All 15 skills are shipped — there are no scaffolded-only or in-progress entries in the registry. Gaps the codebase references (Buyer Tour Page, Buyer Consultation Guide, Authority Page, dedicated Follow-Up Template) are *not yet in the registry*; they're called out in [src/app/dashboard/workflows.ts:18-20](src/app/dashboard/workflows.ts) and the `momentum` workflow falls back to `social-animator-testimonial-card` until the real skill ships.

## Adoption-hierarchy mapping

Mapping each skill against Aaron's hierarchy (buyer tours > social > door-knocking > open house > seller stuff) and weekly-habit depth:

| Skill | Tier | Rationale |
|---|---|---|
| `social-animator-market-update` | **Weekly** | The visibility-cadence workhorse; supports `visibility_gap_state` which fires always-on. |
| `social-animator-stat-highlight` | **Weekly** | Authority + visibility cadence; low effort per asset. |
| `social-animator-qa-card` | **Weekly** | Same authority + visibility cadence; complements stat-highlight. |
| `social-animator-testimonial-card` | **Weekly** | Authority cadence; also the placeholder primary skill for the `momentum` workflow. |
| `open-house-prep` | **Weekly when listed, otherwise dormant** | Saturday is the open-house day for working agents. Time-sensitive every weekend an agent has an active listing. |
| `open-house-promo` | **Weekly when listed, otherwise dormant** | Same lifecycle as OH Prep but pre-event marketing rather than agent prep. |
| `listing-flyer` | **Monthly-or-less** | Triggered by a new listing, then largely done. Not a habit. |
| `social-animator-listing-card` | **Monthly-or-less** | Tied to listing-launch lifecycle. |
| `social-animator-listing-showcase` | **Monthly-or-less** | Same. |
| `social-animator-listing-carousel` | **Monthly-or-less** | Same. |
| `social-animator-before-after` | **Monthly-or-less** | Tied to `just_sold_state`. |
| `listing-presentation` | **Monthly-or-less** | One per seller appointment. |
| `seller-intelligence-report` | **Monthly-or-less** | One per seller appointment; the agent-prep half of the appointment pair. |
| `social-animator-numbered-process` | **Situational** | Educational content; not part of a clear weekly cadence. |
| `social-animator-grid-comparison` | **Situational** | Same. |

No skills are dead or near-dead in the codebase. They are all wired, exported, and routable. The ambiguity sits in *cadence fit*: numbered-process and grid-comparison are real shipped skills with no recurring trigger state beyond the always-on `authority_building_state` / `visibility_gap_state` — they're tools an agent reaches for occasionally, not weekly.

Aaron's stated hierarchy implies **buyer tours** should be the top tier, but no buyer-tour skill exists yet. The current registry's center of gravity is social content (10 of 15 skills) and seller workflows (2 of 15) — the inverse of the stated priority. v1.46 dashboard work cannot fix that imbalance, but it should not amplify it. Right now the flat grid does amplify it by giving social content 10× the visible surface area.

## Recommended dashboard hierarchy

Above the fold (always visible after auth + brand-configured):

1. **Welcome strip.** Greeting + settings/sign-out chrome. Unchanged from today.
2. **Resume-or-start strip (new).** If a draft exists for any active state, one prominent card titled "Resume your draft" pointing back to the right skill. If no draft, omit entirely — don't reserve dead space.
3. **Next best action rail.** Up to 2 cards from `getActiveWorkflows()`, in `PRIORITY_ORDER`. Keep the existing `NextBestActionCard` design.
4. **Weekly habit shelf (new).** A small 3-up row of the three weekly-cadence skills the agent has not used this week: market-update, stat-highlight, qa-card. Smaller than `NextBestActionCard` but more prominent than today's `SkillTile`. Reads `*:draft` localStorage timestamps + nothing else.

Reachable but secondary, behind a single "More tools" disclosure (collapsed by default):

5. **Situational browse.** Today's `AllSkillsSection` minus social-content (which is now in the Weekly habit shelf). Render as a tabbed surface: Marketing assets | Seller pitch | Open house | More social. Closer to the elite-agent productivity expectation: "I know what I need; let me reach it fast."

Hidden (still routable but not surfaced on the dashboard):

6. **Situational social content.** `numbered-process`, `grid-comparison`, `before-after`, `listing-card`, `listing-showcase`, `listing-carousel`. Reachable from "More tools → More social" or from `recommendedNextSkills` chips on already-surfaced cards. These don't need a dashboard tile.

The above-the-fold zone is now ~3 surfaces (resume, NBA rail, weekly habits) instead of today's ~3 surfaces plus a 15-tile grid. The disclosure ratio flips from "everything visible by default" to "weekly habits visible by default; situational reachable in one click."

## Hide-low-frequency-tools strategy

Specific affordance, not abstract:

- A single button reading `More tools (12)` below the weekly habit shelf, styled as a neutral-bordered link with a chevron. Clicking expands a 4-tab surface in-place: **Marketing | Seller | Open House | More social**. Each tab is a one-column list of skills with the existing `SkillTile` content collapsed to one row (name + format badge + purpose, no hover state).
- The disclosure state is local (not persisted). Opening it does not navigate away. Agents who want every tool see them with one click.
- An additional plain-text link below the tabs: `Browse all skills →` linking to a `/skills` index page (new route, scaffolded only — actual creation out of scope for v1.46 unless cheap). The index page is a flat searchable list. This is the escape hatch for agents who don't know which category their target lives in.
- No second-level menu under "Settings." The dashboard is the only entry point.

How an agent finds it when they need it: the count `(12)` signals "there's a lot more here." The 4-tab labeling matches the situational vocabulary they already use (marketing / seller / open house / social). The `/skills` index handles the long tail.

## Next-best-action pattern (deterministic, no AI)

The dashboard already has a `NextBestActionCard`. v1.46 should sharpen the *selection* rules without adding AI. Minimum viable deterministic ruleset, reading existing localStorage keys only:

1. **If `listingFlyer:draft` exists and is < 3 days old** → resume card pointing at `/listing-flyer`. Label: "Resume your flyer draft." Beats every workflow card.
2. **If `openHousePrep:draft.eventDate` is today or tomorrow** → top card is `open-house-prep` regardless of `PRIORITY_ORDER`. Label changes from "Prep for this weekend's open house" to "Open house tomorrow — finish prep." or "Open house today — pull up your prep."
3. **If `sellerIntelligenceReport:draft.propertyAddress` exists and `recommendedListPrice` is empty** → top card is `seller-intelligence-report`. Label: "Finish your appointment prep."
4. **If none of the above and the current day is Mon/Tue/Wed** → top card is `social-animator-market-update` (the weekly visibility surface). Label: "Post this week's market update."
5. **If none of the above and it's Thu/Fri** → top card is `open-house-promo` if a listing profile exists. Otherwise `social-animator-stat-highlight`.
6. **Saturday/Sunday default** → `social-animator-testimonial-card` (lower-effort weekend content).

The ruleset lives in a new `next-best-action.ts` adjacent to `workflows.ts`. It returns a single skill ID and a labeled reason string. The existing `getActiveWorkflows()` continues to power the secondary cards (up to one more, below the primary).

Why this is enough: the rules cover the four most common agent contexts (mid-listing, mid-prep, weekly cadence weekday, weekly cadence weekend) using only timestamps and presence checks. No probabilistic reasoning. Every rule is testable as a pure function.

## Empty-state handling

A brand-new agent who has just signed in but has not configured a brand profile sees `EmptyState` today: a single mint-bordered card pointing to `/settings`. Keep this — it is the right operational-confidence move. The agent has one job, told once, with one CTA.

What changes in v1.46: once brand profile is set, the agent lands on the configured dashboard with no drafts and no active workflows. Today they see `NoActiveWorkflowsState` ("You're all set up. Pick a tool below to start.") plus the 15-tile grid. That contradicts the wedge.

Replace `NoActiveWorkflowsState` with a one-card onboarding rail: **"Start with this week's market update."** A `NextBestActionCard` styled identically to the active-workflow case, pointing at `social-animator-market-update`. The body copy reads: "Three numbers and a one-line trend. The fastest weekly habit to build." This is justified by the operational-confidence frame — an average agent's first action should be the lowest-effort recurring asset, not a tool menu. Below this card, the weekly habit shelf and disclosure render as normal.

Do not add a tutorial overlay or interactive walkthrough. The skill itself is the tutorial; finishing one market update is the onboarding.

## Situational categories reframe

The current Marketing assets / Seller pitch / Social content / Open house grid is information-theoretically correct (it maps to skill category) but operationally wrong (it asks the agent to choose). v1.46 should reframe categories as *organizational filters inside the disclosure*, not as primary dashboard surfaces.

Specifically: keep the categories as the four tabs inside "More tools," but rename them to match how working agents actually narrate their week:

- Marketing assets → **For a listing**
- Seller pitch → **For a seller appointment**
- Open house → **For an open house**
- Social content → **For staying visible**

These labels are situational ("I have a seller appointment Thursday") rather than taxonomic ("I need a seller pitch asset"). The skill records themselves do not need to change; the `SkillCategory` type stays as-is. Only the display string at the tab header changes, lived in the dashboard component, not in [src/skills/types.ts](src/skills/types.ts).

The single flat grid disappears entirely. Above the fold, the agent sees one resume card (if applicable), one NBA card, three weekly-habit cards. Below the disclosure, four tabs of situational labels.

## Mockup sketches

### Variant A — Minimal. Resume + one NBA + weekly habits + disclosure.

```
┌────────────────────────────────────────────────────────────┐
│ SIMPLY EDIT PRO STUDIO                       Settings → ⎯  │
│ Welcome back, dallen.                                       │
│ What's happening in your business right now.                │
├────────────────────────────────────────────────────────────┤
│ ▸ RESUME YOUR DRAFT                                         │
│   Listing flyer — 123 Oak St                                │
│   Last edited yesterday.       [ Resume → ]                 │
├────────────────────────────────────────────────────────────┤
│ ▸ NEXT BEST ACTION                                          │
│   Post this week's market update                            │
│   Three stats and a one-line trend. ~3 min.                 │
│   [ Open Market Update → ]   After this: Stat Highlight     │
├────────────────────────────────────────────────────────────┤
│ THIS WEEK                                                   │
│ ┌──────────┐  ┌──────────┐  ┌──────────┐                   │
│ │ Stat     │  │ Q&A Card │  │ Testimonial │                │
│ │ Highlight│  │          │  │             │                │
│ └──────────┘  └──────────┘  └──────────┘                   │
├────────────────────────────────────────────────────────────┤
│ More tools (12) ▾                                           │
└────────────────────────────────────────────────────────────┘
```

Strength: lowest cognitive load. Three decisions max above the fold.
Risk: an agent with an active open house this week sees that workflow only after expanding "More tools" unless the NBA picks it up. The deterministic ruleset needs to be correct.

### Variant B — Two NBA cards + weekly habits + situational tabs always visible.

```
┌────────────────────────────────────────────────────────────┐
│ SIMPLY EDIT PRO STUDIO                       Settings → ⎯  │
│ Welcome back, dallen.                                       │
├────────────────────────────────────────────────────────────┤
│ ▸ NEXT BEST ACTION                                          │
│ ┌─────────────────────────┐  ┌───────────────────────────┐ │
│ │ Open house tomorrow —   │  │ Finish your appointment   │ │
│ │ finish prep             │  │ prep                      │ │
│ │ [ Open OH Prep → ]      │  │ [ Open SIR → ]            │ │
│ └─────────────────────────┘  └───────────────────────────┘ │
├────────────────────────────────────────────────────────────┤
│ THIS WEEK                                                   │
│ Market Update · Stat Highlight · Q&A Card                   │
├────────────────────────────────────────────────────────────┤
│ MORE TOOLS                                                  │
│ [ For a listing ] [ For a seller ] [ For an open house ]    │
│ [ For staying visible ]                                     │
│   • Listing Flyer Generator       PDF + JPEG + 2x MP4       │
│   • Listing Card                  MP4                       │
│   • Listing Showcase Reel         MP4                       │
│   • Listing Carousel              MP4                       │
└────────────────────────────────────────────────────────────┘
```

Strength: situational language; tabs render the *current* category inline rather than behind a click.
Risk: visible tab strip is still a choice surface and risks recreating the breadth grid in a different shape. Mitigated by defaulting the tab to whichever category matches today's NBA.

### Variant C — Single primary card + cadence shelf + zero visible disclosure (most aggressive).

```
┌────────────────────────────────────────────────────────────┐
│ SIMPLY EDIT PRO STUDIO                       Settings → ⎯  │
│ Welcome back, dallen.                                       │
├────────────────────────────────────────────────────────────┤
│                                                             │
│   ▸ DO THIS NOW                                             │
│                                                             │
│   Post this week's market update                            │
│   Three stats and a one-line trend.                         │
│   ~3 minutes.                                               │
│                                                             │
│              [ Open Market Update → ]                       │
│                                                             │
├────────────────────────────────────────────────────────────┤
│ Also this week:  Stat Highlight  ·  Q&A Card  ·  Testimonial│
├────────────────────────────────────────────────────────────┤
│ Need a different tool? Browse all skills →                  │
└────────────────────────────────────────────────────────────┘
```

Strength: maximum operational confidence — the agent has exactly one decision: do the recommended action or not. Closest to the wedge.
Risk: requires the deterministic NBA ruleset to be reliable. If the rule picks wrong, the agent is one extra click away from anything else (because there's no disclosure on the dashboard, only a link to `/skills`). Also forces v1.46 to create the `/skills` index page, which the other variants do not require.

Recommendation: ship Variant A. It commits to the wedge without betting v1.46 on a new index page, and it preserves the disclosure as an escape hatch.

## Skill registry cleanup recommendations

Remove from the dashboard surface in v1.46 (code stays, routes stay):

- `social-animator-numbered-process` — situational explainer, not part of any weekly habit; lives in More tools only.
- `social-animator-grid-comparison` — same situational profile.
- `social-animator-listing-card` — overlap with `social-animator-listing-showcase`; pick the higher-effort one to surface from listing workflows and hide the other.
- `social-animator-listing-carousel` — same overlap; surface only via `recommendedNextSkills` chips on listing-flyer.
- `social-animator-before-after` — only fires on `just_sold_state`, which is rare; surface from More tools and from the just-sold workflow card, not on the dashboard root.

None of these are dead — they all ship and the routes work. The cleanup is purely about *visibility on the root dashboard*. They remain reachable from `/skills`, from `recommendedNextSkills` chips, and from direct URLs.
