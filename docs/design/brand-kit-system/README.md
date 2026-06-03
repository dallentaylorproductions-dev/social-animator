# Handoff: SEP Studio — Brand Kit System

## Overview
A **Brand Kit System** for SEP Studio (a real-estate seller-presentation builder). An agent sets **3 brand colors** once — `background`, `text`, `accent` — and those colors flow into every seller page they publish. The same form and the same live preview appear in three surfaces, all editing one `BrandSettings` record:

1. **Settings** (`/settings/brand`) — first-time setup + comprehensive home (2-column form + preview).
2. **Wizard drawer** — right slide-over inside the presentation builder (tune-while-building).
3. **Published-page admin chrome** — overlay on the live `/h/<slug>` page, visible only to the signed-in publishing agent (tune-at-result; Republish to apply).

It replaces the old model where a hardcoded "Editorial" palette (cream + ink + terracotta) rendered on every agent's page. It ships **defaulting to Editorial**, so agents who never open it publish byte-identical pages to today (cohort safety is the top priority).

## About the design files
The files in this bundle are **design references created in HTML/React (in-browser Babel)** — prototypes showing the intended look and behavior, **not production code to copy directly**. The task is to **recreate these designs in the target codebase** (the production app uses **React + Tailwind**) using its established components and patterns. The JSX is the source of truth for structure/state/copy; `brand_kit.css` is the source of truth for visuals. Recreate, don't port: the plain-CSS + CDN-React setup is for clarity only.

## Fidelity
**High-fidelity.** Final colors, typography, spacing, copy, and interactions. Recreate pixel-faithfully using the codebase's libraries. Exact values are below.

---

## Architecture (the elegant core)

Two reusable pieces power all three surfaces:

### `BrandKitForm` — one controlled component, three contexts
```jsx
<BrandKitForm
  values={{ background, text, accent, defaultThemeId }}
  onChange={(next) => /* parent persists */}
  layout="page" | "drawer"          // 2-column vs stacked
  showRepublishReminder={boolean}    // true: Settings + published-admin; false: wizard
  defaults={{ background, text, accent }}  // for per-row "Reset to default"
/>
```
Controlled — the **parent owns `values` and persists**; the child renders. `layout="page"` = controls left + sticky preview right; `layout="drawer"` = preview on top, then controls stacked.

### `MiniPage` — brand-driven preview (token inversion)
```jsx
<MiniPage bg="#f4efe5" text="#221d16" accent="#bf512c" themeId="editorial" scale={0.74} />
```
- **Colors come from props** (`bg`/`text`/`accent`), set as CSS custom properties `--m-bg`/`--m-text`/`--m-accent`. **Every other color is derived from those three** via `color-mix` (no theme-baked colors anywhere).
- **Layout/typography come from `themeId`.** Only `"editorial"` exists today (Spectral serif headlines, magazine rhythm, serif numerals, dark agent footer). `"studio"`/`"warm"` fall back to Editorial until those layouts are built.
- `scale` (default 1) scales the whole page; a `ResizeObserver` keeps the outer box sized to the scaled height so layout reserves real space.
- Derived shades (recreate exactly):
  - muted text `color-mix(in srgb, text 60%, bg)`
  - faint `color-mix(in srgb, text 40%, bg)`
  - rule/divider `color-mix(in srgb, text 14%, bg)`
  - footer bg `color-mix(in srgb, text 90%, bg)`; footer ink `color-mix(in srgb, bg 92%, text)`
- **Accent contract** — accent renders ONLY on: links, prices (and the `$`), section eyebrows, the divider rule, list numerals, the video play button, area-stat numbers, and the footer CTA. Never on large surfaces.

---

## Design tokens

### Picker chrome (the dark + mint agent-facing UI; this is the SEP product brand, NOT the agent's colors)
| Token | Value |
|---|---|
| `--bg` | `#0e0d0c` |
| `--panel` | `#19171a` |
| `--panel-2` | `#201d20` |
| `--border` | `rgba(255,255,255,0.075)` |
| `--border-strong` | `rgba(255,255,255,0.13)` |
| `--text` | `#f4f2ef` |
| `--muted` | `#a6a39d` |
| `--faint` | `#6f6c66` |
| `--mint` (primary accent) | `#6ee7c7` |
| `--mint-soft` | `rgba(110,231,199,0.13)` |
| `--mint-line` | `rgba(110,231,199,0.32)` |
| `--mint-glow` | `rgba(110,231,199,0.18)` |
| `--gold` (warning) | `#e8c37a` |
| `--gold-soft` | `rgba(232,195,122,0.12)` |
| `--gold-line` | `rgba(232,195,122,0.34)` |
| Radius | `18px` (cards), `11px` (buttons/inputs), `8px` (small) |
| Ease | `cubic-bezier(0.22, 1, 0.36, 1)` |

### Agent brand defaults (= current production Editorial palette; DO NOT change)
| Color | Hex |
|---|---|
| `brandBackground` | `#f4efe5` |
| `brandText` | `#221d16` |
| `brandAccent` | `#bf512c` |
| `defaultThemeId` | `editorial` |

### Typography (all already loaded in the SEP head; do not add new fonts)
- **Hanken Grotesk** — all UI (weights 400/500/600/700/800; italic 500/600).
- **Spectral** — Editorial MiniPage serif headlines + price (400/500/600; italic).
- **JetBrains Mono** — eyebrows / tiny uppercase labels (400/500).
- No em-dashes anywhere in copy (project-wide rule). Use commas or periods.

---

## Screens / Views

### 1. Settings — `/settings/brand` (`brand_settings.html`)
- **Top app bar** (sticky): SEP mark (24px rounded gradient square) + "SEP Studio" + breadcrumb "/ Settings"; right side: agent name + 28px avatar. Bottom border `--border`, blurred `rgba(14,13,12,0.7)` background.
- **Tab nav** (mirrors section tabs): pill group, `--panel` bg, 13px radius; tabs `Profile | Brand`. Active tab = `--text` bg with `#08120f` label. **Brand is active here; production default landing is Profile.**
- **Page header:** H1 "Brand kit" (30px / 800 / -0.02em), subhead "Your brand colors flow into every seller page you publish. Set them once." (16px `--muted`).
- **Body:** CSS grid `minmax(0,1fr) minmax(0,0.92fr)`, 44px gap, items start. Stacks to one column ≤880px.
  - **Left (controls):** three color rows, then Default-layout field, then the Readability panel, then the status block (see Components).
  - **Right (preview):** sticky (top 92px). Small "Preview" mono label + a mint "Live" indicator. A device frame (black, 8px padding, 22px radius, big soft shadow) wrapping the `MiniPage` at `scale ≈ 0.74`. Caption: "This is what your seller sees. It updates as you dial each color."

### 2. Wizard with drawer (`wizard_with_drawer.html`)
- **App bar:** SEP mark + "/ New presentation"; right side: a **"Tune brand"** affordance — calm secondary button, `--panel` bg, `--border-strong`, with a 9px mint dot + label. Hover → `--mint-line` border.
- **Step rail:** 6 steps (Listing/Price/Pitch/Area/Agent done, Review active). Done = mint check chip; active = `--text` filled numeral.
- **Review card** (`--panel`, 18px radius): eyebrow "Step 6 · Review", H1 "Ready for the Halloran family", subhead. A 2-col body: left = checklist (Listing & photos / Recommended price / Layout / Brand colors with live swatch chips); right = a small `MiniPage` (`scale ≈ 0.78`) labeled "Seller page". Footer: Back (ghost) + a second "Tune brand" + "Publish page" (primary mint).
- **Drawer** (see Components → Drawer). Opens from either "Tune brand". Contains `BrandKitForm layout="drawer"`, no republish reminder. Footer: "Saved automatically." indicator.

### 3. Published-page admin chrome (`published_admin_chrome.html`)
- **The live page** fills the viewport in the agent's **published** colors (cream Editorial by default), centered, max-width 440px. This stands in for the cached server-rendered `/h/<slug>`. (Here it's a `MiniPage` at `scale 1`, full width.)
- **Admin bar** (fixed top-right, `rgba(18,16,17,0.82)` + blur, `--border-strong`, 14px radius): a mint-pulse dot + "You're viewing **your own page**", then "Tune brand", "Republish" (primary), "Preview as seller" (quiet).
- **Heads-up hint** (fixed bottom-left, faint): explains color changes don't touch the live page until Republish.
- **Drawer:** same component, `showRepublishReminder={true}`, footer adds a **Republish** primary button and says "Saved as draft." (not "Saved automatically.").
- **"Preview as seller"** hides ALL admin chrome (demonstrates that a non-signed-in seller sees a clean page); an "Exit seller preview" button restores it.

---

## Components (precise specs)

### Color row (`.bk-row`)
- Layout: native `<input type="color">` styled as a **50×50, 13px-radius swatch** (remove default chrome via `::-webkit-color-swatch-wrapper { padding:0 }` + `::-webkit-color-swatch { border:1px solid --border-strong; border-radius:13px }`; same for `::-moz-color-swatch`). Hover scales 1.04.
- Right of swatch: label (14.5px / 600) + a "Reset to default" link (11.5px `--faint`, hover `--mint`, **disabled/hidden when value === default**), and below, an **editable hex input** (mono 12.5px, `--panel-2` bg, 104px wide, uppercase; commits on blur/Enter, reverts on invalid `^#([0-9a-f]{3}|[0-9a-f]{6})$`).
- Under the **Accent** row only: italic microcopy "Used for links, prices, CTA buttons, section accents, and dividers. Pick a color that draws the eye."

### Default-layout dropdown (`.bk-select`)
- Native `<select>`, custom chevron, `--panel-2` bg, `--border-strong`. Options: `Editorial` (selected), `Studio · Coming soon` (disabled), `Warm · Coming soon` (disabled). Hint: "The layout new presentations start with. You can switch any single presentation later."

### Readability panel (`.bk-read`) — the key UX, recreate exactly
Replaces a raw-ratio WCAG warning. **Always present** (reassures when colors pass; the fix block appears only on failure). Non-blocking — never prevents save.
- **Verdict pill:** good → check icon + "Easy to read" (mint); fail → warning triangle + "Could be hard to read" (amber `#f0dcae`). Panel border/bg goes amber (`--gold-line` / `--gold-soft`) when failing.
- **Sub copy:** good → "Your colors have plenty of contrast. Sellers will see your page clearly on any screen." fail → "A small tweak makes this easy to read on any screen. Pick whichever color you'd like to keep, you can still save either way."
- **Live sample chips:** two full-width rows rendered in the actual colors — "Body text" (in `text` on `bg`) and "Links & prices" (in `accent` on `bg`). Each has a small mono tag: `Clear`/`Low` + the ratio to 1 decimal (faint, for power users).
- **One-tap fixes** (only when failing): see Logic below. Each is a button with swatch(es) + bold label + sub note + "Apply →". The first option is the **hero** (mint-tinted bg + "Recommended" pill).

### Drawer (`.drawer` + `.scrim`)
- Right slide-over, **420px** wide (full-width ≤640px). `--panel` bg, left border `--border-strong`, big left shadow. Transform `translateX(100%)` → `none` on `.open`, transition `transform 0.42s var(--ease)`.
- Scrim: `rgba(6,6,7,0.46)` + 3px blur, fades in (`opacity 0.4s`). **Dismiss via × button, scrim click, or Escape.**
- Header: "Brand kit" + a context sub-line + 36px × button. Body scrolls. Footer: status (+ Republish button on the published page).

### Buttons
- `.btn-primary`: mint bg, `#08120f` text, soft glow shadow; hover brightness 1.06 + translateY(-1px).
- `.btn-ghost`: transparent, `--border-strong` border, `--text`.
- `.btn-quiet`: `--panel` bg, `--muted` text.
- `.tune-btn`: `--panel` bg, `--border-strong`, mint dot + label; hover `--mint-line`.

---

## Interactions & behavior

- **Live preview:** any picker/hex change updates `values` → `MiniPage` re-renders instantly. Settings + wizard show the change live.
- **Autosave:** no Save button. The indicator flips "Saving…" (gold pulsing dot) for ~650ms then "Saved automatically." Match the existing `BrandProfileForm` autosave/debounce pattern in production.
- **Readability fixes (one-tap):** clicking Apply calls `onChange` with the suggested color(s); the panel re-verifies and flips to "Easy to read."
- **Drawer:** open from "Tune brand"; close via ×/scrim/Escape; `0.42s` ease slide.
- **Republish (published page only):** there are **two records** — `published` (what the live page shows) and `draft` (what the drawer edits). The live page renders `published`; the drawer renders `draft`. They converge ONLY when Republish is clicked (draft → published), which shows a confirming toast. New pages pick up colors automatically; already-published pages need a republish.
- **Preview as seller:** hides all admin chrome; "Exit seller preview" restores it.
- **Responsive:** Settings 2-col → 1-col ≤880px; drawer full-width ≤640px; sample chips already full-width.

## Readability logic (replicate precisely)

WCAG relative-luminance contrast. **Thresholds:** text vs bg ≥ **4.5:1**; accent vs bg ≥ **3:1**. Both non-blocking.

Suggestions nudge **only HSL lightness** (preserve hue + saturation, so it stays the agent's color), smallest change first, in whichever direction clears the target (+0.1 margin):
- `suggestForeground(color, bg, target)` — adjusts a foreground (text or accent).
- `suggestBackground(bg, text, accent, needText, needAccent)` — adjusts the background so every still-failing pair clears at once.

Which fixes to offer (every option FULLY resolves the issue; user picks which color to keep; first = hero/Recommended):
- **Both text & accent fail** → hero: "Use a lighter/darker background — fixes your text and accent in one tap"; alt: "Adjust your text & accent — keeps your background color."
- **Only text fails** → hero: "Use a lighter/darker text color — keeps your background"; alt: "Use a lighter/darker background — keeps your text color."
- **Only accent fails** → hero: "Use a lighter/darker accent color — keeps your background"; alt: "Use a lighter/darker background — keeps your accent color."

(Exact helper implementations are in `brand_kit_form.jsx`.)

## State management
- One `BrandSettings` record: `{ background, text, accent, defaultThemeId }`. `BrandKitForm` is controlled; the parent owns + persists.
- **Published page only:** keep `published` and `draft` separate; Republish copies draft → published. Brand edits must NOT mutate the cached `/h/<slug>` until republish.
- **Cohort safety (must-not-regress):** defaults = the production Editorial palette above; "unset" means "use Editorial defaults"; do NOT write `BrandSettings` on mount; first load is "customize what you already have" (pickers pre-populated, preview in current colors), not a blank canvas; save is never blocked.

## Access / visibility
- Settings is the home (reached from app Settings nav). Wizard "Tune brand" → drawer (no publish reminder, nothing published yet). Published-page admin chrome is **agent-only** — a non-signed-in seller sees zero chrome.

## Assets
- No external image assets. The hero photo, video, and agent avatar in `MiniPage` are **striped CSS placeholders** (the hero has a small mono "PHOTO" label). Swap in the real listing photo + agent headshot when wiring real data.
- Icons are inline SVG (check, warning triangle, info, arrow, play, ×). Replace with the codebase's icon set.
- Fonts via Google Fonts in the prototypes; production already loads Hanken Grotesk + Spectral + JetBrains Mono.

## Files in this bundle
- `README.md` — this document (self-sufficient implementation spec).
- `ENGINEERING_CONTRACT.md` — the original component/handoff contract (props, tokens, open items, cohort notes).
- `brand_kit.css` — all visuals (chrome + MiniPage + form + readability + drawer). Source of truth for CSS values.
- `mini_page.jsx` — `MiniPage` (brand-driven, token-inverted).
- `brand_kit_form.jsx` — `BrandKitForm` + WCAG/suggestion helpers.
- `brand_settings.html` — Settings full-page mockup.
- `wizard_with_drawer.html` — wizard + drawer mockup.
- `published_admin_chrome.html` — published page + admin chrome + republish.

## Build order
1. `MiniPage` (token-inverted: colors from props, layout from `themeId`).
2. `BrandKitForm` (controlled; WCAG + suggestion helpers; the Readability panel).
3. Settings page (tabs, header, 2-col).
4. Wizard drawer (slide-over wrapper, `layout="drawer"`).
5. Published admin chrome (same drawer + published/draft split + Republish).

## One technical note
The drawer slide is a CSS transition. Correct, but transitions freeze at frame 0 in a throttled/background browser tab — a preview artifact only; it animates normally for a foreground user. Never gate an element's visible end-state on an animation/transition completing.
