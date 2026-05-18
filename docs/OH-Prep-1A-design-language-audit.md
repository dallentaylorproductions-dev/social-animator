# OH Prep Phase 1A — visual design language audit

**Date:** 2026-05-17
**Branch:** `phase-oh-prep-1-audit` (cut from `76a4d1a` / v1.44.1)
**Status:** Investigation-only; first of three split Phase 1 audits (1A this · 1B share URL infra · 1C tool architecture). No code changes.
**Strategic frame:** Aaron 2026-05-17 ("blue cobalt block presentation style… not polished") flagged visual polish as the adoption gate. New tools from v1.45 forward bake the new language in; existing tools retrofit incrementally.

---

## 1. Context

**Why this audit exists.** SEP today ships utilities that work but read as utilities. Aaron's adoption signal — the closest thing the team has to a "would top agents hand this to clients" answer — is negative on the current PDF aesthetic. The fix is not a single style sweep; it's a design language that every new tool inherits and every existing tool slowly migrates to. This audit defines the language.

**Why this is Audit 1A specifically.** Phase 1 was originally one audit; the combined version froze under its own weight. Split into 1A (design language — small, decision-front-loaded), 1B (web share URL infrastructure — independent surface), 1C (OH Prep tool architecture — depends on 1A's tokens). 1A runs first so the palette decision (D1) lands while 1B is in flight. Each commits to `phase-oh-prep-1-audit`.

**Scope.** Design tokens (colors, type, spacing, radius, elevation) + component primitives (Card, Pill, Fab, Progress, StatLabel, DisplayHeadline, SectionDivider) for BOTH:

- **Web** — Tailwind v4 (`@theme inline` in [src/app/globals.css](src/app/globals.css))
- **PDF** — `react-pdf` `StyleSheet` (no Tailwind support; parallel token system at `src/lib/pdf-theme.ts`)

**Out of scope.** Tool architecture (1C). Share URL plumbing (1B). Implementation (subsequent build commits). Animation / motion tokens (Phase 2 polish). Print-color-space management beyond hex (paper printing is deferred).

**Brand constraints preserved.** Dark canvas `#0a0a0a` (verified [globals.css:17](src/app/globals.css#L17)). Mint primary `#4ef2d9` (used throughout via Tailwind arbitrary values, e.g. `bg-[#4ef2d9]` — not yet promoted to a theme token). Geist Sans font stack via Next.js font loader (`--font-geist-sans` in globals.css). The reference dashboard Dallen shared is light-mode purple — translate the *qualities*, not the literal colors.

**The 8 confirmed design qualities (Dallen 2026-05-17), all applied below:**

1. Generous whitespace
2. Soft elevation (subtle borders/glows, not heavy shadows)
3. Confident headline framing with one colored emphasis word
4. Editorial all-caps tracked labels
5. Multi-accent palette (primary + 2–3 secondaries, one per data slice)
6. Large rounded corners (~12–16px)
7. Pill-shaped tab/step navigation
8. Floating action button for primary actions

---

## 2. Foundation tokens

### 2.1 Colors

| Token | Hex | Use |
|---|---|---|
| `canvas` | `#0a0a0a` | Page background. Verified current. **Keep.** |
| `surface` | `#141414` | Card / panel surface — one step lighter than canvas to read as elevated without a shadow. **New.** |
| `surface-elevated` | `#1c1c1c` | Hover / focused surface — two steps lighter. **New.** |
| `surface-sunken` | `#070707` | Optional pressed/disabled surface — one step deeper. **New.** Use sparingly. |
| `border-hairline` | `rgba(255,255,255,0.06)` | Default card border. Reads as a 1px luminance lift, not a hard line. **New.** |
| `border-emphasis` | `rgba(78,242,217,0.30)` | Card border on hover or workflow-card. Existing dashboard already uses `border-[#4ef2d9]/30`. **Promote.** |
| `mint` (primary accent) | `#4ef2d9` | CTAs, focus states, "next best action" framing. **Keep.** Promote to theme token. |
| `mint-hover` | `#3fd9c1` | Hover/active state. Existing dashboard uses `bg-[#3fd9c1]`. **Promote.** |
| `text-primary` | `#ededed` | Body copy on dark. Verified current foreground. **Keep.** |
| `text-secondary` | `#a3a3a3` (neutral-400) | Subtitle / supporting copy. Matches current usage. |
| `text-muted` | `#737373` (neutral-500) | Help text, captions, "after this" chip labels. |
| `text-disabled` | `#525252` (neutral-600) | Disabled state copy. |

**Promotion plan (defer to implementation phase).** Today `#4ef2d9` and `#3fd9c1` are repeated as Tailwind arbitrary values across ~40 files. The implementation commit promotes them to `@theme inline` tokens (`--color-mint: #4ef2d9; --color-mint-hover: #3fd9c1;`) and codemods existing `[#4ef2d9]` → `mint` class usage. Promotion is mechanical and reversible; deferred so the audit stays code-free.

### 2.2 Spacing scale (8 steps)

Tailwind v4 uses CSS variables; these map onto the default scale plus two extensions for "section breathing room" Aaron flagged as missing.

| Token | Value | Tailwind class | Use |
|---|---|---|---|
| `space-1` | 4px | `p-1`, `gap-1` | Tight icon padding |
| `space-2` | 8px | `p-2`, `gap-2` | Inline chip padding |
| `space-3` | 12px | `p-3`, `gap-3` | Form input padding |
| `space-4` | 16px | `p-4`, `gap-4` | Default card inner padding |
| `space-6` | 24px | `p-6`, `gap-6` | **Default card padding** (matches dashboard's current `p-6 md:p-7`) |
| `space-8` | 32px | `p-8`, `gap-8` | Section internal padding |
| `space-12` | 48px | `py-12`, `gap-12` | Between sections on a page |
| `space-16` | 64px | `py-16`, `gap-16` | Hero / between major page zones (visitor handout especially) |

**Generous-whitespace heuristic:** card body padding ≥ `space-6`; section gap ≥ `space-12`; hero/visitor-handout top padding ≥ `space-16`. Tighter than this and the design reads "app utility" again.

### 2.3 Corner radius (4 steps)

| Token | Value | Tailwind | Use |
|---|---|---|---|
| `radius-sm` | 4px | `rounded` | Inline tags, small chips |
| `radius-md` | 8px | `rounded-lg` | Buttons, form inputs |
| `radius-lg` | 12px | `rounded-xl` | Smaller cards (SkillTile-class) |
| `radius-xl` | 16px | `rounded-2xl` | **Default card radius** (matches dashboard NextBestActionCard's current `rounded-2xl`) |
| `radius-full` | 9999px | `rounded-full` | Pills, FAB, status dots |

Most card-class surfaces use `radius-xl` (16px). FAB uses `radius-full`. See D3 for the explicit mapping per component category.

### 2.4 Elevation (no drop shadows — surface lifts only)

| Level | Implementation | Use |
|---|---|---|
| `elev-0` | `bg-canvas` (no border) | Page background |
| `elev-1` | `bg-surface border border-hairline` | Default card |
| `elev-2` | `bg-surface-elevated border border-hairline` | Hover state of `elev-1` |
| `elev-3` | `bg-surface-elevated border border-emphasis` | Focused or "next best action" workflow card |

Dark mode reads better with surface elevation than drop shadows — drop shadows on `#0a0a0a` produce muddy halos. Tailwind's `shadow-*` utilities are explicitly **not used**.

---

## 3. Typography scale

**Font stack.** Geist Sans (loaded via Next.js font loader at `--font-geist-sans` per [globals.css:11](src/app/globals.css#L11)) for body + UI. Geist Mono for tabular data inside PDFs (numbers in comp tables). Inter as a fallback if Geist isn't registered for react-pdf (more on this in §6).

**Variable axis.** Geist Sans is a variable font; weight is a continuous axis. The scale below uses 4 discrete weight steps (400 / 500 / 600 / 700) for predictability. Designers can extend mid-step (e.g., 550) per-component if needed.

### 3.1 Type scale (8 steps)

| Token | Web px / rem | PDF pt | Weight | Line height | Tracking | Use |
|---|---|---|---|---|---|---|
| `text-xs` | 12px / 0.75rem | 9pt | 500 | 1.4 | `0.18em` if all-caps, else `normal` | All-caps tracked labels (eyebrows, chip text, "after this") |
| `text-sm` | 14px / 0.875rem | 10pt | 400 | 1.5 | `normal` | Body copy on cards, help text |
| `text-base` | 16px / 1rem | 12pt | 400 | 1.5 | `normal` | Default body |
| `text-lg` | 18px / 1.125rem | 13pt | 500 | 1.5 | `normal` | Lead paragraphs, summary lines |
| `text-xl` | 20px / 1.25rem | 15pt | 600 | 1.4 | `normal` | Card titles |
| `text-2xl` | 24px / 1.5rem | 18pt | 600 | 1.3 | `-0.005em` | Section headings |
| `text-3xl` | 30px / 1.875rem | 22pt | 700 | 1.2 | `-0.01em` | Page H1 ("Welcome back, Dallen.") |
| `text-display` | 44px / 2.75rem | 32pt | 700 | 1.1 | `-0.015em` | Hero numbers (visitor handout price, dashboard headline emphasis) |

Negative tracking on large sizes prevents Geist's wide default tracking from reading as "loose" at display sizes — small but load-bearing for the polish bar.

### 3.2 The all-caps tracked label pattern

```tsx
<p className="text-xs uppercase tracking-[0.18em] text-mint">Next best action</p>
```

Already used in [NextBestActionCard.tsx:22-24](src/app/dashboard/components/NextBestActionCard.tsx#L22-L24) via `tracking-[0.18em]` arbitrary value. Promote to a single `eyebrow` utility (Tailwind v4 `@utility eyebrow { … }`) or wrap in a `<StatLabel>` primitive (§5). Either is fine; D2 implicitly covers this.

Color: usually `text-mint`. For neutral eyebrows on a card with a secondary-accent topic (e.g., a "scheduled — needs prep" status), the eyebrow takes the topic's secondary accent.

### 3.3 The confident-headline-with-emphasis-word pattern

The reference dashboard's "Welcome back, Dallen. Your growth is **8.2%** higher" pattern — a large title with exactly one word in the accent color.

```tsx
<h1 className="text-3xl font-bold text-text-primary leading-tight">
  Welcome back, Dallen. You've got <span className="text-mint">three open houses</span> this weekend.
</h1>
```

**Constraints:**

- Exactly ONE emphasis span per headline. More than one fragments the eye.
- Emphasis is *always* a content-meaningful phrase (a number, a state, a noun phrase), never a verb or article.
- The emphasis is *always* in the primary mint accent UNLESS the headline is on a card whose topic maps to a specific secondary accent (e.g., a "needs prep" card might emphasize in the warning color from §4's palette).
- The headline is *always* personal/affirming. See §8 for copy examples.

---

## 4. Secondary accent palette options (D1)

The reference dashboard uses 3 secondary accents alongside its primary — each accent owns a specific data slice (confidence bracket, trend direction, status, etc.). SEP needs the same. Three options below, all designed to cohere with mint `#4ef2d9` on canvas `#0a0a0a`.

**Use-case slots the palette must fill** (one secondary per slot):

- **Positive / "earned this"** — used for high-confidence pricing brackets, "ready to ship" validation, positive trend arrows
- **Caution / "needs attention"** — used for medium confidence, draft-in-progress states, neutral-but-tracked indicators
- **Distinct topic** — used to differentiate one data slice from another when they share a card (e.g., comp-source quality vs comp-distance in the SIR comp table)

Mint primary occupies the "growth / next action / brand affirmation" slot regardless.

### Option A — Warm Spectrum

| Slot | Hex | Description |
|---|---|---|
| Primary (existing) | `#4ef2d9` | Mint — growth, CTAs |
| Positive | `#f5b942` | Warm amber — confidence, "high confidence" |
| Caution | `#ff8b6b` | Coral — needs attention, draft in progress |
| Distinct topic | `#b09cd6` | Dusty lavender — informational neutral |

**Cohesion narrative.** Mint reads cool; the three warm-leaning secondaries give the palette breathing room. Lavender bridges. On `#0a0a0a` all four pop without competing — amber is the loudest, used most sparingly.

**Real estate fit.** Energetic and approachable — reads "modern brokerage, not corporate". Best fit for agents whose brand is warm/personable (the buyer's-agent / new-agent archetypes).

### Option B — Cool Tonal

| Slot | Hex | Description |
|---|---|---|
| Primary (existing) | `#4ef2d9` | Mint — growth, CTAs |
| Positive | `#7eb4ef` | Sky blue — confidence, trend up |
| Caution | `#a89fd1` | Lavender — needs attention |
| Distinct topic | `#5ab8a0` | Sage — informational neutral |

**Cohesion narrative.** All four secondaries sit on the same cool side of the wheel as mint — no thermal contrast. Reads more "tech / data-tool" than Option A. Sage (#5ab8a0) is mint's quieter cousin and risks blurring with primary; mitigated by separating their use slots (sage never appears next to mint in the same component).

**Real estate fit.** Sophisticated and restrained — reads "luxury listings / coastal market". Best fit for agents whose brand is premium and understated (the Operator / Team Leader archetype).

### Option C — Editorial

| Slot | Hex | Description |
|---|---|---|
| Primary (existing) | `#4ef2d9` | Mint — growth, CTAs |
| Positive | `#d4a64a` | Muted gold — confidence, sale-to-list ratio above target |
| Caution | `#c97a5e` | Soft brick — needs attention, listing aging |
| Distinct topic | `#c98bb4` | Dusty rose — informational neutral |

**Cohesion narrative.** Magazine palette — muted, desaturated, reads as "editorial design system" rather than "app". The three secondaries on `#0a0a0a` have a printed-page quality (think Apartmento or Kinfolk on a dark cover). Mint stays as the bright "interaction" signal, which gives the palette its app-grade interaction layer while the data layer reads editorial.

**Real estate fit.** Premium and editorial — reads "boutique brokerage / luxury portfolio". Best fit if the visitor handout (1B's surface) wants to read like a print magazine spread rather than a software interface.

### Recommendation framing for D1

All three are valid. The pick should follow which adoption persona Aaron's network most matches:

- Aaron-network top agents who emphasize **professional, modern, approachable** → Option A
- Aaron-network top agents who emphasize **tech-forward, restrained, premium** → Option B
- Aaron-network top agents who emphasize **luxury, editorial, magazine-grade** → Option C

Dallen picks. The picked palette becomes the implementation commit's `mint`/`accent-positive`/`accent-caution`/`accent-distinct` theme tokens.

---

## 5. Component primitives (web)

Lives at `src/components/ui/` (the directory exists; current contents are marketing-page-specific, not design primitives — new files here don't collide). Each primitive below is a small component that wraps the foundation tokens.

| Primitive | File | Purpose | Variants | Rough Tailwind |
|---|---|---|---|---|
| `Card` | `card.tsx` | Default card surface | `default` / `emphasis` / `interactive` | `rounded-2xl bg-surface border border-hairline p-6` |
| `StatLabel` | `stat-label.tsx` | All-caps tracked eyebrow (§3.2) | accent color prop | `text-xs uppercase tracking-[0.18em] text-mint` |
| `DisplayHeadline` | `display-headline.tsx` | Big headline with optional emphasis span | weight / size props | `text-3xl font-bold leading-tight` + emphasis child |
| `Pill` | `pill.tsx` | Pill-shaped tab / step / status | `active` / `inactive` / `accent-*` (per secondary) | `rounded-full px-4 py-1.5 text-xs uppercase tracking-wider` |
| `Fab` | `fab.tsx` | Floating action button | `primary` / `secondary` | `fixed bottom-6 right-6 rounded-full bg-mint h-14 w-14 flex items-center justify-center` |
| `Progress` | `progress.tsx` | Linear progress bar | accent color prop, `striped` / `solid` | `h-1.5 rounded-full bg-surface-elevated overflow-hidden` + filled child |
| `SectionDivider` | `section-divider.tsx` | Editorial section break | `default` / `with-label` | `border-t border-hairline my-12` + optional label |
| `Chip` | `chip.tsx` | Inline tag (skill chips, status chips) | accent color prop, `link` / `static` | `inline-flex rounded-full border px-3 py-1 text-xs` |
| `Eyebrow` (alt) | merged into `StatLabel` | — | — | — |

### What refactors vs what stays as-is

**Refactors to use primitives (implementation phase, post-1C):**

- [NextBestActionCard.tsx](src/app/dashboard/components/NextBestActionCard.tsx) → `<Card variant="emphasis">` + `<StatLabel>` + `<DisplayHeadline>` + `<Chip>` for the recommended-next-skills row
- [SkillTile.tsx](src/app/dashboard/components/SkillTile.tsx) → `<Card variant="interactive">` + `<StatLabel>` + `<Chip>`
- SIR `StepReview.tsx` "Ready to export" / validation block → `<Card>` + accent color variants

**Stays as-is (Phase 1 scope):**

- Marketing page components (`src/components/ui/duration-slider.tsx`, `gallery-mockups.tsx`, etc.) — marketing surface, separate visual language
- Existing form inputs (`src/components/inputs/`) — out of scope until input redesign audit
- SIR's `FieldHelp` wrapper — already serves a similar role to `StatLabel`; defer consolidation
- Listing Flyer / Open House Promo / Listing Presentation editor surfaces — retrofit in their own polish audits later

**Net new files needed for Phase 1 build:** 8 primitives (one each) + 1 utility CSS file if `eyebrow`/`tracked-label` get promoted to `@utility` directives. ~600-900 LOC across primitives.

---

## 6. PDF design tokens

`react-pdf` `StyleSheet` accepts no Tailwind classes. Parallel token system at `src/lib/pdf-theme.ts` (new file in implementation phase). Token names mirror web exactly so a designer can reason about parity.

```ts
// src/lib/pdf-theme.ts — implementation phase
import { Font } from '@react-pdf/renderer';

// Geist Sans for body; Geist Mono for tabular numbers. Falls back to
// Inter / Helvetica if registration fails (the variable font files
// must be served as TTF/OTF for react-pdf — Next.js font loader gives
// us woff2 which react-pdf can't consume without conversion).
Font.register({ family: 'Geist Sans', src: '/fonts/Geist-Variable.ttf' });
Font.register({ family: 'Geist Mono', src: '/fonts/GeistMono-Variable.ttf' });

export const PDF_COLORS = {
  canvas: '#0a0a0a',          // not used for PDFs (white print canvas is the default)
  surface: '#ffffff',         // PDF default page bg
  text: '#0a0a0a',            // dark text on white paper — inverse of web
  textMuted: '#666666',
  textHelp: '#888888',
  rule: '#e5e5e5',            // hairline
  ruleEmphasis: '#4ef2d9',    // mint accent rules (header dividers)
  mint: '#4ef2d9',
  // Secondary accents — D1 pick flows in here
  positive: '#f5b942',        // Option A default; Dallen's D1 overrides
  caution: '#ff8b6b',
  distinct: '#b09cd6',
} as const;

export const PDF_FONT_SIZES = {
  xs: 9,
  sm: 10,
  base: 12,
  lg: 13,
  xl: 15,
  '2xl': 18,
  '3xl': 22,
  display: 32,
} as const;

export const PDF_SPACING = {
  '1': 3, '2': 6, '3': 9, '4': 12, '6': 18, '8': 24, '12': 36, '16': 48,
} as const;

export const PDF_RADIUS = { sm: 3, md: 6, lg: 9, xl: 12 } as const;

export const PDF_WEIGHTS = {
  regular: 400, medium: 500, semibold: 600, bold: 700,
} as const;
```

### 6.1 Web → PDF parity table

Designers and devs use this lookup to keep web/PDF visually consistent.

| Web | PDF | Notes |
|---|---|---|
| `text-xs` (12px) | 9pt | All-caps tracked labels |
| `text-sm` (14px) | 10pt | Body |
| `text-base` (16px) | 12pt | Default body |
| `text-xl` (20px) | 15pt | Card titles |
| `text-3xl` (30px) | 22pt | Section headers |
| `text-display` (44px) | 32pt | Hero numbers in PDF |
| `p-6` (24px) | 18pt | Default card padding inside PDF Document |
| `rounded-xl` (12px) | 9pt | If used (PDF rounding is rare; tables use sharp corners) |

### 6.2 PDF-specific inversions

- **Background.** PDFs print on white paper; the canvas is `#ffffff`, not `#0a0a0a`. Text inverts: dark text on light. Mint accent stays at full saturation — readable against white as a hairline/eyebrow color, plenty of contrast.
- **Mint as paper accent.** Mint `#4ef2d9` on white prints lighter than expected; the text on a mint chip should be `#0a0a0a` (canvas dark, repurposed as PDF chip text color). This matches the web `bg-mint text-black` pattern from the existing dashboard CTAs.
- **No surface elevation in PDFs.** Cards on paper render as bordered rectangles with the hairline color, not as surface-color lifts. PDF cards: `border: 1pt solid #e5e5e5` instead of `bg-surface`.
- **Drop shadows still off.** Even on white paper. Drop shadows in PDFs print as muddy halos — not a polish-bar choice. Use 1pt rules for separation.

---

## 7. Share-page styling baseline

The web share URL (Audit 1B's infrastructure) needs visual specs even though 1B handles the URL plumbing. Mobile-first because the visitor handout opens on phones in 80%+ of cases (open-house visitors arrive in their car, tap a QR, scroll on iOS Safari).

### 7.1 Breakpoints

| Name | Range | Notes |
|---|---|---|
| `xs` | <375px | Smallest phones (older iPhone SE 1, Android budget). Body padding `px-4`. |
| `sm` | 375–639px | Standard phones (iPhone 13, 14, 15). Default mobile layout. |
| `md` | 640–1023px | Tablets / large phones in landscape. Hero gets wider but content still constrained. |
| `lg` | ≥1024px | Desktop. Content maxes out at `max-w-2xl` (≈672px) for readability. |

Tailwind's defaults (`sm:`/`md:`/`lg:`) map to these. Adopt as-is.

### 7.2 Padding scale on mobile

- Body padding: `px-4` (16px) on smallest, `px-6` (24px) on `sm` and up
- Important content padding (hero / CTA blocks): `px-6 py-8` minimum on mobile; `px-8 py-12` on `md`
- Section gap on mobile: `space-12` (48px) between major content zones

### 7.3 Max-width on desktop

`max-w-2xl` (672px) for body content. Hero can flex to `max-w-3xl` (768px) if it carries a wide image. Wider than `max-w-3xl` reads as "blog post" and breaks the personal-handout intimacy.

### 7.4 Hero pattern (visitor handout top)

```
[ Wide hero image — 16:9 or 4:3, edge-to-edge on mobile,        ]
[ rounded-2xl with mt-4 px-4 padding on desktop                  ]

[ Address (text-3xl bold)                                        ]
[ City, state (text-base text-muted)                             ]
[ Price (text-display, mint accent, mt-4)                        ]
```

Hero contains the property's *headline truth*: address, big price, lead photo. Anything else (beds/baths/sqft/QR/agent info) goes below as separate sections.

### 7.5 Section divider pattern

`<SectionDivider />` from §5. On the visitor handout: a 1px hairline `border-hairline` with `my-12` (48px) above/below. The optional label variant centers a `<StatLabel>` over the rule — "About the home", "About the agent", "More like this".

### 7.6 CTA pattern (contact-agent)

The "Contact agent" / "Schedule a showing" call-to-action is a full-width pill button on mobile, with `<Fab>` as a sticky fallback when the user scrolls past it.

```tsx
<button className="w-full rounded-full bg-mint text-black font-semibold py-4 px-6 text-base">
  Schedule a showing →
</button>
```

Sticky FAB on scroll: when the inline CTA scrolls offscreen, the `<Fab>` slides in from bottom-right with the same action. (Implementation: scroll observer, simple state.)

---

## 8. Affirming copy framing examples

Real-estate-context-specific applications of the "Welcome back, Dallen. Your **growth is 8.2% higher**" emphasis pattern. Each example is one headline; the bold span is the emphasis word/phrase (always in the primary accent unless the topic-card uses a secondary).

**Dashboard greeting headlines** (top of `/dashboard`):

1. "Welcome back, Dallen. You've got **three open houses** this weekend."
2. "Good morning, Dallen. Your listing on Maple Heights is **7 days old** — time for a visibility push."
3. "Welcome back. The Smith appointment is **tomorrow at 2pm** — your prep doc is ready."
4. "Hey Dallen. **Two leads** went quiet since Tuesday — want to follow up?"

**Workflow-card headlines** (Next Best Action style):

5. "Your launch is **3 of 5 assets** in. Keep going."
6. "Your last social post was **5 days ago**. Time for a market update."
7. "**Saturday's open house** at Maple Heights needs its visitor handout."
8. "**Your listing presentation** for the Wilsons is missing comps."

**Note on personalization.** The "Dallen" first-name use is illustrative; production pulls from `BrandSettings.agentName`. The headline copy is *deliberately not generic* — generic copy ("Welcome to your dashboard") loses the affirming tone Aaron flagged as the differentiator.

**Constraints downstream commits should honor:**

- One emphasis span per headline (§3.3)
- Headline carries the state, not just the greeting — "Welcome back. Your X" is the pattern, not "Welcome back" alone
- Affirming, not commanding — never "You need to…" / "You must…" / "Please…"
- Specific over vague — "three open houses this weekend" beats "your open houses"

---

## 9. Decisions for Dallen

Audit pauses for Dallen's reaction on these before Phase 1 implementation begins. None block Audit 1B (share URL infrastructure) — 1B can run in parallel and the design tokens slot in at its implementation phase.

### D1 — Secondary accent palette pick

Options A (Warm Spectrum), B (Cool Tonal), C (Editorial) in §4. Each option locks the three secondary accent hex codes for `accent-positive`, `accent-caution`, `accent-distinct`. The picked palette becomes the theme tokens promoted in the first implementation commit.

**Audit recommendation framing:** Option A (Warm Spectrum) is the closest fit to "energetic, friendly, multi-personality" — which best matches Aaron's "I'll use this with sellers / buyers / first-time agents" use case framing. Option B is the safest pick if the team wants restraint. Option C is the most distinctive if the visitor handout (1B) wants editorial gravitas. **Dallen picks.**

### D2 — Spacing scale (8 steps as proposed in §2.2)

Audit proposes 4 / 8 / 12 / 16 / 24 / 32 / 48 / 64 with the generous-whitespace heuristic (card padding ≥ `space-6`, section gap ≥ `space-12`, hero ≥ `space-16`). **Approve or refine.** Notably: Aaron's "blue cobalt block" critique is partly a whitespace critique — tight padding signals "app utility", generous padding signals "considered design". Defaulting card padding to `space-6` instead of `space-4` is the single highest-leverage spacing decision.

### D3 — Corner radius mapping per component category

Audit proposes:

- Cards (NextBestActionCard, SkillTile, SIR step shells, visitor-handout hero) → `radius-xl` (16px / `rounded-2xl`)
- Smaller cards / tiles within cards → `radius-lg` (12px / `rounded-xl`)
- Buttons, inputs, secondary CTAs → `radius-md` (8px / `rounded-lg`)
- Pills, FAB, status dots, chips → `radius-full`
- Inline tags, small badges → `radius-sm` (4px)

**Approve or refine.** The reference dashboard's cards read ~12-16px radius — this audit's mapping centers on 16px for the dominant card class. Going larger (20-24px) starts to read "novelty"; smaller (8-12px) reads "default Tailwind app".

### D4 — Affirming copy pattern adoption

Audit proposes the §3.3 + §8 emphasis-word pattern as the standard for all top-of-page H1s and workflow-card titles. **Confirm direction.** Once adopted, downstream commits write copy in this shape by default; reviewers can push back when a specific headline doesn't fit, but the pattern is the starting assumption.

### D5 — Geist font registration for PDF rendering

Audit notes (§6) that Geist Sans is a variable font served by Next.js as woff2, which react-pdf cannot consume directly without TTF/OTF conversion. **Decision needed:**

- (a) Convert Geist Variable to TTF and serve from `/public/fonts/` for react-pdf's `Font.register` (~30 mins of setup)
- (b) Register Inter as the PDF font instead (Inter ships TTF; readily registerable; slight typography divergence between web and PDF but minor)
- (c) Use Helvetica as the PDF default (current behavior across existing PDFs; biggest divergence from web)

**Audit recommendation:** (a) — the polish bar makes web/PDF typographic parity worth the 30 minutes. Dallen confirms.

### D6 — Promote `#4ef2d9` to theme token in Phase 1 or later

The implementation commit can either:

- (a) Promote `mint` to a real `@theme` token + codemod existing `[#4ef2d9]` usages to `mint` class — ~40 files touched, mechanical refactor
- (b) Leave existing arbitrary values alone, use the new token only in new code

**Audit recommendation:** (a) — promotes color hygiene and means the secondary accents from D1 land in the same system. The codemod is reversible and produces a clean before/after diff. Dallen confirms scope tolerance.

---

## Sources

Files read in full or in relevant sections:

- [src/app/globals.css](src/app/globals.css) — Tailwind v4 CSS config; verified dark canvas `#0a0a0a`, Geist font wiring, `@theme inline` pattern
- `src/components/ui/` directory listing — confirmed no design primitives exist yet (current contents are marketing-page mockups + sliders)
- Repo-wide grep for `#4ef2d9` and `[#4ef2d9]` — confirmed mint accent is used as Tailwind arbitrary value across dashboard, SIR, and the other 3 tool surfaces

Reused from prior session context (W-1 Half B + SIR audits and implementations):

- [src/app/dashboard/components/NextBestActionCard.tsx](src/app/dashboard/components/NextBestActionCard.tsx) — current `rounded-2xl bg-neutral-900 border border-[#4ef2d9]/30 p-6 md:p-7` card pattern + `text-xs uppercase tracking-[0.18em] text-[#4ef2d9]` eyebrow
- [src/app/dashboard/components/SkillTile.tsx](src/app/dashboard/components/SkillTile.tsx) — current tile rendering shape
- [src/tools/seller-intelligence-report/output/pdf-export.tsx](src/tools/seller-intelligence-report/output/pdf-export.tsx) — current react-pdf StyleSheet pattern, Helvetica default, point-based sizing

Strategic context embedded in the prompt:

- Aaron 2026-05-17 polish-bar feedback (memory file at `sep-aaron-polish-bar.md`)
- The 8 design qualities Dallen confirmed from the reference dashboard
- SEP brand identity constraints (dark + mint preserved)
- 3-audit split rationale (1A this · 1B share URL infra · 1C tool architecture)
