# Handoff: SEP Studio — Brand Kit System (Settings + Wizard drawer + Published-page admin chrome)

## What this is
A **Brand Kit System** for SEP Studio. A real-estate agent sets 3 brand colors once (background, text, accent) and those colors flow into every seller page they publish. The same form (`BrandKitForm`) and the same brand-driven preview (`MiniPage`) appear in three places:

1. **Settings** (`/settings/brand`) — first-time setup + comprehensive home. 2-column (form + preview).
2. **Wizard drawer** — right slide-over inside the seller-presentation builder, for tune-while-building.
3. **Published-page admin chrome** — overlay on the live `/h/<slug>` page, for tune-at-result (only the signed-in publishing agent sees it).

All three edit the same `BrandSettings` record. Settings is the home; the drawer + admin chrome are quick-access portals to the same data + the same form.

This is a **design reference built in HTML/React** (in-browser Babel), not production code. Recreate it in the target codebase (Tailwind) using its own components. The JSX is the source of truth for structure/state/copy; `brand_kit.css` is the source of truth for visuals.

## Files
- `brand_kit.css` — **single shared stylesheet**, source of truth for visuals. Two layers: (1) the SEP picker **chrome** (dark + mint), (2) the brand-driven **MiniPage** where every color traces to `--m-bg` / `--m-text` / `--m-accent`. Linked by all three HTML files so the visual language is identical everywhere.
- `mini_page.jsx` — `MiniPage`, brand-driven + theme-prop-controlled (see below).
- `brand_kit_form.jsx` — `BrandKitForm`, the one controlled component used in all 3 contexts. Also exports the WCAG helpers.
- `brand_settings.html` — full-page `/settings/brand` mockup (tabs, header, 2-col form).
- `wizard_with_drawer.html` — builder Review step with the brand drawer (closed by default; open it via "Tune brand").
- `published_admin_chrome.html` — live seller page with agent admin chrome + the republish contract.
- Each HTML loads React 18 + Babel via the pinned CDN tags, then `mini_page.jsx`, then `brand_kit_form.jsx`, then a small inline app script that owns state and mounts the form.

## Component reuse contract

### `<BrandKitForm>` — renders in all 3 contexts
```jsx
<BrandKitForm
  values={{ background, text, accent, defaultThemeId }}
  onChange={(next) => /* parent persists */}
  layout="page" | "drawer"          // 2-column vs stacked
  showRepublishReminder={boolean}    // true in Settings + published-admin; false in wizard drawer
  defaults={{ background, text, accent }}  // for per-row "Reset to default"
/>
```
Controlled — the parent owns `values` and persists; the child renders. Contains: three color rows (native `<input type="color">` + editable hex field + per-row Reset), accent contract microcopy, the Default-layout dropdown, the **Readability panel** (see below), the `MiniPage` preview, a "Saved automatically." autosave indicator, and the optional republish note. `layout="page"` puts controls left + preview right; `layout="drawer"` stacks preview-on-top then controls.

### Readability panel (replaces the raw-ratio warning)
The brief's locked decision #5 (non-blocking WCAG heads-up) is honored, but **the presentation was redesigned** after user testing: a raw readout like `Text on background 1.87:1 (aim 4.5:1)` asks the agent to do math and then somehow translate a number into a color choice. Entry-level users couldn't act on it. The panel now:
- Gives a **plain-language verdict** ("Easy to read" / "Could be hard to read") with a calm icon, never a bare number as the primary signal.
- Shows **live sample chips** ("Body text", "Links & prices") rendered in the agent's actual colors, so readability is *seen*, not calculated. The exact ratio stays as a tiny faint mono tag (`CLEAR 14.5` / `LOW 1.6`) for power users who want it.
- When contrast is below target, offers **one-tap fixes that come from either side of the relationship**, so all three colors are reachable (not just text + accent). Two helpers compute candidates: `suggestForeground()` nudges a foreground's lightness; `suggestBackground()` nudges the background's lightness so every failing pair clears at once. Both preserve hue + saturation (the color stays the agent's). Every offered option *fully* resolves the issue:
  - **Both text & accent low** (the background is usually the real culprit) → the **recommended** hero is *"Use a lighter/darker background, fixes your text and accent in one tap"*; the alternative is *"Adjust your text & accent, keeps your background color."*
  - **Only text (or only accent) low** → the recommended hero is the foreground fix *(keeps your background)*; the alternative is *"Use a lighter/darker background."*
  - The agent always chooses which color to keep; there's always a single tap that fully fixes it.
- Stays **non-blocking** — the agent can ignore every suggestion and still save.
- Is **always present** (positive reinforcement when colors pass), not just on failure. The fix block appears only when there's something to fix.

This keeps the surface easy for newer users (see it, tap to fix) without limiting anyone who knows exactly what they want (the native pickers + hex inputs are untouched; suggestions are opt-in). Targets unchanged: text vs bg ≥ 4.5:1, accent vs bg ≥ 3:1.

### `<MiniPage>` — brand-driven, theme-prop-controlled
```jsx
<MiniPage bg="#f4efe5" text="#221d16" accent="#bf512c" themeId="editorial" scale={0.74} />
```
The **token inversion** vs the old `theme_picker.jsx` MiniPage: colors are no longer baked per theme. **Colors come from `bg`/`text`/`accent` props** (set as `--m-bg` / `--m-text` / `--m-accent`); every other color is derived from those three via `color-mix` in `brand_kit.css` (muted text, faint, rules, the dark agent-footer card, etc.). **Layout/typography come from `themeId`.** Only `"editorial"` exists today (Spectral serif headlines, magazine rhythm, serif numerals, dark footer). `"studio"` and `"warm"` **fall back to editorial** until those layouts are built (see Open items). `scale` (default 1) scales the whole page; a `ResizeObserver` keeps the outer box sized to the scaled height so layout reserves real space.

Accent renders on (and only on): **links, prices, CTA buttons, section accents/eyebrows, dividers, the play button, and the footer CTA.** Never on large surfaces. This matches the microcopy beneath the Accent picker.

## Locked decisions (do NOT redesign)
1. **3 colors per agent:** `brandBackground`, `brandText`, `brandAccent`. Not a full design system. Logo / fonts / secondary accent / gradients are out of scope.
2. **Native HTML5 color pickers** (`<input type="color">`). Not custom widgets.
3. **Tab nav on `/settings`:** `Profile | Brand`. Default landing = Profile (this mockup shows Brand active).
4. **Editorial = the live default** (matches current production: cream `#f4efe5` + ink `#221d16` + terracotta `#bf512c`). Studio + Warm are `Coming soon`.
5. **WCAG AA contrast warning, non-blocking.** Text vs bg < 4.5:1, or accent vs bg < 3:1 → flag it. Agent can still save. **Presentation changed from the brief:** instead of a raw-ratio panel, this ships as the actionable **Readability panel** (plain verdict + live samples + one-tap suggested-color fix). See the BrandKitForm section. Thresholds and non-blocking behavior are unchanged.
6. **Accent contract** as above; microcopy beneath the Accent picker explains it.
7. **Brand-level default theme:** the `Default layout` dropdown seeds new presentations. Default `Editorial`; Studio + Warm grayed `Coming soon`.
8. **Autosave** — no Save button; "Saved automatically." indicator (flips to "Saving…" on change).
9. **Logo is OUT of scope.**

## Tokens (picker chrome — the agent-facing UI; canonical block is `:root` in `brand_kit.css`)
- Canvas `--bg #0e0d0c`, panel `#19171a`, panel-2 `#201d20`. Text `#f4f2ef`, muted `#a6a39d`, faint `#6f6c66`.
- SEP product accent **mint `#6ee7c7`** (selection, primary CTAs, dots) with soft/line/glow variants. This is the SEP brand, NOT the agent's.
- Amber/gold `#e8c37a` reserved for the WCAG warning panel here (and future "Pro").
- Border-strong `rgba(255,255,255,0.13)`. Radius `18px`. Ease `cubic-bezier(0.22,1,0.36,1)`.
- Type: **Hanken Grotesk** (all UI), **Spectral** (Editorial mini's serif headlines + price), **JetBrains Mono** (eyebrows / tiny uppercase labels).
- No em-dashes in copy (project-wide rule).

The agent's three brand colors are independent of this chrome — a cream Editorial preview sits inside the dark + mint UI everywhere.

## How agents discover each surface
- **Settings → everywhere:** Settings is the home + first-time setup. It links nowhere special; it's reached from the app's Settings nav (`Profile | Brand`).
- **Wizard "Tune brand":** a calm secondary affordance (mint dot + label) in the builder chrome (top-right and in the Review footer). Opens the same form in the right drawer. No reminder note here — they're still building, nothing is published yet.
- **Published-page "Tune brand":** in the agent-only admin bar on the live page. Opens the same drawer; here the **Republish** button is the explicit apply action.

## The republish contract (published-page admin chrome)
Brand color changes do **not** auto-apply to the cached server-rendered `/h/<slug>`. The mockup models this with two records on purpose: `published` (what the live page shows) and `draft` (what the drawer edits). The live page renders `published`; the drawer renders `draft`; they converge **only** when the agent clicks **Republish** (toast confirms). The heads-up microcopy states this plainly. New pages pick up the colors automatically; only already-published pages need a republish.

## Cohort safety (highest priority)
Real agents (Aaron Thomas Home Team cohort, launched 2026-06-01) are in production now. This system ships defaulting to Editorial, so **agents who never visit Brand kit publish pages byte-identical to today.**
- First load is **"customize what you already have,"** not "start from a blank canvas": all three pickers are pre-populated with the Editorial hex values, the preview renders the current published look, and the Default-layout dropdown is pre-selected to Editorial.
- Unset / never-touched = current production. The defaults ARE the current production palette.
- Regression risk to watch in the build: anything that writes `BrandSettings` for an agent who never opened the form, or that changes the seed values away from `#f4efe5 / #221d16 / #bf512c`, would break byte-identity. Keep "unset" meaning "use the Editorial defaults," and don't persist on mount.

## Open items / alternatives considered (please weigh in before the build)
1. **Studio + Warm layouts don't exist yet.** `MiniPage` accepts `themeId="studio"|"warm"` but falls back to the Editorial layout. The dropdown grays them as `Coming soon`. Swap in real layouts when built.
2. **Preview scale.** The brief suggested ~0.4 (Settings) / ~0.5 (drawer) / 1.0 (published). At our `MiniPage` natural width (360px) those read too small in the wide Settings column, so we used ~0.74 (Settings) / ~0.78 (drawer) and full-width at scale 1 on the published page (the page IS the MiniPage). Easy to retune via the `scale` prop — flag if you want the literal brief values.
3. **Settings layout: 2-column vs single-column.** We shipped 2-column (form left, sticky preview right) per the brief. A single-column "form, then preview below" reads better on narrow laptops and matches the drawer's stacked order; it already happens at ≤880px. If you'd prefer single-column everywhere for consistency with the drawer, that's a one-line change (`layout` always stacked).
4. **Drawer position: right slide-over vs bottom sheet.** We used the right slide-over per the brief (it keeps the wizard/page visible alongside). A bottom sheet would be more thumb-friendly on mobile but hides more of the page-being-tuned. Right slide-over going full-width under 640px is the current mobile behavior.
5. **Editable hex field.** Beyond the native picker, each row has a typeable hex input (commits on blur/Enter, reverts on invalid). Not in the brief, but it's the fastest path for an agent pasting a brand hex. Drop it if you'd rather keep the surface to just the native picker.
6. **"Preview as seller" toggle** (published page) hides ALL admin chrome to prove the seller sees a clean page. It's a mockup affordance to demonstrate the agent-only distinction; in production the seller simply isn't signed in, so they never get the chrome at all.
7. **Real imagery.** The hero photo, video, and agent avatar in the MiniPage are striped CSS placeholders labeled `PHOTO`. Drop in the real listing photo + headshot for true previews.
8. **Autosave debounce.** The mockup flips "Saving… → Saved" on every change. Production should debounce writes (the brief says "same pattern as `BrandProfileForm`" — match that exactly).

## Contradictions / under-specified items flagged
- The brief's preview scales (0.4 / 0.5 / 1.0) fight the MiniPage's natural width in the actual column widths — resolved as Open item #2.
- "Light-amber panel" on a dark UI: implemented as a translucent gold-tinted panel (`--gold-soft` fill, `--gold-line` border, warm-amber text) so it reads as a calm heads-up, not an error. Confirm the tone is right.

## Suggested build order (informs the build packets)
1. `MiniPage` (`mini_page.jsx`) with the inverted token contract — colors from props, layout from `themeId`.
2. `BrandKitForm` (`brand_kit_form.jsx`) as a controlled component (WCAG helper at top).
3. `brand_settings.html` — wrap the form (`layout="page"`, `showRepublishReminder`).
4. `wizard_with_drawer.html` — drawer is a slide-over wrapper around the form (`layout="drawer"`, no reminder).
5. `published_admin_chrome.html` — same drawer pattern + the published/draft split + Republish.
6. This README ties it together.

End-to-end chain: visual design (this) → build packets (Cowork updates E.0 / E.0.1 / E.0.2) → implementation (Claude Code) → browser smoke → production merge.
