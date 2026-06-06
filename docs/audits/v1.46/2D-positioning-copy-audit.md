# Audit 2D — Positioning + first-run copy (v1.46)

The product's user-facing copy is currently written around an asset/tool framing: "Tools that help realtors produce client-ready content in minutes, not hours." It works, it doesn't sound hype-y, and it isn't broken — but it sells the *output* (a flyer, a PDF, an MP4) rather than the *job* (showing up like an elite agent on every listing, every showing). v1.46 should land the operational-confidence frame on a handful of high-leverage surfaces — homepage hero, dashboard greeting, magic-link email, /access intro, the 404, and the empty-state first-run — and leave the rest alone until the new frame proves out in conversion data.

---

## 1. Inventory of positioning-bearing copy

Skipping pure UI labels ("Submit", "Cancel", "Send sign-in link", form field names). Items below are sequenced by surface, then by visual prominence within the surface.

### Marketing — homepage [src/app/page.tsx](../../../src/app/page.tsx)

| # | Surface element | Literal text | Location |
|---|---|---|---|
| 1 | Top-bar wordmark | "Simply Edit Pro Studio" | [page.tsx:78](../../../src/app/page.tsx#L78) |
| 2 | Top-bar sign-in CTA | "Sign in →" | [page.tsx:84](../../../src/app/page.tsx#L84) |
| 3 | Credibility chips | "Built for realtors" / "Privacy-first" / "Stripe-secured billing" | [page.tsx:94-96](../../../src/app/page.tsx#L94) |
| 4 | **Hero headline** | "Tools that help realtors produce client-ready content in minutes, not hours." | [page.tsx:98-101](../../../src/app/page.tsx#L98) |
| 5 | **Sub-hero** | "One subscription. Every tool we ship. No design skills required. Your photos stay on your device. No clutter." | [page.tsx:102-105](../../../src/app/page.tsx#L102) |
| 6 | Hero CTA | "Get started" | [page.tsx:122](../../../src/app/page.tsx#L122) |
| 7 | Bridge eyebrow | "Why Simply Edit Pro" | [page.tsx:150-152](../../../src/app/page.tsx#L150) |
| 8 | **Bridge headline** | "Made for realtors. Not creators." | [page.tsx:153-155](../../../src/app/page.tsx#L153) |
| 9 | Pillar 1 | "Mobile-first." / "Built for realtors who work between showings, not at a desk. Every tool runs on the phone in your pocket." | [page.tsx:161-163](../../../src/app/page.tsx#L161) |
| 10 | Pillar 2 | "Real estate templates." / "Property flyers, listing carousels, market updates, just-sold posts. Every template is purpose-built for property marketing — not Instagram dance videos." | [page.tsx:165-167](../../../src/app/page.tsx#L165) |
| 11 | Pillar 3 | "Branded automatically." / "Your logo, your colors, your contact info, your license number — applied to every flyer, post, and presentation. Set it once." | [page.tsx:170-172](../../../src/app/page.tsx#L170) |
| 12 | How it works headline | "Three steps. Five minutes." | [page.tsx:194-197](../../../src/app/page.tsx#L194) |
| 13 | Step 1 | "Fill in your listing." | [page.tsx:204](../../../src/app/page.tsx#L204) |
| 14 | Step 2 | "Brand it your way." | [page.tsx:210](../../../src/app/page.tsx#L210) |
| 15 | Step 3 | "Export everywhere." | [page.tsx:216](../../../src/app/page.tsx#L216) |
| 16 | Pricing headline | "One plan. Unlimited use." | [page.tsx:282-283](../../../src/app/page.tsx#L282) |
| 17 | FAQ — vs Canva | "Canva is a creator tool with thousands of generic templates. Simply Edit Pro is built for realtors only — every template is property marketing, not Instagram dance graphics. The workflows are designed for the way agents actually work: on a phone, between showings, in five minutes." | [page.tsx:325-327](../../../src/app/page.tsx#L325) |
| 18 | Founder note eyebrow | "Why this exists" | [page.tsx:357-358](../../../src/app/page.tsx#L357) |
| 19 | Founder note body | "After watching too many agents lose hours each week to generic design tools that weren't built for property marketing, I started Simply Edit Pro. The goal is simple: fast, branded, professional outputs that don't require design skills — built for the way you actually work." | [page.tsx:360-367](../../../src/app/page.tsx#L360) |
| 20 | Footer descriptor | "Tools that help realtors make client-ready content faster." | [page.tsx:383-386](../../../src/app/page.tsx#L383) |

### Marketing — tool landing pages

| # | Surface | Literal text | Location |
|---|---|---|---|
| 21 | Social Animator hero | "Animated Instagram posts for real estate." / "Pick a template, fill in your content, hit Export. MP4s render right in your browser — no design skills needed, nothing uploaded to a server." | [social-animator/page.tsx:21-27](../../../src/app/social-animator/page.tsx#L21) |
| 22 | Listing Flyer hero | "Listing Flyer Generator" / "Branded property flyers from a single form. Print-ready PDF + animated MP4 from the same input." | [listing-flyer/page.tsx:158-164](../../../src/app/listing-flyer/page.tsx#L158) |
| 23 | Listing Presentation hero | "Listing Presentation One-Pager" / "Polished pre-listing pitch document — track record, marketing strategy, comparable sales, branded automatically." | [listing-presentation/page.tsx:76-82](../../../src/app/listing-presentation/page.tsx#L76) |
| 24 | Open House Promo hero | "Open House Promo Generator" / "Complete promo bundle for any open house — vertical reel, square post, printable flyer, and QR code from a single form." | [open-house-promo/page.tsx:93-99](../../../src/app/open-house-promo/page.tsx#L93) |
| 25 | Open House Prep hero | "Open House Prep" / "Generate your private prep doc + a shareable visitor handout from one form." | [open-house-prep/page.tsx:101-106](../../../src/app/open-house-prep/page.tsx#L101) |
| 26 | SIR hero | "Seller Intelligence Report" / "Your private prep document for a listing appointment." | [seller-intelligence-report/page.tsx:84-88](../../../src/app/seller-intelligence-report/page.tsx#L84) |
| 27 | BrandBanner empty | "Set up your brand profile so the flyer header and footer can be populated." | [listing-flyer/page.tsx:266-272](../../../src/app/listing-flyer/page.tsx#L266) |

### Auth flow

| # | Surface | Literal text | Location |
|---|---|---|---|
| 28 | /login eyebrow + headline + sub | "Simply Edit Pro Studio" / "Sign in" / "Enter your email and we'll send you a sign-in link. No password needed." | [login/page.tsx:57-63](../../../src/app/login/page.tsx#L57) |
| 29 | /login post-submit | "Check your email" / "We sent a sign-in link to {email}. Click it to continue. The link expires in 24 hours." | [login/page.tsx:39-43](../../../src/app/login/page.tsx#L39) |
| 30 | /login fine print | "We'll only use your email to send sign-in links and important account notifications." | [login/page.tsx:91-94](../../../src/app/login/page.tsx#L91) |
| 31 | /access eyebrow + headline | "Beta access" / "Sign in with a beta code" | [access/AccessForm.tsx:49-52](../../../src/app/access/AccessForm.tsx#L49) |
| 32 | /access sub | "Your team admin shared an email and access code. Enter both below and we'll send you a sign-in link." | [access/AccessForm.tsx:53-56](../../../src/app/access/AccessForm.tsx#L53) |
| 33 | /access success block | "Check your email for a sign-in link." / "The link expires in 24 hours. Click it from the same browser where you started, and you'll land directly on your dashboard." | [access/AccessForm.tsx:60-67](../../../src/app/access/AccessForm.tsx#L60) |
| 34 | /access primary CTA | "Get access" | [access/AccessForm.tsx:119](../../../src/app/access/AccessForm.tsx#L119) |
| 35 | /access footnote | "Not part of the beta cohort? Sign in normally (paid subscription required)." | [access/AccessForm.tsx:124-133](../../../src/app/access/AccessForm.tsx#L124) |
| 36 | /paywall headline | "Subscribe to access the Studio" / "Unlimited use of every tool — current and upcoming. Cancel anytime." | [paywall/page.tsx:39-42](../../../src/app/paywall/page.tsx#L39) |
| 37 | /paywall CTA | "Start subscription" | [paywall/page.tsx:56](../../../src/app/paywall/page.tsx#L56) |

### In-app — dashboard

| # | Surface | Literal text | Location |
|---|---|---|---|
| 38 | **Dashboard eyebrow + greeting** | "Simply Edit Pro Studio" / "Welcome back, {name}." / "What's happening in your business right now." | [dashboard/page.tsx:23-31](../../../src/app/dashboard/page.tsx#L23) |
| 39 | **Empty-state card** | "Welcome to Studio" / "Set up your brand profile to unlock skills." / "Your logo, name, contact info, and brand colors flow into every marketing asset Studio generates. It takes about a minute." / CTA: "Set up brand profile →" | [DashboardClient.tsx:60-76](../../../src/app/dashboard/DashboardClient.tsx#L60) |
| 40 | No-active-workflow card | "You're all set up. Pick a tool below to start." | [DashboardClient.tsx:113-116](../../../src/app/dashboard/DashboardClient.tsx#L113) |
| 41 | Next-best-action eyebrow | "Next best action" | [NextBestActionCard.tsx:22-24](../../../src/app/dashboard/components/NextBestActionCard.tsx#L22) |
| 42 | Workflow names + drivers (sample) | "Launch your listing" / "Make your launch feel polished and organized." — "Promote your open house" / "Make your open house feel cohesive and high-end." — "Keep your momentum" / "Don't let leads slip through the cracks." — "Stay visible" / "Stay top-of-mind without it consuming your life." — "Seller Win System" / "Prep for and convert your next listing appointment." — "Open House OS" / "Prep for this weekend's open house — your private prep doc plus a shareable visitor handout URL." | [workflows.ts:34-88](../../../src/app/dashboard/workflows.ts#L34) |
| 43 | Section labels | "What to do next" / "All skills" | [DashboardClient.tsx:95, 132](../../../src/app/dashboard/DashboardClient.tsx#L95) |

### Transactional email — magic link

| # | Surface | Literal text | Location |
|---|---|---|---|
| 44 | **Email subject** | "Sign in to Simply Edit Pro Studio" | [lib/auth.ts:53](../../../src/lib/auth.ts#L53) |
| 45 | **HTML email body** | Eyebrow "Simply Edit Pro Studio" / H1 "Sign in to your Studio" / "Click the button below to sign in. This link expires in 24 hours." / CTA "Sign in →" / fallback "If the button doesn't work, paste this URL into your browser:" / "Didn't request this? You can safely ignore this email." | [lib/auth.ts:120-125](../../../src/lib/auth.ts#L120) |
| 46 | **Plaintext email** | "Simply Edit Pro Studio" / "Sign in to your Studio:" / {url} / "This link expires in 24 hours." / "Didn't request this? You can safely ignore this email." | [lib/auth.ts:136-145](../../../src/lib/auth.ts#L136) |

### Visitor-facing — public handout

| # | Surface | Literal text | Location |
|---|---|---|---|
| 47 | OG description | "Your agent shared this with you." | [h/[slug]/page.tsx:42](../../../src/app/h/[slug]/page.tsx#L42) |
| 48 | Fallback "being prepared" | "This handout is being prepared" / "Your agent shared this link with you. The full content will be available shortly." | [h/[slug]/page.tsx:80-85](../../../src/app/h/[slug]/page.tsx#L80) |
| 49 | **404 handout** | "This handout isn't available" / "The link may have expired or been removed. Ask your agent for a fresh one." | [h/[slug]/not-found.tsx:17-23](../../../src/app/h/[slug]/not-found.tsx#L17) |
| 50 | Handout footer timestamp | "Last updated {date}" | [handout-page.tsx:309](../../../src/tools/open-house-prep/output/handout-page.tsx#L309) |
| 51 | OG "shared by" line | "Shared by {agentName}" / fallback "Shared by your agent" | [output/og-image.tsx:78](../../../src/tools/open-house-prep/output/og-image.tsx#L78) |

### PDF / agent-exported assets

| Note | The agent-facing PDF exports (Listing Flyer footer, Listing Presentation footer, Open House Promo footer) carry **the agent's own brand line** — `{agentName} · License #{licenseNumber}` — and do not surface "Simply Edit Pro" anywhere. That is the right call and should stay that way. The only spot where "simplyeditpro.com" appears on an exported-style surface is the homepage gallery *mockup* at [gallery-mockups.tsx:115](../../../src/components/ui/gallery-mockups.tsx#L115), which is marketing chrome, not a real export. |
|---|---|

### Root metadata

| # | Surface | Literal text | Location |
|---|---|---|---|
| 52 | `<title>` + meta description | "Social Animator" / "Animated Instagram posts for real estate. Pick a template, fill it in, export." | [app/layout.tsx:22-26](../../../src/app/layout.tsx#L22) |
| 53 | /access metadata | "Beta access · Simply Edit Pro Studio" | [access/layout.tsx:10](../../../src/app/access/layout.tsx#L10) |

---

## 2. Tone audit by surface

- **Marketing (homepage + tool landings):** Mid-funnel asset-tool framing. Hero sells speed-of-output; pillars sell product properties; the Canva-comparison FAQ frames the product as a *creator alternative*. No hype words anywhere — already on-tone. Hero and bridge headlines are the highest-impact rewrites.
- **Auth flow (/login, /access, /paywall):** Functional, tone-neutral. /access just shipped in v1.45.3 and is worth tuning. /login and /paywall fine as-is — don't break working transactional flows for stylistic reasons.
- **In-app (dashboard):** Most at odds with the new frame. Greeting is generic; empty state pitches the brand profile as an "unlock" mechanic instead of an operator's first move. Workflow names and emotional drivers in `workflows.ts` are *closer* to the operational frame than the marketing copy ("Don't let leads slip through the cracks") and should stay.
- **Transactional email (magic link):** Brand-led, clean. Subject is the only positioning surface that touches an agent's inbox between sessions — worth a careful rewrite.
- **PDF exports:** Agent-branded, no Simply Edit Pro mention. **Do not touch.** Diluting the agent's brand in front of their client is the worst possible place to land the new positioning.
- **Visitor-facing (`/h/[slug]`):** Sparse, on-tone, subordinates platform to agent correctly. 404 is the one spot worth a modest rewrite.
- **Wizard step copy:** Operational instruction copy, second-person, already concrete. Out of scope.

---

## 3. Recommended rewrites (3 variations each)

### A. Homepage hero + sub-hero — [page.tsx:98-105](../../../src/app/page.tsx#L98)

**Current:**
> H1: Tools that help realtors produce client-ready content in minutes, not hours.
> Sub: One subscription. Every tool we ship. No design skills required. Your photos stay on your device. No clutter.

| Variant | Strength | Headline | Sub-hero |
|---|---|---|---|
| **A1 — Direct/operational** | Hardest on agents already bought-in to the elite-consistency frame. | "Show up like an elite agent on every listing." | "The operating system for working agents. Branded marketing, listing presentations, open house prep, follow-up content — every showing, every listing, every time." |
| **A2 — "For agents who…" frame** | Self-selects the buyer; cools the temperature at top of page. | "For agents who want every listing to feel handled." | "One subscription. Every tool an agent uses between getting the lead and closing the deal — branded to you, ready in minutes, ready every time." |
| **A3 — "Every showing, every listing" frame** | Most concrete; mirrors how the agent talks. | "Every showing. Every listing. Every time." | "Marketing, presentations, prep docs, follow-up — done the same polished way on your busiest day as on your slowest. Built for working agents, not creators." |

### B. Dashboard greeting — [dashboard/page.tsx:26-31](../../../src/app/dashboard/page.tsx#L26)

**Current (returning agent):**
> H1: Welcome back, {name}.
> Sub: What's happening in your business right now.

**Current (empty-state, new agent):** see entry #39 above — "Welcome to Studio. Set up your brand profile to unlock skills."

#### B-returning (logged-in welcome, agent has brand profile)

| Variant | Strength | Copy |
|---|---|---|
| **B1 — Operator's home base** | Daily check-in framing. | H1: "Welcome back, {name}." / Sub: "Here's where you stand on the work in flight." |
| **B2 — Job-first** | Names the agent's role, not the product. | H1: "Back to it, {name}." / Sub: "Your pipeline, your prep, and what's next." |
| **B3 — Quiet/confident** | Lets the Next Best Action card carry the message. | H1: "Welcome back, {name}." / Sub: (remove) |

#### B-empty (first time signing in, brand profile not yet set up)

| Variant | Strength | Copy |
|---|---|---|
| **B1 — Operational onboarding** | Frames the brand profile as a one-time setup the operator does, not an unlock gate. | Eyebrow: "First, set up your brand." / H2: "Your brand goes on every flyer, every handout, every PDF Studio makes." / Body: "Logo, name, license, colors, contact info — set it once, and it auto-applies to every marketing asset you export. About a minute." / CTA: "Set up brand profile →" |
| **B2 — "For agents who…" frame** | Carries the positioning. | Eyebrow: "Welcome to Studio." / H2: "Built for agents who want every listing to feel handled." / Body: "Start with your brand profile — logo, contact info, license number, colors. Studio uses it on every flyer, presentation, and visitor handout from here on." / CTA: "Set up brand profile →" |
| **B3 — Every-time frame** | Most concrete, mirrors the homepage hero variant. | Eyebrow: "Welcome to Studio." / H2: "Set your brand once. Every export, every time." / Body: "Your logo, name, license, contact info, and colors apply automatically to every flyer, presentation, and handout. Spend a minute now, save it on every listing later." / CTA: "Set up brand profile →" |

### C. Magic-link email — [lib/auth.ts:53, 109-146](../../../src/lib/auth.ts#L53)

**Current subject:** "Sign in to Simply Edit Pro Studio"
**Current HTML intro:** "Sign in to your Studio. Click the button below to sign in. This link expires in 24 hours."
**Current plaintext:** "Simply Edit Pro Studio / Sign in to your Studio: {url} / This link expires in 24 hours. / Didn't request this? You can safely ignore this email."

| Variant | Strength | Subject | HTML intro | Plaintext intro |
|---|---|---|---|---|
| **C1 — Operational/transactional** | Closest to the existing tone; carries the new frame without changing inbox behavior. | "Your sign-in link for Simply Edit Pro Studio" | H1: "Your sign-in link." / Body: "Click the button below to get back into Studio. Link expires in 24 hours." | "Simply Edit Pro Studio / Your sign-in link: / {url} / Expires in 24 hours." |
| **C2 — "Back to it" frame** | Personal, mirrors the dashboard greeting. | "Back to Studio, {first-name?}" (if known) / fallback "Back to Studio" | H1: "Back to it." / Body: "Tap to sign in. Your dashboard, your pipeline, and what's next are waiting. Link expires in 24 hours." | "Back to Studio. / Tap to sign in: / {url} / Expires in 24 hours." |
| **C3 — "Every time" frame** | Carries the positioning hardest; risk is it reads slightly marketing in an inbox. | "Sign in — Simply Edit Pro Studio" | H1: "Sign in to Studio." / Body: "One tap and you're back where you left off — every showing, every listing, every time. Link expires in 24 hours." | "Simply Edit Pro Studio / Sign in: / {url} / Expires in 24 hours." |

Recommendation: **C1** for v1.46. The magic link is a transactional surface; carry the new positioning by *removing* "to your Studio" possessive-cute phrasing in favor of "Your sign-in link" plain. Save C2/C3 for a follow-up.

### D. PDF footer/header brand line

**Current state:** Agent-exported PDFs (Listing Flyer, Listing Presentation, Open House Promo) use the agent's own brand line — `{agentName} · License #{licenseNumber}`. No "Simply Edit Pro" appears on any agent-export. **Do not change this.** The only "platform" brand line on a PDF-shaped surface is the homepage gallery mockup at [gallery-mockups.tsx:115](../../../src/components/ui/gallery-mockups.tsx#L115), which is decorative.

If a "Made with…" line is ever introduced on agent exports in a future release, the variations below should be reviewed against the operational-confidence frame *and* an explicit call from Dallen — the default position is no platform branding on agent assets.

| Variant | Strength | Copy |
|---|---|---|
| **D1 — Minimal, agent-first** | Smallest possible imprint; appears only on the visitor handout, never on the agent's PDF. | "Prepared with Simply Edit Pro" (visitor PDF only, 8pt, neutral-500 color) |
| **D2 — Operational frame** | Reinforces the elite-consistency story to the visitor's downstream audience. | "Built so every showing feels this prepared." (visitor PDF only) |
| **D3 — Co-sign frame** | Reads as a quiet endorsement of the agent. | "Your agent's marketing operating system — simplyeditpro.com" (visitor PDF only) |

### E. 404 handout — [h/[slug]/not-found.tsx:17-23](../../../src/app/h/[slug]/not-found.tsx#L17)

**Current:**
> H1: This handout isn't available
> Body: The link may have expired or been removed. Ask your agent for a fresh one.

| Variant | Strength | Copy |
|---|---|---|
| **E1 — Cleaner current** | Smallest possible diff. Keeps tone, sharpens the action. | H1: "This handout has moved on." / Body: "Open houses end, links retire. Ask your agent for an updated one." |
| **E2 — Agent-deferring** | Subordinates the platform to the agent harder. | H1: "Your agent's link has expired." / Body: "Text them back to ask for a fresh one — they'll know which property you meant." |
| **E3 — Operational** | Carries the new frame through to recipients. | H1: "This link's no longer live." / Body: "Your agent retires open house pages after the event. Reach out to them for the current one." |

Recommendation: **E2.** It does the agent-first work without changing visual layout.

### F. /access page intro — [access/AccessForm.tsx:49-56](../../../src/app/access/AccessForm.tsx#L49)

**Current:**
> Eyebrow: Beta access
> H1: Sign in with a beta code
> Sub: Your team admin shared an email and access code. Enter both below and we'll send you a sign-in link.

| Variant | Strength | Copy |
|---|---|---|
| **F1 — Operational/direct** | Removes the "team admin" reference for cohort recipients who weren't told about that lineage. | Eyebrow: "Beta access" / H1: "Get into Studio." / Sub: "Enter the email and access code you were sent. We'll mail you a sign-in link — no password required." |
| **F2 — Cohort-aware** | Acknowledges the human distribution model (Dallen-shared URLs). | Eyebrow: "Private beta" / H1: "Welcome in." / Sub: "You were sent an email and access code by hand. Enter both below and we'll send you a sign-in link." |
| **F3 — Confident/quiet** | Lowest temperature; matches the rest of the auth flow. | Eyebrow: "Beta access" / H1: "Sign in." / Sub: "Use the email and access code from your invite. We'll send a one-tap sign-in link." |

Recommendation: **F2.** The cohort is small and the human-distributed framing is currently true; lean into it.

---

## 4. First-run experience copy

What an agent sees the very first time they sign in (no brand profile, no localStorage drafts):

1. **Dashboard header (server-rendered, always visible).** Eyebrow: "Simply Edit Pro Studio." H1: "Welcome to Studio, {first-name}." Sub: (none on first run — the empty-state card carries the next-step message.)
2. **Empty-state card (replaces the Next Best Action grid until brand profile is set).** Use **B-empty variant B2** above:
   - Eyebrow: "Welcome to Studio."
   - H2: "Built for agents who want every listing to feel handled."
   - Body: "Start with your brand profile — logo, contact info, license number, colors. Studio uses it on every flyer, presentation, and visitor handout from here on."
   - CTA: "Set up brand profile →"
3. **After brand profile is set, the dashboard re-renders with the Next Best Action surface from Audit 2B.** First-time agent has no detected states yet, so the `NoActiveWorkflowsState` card shows. Recommended rewrite for that card (currently "You're all set up. Pick a tool below to start."):
   - "Brand's in. Pick a tool below to start your first asset — flyer, presentation, or social post."

This is intentionally short. The first-run UX shouldn't be a tour; it should be one decision (brand profile) followed by a tool grid. The operational-confidence frame lands once, in the empty-state card, and recedes into the background as soon as the agent has work in flight.

---

## 5. Tone guardrails (copy-review checklist)

A short rule list for Dallen or any future Claude Code session writing user-facing copy in v1.46+:

1. **Lead with the agent's job, not the product's feature.** "Every listing feels handled" beats "Generate branded flyers."
2. **Customer is the working agent, not the elite producer.** Tone reassures, doesn't impress.
3. **No "AI," "AI-powered," "next-gen," "revolutionize," "cutting-edge," "boost your productivity," "supercharge."** Not even ironically.
4. **Prefer "every showing, every listing, every time" over "save time."** Consistency beats speed.
5. **Imperative verbs over passive descriptions.** "Show up like an elite agent" not "Tools that help you appear professional."
6. **The platform subordinates to the agent on customer-visible surfaces.** Visitor handouts, public links, exported PDFs all stay agent-branded. "Simply Edit Pro" never appears on a client-facing asset without explicit decision.
7. **Brand chrome appears in transactional places (sign-in, paywall, settings), not in copy that's meant to do positioning work.** The eyebrow tag is for brand recognition; the headline is for selling the job.
8. **Don't promise minutes if the agent will be in the wizard for ten.** "Ready in minutes" is at the edge of what's still true; "in seconds" only applies to export, not to the full asset.
9. **Use second person ("you," "your") almost everywhere except the homepage hero and the founder note.** "Your pipeline," "your brand profile," "your visitor handout."
10. **When in doubt, say less.** The Open House Prep visitor handout — six sections of structured copy with no platform commentary — is the bar.

---

## 6. What was intentionally left alone

- **Workflow names + emotional drivers in [dashboard/workflows.ts](../../../src/app/dashboard/workflows.ts).** Already on-frame ("Don't let leads slip through the cracks," "Make your open house feel cohesive and high-end"). Bar set here.
- **Agent-export PDF footers** ([FlyerDocument.tsx:353](../../../src/tools/listing-flyer/output/FlyerDocument.tsx#L353), [PromoDocument.tsx:625](../../../src/tools/open-house-promo/output/PromoDocument.tsx#L625), [PresentationDocument.tsx:567](../../../src/tools/listing-presentation/output/PresentationDocument.tsx#L567)). Agent name + license is the right line. No platform watermark.
- **Wizard step instruction copy** (StepEventProperty, StepProperty, etc.). Operational, already concrete.
- **Visitor handout body** ([handout-page.tsx](../../../src/tools/open-house-prep/output/handout-page.tsx)). "Your agent," "Text the agent," "Call," "Email," "Last updated {date}." All correct.
- **OG card "Shared by {agentName}"** ([og-image.tsx:78](../../../src/tools/open-house-prep/output/og-image.tsx#L78)). Already agent-first.
- **/login post-submit "Check your email"** ([login/page.tsx:39-43](../../../src/app/login/page.tsx#L39)). Functional + reassuring; don't break it for positioning.
- **/paywall body** ([paywall/page.tsx:39-42](../../../src/app/paywall/page.tsx#L39)). Honest, conversion-clear. Price + cancel reassurance do the work; rewriting would lower conversion without adding clarity.
- **Tool landing pages** (`/listing-flyer`, `/listing-presentation`, etc.). In-app surfaces reached from the dashboard — positioning is already done by the Next Best Action card. One-sentence functional description is sufficient.
- **Homepage footer descriptor** ([page.tsx:383-386](../../../src/app/page.tsx#L383)). Echoes the hero; update only after the hero rewrite lands, as a one-sentence echo of the chosen variant.
- **Homepage FAQ block** ([page.tsx:325-348](../../../src/app/page.tsx#L325)). The Canva comparison is doing real conversion work and is already operational ("the way agents actually work: on a phone, between showings, in five minutes"). Don't break what works.

---

## 7. Suggested sequencing for v1.46

Highest leverage-to-risk ratio:

1. **Commit 1 — Homepage hero + sub-hero.** §3.A. Single file, [page.tsx:98-105](../../../src/app/page.tsx#L98). Easy to A/B if instrumented.
2. **Commit 2 — Dashboard first-run + empty-state.** §3.B-empty + §4. [dashboard/page.tsx](../../../src/app/dashboard/page.tsx) and [DashboardClient.tsx](../../../src/app/dashboard/DashboardClient.tsx). Lands the frame in-app where it matters most.
3. **Commit 3 — Magic-link email + /access intro.** §3.C (C1) and §3.F (F2). Small files, high-frequency for the beta cohort.
4. **Commit 4 — 404 handout** ([h/[slug]/not-found.tsx](../../../src/app/h/[slug]/not-found.tsx)). One file, E2.

§3.D (PDF brand line) should **not** ship in v1.46 — placeholder for a future product decision, needs its own thread.
