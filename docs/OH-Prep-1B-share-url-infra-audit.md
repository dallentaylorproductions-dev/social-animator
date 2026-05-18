# OH Prep Phase 1B — share URL infrastructure audit

**Date:** 2026-05-17
**Branch:** `phase-oh-prep-1-audit` (stacks on Audit 1A commit `427edd7`)
**Status:** Investigation-only. Second of three split Phase 1 audits. No code, no infrastructure setup, no env-var changes.
**Strategic frame:** Visitor-facing artifacts are text-friendly web URLs, not PDF downloads. Agent texts a short link; recipient opens a polished mobile-first page; PDF download is a secondary option. This audit specifies the publish-to-URL infrastructure that the OH Prep visitor handout (1C) ships on, and that the future Listing Landing Page (H-9 / Pro tier flagship) inherits.

---

## 1. Context

**Why this audit exists.** SEP today produces downloadable artifacts (PDF, JPEG, MP4, QR PNG). None of them have a text-friendly distribution path: a buyer at an open house doesn't want a 2MB PDF emailed to them; they want a tap-and-it-opens link. Audit 1C's visitor handout is the first SEP artifact in that category. Building the URL plumbing once — correctly — means the same plumbing carries Listing Landing Page (H-9), Showing Tour Page (W-1 Half B Gap #2), and any future visitor-facing artifact.

**Scope.** Route shape, slug generation, persistence backend, value schema, access control, retention policy, Open Graph metadata, mobile rendering posture, edit-after-publish, PDF fallback, and the architectural connection to Listing Landing Page.

**Out of scope.** Design language (Audit 1A — landed at commit `427edd7`). OH Prep tool data model + form architecture (Audit 1C — pending). Listing Landing Page content design (H-9, a separate future audit). Lead-capture forms on visitor pages (Pro tier hardening, §5).

**Stateless-principle exception, framed deliberately.** The existing 4 tools persist user content in browser localStorage — drafts, brand profile, listing profile. The first server-side content storage in the product is the published handout. The exception is necessary by definition: the recipient opens the URL on a different device than the agent; the data has to live somewhere both can reach. Frame this as the first crossing of the stateless → stateful boundary, drawn deliberately and minimally.

**Brand boundary.** This audit specifies the *plumbing*. The *visuals* on the handout page inherit from Audit 1A's design tokens + component primitives (mobile breakpoints in 1A §7, share-page hero/divider/CTA patterns).

---

## 2. URL scheme

### 2.1 Recommendation: `/h/[slug]`

```
https://studio.simplyeditpro.com/h/k3m9bxq7
```

**Rationale:**

- **Short.** 28 characters of path on top of the host. Text-friendly — fits a single line on iOS Messages bubble preview without truncation, fits in an Instagram bio.
- **Neutral.** `h` for "handout" but also reads as "here" or just a path token. Doesn't commit the namespace to "open house" specifically — Listing Landing Page (`type: 'listing-landing'`) and Showing Tour Page (`type: 'showing-tour'`) can share the namespace via the value's `type` field (§4).
- **Available.** Doesn't collide with any current route. Free of any SEP brand semantics (the namespace stays generic so it can host future content types without a route migration).

### 2.2 Alternatives considered and rejected

| Alternative | Why rejected |
|---|---|
| `/share/[slug]` | Longer; "share" connotes a verb action by the agent, but the URL is what the recipient sees — recipient context is "I'm viewing this", not "this was shared with me". |
| `/listing/[slug]` | Too narrow. The handout isn't always a listing (open-house promo can be a coming-soon, just-sold, etc.). Listing Landing Page would have to pick a different prefix and the namespace fragments. |
| `/v/[slug]` (view) | Slightly shorter but `v/` is ambiguous in URLs — readers assume "v1" or "version". `h/` reads as a content-namespace marker. |
| `/p/[slug]` (publish/page) | Same ambiguity issue; "p" is commonly used by analytics tools for "page" tracking parameters. |
| Custom subdomain `share.simplyeditpro.com/[slug]` | Reads polished but adds DNS config, certificate management, Vercel domain wiring, and the path-prefix approach already gives most of the same benefit. Defer indefinitely. |

### 2.3 Slug character set

Lowercase Crockford base32 minus visually ambiguous characters:

```
0123456789abcdefghijkmnpqrstvwxyz
```

(32 characters: digits 0-9, lowercase a-z, **excluding** `i`, `l`, `o`, `u` — the standard Crockford set. This is the strictest visual-disambiguation choice.)

**Why not full base62 (case-sensitive a-zA-Z0-9)?**

- Case-sensitive URLs are a hostile UX. Texting a URL and the recipient retyping it (rare but happens) is error-prone if `Kx7` and `kx7` are different handouts.
- Single-case lowercase is the SEP-brand-consistent choice (the rest of the app uses kebab-case paths).

**Why Crockford and not base32 RFC 4648?**

- RFC 4648 keeps `o` and `0`, `i` and `1`. Crockford drops those by design.

### 2.4 Slug length recommendation: 8 characters (D8)

| Length | Possibilities | Collision risk at 100k handouts | URL aesthetic |
|---|---|---|---|
| 6 chars | 32⁶ ≈ 1.07 × 10⁹ | ~1 in 10,700 per write — noticeable, retry-on-collision is load-bearing | `h/k3m9bx` — very short |
| 8 chars | 32⁸ ≈ 1.1 × 10¹² | ~1 in 11,000,000 per write — effectively zero | `h/k3m9bxq7` — still short |
| 10 chars | 32¹⁰ ≈ 1.13 × 10¹⁵ | ~1 in 11,000,000,000 per write | `h/k3m9bxq7r2` — longer than necessary |

**Recommend 8.** The collision retry mechanism handles 6 just fine, but 8 makes collisions a non-event and the visual cost is two extra characters. Dallen confirms in D8.

---

## 3. Slug generation

### 3.1 Custom function (~15 LOC)

No library needed. Implementation phase, target `src/lib/slug.ts`:

```typescript
import { randomBytes } from 'node:crypto';

const ALPHABET = '0123456789abcdefghijkmnpqrstvwxyz'; // 32 chars, Crockford
const SLUG_LEN = 8;

export function generateSlug(): string {
  // 5 bits per char × 8 = 40 bits = 5 bytes. randomBytes(5) gives us
  // exactly the entropy we need; map each 5-bit chunk to an alphabet char.
  const bytes = randomBytes(5);
  let bits = 0n;
  for (const b of bytes) bits = (bits << 8n) | BigInt(b);
  let slug = '';
  for (let i = 0; i < SLUG_LEN; i++) {
    slug = ALPHABET[Number((bits >> BigInt(5 * i)) & 31n)] + slug;
  }
  return slug;
}
```

CSPRNG output (`crypto.randomBytes`) — not `Math.random`. Slugs are not security boundaries (the URL is public by design — §5), but using a real PRNG eliminates any "predictable next slug" attack surface.

### 3.2 Collision check on write

`@vercel/kv` exposes the underlying Redis `SET NX` semantics:

```typescript
const ok = await kv.set(key, value, { nx: true });
if (ok !== null) return slug; // success — key didn't previously exist
```

`nx: true` means "only set if the key does not exist." Returns `'OK'` (or similar truthy) on success, `null` on collision. Retry pattern:

```typescript
for (let attempt = 0; attempt < 3; attempt++) {
  const slug = generateSlug();
  const ok = await kv.set(handoutKey(slug), record, { nx: true });
  if (ok !== null) return slug;
}
throw new Error('Slug generation failed after 3 attempts'); // ~1 in 10^21 odds
```

3 attempts is overkill given 8-char base32, but it costs nothing and makes the algorithm robust if length ever drops to 6 (D8).

### 3.3 What we do NOT do

- **No vanity slugs.** The agent doesn't pick the slug. Random slugs avoid PII leakage (a slug like `4270-dudley-dr` exposes the seller's address before the recipient consents to viewing it; random `k3m9bxq7` reveals nothing).
- **No incrementing IDs.** Predictable IDs let crawlers enumerate the namespace. Random opaque slugs make enumeration costly.
- **No URL-segment trailing slashes / extensions.** `h/k3m9bxq7` is canonical; no `.html`, no trailing slash. Next.js handles both 301-redirects to canonical.

---

## 4. Persistence backend

### 4.1 Vercel KV (already wired)

Verified in `package.json`:

- `@vercel/kv@^3.0.0` — primary client
- `@upstash/redis@^1.37.0` — underlying Upstash SDK (transitively used; available for lower-level commands if ever needed)

Current product use ([src/lib/db.ts](src/lib/db.ts)) is the paywall ledger: `user:[email]` → `UserRecord` with subscription status. The pattern is `kv.get<T>(key)` and `kv.set(key, value)`. No wrapper helper layer — `@vercel/kv` is invoked directly. **Reuse the same pattern.** Don't introduce a wrapper unless this audit's namespace warrants one (it doesn't).

Env vars already present in production per the prior session's audit findings (`KV_URL`, `KV_REST_API_URL`, `KV_REST_API_TOKEN`, `KV_REST_API_READ_ONLY_TOKEN`).

### 4.2 Key namespace

Existing convention: colon-separated, lowercase, descriptive prefix (`user:[email]`).

Adopt for handouts:

| Key | Type | Purpose |
|---|---|---|
| `handout:[slug]` | string (JSON) | Primary handout record |
| `user:[email]:handouts` | set | Owner-index — slugs created by this user (for the "my published handouts" management page, Pro tier surface) |

The `:handouts` suffix on the existing `user:[email]` namespace is safe — Redis treats it as a different key entirely. No collision with `UserRecord`.

### 4.3 Value shape

```typescript
// src/lib/handout.ts — implementation phase
export type HandoutType = 'open-house' | 'listing-landing' | 'showing-tour' | string;
// `string` fallback is intentional — future handout types can be added
// without a type-system migration; runtime validation gates the routes
// each type renders to.

export interface HandoutRecord {
  /** Repeated in the value for log/debug convenience even though the key carries it. */
  slug: string;

  /** Which downstream route renders this record. */
  type: HandoutType;

  /**
   * Auth.js user identity. Lowercase email — matches the existing
   * `user:[email]` convention in `src/lib/db.ts`. No separate user-id
   * indirection layer in this product.
   */
  ownerEmail: string;

  /** ISO 8601 UTC. */
  createdAt: string;
  updatedAt: string;

  /** ISO 8601 UTC. Absent = indefinite (default in v1 per D5). */
  expiresAt?: string;

  /** Soft-delete flag. Revoked handouts return a "this handout was taken
   * down" page instead of 404 — lets the agent see what they revoked. */
  revoked?: boolean;

  /**
   * Type-specific payload. For `type: 'open-house'`, the shape is whatever
   * 1C specifies. Treated as opaque JSON at this layer.
   */
  data: Record<string, unknown>;
}
```

Why the discriminated `type` field is load-bearing:

- Listing Landing Page (H-9) and Showing Tour Page (W-1 Half B Gap #2) reuse the same namespace by adding new `type` values. The `/h/[slug]` route reads the record, switches on `type`, and renders the right surface.
- Reduces future migration work to zero — no separate `handout:` / `landing:` / `tour:` namespaces drifting apart.

### 4.4 Read pattern

Single `kv.get` per page view:

```typescript
const record = await kv.get<HandoutRecord>(`handout:${slug}`);
if (!record || record.revoked) return notFound(); // Next.js 404
```

No caching layer at the application level — Vercel KV is already low-latency (<10ms typical from a Vercel function). Adding a Next.js `unstable_cache` wrapper later is an option if read amplification becomes a problem; not needed for v1.

### 4.5 Write patterns

**Publish (first time, slug not yet known):**

```typescript
for (let attempt = 0; attempt < 3; attempt++) {
  const slug = generateSlug();
  const record: HandoutRecord = { /* … */ };
  const ok = await kv.set(`handout:${slug}`, record, { nx: true });
  if (ok !== null) {
    await kv.sadd(`user:${ownerEmail}:handouts`, slug);
    return slug;
  }
}
```

**Update (slug already known):**

```typescript
const existing = await kv.get<HandoutRecord>(`handout:${slug}`);
if (!existing || existing.ownerEmail !== currentUserEmail) throw forbidden();
const updated = { ...existing, ...patch, updatedAt: new Date().toISOString() };
await kv.set(`handout:${slug}`, updated);
```

**Revoke (soft delete):**

```typescript
const existing = await kv.get<HandoutRecord>(`handout:${slug}`);
if (!existing || existing.ownerEmail !== currentUserEmail) throw forbidden();
await kv.set(`handout:${slug}`, { ...existing, revoked: true, updatedAt: now });
// Owner-index stays intact so the agent can see revoked handouts in their list.
```

### 4.6 KV cost estimate

Vercel KV (Upstash) bills per command. Cost-driving operations:

| Operation | Frequency assumption | Commands |
|---|---|---|
| Publish (new handout) | 4 / user / month avg | 1 SET + 1 SADD per publish |
| Update (edit) | 2 / handout / month | 1 GET + 1 SET |
| Revoke | rare | 1 GET + 1 SET |
| Page view (recipient) | 50 / handout avg | 1 GET per view |
| Owner-list page view | rare | 1 SMEMBERS + N GETs |

At 500 active users · 4 handouts · 50 views = **100,000 page-view GETs/month**. Add another ~10k commands for publishes/edits = **~110k commands/month total**.

Vercel KV Pro tier (current product tier — verified by paywall + Auth.js dependency on KV already operating in production) includes generous command quotas (Upstash Pro is 10,000 commands/day = 300k/month minimum, with higher quotas at scale). Comfortable headroom for v1. Revisit if growth pushes past 1M views/month.

---

## 5. Access control

### 5.1 v1: public-with-knowledge-of-URL

Anyone with the slug can view the handout. No login. No email gate. No view-counter limit.

**Standard pattern for marketing share links:**

- LinkedIn share-by-URL
- Calendly booking links
- Notion shared-page links
- Loom recording URLs
- Vercel preview deploy URLs

The randomized 8-char slug puts the namespace at ~1 trillion possibilities. Random enumeration is computationally prohibitive — at 100ms per HTTP request, scanning 1% of the namespace = ~35,000 years of constant scraping. The slug is the access control, by design.

### 5.2 What this is NOT

Be honest in product copy and any external-facing documentation:

- **NOT private.** The URL leaks to whoever the agent texts it to. That recipient can forward to anyone — a screenshot of the URL bar is enough.
- **NOT auth-gated.** Recipients don't sign in. There's no membership check.
- **NOT one-time.** The URL works for every visit until revoked or expired.
- **NOT encrypted client-side.** Vercel KV / Upstash provides infrastructure-level at-rest encryption (per Upstash's standard cloud-provider posture on AWS); the handout's content is *not* encrypted by SEP application code before storage. A KV-level compromise would expose handout content.
- **NOT immune to scraping/archiving.** Once a URL is in the wild, services like archive.org or Slack link unfurling will store it. SEP can't claw that back.

Product copy at publish time should say something like:

> "Anyone with this link can view the handout. Don't include private details you wouldn't want to leak."

This is honest framing, matches user mental models from Loom / Calendly / Notion sharing, and avoids the trust collapse that comes from overclaiming privacy.

### 5.3 Pro-tier hardening options (deferred, flagged for future)

When ready to differentiate Pro from Starter:

| Feature | Implementation sketch | Complexity |
|---|---|---|
| Soft-revoke | Already specified above — `revoked: true` flag flips the page to "taken down" copy | Trivial (in v1 schema) |
| Email-gated view | Visitor enters email before content reveals; store in `user:[email]:handouts:[slug]:visitors` set | Medium — lead capture UX + email validation |
| One-time URL | View counter via `kv.incr`; expires after N views | Medium |
| Password gate | Optional shared password on the handout; visitor enters before content reveals | Medium |
| Custom domain alias | Maps `agent.com/h/[slug]` to SEP's `/h/[slug]` via CNAME + Vercel rewrites | High |

None block v1. Each can ship independently behind the Pro tier paywall when the time comes.

---

## 6. Retention policy (D5)

Two options:

### Option (a) — Indefinite, until revoked

Default to no expiration. Agent explicitly revokes when ready. KV record stays until the soft-revoke flag is flipped.

- **Pro:** Agent's mental model is "I texted this link to a buyer; if they reopen 6 weeks later for a follow-up, it should still work." Matches Loom / Calendly / Notion-shared-page semantics. Eliminates a class of "why is my link broken" support tickets.
- **Con:** Stale handouts accumulate forever. Some agents will create 50 handouts and revoke none. Storage growth is unbounded.

### Option (b) — Auto-expire after 60–90 days

Set `expiresAt` on every publish; KV record returns 404 (or "expired" page) after that point. Optionally let agents extend.

- **Pro:** Storage growth bounded by churn. Forces agents to think about whether old handouts should still be live.
- **Con:** Surprises agents — "I texted Bob this link a week before the open house and now it's broken." Re-publishing means a new URL, which the agent has to redistribute.

### Audit recommendation: (a) indefinite + soft-revoke

The agent's distribution behavior — text once, expect it to work later — leans hard toward (a). Storage growth is bounded in practice by Pro-tier seat count, not by per-user handout count (each agent has ~4-20 active handouts at any time; revoke + expire mechanics matter much less than raw user count).

Footer on every handout page shows `Last updated [date]` so stale shares are obvious to recipients. If a 6-month-old open-house handout opens, the date stamp tells the visitor "this is from June 2025" — that's the right consumer-facing signal, not a 404.

**Optional middle ground:** Indefinite default, but auto-revoke if `data.eventDate` is set AND > 30 days past. That's open-house-specific (the event is over; the handout is no longer relevant). Adds a small cron-like check at read time:

```typescript
if (record.type === 'open-house' && record.data.eventDate < 30daysAgo) {
  return autoRevokedPage(record); // soft-revoke at read time
}
```

Not auto-deletion from KV — just a read-time "this event is past" surface. Implementation is one line in the handout page route. Adopt at Dallen's discretion in D5.

---

## 7. Open Graph metadata

Required for text/email/iMessage/Slack/social preview cards. Without OG, a texted URL renders as raw text in iMessage; with OG, the recipient sees a card with property photo + address + price — that's the polish signal.

### 7.1 OG tag set

| Tag | Source | Example |
|---|---|---|
| `og:title` | `data.propertyAddress` + " · " + handout-type label | "4270 Dudley Dr NE · Open House" |
| `og:description` | `data.headline` or one-line auto-derived (price + neighborhood) | "Saturday 1–4pm · $685,000 · Beaverton" |
| `og:image` | `data.heroPhoto` if uploaded; otherwise dynamic OG card (§7.3) | `https://studio.simplyeditpro.com/api/og/[slug]` |
| `og:url` | Canonical handout URL | `https://studio.simplyeditpro.com/h/k3m9bxq7` |
| `og:type` | static `'website'` | `website` |
| `twitter:card` | static `'summary_large_image'` | `summary_large_image` |
| `twitter:image` | same as `og:image` | (mirror) |

### 7.2 Implementation: Next.js `generateMetadata`

Next.js 16 supports `generateMetadata` on dynamic routes. The page at `src/app/h/[slug]/page.tsx` exports both `generateMetadata` (returns the OG tag set) and the default page component (renders the visible content). Both run server-side; both can read the KV record. To avoid two `kv.get` round-trips per page view, share the lookup via Next.js's `cache()` wrapper:

```typescript
// Pseudocode — implementation phase
import { cache } from 'react';
import { kv } from '@vercel/kv';

const getHandout = cache(async (slug: string) =>
  kv.get<HandoutRecord>(`handout:${slug}`)
);

export async function generateMetadata({ params }: { params: { slug: string } }) {
  const record = await getHandout(params.slug);
  if (!record || record.revoked) return { title: 'Handout not found' };
  return {
    title: `${record.data.propertyAddress} · ${labelForType(record.type)}`,
    description: deriveDescription(record),
    openGraph: { /* tags from §7.1 */ },
    twitter: { card: 'summary_large_image', images: [ogImageUrl(record.slug)] },
  };
}
```

`cache()` from React (Next.js 16 wraps it) dedupes the lookup so `generateMetadata` and the page component share one KV call.

### 7.3 Dynamic OG image (D7)

Two implementation options:

**(a) Dynamic via Next.js `next/og` (built-in, no new dep)**

Next.js 16 ships `ImageResponse` from `next/og` — runs at the Vercel Edge, renders a JSX-defined card to PNG on demand. Route: `src/app/api/og/[slug]/route.ts`.

- **Pro:** No dependency to add. Cards inherit Audit 1A's mint accent + dark canvas + Geist typography (Geist Sans must be loaded via `font` arg — same TTF asset as D5 from 1A). Property address + price + status badge rendered fresh per handout.
- **Pro:** Auto-cached by Vercel's CDN with the `s-maxage` headers Next.js sets by default — repeated previews don't re-render.
- **Con:** Slight cold-start latency on first preview (~200-400ms) — usually invisible because text-app preview cards load asynchronously after the message bubble shows.

**(b) Static fallback PNG, served from `/public/`**

A single branded fallback image (SEP-styled, no per-handout customization). Used when `data.heroPhoto` is present (the OG image is the photo directly) and the dynamic card is only used as fallback when no photo exists.

- **Pro:** Zero rendering cost.
- **Con:** No per-handout customization in the fallback case. Reads as generic.

### Audit recommendation: (a) dynamic via `next/og`

Cards are the agent's polish-bar test — Aaron-network top agents will notice generic preview cards. Dynamic costs nothing in dependencies and is built into Next.js 16. The fallback case (no `heroPhoto` uploaded) renders a real branded card with the property address, not a generic logo. Dallen confirms in D7.

Verified in `package.json`: `next/og` is part of the `next@16.x` package itself; no separate `@vercel/og` install needed.

---

## 8. Mobile-first rendering

### 8.1 SSR for OG + bots; client interactivity layered on

The handout page is a Next.js server component by default. First-paint and OG metadata both come from the server side — important for iMessage / Slack / WhatsApp bots that fetch the URL once and don't execute JavaScript. Server component does the KV lookup, passes the data into the layout, renders.

Client interactivity (sticky FAB scroll behavior from 1A §7.6, photo lightbox if added later) is a small client component island layered into the server-rendered shell. Standard Next.js 16 pattern.

### 8.2 Photo optimization

Property photos from `data.heroPhoto` (and any gallery photos) flow through Next.js `<Image>` component for automatic format negotiation (WebP/AVIF), responsive sizing, and lazy loading below the fold.

Storage of photo source: Audit 1C decides whether photos live inline in the KV value (data URLs, ≤500KB each — fits comfortably for 1-2 photos), or in a separate blob store (Vercel Blob, S3, etc.). For v1 the inline data-URL approach is simplest and matches the existing tools' photo-handling pattern (`PromoDraft.photos[].src` is already a data URL). If that grows uncomfortable, Vercel Blob is a one-PR migration.

### 8.3 Layout inherits Audit 1A

- Breakpoints from 1A §7.1 (`<375px`, `375-639px`, `640-1023px`, `≥1024px`)
- Body padding from 1A §7.2 (`px-4` mobile → `px-6` sm and up)
- Max-width `max-w-2xl` (672px) on desktop body
- Hero pattern from 1A §7.4 (edge-to-edge image, address H1, big price)
- Section divider pattern from 1A §7.5
- CTA pattern from 1A §7.6 (inline pill + sticky FAB on scroll)

This audit's job is the *plumbing*; 1A's job is the *look*. The implementation commit imports 1A's primitives.

---

## 9. Edit-after-publish workflow

### 9.1 Same URL stays live

The slug is generated once at publish time and never changes. Subsequent edits update the KV value at the same key. URL semantics:

- Agent shares URL once.
- Agent edits content → next page view shows updated content.
- Recipients who already loaded the page see the old version until they reload (acceptable for v1 — visitors typically open once and don't refresh).

### 9.2 Cache invalidation

No application-level cache to invalidate. Vercel KV reads are direct; React `cache()` dedupes per-request only. The only cache concern is Vercel CDN caching of the page response.

For v1, set the page's response to `Cache-Control: public, s-maxage=0, must-revalidate` so the CDN doesn't cache. Trades CDN cache hits for content-freshness — acceptable because KV reads are <10ms and visitor traffic per handout is modest (~50 views avg).

**OG image is the exception** — those should cache. Set `s-maxage=86400, stale-while-revalidate` on the `/api/og/[slug]` route response. Edit-after-publish doesn't bust this cache; agents who change the property address won't see updated OG cards in iMessage previews for up to a day. That's a real edge case; revisit if it causes confusion.

### 9.3 What we deliberately do NOT do

- **No version history.** Edit overwrites. No "view previous version" feature in v1.
- **No notification to past visitors.** No way to email recipients when content changes.
- **No diff view for the agent.** Edit form just shows current state.
- **No edit-lock or collaborative editing.** Single owner; concurrent edits last-write-wins.

These are all addressable in Pro-tier or v2; explicitly noted as v1 limitations so the implementation prompt doesn't accidentally scope-creep them in.

---

## 10. PDF fallback

Every handout page has a "Download PDF" CTA. Spec:

- **Same content data, different renderer.** The page uses the JSX-tree handout layout; the PDF uses a parallel react-pdf `<Document>` with the same data input.
- **Reuses Audit 1A's `pdf-theme.ts` tokens.** Web/PDF parity per 1A §6.
- **Generated browser-side, on demand.** Same `pdf().toBlob()` pattern as the SIR + LP downloads ([src/tools/seller-intelligence-report/output/pdf-export.tsx](src/tools/seller-intelligence-report/output/pdf-export.tsx) is the precedent).
- **Filename:** `[property-address-slug]-open-house.pdf` — kebab-cased, address-derived, matches the existing `addressSlug()` helpers across tools.
- **No server-side PDF rendering.** Keeps the surface stateless from the server's perspective; the PDF generation happens entirely in the recipient's browser. Big enough handouts (1-2MB inline photos) may take a couple seconds to render; acceptable.

**Audit 1C decides what content goes in the PDF.** This audit only commits that the PDF button exists and the renderer reuses 1A's PDF theme.

---

## 11. Architectural connection to Listing Landing Page (H-9)

H-9 (Pro tier flagship per W-1 Half B audit §6 Gap #1) needs the same infrastructure. Explicit reuse map:

| Concern | OH Prep handout (1C) | Listing Landing Page (H-9) | Shared infrastructure |
|---|---|---|---|
| URL prefix | `/h/[slug]` | `/h/[slug]` | Same route directory |
| Persistence | `handout:[slug]` with `type: 'open-house'` | `handout:[slug]` with `type: 'listing-landing'` | Same KV namespace |
| Value schema | `HandoutRecord` from §4.3 with type-specific `data` | Same `HandoutRecord` shape, different `data` payload | Same TypeScript interface |
| OG metadata | Property address + open-house framing | Property address + listing-launch framing | Same `generateMetadata` skeleton; `type`-aware branching |
| Mobile rendering | Hero photo + event details + agent contact | Hero photo + listing details + lead-capture form | Same shell, different content sections |
| PDF fallback | Open-house promo PDF | Listing-flyer-equivalent PDF | Same `pdf-theme.ts` |
| Access control | Public-with-knowledge-of-URL | Same | Same auth bypass via middleware matcher omission |

**Architectural seam: the `type` field on `HandoutRecord`.** The `/h/[slug]/page.tsx` route loads the record, switches on `type`, renders the correct content component. Adding Listing Landing Page later is one new content component + one switch arm + one new type in the union. Zero migration of the URL infrastructure, persistence, OG plumbing, or access control.

**Naming consideration deferred to H-9 audit:** if Listing Landing Page wants a more semantic URL like `/listing/[slug]`, that's an aliasing decision (route both to the same handler) that the H-9 audit makes. Audit 1B's recommendation is one namespace until there's evidence the agent-mental-model warrants two.

---

## 12. Decisions for Dallen

Numbering continues from Audit 1A (which ends at D6).

### D5 — Retention policy

Option (a) indefinite + soft-revoke vs option (b) auto-expire 60-90 days. Optional middle ground: indefinite + auto-revoke at read time when `type === 'open-house'` AND `eventDate` is > 30 days past.

**Audit recommendation: option (a) with the optional middle-ground enabled for open-house specifically.** Agent mental model is "link stays live until I take it down"; the open-house-specific middle ground catches the one case where an event being over makes the handout stale by definition.

### D6 — URL scheme

`/h/[slug]` recommended. Alternatives `/share/`, `/listing/`, `/v/`, `/p/` documented in §2.2 with rejection rationale. `/h/[slug]` is short, namespace-neutral, and reserves the path-prefix space for type-specific aliases later if needed.

**Audit recommendation: `/h/[slug]`.**

### D7 — OG image fallback strategy

Option (a) dynamic via `next/og` (Next.js 16 built-in, no dep, per-handout branded cards) vs option (b) static branded fallback.

**Audit recommendation: option (a).** Dynamic rendering with `next/og` is the polish-bar choice and adds zero dependencies. The fallback rendering uses Audit 1A's design tokens — mint accent on dark canvas with Geist typography — so the preview card reads as a SEP-branded artifact, not a generic Open Graph rectangle.

### D8 — Slug length

6 vs 8 chars. Both feasible; 8 makes collisions a non-event and the URL aesthetic cost is two characters.

**Audit recommendation: 8 chars.**

### D9 — Owner-index data structure

Redis SET (`SADD` / `SMEMBERS`) vs JSON array stored at a key (`kv.set` + `kv.get` with read-modify-write).

**Audit recommendation: Redis SET.** Atomic, no read-modify-write race condition when two publishes happen concurrently. `@vercel/kv` exposes `kv.sadd()` and `kv.smembers()` directly. Cost-equivalent.

### D10 — Concurrent access on Cache-Control posture

`s-maxage=0, must-revalidate` on the handout HTML response (no CDN caching) vs `s-maxage=60` (1-minute CDN caching, edits visible within 60s).

**Audit recommendation: `s-maxage=0, must-revalidate`.** Edit-after-publish is a documented v1 behavior; CDN caching would break it. KV reads are fast enough that no-cache is acceptable for v1 traffic volumes. Revisit when traffic warrants.

---

## Privacy honesty checklist (self-review)

Confirmed before commit:

- [x] No claim that URLs can't be reshared (they can — explicit in §5.2)
- [x] No claim of end-to-end encryption (only standard Upstash at-rest encryption, explicitly framed in §5.2)
- [x] No claim of access control beyond knowledge-of-URL for v1 (Pro-tier hardening options separately flagged in §5.3)
- [x] No claim that visitors can be identified or tracked without explicit field collection
- [x] Edit-after-publish does NOT promise version history (explicit in §9.3)
- [x] Recipient data framed as "what the agent typed in" — no implicit "we capture visitor info" claim
- [x] OG image cache may show stale previews briefly after an edit — flagged honestly in §9.2
- [x] Retention policy options framed honestly with both pro and con

---

## Sources

Files read in full or in relevant sections:

- [src/lib/db.ts](src/lib/db.ts) — current KV usage pattern (`kv.get<T>`, `kv.set`, colon-namespaced keys, lowercase-email user identity)
- [src/middleware.ts](src/middleware.ts) — allowlist matcher pattern (public routes are simply omitted; `/h/[slug]` will follow this pattern)
- `package.json` dependencies — verified `@vercel/kv@^3.0.0` + `@upstash/redis@^1.37.0` installed; no separate OG dep needed (Next.js 16 ships `next/og` built-in)

Reused from Audit 1A (commit `427edd7`):

- §7 — share-page mobile-first breakpoints, hero/divider/CTA patterns
- §6 — `pdf-theme.ts` token system for the PDF fallback

Reused from prior session context:

- Vercel KV env-var posture (`KV_URL`, `KV_REST_API_URL`, `KV_REST_API_TOKEN`, `KV_REST_API_READ_ONLY_TOKEN`) — confirmed wired in production via paywall + Auth.js verification token usage
- Existing tool patterns for data-URL photo storage (`PromoDraft.photos[].src`) — informs §8.2 storage decision
- Existing PDF download pattern from [src/tools/seller-intelligence-report/output/pdf-export.tsx](src/tools/seller-intelligence-report/output/pdf-export.tsx) — informs §10 PDF fallback approach

Strategic context embedded in the prompt:

- Stateless-principle exception framing for the first server-side content
- H-9 Listing Landing Page architectural overlap as a deliberate v1 design goal
- Aaron 2026-05-17 polish bar — drives the dynamic OG card recommendation
