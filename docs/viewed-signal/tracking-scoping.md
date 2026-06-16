# Viewed Signal — Tracking Infrastructure Scoping

> **Status: SCOPE ONLY — no build, no branch, no merge.** This is the data/tracking
> layer that would feed the agent-facing engagement surface designed in
> `Building Tools/claude-design-handoff-agent-engagement-followup.md`. Read against
> the real code as of `main` @ a8d3198. For Dallen to review, settle the open
> decisions, then we design the agent surface and build in phases.

---

## TL;DR recommendation

Record views with a **fire-and-forget beacon → one tiny API route → an append to a
separate `views:<slug>` KV record**. Reuse the client island already mounted on every
published page ([motion.ts](../../src/tools/seller-presentation/output/motion.ts),
`PresentationPageMotion`) so we add **zero new components to the seller page** and the
seller never sees anything. Storage is keyed by slug, owner-derivable through the
existing owner index, and costs a fraction of a cent per page per month. Phase 1 ships
**opened + returned-after-reveal + the agent view**; depth/"hot" and the follow-up
nudge are deliberately deferred.

The single missing primitive that blocks "returned after reveal" is a **`revealedAt`
timestamp** — it does not exist today and must be stamped at publish time. Details below.

---

## 1. How `/h/<slug>` renders + the ownership model

The plumbing for this feature is already almost entirely in place — the codebase even
left a `viewCount` field reserved for it.

- **The page.** [src/app/h/[slug]/page.tsx](../../src/app/h/[slug]/page.tsx) is a
  server component, `export const dynamic = 'force-dynamic'` / `revalidate = 0` (no CDN
  caching — every open is a real server hit). It calls `fetchHandout(slug)` and
  type-dispatches: `seller-presentation` → `SellerPresentationPage`. There is already a
  **client island on every published page** — `<PresentationPageMotion />`
  ([presentation-page.tsx:179](../../src/tools/seller-presentation/output/presentation-page.tsx#L179))
  — which is the natural, zero-new-surface place to fire a view beacon.

- **The record.** Published pages are `HandoutRecord`s in Vercel KV under
  `handout:<slug>` ([share-urls.ts:47](../../src/lib/share-urls.ts#L47)). Each record
  carries `ownerEmail` (lowercased), `createdAt`/`updatedAt`, `type`, soft-state flags
  (`revoked`, `archived`, `expiresAt`), and the public-only `data` payload.

- **Ownership / scoping.** A Redis SET `user:<email>:handouts` indexes every slug an
  agent owns (`ownerIndexKey`). `listOwnerHandoutRecords(email)`
  ([share-urls.ts:219](../../src/lib/share-urls.ts#L219)) is the privacy spine — it reads
  only THIS agent's slugs and re-checks `ownerEmail` on each record. The agent's "Your
  pages" library ([pages route](../../src/app/api/seller-presentation/pages/route.ts))
  is built on exactly this, gated behind `SELLER_PAGES_LIBRARY_ENABLED`.

- **State A / reveal state.** `valuationStatus` lives on the draft and is snapshotted
  into the public payload
  ([types.ts:372](../../src/tools/seller-presentation/engine/types.ts#L372)). Three
  values: `preparing_for_walkthrough` / `ready_to_review` (State A — the prepared
  invitation, no price) and `revealed` (State B — full presentation; the default for any
  pre-State-A page). The render branches on it. **Crucially, the reveal is just a
  re-publish that flips `valuationStatus` to `revealed`** via `updateHandout`, which
  bumps `updatedAt` — but there is **no dedicated `revealedAt` timestamp** anywhere in
  the code (confirmed: `grep revealedAt` → nothing). That gap is the one thing Phase 1
  must add (see §4).

**Where an events record lives:** a sibling KV key, `views:<slug>`, in its own
namespace — NOT inside the `handout:` record. Keeping it separate means a view write
never races a publish/edit/archive write on the same key, and the hot public-page write
path never has to read-modify-write the (larger) handout record.

---

## 2. Capturing a "viewed" event — the cheap, margin-safe shape

**Recommended approach — beacon → route → KV append:**

1. **Beacon (client).** In the existing `PresentationPageMotion` island, on mount fire
   `navigator.sendBeacon('/api/h/<slug>/view', body)` (falls back to `fetch(..., {keepalive:true})`).
   `sendBeacon` is the right tool: non-blocking, survives the page being backgrounded,
   never delays render, costs the seller nothing. One beacon per page load.
2. **Route.** A new `POST /api/h/[slug]/view` — `runtime = 'nodejs'`, no auth (the seller
   is anonymous), returns `204` immediately. It does the KV write and nothing else.
3. **Storage.** Append/increment into `views:<slug>` (shape in §"Data model" below).

**Anti-abuse / keeping the count honest (cheap):**
- **Session de-dupe:** the beacon sends a random `sid` persisted in `sessionStorage`, so
  one tab session = one "open." Same tab refresh within session doesn't inflate count;
  a genuine new visit (new session) does.
- **Bot filtering:** skip the write for obvious crawlers (UA check) — and note OG/link
  unfurl hits already go to the *separate* `/api/og/<slug>` route, not the page, so
  they don't pollute views. (Worth confirming iMessage/WhatsApp preview behavior in
  testing — see open decisions.)
- **No PII:** store a coarse timestamp + opaque `sid` hash only. No IP, no UA stored, no
  geolocation, no fingerprint.

**Data model — `views:<slug>`:**
```ts
interface PageViews {
  slug: string;
  count: number;            // total opens (de-duped per session)
  firstViewedAt: string;    // ISO — first ever open
  lastViewedAt: string;     // ISO — most recent open ("opened 2h ago")
  // Phase 1 keeps a short bounded tail for the timeline + reveal logic:
  recent: Array<{ at: string; sid: string; afterReveal: boolean }>; // cap ~20, FIFO
}
```
`count` + `lastViewedAt` drive the status chip ("Viewed · 2h ago"); `recent[]` drives the
per-invitation timeline and the returned-after-reveal flag (§4). Capping `recent` at ~20
keeps the record tiny and the write O(1).

Read side: the agent's pages route already projects each handout to a `ServerPageSummary`
that **already has a reserved `viewCount?` field**
([pages-library.ts:59](../../src/lib/seller-presentation/pages-library.ts#L59)) wired all
the way through `mergePages` → `PageCard` → `listMetaLine` ("seller · N views"). We
populate it by reading `views:<slug>` alongside the handout in that route. **The agent
read path is ~80% pre-wired.**

---

## 3. Engagement depth for "hot" — cheap vs. overkill

Everything here is **Phase 2** — explicitly deferred so Phase 1 ships fast. Ranked by
cost/value:

| Signal | Cost | Verdict |
|---|---|---|
| **Repeat opens** (multiple sessions) | ~free — already in `count`/`recent` | **Cheap. Best single "hot" input.** |
| **Welcome-video play** | low — one extra beacon on the existing `video.play()` wiring ([motion.ts:203](../../src/tools/seller-presentation/output/motion.ts#L203)) | **Cheap. High intent signal.** Send a `{kind:'video-play'}` beacon. |
| **Dwell time** | low — `visibilitychange`/`pagehide` beacon with elapsed ms | **Cheap-ish.** One more beacon; bucket coarsely (<10s / 10–60s / >60s). |
| **Scroll depth** | medium — needs throttled scroll listener + a final beacon | **Borderline.** Doable but more client code + a second write. Defer to 2b. |
| Per-section view tracking, heatmaps, time-on-section | high | **Overkill for v1/v2.** Skip. |

**"Hot" rollup (quiet threshold):** compute it at *read time* in the agent route from the
stored signals — e.g. `hot = repeatOpens≥2 OR videoPlayed OR dwell>60s OR returnedAfterReveal`.
Keep it a derived predicate (like the existing pure derivations in pages-library.ts), not
a stored flag, so the threshold can be tuned without a migration.

---

## 4. "Returned after reveal" — the strongest signal

This is the highest-value, lowest-cost signal, and it's *almost* free — but it needs one
new primitive.

- **The gap:** reveal today is a re-publish that flips `valuationStatus` to `revealed`
  and bumps `updatedAt`. But `updatedAt` also moves on *any* edit, so it can't be trusted
  as "the moment of reveal." There is no `revealedAt`.
- **The fix (Phase 1):** stamp `revealedAt` (ISO) onto the handout record the first time
  it's published/updated with `valuationStatus === 'revealed'` from a prior State-A
  status. One field in the publish route; no migration needed (absent = pre-feature page,
  treated as "always revealed" exactly like the existing `valuationStatus` default).
- **The detection:** at view time the route knows the slug's current status + `revealedAt`;
  it sets `afterReveal = revealedAt && now > revealedAt` on the appended `recent[]` entry.
  A view stamped `afterReveal: true` is the "returned after the reveal" event the agent
  surface highlights distinctly. Cost: zero extra storage beyond the boolean already in
  the `recent` entry.

---

## 5. Privacy / scope — confirmed clean

- **Agent-only:** the beacon writes to `views:<slug>`; nothing is ever read back onto the
  seller's page. The seller surface stays byte-identical. The read path is the
  auth-gated, owner-scoped pages route — a second account literally cannot address another
  agent's `views:<slug>` because it can't enumerate slugs it doesn't own
  (`listOwnerHandoutRecords` is the only enumeration path and it's owner-indexed).
- **No third-party trackers:** no GA/Segment/PostHog/pixel. One first-party route, one KV
  write. Consistent with the project's margin discipline (KV increments, not an analytics
  pipeline).
- **No personal-data compiling:** we store a count, two timestamps, and a bounded tail of
  `{at, opaque-sid, afterReveal}`. No IP, no UA, no identity, no cross-page profile. This
  is engagement on the agent's *own* page, not surveillance of a person.

---

## 6. Where the agent reads it

All three candidate surfaces already exist; the feature is additive:

- **"Your pages" library** ([PagesLibrary via pages route](../../src/app/api/seller-presentation/pages/route.ts))
  — the natural home. `ServerPageSummary.viewCount` and `listMetaLine`'s "seller · N
  views" are **already coded and waiting for data**. A status chip ("Viewed 2h ago" /
  "Returned after reveal" / "Hot") slots onto each card with no structural change.
- **Per-page detail view** — net-new, but this is where the engagement *timeline* + the
  follow-up card from the design handoff would live.
- **Dashboard** ([DashboardClient / HeroNextAction](../../src/app/dashboard/components/HeroNextAction.tsx))
  — could surface a single "1 page is hot" nudge. Phase 3 territory.

**Net-new vs. exists:** the beacon, the `/api/h/[slug]/view` route, the `views:<slug>`
store, and `revealedAt` are net-new. The agent read path, the owner-scoping, the
`viewCount` plumbing, and the library UI shell already exist.

---

## Cost / margin note

- **Per view:** ~1 KV read + 1 KV write (read-modify-write the small `views:<slug>`).
  On Vercel KV / Upstash that's 2 commands per open. At, say, 30 opens/page over a
  listing's life, that's ~60 commands per page — fractions of a cent. Free tier covers
  early volume comfortably.
- **Per agent read:** the pages route already fetches each handout; adding a parallel
  `views:<slug>` read is +1 command per page in the library list (batchable with
  `Promise.all`, same as `listOwnerHandoutRecords` already does).
- **Storage:** `views:<slug>` is a few hundred bytes capped (bounded `recent[]`).
  Negligible.
- **How it stays ~free:** session de-dupe caps writes, the `recent[]` tail is bounded,
  and there's no per-view third-party billing event. No background jobs, no cron, no
  pipeline.

---

## Open product decisions (for Dallen)

1. **Phase 1 tracking depth:** ship just **opened + returned-after-reveal** (recommended),
   or include basic **repeat-open "hot"** in v1 (it's nearly free since `count` exists)?
2. **Where the agent sees it first:** status chip on the **library cards** only
   (recommended, least new UI), or stand up the **per-page detail/timeline** in Phase 1
   too?
3. **Is the follow-up nudge in v1?** Recommended: **no** — Phase 3. Confirm advisory-only
   (draft message + suggested action), never CRM.
4. **De-dupe window:** per-session (recommended) vs. per-day-per-device vs. raw count.
   Affects what "N views" means to the agent.
5. **Link-unfurl hits:** confirm in testing whether iMessage/WhatsApp/Slack preview
   fetches hit the page (they shouldn't — OG is a separate route — but verify so the very
   first "opened" isn't the unfurl bot).
6. **Recency granularity:** "2h ago" reuses the existing `relativeTimeAgo`
   ([pages-library.ts:501](../../src/lib/seller-presentation/pages-library.ts#L501)) — no
   new code. Confirm that's the desired phrasing.

---

## Out of scope / do-NOT (confirmed)

- ❌ **No CRM** — no pipelines, stages, contact DB, automation, scheduling.
- ❌ **No third-party analytics** — first-party KV only.
- ❌ **Agent-only** — zero seller-facing tracking UI; seller page stays byte-identical.
- ❌ **No personal-data compiling** — count + timestamps + opaque session id only; no IP,
  UA, identity, or cross-page profile.
- ❌ **No build in this pass** — this is scope only.

---

## Proposed phasing

- **Phase 1 — Opened + Returned + the agent view.** Beacon in the existing motion island
  → `/api/h/[slug]/view` → `views:<slug>` (`count`, `firstViewedAt`, `lastViewedAt`,
  bounded `recent[]`). Add `revealedAt` at publish. Read into the already-wired
  `viewCount` + a status chip on library cards. **Ships the core value: "they opened it,
  2h ago" and "they came back after the reveal."**
- **Phase 2 — Hot / engagement depth.** Video-play beacon (one line off existing wiring),
  dwell buckets, then optionally scroll depth. Derived `hot` predicate at read time. Adds
  the quiet "hot" read.
- **Phase 3 — Follow-up nudge.** Advisory suggested next action + editable draft message
  on a per-page detail surface. Strictly advisory; not a CRM.

Each phase is independently shippable and adds nothing to the seller's page.
