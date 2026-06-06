# Audit 2E — Cohort experiment instrumentation requirements (v1.46)

## Executive summary

Simply Edit Pro Studio ships with **zero analytics or event tracking** today. The 2026-05-18 → 2026-06-01 cohort experiment is running on coarse signals only (KV ledger rows, Vercel function logs, Aaron's qualitative feedback), which makes it impossible to answer questions like "where did agents drop off in the wizard?" or "how many handout URLs got opened vs. published?" This audit specs the **minimum** event-tracking primitive — a single `POST /api/events` route writing to Vercel KV, a `track()` client helper, ~12 wired event hooks, and a `/admin/events` viewer — that makes the **next** cohort experiment rigorously measurable without adding third-party SDKs, Postgres, or any cost beyond existing Vercel KV ops. **Estimated scope: half a day of Claude Code work.**

---

## 1. Current state: zero existing instrumentation

A repo-wide grep for `track|analytics|event|posthog|segment|mixpanel|plausible|umami|amplitude` confirms **no analytics code in the project**. Every match is benign:

- Tailwind `tracking-*` letter-spacing utilities (the vast majority of hits).
- Domain copy: "track record" stat tiles in [`src/tools/listing-presentation/skill.ts`](../../src/tools/listing-presentation/skill.ts).
- `Track` types from the video timeline module ([`src/tools/open-house-promo/engine/timeline.ts`](../../src/tools/open-house-promo/engine/timeline.ts)).

[`package.json`](../../package.json) lists no analytics SDK — no `posthog-js`, `@vercel/analytics`, `mixpanel-browser`, `@segment/analytics-next`, `plausible-tracker`, `amplitude-js`. The dependency list is Next 16, Auth.js v5, Stripe, Resend, Vercel KV / Upstash Redis, react-pdf, ffmpeg.wasm. Nothing else.

**Claim:** v1.46 is greenfield for instrumentation. No existing pattern to harmonize with, no legacy event names to preserve.

---

## 2. Attribution primitive: how we know who did what

Authenticated requests on the agent app are attributed via Auth.js v5 sessions:

- **Stateless JWT sessions** ([`src/lib/auth.ts:63`](../../src/lib/auth.ts)) — no DB lookup per request.
- **Server-side handlers read `await auth()`** — pattern in [`src/app/api/checkout/route.ts:17`](../../src/app/api/checkout/route.ts), [`src/app/api/oh-prep/publish/route.ts:34`](../../src/app/api/oh-prep/publish/route.ts), [`src/app/api/oh-prep/revoke/route.ts:26`](../../src/app/api/oh-prep/revoke/route.ts). Each pulls `session?.user?.email` and 401s if absent.
- **Middleware** ([`src/middleware.ts:18`](../../src/middleware.ts)) uses the `auth()` wrapper exposing `req.auth?.user?.email` — the pattern an admin-route gate leans on.
- **Email is lowercased** at every write site ([`src/lib/db.ts:38`](../../src/lib/db.ts), [`src/lib/dev-access.ts:36`](../../src/lib/dev-access.ts)). Hash must apply the same normalization before SHA-256.

**Privacy posture:** Paying and dev-access agents consent to product-improvement telemetry by signing up; events store `emailHash` only. Visitors to `/h/[slug]` are **not** identifiable — no IP, UA, or cookie capture. Count visits per slug per day and stop.

---

## 3. Existing API surface (event hook inventory)

Enumerating [`src/app/api/`](../../src/app/api/):

| Route | Auth gate | Action represented | Natural event |
|---|---|---|---|
| `POST /api/access/grant` ([route.ts](../../src/app/api/access/grant/route.ts)) | Public + access-code + rate-limited | Beta cohort member submits access code | `dev_access_requested` |
| `GET/POST /api/auth/[...nextauth]` ([route.ts](../../src/app/api/auth/[...nextauth]/route.ts)) | Auth.js handler | Magic-link send + verification | Fires `signin` from the `signIn` callback ([`src/lib/auth.ts:91`](../../src/lib/auth.ts)); fires `dev_access_granted` when `consumeDevAccessPending` returns true |
| `POST /api/billing-portal` ([route.ts](../../src/app/api/billing-portal/route.ts)) | Authed (middleware-protected pattern) | Open Stripe billing portal | `billing_portal_opened` (optional) |
| `POST /api/checkout` ([route.ts](../../src/app/api/checkout/route.ts)) | `await auth()` 401 gate | Create Stripe Checkout session | `checkout_started` |
| `GET /api/checkout/success` ([route.ts](../../src/app/api/checkout/success/route.ts)) | `await auth()` redirect gate | Post-pay redirect; writes sub to KV | `subscription_started` |
| `POST /api/webhook/stripe` ([route.ts](../../src/app/api/webhook/stripe/route.ts)) | Stripe signature | Subscription lifecycle | `subscription_started` (preferred — fires on first `customer.subscription.created`); also natural place for future `subscription_canceled` |
| `POST /api/oh-prep/publish` ([route.ts](../../src/app/api/oh-prep/publish/route.ts)) | `await auth()` 401 gate | Mint a `/h/[slug]` handout URL | `handout_url_generated` |
| `POST /api/oh-prep/revoke` ([route.ts](../../src/app/api/oh-prep/revoke/route.ts)) | `await auth()` 401 gate | Soft-revoke handout | `handout_url_revoked` |
| `GET /api/og/[slug]` ([route.tsx](../../src/app/api/og/[slug]/route.tsx)) | Public OG image | Social-share card render | Not tracked (incidental) |

The middleware ([`src/middleware.ts:75`](../../src/middleware.ts)) gates `/dashboard`, `/social-animator`, `/listing-flyer`, `/settings`, `/paywall`, and `/api/checkout/*`. `/api/events` would be added to that matcher list so anonymous events from the agent app are impossible — every accepted event has a verified session.

---

## 4. Existing KV conventions

Mirror what the codebase already does:

- **Lowercase, colon-delimited prefixes** — `user:{email}` ([`src/lib/db.ts:27`](../../src/lib/db.ts)), `dev_access:{email}` ([`src/lib/dev-access.ts:29`](../../src/lib/dev-access.ts)), `handout:{slug}` and `user:{email}:handouts` ([`src/lib/share-urls.ts:67`](../../src/lib/share-urls.ts)), `rate_limit_access:{ip}` ([`src/app/api/access/grant/route.ts:57`](../../src/app/api/access/grant/route.ts)).
- **TTLs via `{ ex: seconds }` on `kv.set`** or `kv.expire` after `kv.incr`.
- **No wrapper abstraction** — import `kv` from `@vercel/kv` directly, key prefix inline.

---

## 5. Recommended primitive: `POST /api/events`

### 5.1 Request shape

```
POST /api/events
Content-Type: application/json

{
  "name": "wizard_step_completed",
  "properties": {
    "tool": "open-house-prep",
    "step": 3,
    "stepName": "talking-points"
  }
}
```

- `name`: required string, snake_case, ≤64 chars, validated against the catalog in §6 (server rejects unknown names with 400 — keeps the catalog disciplined).
- `properties`: optional flat record of `string | number | boolean`. No nested objects, no arrays. Validated by shape and total serialized size (≤1 KB).

### 5.2 Authentication

Same `await auth()` 401 gate as [`src/app/api/oh-prep/publish/route.ts`](../../src/app/api/oh-prep/publish/route.ts). Anonymous requests are rejected. The route is added to the middleware matcher so it's covered by the subscription-bypass logic on the same terms as `/api/checkout`.

The **only** non-authenticated tracking path is the visitor counter (§5.5). That is a separate route, not an `/api/events` call.

### 5.3 Storage

One KV list per UTC day:

- Key: `events:YYYY-MM-DD`
- Op: `kv.lpush(key, JSON.stringify({ ts, emailHash, name, props }))` followed by `kv.expire(key, retentionSeconds)` on the first push of the day (mirrors the pattern in [`src/app/api/access/grant/route.ts:58`](../../src/app/api/access/grant/route.ts)).
- Retention: **30 days** for v1.46. Generous enough for two cohort cycles, short enough that we never accumulate meaningful PII liability even if email hashing were ever reversed.
- Event payload: `{ ts: number (unix ms), emailHash: string (hex), name: string, props: Record<string, string|number|boolean> }`.

LPUSH gives us free chronological reverse order for the admin viewer. LRANGE can paginate without sorting.

### 5.4 Email hashing

`emailHash = sha256(lowercase(email) + EVENTS_SALT)`, hex-encoded.

- Server-side only. The raw email never enters the events store.
- `EVENTS_SALT` is a new required env var (Vercel: Production + Preview). Document it next to `DEV_ACCESS_CODE` in the env-var section of the project README at deploy time.
- **Why a salt:** SHA-256 of an email alone is trivially reversible against a dictionary of plausible cohort emails. The salt makes the hashed identity useful only inside our infra — anyone exfiltrating an events dump cannot trivially correlate hashes back to people.

### 5.5 Visitor counter (separate path)

Not part of `/api/events`. A standalone increment fired from the `/h/[slug]` page render:

- Key: `handout_visits:{slug}:YYYY-MM-DD`
- Op: `kv.incr(key)` + `kv.expire(key, 90 * 24 * 60 * 60)` on first hit
- No event row, no fingerprinting, no headers captured. Just an integer per slug per day.

This can run as a server-side side-effect inside the existing `app/h/[slug]/page.tsx` server component ([`src/app/h/[slug]/page.tsx`](../../src/app/h/[slug]/page.tsx)) right after the successful `fetchHandout` call. No new route needed; reuses the existing render path. Wrap in try/catch so a KV blip never breaks the visitor page.

---

## 6. Initial event catalog (v1.46)

| # | Event name | Hook point | Attribution | Required props | Optional props |
|---|---|---|---|---|---|
| 1 | `signin` | `signIn` callback in [`src/lib/auth.ts:91`](../../src/lib/auth.ts), Phase 2 (link click) | Authed (emailHash) | — | `viaDevAccess` (boolean) |
| 2 | `dev_access_requested` | After `markPendingDevAccess` in [`src/app/api/access/grant/route.ts:118`](../../src/app/api/access/grant/route.ts) | Authed-with-just-validated email (emailHash) | — | — |
| 3 | `dev_access_granted` | Inside the `consumeDevAccessPending → grantDevAccess` branch in [`src/lib/auth.ts:96`](../../src/lib/auth.ts) | Authed (emailHash) | — | — |
| 4 | `checkout_started` | After Stripe session creation in [`src/app/api/checkout/route.ts:46`](../../src/app/api/checkout/route.ts) | Authed (emailHash) | `priceId` | — |
| 5 | `subscription_started` | First `customer.subscription.created` in [`src/app/api/webhook/stripe/route.ts:52`](../../src/app/api/webhook/stripe/route.ts) | Authed-by-customer-email (emailHash) | `status` | `currentPeriodEnd` |
| 6 | `tool_opened` | Page-mount `useEffect` in each tool's top-level client component (e.g. [`src/app/open-house-prep/page.tsx`](../../src/app/open-house-prep/page.tsx)) | Authed (emailHash) | `tool` | — |
| 7 | `wizard_started` | First step's mount in the wizard component (e.g. [`src/tools/open-house-prep/components/`](../../src/tools/open-house-prep/components/)) | Authed (emailHash) | `tool` | — |
| 8 | `wizard_step_completed` | "Next" handler in each step component | Authed (emailHash) | `tool`, `step`, `stepName` | `secondsOnStep` |
| 9 | `wizard_completed` | Review-step "Generate" / "Export" handler (e.g. `StepReview` in [`src/tools/open-house-prep/components/StepReview.tsx`](../../src/tools/open-house-prep/components/StepReview.tsx)) | Authed (emailHash) | `tool` | `totalSeconds` |
| 10 | `pdf_downloaded` | Existing PDF export click handler (e.g. [`src/app/listing-flyer/ExportButtons.tsx`](../../src/app/listing-flyer/ExportButtons.tsx)) | Authed (emailHash) | `tool` | `pages` |
| 11 | `handout_url_generated` | After `publishHandout` succeeds in [`src/app/api/oh-prep/publish/route.ts:74`](../../src/app/api/oh-prep/publish/route.ts) | Authed (emailHash) | `tool`, `type` | — |
| 12 | `handout_url_visited` | `/h/[slug]` server component, after successful `fetchHandout` | **Counter-only** (no emailHash row) | — | — |
| 13 | `handout_url_revoked` | After `revokeHandout` returns true in [`src/app/api/oh-prep/revoke/route.ts:51`](../../src/app/api/oh-prep/revoke/route.ts) | Authed (emailHash) | — | `ageDays` |

Thirteen rows; #12 is the counter-only path that does not go through `/api/events`. The other twelve are authenticated server-side events.

**Naming discipline:** snake_case, past tense for completed actions (`completed`, `started`, `generated`, `revoked`), present participle avoided. `tool` property uses the existing tool slugs (`open-house-prep`, `seller-intelligence-report`, `listing-flyer`, `listing-presentation`, `social-animator`, `open-house-promo` — derived from [`src/tools/`](../../src/tools/) directory names).

---

## 7. Client-side firing pattern

**Recommendation: a tiny `src/lib/track.ts` helper.** Centralized, greppable, easy to no-op in tests. Reject the "bare fetch from every component" alternative — it spreads the same five lines across a dozen files and makes future migrations (e.g. `navigator.sendBeacon`) require touching every call site.

Behavioral spec:

- Exported `track(name: string, properties?: Record<string, string | number | boolean>): void`.
- Fire-and-forget `fetch('/api/events', { method: 'POST', keepalive: true, body: JSON.stringify({ name, properties }) })`. No `await`, no `.then`. Swallow all errors — telemetry must never break user flow.
- `keepalive: true` so calls fired before navigate-away (e.g. `pdf_downloaded`) survive.
- No-op when `process.env.NEXT_PUBLIC_DISABLE_TRACK === '1'` for Playwright runs (pair with the existing `E2E_TESTING=1` in [`src/middleware.ts:30`](../../src/middleware.ts)).
- Server-side events (#1–5, #11, #13) call `kv.lpush` directly inside the route handler — they do not round-trip through `/api/events`. The helper is for client-originated events (#6–10) and the counter (#12).

---

## 8. Admin events explorer page

A Dallen-only `/admin/events` route. Customer-invisible. Server component.

### 8.1 Gating

- New env var `ADMIN_EMAILS` (comma-separated).
- Extend the middleware matcher in [`src/middleware.ts:75`](../../src/middleware.ts) to include `/admin/:path*`. If pathname starts with `/admin`, require `req.auth?.user?.email ∈ ADMIN_EMAILS.split(',').map(s => s.trim().toLowerCase())`. Otherwise 404 (not 403 — don't hint the route exists). Reuse the not-found surface from [`src/app/h/[slug]/not-found.tsx`](../../src/app/h/[slug]/not-found.tsx).

### 8.2 UI

- Single-page table: columns `ts` (UTC), `name`, `emailHash` (first 8 chars), serialized `props`.
- Filters: date (single day, default today), event name (dropdown from the catalog), emailHash prefix.
- Server component reads via `kv.lrange('events:YYYY-MM-DD', 0, 499)` and parses each entry. No client fetch, no caching.
- Visitor counters surface in a separate section listing `handout_visits:*` for the same date, fetched via `kv.scan`.

### 8.3 Out of scope for v1.46

Charts, sparklines, funnel visualization, cohort retention, real-time tail, CSV export. v1.46 ships the data layer; v1.47+ ships analysis. Instrument first, analyze second.

---

## 9. What this enables vs. cohort 1

Measurements cohort 1 (2026-05-18 → 2026-06-01) cannot make today that cohort 2 will be able to make:

- **Return rate per agent per tool** — count distinct days `tool_opened` fires per `(emailHash, tool)`.
- **Wizard drop-off step** — histogram of highest `step` reached in `wizard_step_completed` minus `wizard_completed` rate, per tool.
- **Wizard duration** — `wizard_completed.ts` minus `wizard_started.ts` for the same `(emailHash, tool)` within a session window.
- **Handout visit rate vs. publish rate** — ratio of `sum(handout_visits:{slug}:*)` to `count(handout_url_generated)`. Today we know how many handouts exist (owner index in [`src/lib/share-urls.ts:71`](../../src/lib/share-urls.ts)) but have no idea how many ever got opened.
- **Signup-to-first-export** — `signin → pdf_downloaded` interval per emailHash.
- **Dev-access to paid conversion** — count emailHashes that fire both `dev_access_granted` and later `subscription_started`.
- **Tool preference within a session** — `tool_opened` distribution per emailHash.
- **Revocation rate** — `handout_url_revoked / handout_url_generated`.

Cohort 1 ran on vibes; cohort 2 runs on numbers.

---

## 10. Stateless-principle compliance check

The principle as written in [`src/lib/db.ts`](../../src/lib/db.ts) ("no user content, no PII beyond email; user-edited content lives in localStorage") and the explicit exception in [`src/lib/share-urls.ts:9`](../../src/lib/share-urls.ts) (handouts persist because the recipient opens on a different device).

This proposal does not violate it:

1. **Events are anonymous usage telemetry, not user-authored content.** A `wizard_step_completed` row stores `{tool, step, stepName, secondsOnStep}` — not draft contents, not the property address. User-authored content stays in localStorage.
2. **Attribution is via salted hash, not raw identity.** The events store cannot trivially answer "what did `aaron@example.com` do" without recomputing the hash.
3. **Visitor handout path stores zero per-visitor data** — counter per slug per day only.
4. **Bounded retention.** 30 days for events, 90 days for visit counters; both auto-expire via KV TTL.
5. **Reversible.** Like the dev-access mechanism ([`src/lib/dev-access.ts:22`](../../src/lib/dev-access.ts)), the entire events surface can be ripped out by deleting one route, one helper, ~12 call sites, and one admin page. Stale `events:*` keys self-expire.

The principle protects users from "your work lives on our servers and we can lose it / get hacked / mine it." Anonymous usage telemetry doesn't trigger any of those threats.

---

## 11. Implementation scope estimate

Line items targeting half a day (≈4 hours) of focused Claude Code work:

| Item | Estimate | Notes |
|---|---|---|
| `POST /api/events` route + KV writer + name validation against catalog | 1 h | Mirrors the structure of `/api/oh-prep/publish` — auth check, JSON parse, write, return. |
| `src/lib/track.ts` client helper | 30 min | One function, fire-and-forget fetch, env-var no-op. |
| Wire ~12 events into existing hook points | 1.5 h | Five server-side hooks (auth callback, access grant, checkout, webhook, oh-prep publish/revoke) plus client-side helper calls in tool entry points and wizard step handlers. The `tool_opened` and `wizard_started` calls are one-liners in existing client components. |
| `/admin/events` page + middleware admin gate | 1.5 h | Server component reading via `kv.lrange`. Bulk of the time is the date/name/hash filter wiring. |
| `handout_url_visited` counter in `/h/[slug]` | 15 min | Single `kv.incr` after `fetchHandout`. |
| Tests: API route happy-path + 401 + unknown-name 400; admin gate 404-for-non-admin | 1 h | Playwright integration plus a unit test for hash determinism. |

**Total: ~5.75 hours.** That's a hair over the half-day target. If we hit friction on the wizard step instrumentation (each tool has its own step component layout — see [`src/tools/open-house-prep/components/`](../../src/tools/open-house-prep/components/) vs. [`src/tools/seller-intelligence-report/components/`](../../src/tools/seller-intelligence-report/components/)) the realistic ceiling is **1 full day**.

**Flag for blow-past-1-day risk:** if we discover that wizard step plumbing isn't uniform across tools, ship `tool_opened` + `wizard_completed` + `pdf_downloaded` + the server-side events in v1.46 and defer per-step granularity to v1.46.1. The data layer is still valuable without the step-level histogram.

---

## 12. Explicit non-goals for v1.46

Deliberately out of scope; park for v1.47+:

- **Funnel visualization** — no Sankey, no step-conversion bars. Raw event table only.
- **A/B testing infrastructure** — no experiment framework, no variant assignment.
- **Cohort retention curves** — no D1/D7/D30 retention math.
- **Real-time dashboards** — no streaming, no auto-refresh. Page reload to update.
- **Third-party analytics integration** — no PostHog, Segment, Mixpanel, Plausible, Umami, Amplitude. Hard line.
- **Public API for events** — `/api/events` is internal; no keys for third parties.
- **Per-visitor handout tracking** — the counter is per-slug per-day. No individual-visitor data, ever.
- **Persistent admin UI state** — server-component read view; no saved filters.

---

## 13. Acceptance criteria for v1.46

- Repository-wide grep for `track\(` (function call, not Tailwind class) returns ≥10 call sites across server routes and client components.
- `POST /api/events` rejects anonymous requests with 401 and unknown event names with 400.
- `/admin/events` returns 404 for any authed user whose email is not in `ADMIN_EMAILS`.
- After a full agent run-through of one tool, `kv.lrange('events:<today>', 0, 50)` returns at least 5 events (`signin`, `tool_opened`, `wizard_started`, `wizard_step_completed`, `wizard_completed`, `pdf_downloaded`).
- After opening a published `/h/[slug]` URL, `kv.get('handout_visits:<slug>:<today>')` returns ≥1.
- `EVENTS_SALT` and `ADMIN_EMAILS` are documented in the project README env-var section.
- No new dependencies added to [`package.json`](../../package.json).

If those six conditions pass, v1.46 ships and cohort 2 launches on real data.
