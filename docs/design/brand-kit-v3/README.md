# Brand kit v3 — "Minimal confidence" mock

Optimizes the shipped v2 settings screen for **first-time success** and
**decision-fatigue reduction**. One settings screen, desktop + mobile, with a
full-length live preview.

## Files
- `brand_kit_v3.html` — the settings screen (React, single layout).
- `sample_page.html` — full-length sample seller page; opened in a new tab in the
  current (even unsaved) colors via URL params.
- `js/color-utils.js` — one-signature OKLCh derivation + WCAG contrast/clamp engine.
- `js/components.jsx`, `js/status.jsx`, `js/preview.jsx`, `js/app.jsx` — UI.

## Mock controls (scaffolding, not product UI)
The dark bar at the very top is **review-only**. It flips the conditional states so
engineering can see each one against the real layout:
- **Viewport** Desktop / Mobile
- **Logo in profile** — drives the "Suggested from your logo" swatch row + Brand-ready.
- **Agent name** — drives Brand-ready completeness.
- **Secondary saved** — shows the single quiet existing-secondary line.
- **Readability** Pass / Warn — Warn writes a low-contrast page text so the warning
  state renders truthfully (real recompute, not a fake panel).

## Deltas from v2
1. **Secondary color row removed** from the UI. Engine + data field stay. If a saved
   secondary value exists, one quiet collapsed line renders under Signature:
   "Secondary color saved for future templates." (`brand-secondary-saved`). Nothing else.
2. **"Suggested from your logo"** added directly under Signature when a logo exists — up
   to 3 extracted swatches, one tap applies to Signature. Copy is extraction-framed
   ("We found this color in your logo." / "Suggested from your logo."), never AI. With no
   logo the row stays **visible but empty** — "Upload a logo and we'll suggest colors from
   it." (links toward Profile), never assumptive swatches. Guardrails in
   `ENGINEERING_NOTES.md`.
3. **"Open full sample page"** added under the preview — opens a new tab rendering the
   full seller page in the current unsaved colors. Exact label preserved.
4. **Readability collapses on a clean pass** — "✓ Readability all clear / Your page text
   passes contrast checks." + quiet "View details". Warning stays expanded. Truthful
   copy: "adjusted" appears only when the clamp actually moved a value; a clean pass
   never mentions clamping.
5. **"Brand ready" closure state** at the end of the form — Complete / Almost ready.
   One calm line, not a checklist, no gamification.
6. **Preview fixes (Dallen's smoke):**
   - Phone no longer scrolls internally — the frame grows to the MiniPage's full height;
     the settings page scrolls. No inner scrollbar, no hidden content.
   - Hero compressed (88px hatch) so it stops dominating; the scrim band (eyebrow +
     address + CTAs) is emphasized as the first brand impression. Hero stays un-branded.
7. **Scope line placed adjacent to autosave** — "Existing published pages keep their
   original colors. New publishes use your latest brand." sits right under "Saved
   automatically." so it's read at the moment of change.

No before/after strip (explicitly rejected). One signature → derived ramp → layout owns
surfaces. Sentence case, calm-dark aesthetic, truthful copy throughout.

## Preserved interactions
- Signature swatch opens the native OS color picker; hex commits on blur/Enter, invalid
  reverts; Reset restores `#C26A4E`.
- Palette strip is read-only and recomputes live.
- Page-surface disclosure keeps Background + Text rows with pickers + hex.
- Never writes on mount; autosaves on change; readability never blocks saving.
- Testids preserved: `brand-color-accent`, `brand-color-background`, `brand-color-text`,
  `brand-color-picker-*`, `brand-palette-strip`, `brand-palette-chip-*`,
  `brand-readability-verdict`, `brand-readability-fixes`, `brand-autosave-indicator`,
  `brand-minipage-preview`, `brand-surface-disclosure`. (New: `brand-logo-suggestions`,
  `brand-logo-suggestions-empty`, `brand-secondary-saved`.)

## Decided
- **A contrast warning does NOT downgrade "Brand ready."** It is advisory only —
  render-time clamps keep published pages readable regardless — so Brand ready depends
  on profile completeness (logo + agent name) alone. The readability block still warns
  in place; the two are independent. (Mock reflects this: logo on + Warn → "Brand ready ✓".)
- **The sample-page tab is throwaway.** Each click of "Open full sample page" opens a
  fresh tab with the current unsaved values via URL params; there is no live sync back to
  the opener and a stale/refreshed tab is expected and acceptable.

## Open questions
1. **Suggestion → readability interaction.** A one-tap logo suggestion can itself be a
   low-contrast signature. Do we clamp it silently for on-page text (current behavior, the
   swatch fill is untouched) or surface a tiny inline note on apply? Current mock stays
   quiet and lets the readability block speak.
2. **Suggestion count when the logo yields 1 usable color.** Copy switches to singular
   ("We found this color in your logo.") — confirm that's the right voice vs. always
   plural.
3. **Palette roles.** The six derived shades are labeled Wash/Tint/Soft/Hover/Deep/Ink.
   These names are illustrative — see non-normative deltas below for the shipped token
   contract; confirm the mapping.

## NON-NORMATIVE: known deltas from production
Treat the following as **illustration, not spec** — they exist to make the mock concrete
and will be replaced by production truth on integration:

- **Phone preview content is illustrative fiction.** "Riese & Co.", the listings, and the
  "Contact agent" / "Schedule tour" CTAs are placeholder content. Production truth is the
  real **Seller Presentation** template; engineering will embed the actual production
  preview route inside the phone frame rather than this hand-built MiniPage.
- **The "Default layout: Spotlight / Grid / List" picker is a future concept only.**
  Production's shipped enum is a **dropdown**: Editorial (live) / Studio / Warm (coming
  soon). The card-picker treatment in this mock is banked for when Studio/Warm become
  real — it is not the current control.
- **Palette chip names are friendly labels only.** Wash/Tint/Soft/Hover/Deep/Ink are
  human-readable stand-ins. The shipped contract is the **7-role token set**: `signature`,
  `signature-deep`, `signature-link`, `tint-12`, `tint-6`, `line-30`, `on-signature`.
  Align the strip to these on integration.
- **Production surface defaults differ.** Production defaults are **#F1EBE0** (background)
  / **#1A1612** (text). The mock now uses these values; if you see other hexes in older
  screenshots they predate this alignment.
