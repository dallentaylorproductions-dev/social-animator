# Color Unification Audit (read-only map)

**Scope:** every color token + hardcoded hex across the seller-side color path, sized
enough to design the unified brand-kit build. No code changed.

**Base commit audited:** `b34da03` — the head of `feat/post-e0-polish-batch` (= `main` @
`be2fb7a` / E.0 **+** the unmerged post-E.0 polish PR #26). PR #26 was still OPEN at audit
time; it does **not** touch `presentation-page.tsx`/`.css` or any color-consumption path
(its changes are the wizard theme-picker removal + two Settings doc-labels + specs), so
this color map is identical to the post-#26 `main`. The two #26 labels corroborate §2/§4.

**Locked model (shapes recommendations, not findings):** ONE signature color + OPTIONAL
secondary; the system derives the full tonal ramp; light/dark **surfaces belong to the
layout**, not the agent. First build unifies the **seller-side** path + kills hardcoded
color there; Social Animator converges later (§7 = size only).

**Headline finding:** the seller page runs **two parallel accent systems**. `--brick`
(brand-wired to the agent's `brandAccent`) drives prices/links/rules/dollar. A second,
**hardcoded cyan `--mint` (`#4ef2d9`)** drives every eyebrow dot, the "For the Halloran
family" hero eyebrow, section-number dots, the verified badge, and the footer glyph — none
of it tied to the agent's color. **This mint is the color that survived Dallen's pink
test** (§4 + §5). Unifying = collapse `--mint`'s accent uses into the signature color.

---

## 1. Current color-token inventory

### 1a. BrandSettings fields (`src/lib/brand.ts`)
| Field | Defined | Resolves to (default) | Notes |
|---|---|---|---|
| `brandBackground?` | `brand.ts:56` (`BrandSettings`) | unset → CSS fallback `#f1ebe0` | E.0 seller-page bg |
| `brandText?` | `BrandSettings` | unset → `#1a1612` | E.0 seller-page text |
| `brandAccent?` | `BrandSettings` | unset → `#c26a4e` | E.0 seller-page accent (`--brick`) |
| `defaultThemeId?` | `BrandSettings` | unset → `"editorial"` | layout id, not a color |
| `EDITORIAL_BRAND_DEFAULTS` | `brand.ts` const | `{background:#f1ebe0, text:#1a1612, accent:#c26a4e}` | the cohort-safety palette |
| `primaryColor` | `BrandSettings` | `DEFAULT_BRAND.primaryColor = #4ef2d9` | **Profile** color (NOT seller page) |
| `accentColor` | `BrandSettings` | `DEFAULT_BRAND.accentColor = #ffffff` | **Profile** color; `effectiveBrandAccent()` treats `#ffffff`/empty as "unset" and derives a darker shade from `primaryColor` |
| `backgroundColor` | `BrandSettings` | `""` | reserved/unused on seller page |
| `logoDataUrl`, `agentName` | `BrandSettings` | — | drive `drawBrandOverlay` (logo/name, not color) |

> Two `primaryColor`/`accentColor` (Profile) **and** `brandBackground/Text/Accent` (Brand
> kit) coexist — the "two accents, no map" confusion. Profile colors feed the document
> tools (§2); Brand colors feed the seller page (§3).

### 1b. Seller consumer-page CSS tokens (`presentation-page.css`, `.sep-presentation` L26-56)
**Brand-wired trio (E.0):**
| Token | L | Value |
|---|---|---|
| `--paper` | 36 | `var(--brand-bg, #f1ebe0)` |
| `--ink` | 42 | `var(--brand-text, #1a1612)` |
| `--brick` | 50 | `var(--brand-accent, #c26a4e)` |

**Derived shades — FIXED in E.0 (not yet brand-driven):**
| Token | L | Value | Role |
|---|---|---|---|
| `--paper-deep` | 37 | `#e8e0d2` | outer page bg / section deep |
| `--paper-raise` | 38 | `#fbf7ee` | raised surface |
| `--paper-card` | 39 | `#fcf9f2` | card surface |
| `--paper-line` | 40 | `#e0d6c5` | hairline border |
| `--paper-line-soft` | 41 | `#eae1d0` | soft divider |
| `--ink-2` | 43 | `#2a241f` | secondary text |
| `--ink-muted` | 44 | `#6e665b` | muted text |
| `--ink-faint` | 45 | `#a29888` | faint text |
| `--brick-deep` | 51 | `#a85439` | darker accent (defined; **unused** in CSS) |

**Standalone palette tokens (NOT derived from the trio):**
| Token | L | Value | Used as |
|---|---|---|---|
| `--mint` | 46 | `#4ef2d9` | **2nd accent** (eyebrows/dots/badges) — see §4/§5 |
| `--mint-deep` | 47 | `#1f8f7c` | paired mint |
| `--gold` / `--gold-warm` | 48/49 | `#c9a86a` / `#b8965a` | agent section numerals (decorative) |
| `--rose` | 52 | `#d29a9a` | one decorative accent (L797) |
| `--pos` / `--pos-bright` | 53/54 | `#1d9e75` / `#6ee7a8` | **semantic: positive/up** (area-stat deltas) |
| `--chart-blue` / `--chart-blue-deep` | 55/56 | `#3f6c8e` / `#2c5474` | **semantic: chart data-viz** |

### 1c. MiniPage tokens (`components/brand-kit.css` `.bk-scope .mini`, brand-preview only)
Token-inverted: `--m-bg/--m-text/--m-accent` from props; derived via `color-mix`:
- `--m-sub: color-mix(in srgb, var(--m-text) 60%, var(--m-bg))`
- `--m-faint: color-mix(in srgb, var(--m-text) 40%, var(--m-bg))`
- `--m-line: color-mix(in srgb, var(--m-text) 14%, var(--m-bg))`
- `--m-foot-bg: color-mix(in srgb, var(--m-text) 90%, var(--m-bg))`
- `--m-foot-ink: color-mix(in srgb, var(--m-bg) 92%, var(--m-text))`
- `--m-foot-sub: color-mix(in srgb, var(--m-bg) 58%, var(--m-text))`

> **The MiniPage already implements the unified model** (3 inputs → full ramp via
> `color-mix`). It's the working reference for the seller-page build — the consumer page's
> fixed `--paper-*`/`--ink-*` shades are exactly what those `color-mix` formulas would
> replace.

---

## 2. Profile color consumers (`primaryColor` / `accentColor`)

Prior finding **confirmed and extended**. Consumers (all read `brand.primaryColor` /
`brand.accentColor`, fallback `#4ef2d9` primary / `#0a0a0a`|`#ffffff` accent):

| Surface | file:line | Fields | Application |
|---|---|---|---|
| Listing Flyer | `tools/listing-flyer/output/FlyerDocument.tsx:194-195` | both | badge/price/feature fills |
| Listing Flyer (preview) | `app/listing-flyer/FlyerPreview.tsx:27,64,224` | both | mockup fills |
| Listing Flyer (mapping) | `tools/listing-flyer/engine/template-mapping.ts:32` | primary | template fills |
| Listing Presentation | `tools/listing-presentation/output/PresentationDocument.tsx:292-293` | both | doc palette |
| Listing Presentation (preview) | `app/listing-presentation/PresentationPreview.tsx:32-33` | both | preview palette |
| Open House Promo | `tools/open-house-promo/output/PromoDocument.tsx:340,348` | primary + `effectiveBrandAccent` | promo palette |
| Open House Promo (mp4) | `tools/open-house-promo/engine/render-mp4.ts:85-86` | primary + `effectiveBrandAccent` | video frames |
| Open House Promo (preview) | `app/open-house-promo/PromoPreview.tsx:39,45` | primary + `effectiveBrandAccent` | preview |
| SIR PDF | `tools/seller-intelligence-report/output/pdf-export.tsx:259-260` | both | report palette |
| Open House Prep | `tools/open-house-prep/skill.ts:140,146` | both | brand-slot keys |
| Templates (Social Animator) | `templates/brand-slots.ts:64,66`, `templates/qa-card.ts`, `templates/skills.ts` | both | canvas brand-slots (§7) |
| Export spinner | `components/export-loader/ExportLoader.tsx:51` | primary | loader tint (cosmetic) |

**Confirmed: Profile colors do NOT touch the seller `/h/<slug>` page.** They feed the
document/canvas tools only. (The #26 Profile-tab label states exactly this.)

---

## 3. Brand-kit color consumers (`brandBackground/Text/Accent`)

| Consumer | file:line | Behavior |
|---|---|---|
| Publish projection | `output/public-payload.ts:216` `projectBrandColors` + `toPublicPayload` 4th arg | hex-validates each field; emits `payload.brandColors` (omits when unset) |
| Boundary clamp | `output/public-payload.ts:526` `clampBrandColors` | re-validates on read |
| Client assembly | `components/StepReview.tsx:130-134,160` | reads `brand.brandBackground/Text/Accent`, posts in publish body |
| Consumer page | `output/presentation-page.tsx` (`SellerPresentationPage`) | applies `--brand-bg/--brand-text/--brand-accent` as inline style on `.sep-presentation` root, only when present |
| MiniPage preview | `components/BrandKitForm.tsx` → `MiniPage` props | live Settings preview |

**Confirmed: the 3-token inline-style swap is the ONLY brand-driven surface on the seller
page today.** Everything else on `/h/<slug>` is fixed (§4).

---

## 4. Hardcoded-hex inventory on the seller page (CORE)

Legend for **reads-as / recommendation**: `SIGNATURE` = agent accent; `RAMP` = derive from
signature/surface; `SURFACE`/`TEXT` = layout-owned neutral; `SEMANTIC` = status color
(legitimately stays); `ON-ACCENT` = text/icon that sits on the signature.

### 4a. ⭐ HARDCODED MINT `#4ef2d9` (`var(--mint)`) — highest priority (pink-test survivor)
A complete second accent system, unrelated to the agent's color:
| file:line | Element / role | reads-as | → recommendation |
|---|---|---|---|
| `presentation-page.css:248` | `.caption-card .for` — **"For the Halloran family" hero eyebrow** (§5) | accent text | **→ SIGNATURE** |
| `:258` | `.caption-card .for::before` — eyebrow dot | accent | → SIGNATURE |
| `:440` | `.sec-label .num::before` — every section-number dot | accent | → SIGNATURE |
| `:1165` | `.agent .sec-label .num::before` — agent section dot | accent | → SIGNATURE |
| `:1216` | `.agent-photo .verify` — verified badge bg | accent | → SIGNATURE |
| `:1374` | `.end-mark .dot` — end-mark dot | accent | → SIGNATURE |
| `:1413` | `.foot .brand .glyph` — footer logo glyph bg | accent | → SIGNATURE |
| `:1432` | `.foot .brand .wm em` — footer wordmark emphasis | accent | → SIGNATURE |
| token `:46` `--mint-deep :47` | the token def + its pair | accent | collapse into signature ramp |

> Net: the page has TWO accents — `--brick` (agent's `brandAccent`) for prices/links/rules,
> and `--mint` (fixed `#4ef2d9`) for eyebrows/dots/badges. **Unification = route all `--mint`
> accent uses to the single signature color** (then `#0a2a24`, the dark text drawn ON mint
> badges, becomes "on-signature" — see 4d).

### 4b. Derived tints/shades (currently fixed tokens; §1b) → RAMP
`--paper-deep/-raise/-card/-line/-line-soft` (light surface ramp) and
`--ink-2/-muted/-faint` (text ramp), plus `--brick-deep` (accent-dark). All **→ derive from
the surface/signature via `color-mix`** (the MiniPage formulas in §1c are the template).
Inline siblings of the same family:
| file:line | role | value | → |
|---|---|---|---|
| `:127` | outer-bg radial top glow | `#f1e9da` | RAMP (light surface) |
| `:961` | `.chart-wrap` gradient bg | `#fcf9f2 → #fbf6ea` | RAMP (≈ paper-card) |
| `:1336` | `.cta.primary:hover` bg | `#fffcf4` | RAMP (light surface) |

### 4c. Neutral surfaces / on-dark text → LAYOUT (stay, but own them as layout tokens)
| file:line | role | value | reads-as |
|---|---|---|---|
| `:190` | `.hero` dark section bg | `#1a1612` | SURFACE (dark; = `--ink` value) |
| `:233` | `.caption-card` bg | `#16110d` | SURFACE (dark) |
| `:1197` | `.agent-photo--monogram` gradient | `#2a241f → #1a1612` | SURFACE (dark) |
| `:152,177,191,610` | appbar/share/hero on-dark text | `#fbf6ec` | TEXT (on-dark cream) |
| `:234,286,1154,1174,1205,1237,1278,1315,1323` + bg `:1310,1329` | on-dark cream text/surface (= `rgb(244,239,228)`; many `rgba(244,239,228,x)` translucents too) | `#f4efe4` | TEXT/SURFACE (on-dark) |
| `:209` | `.hero-photo` fallback bg | `#c8b69a` | SURFACE (photo placeholder) |
| `:217` | `.hero-photo.monogram` gradient | `#ad927a → #8c715b` | SURFACE (placeholder) |
| `:1189` | `.agent-photo` fallback bg | `#5e544a` | SURFACE (placeholder) |
| `:574,581` | device/screen frames | `#000` | SURFACE (frame) |

> These are **layout-owned dark feature sections** (hero, caption card, agent footer) on the
> otherwise-light page, with cream text. They validate §6: the layout owns its surfaces. In
> the unified model they become a small set of layout neutral tokens (dark-surface, on-dark-
> text) — they do **not** become agent-controlled.

### 4d. On-accent text → ON-ACCENT (follows the signature decision)
| file:line | role | value |
|---|---|---|
| `:1217` | `.agent-photo .verify` check (text on mint badge) | `#0a2a24` |
| `:1414` | `.foot .brand .glyph` (text on mint glyph) | `#0a2a24` |

### 4e. Semantic / data colors → KEEP (status colors legitimately stay)
| token | value | role |
|---|---|---|
| `--pos` / `--pos-bright` (`:950,992`) | `#1d9e75` / `#6ee7a8` | positive/up deltas (area stats) |
| `--chart-blue` / `--chart-blue-deep` (`:1031-1097`) | `#3f6c8e` / `#2c5474` | chart data-viz |
| `--gold` / `--gold-warm` (`:937,1162`) | `#c9a86a` / `#b8965a` | agent section numerals (decorative — could optionally fold to signature) |
| `--rose` (`:797`) | `#d29a9a` | one decorative accent (decorative — could fold) |

---

## 5. The cyan hero eyebrow — VERDICT

The **"For the Halloran family" eyebrow** (`presentation-page.tsx:139` `.caption-card .for`,
testid `sep-prepared-for`) is colored **`var(--mint)`**, and `--mint` is a **hardcoded
`#4ef2d9`** (`presentation-page.css:46`, consumed at `:248`; its dot at `:258`).

**It is NOT a consumer of any profile or brand color** — it's the fixed cyan. The same
`--mint` paints every section-number dot, the verified badge, the end-mark, and the footer
glyph (§4a). This is the highest-priority offender: it reads as "an accent the agent never
chose," sitting right next to `--brick` (the accent they *did* choose). Fix = collapse
`--mint` into the signature color.

---

## 6. Light vs dark surface handling

- **Seller page (`/h/<slug>`):** a **light/cream canvas** — `.page` bg = `--paper`
  (`var(--brand-bg, #f1ebe0)`), text `--ink`. The LAYOUT then drops in **dark feature
  sections** (hero `#1a1612`, caption-card `#16110d`, agent footer dark gradient) with cream
  on-dark text (`#f4efe4`). Accents = `--brick` (agent) + `--mint` (hardcoded). So the canvas
  is *partly* brand-driven (bg/text), but the dark sections + their text are layout-owned
  literals.
- **Social Animator templates:** **dark canvas**, rendered to `<canvas>` (`ctx.fillStyle`),
  consuming `primaryColor`/`accentColor` brand-slots for accents with hardcoded near-black
  text/panels (§7).
- **Validates the locked model:** in both, the *surface* (light vs dark, the feature-section
  treatment) is a layout decision; only the *accents* track the agent. The unified build can
  keep the layout owning light/dark canvases while every accent (today split across `--brick`
  + `--mint` + Profile `primary`/`accent`) collapses to one signature (+ optional secondary),
  with surface/text ramps derived via `color-mix` (the MiniPage already proves this).

---

## 7. Social Animator consumer surface (size-only, later phase)

- **~10 canvas templates** (`src/templates/*.ts`: before-after, grid-comparison, listing-
  card, listing-carousel, listing-showcase, market-update, numbered-process, qa-card, stat-
  highlight, testimonial-card), each declaring `primary`/`accent` **color brand-slots**
  resolved by `resolveBrandColors` / `brand-slots.ts` (→ `brand.primaryColor`/`accentColor`,
  fallback `#4ef2d9` / `#ffffff`).
- **~38 `colorHex` slots** across template + tool skills.
- Render path differs from the seller page: **canvas `ctx.fillStyle`**, not CSS vars — many
  templates also hardcode in-canvas text/panel colors (e.g. `qa-card.ts:124` near-black text
  on the primary panel, flagged in-file as "audit §4.6").
- **Convergence size: medium.** Per template, map the two color slots → signature/secondary
  and leave hardcoded in-canvas neutrals as layout. No shared CSS cascade to lean on (unlike
  the seller page), so it's a per-template pass over ~10 files + `brand-slots.ts` +
  `template-mapping.ts`. Defer per the locked plan; seller-side goes first.

---

## Recommendation seeds for the build packet
1. **Collapse the two seller-page accents into one signature** — route all `var(--mint)`
   accent uses (§4a) to the signature; keep `--brick` as the same signature (today it's the
   agent's `brandAccent`). Decide: signature = `brandAccent`, with `--mint`'s eyebrow role
   re-skinned to it.
2. **Derive the fixed `--paper-*`/`--ink-*`/`--brick-deep` ramp from the signature + surface
   via `color-mix`** (reuse the MiniPage formulas; this also retires the E.0 "fixed shades"
   debt).
3. **Formalize layout neutral tokens** for the dark feature sections + on-dark text (§4c) —
   layout-owned, not agent-controlled.
4. **Keep semantic tokens** (`--pos*`, `--chart-*`) as status colors (§4e); decide whether
   decorative `--gold*`/`--rose` fold into signature.
5. **Unify the data model**: today Profile `primaryColor`/`accentColor` (canvas tools) and
   Brand `brandBackground/Text/Accent` (seller page) are separate. The unified "1 signature +
   optional secondary" replaces both; the seller page consumes signature for all accents.
6. **Social Animator** = follow-up phase (§7), per-template slot remap.
