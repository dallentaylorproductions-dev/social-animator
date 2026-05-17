# W-1 Half B — Callable-skill architecture audit

**Date:** 2026-05-16
**Branch:** `phase-w1-b-architecture-audit` (cut from `99809a6` / v1.42)
**Status:** Investigation-only; audit-first gate per CONTEXT.md §6. No code changes.
**Strategic frame:** Studio SEP as state-aware workflow OS for real estate agents (formalized 2026-05-14). The 4 existing tools become callable skills the OS routes to; AI is glue at Phase 4, not the product.

---

## TL;DR — what the data says

**The codebase is already 60% of the way to a skill architecture without naming it that.** Every tool today is a stateless transformer: localStorage-backed draft in, browser-rendered artifact out, zero server compute, zero AI. Three tools (Listing Flyer, Open House Promo, Listing Presentation) share an identical clamping/validation/export pattern (`clampDraft` + `validateForExport` + `addressSlug` + per-tool `output/*`). The 4th tool (Social Animator) is structurally different — it's a *renderer over 10 templates* with a shared editor and a separate MP4 entry point — but its internal skill *is* the renderer; the 10 templates are configuration for it.

**The dual-output pattern (client-facing + agent-facing) is currently 0-for-4.** Every output the system produces today is client-facing: PDF flyers, JPEG social images, MP4 reels, QR PNGs, listing presentations. Zero agent-facing companion artifacts exist (no "walking guide," no "talking points," no "launch coordination checklist"). This is the largest single gap between today's tool collection and the OS framing. Closing it does not require new infrastructure — the same react-pdf + canvas pipeline can produce agent-facing artifacts; what's missing is the *content*, not the *engine*.

**The skill contract that fits the actual code is narrow.** Every tool reduces to: `{required inputs, optional inputs, list of outputs (each typed client-vs-agent + format), cost profile, supported states, recommended next skills}`. No tool currently needs more than that. The contract can ship as a typed metadata declaration co-located with each tool (`src/tools/<tool>/skill.ts`) with zero behavior change — pure metadata that a future OS dashboard reads. This is the Phase 1 "smallest useful step."

**Phase 1 is achievable as a small, low-risk refactor.** Concretely: add a `CallableSkill` record next to each of the 4 tools (4 small files), build a dashboard route that reads them and renders "next best action" cards using hardcoded rule-based state detection (one new page, ~300 LOC), wire 2-3 of the 7 workflows end-to-end (the highest-priority ones per team hypothesis: Listing Launch, Momentum, Content). Phases 2-4 fall out incrementally on top of this base. No AI is required until Phase 4.

**The team's priority hypothesis (Listing Launch > Momentum > Content > Authority > Open House > Showing > Seller) matches what the codebase can support today.** Workflows 1 (Listing Launch), 4 (Momentum/Follow-up), 6 (Content), and 2 (Open House) all map to existing tools with no new skills required. Workflows 3 (Buyer Tour), 5 (Seller Conversion), and 7 (Authority) have meaningful skill gaps and need new build work before they're orchestratable. **Recommendation:** ship Phase 1 with the 4 workflows the existing tools support, then build new skills for the remaining 3 in Phase 2-3.

---

## 1. Methodology

Read in full or in relevant sections:

- **Engine types** — [src/tools/listing-flyer/engine/types.ts](src/tools/listing-flyer/engine/types.ts) (full), [src/tools/open-house-promo/engine/types.ts](src/tools/open-house-promo/engine/types.ts) (full), [src/tools/listing-presentation/engine/types.ts](src/tools/listing-presentation/engine/types.ts) (full), [src/templates/types.ts](src/templates/types.ts) (full)
- **Cross-tool composition** — [src/tools/listing-flyer/engine/template-mapping.ts](src/tools/listing-flyer/engine/template-mapping.ts) (full) — the LF → SA `listing-showcase` translator, the only existing cross-tool composition in the codebase
- **Shared profiles** — [src/lib/brand.ts](src/lib/brand.ts) (full, BrandSettings + `useBrandSettings`), [src/lib/listing-profile.ts](src/lib/listing-profile.ts) (full, ListingProfile + `useListingProfile`)
- **Template surface** — [src/templates/index.ts](src/templates/index.ts) (all 10 template exports), [src/templates/listing-showcase.ts](src/templates/listing-showcase.ts) (first 80 lines for the dual-use template)
- **Social Animator editor wiring** — [src/components/TemplateEditor.tsx](src/components/TemplateEditor.tsx) (lines 40-100 for LISTING_CONSUMER_TEMPLATE_IDS pattern), [src/components/ExportButton.tsx](src/components/ExportButton.tsx) (lines 1-60 for the separate MP4 entry point)
- **Engine directory survey** — `ls src/tools/*/engine/ src/tools/*/output/` for each tool to confirm the output surface
- **Prior audit format reference** — [docs/W-3-mp4-pipeline-consolidation-audit.md](docs/W-3-mp4-pipeline-consolidation-audit.md) for the audit doc convention used by this repo

Excluded from this audit:

- **Internal renderer details** (react-pdf templates, canvas paint code, timeline construction) — those are implementation details below the skill contract. The contract treats each tool as a black box that consumes typed inputs and produces typed outputs.
- **Auth / subscription / Stripe wiring** ([src/lib/auth.ts](src/lib/auth.ts), [src/lib/subscription.ts](src/lib/subscription.ts), [src/lib/stripe.ts](src/lib/stripe.ts)) — the OS framing has tier implications, but the skill contract itself is tier-agnostic. Skills declare cost profile; the dashboard decides which skills a given tier can invoke.
- **Test infrastructure** — irrelevant to the skill contract.

---

## 2. Existing tools — current natural skill shape

### 2.1 Listing Flyer (current state)

**Inputs (required):** propertyAddress (`addressLine1`), price, photos (≥1)
**Inputs (used but not required-validated):** status (defaults to "Just Listed"), beds, baths, sqft, feature bullets (0-5), addressLine2 (city/state line)
**Inputs (per-tool color overrides):** primaryColor, accentColor, backgroundColor (each empty-string-falls-through-to-brand)
**Inputs (MP4-specific):** duration (5-15s slider, default 8), exportFormats (`reel` and/or `square`, default reel-only)
**Inputs (from shared profile):** BrandSettings (`agentName`, `brokerage`, `contactPhone`, `contactEmail`, `licenseNumber`, `logoDataUrl`, color defaults)

**Validation gate:** [`validateForExport`](src/tools/listing-flyer/engine/types.ts#L123-L131) — requires address + price + ≥1 photo. Returns null on success or a string naming the first missing field.

**Outputs produced (all client-facing):**
- PDF — print-ready 1-page flyer via react-pdf ([src/tools/listing-flyer/output/pdf-export.tsx](src/tools/listing-flyer/output/pdf-export.tsx))
- JPEG — camera-roll-friendly raster of the PDF page 1 at 3x scale, q=0.92 ([src/tools/listing-flyer/engine/jpeg-export.ts](src/tools/listing-flyer/engine/jpeg-export.ts))
- MP4 reel — 1080×1920 vertical, duration matches slider, post-W-3 via MediaRecorder→ffmpeg ([src/tools/listing-flyer/engine/render-mp4.ts](src/tools/listing-flyer/engine/render-mp4.ts))
- MP4 square — 1080×1080, same pipeline as reel

**Cost profile:** Free. All four outputs are browser-side renders; zero server cost; zero AI inference.

**Workflow states supported (inferred from inputs):**
- `listing_launch_state` (primary fit — the "I just got a listing" moment)
- `just_sold_state` (status field supports "Just Sold")
- `price_reduction_state` (data shape supports it; no special UI treatment yet)
- `coming_soon_state` (status field supports "Coming Soon")

**Cross-tool composition that exists today:** [`mapFlyerToShowcase`](src/tools/listing-flyer/engine/template-mapping.ts) translates the FlyerDraft into a `listing-showcase` TemplateState so the same data renders the MP4 via the SA template engine. This is the first and currently only cross-tool composition in the codebase. **It is also the architectural seed of the skill-orchestration pattern** — one skill's output becomes another skill's input via a typed translator.

**Implicit chaining:** None today. After export, the agent decides where to share. The OS dashboard would suggest Social Animator (for additional social variations) and a future Listing Landing Page skill as natural next steps.

---

### 2.2 Open House Promo (current state)

**Inputs (required):** eventDate (ISO `YYYY-MM-DD`), eventStartTime (`HH:mm`), propertyAddress (per [`validateForExport`](src/tools/open-house-promo/engine/types.ts#L320-L325))
**Inputs (used but not required):** eventEndTime (default 15:00), propertyCity, listingPrice, description, propertyHighlights (0-5 bullets), photos (0-5 with focal-point pairs), qrTargetUrl (auto-prefixed with `https://`), eventNotes
**Inputs (per-tool color overrides):** primaryColor, accentColor, backgroundColor (same fall-through pattern as Flyer)
**Inputs (MP4-specific):** mp4DurationSeconds (5-15s, default 6), exportFormats
**Inputs (from shared profile):** BrandSettings (same fields as Flyer)

**Output-specific input gates:**
- QR PNG requires `qrTargetUrl` (separate from the general validateForExport)
- MP4 reel/square require ≥1 photo for visual usefulness (not enforced)

**Outputs produced (all client-facing):**
- PDF — 1-page promo with event details, photos, QR ([src/tools/open-house-promo/output/pdf-export.tsx](src/tools/open-house-promo/output/pdf-export.tsx))
- JPEG — rasterized page 1 ([src/tools/open-house-promo/engine/jpeg-export.ts](src/tools/open-house-promo/engine/jpeg-export.ts))
- MP4 reel — 1080×1920 vertical with Ken Burns hero photo + thumb strip
- MP4 square — 1080×1080 (hero photo only — thumb strip dropped at 1:1)
- QR PNG — 800px standalone QR code targeting `qrTargetUrl` ([src/tools/open-house-promo/output/qr.ts](src/tools/open-house-promo/output/qr.ts))

**Cost profile:** Free. Same browser-side render path as Flyer.

**Workflow states supported:**
- `open_house_state` (primary — the only tool today that consumes `eventDate`)
- `event_today_state` (the date input enables time-aware filtering)
- `pre_event_state` (3-day, 1-day-out reminders could trigger from `eventDate`)

**Implicit chaining:** None today. Natural next-skill candidates after export: a Showing Tour Page (future skill) for the day-of buyer experience; a Follow-up skill for the day-after lead capture.

---

### 2.3 Listing Presentation (current state)

**Inputs (required):** propertyAddress (per [`validateForExport`](src/tools/listing-presentation/engine/types.ts#L179-L183))
**Inputs (used but not required):** propertyCity, ownerName, agentBio (≤280 chars), agentHeadshot (data URL, ~400px), homesSold, averageDaysOnMarket, saleToListRatio, yearsExperience, marketingStrategies (0-4 bullets, ≤80 chars each), comparableSales (0-3 with address/soldPrice/daysOnMarket/saleToListPercent), whyChooseMe (≤280 chars)
**Inputs (per-tool color overrides):** primaryColor, accentColor, backgroundColor
**Inputs (from shared profile):** BrandSettings (same fields)

**Outputs produced (all client-facing):**
- PDF — 1-page seller pitch document ([src/tools/listing-presentation/output/pdf-export.tsx](src/tools/listing-presentation/output/pdf-export.tsx))
- JPEG — rasterized page 1 ([src/tools/listing-presentation/engine/jpeg-export.ts](src/tools/listing-presentation/engine/jpeg-export.ts))

**Cost profile:** Free.

**Workflow states supported:**
- `seller_appointment_state` (primary — this is the document the agent brings to a listing pitch)
- `seller_conversion_state` (the broader workflow this slots into)
- `pre_listing_state` (pre-appointment prep)

**Notable asymmetry:** Only tool of the 4 with NO MP4 output. Aspect-fits the use case (seller pitch is a print/screen-share artifact, not a social asset) but worth noting because the OS dashboard's "outputs available" surface will differ.

**Implicit chaining:** Today, none. The natural agent-facing companion ("Seller Intelligence Report" — comps + talking points for the agent's own use during the appointment) does not exist as a skill.

---

### 2.4 Social Animator (current state)

Treat the 10 templates as **variants of one skill**: "Social Animator Template Renderer," with `templateId` as a required input. This matches the actual code shape — one [`TemplateEditor.tsx`](src/components/TemplateEditor.tsx), one [`ExportButton.tsx`](src/components/ExportButton.tsx), one [`engine/frame-render.ts`](src/engine/frame-render.ts) MP4 path, ten configuration files in [src/templates/](src/templates/).

**Inputs (required):**
- `templateId` — one of: `qa-card`, `listing-card`, `listing-showcase`, `listing-carousel`, `before-after`, `testimonial-card`, `numbered-process`, `grid-comparison`, `stat-highlight`, `market-update` (per [src/templates/index.ts](src/templates/index.ts))
- `state: Record<string, string>` — template-specific fields per [`TemplateConfig.fields`](src/templates/types.ts#L85-L116) (varies by template; declared per-template via `FieldDef[]`)
- `size: { width, height }` — one of [`SIZE_PRESETS`](src/templates/types.ts#L13-L16): `1080x1350` (Feed) or `1080x1080` (Square). Per-template `availableSizes` may further restrict (e.g. `listing-showcase` is Feed-only)

**Inputs (optional):**
- `assets: TemplateAssets` — `Record<string, HTMLImageElement | null>` for image fields
- Per-template color overrides via the `color`-type fields
- Background style + gradient end color (auto-injected per [`EXTRA_BACKGROUND_FIELDS`](src/templates/types.ts#L130-L148))

**Inputs (from shared profile):**
- `BrandSettings` — auto-merged in for agent name / brokerage / phone / license / logo on templates with `rendersAgentInContent: true` (currently `listing-showcase`)
- `ListingProfile` (heroPhoto, status, address, cityState, price, beds, baths, sqft) — auto-merged on first edit for templates in `LISTING_CONSUMER_TEMPLATE_IDS` (currently `listing-card`, `listing-showcase`); per [src/components/TemplateEditor.tsx:49-52](src/components/TemplateEditor.tsx#L49-L52)

**Outputs produced:**
- MP4 only — per-template duration (declared via `TemplateConfig.duration`), rendered via [`recordCanvas` + `webmToMp4`](src/components/ExportButton.tsx#L4-L10) directly (separate entry point from the LF/OHP `renderTimelineToMp4` wrapper; same underlying ffmpeg.wasm pipeline post-W-3)
- All client-facing

**Cost profile:** Free.

**Workflow states supported (varies by template):**
- `listing-showcase`, `listing-card` → `listing_launch_state`, `just_sold_state`
- `market-update` → `visibility_gap_state` (regular cadence content)
- `testimonial-card`, `qa-card`, `numbered-process` → `authority_building_state`, `visibility_gap_state`
- `before-after` → `just_sold_state`, `staging_reveal_state`
- `grid-comparison`, `stat-highlight` → `visibility_gap_state`, `authority_building_state`
- `listing-carousel` → `listing_launch_state`

**Critical architectural note:** Social Animator is NOT one skill, conceptually — it's a **skill factory**. The 10 templates are 10 distinct skills the OS can recommend independently ("post a market update," "share a testimonial," "show before/after") even though they share the same engine. The skill registry should expose them as 10 separate skill IDs that all happen to share an implementation.

**Implicit chaining:** Within SA, none today (the agent picks a template, fills it, exports, repeats). Cross-tool: LF → `listing-showcase` exists via `mapFlyerToShowcase` but is invoked internally by LF, not by user.

---

### 2.5 Cross-tool shared infrastructure

The 4 tools converge on a small set of shared modules. These are not skills themselves but they constrain the contract:

- **`BrandSettings`** ([src/lib/brand.ts](src/lib/brand.ts)) — single global profile (one logo, one agent name, one set of contact fields, one primary/accent color pair). Persisted as `socanim_brand_settings` in localStorage. All 4 tools read from it; an agent's brand setup is a prerequisite for any skill invocation. **In OS framing this is "agent profile" — the long-lived identity that every skill auto-injects.**

- **`ListingProfile`** ([src/lib/listing-profile.ts](src/lib/listing-profile.ts)) — single active listing (heroPhoto + 8 fields covering status, address, price, beds, baths, sqft). Persisted as `socanim_listing_profile` in localStorage. Today only consumed by SA's `listing-card` + `listing-showcase`. **In OS framing this is the "active listing context" — once per launch, populate once, every listing-touching skill auto-merges from it.** The Flyer tool does NOT yet consume this and instead asks the agent to re-type address/price/etc; that's a redundancy a future state-aware OS can close.

- **MP4 pipeline** ([src/engine/frame-render.ts](src/engine/frame-render.ts), [src/engine/export.ts](src/engine/export.ts)) — post-W-3, all MP4 generation funnels through `renderViaMediaRecorder` + `webmToMp4`. Free browser-side compute. No skill needs to know which encoder runs.

- **PDF pipeline** ([src/tools/*/output/pdf-export.tsx](src/tools/listing-flyer/output/pdf-export.tsx)) — each tool uses react-pdf with its own document component. Consolidation is possible but out of scope here.

---

## 3. The callable-skill contract

Every skill in the Studio SEP OS exposes this shape. The contract is intentionally narrow — it describes WHAT the skill is (inputs/outputs/cost/states), NOT HOW it's implemented. The dashboard reads this metadata to render recommendations and route invocations.

```typescript
interface CallableSkill {
  id: string;                          // unique skill identifier, kebab-case
  name: string;                        // human-readable name shown in the OS dashboard
  purpose: string;                     // one-sentence what-it-does, agent-facing copy

  inputs: {
    required: SkillInputSpec[];        // must-haves, validated before invocation
    optional: SkillInputSpec[];        // nice-to-haves that improve output
  };

  outputs: SkillOutput[];              // one or more outputs, each typed

  costProfile: 'free'                  // browser-side only, no server cost
              | 'fixed'                // bounded server compute (e.g. PDF rasterization on a render farm)
              | 'variable-ai';         // AI inference, cost varies with prompt complexity

  supportedStates: WorkflowState[];    // which OS states can invoke this skill

  recommendedNextSkills?: SkillId[];   // for "do this next" chaining suggestions
}

interface SkillInputSpec {
  key: string;                         // e.g. "propertyAddress"
  type: 'string' | 'number' | 'date' | 'time' | 'photo' | 'photoArray'
       | 'stringArray' | 'colorHex' | 'url' | 'enum' | 'objectArray';
  description: string;                 // shown in the UI
  source?: 'agent-profile'             // auto-injected from BrandSettings
         | 'listing-profile'           // auto-injected from ListingProfile
         | 'event'                     // from a scheduled event (calendar integration, Phase 3)
         | 'prior-skill'               // chained from another skill's output
         | 'user-input';               // typed by the agent at invocation time (default)
}

interface SkillOutput {
  type: 'client-facing' | 'agent-facing';
  format: 'pdf' | 'jpeg' | 'png' | 'mp4' | 'html' | 'text' | 'json' | 'url';
  description: string;                 // "Print-ready 1-page flyer"
  aspectRatio?: '9:16' | '1:1' | '1080x1350' | 'letter' | 'a4'; // when relevant
}

type WorkflowState =
  // Listing lifecycle
  | 'pre_listing_state' | 'listing_launch_state' | 'listing_live_state'
  | 'price_reduction_state' | 'just_sold_state'
  // Buyer side
  | 'buyer_tour_state' | 'showing_today_state' | 'post_showing_state'
  // Open house
  | 'open_house_state' | 'pre_event_state' | 'event_today_state' | 'post_event_state'
  // Conversion / pitching
  | 'seller_appointment_state' | 'seller_conversion_state'
  // Marketing cadence
  | 'visibility_gap_state' | 'authority_building_state'
  // Lead lifecycle
  | 'lead_decay_state' | 'follow_up_state';
```

**Storage shape:** one `CallableSkill` constant per tool, exported from `src/tools/<tool>/skill.ts` (new file). A central registry at `src/skills/registry.ts` (new file) imports all of them and exports `ALL_SKILLS: CallableSkill[]`. Same shape SA uses for its 10 templates (`ALL_TEMPLATES: TemplateConfig[]` in [src/templates/index.ts](src/templates/index.ts)) — proven pattern.

**What the contract does NOT specify:** the implementation. A `CallableSkill` record points to a tool that already exists; adding the metadata is pure declaration. The dashboard's `invoke(skill, inputs)` function takes the skill ID and routes to the existing tool's URL or in-page handler. No implementation refactor required for Phase 1.

---

## 4. Existing tools rewritten as skills

### 4.1 Listing Flyer Skill (proposed metadata)

```
id: listing-flyer
name: Listing Flyer Generator
purpose: Generate branded marketing assets (PDF + JPEG + MP4) for a single listing
inputs.required:
  - { key: propertyAddress, type: string, source: listing-profile }
  - { key: price, type: string, source: listing-profile }
  - { key: photos, type: photoArray (≥1), source: user-input }
inputs.optional:
  - { key: status, type: enum, default: 'Just Listed', source: listing-profile }
  - { key: addressLine2 (cityState), type: string, source: listing-profile }
  - { key: beds, type: number, source: listing-profile }
  - { key: baths, type: number, source: listing-profile }
  - { key: sqft, type: number, source: listing-profile }
  - { key: features, type: stringArray (≤5), source: user-input }
  - { key: primaryColor, type: colorHex, source: agent-profile }
  - { key: accentColor, type: colorHex, source: agent-profile }
  - { key: backgroundColor, type: colorHex, source: agent-profile }
  - { key: duration, type: number (5-15), default: 8, source: user-input }
  - { key: exportFormats, type: enum-pair (reel|square), default: reel, source: user-input }
outputs:
  - { type: client-facing, format: pdf, description: 'Print-ready 1-page flyer', aspectRatio: letter }
  - { type: client-facing, format: jpeg, description: 'Camera-roll-friendly social image', aspectRatio: 1080x1350 }
  - { type: client-facing, format: mp4, description: 'Vertical reel for Stories/Reels/TikTok', aspectRatio: 9:16 }
  - { type: client-facing, format: mp4, description: 'Square for Instagram feed', aspectRatio: 1:1 }
costProfile: free
supportedStates: [listing_launch_state, just_sold_state, price_reduction_state, listing_live_state]
recommendedNextSkills: [social-animator-listing-carousel, social-animator-listing-card, listing-landing-page (future)]
```

**Dual-output gap:** No agent-facing companion exists. Per the dual-output pattern surfaced 2026-05-14, this skill could also produce an agent-facing **"launch coordination checklist"** — a private one-pager the agent uses to track what's been done for this listing (flyer? ✓; social posts? ✓/✗; open house scheduled? ✓/✗; price reduction trigger date? etc.). Defer to Phase 1.5 — the checklist content is the work, not the engine.

---

### 4.2 Open House Promo Skill (proposed metadata)

```
id: open-house-promo
name: Open House Promo Generator
purpose: Generate event-day marketing assets (PDF + JPEG + MP4 + QR) for an open house
inputs.required:
  - { key: eventDate, type: date (ISO YYYY-MM-DD), source: user-input }
  - { key: eventStartTime, type: time (HH:mm), source: user-input }
  - { key: propertyAddress, type: string, source: listing-profile }
inputs.optional:
  - { key: eventEndTime, type: time, default: '15:00', source: user-input }
  - { key: propertyCity, type: string, source: listing-profile }
  - { key: listingPrice, type: string, source: listing-profile }
  - { key: description, type: string, source: user-input }
  - { key: propertyHighlights, type: stringArray (≤5), source: user-input }
  - { key: photos, type: photoArray (≤5, with focal-point pairs), source: user-input }
  - { key: qrTargetUrl, type: url, source: user-input }    // required for QR output only
  - { key: eventNotes, type: string, source: user-input }
  - color overrides + MP4 duration + exportFormats (same as LF)
outputs:
  - { type: client-facing, format: pdf, description: 'Open-house event flyer', aspectRatio: letter }
  - { type: client-facing, format: jpeg, description: 'Social-shareable open-house promo' }
  - { type: client-facing, format: mp4, description: 'Vertical reel announcing the open house', aspectRatio: 9:16 }
  - { type: client-facing, format: mp4, description: 'Square for Instagram', aspectRatio: 1:1 }
  - { type: client-facing, format: png, description: 'Standalone QR code targeting qrTargetUrl' }
costProfile: free
supportedStates: [open_house_state, pre_event_state]
recommendedNextSkills: [showing-tour-page (future), open-house-walking-guide (future, agent-facing)]
```

**Dual-output gap:** No agent-facing companion. The natural one is the **"open-house walking guide"** — agent-side talking points for greeting visitors, the listing's selling-point cheat sheet, the day-of sign-in QR for lead capture. This is the canonical example from the 2026-05-14 dual-output surface. **Defer to Phase 1.5** — content design required.

---

### 4.3 Listing Presentation Skill (proposed metadata)

```
id: listing-presentation
name: Listing Presentation One-Pager
purpose: Generate the document an agent brings to a seller appointment to win the listing
inputs.required:
  - { key: propertyAddress, type: string, source: listing-profile }
inputs.optional:
  - { key: propertyCity, type: string, source: listing-profile }
  - { key: ownerName, type: string, source: user-input }
  - { key: agentBio, type: string (≤280), source: agent-profile-extension }
  - { key: agentHeadshot, type: photo, source: agent-profile-extension }
  - { key: homesSold, type: string, source: agent-profile-extension }
  - { key: averageDaysOnMarket, type: string, source: agent-profile-extension }
  - { key: saleToListRatio, type: string, source: agent-profile-extension }
  - { key: yearsExperience, type: string, source: agent-profile-extension }
  - { key: marketingStrategies, type: stringArray (≤4, ≤80 chars each), source: user-input }
  - { key: comparableSales, type: objectArray (≤3, with address/soldPrice/DOM/saleToListPct), source: user-input }
  - { key: whyChooseMe, type: string (≤280), source: user-input }
  - color overrides (same pattern as other tools)
outputs:
  - { type: client-facing, format: pdf, description: '1-page seller pitch document', aspectRatio: letter }
  - { type: client-facing, format: jpeg, description: 'Screen-share-ready page raster' }
costProfile: free
supportedStates: [seller_appointment_state, seller_conversion_state, pre_listing_state]
recommendedNextSkills: [seller-intelligence-report (future, agent-facing), listing-flyer (after listing won)]
```

**Dual-output gap:** This is the **highest-value dual-output gap in the codebase.** The agent-facing **"Seller Intelligence Report"** — comps with valuation logic, talking points addressed to the seller's likely objections, team stats, suggested pricing strategy — is exactly what an agent needs at the appointment alongside the client-facing one-pager. The Presentation tool today is half the workflow; the missing half is structurally the same engine (react-pdf, BrandSettings + ListingProfile inputs) with different content. **Defer to Phase 2** — content design + content cap.

**Tier note:** Likely Pro-gated. Seller pitching is a higher-stakes workflow and a natural feature for the mid-tier price point per the agent-archetype mapping.

---

### 4.4 Social Animator Skills (proposed metadata — 10 entries)

Treat each template as its own skill. Shared engine; distinct skill IDs. The dashboard recommends them independently.

```
// One example. Same shape for the other 9.
id: social-animator-listing-showcase
name: Listing Showcase Reel
purpose: 8-second animated reveal of a single listing — hero zoom + price + features + agent card
inputs.required:
  - { key: heroPhoto, type: photo, source: listing-profile }
  - { key: address, type: string, source: listing-profile }
  - { key: price, type: string, source: listing-profile }
  - { key: status, type: string, source: listing-profile }
inputs.optional:
  - cityState, beds, baths, sqft, features (5) — all from listing-profile or user-input
  - color overrides for status badge, price, features, accents
  - agent block fields — auto from agent-profile (BrandSettings.agentName, brokerage, phone, licenseNumber, logo)
outputs:
  - { type: client-facing, format: mp4, aspectRatio: 1080x1350, description: '8s vertical listing reveal' }
costProfile: free
supportedStates: [listing_launch_state, just_sold_state]
recommendedNextSkills: [social-animator-listing-carousel, listing-flyer]
```

| Template | Suggested skill purpose | Primary states |
|---|---|---|
| `qa-card` | Q&A card — answer a common buyer/seller question with a polished animated card | `authority_building_state`, `visibility_gap_state` |
| `listing-card` | Compact listing card — quick social post for a single listing | `listing_launch_state`, `just_sold_state` |
| `listing-showcase` | 8s vertical listing reveal | `listing_launch_state`, `just_sold_state` |
| `listing-carousel` | Multi-photo carousel for a listing's hero + interior shots | `listing_launch_state` |
| `before-after` | Before/after reveal — staging, renovation, seasonal | `just_sold_state`, `staging_reveal_state` (new) |
| `testimonial-card` | Animated client testimonial card | `authority_building_state` |
| `numbered-process` | "5 steps to X" animated explainer | `authority_building_state`, `visibility_gap_state` |
| `grid-comparison` | 4-cell comparison grid (e.g. neighborhoods, pricing tiers, agent vs FSBO) | `authority_building_state`, `visibility_gap_state` |
| `stat-highlight` | Big-number stat card with context + supporting line | `authority_building_state`, `visibility_gap_state` |
| `market-update` | Periodic market update with 4 stats + brief | `visibility_gap_state` |

**Dual-output gap (cross-template):** None of the 10 SA templates have an agent-facing companion. SA is purely a client-facing skill set — the companion (if any) would be a content calendar / posting schedule, which is a meta-skill not template-specific. **Defer to Phase 3** behind event-aware scheduling.

---

## 5. Workflow orchestration maps

### Workflow 1 — Listing Launch OS

**Triggers (Phase 1, rule-based):** Agent enters new listing address into ListingProfile AND no flyer has been exported for that address yet
**Triggers (Phase 2):** ListingProfile populated for ≥1 hour AND no client-facing artifact generated AND not dismissed by agent
**Triggers (Phase 3):** Calendar event "Listing live" within 24 hours AND no marketing assets prepared
**Triggers (Phase 4):** Agent types "I just got a new listing at [address]" — AI extracts address into ListingProfile, sequences skills

**State sequence:** `pre_listing_state` → `listing_launch_state` → (during launch sequence) → `listing_live_state`

**Skills orchestrated:**
1. **Listing Flyer Skill** — PDF + JPEG + MP4 (client-facing)
2. **Social Animator: Listing Showcase Reel** — additional vertical reel (client-facing)
3. **Social Animator: Listing Card** — feed-friendly post (client-facing)
4. **Social Animator: Listing Carousel** — multi-photo (client-facing)
5. *(GAP — critical)* **Listing Landing Page Skill** — publicly-shareable URL with photos + details + lead-capture form. Currently no equivalent exists; LF outputs are downloadable artifacts only.
6. *(GAP — important)* **Launch Coordination Checklist Skill** (agent-facing) — internal one-pager tracking what's been done

**Phase 2 behavior-aware additions:**
- "Flyer generated but no social posts yet" → suggest Social Animator templates
- "Listing 5 days old, no open house scheduled" → suggest Open House workflow
- "Listing 14 days old, no price reduction trigger" → flag a check-in moment

**Phase 3 event-aware additions:**
- "Open house scheduled within 72 hours" → auto-trigger Open House workflow
- "Listing on market for 21 days" → suggest price reduction marketing
- "Sold close date past" → transition to `just_sold_state` and recommend Before/After

**Phase 4 AI-orchestrated additions:**
- Natural-language listing intake ("4BR/2.5BA at 123 Main, $685K, listing Friday")
- AI generates feature bullets from MLS description
- AI picks the optimal mix of social templates given the listing's distinctive features

---

### Workflow 2 — Open House OS

**Triggers (Phase 1, rule-based):** OpenHousePromoDraft has eventDate set AND eventDate is in the future
**Triggers (Phase 2):** OH Promo exported but no flyer-of-record for the underlying listing → suggest LF for static distribution; OH Promo exported but no QR generated → suggest the QR
**Triggers (Phase 3):** Calendar event "Open House [address]" within 72 hours
**Triggers (Phase 4):** "I'm hosting an open house at [listing] Saturday 1-4pm" → AI fills the draft

**State sequence:** `open_house_state` → `pre_event_state` (3 days out) → `event_today_state` → `post_event_state`

**Skills orchestrated:**
1. **Open House Promo Skill** — PDF + JPEG + MP4 + QR (client-facing)
2. **Social Animator: Stat Highlight or QA-Card** — pre-event "this Saturday" teasers (client-facing)
3. *(GAP — critical)* **Open House Walking Guide Skill** (agent-facing) — talking points, listing cheat-sheet, day-of sign-in QR targeting a follow-up lead form
4. *(GAP — important)* **Open House Follow-Up Skill** — post-event email/SMS templates for visitors

**Phase 2-4 progressions follow same pattern as Workflow 1.**

---

### Workflow 3 — Showing Flow / Buyer Tour OS

**Triggers (Phase 1):** Agent manually invokes (no automated detection — no buyer-side state in codebase today)
**Triggers (Phase 3):** Calendar event "Showing [address]" within 24 hours

**State sequence:** `buyer_tour_state` → `showing_today_state` → `post_showing_state`

**Skills orchestrated:**
1. *(GAP — critical)* **Showing Tour Page Skill** (client-facing) — buyer's view of the day's tour: properties, times, addresses, agent contact, optional notes-per-property fields they can fill on their phone
2. *(GAP — critical)* **Buyer Consultation Guide Skill** (agent-facing) — talking points per property, comp data, questions to ask, follow-up notes capture
3. *(GAP — important)* **Tour Recap Skill** (client-facing, post-tour) — emailable summary of what was seen, with photos + agent commentary

**Critical:** This workflow has zero existing skill coverage today. It's the largest single gap in the codebase for the OS framing. Three skills need to be built; none of them exist.

---

### Workflow 4 — Momentum Engine / Follow-Up OS

**Triggers (Phase 1):** Agent invokes; or a checklist surfaces "last contact > N days" for a saved lead
**Triggers (Phase 2):** Behavior tracking detects "exported a flyer but never came back" — actually a meta-trigger about the AGENT's pattern, not the lead
**Triggers (Phase 3):** Date-based cadence — 1 day post-showing, 3 days, 7 days, 30 days
**Triggers (Phase 4):** "Send a follow-up to the people who came to my open house Saturday" → AI drafts personalized messages

**State sequence:** `post_event_state` → `lead_decay_state` → `follow_up_state`

**Skills orchestrated:**
1. *(GAP — critical)* **Follow-Up Template Skill** (client-facing) — branded email/SMS templates with merge fields
2. *(GAP — important)* **Lead Status Tracker Skill** (agent-facing) — list of leads with last-contact dates + suggested next actions
3. **Social Animator: Testimonial Card** — for the post-close "thank you" social post (client-facing)

**Coverage:** Near-zero today. The Studio app has no lead-tracking storage at all; this workflow is the second-largest gap after Workflow 3.

---

### Workflow 5 — Seller Win System / Listing Conversion OS

**Triggers (Phase 1):** Agent invokes when prepping for a listing appointment
**Triggers (Phase 2):** PresentationDraft has propertyAddress but no exports in the last N hours → suggest the export
**Triggers (Phase 3):** Calendar event "Listing appointment with [seller]" within 24 hours

**State sequence:** `pre_listing_state` → `seller_appointment_state` → `seller_conversion_state` → (on win) `listing_launch_state`

**Skills orchestrated:**
1. **Listing Presentation Skill** — PDF + JPEG (client-facing)
2. *(GAP — critical)* **Seller Intelligence Report Skill** (agent-facing) — the agent's own copy with valuation logic, comp deep-dive, objection-handling talking points, suggested pricing
3. *(GAP — important)* **Seller Follow-Up Skill** (client-facing) — post-pitch follow-up email template

**Coverage:** Half complete. Presentation tool exists; the agent-facing companion (the most important dual-output gap in the entire system per the 2026-05-14 framing) does not.

---

### Workflow 6 — Content Engine / Visibility OS

**Triggers (Phase 1):** Calendar-cadence reminder ("3 posts/week target, current week count: 1")
**Triggers (Phase 2):** Behavior tracking — last social export > 5 days ago
**Triggers (Phase 3):** Date-aware — "Monday market update day," "Friday testimonial day," etc.
**Triggers (Phase 4):** "Make me a market-update post for this week" → AI fills the stats

**State sequence:** `visibility_gap_state` (persistent — recurring)

**Skills orchestrated:**
1. **Social Animator: Market Update** — primary cadence content (client-facing)
2. **Social Animator: Stat Highlight, QA-Card, Numbered Process, Grid Comparison** — variety templates (client-facing)
3. **Social Animator: Testimonial Card** — when a recent close has a testimonial (client-facing)
4. *(GAP — important)* **Content Calendar Skill** (agent-facing) — schedule view, "what's coming this week"

**Coverage:** Near-complete. The 7 SA templates relevant here all exist. Missing piece is the meta-skill of *recommending which template to use this week*, which is the OS's job, not a tool's.

---

### Workflow 7 — Authority OS / Trust Layer

**Triggers (Phase 1):** Agent invokes; or onboarding flow detects empty agentBio / no headshot / no track-record stats
**Triggers (Phase 2):** Behavior tracking — agent hasn't published an authority-building post in N days

**State sequence:** `authority_building_state` (persistent)

**Skills orchestrated:**
1. **Social Animator: Testimonial Card, QA-Card, Numbered Process, Stat Highlight, Grid Comparison** — the 5 SA templates that lean authority-building (client-facing)
2. *(GAP — important)* **Agent Bio / Brand Audit Skill** (agent-facing) — completeness check, "your brand profile is 60% filled — finish to unlock additional templates"
3. *(GAP — future)* **Authority Page Skill** (client-facing) — public agent profile URL with bio, stats, testimonials, recent listings

**Coverage:** Partial. The 5 SA templates cover the "produce authority content" half; the "build the authority foundation" half (agent profile pages, completeness gamification) doesn't exist.

---

## 6. Gap analysis — skills not yet built

### Critical (need to build for the OS feeling to land in Phase 1-2)

1. **Listing Landing Page Skill** (client-facing) — publicly-shareable URL with hero photos, details, lead-capture form. Currently LF outputs are downloadable only; the OS framing assumes shareable URLs. **Workflow 1 (Listing Launch).**
2. **Showing Tour Page Skill** (client-facing) — buyer's view of a day's tour. **Workflow 3 (Buyer Tour).**
3. **Buyer Consultation Guide Skill** (agent-facing) — talking points + comp data + capture form. **Workflow 3.**
4. **Seller Intelligence Report Skill** (agent-facing) — comps + valuation logic + objection talking points. **Workflow 5. Highest-value single gap per dual-output framing.**
5. **Open House Walking Guide Skill** (agent-facing) — day-of agent companion. **Workflow 2.**
6. **Follow-Up Template Skill** (client-facing) — branded email/SMS templates. **Workflow 4.**

### Important (Phase 2-3 enhancements)

7. **Launch Coordination Checklist** (agent-facing) — internal tracking for a listing's marketing rollout. **Workflow 1.**
8. **Open House Follow-Up Skill** (client-facing) — post-event templates. **Workflow 2.**
9. **Tour Recap Skill** (client-facing) — post-showing emailable summary. **Workflow 3.**
10. **Lead Status Tracker** (agent-facing) — central list of leads + last-contact dates. Requires data layer that doesn't exist today. **Workflow 4.**
11. **Seller Follow-Up Skill** (client-facing) — post-pitch email template. **Workflow 5.**
12. **Content Calendar Skill** (agent-facing) — meta-skill for scheduling. **Workflow 6.**
13. **Agent Bio / Brand Audit** (agent-facing) — profile completeness check. **Workflow 7.**

### Future (Phase 4 / AI OS tier)

14. **Authority Page Skill** (client-facing) — public agent profile URL.
15. **AI Intake Skill** — natural-language listing/event/showing creation that fills ListingProfile / OpenHousePromoDraft / etc. **Cross-cutting; gates Phase 4.**
16. **AI Workflow Orchestrator** — interprets "what's next?" and chains skills. **Cross-cutting; gates Phase 4.**

**Build budget reality check:** 6 critical skills before the OS framing lands. Each is in the same complexity range as the existing 4 tools (a form + a renderer + an export path). At the current per-tool build pace observed in H-6 and H-7 phases (~2-4 weeks per tool), this is a 3-6 month build. Sequencing matters: prioritize the dual-output companions that complete existing workflows (Seller Intelligence + Open House Walking Guide) over skills that require entirely new content design (Buyer Consultation Guide).

---

## 7. State detection logic (Phase 1, rule-based)

Without AI, what signals can the OS use to know what state an agent is in? Each workflow's Phase 1 trigger maps to one of these signal categories:

### 7.1 Agent-created data (immediate, deterministic)

- **ListingProfile populated** → agent has a live listing → enables `listing_launch_state`, `listing_live_state`, all listing-touching skill recommendations
- **OpenHousePromoDraft.eventDate populated and in the future** → enables `open_house_state`, `pre_event_state`
- **PresentationDraft.propertyAddress populated** → enables `seller_appointment_state`
- **BrandSettings completeness** (logo present? phone formatted? license #? brokerage?) → drives `authority_building_state` foundation prompts during onboarding
- **Any tool's draft exists but no export within last N hours** → `incomplete_workflow_state` (a meta-state — "you started X but didn't finish")

### 7.2 Behavior data (requires lightweight tracking — Phase 2)

Today there is no per-agent behavior log. Adding one is a small backend addition (single table: `agent_actions { agent_id, action_type, skill_id, target_id, timestamp }`). Once present:

- **Last export by skill_id** → "you haven't posted social content in 5 days" → `visibility_gap_state`
- **Skill_id frequency over rolling window** → "you've done 3 flyers but no social — try a Listing Carousel" → orchestration suggestions
- **Dismissal history** → "agent dismissed Open House suggestion 2x — stop suggesting until next manual trigger"

### 7.3 Time / date data (Phase 3)

- **OpenHousePromoDraft.eventDate vs now()** → 72-hour, 24-hour, day-of triggers
- **Calendar integration** (Google Calendar, iCal feed) — "Listing appointment at 2pm Thursday" → pre-appointment prompt with PresentationDraft
- **Rolling cadence dates** — "every Monday at 9am, suggest a market-update post" → `visibility_gap_state`

### 7.4 Profile / onboarding data (immediate)

- **Agent archetype self-selection during onboarding** ("I'm new" / "I'm scaling" / "I run a team") → routes to Starter / Pro / AI OS tier defaults
- **Years of experience** (could capture during onboarding) → adapts dashboard ("Welcome — first listing flow" vs "Standard launch sequence")
- **Brokerage size** → enables/disables team-level orchestration

**Phase 1 ships with categories 1 and 4 only.** That's enough to render meaningful "next best action" cards: if ListingProfile is empty, the card says "Add a listing to get started." If it's populated and no flyer exported, the card says "Generate your launch assets." If OpenHousePromoDraft has an eventDate set, the card says "Your open house is on [date] — generate promo materials." All of this is derivable from localStorage today; no new infrastructure required.

---

## 8. Build phasing recommendation

### Phase 1 — Rule-based skill metadata + dashboard (4-6 weeks)

**Goal:** The OS feeling lands. Agent opens the app and sees "what should I do right now" cards driven by existing localStorage state.

**Concrete contents:**

1. Add `CallableSkill` metadata (4 records — LF, OHP, LP + 10 SA template variants = 13 skills total) co-located with each tool. Zero behavior change.
2. Build `src/skills/registry.ts` — central import + `ALL_SKILLS` export. Same pattern as [src/templates/index.ts](src/templates/index.ts).
3. Build dashboard route at `/dashboard` (new) — reads `ALL_SKILLS`, reads localStorage (BrandSettings, ListingProfile, draft keys per tool), runs hardcoded rule-based state detection (Section 7.1 + 7.4 signals only), renders "next best action" cards. Each card links to the tool URL.
4. Wire the 4 highest-priority workflows (Listing Launch, Momentum, Content, Open House) with their existing-skill-only orchestration. The 3 workflows that need new skills (Buyer Tour, Seller Conversion's agent-facing half, Authority's foundation half) are deferred.
5. No AI. No backend changes. No new data model.

**Risk:** Low. Pure addition. The 4 tools continue to work standalone.

### Phase 2 — Behavior tracking + completion states (4-8 weeks)

**Goal:** The dashboard knows what the agent has done across sessions, not just what they've drafted.

**Concrete contents:**

1. Add `agent_actions` table (single table, append-only log). Backed by Vercel Postgres or similar — small ongoing cost.
2. Wire each skill's export handler to log an action on success.
3. Dashboard reads action log → adds "X days since last social post" / "you haven't followed up with leads from Saturday's open house" cards.
4. Build dual-output companions for completed workflows: **Seller Intelligence Report** + **Open House Walking Guide** + **Launch Coordination Checklist**. These are the highest-leverage adds — they complete existing workflows rather than starting new ones.
5. **Pro tier ($79) launch trigger.** Phase 2 contents are the Pro tier's value-add over Starter.

**Risk:** Moderate. First time the app holds persistent server-side state per agent. Backup + migration discipline matters.

### Phase 3 — Event/date awareness + calendar integration (8-12 weeks)

**Goal:** Time becomes a trigger — the OS surfaces actions based on what's upcoming, not just what's in localStorage.

**Concrete contents:**

1. Calendar integration (Google Calendar OAuth, iCal feed) — read-only initially.
2. Build the 3 new client-facing skills that require event awareness: **Showing Tour Page**, **Listing Landing Page**, **Follow-Up Template Skill**.
3. Build the missing agent-facing companions: **Buyer Consultation Guide**, **Tour Recap Skill**, **Lead Status Tracker**.
4. Workflows 3 (Buyer Tour) and 4 (Follow-up) become fully orchestratable end-to-end.

**Risk:** Moderate-high. New skill builds are substantial; calendar OAuth adds operational complexity.

### Phase 4 — AI orchestration layer (12+ weeks; price-tier transition)

**Goal:** The agent can talk to the OS. "I just got a new listing at [address]" → ListingProfile auto-fills, skill chain begins.

**Concrete contents:**

1. AI intake skill — converts natural language to structured profile/draft fills.
2. AI orchestrator — decides skill chains given context.
3. AI content generation — feature bullets from MLS, headlines from listing data, follow-up message personalization.
4. **AI OS tier ($149-199) launch.** This phase is the tier's value-add.

**Risk:** High variable cost; new infra patterns (LLM calls, streaming, prompt versioning); UX research required for the conversational surface.

---

## 9. Implementation sequence — concrete next steps

Listed in order. Each step is independently shippable; no step blocks the next architecturally.

1. **Define the CallableSkill TypeScript interface** in `src/skills/types.ts` (new file). Mirror the markdown contract in Section 3 of this doc. Pure type definitions; zero runtime impact.

2. **Add `skill.ts` files co-located with each tool:**
   - `src/tools/listing-flyer/skill.ts` — `LISTING_FLYER_SKILL: CallableSkill = {...}`
   - `src/tools/open-house-promo/skill.ts`
   - `src/tools/listing-presentation/skill.ts`
   - `src/templates/skills.ts` — exports 10 `CallableSkill` records, one per SA template (or co-locate per template if cleaner)

3. **Build `src/skills/registry.ts`** — imports all 13 records, exports `ALL_SKILLS: CallableSkill[]` + helper functions: `getSkillsForState(state)`, `getSkillById(id)`.

4. **Build the Phase 1 dashboard route** at `src/app/dashboard/page.tsx`:
   - Reads localStorage (BrandSettings, ListingProfile, all `*Draft` keys per tool)
   - Runs hardcoded rule-based state detection (Section 7.1 + 7.4 logic)
   - Renders "next best action" cards using `ALL_SKILLS` metadata
   - Each card has a primary action ("Generate launch assets →") that links to the tool URL with optional query params for pre-population
   - Falls back gracefully if BrandSettings is empty ("Set up your brand profile to unlock skills")

5. **Wire one workflow end-to-end as a smoke test** — Listing Launch is the natural first choice given it touches LF + 3 SA templates + the existing `mapFlyerToShowcase` cross-tool composition. Validate the orchestration flow: agent enters ListingProfile → dashboard suggests LF → after LF export, dashboard suggests SA Listing Carousel → after that, suggests SA Listing Card. Each transition is a `recommendedNextSkills` lookup.

6. **Build the Open House orchestration** as the second smoke test. Same shape: state detection from OpenHousePromoDraft.eventDate → cards surface → chain.

7. **Wire Momentum + Content workflows** — these reuse SA skills heavily; little new code, mostly metadata + state-detection rules.

8. **Ship Phase 1.** Two new tools' worth of code; ~600-800 LOC; zero behavior change to existing tools; pure additive.

9. **Phase 1.5 audit + decision** — measure agent dashboard engagement; decide whether to build the dual-output companions (Seller Intelligence Report, Open House Walking Guide, Launch Coordination Checklist) as the Phase 2 opener, or whether behavior tracking is the bigger wedge.

10. **Phase 2-4 sequencing per Section 8 phasing recommendation.**

---

## 10. Risks and unknowns

### Risks the audit has identified

- **Skill IDs are forever.** Once shipped, renaming a skill ID breaks dashboard recommendations cached client-side and any future analytics joins. Decide naming conventions carefully before Step 2. Recommend kebab-case, scoped by domain: `listing-flyer`, `open-house-promo`, `social-animator-listing-showcase` (the SA scope prefix makes the 10 templates distinguishable).
- **State enum churn.** The `WorkflowState` union in Section 3 is best-guess. Real usage will surface missing states ("pending offer," "in escrow," etc.). Plan for non-breaking additions (union extension is safe; renames are not).
- **`tierGate` lock-in.** Marking a skill as `pro`-only is a pricing commitment. Defer the tier-gating to a separate concern from skill metadata if possible — let the dashboard query the agent's subscription and render accordingly. Don't bake `tierGate` into the CallableSkill record yet. **Update (2026-05-16):** `tierGate` was cut from the v1 `CallableSkill` interface per this reasoning. Tier-gating is now a dashboard concern: the dashboard queries the agent's subscription and renders accordingly.
- **Dual-output ambiguity for SA templates.** The framing says "most agent workflows produce two deliverables." SA templates produce only client-facing MP4s. Forcing an agent-facing companion (e.g. "scheduled post tracker") might be over-engineering. Defer; let the meta-skill (Content Calendar) cover this rather than per-template.

### Unknowns the audit cannot answer

- **Which workflow priority is actually right?** The team's hypothesis (Listing Launch first) is reasonable; only Phase 1 dashboard usage data will validate it. The plan above is robust to re-prioritization — skill metadata + rule-based detection works for any subset of the 7.
- **What's the right granularity for "states"?** Is `pre_event_state` a separate state or a property of `open_house_state` (e.g., `{state: 'open_house', daysUntil: 3}`)? The Section 3 enum picks the former for simplicity; the latter is cleaner for time-aware logic. Revisit at Phase 3 when calendar integration forces the issue.
- **Cross-listing context.** What if an agent has 3 active listings? ListingProfile today is single-listing. The OS framing implies multi-listing context at some point. Out of scope for this audit; revisit when Phase 2 behavior tracking surfaces the need.
- **What does "AI OS" actually look like at $149-199?** Phase 4 contents are sketched; the actual product surface (conversational chat? structured prompts? voice intake?) is not decided. Defer.
- **Onboarding flow shape.** The dashboard depends on BrandSettings + ListingProfile being populated; today neither is gated. Phase 1 will need an onboarding flow that guides first-time agents through the prerequisites. Out of scope here; flagged for Phase 1 design.

---

## Sources

Files read in full:
- [src/tools/listing-flyer/engine/types.ts](src/tools/listing-flyer/engine/types.ts)
- [src/tools/listing-flyer/engine/template-mapping.ts](src/tools/listing-flyer/engine/template-mapping.ts)
- [src/tools/open-house-promo/engine/types.ts](src/tools/open-house-promo/engine/types.ts)
- [src/tools/listing-presentation/engine/types.ts](src/tools/listing-presentation/engine/types.ts)
- [src/templates/types.ts](src/templates/types.ts)
- [src/templates/index.ts](src/templates/index.ts)
- [src/lib/brand.ts](src/lib/brand.ts)
- [src/lib/listing-profile.ts](src/lib/listing-profile.ts)

Files read in part:
- [src/templates/listing-showcase.ts](src/templates/listing-showcase.ts) (header + first 80 lines for declaration shape)
- [src/components/TemplateEditor.tsx](src/components/TemplateEditor.tsx) (lines 40-100 for LISTING_CONSUMER_TEMPLATE_IDS pattern)
- [src/components/ExportButton.tsx](src/components/ExportButton.tsx) (lines 1-60 for the separate MP4 entry point)
- [docs/W-3-mp4-pipeline-consolidation-audit.md](docs/W-3-mp4-pipeline-consolidation-audit.md) (audit format reference)

Files surveyed (directory listings):
- `src/tools/listing-flyer/{engine,output}/`
- `src/tools/open-house-promo/{engine,output}/`
- `src/tools/listing-presentation/{engine,output}/`
- `src/templates/` (10 template files + index + types + brand-slots)
- `src/app/social-animator/` (picker + 10 template route directories)
- `src/lib/` (auth, brand, db, listing-profile, perf, pricing, stripe, subscription)

Grep verifications:
- All 10 SA template IDs enumerated by `grep '^\s*id:' src/templates/*.ts`
- LISTING_CONSUMER_TEMPLATE_IDS membership confirmed by grep against [src/components/TemplateEditor.tsx](src/components/TemplateEditor.tsx)
- `recordCanvas` + `webmToMp4` direct invocation in [src/components/ExportButton.tsx](src/components/ExportButton.tsx) confirms SA's parallel-but-equivalent MP4 entry point post-W-3 consolidation

Strategic context embedded in the prompt (not derived from code):
- OS framework formalization (2026-05-14)
- 7 named workflows + emotional drivers
- Dual-output pattern (client-facing + agent-facing) surfaced by Aaron Thomas (2026-05-14)
- 3 agent archetypes + tier mapping
- 4-phase build approach (rule-based → behavior-aware → event-aware → AI-orchestrated)
- Team priority hypothesis (Listing Launch > Momentum > Content > Authority > Open House > Showing > Seller)
