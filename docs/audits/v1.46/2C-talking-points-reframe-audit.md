# Audit 2C — Open House Talking Points Reframe (v1.46)

## Executive Summary

The current Open House Prep "talking points" surface is functionally a three-section library picker (10 talking points + 15 common questions + 6 conversion prompts) that the agent prints as flat, trigger-labeled lists on a private PDF. Aaron's 2026-05-18 feedback is correct: working agents reading that PDF in the car ten minutes before doors open see a brainstorm, not an SOP — there is no sequencing, no time hint, no "what do I do next." This audit recommends **Option B (Wizard + content reframe), implemented as a non-breaking additive layer**: keep the existing libraries and `selected*Ids` arrays exactly as they are, add a thin `stepAssignments` mapping on the draft, and rewrite the agent PDF + the StepTalkingPoints UI as a 5-step SOP that consumes the same selected library entries. Estimated scope: ~1 day Claude Code work. The visitor handout does not change — talking points have never appeared there, so the dual-output contract is unaffected.

## Current State

### Skill location and contract

The skill lives at [`src/tools/open-house-prep/skill.ts`](../../../src/tools/open-house-prep/skill.ts). It is a dual-output skill (agent-facing `pdf` + client-facing `url`) declared via the established `CallableSkill` interface — first skill in SEP with two outputs at different audience types. Inputs relevant to this audit are three `stringArray` IDs into curated content libraries:

- `selectedTalkingPointIds`
- `selectedCommonQuestionIds`
- `selectedConversionPromptIds`

…plus two optional `Record<string, string>` override maps (`talkingPointOverrides`, `commonQuestionOverrides`) that let the agent rewrite a library entry's text without forking the library.

### Where the "talking points" come from

The data originates from **three hand-curated, verbatim content libraries** — not user-entered free text, not LLM-generated. SEP is no-LLM per the stateless principle; I confirmed no `anthropic` or `openai` imports anywhere under `src/tools/open-house-prep/`.

- [`content/talking-points.ts`](../../../src/tools/open-house-prep/content/talking-points.ts) — 10 `TalkingPoint` entries with `{ id, trigger, text, isDefaultSelected? }`. The `trigger` field is a human-readable label that hints at *when* the agent uses the line (e.g., `"Welcome (every visitor)"`, `"When price comes up"`). 4 are pre-selected by default.
- [`content/common-questions.ts`](../../../src/tools/open-house-prep/content/common-questions.ts) — 15 `CommonQuestion` entries across 5 categories (Schools / Commute, Property / Renovations, Market / Pricing, Seller motivation, HOA / Logistics). 4 defaults.
- [`content/conversion-prompts.ts`](../../../src/tools/open-house-prep/content/conversion-prompts.ts) — 6 `ConversionPrompt` entries keyed by `context` (e.g., `"Visitor seems engaged with comps"`). 2 defaults.

The agent enters this data by toggling checkboxes in [`components/StepTalkingPoints.tsx`](../../../src/tools/open-house-prep/components/StepTalkingPoints.tsx). The wizard is a 5-step shell ([`src/app/open-house-prep/page.tsx`](../../../src/app/open-house-prep/page.tsx)) — Event + property, Recent area sales, Talking points, Notes + asks, Review — and the "Talking points" step is itself a single screen containing three sub-sections.

### How they render

- **Agent PDF** ([`output/pdf-export.tsx`](../../../src/tools/open-house-prep/output/pdf-export.tsx), `OpenHousePrepAgentPdf`) prints three section headings — "Lead with these talking points", "If they ask…", "Conversion prompts" — each followed by an italic `trigger` label and a `responseBody` line for every selected entry. Items render in library declaration order. No grouping by time, no grouping by buyer-stage, no numbering.
- **Visitor handout web page** ([`output/handout-page.tsx`](../../../src/tools/open-house-prep/output/handout-page.tsx)) has 6 sections: Hero, Why this home, Recent area sales, Neighborhood, Market context, Your agent. **Talking points, common questions, and conversion prompts do not appear on the visitor handout.** This is correct — they're agent-private. The handout PDF ([`OpenHouseHandoutPdf`](../../../src/tools/open-house-prep/output/pdf-export.tsx)) follows the same 6-section structure.
- **Handout section contract** is locked in [`content/handout-sections.ts`](../../../src/tools/open-house-prep/content/handout-sections.ts) — 7 sections per Audit 1C §3. The audit-flagged surface is **agent-only**.

### Cognitive load assessment

With universal defaults applied to a fresh draft (per `useEffect` in [`page.tsx:71-79`](../../../src/app/open-house-prep/page.tsx)), the agent's PDF prints **10 items by default**: 4 talking points + 4 common questions + 2 conversion prompts. If the agent selects everything, it goes to **31 items**. Representative selected-by-default items:

- `welcome-opener`: "Welcome — thanks for stopping by today. I'm happy to answer anything you want to know about the home or the area."
- `property-positioning`: "What I'd want you to notice is what makes this home stand out…"
- `buyer-qualifying-question`: "Are you actively looking, or just out exploring today?…"
- `closing-offer`: "If you want me to put together a more detailed report on this home or the area, I'm happy to do that…"

Read in isolation each line is good. Read as a stack, the failure mode is obvious: the `trigger` labels are *post-hoc tags* ("Welcome (every visitor)", "Wrap-up with every visitor") rather than *steps in a sequence*. The PDF prints them in library-declaration order, which is roughly conversational arc by coincidence — but there is no numbering, no visual chunking by phase of the visit, and no explicit "next action" tied to any item. The Common Questions section is grouped by topical *category* (Schools, Renovations, Market, etc.) rather than by *when in the visit the question lands*. The Conversion Prompts section sits at the bottom of the PDF, the literal furthest place from where the agent reads it in the car.

The Commit 7 collapse pattern in `StepTalkingPoints.tsx` ([lines 37-61](../../../src/tools/open-house-prep/components/StepTalkingPoints.tsx)) already cut the wizard's first-visible items from 31 to ~10 — that fix was for *picker fatigue*. The audit-flagged failure is downstream: the **output** still reads as a flat brainstorm even when the input has been triaged.

### Industry SOP comparison (in-codebase)

Two SEP patterns are useful comparisons:

1. **`StepIndicator` in [`src/app/open-house-prep/page.tsx:175-191`](../../../src/app/open-house-prep/page.tsx)** — the 5-step wizard top-bar. Numbered, sequenced, current-step highlighted, completed steps colored differently. This is already the shape Aaron is asking for; OH Prep just doesn't apply it to its own output. The wizard *teaches* the agent in 5 steps; the PDF should *operate* in 5 steps.
2. **Seller Intelligence Report's `StepObjections`** ([`src/tools/seller-intelligence-report/components/StepObjections.tsx`](../../../src/tools/seller-intelligence-report/components/StepObjections.tsx)) — also titled "Talking points" in the H2, also a library picker with category grouping and overrides. SIR is the closer cousin, and SIR has the same latent failure mode: a *list*, not a *sequence*. If 2C lands well, SIR likely needs the same reframe in a later audit.

The pattern SEP already trusts is **numbered ordered steps with a single action per step**. The fix is to apply that shape to the surface the agent reads during the event, not just to the wizard that produces it.

## Recommended Reframe: 5-Step SOP

Map the existing library entries onto a 5-step open-house arc. Each step has: a numbered heading, a single action verb, 1-2 talking-point "chips" pulled from the existing libraries, and an optional time hint. The five steps:

1. **Greet at the door** — single line, every visitor. Default chip: `welcome-opener`. Optional chip: `buyer-qualifying-question`. Time hint: "First 30 seconds."
2. **Walk-through anchor (kitchen / living)** — lead with the home's strength as the visitor enters the main living area. Default chip: `property-positioning`. Optional chip: `design-intent`. Time hint: "Minutes 2-6."
3. **Pricing / market handle** — when the visitor signals interest or asks about price/area. Default chip: `price-reasoning` or `compare-to-recent-sales` (CommonQuestion). Optional chip: `comp-data-hook` or `honest-market-read`. Time hint: "When they slow down to ask."
4. **Conversion ask** — pivot to a follow-up commitment before the visitor leaves. Default chip: `send-market-report` or `similar-homes` (ConversionPrompt). Optional chip: `private-showing`, `timeline-question`. Time hint: "Before they head to the door."
5. **Close + next-action note** — closing line + agent's own jotted next-action (drop a card, get contact, "text them at 4pm tomorrow"). Default chip: `closing-offer`. Hooks into existing `followUpCommitments` array. Time hint: "After they leave."

The 5 steps map cleanly to the existing libraries' `isDefaultSelected` entries — 4 of the 4 default talking points have an obvious step home, the 2 default conversion prompts both belong in Step 4, and one of the 4 default common questions (`compare-to-recent-sales`) belongs in Step 3. The other defaults (Schools, Renovations, Seller motivation) become a small "If they ask…" sidebar that survives off-arc, since those questions don't follow the linear flow.

## Data-Model Change Options

### Option A — Content-only reframe (PDF + UI render layer only)

Keep the draft shape identical. Change `StepTalkingPoints.tsx` and `OpenHousePrepAgentPdf` to assign each entry to a step via a hardcoded `LIBRARY_ID -> STEP_INDEX` map maintained alongside each library. Render the PDF as 5 numbered sections instead of 3 topical sections. No I/O contract change, no draft-migration concern, no override behavior change.

Risk: lowest. Ship speed: fastest. Downside: the step assignment is *implicit and static* — the agent can't move an entry from Step 2 to Step 3 for this listing. Defensible for v1.46 because the wedge bet is that *most agents want the same shape most of the time*; per-listing customization is a v1.47+ concern.

### Option B — Wizard reframe + content reframe (recommended)

Same as Option A, but additionally:

- Add a new optional `Record<string, number>` field on `OpenHousePrepDraft` — call it `stepAssignments`, mapping library entry ID to step index 1-5. Empty/absent means "use the library default mapping."
- Rewrite `StepTalkingPoints.tsx` as a 5-step accordion (Step 1, Step 2, …) where the agent sees the default assignment, can drag/click to reassign entries between steps, and can still toggle entries on/off and override text per entry.
- PDF reads `stepAssignments` first, falls back to the static default map.

Risk: medium. The draft shape gains one optional field — `clampDraft` ([`engine/types.ts:113`](../../../src/tools/open-house-prep/engine/types.ts)) gets one new coalesce branch, fully backward-compatible since the field is optional and absence falls through to defaults. No migration needed for existing localStorage drafts. Ship speed: medium. Upside: aligns the wizard *shape* with the output *shape* — the agent learns the SOP while they prep, then takes the same SOP-shaped PDF to the event. That alignment is the operational-confidence payoff.

**This is the recommended path** because v1.46 is wedge-tightening on Open House specifically, and the wedge bet is that the SOP shape is what makes the surface load-bearing. Option A reshapes the *artifact* but not the *act of preparing*; the agent who fills out a 3-section picker still walks away thinking in 3 buckets. Option B teaches the SOP in the wizard, then hands it to them in the PDF. Same content, fully aligned shape, no I/O break.

### Option C — LLM prompt reframe

Not applicable. SEP is no-LLM per the stateless principle, confirmed by absence of any Anthropic/OpenAI imports in `src/tools/open-house-prep/`. The content libraries are verbatim hand-curated entries (Audit 1C constraints around fiduciary duty, NAR-settlement safety, and no-fabricated-stats). Introducing LLM generation here would re-open every one of those constraint review cycles and is out of scope for v1.46.

## Risk Assessment

- **Dual-output pattern:** Unaffected. Talking points have never appeared on the visitor handout (`OpenHouseHandoutPage` in [`handout-page.tsx`](../../../src/tools/open-house-prep/output/handout-page.tsx) renders 6 sections, none of them carry talking points / questions / prompts). The audit-flagged failure is on the agent-private PDF surface only. The visitor handout stays exactly as it is.
- **Override behavior:** Existing `talkingPointOverrides` and `commonQuestionOverrides` continue to work — they key on the library entry ID, which is preserved across the reframe. An agent who customized a line on v1.45 still sees their custom line on v1.46.
- **Library content:** Zero change. All 31 entries stay verbatim. Audit 1C content constraints (fiduciary duty, NAR-safe, no fabricated stats, no bracketed placeholders) are preserved because we don't touch the strings.
- **Backward compatibility:** Drafts saved on v1.45 load cleanly on v1.46 because the new `stepAssignments` field is optional and absent means "use defaults." `clampDraft` gains one branch.
- **Rollback story:** If the new shape doesn't land with Aaron's cohort, the rollback is a content-only revert of `StepTalkingPoints.tsx` and `OpenHousePrepAgentPdf` — the `stepAssignments` field can stay on the draft as a harmless no-op and ignore it on render. No data loss, no broken handouts.
- **Failure mode to watch:** Over-prescription. The 5-step SOP risks feeling rigid for agents who already have their own flow. Mitigation: keep entry-level toggle-off so an agent can blank a step that doesn't fit their style. The "If they ask…" sidebar survives off-arc questions.

## Implementation Scope Estimate

Targeting Option B, ~½–1 day Claude Code work:

- **Content map** (~30 min): Add a static `STEP_ASSIGNMENTS` constant alongside each library file or in a small new module — one ID per step. Codify the mapping spelled out above.
- **Draft type** (~15 min): Add optional `stepAssignments?: Record<string, number>` to `OpenHousePrepDraft`, extend `clampDraft`.
- **Wizard step rewrite** (~3–4 hr): Refactor `StepTalkingPoints.tsx` from 3 topical sections to 5 numbered step accordions, each showing assigned chips, allowing reassignment + override + on/off. Keep the existing "Show all" collapse pattern within each step.
- **PDF rewrite** (~2 hr): Rewrite the talking-points / common-questions / conversion-prompts blocks in `OpenHousePrepAgentPdf` as 5 numbered sections in the new SOP order. Move the off-arc common questions into a single small "If they ask…" sidebar at the end of the SOP.
- **Tests + visual QA** (~1 hr): Snapshot the new PDF, verify backward-compatible draft load, manual run through the wizard.

Total: well within a day. Fits v1.46 wedge-tightening because it sharpens the most-used Open House surface in the most-cited failure mode without touching the I/O contract, the visitor handout, the content libraries, or the publish pipeline.
