# Brand kit v3 — build handoff

**Branch:** `feat/sp-brand-kit-v3` off `main` @ `70926752` (hue-lock squash).
**Design source-of-truth:** `docs/design/brand-kit-v3/` (committed; README NON-NORMATIVE
deltas treated as binding).

## Commits
- `f0050e3` — design bundle.
- `eeb2d52` — Items 1–6 (core).
- `7dbe5e6` — Item 7 (stretch).

## What shipped (all items)
1. **Secondary row removed** (UI only). `brandSecondary` data field + engine + serializer
   projection untouched; engine still honors a saved secondary on publish. Saved-secondary
   → one quiet line (`brand-secondary-saved-note`).
2. **Suggested from your logo** — client-side canvas extraction (`src/lib/brand/logo-colors.ts`)
   with the ENGINEERING_NOTES guardrails (drop transparent / black-white / gray / <3% bins,
   merge near-dupes, cap 3). One tap applies to Signature via the normal commit path. No logo
   → visible-but-empty row → Profile. Extraction-framed, never AI; never fabricates swatches
   (the logo is a `data:` URL → canvas-safe, no CORS → STOP condition not triggered).
3. **Open full sample page** — new-tab link to the preview route in the CURRENT unsaved values
   (`brand-open-sample-page`), exact label.
4. **Readability v3** — collapses to "Readability all clear / Your page text passes contrast
   checks." with "View details"; warn renders expanded. **Engine body-text clamp:** new
   `--ink-text` role is body copy clamped ≥4.5:1 vs surface (lightness-only); `--ink` stays
   raw for layout-owned dark surfaces. "adjusted to stay readable" shows ONLY when the clamp
   moved a value. NO-OP at defaults (15.2:1) — asserted.
5. **Brand ready** closure state (`brand-ready-state`) — complete needs logo + agent name; a
   contrast warning is advisory and never downgrades it (render clamps protect every page).
6. **Real-template embedded preview** — the phone embeds `?embed=1` of the preview route;
   `EmbedBridge` (SAME-ORIGIN only) applies brand vars pushed live via postMessage (zero
   reloads), with a debounced param-reload fallback. MiniPage retired + deleted. The
   `brand-minipage-preview` testid moved to the embedded `<iframe>`.
7. **STRETCH SHIPPED** — palette-chip hover/tap → `sep-highlight-role` → the embed briefly
   outlines elements carrying that role (~1.5s fade). Markup churn was purely additive
   (`data-brand-role` attrs), so baselines didn't move.

### ⚠️ Preview scroll behavior — flag for smoke
The embedded preview is the REAL full-length seller page, so it **scrolls inside the phone
frame like a real device** (its own document scroll). This is deliberate and distinct from
the cramped replica scroll that was rejected — full-length confirmation also lives in "Open
full sample page." Please confirm this reads right.

## Corrections honored (production truth over the mock)
Production dropdown (Editorial/Studio/Warm) kept over the card picker; 7-role token strip
kept (friendly labels, tokens unchanged); surfaces `#F1EBE0` / `#1A1612`; Mock-states bar
not ported; phone content is the real template, not the Riese & Co. fiction.

## Preserved interactions
Native OS picker on signature + both surface rows; hex commit-on-blur/Enter with invalid
revert; Reset → `#C26A4E`; Page-surface disclosure collapsed by default; never writes on
mount; autosave on change; readability never blocks save. Testids preserved + added
(`brand-color-accent/-background/-text`, `-picker-*`, `brand-palette-strip`, `-chip-*`,
`brand-readability-verdict/-fixes`, `brand-autosave-indicator`, `brand-surface-disclosure`,
`brand-minipage-preview`; new: `brand-secondary-saved-note`, `brand-logo-suggestions(-empty)`,
`brand-logo-suggestion-<n>`, `brand-open-sample-page`, `brand-ready-state`).

## Invariants
Byte-identical: `public-payload.ts`, publish/revoke routes, `prep-pdf.tsx`,
`entitlements/resolver.ts`, `BrandProfileForm.tsx`. Engine change = the body-text clamp only
(additive `ink-text` role + `--ink-text` token). Zero-cyan gate + page-render baselines green.

## Diff-stat (vs main, excl. design bundle)
14 files, +1253 / −1059. Largest: `BrandKitForm.tsx` rewrite (+737/−); `MiniPage.tsx` deleted
(−220); `settings-brand-kit-v2.spec.ts` → `-v3.spec.ts`.

## Spec changes
- `settings-brand-kit-v3.spec.ts` (replaces v2): secondary removed + saved-note; logo states
  (logo/no-logo/apply-commits); sample-page href carries current unsaved values; readability
  collapse/expand + adjusted-only-when-clamped; Brand-ready both states + not-downgraded;
  no-write-on-mount; embedded-iframe preview + disclosure + pickers.
- `seller-presentation.embed.spec.ts` (new): embed=1 marks doc + hides chrome; applies
  same-origin posted vars; REJECTS cross-origin; non-embed attaches nothing; highlight stretch.
- `brand-color-engine.spec.ts` (+3): body-clamp NO-OP at defaults + convergence (light/dark).
- A test-only note: `addInitScript` runs in every frame incl. the same-origin preview iframe;
  the seed helpers guard to the top frame so the iframe reload can't re-seed/clobber.

## Gates
`npm run build` exit 0 · truthful-copy PASS · full chromium suite green (known-acceptable reds
only).

## Smoke (Dallen)
Dial colors → watch the REAL template respond live (and judge the phone-scroll behavior);
logo suggestions (with/without a logo); Open full sample page from unsaved values; readability
collapse + honest "adjusted" copy on a low-contrast body choice; Brand-ready both states;
secondary-saved note (you have a saved secondary to test with); mobile. Then PR + squash.

Preview URL (branch alias, stable):
https://social-animat-git-08516e-dallentaylorproductions-5050s-projects.vercel.app
- Brand kit (the whole v3 form + live embedded preview): `/settings/brand`
- Embedded preview seen standalone (cobalt): `/seller-presentation-preview?fixture=full&brandAccent=%232C53C4`
