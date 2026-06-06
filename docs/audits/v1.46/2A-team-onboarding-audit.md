# Audit 2A — Team Onboarding + Invite Flow (v1.46)

## Executive Summary

Simply Edit Pro Studio has **no team concept in code today**. v1.45.3 ships a single-tier "dev-access" bypass keyed by individual email in Vercel KV ([src/lib/dev-access.ts](src/lib/dev-access.ts)); brand profile lives entirely in browser `localStorage` ([src/lib/brand.ts](src/lib/brand.ts)); subscriptions are one-customer-one-seat through Stripe ([src/app/api/checkout/route.ts](src/app/api/checkout/route.ts)). The wedge-tightening frame and Aaron's adoption hierarchy (buyer tours > social > door-knocking > open house > seller) argue against building "real teams" infrastructure in v1.46 — **the recommended path is to harden the v1.45.3 access-code pattern into a team-scoped invite primitive (one shared code per team, owner-revocable seat list) and defer multi-seat Stripe billing, brand-kit propagation, and admin dashboards to v1.47+.**

---

## 1. Current State

### 1.1 The `/access` page (v1.45.3) manual workaround

The beta cohort onboarding flow is a single shared-secret code distributed by Aaron via direct URL. There is no team object — the system grants a per-email bypass record.

**Flow (read end-to-end):**

1. Aaron texts/emails his agents the URL `https://simplyeditpro.com/access` plus the value of `DEV_ACCESS_CODE` (a single env-configured shared secret).
2. The agent visits [src/app/access/page.tsx](src/app/access/page.tsx), which renders [src/app/access/AccessForm.tsx](src/app/access/AccessForm.tsx) — a two-field form (`email`, `code`). The route is `robots: noindex` per [src/app/access/layout.tsx](src/app/access/layout.tsx).
3. Submit POSTs to [src/app/api/access/grant/route.ts](src/app/api/access/grant/route.ts), which (a) IP-rate-limits 10/hour against a `rate_limit_access:{ip}` KV key, (b) `timingSafeEqual`s the submitted code against `DEV_ACCESS_CODE`, (c) writes a `dev_access_pending:{email}` KV record with a 24-hour TTL via `markPendingDevAccess`, then (d) calls Auth.js `signIn("resend", { email, redirect: false })` to dispatch a magic-link email.
4. The user clicks the magic link. Auth.js validates the verification token, then invokes the `signIn` callback in [src/lib/auth.ts](src/lib/auth.ts), which calls `consumeDevAccessPending(email)`. If a pending record existed (proof of code-knowledge + email-control), it's atomically deleted and `grantDevAccess(email)` writes the permanent `dev_access:{email}` KV record with `{ grantedAt, grantedVia: "access-code" }`.
5. The middleware ([src/middleware.ts](src/middleware.ts)) runs on every protected route. Order of checks: anonymous → `/login`; authed + `isDevAccessGranted(email)` → through; authed + no dev-access + no active sub → `/paywall`.

**Key properties:**

- The `dev_access:{email}` record is **a primitive seat-grant** — no team identity, no owner, no expiry, no role.
- `revokeDevAccess(email)` exists ([src/lib/dev-access.ts:113](src/lib/dev-access.ts)) but has no UI; Aaron would have to call it from a server console or a future admin route.
- Reversibility-at-launch comment in [src/lib/dev-access.ts](src/lib/dev-access.ts) suggests the whole module is treated as throwaway. That's a clue: the data shape was never meant to graduate.

### 1.2 Team concept search

Grep across `src/` for `team`, `org`, `organization`, `workspace`, `seat`, `member`, `invite`:

| Term | Hits | What's actually there |
| --- | --- | --- |
| `team` | 8 string-literal hits | All copy: `"branded to your team"` in [src/app/page.tsx](src/app/page.tsx); `"Agent / team name"` label in [src/app/settings/BrandProfileForm.tsx](src/app/settings/BrandProfileForm.tsx); `"team admin"` copy in [src/app/access/AccessForm.tsx](src/app/access/AccessForm.tsx); `"team-hypothesis priority order"` comment in [src/app/dashboard/workflows.ts](src/app/dashboard/workflows.ts). **No types, no functions, no KV keys.** |
| `org`, `organization`, `workspace` | 0 | Nothing. |
| `seat` | 0 | Nothing. |
| `member` | 2 | Both are unrelated `useState`-style component members. |
| `invite` | 1 | `"Enter the code from your invite"` placeholder text in [src/app/access/AccessForm.tsx](src/app/access/AccessForm.tsx). |

**Conclusion:** zero data-model awareness of teams. The user record ([src/lib/db.ts](src/lib/db.ts)) is keyed strictly on lowercase email and holds only Stripe ledger fields (`stripeCustomerId`, `subscriptionId`, `subscriptionStatus`, `currentPeriodEnd`).

### 1.3 Brand-kit / shared-asset model

`BrandSettings` ([src/lib/brand.ts](src/lib/brand.ts)) is a flat record with `logoDataUrl` (base64 PNG), `agentName`, `primaryColor`, `accentColor`, `backgroundColor`, `contactEmail`, `contactPhone`, `licenseNumber`, `brokerage`. It is persisted to `localStorage` under the key `socanim_brand_settings` and is **per-browser, per-device**:

- `saveBrandSettings()` writes `window.localStorage`; `loadBrandSettings()` reads it; the `useBrandSettings()` hook initializes to `DEFAULT_BRAND` on SSR and rehydrates client-side post-mount (v1.45.1 hydration fix is documented in the comments).
- No KV record, no server-side write path, no propagation between users. If Aaron sets a brand and a team agent visits, the agent sees the default brand until they fill in their own form.
- Every tool consumes brand the same way: `useBrandSettings()` → pass settings into `template-mapping.ts` / `FlyerDocument.tsx` / `render-mp4.ts` etc. (~20+ import sites under `src/tools/`).
- Published handouts ([src/lib/share-urls.ts](src/lib/share-urls.ts)) bake the relevant fields into the persisted `data: Record<string, unknown>` payload at publish time. The recipient device renders from the snapshot; the agent's later brand edits don't retroactively change a published URL.

**There is no team brand-kit. Aaron's branding never propagates to his agents.**

### 1.4 Subscription model

Single-payer, single-seat. From [src/app/api/checkout/route.ts](src/app/api/checkout/route.ts): Auth.js session → email; find-or-create Stripe customer keyed by that email (stored as `stripeCustomerId` in the KV `user:{email}` record); Checkout `mode: subscription`, `line_items: [{ price: PRICING.priceId, quantity: 1 }]` — hardcoded quantity 1 ([src/lib/pricing.ts](src/lib/pricing.ts) exports `monthlyPriceUSD: 39`). Webhook ([src/app/api/webhook/stripe/route.ts](src/app/api/webhook/stripe/route.ts)) handles `customer.subscription.{created,updated,deleted}` + invoice events, syncs back to `user:{email}` via `upsertUser` keyed on `customer.email`. `hasActiveSubscription(email)` ([src/lib/subscription.ts](src/lib/subscription.ts)) is a pure email→bool check.

**A team-leader-pays-for-5-seats flow would require:** variable `quantity` in Checkout; a seat-assignment table separate from `user:{email}` (the Stripe webhook only knows the **payer's** email); a middleware change to resolve `email → teamId → team_subscription:{teamId}` instead of checking the user's own sub; and a UI for the payer to assign/revoke seats. Roughly four new KV key prefixes, one new API route, one new admin page, and a webhook refactor. Not v1.46-sized.

---

## 2. Five Plausible Team-Onboarding Entry Patterns

| # | Pattern | One-line description | Stateless principle fit |
| --- | --- | --- | --- |
| A | **Shared team code** (current `/access` model, team-scoped) | Aaron has one `team_invite:{code}` record. Agent enters email + code → magic-link → seat written to `team_member:{teamId}:{email}`. | **Strong fit.** Only server state is the invite record + membership record. No content moves server-side. |
| B | **Personal invite link per recipient** | Aaron's admin UI generates `https://simplyeditpro.com/i/{token}` with a single-use token tied to a specific email. Click → magic-link sign-in → seat granted. | **Strong fit.** Identical KV footprint to (A) with one extra `invite_token:{token}` record per pending invite. |
| C | **Team-leader provisions credentials, sends pre-set login email** | Aaron types 5 emails in his admin UI; system writes 5 `team_member` records eagerly + sends each a "you've been added" email with a magic-link CTA. | **Adequate fit.** Same data shape as (A)/(B) but no recipient action gate — the seat exists before the user proves email control, which weakens the email-control invariant the current dev-access flow protects (see comment in [src/lib/dev-access.ts](src/lib/dev-access.ts)). |
| D | **CSV bulk-invite** | Aaron uploads a CSV of emails; backend iterates and dispatches per-email tokens (essentially batched B). | **Adequate fit.** Same data, just an ingestion convenience. Marginal v1.46 value — Aaron has <10 agents. Defer. |
| E | **Stripe-driven seat assignment** | Aaron subscribes to N-seat plan in Stripe; in Settings, assigns each seat to an email; webhook + a new `team_subscription:{teamId}` KV record reconcile billing → entitlement. | **Adequate fit on data, weak fit on margin discipline.** Requires Stripe variable quantity, webhook refactor, new admin UI. Real money but real work. The v1.46 cohort is unpaid beta — no revenue is gated on this. |

**Pattern (A) is the smallest delta from v1.45.3 that earns the "team" word.** Pattern (B) is the canonical SaaS invite UX but requires an admin UI to generate tokens — work that doesn't make Aaron's agents more productive on day one. Pattern (E) is where the product needs to land for paid launch, but is correctly out-of-scope for the wedge-tightening release.

---

## 3. Brand-Kit Propagation: Three Options

When Aaron shares Studio with a team agent, what happens to the brand kit?

- **Locked** — Aaron uploads logo + colors at the team level; team members see read-only branding identical to Aaron's. Pro: zero-config for the agent; weekly-habit friction drops to zero. Con: agents have their own license number, phone, contact email — at minimum those *must* be agent-editable. A fully-locked kit is wrong for real-estate where individual licensure is legally required on marketing materials.
- **Overridable** — Each agent edits their own copy independently (current behavior). Pro: zero new code; matches localStorage model. Con: first-run onboarding is bad — every agent stares at an empty form on day one, and the brand consistency that justifies "operational confidence software" evaporates.
- **Inherited** — Team kit seeds the agent's localStorage on first load; agent can fork (edit any field) and their edits override. The team kit lives in KV under `team_brand:{teamId}` and the agent hydrates from it once.

**Recommendation: Inherited.** It threads the needle: Aaron gets brand consistency on the fields that matter (logo, primary/accent color, brokerage), agents get the agent-specific fields (name, license number, phone, contact email) auto-bootstrapped to their own defaults, and the stateless principle survives because the agent's *working copy* still lives in `localStorage`. The team kit is a seed, not a source of truth. Implementation cost is one new KV key prefix and a "hydrate-from-team-kit-if-localStorage-empty" branch in `loadBrandSettings()` ([src/lib/brand.ts](src/lib/brand.ts)).

A future "re-sync from team kit" button could overwrite localStorage on demand without breaking the principle.

---

## 4. Minimum Team-Admin Features for Aaron's Use Case

Aaron's working surface is small: <10 agents, all known by name, all reachable via text. The admin floor for v1.46-graduation:

**Floor (must-have):**

1. **See who has active access.** A page that lists every `team_member:{teamId}:*` email with `joinedAt` + last-active timestamp (telemetry-derived once v1.46 anon telemetry lands).
2. **Revoke a seat.** Button next to each row that deletes the `team_member` record. The user's session stays valid but the next middleware hit boots them to `/paywall`. This is the renamed `revokeDevAccess(email)` already in [src/lib/dev-access.ts](src/lib/dev-access.ts).
3. **One team invite code** (or a way to rotate it). Same shape as today's `DEV_ACCESS_CODE` env var but stored in KV (`team_invite:{teamId}`) so Aaron can rotate without a redeploy.

**Nice-to-have (defer to v1.47+):**

- Brand-lock toggle (locked vs. inherited — pick inherited for v1.46 and don't expose the choice).
- Per-seat role (admin vs. member).
- Activity feed / usage analytics per seat.
- CSV bulk invite (pattern D).
- Stripe-managed seat billing (pattern E).
- Cross-team seat transfer.

Resist the temptation to ship a "team settings" surface that includes any of the nice-to-haves. Each one is a maintenance tax on a beta-grade feature.

---

## 5. Graduation Path for v1.45.3 — Concrete KV Key Shapes

The `dev_access:{email}` record needs to become a 3-key family. Concrete migration:

**Today:**
```
dev_access_pending:{email}    → "1" (24h TTL)
dev_access:{email}            → { email, grantedAt, grantedVia: "access-code" }
rate_limit_access:{ip}        → integer counter (1h TTL)
```

**v1.46 graduation target:**
```
team:{teamId}                 → { teamId, ownerEmail, createdAt, name }
team_invite:{teamId}          → { teamId, code, createdAt, rotatedAt? }
team_member:{teamId}:{email}  → { email, teamId, joinedAt, role: "owner" | "member" }
team_brand:{teamId}           → { logoDataUrl, primaryColor, accentColor, brokerage }  (subset of BrandSettings — the "seed" fields)
email_team_index:{email}      → teamId   (reverse lookup, single-team-per-email assumption)
```

**Middleware migration in [src/middleware.ts](src/middleware.ts):**

```
// old:
if (await isDevAccessGranted(email)) return NextResponse.next();
const active = await hasActiveSubscription(email);

// new:
const teamId = await kv.get(`email_team_index:${email}`);
if (teamId) {
  // team member — gated on team subscription, NOT individual sub
  // (in v1.46, the team flag itself is the gate; v1.47 wires this to Stripe)
  return NextResponse.next();
}
const active = await hasActiveSubscription(email);
```

**The `/api/access/grant` route stays the same shape** but writes `team_member:{teamId}:{email}` instead of `dev_access:{email}` in the signIn callback. The code-validation logic, rate limit, and magic-link dispatch are unchanged — they were already correct.

**Backfill:** A one-shot migration script reads every existing `dev_access:*` key, creates `team:beta-cohort-1` if it doesn't exist, writes a `team_member:beta-cohort-1:{email}` for each, deletes the old key. ~30 lines. All Aaron's current beta users land in one synthetic team and the `/access` page redirects to the team-coded equivalent.

**Reversibility:** the comment block in [src/lib/dev-access.ts](src/lib/dev-access.ts) brags about ~30 LOC reversibility. That property survives the graduation: the new module is `src/lib/teams.ts`, the middleware branch is one block, the route file is one file — total revert is still <100 LOC and a KV cleanup script.

---

## 6. DECISION: Build "Real Teams" or Polish v1.45.3?

### Argument for building real teams in v1.46

- Aaron's whole product positioning ("operational confidence software for the working agent + team operator") requires a team primitive eventually. The longer it stays as `dev_access:{email}`, the more entrenched the email-keyed assumption becomes across the codebase (it's already in middleware, in the signIn callback, in the settings page).
- v1.45.3 has zero team-admin surface — Aaron literally cannot see who has access without an SSH'd KV CLI. That's a gap he'll feel by week 2 of beta.
- Brand-kit propagation is a felt absence the first time a team agent opens the Studio and sees an empty brand form.
- The graduation path in §5 is small (~100 LOC + a migration script).

### Argument for polishing v1.45.3

- Aaron's adoption hierarchy is **buyer tours > social > door-knocking > open house > seller**. None of those workflows benefit from team infrastructure on the agent's side. The agent's weekly habit is creating an open house promo or a flyer — alone, at a kitchen table. Teams adds *zero* lift to weekly retention.
- v1.46 is wedge-tightening — sharpen the surfaces the agent already touches weekly. Team admin is breadth, not depth. It's a feature for *Aaron*, not for his 10 agents.
- The brand-kit propagation problem (no logo on day one) is the only real onboarding pain, and it can be solved with a 1-line "paste Aaron's logo here" instruction in the invite email + the existing localStorage form. No code needed.
- Aaron has <10 beta users. A spreadsheet + the existing `revokeDevAccess` console call is sufficient admin tooling for the next 90 days.
- Every hour spent building team primitives is an hour not spent on the buyer-tour workflow (the #1 priority in Aaron's hierarchy and the obvious wedge-tightening target).
- The graduation path is small *because it can be done later without penalty.* Premature commitment to a teamId shape locks decisions before there's enough data (multi-team agents? brokerage tier above team?) to make them well.

### Recommendation

**v1.46 should NOT build "real teams." Polish the v1.45.3 access-code pattern with the minimum changes that remove Aaron's operational friction, and defer the team data model to v1.47.**

- The wedge-tightening frame says: sharpen weekly-habit surfaces. Team admin is not a weekly-habit surface for the agent.
- Aaron's adoption hierarchy puts buyer tours and social ahead of every team-collaboration use case. Engineering capacity should land there.
- The only v1.46-worthy onboarding investment is **a minimal admin route** (`/admin/access`) that lists current `dev_access:*` records and exposes a revoke button — wraps the existing `revokeDevAccess()`. Zero new data model. ~50 LOC.
- The graduation path in §5 stays designed-but-unbuilt; commit it to the audit, not to the codebase.
- Brand-kit propagation in v1.46 is solved by social copy in the invite email ("attach Aaron's logo file, paste these hex codes"), not by code.

The single-sentence answer: **v1.46 ships a thin admin-revoke page on top of the existing dev-access primitive, and the team data model graduates in v1.47 alongside the multi-seat Stripe work** — because team infrastructure is breadth that doesn't sharpen any of Aaron's top-three adoption-hierarchy workflows.
