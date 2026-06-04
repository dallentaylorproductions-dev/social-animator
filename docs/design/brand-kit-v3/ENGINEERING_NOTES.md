# Engineering notes — Brand kit v3

Implementation spec for the four behaviors that need server/engine support. The mock
demonstrates the UI contract; this fixes the rules behind it.

---

## 1. Logo color extraction (the "Suggested from your logo" row)

**Framing rule (non-negotiable):** this is *extraction*, never AI/intelligence. Copy is
fixed: "We found this color in your logo." (one result) / "Suggested from your logo."
(multiple). Do not introduce "smart", "AI", "recommended for you", etc.

**Source:** the logo uploaded in Profile. Extract on upload (and re-extract if the logo
changes); cache the result on the profile record so the settings screen renders instantly.

**Pipeline:**
1. Decode the logo to RGBA. If it has transparency, drop fully/near-transparent pixels
   (alpha < ~24/255) before sampling — logos are usually transparent PNGs and the
   background must not contribute.
2. Quantize (median-cut or k-means, ~8–16 bins) on the remaining pixels.

**Exclusions (drop a candidate bin if any holds):**
- **Pure black / white:** OKLCh L ≤ 0.12 or L ≥ 0.93.
- **Grays / near-neutral:** OKLCh C < 0.04 (chroma too low to read as "a color").
- **Tiny-accent pixels:** bin covers < ~3% of the sampled (non-transparent) pixels —
  prevents a stray 5px logo flourish from becoming a suggestion.
- **Near-duplicates:** if two surviving bins are within ΔL ~0.05 **and** ΔH ~8°, keep the
  one with the larger pixel share.

**Cap & order:** keep at most **3**, ordered by pixel share (most dominant first).

**No-logo / no-usable-color fallback:** if there is no logo, or zero bins survive the
exclusions, **render the row visible but empty** — copy: "Upload a logo and we'll suggest
colors from it." with a link toward Profile (`brand-logo-suggestions-empty`). Never show
assumptive/example swatches in this state. The mock's "Logo in profile: No" toggle
demonstrates exactly this.

**Apply:** tapping a swatch sets it as the Signature (same path as the picker/hex commit
→ triggers derivation + autosave + readability recompute). It does **not** auto-dismiss
the row; the active swatch shows a check so a re-tap is a no-op.

---

## 2. Full-sample-page param passing (current, unsaved values)

"Open full sample page" must reflect the **working** state, including edits not yet
flushed by autosave — never the last persisted brand.

- Open `sample_page.html` in a new tab with the **live in-memory** values, not a server
  read:
  `?accent=<sig>&bg=<pageBg>&text=<pageText>&layout=<layout>&agent=<name>&logo=<0|1>`
- Hex values are passed `#`-encoded (`%23`). The sample page normalizes/validates each
  param and falls back to the v2 defaults on anything invalid.
- The sample page is a **read-only render** — it must not write brand state or publish.
  A persistent ribbon states it is "rendered in your current colors (not yet published)".
- Do not name the route/flag user-visibly "fixture", "route", or "preview params" — the
  label stays exactly **"Open full sample page"**.
- Production note: prefer routing through the real seller-page renderer with an override
  context (so the sample can't drift from production) rather than this static fixture; the
  param contract above is what that renderer should accept.

---

## 3. Brand-ready completeness conditions

`brand-ready` is **closure, not a checklist** — one line, computed, no per-item UI.

**Complete** ("✓ Brand ready — Your color, logo, and page contrast are set for seller
pages.") requires **all**:
- Signature color set (always true; defaults to `#C26A4E`).
- Logo present in Profile.
- Agent name present in Profile.

**Decided:** a contrast warning is **advisory only and does NOT downgrade** Brand ready.
Render-time clamps keep published pages readable regardless, so completeness depends on
profile fields (logo + agent name) alone. The readability block warns independently and
in place; the two never gate each other. (Earlier drafts gated this on a body-text
contrast pass — that requirement has been removed.)

**Incomplete** ("Almost ready — Add your agent name and logo so seller pages feel
complete." + link to Profile) whenever logo or agent name is missing. Copy names the
Profile-owned gaps because those are what the user fixes elsewhere.

---

## 4. Preview full-height layout (no internal scroll)

The defect: the phone had a fixed height and scrolled internally, hiding content and
showing an inner scrollbar.

**Approach:**
- The phone frame is **height: auto** — it grows to the MiniPage's natural height. No
  `overflow: scroll/auto` and no fixed/max height anywhere on the phone or its screen.
- The MiniPage renders its **full** length (hero → scrim → all listings → footer); nothing
  is clipped.
- Scrolling belongs to the **settings page** (document), not the preview. On desktop the
  two columns flow in normal document height; the page scrolls as one.
- **Hero weighting:** the hero is a compressed fixed-height un-branded hatch (~88px in the
  mock) — deliberately small because photos aren't brand-colored. The scrim band
  immediately below (eyebrow in the on-surface-safe brand shade + address + CTAs) carries
  the first brand impression. Keep this ratio when porting: hero small, scrim prominent.
- Do not reintroduce a sticky/owned-scroll preview; if vertical space is a concern on
  desktop, let the column be tall and rely on page scroll.

---

## Color engine reference (`color-utils.js`)

- **One-signature derivation:** `deriveRamp(sig)` → 6 OKLCh shades at fixed lightness
  targets, chroma scaled down toward the light end. Read-only; recomputes on every
  signature change. Role labels are illustrative — align with your token names.
- **On-surface accent clamp:** `accentOnSurface(sig, surface)` returns
  `{ hex, adjusted }`. If the signature already passes AA on the surface it is returned
  untouched (`adjusted: false`). Only when it fails does the engine walk lightness toward
  contrast and return `adjusted: true`. **This boolean is the single source of truth for
  the "adjusted" copy** — never say "adjusted" when it's false.
- **Contrast:** standard WCAG relative-luminance ratio; AA threshold 4.5:1 for body text
  and on-page accent text. Button labels use `readableInk(fill)` (black/white pick).
- Readability **never blocks save**. Autosave fires on change only (never on mount).
