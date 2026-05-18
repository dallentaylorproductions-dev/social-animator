# OH Prep Phase 1C — tool architecture audit

**Date:** 2026-05-17
**Branch:** `phase-oh-prep-1-audit` (stacks on Audits 1A `427edd7` + 1B `561c1d1`)
**Status:** Investigation-only. Third and final Phase 1 audit. No code, no tests, no skill records committed, no registry edits.
**Strategic frame:** Aaron 2026-05-17 explicitly requested an open-house *prep* workflow distinct from the existing `/open-house-promo` marketing tool — and explicitly framed the deliverable as the dual-output pattern: agent prep document + visitor-facing artifact a buyer "would be like, holy crap, this is, nobody else give me anything like this." This audit specifies that tool. It consumes the design language from 1A and the share URL infrastructure from 1B and produces no further design or infra spec of its own.

---

## 1. Context

**Why this audit exists.** Open House is the workflow with the largest current dual-output gap. `/open-house-promo` covers the marketing-asset side (PDF/JPEG/MP4 for the pre-event social push). The *prep* side — what the agent walks in with, and what the visitor walks out with — does not exist. Aaron's 2026-05-17 transcription is the primary signal for what to build; the audit treats his words as spec.

Aaron's verbatim ask (the deliverable spec):

> "What if we could? Build them an amazing tool to prep, and for the open house, right? It's gonna give you, and maybe it's multiple tools for open houses. Maybe it's the prep, and then maybe it's, like, whatever's gonna spit out the, whatever's gonna do, the research, and then spit out, spit out the printouts, 'cause it'd be massively helpful to have a bead on almost, like, the neighborhood information around that open house. The value of homes, and, like, a marketing real estate thing, and of that particular home. Like how it's positioned. … I think it'd be something they could hand to a consumer, that would be like, holy crap, this is, nobody else give me anything like this."

> "And then if it looks nice, and I can literally just create a digital link and text it to them, like, here, I'm gonna send you the full report. And we just put all the most valuable things in the front of the report. So we're not overwhelming them with too much information."

Three concrete principles surface from those words:

1. **Prep is the primary workflow** (not marketing — that's covered).
2. **Two outputs from one form input** — agent prep + visitor handout. SIR dual-output pattern.
3. **Visitor handout reads as "nobody else gives me this"** via *information density + visual polish*. Polish bar from Audit 1A; density is this audit's responsibility.
4. **Information hierarchy front-loads the valuable** — "most valuable things in the front of the report." Section ordering is a real design choice, not arbitrary.

**Scope.** Tool data model, content libraries, visitor handout structure, agent prep document structure, skill record proposal, dashboard wiring (including the long-deferred category refactor), gap analysis, phased build plan. References Audits 1A and 1B; does not re-spec design tokens or URL infrastructure.

**Out of scope.** Design tokens (Audit 1A landed at `427edd7`). URL routing / KV persistence / OG metadata (Audit 1B landed at `561c1d1`). Implementation (Commits 1–6 in §10's plan). Post-event follow-up workflow (banked; could extend OH Prep later or be a separate skill).

**IDX integration is v2.** Aaron is pursuing the Emolus API. v1 ships manual-entry only with a `dataSource` abstraction baked in (§6) so v2 IDX-feed is a swap-compatible upgrade, not a rewrite.

**Aaron content review (Refinement #7 pattern from SIR).** Talking-points + common-questions + handout-section libraries get Aaron review after the libraries are written (Commit 4 in §10's plan), before v1.45 merge.

---

## 2. Open House workflow research summary

What real estate agents typically do across an open-house event lifecycle:

**Pre-event (T-7 days to T-0):**

- Research the property — comps, neighborhood, school district, recent sales, market trend
- Prepare talking points the agent will lead with at the door
- Anticipate likely visitor questions and rehearse responses
- Produce the visitor handout (today: usually an MLS print-out, sometimes nothing)
- Promote the event (covered by the existing `/open-house-promo` tool)
- Plan event logistics — sign-in capture method, refreshments, parking guidance

**In-event (event window):**

- Greet visitors
- Lead with the property's distinctive positioning ("the marketing real estate thing" — Aaron)
- Answer questions naturally; pivot to listening for buyer signal
- Hand the visitor handout — printed paper or, increasingly, a texted URL
- Capture leads via sign-in
- Pivot strong-signal visitors to a same-day showing of a related property, financing intro, or follow-up appointment

**Post-event (T+0 to T+7 days):**

- Send personalized follow-ups to captured leads
- Pivot lukewarm visitors to social/email nurture
- Debrief: which moments worked, which questions surprised, what to adjust next time

**Three distinct artifacts surface in the workflow:**

| Artifact | Audience | Existence today |
|---|---|---|
| Pre-event prep document | Agent (private) | **None.** Built by this audit. |
| In-event visitor handout (text-shared URL) | Visitor (public) | **None.** Built by this audit. |
| Post-event follow-up templates | Visitor (1:1 email/SMS) | **None.** Banked for future skill — out of scope for v1.45. |

**This audit covers the first two.** Aaron's transcription explicitly asked for both. Post-event follow-up is its own future skill (W-1 Half B audit Gap #6 — "Follow-Up Template Skill").

**Aaron's "valuable things in the front" principle** drives section ordering in both artifacts. The visitor handout leads with the *property's headline truth* (hero + positioning + comps); the agent prep doc leads with the *first 60 seconds of the event* (talking points + common questions). In both cases, less-time-sensitive sections move later.

---

## 3. Visitor handout structure (D9)

Mobile-first web page rendered at `/h/[slug]` per Audit 1B. Visual language from Audit 1A (§7 share-page styling baseline, §5 component primitives).

**Section order matters.** Aaron's "valuable things in the front" rules out the natural temptation to dump neighborhood data at the top. The first three sections answer the buyer's two implicit questions: *is this home for me* and *is it fairly priced.*

### Proposed 7 sections + 1 optional

| Order | Section | Purpose | Data source | "Nobody else gives me this" angle | Mobile rendering |
|---|---|---|---|---|---|
| 1 | **Hero** | Anchor reaction — first impression carries the rest | Hero photo, address, beds/baths/sqft, list price | Photo at edge-to-edge mobile width; price in display-sized type using Audit 1A's `text-display` token | Single column; photo aspect 4:3 fills viewport width; price below photo at full-width |
| 2 | **Why this home** | Translates listing into agent's positioning ("the marketing real estate thing" — Aaron) | Agent-written 2-4 sentence narrative | The narrative voice — most handouts paraphrase the MLS description verbatim; this is an *agent's read* of the property | Generous padding (`p-6+`), text-base body |
| 3 | **Recent area sales** | Establishes comparable price context | 3–4 comparable recent sales (Comp shape from SIR) | Combination of address-level specificity AND agent's per-comp notes column — most printed handouts show just numbers | Stack vertically on mobile (one card per comp); inline notes below each row |
| 4 | **Neighborhood at a glance** | Quick orientation for visitors who don't know the area | 4–6 agent-entered facts: typical home value range, % owner-occupied, average days on market in this segment, walk score, transit/commute, school summary | Selected per-property by the agent rather than dumped from a Zillow widget | Two-column grid on desktop, single column on mobile; each fact is `<StatLabel>` + value |
| 5 | **Market context** | Where this listing sits in the broader market | Agent-written 2-3 sentence trend statement (v2: auto-derived from IDX) | Reads as expert read of the market, not a generic "good time to buy" boilerplate | Single column body text |
| 6 | **Your agent** | Builds trust, invites contact | Agent bio, headshot, brokerage, contact CTA (text / email / call buttons) | Selected track-record stats (homes sold, average DOM, sale-to-list ratio) above the bio | Headshot + name stack on mobile; CTA buttons stack full-width with the primary "Schedule a showing" pill |
| 7 | **Other open houses you might like** *(v1 manual, v2 IDX)* | Cross-sell + lead capture | Manually entered list of 2-4 related listings agent is also hosting OR knows of | The curated angle vs an algorithmic listing feed | Horizontal scroll on mobile (3-up card carousel); grid on desktop |
| 8 *(optional)* | **Schools & commute** | When the buyer profile makes it load-bearing | Agent-entered school names + commute estimates to common destinations | Specific named schools + agent commentary, not a generic "great schools" claim | Two-column grid; rendered only when agent populates the fields |

**Why 7+1 not 6 or 8.**

- 6 drops "Other open houses" — but Aaron's transcription specifically called out neighborhood/area context as a differentiator, and cross-sell to related listings is one of the highest-leverage conversion moments for an active open-house agent.
- 8 makes Schools & commute mandatory — but for downtown condos or short-term rentals the school question is irrelevant; an empty section reads as filler. Conditional rendering on field population fits the v1.45 ship discipline.

**Section dividers** between sections use Audit 1A §5 `SectionDivider` (a hairline rule with optional `StatLabel` above).

**Information density target.** Each section should fit roughly one mobile screen (no fold lines mid-section). Body padding ≥ `space-6` per 1A's generous-whitespace heuristic. If any single section exceeds ~600px of vertical content on a 390pt-wide mobile viewport, consider splitting or trimming.

**What deliberately does NOT appear in the v1 handout:**

- MLS sheet verbatim — paraphrased through the agent's voice (§3 row 2)
- Interactive map embed — heavy, slow on mobile; static map image with linked-out directions instead (deferred to v1.5)
- Photo gallery beyond hero — defer to v1.5; the hero photo carries the visual story
- Mortgage calculator widget — out of scope; financing is a 1:1 conversation, not a self-serve form
- Email-capture form — public-with-knowledge-of-URL handout per Audit 1B §5; lead capture is Pro tier hardening
- Visitor sign-in form on the handout itself — separate workflow

---

## 4. Agent prep document structure

Letter-portrait PDF following SIR's PDF pattern. Generated browser-side via react-pdf using Audit 1A's `pdf-theme.ts` tokens. Mirrors SIR's "first 60 seconds of the appointment" framing — what the agent reaches for at the door.

### Proposed sections (in order)

1. **Subject property summary** (~50pt vertical) — address, list price, key stats (beds/baths/sqft), event date/time. Single-line header.
2. **Event logistics** (~70pt) — event window, expected traffic estimate (agent-entered), pre-event prep checklist (sign-in materials, refreshments, parking sign placement, owner-occupancy notes). Editable checkbox list in the form; rendered as checked items in the PDF.
3. **Lead with these talking points** (~90pt) — 3–5 selected entries from the talking-points library (§4.3). The "first 60 seconds at the door" content. Each: a bolded one-line trigger + a 2-3 sentence response paragraph.
4. **Common visitor questions** (~variable, 35–50pt per selected entry) — 5–8 selected entries from the common-questions library (§4.4), grouped by category. Each: italic trigger + plain-text response.
5. **Conversion prompts** (~80pt) — 2–4 selected entries from the conversion-prompts library (§4.5). Scripted asks the agent uses to pivot a strong-signal visitor to a next step.
6. **Post-event follow-up checklist** (~70pt) — agent-written commitments for what they'll do with each visitor type (lukewarm vs warm vs hot). Free-text bullet list, capped at 5 entries.
7. **Subject property comps for reference** (~60-90pt) — same 3–4 comps that appear on the visitor handout, but with the agent's notes column wider and more detail (sold date, distance, optional fieldConfidence indicator if from IDX in v2). Lets the agent reference comp numbers without checking a separate doc.

**Total estimated PDF length:** 1-2 pages (matches SIR's footprint). Page 1 fits sections 1-4; sections 5-7 spill to page 2 when content is generous, fit on page 1 when sparse. Empty-section hiding (SIR's pattern) keeps sparse-fill drafts dense.

### 4.1 Content library architecture

Mirrors SIR's `content/objections.ts` + `content/pricing-strategies.ts` pattern. Three libraries:

| Library | Target size | File | Default-selection count | Categories |
|---|---|---|---|---|
| Talking points | 8–12 entries | `content/talking-points.ts` | 4 universal pre-checked | Property positioning, Neighborhood pitch, Market timing, Value proposition |
| Common questions | 12–18 entries | `content/common-questions.ts` | 5 universal pre-checked | Schools & Commute, Property & Renovations, Market & Pricing, Seller Motivation, HOA & Logistics |
| Conversion prompts | 4–6 entries | `content/conversion-prompts.ts` | 2 universal pre-checked | Same-day showing, Financing intro, Buyer consultation appointment |

Per-entry shape mirrors SIR's `ObjectionEntry`:

```typescript
interface ContentEntry {
  id: string;        // stable, kebab-case
  category: string;  // visible grouping label
  trigger: string;   // "[visitor said:]" or "[at the door:]" — agent-facing label
  response: string;  // verbatim text the agent practices/customizes
  isDefaultSelected?: boolean;
}
```

**Content library size justification.** SIR ships 15 objection entries; OH Prep needs slightly more breadth across more contexts (event flow vs single-conversation flow). 8–12 + 12–18 + 4–6 = 24–36 entries total. Smaller and the agent's options feel thin; larger and the form becomes a wall of checkboxes (SIR's StepObjections UI ceiling was at 15-20).

**Content review checkpoint.** Initial entries written in Commit 4. Cowork hands the three libraries to Aaron for read-through (the SIR pattern), with explicit `approve / edit / reject` markers. v1.45 merge gates on his approval — same Refinement #7 as SIR.

### 4.2 Talking-points library starter shape

Universal templates the agent reads at the door. Examples to be developed in Commit 4 (placeholder shapes; actual prose written then):

- Property positioning — "What makes this home different right now is …"
- Neighborhood pitch — "Living in this neighborhood means …"
- Market timing — "Right now in this price band you're seeing …"
- Value-proposition framing — "When you compare what's just sold nearby, this listing is positioned at …"

The full talking-points text is written in Commit 4 (post-1C). Library is intentionally generic across markets; agent personalizes at the form-edit-per-event step (the per-entry override field, SIR pattern).

### 4.3 Common-questions library starter shape

Categories + sample question framings to be developed in Commit 4. Initial mapping by category:

| Category | Example questions to cover |
|---|---|
| Schools & Commute | What schools serve this address? What's the typical commute to downtown? Are there transit options? |
| Property & Renovations | When was the roof / HVAC / electrical last updated? Any known issues? Any planned work? What's the lot size relative to the neighborhood? |
| Market & Pricing | Has the price moved? How long has this been listed? Have there been offers? How does it compare to other recent sales nearby? |
| Seller Motivation | *Deflection-only category* (see seller-privacy constraint below) — questions about why the seller is moving, timing flexibility, as-is status. Agent's responses redirect to property facts, not seller circumstances. |
| HOA & Logistics | What does the HOA cover? What are the monthly costs? Are there special assessments? Any rental restrictions? |

The actual library entries written in Commit 4 must:

- Stay broadly applicable (no state-specific legal claims, no fabricated statistics)
- Honor SIR's "no fabricated stats" refinement — directional language ("typically", "tends to") unless the claim is sourced
- Avoid post-NAR-settlement legal-risk framing on buyer-agent or commission questions (SIR's Refinement #3 applies here too)
- **Seller-privacy constraint:** Seller-motivation questions are framed as *what to deflect*, not what to answer. An agent's fiduciary duty to the seller means they should not disclose seller circumstances (job relocation, divorce, financial distress, etc.) that weaken the seller's negotiating position. Sample responses for the Seller Motivation category redirect the visitor to property facts and timing flexibility framed neutrally — never to *reasons* the seller is moving.
- **HOA jurisdiction caveat:** HOA question responses must not embed jurisdiction-specific legal claims (rental restrictions, fair-housing rules, lien priorities vary by state). Responses point the visitor to the HOA's own disclosures rather than asserting what the rules are.

Cowork drafts these libraries through this constraint lens before Aaron's content review (D19 in §11).

### 4.4 Conversion-prompts library

Smaller library (4–6 entries) of scripted next-step asks. Examples to be developed:

- Same-day showing pivot — "If this home doesn't end up being the one, I've got another listing in this neighborhood I think you'd love — want to walk through it today before you leave?"
- Financing intro — "Have you talked to a lender yet? I work with a few I trust — happy to introduce you."
- Buyer consultation — "If you're seriously looking, we should sit down for 30 minutes — I'll show you what's coming on the market this week before it hits the public listing sites."

Same content-review treatment as the other libraries.

---

## 5. Dual-output data flow

Single form input → two artifacts. Diagram:

```
                ┌─────────────────────────────────────┐
                │   Agent form (5-step wizard)        │
                │   localStorage: openHousePrep:draft │
                └─────────────────────────────────────┘
                            │
            ┌───────────────┴────────────────┐
            ▼                                ▼
  ┌──────────────────────┐         ┌─────────────────────────┐
  │ Agent prep PDF       │         │ Visitor handout         │
  │ (download)           │         │ /h/[slug] web URL       │
  │                      │         │ + KV persistence (1B)   │
  │ - Talking points     │         │ - Hero + Why this home  │
  │ - Common questions   │         │ - Recent sales          │
  │ - Conversion prompts │         │ - Neighborhood          │
  │ - Follow-up checks   │         │ - Market context        │
  │ - Comp reference     │         │ - Your agent            │
  └──────────────────────┘         │ - Other open houses     │
                                   │ + Optional PDF download │
                                   └─────────────────────────┘
```

### 5.1 Form field inventory

`OpenHousePrepDraft` shape (final TypeScript in Commit 4). Estimated 25–30 fields, most optional:

**Property identity**
- `propertyAddress` *(required)*
- `propertyCity` *(optional)*
- `heroPhoto` — data URL or future blob ref *(strongly recommended; visitor handout reads poorly without)*
- `listPrice` *(required)*
- `beds`, `baths`, `sqft` *(optional)*

**Event logistics**
- `eventDate`, `eventStartTime`, `eventEndTime` *(required for handout to make sense)*
- `expectedTrafficEstimate` *(optional, agent's prep-day prediction)*
- `prepChecklist` — array of checkbox states for the standard prep items

**Positioning**
- `whyThisHomeNarrative` — agent-written 2-4 sentences *(strongly recommended)*
- `marketContextNarrative` — agent-written 2-3 sentences *(optional)*

**Data tables**
- `comps` — array of `Comp` (SIR shape with the `source` / `fieldConfidence` v2-prep fields, §6)
- `neighborhoodFacts` — array of `{ label, value }` (4-6 entries)
- `relatedListings` — array of related-open-house entries *(optional, v1 manual)*
- `schoolsAndCommute` *(optional, conditional rendering)*

**Agent-facing library selections**
- `selectedTalkingPointIds` — string[] (the talking-points library)
- `talkingPointOverrides` — record id → override text
- `selectedCommonQuestionIds` — string[]
- `commonQuestionOverrides` — record id → override text
- `selectedConversionPromptIds` — string[]
- `conversionPromptOverrides` — record id → override text

**Follow-up**
- `followUpCommitments` — string[] (free-text bullets, capped at 5)

**Data source (v2 prep, §6)**
- `dataSource` — `'manual' | 'idx-feed' | 'imported' | 'mixed'`, defaults `'manual'` in v1

**Brand-color overrides (existing tool pattern)**
- `primaryColor`, `accentColor`, `backgroundColor` *(all optional, fall through to BrandSettings)*

### 5.2 Field → output mapping

| Field group | → Agent PDF | → Visitor handout |
|---|---|---|
| Property identity | Header summary | Hero section |
| Event logistics | Logistics section | Hero subtitle + event window banner |
| `whyThisHomeNarrative` | — | "Why this home" section |
| `marketContextNarrative` | Comp reference notes | "Market context" section |
| `comps` | Comp reference table | "Recent area sales" section |
| `neighborhoodFacts` | — | "Neighborhood at a glance" section |
| `relatedListings` | — | "Other open houses you might like" |
| `schoolsAndCommute` | — | Optional schools/commute section |
| Talking points (selected) | Lead-with-these section | — |
| Common questions (selected) | Common questions section | — |
| Conversion prompts (selected) | Conversion prompts section | — |
| `followUpCommitments` | Follow-up checklist | — |
| Brand colors | Both | Both |

Roughly half the fields feed the visitor handout, half feed the agent PDF, and the property/event identity fields feed both. The agent never enters data twice.

### 5.3 Per-event ephemerality

The form is per-event — agent fills for one open house. Multi-listing context is a known v2 limitation (W-1 Half B audit §10 unknown). v1 ships with single-active-draft semantics: opening the tool resumes the most recent draft. Agents prepping multiple events concurrently overwrite. Acceptable for v1 given the cadence (most agents host 0-2 open houses per weekend).

---

## 6. Data source abstraction (IDX v2 prep)

Aaron explicitly framed IDX as the "holy crap" future — "if we could get a connected IDX, then, in real time, the agent could pop into the … active open house tool and pull, uh, a report of, like, other homes that are available around them." IDX-live is **deferred from v1** per locked context, but the data shape should accommodate the swap.

### 6.1 Top-level `dataSource` field

```typescript
type DataSource = 'manual' | 'idx-feed' | 'imported' | 'mixed';

interface OpenHousePrepDraft {
  // ...
  dataSource: DataSource; // defaults to 'manual' in v1
  // ...
}
```

- `manual` — every field typed by the agent (v1 default)
- `idx-feed` — comps + neighborhood facts + market-context narrative populated from Emolus or other MLS feed (v2)
- `imported` — bulk-imported from a saved listing template or another agent's shared template (banked future)
- `mixed` — some fields from feed, others manual overrides (most common v2 state)

This top-level field drives whole-draft framing — e.g., a small badge in the form sidebar showing data provenance.

### 6.2 Per-field provenance (the SIR pattern carried forward)

Reuse SIR's `Comp.source` + `Comp.fieldConfidence` exactly:

```typescript
interface Comp {
  // existing SIR fields: address, soldPrice, daysOnMarket, saleToListPercent,
  // squareFeet, distanceMiles, soldDate, notes

  // v2-prep fields (already in SIR's type — same shape carries here)
  source?: 'manual' | 'screenshot-ai' | 'imported' | 'idx-feed';
  fieldConfidence?: Partial<Record<keyof Comp, 'high' | 'medium' | 'low'>>;
}
```

The same per-field provenance applies to:

- `neighborhoodFacts[]` — each fact can have `source` + `confidence` once IDX provides them
- `relatedListings[]` — IDX would populate these by proximity in v2; v1 manual

### 6.3 What v1 deliberately DOES NOT build

- No Emolus API client
- No background polling for IDX updates
- No reconciliation logic between agent overrides and feed updates
- No data-source UI affordances (badges, "fed by IDX" indicators)
- No comp-similarity algorithm

All of the above are v2 work, gated on Aaron securing the Emolus API access. Audit's job is to make sure v1's schema doesn't paint v2 into a corner.

### 6.4 V2 integration point sketch (for reference, not v1 scope)

When IDX lands, a single new helper at `src/lib/idx-feed.ts` (or similar) becomes the integration surface:

```typescript
// v2 only — not in v1
async function fetchIdxComps(propertyAddress: string): Promise<Comp[]> { ... }
async function fetchIdxNeighborhoodFacts(propertyAddress: string): Promise<NeighborhoodFact[]> { ... }
```

The wizard's Comps step gets a "Pull from MLS" button; pressed, the button hits the helper, fills `comps[]` with `source: 'idx-feed'` records, and toggles `dataSource` to `idx-feed` (or `mixed` if the agent later overrides). No schema migration.

---

## 7. Skill records

### 7.1 Recommendation: single skill, dual output

```typescript
// src/tools/open-house-prep/skill.ts — Commit 4
export const OPEN_HOUSE_PREP_SKILL: CallableSkill = {
  id: 'open-house-prep',
  name: 'Open House Prep',
  purpose: "Prep your open house — generate an agent-facing prep PDF and a shareable visitor handout from one form.",
  inputs: {
    required: [
      { key: 'propertyAddress', type: 'string', description: 'Property address', source: 'listing-profile' },
      { key: 'listPrice', type: 'string', description: 'List price', source: 'listing-profile' },
      { key: 'eventDate', type: 'date', description: 'Event date (YYYY-MM-DD)', source: 'user-input' },
      { key: 'eventStartTime', type: 'time', description: 'Event start (HH:mm)', source: 'user-input' },
    ],
    optional: [
      // property identity + event logistics + libraries — full list in §5.1
    ],
  },
  outputs: [
    { type: 'agent-facing', format: 'pdf', description: 'Private prep document for the open house', aspectRatio: 'letter' },
    { type: 'client-facing', format: 'url', description: 'Shareable mobile-first visitor handout (texted as a short link)' },
  ],
  costProfile: 'free',
  supportedStates: ['open_house_prep_state', 'open_house_active_state'],
  recommendedNextSkills: ['open-house-promo'],
};
```

### 7.2 The `format: 'url'` enum value already exists

The current `SkillOutputFormat` union (verified in `src/skills/types.ts` from the SIR audit chain):

```typescript
export type SkillOutputFormat =
  | 'pdf' | 'jpeg' | 'png' | 'mp4' | 'html' | 'text' | 'json' | 'url';
```

`'url'` is already present — added in the W-1 Half B impl 1 commit. **No enum extension is required for this audit.** The audit prompt anticipated an enum extension to `'web-url'`; correcting to `'url'` aligns with the existing typed contract. The `description` field carries the "shareable mobile-first visitor handout" semantic clarification.

### 7.3 Why single skill, not two

Considered: split into `open-house-prep-agent` (PDF output) + `open-house-prep-handout` (URL output) and chain them via `recommendedNextSkills`.

Rejected because:

- The form input is single. Splitting forces two skills to either share a draft (cross-skill coupling that violates the per-tool ownership pattern) or duplicate fields (data-entry burden).
- The dashboard surface is cleaner with one card per workflow. Two skills surface as two cards or one card with a confusing dual-CTA.
- SIR established the precedent: one skill, one output. The OH Prep dual-output is a meaningful extension of the `CallableSkill` contract, but the contract already supports `outputs: SkillOutput[]` (plural array) — using that capacity is more aligned than adding two skills.

### 7.4 New workflow states needed

`open_house_prep_state` and `open_house_active_state` do not yet exist in the `WorkflowState` union ([src/skills/types.ts](src/skills/types.ts)). The implementation phase adds them. State detection rules (§8 — dashboard wiring):

- `open_house_prep_state` — `openHousePrep:draft` exists in localStorage AND `eventDate` is in the future, more than 24 hours out
- `open_house_active_state` — `openHousePrep:draft` exists AND `eventDate` is within 24 hours

The existing `open_house_state` (W-1 Half B) continues to drive the marketing-tool workflow card. The new states drive the OH Prep card. State enum extensions are non-breaking additions.

---

## 8. Dashboard wiring

### 8.1 Skill category refactor (the long-deferred fix)

Per the `sep-skill-ship-checklist.md` memory cited in the locked context, this is the natural trigger to fix the dashboard category logic at the architectural root.

**Current state (v1.44.1):** `DashboardClient.tsx`'s `AllSkillsSection` hardcodes per-category filters by skill ID:

```typescript
const sellerPitch = ALL_SKILLS.filter(
  (s) => s.id === 'listing-presentation' || s.id === 'seller-intelligence-report',
);
```

Every new skill needs this file edited. The v1.44.1 hotfix shipped because SIR fell out of the filter; OH Prep would silently drop out the same way without intervention.

**Proposed refactor:**

1. Add `category` field to the `CallableSkill` interface:

```typescript
export type SkillCategory =
  | 'marketing-assets'    // Listing Flyer, Open House Promo
  | 'open-house'          // Open House Prep (this audit's tool)
  | 'seller-pitch'        // Listing Presentation, Seller Intelligence Report
  | 'social-content';     // Social Animator template variants

export interface CallableSkill {
  // existing fields…
  category: SkillCategory;
}
```

`category` is **required**, not optional. Optional would allow new skills to slip in uncategorized; required forces every new skill to declare its bucket explicitly.

2. Annotate every existing `*_SKILL` constant with its category in the same Commit 3 PR:

| Skill | Category |
|---|---|
| `LISTING_FLYER_SKILL` | `'marketing-assets'` |
| `OPEN_HOUSE_PROMO_SKILL` | `'marketing-assets'` |
| `LISTING_PRESENTATION_SKILL` | `'seller-pitch'` |
| `SELLER_INTELLIGENCE_REPORT_SKILL` | `'seller-pitch'` |
| All 10 `SOCIAL_ANIMATOR_*` skills | `'social-content'` |
| `OPEN_HOUSE_PREP_SKILL` (new in Commit 4) | `'open-house'` |

3. Refactor `DashboardClient.tsx`'s `AllSkillsSection` to derive buckets from records:

```typescript
function AllSkillsSection() {
  const byCategory = groupBy(ALL_SKILLS, (s) => s.category);
  return (
    <section>
      <SkillGroup title="Marketing assets" skills={byCategory['marketing-assets'] ?? []} />
      <SkillGroup title="Open house" skills={byCategory['open-house'] ?? []} />
      <SkillGroup title="Seller pitch" skills={byCategory['seller-pitch'] ?? []} />
      <SkillGroup title="Social content" skills={byCategory['social-content'] ?? []} />
    </section>
  );
}
```

The category-label-to-display-title mapping is the only static piece left. Future new categories require adding one `<SkillGroup>` row but no per-skill filter edits.

**Smoke test:** dashboard at the end of Commit 3 renders identically to v1.44.1. The refactor is pure-functional equivalent.

### 8.2 Open House OS workflow card

**Recommendation: supplement, not replace.** Keep the existing Open House (marketing) workflow card from W-1 Half B impl 2; add a new Open House Prep workflow card.

| Workflow card | Primary skill | Trigger states | When it surfaces |
|---|---|---|---|
| Open House (existing) | `open-house-promo` | `open_house_state`, `pre_event_state`, `event_today_state` | OH Promo draft has `eventDate` set |
| Open House Prep (new) | `open-house-prep` | `open_house_prep_state`, `open_house_active_state` | OH Prep draft exists, OR (OH Promo draft has a future `eventDate` AND no OH Prep draft yet) |

The second card's second trigger is the cross-tool nudge: agent has *promoted* the open house; now they need to *prep* for it. Card subtitle: "Your event is in 3 days — time to prep. We'll generate your prep doc (for you) and a shareable visitor handout (for buyers)."

`recommendedNextSkills: ['open-house-promo']` produces a chip after the prep workflow completes — closes the loop back to post-event marketing follow-up if the agent didn't promote first.

### 8.3 Cards surface for the same workflow state set

Both cards trigger on overlapping but distinct state sets. The dashboard's existing priority ordering (`PRIORITY_ORDER` in `workflows.ts`) places them adjacently when both trigger — visually clear they're related but distinct. Add `'open-house-prep'` to the priority order between `'listing-launch'` and `'open-house'` (since prep happens before the event marketing push for ongoing weeks).

---

## 9. Gap analysis

### What exists today

- **`react-pdf`** + browser-side PDF generation (LP, OHP, SIR all use it)
- **Vercel KV** (`@vercel/kv@^3.0.0` + `@upstash/redis@^1.37.0` installed; pattern verified in [src/lib/db.ts](src/lib/db.ts))
- **Next.js 16** routing (dynamic routes, `generateMetadata`, server components for SSR)
- **Tailwind v4** CSS-config (`@theme inline` in [src/app/globals.css](src/app/globals.css))
- **Auth.js** + middleware allowlist pattern (public routes simply omitted from matcher)
- **`CallableSkill`** contract with `'url'` output format already supported
- **SIR pattern** for dual-output spirit (single skill structurally, content-library + per-entry-override + defense-at-boundary clampDraft)
- **`Comp` type with v2-prep fields** (`source`, `fieldConfidence`) — reusable directly

### What is missing (built by implementation Commits 1–6)

| Missing piece | Built in commit | Estimated LOC |
|---|---|---|
| Design tokens + component primitives | Commit 1 (per Audit 1A) | 400–600 |
| Share URL infrastructure (slug gen, KV helpers, `/h/[slug]` route shell, OG metadata) | Commit 2 (per Audit 1B) | 300–500 |
| `category` field on `CallableSkill` + dashboard refactor | Commit 3 | 200–400 |
| OH Prep types + content libraries + wizard skeleton | Commit 4 | 600–900 |
| OH Prep PDF + visitor handout page + full wizard UX | Commit 5 | 1,200–1,800 |
| Dashboard wiring + Playwright tests | Commit 6 | 300–500 |
| **Total** | | **3,000–4,700 LOC** |

### Dependencies: no new packages needed

Verified during 1A and 1B audits:

- `@vercel/kv` — already installed
- `@upstash/redis` — already installed transitively
- `next/og` — built into Next.js 16, no separate `@vercel/og` install needed
- `@react-pdf/renderer` — already installed (LP, OHP, SIR all use)
- `node:crypto` — built into Node runtime (for `randomBytes` in slug generation)

Geist font registration for PDF rendering (Audit 1A D5) is a one-time setup (TTF asset in `/public/fonts/`), not a dependency.

---

## 10. Phased build plan

Six commits across the implementation phase. Each scoped to be independently buildable and testable. Sized to mirror SIR's commit-staging discipline.

### Commit 1 — Design tokens + primitives (per Audit 1A)

**New files:**
- Theme token promotion in [src/app/globals.css](src/app/globals.css) — promote `mint` + `mint-hover` + secondary accents (from D1) + surface/border tokens to `@theme inline` declarations
- `src/lib/pdf-theme.ts` — parallel token system for react-pdf (Audit 1A §6)
- 8 component primitives at `src/components/ui/`: `card.tsx`, `stat-label.tsx`, `display-headline.tsx`, `pill.tsx`, `fab.tsx`, `progress.tsx`, `section-divider.tsx`, `chip.tsx`

**Modified files (if D6 = full codemod):**
- ~40 source files where `bg-[#4ef2d9]` / `text-[#4ef2d9]` / `border-[#4ef2d9]` get replaced with the promoted token classes

**Smoke:** dashboard, SIR, LP, OHP all render identically (the promotion is a pure refactor).
**Estimated:** 400–600 LOC.

### Commit 2 — Web share URL infrastructure (per Audit 1B)

**New files:**
- `src/lib/slug.ts` — 8-char Crockford base32 generator with collision-safe `SET NX` publish
- `src/lib/handout.ts` — `HandoutRecord` type + `kv.get`/`kv.set`/`sadd` helpers
- `src/app/h/[slug]/page.tsx` — route shell with `generateMetadata` + dynamic OG image route
- `src/app/api/og/[slug]/route.ts` — dynamic OG card via Next.js `next/og`

**Smoke:** No tool consumes the route yet; the page returns 404 for any slug since no handouts have been published. Build clean, no test changes.
**Estimated:** 300–500 LOC.

### Commit 3 — Skill category refactor

**Modified files:**
- `src/skills/types.ts` — add `SkillCategory` union + `category` required field on `CallableSkill`
- Each existing `skill.ts` (4 files: listing-flyer, open-house-promo, listing-presentation, seller-intelligence-report) — annotate with `category`
- `src/templates/skills.ts` — annotate all 10 SA skills with `category: 'social-content'`
- `src/app/dashboard/components/DashboardClient.tsx` (or wherever `AllSkillsSection` lives) — refactor hardcoded filters to derive from records

**Smoke:** dashboard renders identically to v1.44.1. The v1.44.1 SIR-visibility regression test (`e2e/seller-intelligence-report.spec.ts` dashboard-discovery test) continues passing.
**Estimated:** 200–400 LOC.

### Commit 4 — OH Prep types + content libraries + wizard skeleton

**New files:**
- `src/tools/open-house-prep/engine/types.ts` — `OpenHousePrepDraft`, `Comp` (or import from SIR), `clampDraft`, `validateForExport`, `MAX_*` constants, `addressSlug`
- `src/tools/open-house-prep/engine/draft-storage.ts` — localStorage at `openHousePrep:draft`
- `src/tools/open-house-prep/skill.ts` — `OPEN_HOUSE_PREP_SKILL` (per §7)
- `src/tools/open-house-prep/content/talking-points.ts` — 8–12 entries
- `src/tools/open-house-prep/content/common-questions.ts` — 12–18 entries grouped by category
- `src/tools/open-house-prep/content/conversion-prompts.ts` — 4–6 entries
- `src/app/open-house-prep/page.tsx` — 5-step wizard skeleton (mirrors SIR Commit 1)

**Modified files:**
- `src/skills/registry.ts` — register `OPEN_HOUSE_PREP_SKILL`

**Aaron content review checkpoint after this commit.** The three content libraries are the highest-leverage content the agent ever sees from this tool. Hand to Aaron for read-through (D13 review timing). v1.45 merge gates on his approval.

**Smoke:** `/open-house-prep` route renders the wizard skeleton; existing tools unchanged.
**Estimated:** 600–900 LOC (most of it the content libraries).

### Commit 5 — OH Prep PDF + visitor handout web page + full wizard UX

**New files:**
- `src/tools/open-house-prep/output/pdf-export.tsx` — react-pdf Document for the agent prep PDF; uses 1A's `pdf-theme.ts`
- `src/tools/open-house-prep/output/HandoutDocument.tsx` — alternate react-pdf Document for the visitor handout's PDF-fallback download
- `src/tools/open-house-prep/components/*` — 5 real step components replacing the skeleton (StepProperty, StepComps, StepNeighborhood, StepTalkingPoints, StepReview — exact naming TBD)
- Visitor handout content components — `Hero`, `WhyThisHome`, `RecentSales`, `Neighborhood`, `MarketContext`, `YourAgent`, `OtherOpenHouses` — server components consumed by `/h/[slug]/page.tsx` when `type === 'open-house'`

**Modified files:**
- `src/app/h/[slug]/page.tsx` — wire the `type === 'open-house'` rendering branch
- `src/lib/handout.ts` — publishing helpers integrated into the StepReview component

**Smoke:** Full workflow end-to-end — fill the wizard, click Publish, get a `/h/[slug]` URL; visit on a phone, content renders; click Download PDF on the handout page, get the visitor-facing PDF; from the wizard, click Download Prep PDF, get the agent-facing PDF.
**Estimated:** 1,200–1,800 LOC (the big one).

### Commit 6 — Dashboard wiring + Playwright tests

**Modified files:**
- `src/app/dashboard/state-detection.ts` — `open_house_prep_state` + `open_house_active_state` detection rules
- `src/app/dashboard/workflows.ts` — Open House Prep workflow card definition (per §8.2)
- `src/skills/types.ts` — add the two new states to `WorkflowState` union

**New files:**
- `e2e/open-house-prep.spec.ts` — file-level Playwright tests (no visual snapshots — SIR convention):
  - wizard renders + advances Next/Previous
  - default-selection logic works (universal talking-points pre-checked)
  - OH Prep dashboard card surfaces when state matches
  - SIR-style "OH Prep visible in All Skills" regression test
  - publish-to-URL flow produces a `/h/[slug]` URL and the visitor page loads

**Aaron final content sign-off before merge.** Same Refinement #7 gate as SIR.

**Smoke:** All 12 existing Playwright tests still pass + 5 new OH Prep tests = 17 total. CI green.
**Estimated:** 300–500 LOC.

### Total estimate

**3,000–4,700 LOC across 6 commits. 3–4 days focused work.** The largest single commit (5) is roughly SIR Commit 2's scope (which shipped at ~1,300 LOC including PDF + step UX).

**Ship target: v1.45.** Merge prompt written after Commit 6 lands, CI is green, and Aaron's content review comes back signed off.

---

## 11. Decisions for Dallen

Numbering continues from Audits 1A (D1–D6) and 1B (D7–D10).

### D11 — Visitor handout section count + order

Audit proposes 7 sections + 1 optional (§3): Hero, Why this home, Recent area sales, Neighborhood at a glance, Market context, Your agent, Other open houses, [optional] Schools & commute. Section order follows Aaron's "valuable things in the front" principle.

**Audit recommendation:** ship the 7+1 as specified. **Dallen approves count, order, or refines.**

### D12 — Content library sizes

Audit proposes:

- Talking points: 8–12 entries, 4 universal pre-selected
- Common questions: 12–18 entries across 5 categories, 5 universal pre-selected
- Conversion prompts: 4–6 entries, 2 universal pre-selected

**Audit recommendation:** ship at the middle of each range (10 / 15 / 5). Total 30 entries. **Dallen approves counts before Aaron's content review begins.**

### D13 — Single skill with dual output vs two separate skills

Audit recommends single skill with two `outputs[]` entries (§7.3). Rejected alternative: split into agent skill + visitor skill chained via `recommendedNextSkills`.

**Audit recommendation:** single skill. **Dallen confirms.**

### D14 — Open House Prep workflow card: supplement or replace existing OH marketing card

Audit recommends supplement (§8.2) — keep marketing card, add prep card. Both surface alongside when triggered.

**Audit recommendation:** supplement. **Dallen confirms.**

### D15 — Skill category enum values

Audit proposes 4 categories (§8.1): `'marketing-assets' | 'open-house' | 'seller-pitch' | 'social-content'`. Question: is `'open-house'` the right category for the prep skill, or does it belong under `'marketing-assets'` alongside the OH Promo tool?

**Audit recommendation:** separate `'open-house'` category. The OH workflow has enough distinct skills (prep + promo + future walking-guide + future follow-up) that bucketing them together is cleaner than splitting prep into seller-pitch and leaving promo in marketing-assets.

**Dallen approves category count + names.**

### D16 — Workflow state names for OH Prep

Audit proposes `open_house_prep_state` (event > 24 hours out) + `open_house_active_state` (within 24 hours of event). Existing `open_house_state` continues to drive the marketing card.

**Audit recommendation:** ship as proposed. **Dallen confirms.**

### D17 — Aaron content review timing

Audit recommends Aaron reviews the three content libraries after Commit 4 (§10 plan). Splitting Aaron's review between Commit 4 (libraries) and Commit 5 (visitor handout copy) is also viable — front-loads risk on the higher-content-density commit but adds a review round.

**Audit recommendation:** single review after Commit 4 covering libraries + section copy specs (the visitor handout's section labels + microcopy are simple enough to bundle).

**Dallen confirms.**

### D19 — Legal-risk language review on content libraries

Three categories in the common-questions library carry above-baseline legal-risk surface:

- **Seller motivation** — agent's fiduciary duty to the seller. Responses must redirect to property facts, not seller circumstances. (See §4.3 seller-privacy constraint.)
- **Commission / buyer-agent framing** — post-NAR-settlement landscape. SIR's Refinement #3 ("soften commission-discount talking point") applies; responses must not state commission as a guarantee or imply buyer-agent representation arrangements that may vary by jurisdiction.
- **HOA / local-ordinance specifics** — rental restrictions, fair-housing rules, lien priorities vary by state. Responses point visitors to the HOA's own disclosures rather than asserting what the rules are.

Cowork drafts the library entries through these constraints; Aaron content review (D17 / Refinement #7) is the primary checkpoint; optional legal-aware reviewer (real estate broker or paralegal) is a secondary check Dallen may want before v1.45 merge.

**Audit recommendation:** Cowork-drafted with these constraints baked in, Aaron review as the merge gate. Legal-aware secondary review is nice-to-have, not blocking. **Dallen confirms whether secondary legal review is required before merge.**

### D18 — Implementation start: go now or refine audits first?

The three audits are complete. The decisions D1–D17 surface explicitly. Cowork can write the Commit 1 implementation prompt now, OR Dallen can request audit refinements first.

**Audit recommendation:** ship Commit 1 (design tokens + primitives — Audit 1A's scope) immediately after D1 (palette pick) and D5 (Geist PDF registration) lock. The other decisions don't block Commit 1.

**Dallen decides start posture.**

---

## Sources

Files read on this branch and referenced by section:

- [docs/OH-Prep-1A-design-language-audit.md](docs/OH-Prep-1A-design-language-audit.md) — landed at `427edd7`, referenced for tokens (§3, §4, §10 throughout) and component primitives (§3, §5 mobile rendering)
- [docs/OH-Prep-1B-share-url-infra-audit.md](docs/OH-Prep-1B-share-url-infra-audit.md) — landed at `561c1d1`, referenced for URL routing (§3 `/h/[slug]`), KV persistence (§5.1, §10 Commit 2), OG metadata (§10 Commit 2), edit-after-publish (§5.3)

Reused from prior session context (SIR audit chain + W-1 Half B):

- [src/tools/seller-intelligence-report/skill.ts](src/tools/seller-intelligence-report/skill.ts) — single-skill `CallableSkill` shape mirrored in §7.1
- [src/tools/seller-intelligence-report/engine/types.ts](src/tools/seller-intelligence-report/engine/types.ts) — `Comp` with `source` + `fieldConfidence` v2-prep fields (§6.2), `clampDraft` + defense-at-boundary pattern (§10 Commit 4 spec)
- [src/tools/seller-intelligence-report/content/objections.ts](src/tools/seller-intelligence-report/content/objections.ts) — content-library structure mirrored in §4.1
- [src/app/dashboard/components/DashboardClient.tsx](src/app/dashboard/components/DashboardClient.tsx) — current hardcoded category filter at `AllSkillsSection` (§8.1)
- [src/app/dashboard/workflows.ts](src/app/dashboard/workflows.ts) — Workflow card pattern, `PRIORITY_ORDER` array (§8.2)
- [src/skills/types.ts](src/skills/types.ts) — `SkillOutputFormat` union; verified `'url'` already present (§7.2)
- [src/lib/db.ts](src/lib/db.ts) — KV usage pattern (§9 gap analysis)

Strategic context embedded in the prompt:

- Aaron 2026-05-17 transcription — primary signal for §1 context, §3 handout structure, §6 IDX framing
- SEP "no AI in v1" guardrail — content libraries are static templates with per-entry override (§4)
- SIR Refinement #7 pattern — Aaron content review gates v1.45 merge (§10 Commit 4 checkpoint)
- SIR Refinements #3, #4, #5 — anti-fabricated-stats, anti-template-bracket, post-NAR-settlement-safe commission language (§4.3 constraints on library content)
