# Seller Intelligence Report — design + implementation audit

**Date:** 2026-05-16
**Branch:** `phase-sir-1-audit` (cut from `671c85e` / v1.43)
**Status:** Investigation-only; audit-first gate per CONTEXT.md §6. No code changes.
**Strategic frame:** The SIR is the first agent-facing skill in the system — closes the dual-output gap that's currently 0-for-4 across existing tools. Highest-value single gap per W-1 Half B audit §4.3 + §6.

---

## TL;DR — what the data says

**The SIR is the dual-output pattern made concrete.** Listing Presentation today is a client-facing PDF — the polished pitch the seller takes home. The SIR is its agent-facing companion: the agent's private one-pager with comp analysis, pre-staged objection responses, a chosen pricing strategy, pre-appointment notes, commitments, and asks. Same upstream inputs (subject property, agent identity, comps), audience-specific downstream content. The architecture mirrors LP exactly — separate draft, separate localStorage key, shared `BrandSettings` + `ListingProfile` inputs, same react-pdf rendering pipeline.

**v1 is template-driven, NOT AI-driven — explicit guardrail.** The temptation with objection talking points and pricing strategies is to "let an LLM generate them per-appointment." That path breaks the Pro tier margin model (variable inference cost), introduces non-determinism (different appointment → different talking points → confusing for the agent), and gates the build behind LLM integration scope that the SIR doesn't need. v1 ships with a curated library: ~10-12 objection categories with sample responses, 4 pricing-strategy frameworks. The agent picks/multi-selects/customizes; the SIR renders. AI orchestration is a Phase 4 add-on, not a Phase 2 dependency.

**Build scope is bounded by the LP precedent.** LP is ~900-1200 LOC end-to-end (types + draft storage + page + form + preview + ExportButtons + PresentationDocument + jpeg-export + skill metadata). The SIR is roughly 1.5x — same architectural shell plus two content library files (objections + pricing strategies, ~300-400 LOC of curated content) plus the SIR-specific draft fields (objection multi-select, pricing strategy radio, commitments/asks lists). Total ~1,400-2,100 LOC across 3-4 commits. Ship target: v1.44.

**Five design decisions made, justified inline below.** Separate draft from LP. Comp data extends LP's `comparableSales` shape with optional notes/sqft/distance/dateSold. White-label content libraries are global in v1 (per-agent customization deferred to v2+). PDF-only output (JPEG deferred — SIR is for the appointment, not for screen-sharing or social distribution). Dashboard surface is Option A: a single Workflow 5 "Win the listing" card with two CTAs side-by-side (LP primary + SIR secondary).

---

## 1. Methodology

Read in full or in relevant sections:

- **Listing Presentation (the architectural mirror):**
  - [src/tools/listing-presentation/engine/types.ts](src/tools/listing-presentation/engine/types.ts) — `PresentationDraft` shape, `clampDraft`, `validateForExport`, caps (MAX_MARKETING_STRATEGIES=4, MAX_AGENT_BIO_LENGTH=280, MAX_WHY_CHOOSE_ME_LENGTH=280, MAX_COMPARABLE_SALES=3)
  - [src/tools/listing-presentation/engine/draft-storage.ts](src/tools/listing-presentation/engine/draft-storage.ts) — localStorage key `listingPresentation:draft`; load/save/clear pattern
  - [src/app/listing-presentation/page.tsx](src/app/listing-presentation/page.tsx) — debounced auto-save (1500ms), `useBrandSettings`, three-component split (`PresentationForm` + `PresentationPreview` + `ExportButtons`)
  - [src/tools/listing-presentation/output/PresentationDocument.tsx](src/tools/listing-presentation/output/PresentationDocument.tsx) — react-pdf Letter portrait, ~664pt body + 32pt footer, empty-section hiding
  - [src/tools/listing-presentation/skill.ts](src/tools/listing-presentation/skill.ts) — CallableSkill record (1 required input + 15 optional, 2 outputs)

- **Shared infrastructure SIR will reuse:**
  - [src/lib/brand.ts](src/lib/brand.ts) — `BrandSettings` (agent identity, contact, license, brokerage, primary/accent/background)
  - [src/lib/listing-profile.ts](src/lib/listing-profile.ts) — `ListingProfile` (heroPhoto + status/address/cityState/price/beds/baths/sqft)
  - [src/skills/types.ts](src/skills/types.ts) — `CallableSkill`, `SkillInputSpec`, `SkillOutput`, `WorkflowState` union
  - [src/skills/registry.ts](src/skills/registry.ts) — `ALL_SKILLS` + helpers (`getSkillById`, `getSkillsForState`, `getRecommendedNextSkills`)
  - [src/app/dashboard/workflows.ts](src/app/dashboard/workflows.ts) — current 4 wired workflows (Listing Launch, Open House, Momentum, Content); confirms Workflow 5 is unwired and is the SIR's entry point
  - [src/app/dashboard/state-detection.ts](src/app/dashboard/state-detection.ts) — `seller_appointment_state` already emitted from `presentationDraft.propertyAddress` (line 55-59); SIR can chain off the same trigger

- **W-1 Half B audit (the strategic frame):**
  - [docs/W-1-architecture-audit.md](docs/W-1-architecture-audit.md) §3 (CallableSkill interface), §4.3 (LP skill — closest reference), §5 Workflow 5 (Seller Win System orchestration), §6 Gap #4 (SIR description)

Excluded:

- **No source-code analysis of the comp-analysis math.** Comps are user-typed; the SIR doesn't compute valuations. (Agent does the thinking; SIR is the presentation surface.)
- **No interview material from Aaron.** Per the 2026-05-14 framing, Aaron declined a deep-dive and asked the team to trust the AI inferences. This audit relies on the W-1 Half B scoping + the dual-output pattern + real-estate domain inference for objection categories and pricing frameworks.

---

## 2. The SIR's purpose + cross-tool relationship to Listing Presentation

The SIR and LP are **two halves of the same workflow** (`seller_appointment_state`):

| Dimension | Listing Presentation | Seller Intelligence Report |
|---|---|---|
| Audience | The seller | The agent (private) |
| Output | 1-page polished pitch document | 1-2 page private prep doc |
| Purpose | Win the listing (what the seller takes home) | Run the appointment (what the agent works from at the table) |
| Format | PDF + JPEG | PDF (JPEG deferred) |
| Content tone | Outward, branded, formal | Internal, operational, conversational |
| Skill output `type` | `client-facing` | `agent-facing` ← first in the system |
| Triggered states | `seller_appointment_state`, `seller_conversion_state`, `pre_listing_state` | Same three |
| Existing today? | Yes (since H-6) | No (this audit specifies it) |

**Shared upstream inputs** (both tools read these):
- `BrandSettings` — agent identity (name, brokerage, phone, license, headshot, logo, colors)
- `ListingProfile` — subject property (address, status, price, beds, baths, sqft)
- Agent-profile-extension fields — `agentBio`, `homesSold`, `averageDaysOnMarket`, `saleToListRatio`, `yearsExperience` (today these live in LP's `PresentationDraft`; section 10 discusses whether to extract them)

**Disjoint downstream content** — content unique to each tool's audience:

| Lives in LP only | Lives in SIR only |
|---|---|
| `marketingStrategies` (4 bullets) | Objection talking-point selections |
| `whyChooseMe` paragraph | Pricing-strategy selection |
| Polished tone, branded chrome | Pre-appointment notes |
| Headshot prominence | Agent's commitments list |
| Seller-name personalization | Agent's asks list |

**Comp analysis is shared in concept but differs in detail.** LP's `comparableSales` array (≤3 entries with address/soldPrice/DOM/saleToListPct) is the public-facing comp summary; SIR's comps field carries the same primary fields plus optional `notes`, `squareFeet`, `distanceMiles`, `dateSold`. Decision §3.b explains why this is two separate fields rather than one shared array.

**The architectural relationship is sibling, not parent-child.** Neither tool depends on the other. Both consume the same upstream profiles. An agent can generate the SIR without ever having generated LP (e.g., prep without the polished version), and vice-versa.

---

## 3. Design decisions made

### 3.a — Separate draft, not shared with LP

**Decision:** SIR has its own draft (`SirDraft`) at localStorage key `sellerIntelligenceReport:draft`, mirroring LP's `listingPresentation:draft`. The two drafts read from the same shared profiles (`ListingProfile`, `BrandSettings`) and may store the same property address — but the property address itself lives in `ListingProfile`, not in the per-tool drafts.

**Rationale:**
- LP's draft contains client-facing-specific fields (`whyChooseMe`, `marketingStrategies`) that SIR has no use for.
- SIR's draft contains agent-facing-specific fields (objection selections, pricing strategy, commitments, asks, pre-appointment notes) that LP must never render.
- Sharing a single draft would force SIR to know about LP's field set and vice-versa — cross-tool coupling that violates the existing 4-tool pattern (each tool owns its own draft; cross-tool data comes from `ListingProfile` + `BrandSettings`).
- Agents may prep multiple appointments in sequence; the SIR's pre-appointment-notes field is per-appointment ephemeral and shouldn't bleed into LP.

**Open question for v2+:** Should there be a "current appointment" object that both drafts hang off? Probably yes — that's how multi-listing context would work. Out of scope for v1.

### 3.b — Comp data: separate field that extends LP's shape

**Decision:** SIR's `comps` field is an `objectArray` (max 4) with primary fields matching LP's `comparableSales` (`address`, `soldPrice`, `daysOnMarket`, `saleToListPercent`) plus optional SIR-only fields (`notes`, `squareFeet`, `distanceMiles`, `dateSold`). The two fields live in their respective drafts.

**Rationale:**
- The comps are about the property (subject-anchored), not about either audience. But the *level of detail per comp* differs:
  - LP shows 3 comps as a clean 3-column card grid — address, price, DOM, ratio. The seller needs the headline; visual clutter undermines the polished tone.
  - SIR shows up to 4 comps as a table with the agent's notes column — "this one is most relevant because..." or "kitchen renovation explains the premium." The agent needs the working notes.
- Cross-tool sync (e.g., type a comp in LP, see it appear in SIR) sounds appealing but introduces a complexity tax — schema drift when the two drafts disagree, conflict resolution on edit, etc. Each tool owning its own comps is the v1 simplification.
- If the duplication becomes painful in practice, a future refactor can extract `ListingProfile.activeComps` as a shared field. Defer.

**Counterargument for unified storage:** Agents will type the same comps in two places. Mitigation in v1: the SIR form is the agent's working surface (they create the comps there first), and LP gets a "Import comps from SIR" button as a v2 enhancement. Or vice-versa. Pick one direction in v2 based on real usage.

### 3.c — White-label content libraries: global in v1, per-agent in v2+

**Decision:** v1 ships with a single global content library (objection categories + pricing strategies, sections §6-7 below). Every agent sees the same list. v2+ may layer per-agent customization on top (mark as favorite, add custom, edit existing).

**Rationale:**
- v1's value is *having* the library, not personalizing it. An agent walking into a listing appointment with a printed sheet of objection responses they can adapt is dramatically more prepared than an agent without.
- Per-agent customization adds storage shape (where do custom entries live? localStorage scales poorly past ~5MB; agent's custom library could push past that), UX surface (CRUD on library entries), and content moderation questions (what if an agent writes legally-risky talking points the system surfaces?).
- The global library is the v1 wedge; personalization is the v2 retention play. Don't conflate.

**Risk:** Agents may want to tweak wording to match their voice. v1 mitigation: each selected talking point renders with the agent's option to edit-before-print in the SIR form (the rendered PDF includes whatever's in the form field at export time, with the library entry as the starting text). Customization happens per-appointment, not persisted to a library — minimal infrastructure, maximum flexibility.

### 3.d — PDF only in v1 (JPEG deferred)

**Decision:** SIR outputs PDF only. JPEG raster export deferred to v2+ if usage data warrants it.

**Rationale:**
- LP's JPEG output exists for camera-roll-friendly distribution (screen-share during virtual appointments, dropping into a presentation deck, etc.). SIR is a print-on-paper or screen-side-by-side prep doc — those flows don't need JPEG.
- Skipping JPEG cuts ~150 LOC ([src/tools/listing-presentation/engine/jpeg-export.ts](src/tools/listing-presentation/engine/jpeg-export.ts) is the precedent) and one snapshot baseline pair (darwin + linux).
- Adding JPEG later is mechanical if needed (LP's pattern is reusable verbatim).

### 3.e — Dashboard surface: single combined card (Option A)

**Decision:** Workflow 5 ("Win the listing") renders as a single dashboard card with two side-by-side CTAs — LP as the primary action ("Generate Listing Presentation →") and SIR as the secondary action ("Generate Seller Intelligence Report →"). Subtitle copy: *"Walk into the appointment with both: the client's pitch document and your private prep doc."*

**Rationale:**
- One card per workflow keeps the dashboard's signal-to-noise ratio high. Two separate cards for one workflow ("LP card" + "SIR card") implies they're independent choices when they're actually complementary.
- The dual-CTA pattern needs a small extension to `NextBestActionCard.tsx` ([src/app/dashboard/components/NextBestActionCard.tsx](src/app/dashboard/components/NextBestActionCard.tsx)) — accept an optional `secondarySkill` prop and render a second button. ~10-15 LOC delta. Phase 1 fallback if implementation runs long: render the card with just the primary skill and add SIR as a `recommendedNextSkills` chip on the existing line.
- Implementation prompt should validate the dual-CTA pattern on this card before generalizing it elsewhere; other workflows might also benefit.

**Alternative considered (rejected):** Separate cards. More dashboard clutter; obscures that they're meant to be used together; doesn't model the dual-output pattern visibly. The pattern itself is a teachable moment for agents — "every workflow has a client side and an agent side" — and a unified card communicates that.

---

## 4. Input shape — CallableSkill metadata draft

The SIR's `skill.ts` record (target: `src/tools/seller-intelligence-report/skill.ts`):

```typescript
import type { CallableSkill } from '@/skills/types';

export const SELLER_INTELLIGENCE_REPORT_SKILL: CallableSkill = {
  id: 'seller-intelligence-report',
  name: 'Seller Intelligence Report',
  purpose: "Generate the agent's private prep document for a listing appointment — comps, objection talking points, pricing strategy, commitments, asks",
  inputs: {
    required: [
      { key: 'propertyAddress', type: 'string', description: 'Subject property address', source: 'listing-profile' },
    ],
    optional: [
      { key: 'propertyCity', type: 'string', description: 'City line', source: 'listing-profile' },
      { key: 'comps', type: 'objectArray', description: 'Comparable sales (<=4) with optional notes/sqft/distance/dateSold', source: 'user-input' },
      { key: 'pricingStrategySelection', type: 'enum', description: 'Selected pricing strategy framework ID', source: 'user-input' },
      { key: 'pricingStrategyNotes', type: 'string', description: "Agent's custom notes appended to the chosen strategy", source: 'user-input' },
      { key: 'objectionSelections', type: 'stringArray', description: 'Library entry IDs (<=5) of objections to print', source: 'user-input' },
      { key: 'objectionCustomResponses', type: 'objectArray', description: 'Per-selection text overrides (so agent can tweak wording at form time)', source: 'user-input' },
      { key: 'preAppointmentNotes', type: 'string', description: "Free-text context the agent wrote before arriving (<=400 chars)", source: 'user-input' },
      { key: 'commitments', type: 'stringArray', description: "What the agent promises if the seller signs (<=5 bullets, <=120 chars each)", source: 'user-input' },
      { key: 'asks', type: 'stringArray', description: 'What the agent needs from the seller (<=5 bullets, <=120 chars each)', source: 'user-input' },
      { key: 'recommendedListPrice', type: 'string', description: "Agent's recommended list price (free-form to allow ranges like '$650K-$675K')", source: 'user-input' },
      { key: 'agentBio', type: 'string', description: 'Agent bio (<=280 chars)', source: 'agent-profile' },
      { key: 'homesSold', type: 'string', description: 'Career homes sold', source: 'agent-profile' },
      { key: 'averageDaysOnMarket', type: 'string', description: 'Average DOM', source: 'agent-profile' },
      { key: 'saleToListRatio', type: 'string', description: 'Sale-to-list ratio', source: 'agent-profile' },
      { key: 'yearsExperience', type: 'string', description: 'Years in business', source: 'agent-profile' },
      { key: 'primaryColor', type: 'colorHex', description: 'Primary brand color override', source: 'agent-profile' },
      { key: 'accentColor', type: 'colorHex', description: 'Accent brand color override', source: 'agent-profile' },
      { key: 'backgroundColor', type: 'colorHex', description: 'Background color override', source: 'agent-profile' },
    ],
  },
  outputs: [
    { type: 'agent-facing', format: 'pdf', description: '1-2 page private prep doc for the listing appointment', aspectRatio: 'letter' },
  ],
  costProfile: 'free',
  supportedStates: ['pre_listing_state', 'seller_appointment_state', 'seller_conversion_state'],
  recommendedNextSkills: ['listing-presentation'],
};
```

**Notes on the record:**

- `propertyAddress` is the only required input (same as LP). `validateForExport` enforces it.
- `pricingStrategySelection` and `objectionSelections` are `enum` / `stringArray` of library-entry IDs (§6-7 define the IDs). The IDs are stable; the rendered text can be edited per-appointment via `objectionCustomResponses` (per §3.c rationale).
- `recommendedListPrice` is intentionally free-form string (not currency-typed) so an agent can write `"$650K-$675K"` or `"~$685,000"` rather than being forced into a single number.
- `outputs[0].type === 'agent-facing'` — **first agent-facing skill in the registry.** Closes the dual-output gap structurally.

---

## 5. Output shape — PDF document structure

Letter portrait, 1-2 pages. Section breakdown:

### Page 1

**Header band (~50pt)** — minimal chrome
- Subject property address (left, prominent: 14pt semibold)
- Listing appointment date (left, below address; 9pt muted)
- Agent name + brokerage (right; 9pt muted) — small because this is the agent's doc; no need for the LP-style branded header band

**Recommended list price (~80pt)** — big number, immediate decision context
- "Recommended list price" eyebrow label (8pt uppercase muted)
- Big number (32pt semibold) — pulls from `recommendedListPrice`
- 1-line rationale (10pt) — pulls from selected pricing strategy's `oneLineRationale` field plus optional `pricingStrategyNotes` appended

**Comp analysis table (~180pt)** — the working surface
- Header row: Address | Sold price | DOM | Ratio | Sq ft | Dist | Notes
- Up to 4 comp rows
- Empty if no comps; hide section entirely (per LP's empty-section-hiding convention)
- Notes column is the SIR-only differentiator — agent's commentary on each comp

**Pricing strategy box (~120pt)** — the chosen framework
- Strategy name (12pt semibold) — e.g. *"Strategic Pricing for Quick Sale"*
- Strategy description (10pt, 2-3 lines) — from the library entry
- 2-3 talking points (10pt bullets) — from the library entry
- Agent's custom notes appended at the bottom if present

### Page 2 (or bottom of Page 1 if it fits)

**Pre-appointment notes box (~60pt)** — agent's context
- Eyebrow: "Pre-appointment notes"
- Free-text body (10pt, italicized) — verbatim from `preAppointmentNotes`
- Hide if empty

**Selected objection talking points (~variable, 25-40pt per selected entry)** — the heart of the prep doc
- Eyebrow: "Likely objections & responses"
- For each selected entry (0-5):
  - Objection (10pt semibold) — e.g. *"Zillow says my home is worth more"*
  - Response (10pt regular, 2-4 lines) — from library OR custom override

**Commitments box (~70pt)**
- Eyebrow: "What I commit to"
- Up to 5 bulleted lines (10pt)
- Hide if empty

**Asks box (~70pt)**
- Eyebrow: "What I need from you"
- Up to 5 bulleted lines (10pt)
- Hide if empty

**Team stats footer (~24pt)** — credibility line
- Single line: `{homesSold} homes sold · {averageDaysOnMarket} avg DOM · {saleToListRatio} sale-to-list · {yearsExperience} years`
- Right-aligned: agent's last name + license # (small, 8pt) — keeps the doc identifiable if it walks out of the office

**Layout sizing math:** Page 1 sections sum ~430pt + 50pt header = ~480pt. Letter is 792pt; ~310pt slack on Page 1. With 5 selected objections (~150pt) + commitments + asks + notes + footer, Page 2 fills naturally. With 0-2 objections everything compresses onto Page 1. Empty-section hiding keeps the doc dense.

**Tone differentiation from LP:** Smaller header (agent doesn't need to be reminded who they are), denser type (it's a working doc, not a polished artifact), notes columns and freeform boxes (it's mutable working surface, not a static pitch).

---

## 6. Content library — Objection talking points

The v1 library. Each entry has: stable ID, category label (the agent-facing objection text), sample response (200-400 chars). Agent multi-selects up to 5 per appointment; selected entries render into the PDF with optional per-appointment text override.

**Implementation target:** `src/tools/seller-intelligence-report/content/objections.ts` exports `OBJECTIONS: ObjectionEntry[]`.

```typescript
export interface ObjectionEntry {
  id: string;       // stable, kebab-case
  category: string; // the objection itself (agent-facing label)
  response: string; // the sample talking point
}
```

The 12 v1 entries:

### 1. `zillow-says-higher`
**Objection:** "Zillow says my home is worth more."
**Response:** "Zestimates run on an algorithm that can't see inside your home, doesn't know your local market, and has an average error of 7-10% in this area. Algorithms also can't see updates, condition, view, lot, or the buyers actually shopping right now. Let me walk you through what comparable homes have actually sold for in the last 90 days — that's the data buyers and their agents are using to make offers."

### 2. `test-higher-price`
**Objection:** "Let's test the market at a higher price first."
**Response:** "I understand the impulse — every seller wants to know they didn't leave money on the table. The data on this is consistent: properties priced 10%+ above comparable sales stay on market 47% longer on average, and after the first two weeks of stale listing days, buyer agents start to assume there's something wrong. The first two weeks are when you get the most traffic and the strongest offers. Pricing to compete in that window typically nets more, not less."

### 3. `neighbor-sold-for`
**Objection:** "My neighbor sold for $X — mine should be the same."
**Response:** "Neighbor comps are a great starting point, and there's almost certainly something useful in that data. But every home has differences — square footage, updates, condition, lot, view, when it sold relative to market conditions. Here's the adjusted comp set for your specific home, with the differences accounted for. That tells us what buyers are actually willing to pay for *this* property."

### 4. `not-in-a-rush`
**Objection:** "We're not in a rush to sell."
**Response:** "That's an advantage if we use it right. Without time pressure, we can price slightly under market to drive multiple offers, then choose the best one — which often isn't the highest dollar. The strongest buyer might be the one with the best financing, the fewest contingencies, or the closing timeline that fits your move. The buyer who waits longest in this market is usually the buyer who pays the most."

### 5. `interviewing-other-agents`
**Objection:** "We want to interview a few agents before deciding."
**Response:** "Of course — this is one of the biggest financial decisions you'll make and you should feel confident in who you choose. Here's what I'd ask each agent: their specific marketing plan for *your* home (not a generic deck), their last 6 months of comparable sales, and how they handle the negotiation phase. I'm confident in my answers to all three. Take your time, and I'll be here when you're ready."

### 6. `whats-your-commission`
**Objection:** "What's your commission?"
**Response:** "Let's talk about what you're getting first. Here's what I do for every listing: [professional photography, drone footage, MLS write-up, social campaign, open house program, buyer-agent outreach, negotiation through close]. That's the value side. Then we can talk about the rate — and I'm happy to walk you through how I structure that and what flexibility exists."

### 7. `can-you-do-less`
**Objection:** "Can you do it for less commission?"
**Response:** "I hear the question — it's a meaningful number. Here's the honest version: when I take a reduced commission, I have less to invest in marketing your home, which usually means fewer eyeballs, fewer offers, and a lower final price. The agents who discount commissions don't typically get sellers the highest *net* proceeds. My goal is to get you the highest net — and that comes from a full marketing push, not a discounted one."

### 8. `why-you-vs-other-agent`
**Objection:** "Why should I list with you instead of [other agent]?"
**Response:** "Two things. First, [team track record / specific local expertise]. Second, [my specific approach to this property type or neighborhood]. But the more honest answer is: this is your largest financial asset, and the question is whether you trust me to handle it. Let me address what would give you that confidence — what do you want to know?"

### 9. `home-is-special`
**Objection:** "Our home is special — comps don't really apply."
**Response:** "I agree that every home has unique qualities, and yours has [specific feature]. But buyers compare your home to alternatives — that's how the market sets prices. The question isn't whether your home is special; it's *how much more* the market will pay for what makes it special. The comp adjustment captures exactly that. Let's look at it."

### 10. `we-can-sell-ourselves`
**Objection:** "We're thinking about selling it ourselves (FSBO)."
**Response:** "It's a fair question, especially with what looks like a strong market. Here's the data: FSBO homes sold for a median of $310K in the last year, vs. $405K for agent-listed homes. That's not coincidence — buyer agents bring the buyers who can afford the most, and most won't write FSBO offers because there's no commission split. I'd rather get you the agent-listed price minus my commission than the FSBO price."

### 11. `wait-for-better-market`
**Objection:** "Maybe we should wait for the market to improve."
**Response:** "It's worth weighing — but waiting cuts both ways. Interest rates affect what buyers can afford month-to-month; if rates climb, your buyer pool shrinks. Inventory matters too: more listings next spring means more competition for your home. The best window is usually when the *combination* of low inventory, your home's condition, and your personal timeline align — and right now, two of those three are working for you. Let me show you what comparable homes are doing this quarter."

### 12. `dual-agency-conflict`
**Objection:** "I heard agents try to dual-agent the deal to double their commission."
**Response:** "I understand the concern — dual agency is legal in this state but can create real conflicts. My standard practice is to refer the buyer to a separate agent inside my brokerage when one of my own contacts shows interest in your home. You get a dedicated advocate; they get fair representation; the commission split is the same to you. Happy to put that commitment in writing as part of the listing agreement."

**Notes:**

- 12 entries chosen as the v1 floor. Smaller and the agent's options feel thin; larger and the form becomes a wall of checkboxes. ~10-12 is the right scope.
- Each response is ~250-400 chars (`~3-5 lines at 10pt`). Sized to fit 5 selected entries on Page 2 without overflow.
- Library is intentionally generic (no team-specific stats, no jurisdiction-specific legal claims) — every claim is broadly true across US real estate markets. The agent's per-appointment edits localize.
- Hard claims to verify before shipping: the 47% longer-on-market statistic (#2), the 7-10% Zestimate error (#1), the $310K FSBO vs $405K agent-listed median (#10). These are NAR-published or similar industry-source numbers; implementation prompt verifies and updates with citations or removes claims that don't hold up.

---

## 7. Content library — Pricing strategy frameworks

The v1 library. Each framework: stable ID, name, one-line rationale (used in the big-number block), description (2-3 sentences), 2-3 talking points, best-fit scenarios.

**Implementation target:** `src/tools/seller-intelligence-report/content/pricing-strategies.ts` exports `PRICING_STRATEGIES: PricingStrategyEntry[]`.

```typescript
export interface PricingStrategyEntry {
  id: string;
  name: string;
  oneLineRationale: string;
  description: string;
  talkingPoints: string[];   // 2-3 bullets
  bestFit: string;           // 1 line: "Best when..."
}
```

The 4 v1 frameworks:

### 1. `strategic-quick-sale`
**Name:** Strategic Pricing for Quick Sale
**One-line rationale:** *"Price 2-3% under comparable sales to drive multiple offers within the first 7-14 days."*
**Description:** Price below the market median to create urgency and competition. The goal is to attract multiple buyers in the first two weeks — the highest-traffic window of any listing — and let them compete each other up. Typically nets at or above market value through bidding.
**Talking points:**
- *"The first two weeks of a listing are when you get the most traffic and the strongest buyers. Pricing slightly under market is how we maximize that window."*
- *"Multiple offers don't just push the price up; they give us leverage on terms — cleaner offers, faster closes, fewer contingencies."*
- *"The risk of *under*-pricing in a competitive market is minimal; buyers self-correct upward via competition."*
**Best fit:** Best when the market is active, comps are clean, and the seller's timeline allows for a 14-day buyer-attraction window.

### 2. `market-aligned`
**Name:** Market-Aligned Pricing
**One-line rationale:** *"Price at the median of the most relevant recent comparable sales."*
**Description:** Price at parity with the market. No discount-driven competition, no premium-priced friction. The home transacts in a predictable timeframe (typically the local market average DOM) at fair-market terms. The safest strategy when comps are tight and the seller's risk tolerance is low.
**Talking points:**
- *"This is the no-surprise option. The home sells in a predictable timeframe at a price the market supports."*
- *"You avoid the volatility of either extreme — no risk of overpricing-stale, no need to count on a bidding war."*
- *"Works well when the comps are tight and the home doesn't have a single dominant differentiator pushing it up or down."*
**Best fit:** Best when comps are consistent (low variance), the home is "typical for the area," and the seller's preference is predictability over upside.

### 3. `premium-positioning`
**Name:** Premium Positioning
**One-line rationale:** *"Price 3-5% above comparable sales based on a specific, defensible differentiator."*
**Description:** Price above market because the home has a specific differentiator — recent renovation, view, lot, school district, condition — that justifies the premium. Requires a clearly articulated "why this home is worth more" story for buyer agents. Marketing must lead with the differentiator.
**Talking points:**
- *"This works only when we can name *exactly* what makes the home worth more — and back it with comparable evidence."*
- *"The marketing needs to lead with the differentiator. Buyer agents have to understand the premium before they bring buyers to the door."*
- *"Risk factor: if the differentiator doesn't resonate with the buyer pool, we'll know within 14-21 days from traffic patterns and need to adjust."*
**Best fit:** Best when the home has a clearly identifiable, evidence-backed differentiator (recent kitchen reno, premium view, oversize lot, exceptional condition) and the local buyer pool values it.

### 4. `test-then-adjust`
**Name:** Test the Market (with a 10-14 day adjustment window)
**One-line rationale:** *"Price 5-10% above comps with a pre-agreed adjustment date if buyer traffic is light."*
**Description:** Price aggressively above market for a defined test window. If traffic and offers materialize, the seller captures the upside. If they don't, the listing is repriced down within 10-14 days to avoid the "stale listing" penalty. Highest variance strategy; requires seller buy-in on the adjustment date upfront.
**Talking points:**
- *"This is the upside strategy. We test whether the market will support the higher price during the window when listings get the most attention."*
- *"The 10-14 day adjustment date is non-negotiable for me — staying overpriced past two weeks is what kills sale prices."*
- *"The risk is real: if we have to reduce, the first reduction signals weakness to buyer agents and can drag the final price below where market-aligned pricing would have landed."*
**Best fit:** Best when the seller has flexibility on timeline, accepts the downside risk of a reduction, and the market has shown willingness to pay premiums recently.

**Notes:**

- 4 frameworks chosen as the v1 floor — covers the spectrum from below-market to aggressively-above. Adding more dilutes the choice; fewer leaves the agent without a "test the market" option that many sellers will request anyway.
- Each framework's risk language is intentionally honest. The SIR is the agent's doc, not marketing copy; sugarcoating reduces its value.
- `recommendedListPrice` (free-form string in the draft) is independent of the strategy selection — the agent can pick "Premium Positioning" and write a specific dollar amount (or range). Strategy informs the *why*; price field carries the *what*.

---

## 8. SIR-specific draft fields

Full draft shape for `src/tools/seller-intelligence-report/engine/types.ts`:

```typescript
export interface Comp {
  address: string;
  soldPrice: string;
  daysOnMarket: string;
  saleToListPercent: string;
  squareFeet: string;     // optional, freeform string
  distanceMiles: string;  // optional, freeform string (e.g. "0.3", "<1")
  dateSold: string;       // optional, freeform string (e.g. "2026-04" or "April 2026")
  notes: string;          // agent's commentary on this comp
}

export interface ObjectionCustomResponse {
  /** Library entry ID being overridden (must match an entry in OBJECTIONS). */
  id: string;
  /** Agent's per-appointment edit. Empty string falls through to library default. */
  responseOverride: string;
}

export interface SirDraft {
  // Subject property — keyed off ListingProfile; persisted in draft as override
  propertyAddress: string;
  propertyCity: string;

  // Pricing
  recommendedListPrice: string;
  pricingStrategySelection: string;  // PricingStrategyEntry.id; empty = no selection
  pricingStrategyNotes: string;      // agent's custom notes appended to the strategy box

  // Comps
  comps: Comp[];  // <=4

  // Objections
  objectionSelections: string[];                       // <=5 library entry IDs
  objectionCustomResponses: ObjectionCustomResponse[]; // per-selection overrides

  // Pre-appointment + commitments + asks
  preAppointmentNotes: string;  // <=400 chars
  commitments: string[];        // <=5 entries, <=120 chars each
  asks: string[];               // <=5 entries, <=120 chars each

  // Color overrides (same pattern as other tools)
  primaryColor: string;
  accentColor: string;
  backgroundColor: string;
}

export const MAX_COMPS = 4;
export const MAX_OBJECTION_SELECTIONS = 5;
export const MAX_PRE_APPOINTMENT_NOTES = 400;
export const MAX_COMMITMENTS = 5;
export const MAX_ASKS = 5;
export const MAX_COMMITMENT_LENGTH = 120;
export const MAX_ASK_LENGTH = 120;
```

`clampDraft` follows the LP precedent (drop unknown fields, truncate over-length strings, slice over-cap arrays, fall back to defaults). `validateForExport` requires `propertyAddress` non-empty (same as LP).

---

## 9. Workflow 5 dashboard integration

**Current state:** Workflow 5 (Seller Win System) is *not* wired in [src/app/dashboard/workflows.ts](src/app/dashboard/workflows.ts) (only Workflows 1, 2, 4, 6 are wired per W-1 Half B impl 2). State detection at [src/app/dashboard/state-detection.ts](src/app/dashboard/state-detection.ts) already emits `seller_appointment_state` when `presentationDraft.propertyAddress` is set (lines 55-59). The SIR launch adds Workflow 5 to the workflows array.

**New Workflow 5 entry (per §3.e Option A):**

```typescript
{
  id: 'seller-win',
  name: 'Win the listing',
  emotionalDriver: "Walk into the appointment with both: the client's pitch document and your private prep doc.",
  triggerStates: ['pre_listing_state', 'seller_appointment_state', 'seller_conversion_state'],
  primarySkillId: 'listing-presentation',
  secondarySkillId: 'seller-intelligence-report',  // NEW field — requires NextBestActionCard extension
},
```

**State trigger augmentation:** `seller_appointment_state` should fire when EITHER `presentationDraft.propertyAddress` OR `sirDraft.propertyAddress` is set. Add the SIR draft read to `state-detection.ts`:

```typescript
// Already exists:
const presentationDraft = readJson<{ propertyAddress?: string }>('listingPresentation:draft');
if (presentationDraft?.propertyAddress) active.push('seller_appointment_state');

// Add:
const sirDraft = readJson<{ propertyAddress?: string }>('sellerIntelligenceReport:draft');
if (sirDraft?.propertyAddress) {
  if (!active.includes('seller_appointment_state')) {
    active.push('seller_appointment_state');
  }
}
```

**Component extension:** `NextBestActionCard.tsx` accepts an optional `secondarySkill: CallableSkill` prop. When present, render a second CTA button to the right of the primary one. Subtitle copy lives on the Workflow record. Estimated delta: ~15-25 LOC in the component.

**Priority placement:** Insert `seller-win` into `PRIORITY_ORDER` in workflows.ts between `listing-launch` and `momentum`. Rationale: seller pitching is a launch-precursor (you win the listing before you launch it), so a triggered Workflow 5 card sits naturally above Workflows 4 and 6.

---

## 10. White-label flexibility — what's in v1 vs deferred

The OS framework is white-label for solo agents through teams. v1 of the SIR ships intentionally generic; per-agent customization is deferred. Decisions:

**Solo new agent (Overwhelmed New Agent archetype):**
- Library content is the value-add — they don't yet have personal objection responses or pricing frameworks.
- The "global library, no customization" v1 design fits this archetype perfectly.

**Solo experienced agent (Busy Mid-Level Producer archetype):**
- Will want to tweak library content to match their voice. v1 supports per-appointment text overrides (the `objectionCustomResponses` field) — adequate.
- May want to add custom objection categories not in the library. Defer to v2.

**Team / luxury / specialty agent (Operator / Team Leader archetype):**
- May want team-specific stats baked into the pricing strategy responses ("our team has X track record on this strategy").
- May want jurisdiction-specific objection responses (state-specific legal language).
- Both deferred. v1 mitigation: the agent can edit any field at form time before exporting.

**Things v1 deliberately doesn't ship:**

- **Per-agent library customization** — adds storage shape + UX surface (CRUD on library entries). Defer to v2 after measuring whether agents request it.
- **Library versioning** — if global library updates change shipped wording, agents printing the SIR later see the updated version. Acceptable for v1 (the SIR is an immediate-use doc, not an archive).
- **Multi-jurisdiction variants** — claims like "dual agency is legal in this state" hardcode a national assumption. Mitigation: per-appointment edits.
- **Per-agent objection libraries** — a luxury team might want 30 categories; a new agent wants 8. v1 ships 12 universally.

**Implication for content design:** v1 entries must be broadly applicable. Avoid claims that are state-specific, market-cycle-specific (e.g., "interest rates are currently low" — they may not be in 6 months), or team-stat-specific.

---

## 11. Guardrail: NO AI in v1

**The temptation:** objection talking points and pricing strategy summaries look like "perfect LLM use cases." Just feed in the property + seller objection → get back a custom response.

**Why v1 explicitly does not do this:**

1. **Cost-model break.** AI inference per invocation makes the SIR a `variable-ai` cost-profile skill, not `free`. The Pro tier ($79) margin assumes browser-side compute; introducing per-invocation AI cost requires re-pricing the tier OR eating the margin. Neither is desirable in v1.

2. **Non-determinism harms the use case.** The SIR is consulted at the appointment. If the agent prints it Monday and re-prints it Wednesday for the same property, the two versions diverging by a few percent of LLM token sampling is *confusing*, not helpful. Template-driven content is identical run-to-run; the agent's edits are the only variance.

3. **Scope creep.** "Just add LLM calls" hides three new build categories: prompt engineering, output validation/safety checks, fallback handling when the LLM fails or rate-limits. None are SIR-specific work; all are required if the SIR depends on AI. v1 deliberately skips them.

4. **Wedge value is the library itself.** Aaron's framing — "agents will use the shit out of that" — is about *having* the structured library, not about novel content per appointment. Phase 4's AI orchestration is a *layer* on top of the library (e.g., "given this property and these agent stats, here are the 3 objections most likely to come up"), not a *replacement* for it.

**What CAN'T appear in v1 source code:**

- Calls to any LLM API (OpenAI, Anthropic, etc.)
- Server-side endpoints that take property/agent data and return generated text
- Any package dependency that signals LLM use (`openai`, `@anthropic-ai/sdk`, `langchain`, etc.)
- "Generate response" buttons in the SIR form
- Streaming-text UI patterns that imply AI generation

**What CAN appear in v1 source code:**

- The 12 objection entries as static TypeScript constants in `content/objections.ts`
- The 4 pricing strategy entries as static TypeScript constants in `content/pricing-strategies.ts`
- Multi-select UI for the agent to pick entries
- Per-entry text override fields for the agent to customize wording at form time
- Standard react-pdf rendering of the selected content

**When AI becomes appropriate (Phase 4, separate prompt + audit):**

- Suggesting which objections are most likely given the property + seller context (recommendation, not generation)
- Drafting first-pass per-appointment edits the agent can accept or reject (assist, not autopilot)
- Generating commitment / ask suggestions based on the agent's track record + the seller's stated concerns (when context exists to ground them)

Until that's separately scoped and approved, the SIR is template-driven.

---

## 12. Implementation sequence

**Recommended build sequence — 4 commits across 1 branch (`phase-sir-1-impl`):**

### Commit 1 — Skeleton + content libraries + skill metadata + draft scaffold

Files added:
- `src/tools/seller-intelligence-report/engine/types.ts` — `SirDraft`, `Comp`, `ObjectionCustomResponse`, `clampDraft`, `validateForExport`, `addressSlug`, MAX constants
- `src/tools/seller-intelligence-report/engine/draft-storage.ts` — localStorage at `sellerIntelligenceReport:draft`; `loadDraft`/`saveDraft`/`clearDraft` (LP precedent)
- `src/tools/seller-intelligence-report/skill.ts` — `SELLER_INTELLIGENCE_REPORT_SKILL` (§4)
- `src/tools/seller-intelligence-report/content/objections.ts` — `OBJECTIONS: ObjectionEntry[]` with the 12 entries from §6
- `src/tools/seller-intelligence-report/content/pricing-strategies.ts` — `PRICING_STRATEGIES: PricingStrategyEntry[]` with the 4 frameworks from §7

Files modified:
- `src/skills/registry.ts` — add `SELLER_INTELLIGENCE_REPORT_SKILL` to `ALL_SKILLS`

No UI yet, no PDF rendering yet. Verify with `npm run build` + the 16-test fast Playwright suite (no behavior change).

Estimated LOC: ~500-700.

### Commit 2 — Form + page route + PDF render

Files added:
- `src/app/seller-intelligence-report/page.tsx` — page entry with auto-save (LP precedent: 1500ms debounce, hydration guard)
- `src/app/seller-intelligence-report/SirForm.tsx` — form component (sections: subject property, recommended price + strategy radio, comps grid, objection multi-select + override fields, pre-appointment notes, commitments, asks)
- `src/app/seller-intelligence-report/SirPreview.tsx` — live preview (optional but matches LP pattern)
- `src/app/seller-intelligence-report/ExportButtons.tsx` — single "Export PDF" button
- `src/tools/seller-intelligence-report/output/SirDocument.tsx` — react-pdf document per §5 layout
- `src/tools/seller-intelligence-report/output/pdf-export.tsx` — `exportSirPdf` (downloads PDF; LP precedent)

Files modified: none.

After this commit, `/seller-intelligence-report` is a working page: agent fills the form, clicks Export PDF, downloads the agent-facing prep doc.

Estimated LOC: ~600-900.

### Commit 3 — Dashboard integration + tests + visual snapshot

Files modified:
- `src/app/dashboard/workflows.ts` — add Workflow 5 entry (§9); add `secondarySkillId?: string` field to the `Workflow` interface
- `src/app/dashboard/state-detection.ts` — also read `sellerIntelligenceReport:draft` for `seller_appointment_state` trigger (§9)
- `src/app/dashboard/components/NextBestActionCard.tsx` — accept optional `secondarySkill` prop; render second CTA button when present
- `src/app/dashboard/DashboardClient.tsx` — pass secondary skill into the card render

Files added:
- `e2e/seller-intelligence-report.spec.ts` — 3 tests:
  - empty state (no draft → form renders with empty defaults)
  - populated draft renders PDF (seed brand + listing profile + minimal SIR draft → Export PDF downloads valid PDF with size + magic bytes + visual snapshot of page 1)
  - dashboard surfaces the Win the listing card with dual CTAs when LP or SIR draft is populated
- Snapshot baseline file: `e2e/seller-intelligence-report.spec.ts-snapshots/sir-pdf-page-1-chromium-darwin.png` (created via `--update-snapshots`)

Estimated LOC: ~300-500 + 1 snapshot file (~1MB).

### Commit 4 — Linux baseline bootstrap

Mechanical follow-up after the first CI run fails on the Linux snapshot. Same shape as W-2 and W-3.3 bootstraps:
- Download playwright-report artifact from the CI run
- Extract `sir-pdf-page-1-actual.png`
- Rename to `sir-pdf-page-1-chromium-linux.png`
- Commit + push

Estimated LOC: 0 (binary snapshot only).

### Total scope estimate

- Code: ~1,400-2,100 LOC across 3 implementation commits
- Tests: 3 new e2e tests
- Snapshots: 2 PNGs (1 darwin + 1 linux)
- Branch: `phase-sir-1-impl`
- Ship target: **v1.44**

At the H-7 / W-3 cadence, this is 2-3 weeks of intermittent work.

---

## 13. Test strategy

**File-level smoke tests:** All 3 new tests are file-level (size, magic bytes, suggested filename) plus one visual snapshot on PDF Page 1. No video tests (SIR doesn't produce video). No PDF Page 2 snapshot in v1 (page count varies with content length; deterministic snapshot of Page 2 requires fixing input set, which makes the test brittle to future content changes).

**Visual snapshot scope:** Page 1 only. Page 1 is deterministic-shape given seeded inputs (subject property, recommended price, comps, pricing strategy). Page 2 varies with the number of selected objections and the lengths of commitments/asks — a brittle target.

**Snapshot inputs to seed:**
- `BrandSettings` — `seedBrandProfile` from existing fixtures
- `ListingProfile` — `seedListingProfile` from existing fixtures (subject property)
- `SirDraft` — new `seedSirDraft` helper in `e2e/fixtures/seed-helpers.ts` that writes a fully-populated `sellerIntelligenceReport:draft` (4 comps, "Strategic Pricing for Quick Sale" strategy, 3 objection selections, sample commitments/asks)

**Tolerances:** `threshold: 0.2, maxDiffPixelRatio: 0.05` (LP precedent).

**Dashboard test for the dual-CTA card:**
- Seed brand + LP draft → assert "Win the listing" card visible with both CTAs ("Generate Listing Presentation →" + "Generate Seller Intelligence Report →")
- Verify both CTAs link to the correct tool routes

**Existing test impact:** Zero. The 16 existing tests continue passing unchanged.

---

## 14. Risks and unknowns

### Risks the audit identifies

- **Content library accuracy.** The 12 objection entries cite statistics ("47% longer on market," "$310K vs $405K FSBO median"). These come from broadly-published industry sources (NAR, Zillow research) but the implementation prompt MUST verify and add citation footnotes (or remove the specific number and keep the directional claim). Shipping inaccurate-but-confident-sounding stats damages agent trust if challenged.
- **Empty-section hiding can produce sparse-looking output.** If an agent uses the SIR for a quick prep with only 2 comps, no objections selected, no commitments/asks — the PDF might be visually thin. Mitigation: default `EMPTY_DRAFT` includes 2-3 commitment placeholders that prompt the agent ("Professional photography + drone footage", "Weekly status calls", "Negotiation through close").
- **Per-appointment text overrides could overflow Page 2.** If an agent expands a 250-char library response into a 600-char custom response, Page 2 may push to Page 3. Mitigation: enforce a 500-char cap on `objectionCustomResponses[].responseOverride`; explicit form-level character counter.
- **Dual-CTA pattern in `NextBestActionCard`.** Adding a second CTA changes the card's visual rhythm; may need a layout tweak (stack vertically on mobile, side-by-side on desktop). Implementation prompt should design + validate the responsive behavior before generalizing the pattern.

### Unknowns the audit cannot answer

- **Will agents actually customize the library text?** v1 assumes yes (the per-appointment override is the safety valve). If usage shows ~zero customization, the override field is dead UI we should remove. Measure in v1.5.
- **Should the SIR feature a "comp adjustment calculator"?** Several objection responses reference "adjusted comps" — the math the agent does to normalize comps to the subject property. Building a real calculator (subject sqft / comp sqft × comp price, etc.) is out of v1 scope and probably overkill (most agents do this in their head or in a spreadsheet). Defer; revisit if agents request it.
- **Multi-listing context.** What if an agent is prepping 3 listing appointments in the same week? SIR draft is single — they'd overwrite the previous one. Same problem as LP and OH Promo have today. The OS framework eventually solves this via per-listing context (audit §10 in W-1 Half B). Defer to whenever that lands.
- **Will agents print the SIR or screen-share it?** v1 assumes print-on-paper as the primary use. If agents primarily screen-share, JPEG export and a screen-friendly layout (less dense, no print margins) becomes a real ask. Measure in v1.5.

---

## Sources

Files read in full:
- [src/tools/listing-presentation/engine/draft-storage.ts](src/tools/listing-presentation/engine/draft-storage.ts)
- [src/tools/listing-presentation/skill.ts](src/tools/listing-presentation/skill.ts)

Files read in part:
- [src/app/listing-presentation/page.tsx](src/app/listing-presentation/page.tsx) (first 80 lines for the page-shell pattern)
- [src/tools/listing-presentation/output/PresentationDocument.tsx](src/tools/listing-presentation/output/PresentationDocument.tsx) (first 80 lines for the react-pdf layout pattern + section sizing math)
- [src/app/dashboard/workflows.ts](src/app/dashboard/workflows.ts) (grep for `seller`/`presentation`/`listing-presentation` to confirm Workflow 5 is unwired)
- [src/app/dashboard/state-detection.ts](src/app/dashboard/state-detection.ts) (grep for same to confirm `seller_appointment_state` is already emitted from LP draft)

Reused from W-1 Half B audit context (already in conversation memory):
- `PresentationDraft` shape and clamp logic ([src/tools/listing-presentation/engine/types.ts](src/tools/listing-presentation/engine/types.ts))
- `BrandSettings` ([src/lib/brand.ts](src/lib/brand.ts)) and `ListingProfile` ([src/lib/listing-profile.ts](src/lib/listing-profile.ts)) shapes
- `CallableSkill` interface ([src/skills/types.ts](src/skills/types.ts)) and `ALL_SKILLS` registry ([src/skills/registry.ts](src/skills/registry.ts))

Strategic context embedded in the prompt (not derived from code):
- W-1 Half B audit § 4.3 (LP skill record), § 5 (Workflow 5: Seller Win System), § 6 (Gap #4: SIR is the highest-value single dual-output gap)
- Aaron Thomas's 2026-05-14 framing: trust AI inference for white-label engineering; SIR is "use the shit out of that" valuable
- The dual-output pattern (client-facing + agent-facing) — SIR is the canonical first example
- The no-AI-in-v1 guardrail from the W-1 Half B subagent review
- The 4-phase build approach (rule-based → behavior-aware → event-aware → AI-orchestrated)
