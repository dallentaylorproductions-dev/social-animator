# Viewed Signal — Phase 3 Session Handoff

> **Status: BUILT, flag-gated dark, NOT merged.** Branch off `main`. The flag
> `VIEWED_SIGNAL_NUDGE_ENABLED` stays OFF until Cowork verifies on a preview
> (flag ON in Preview only). Built on Phase 2 (PR #92) and Phase 1 (PR #89);
> decisions locked in the build packet (Dallen, 2026-06-16).

## What shipped
A **calm, advisory, owner-only follow-up nudge**: the library quietly points the
agent at the pages worth a follow-up and why ("Returned after the reveal ·
Watched your video"), with a single **"Mark as followed up"** dismiss. It reads
the engagement Phase 2 already captured — **no new capture, no new beacon, no
third-party, no cost beyond the existing read** — plus ONE bounded owner-scoped
write (`followedUpAt`). It NEVER sends anything (no email/SMS, no CRM, no
automation): the nudge suggests, the agent acts.

## The flag
`VIEWED_SIGNAL_NUDGE_ENABLED` (env, read lazily) in
[src/lib/seller-presentation/viewed-signal.ts](../../src/lib/seller-presentation/viewed-signal.ts).
OFF by default, INDEPENDENT of Phase 1/2 so Cowork can verify on preview. Rides
Phase 1: the derivation reads the same `views:<slug>` aggregate the Phase 1 read
path already loads, so the route only computes the nudge when
`VIEWED_SIGNAL_ENABLED` is also on. **Flag-off is byte-identical**: the route
computes no `worthFollowUp` (no marker, no reasons), the header shows no count,
the "Mark as followed up" control never renders, and its route 503s — so NOTHING
is ever stored.

## The qualifying rule (locked Decision 1)
A page is **worth a follow-up** iff a RETAINED open is **meaningful + recent +
not-yet-cleared**:
- **meaningful** — that session watched the welcome video OR read to the end OR
  returned after the reveal. A plain "opened once" is too thin and never
  qualifies.
- **recent** — its open timestamp is within **~14 days** (`FOLLOW_UP_WINDOW_MS`)
  of now. Older engagement ages out and stops nudging.
- **not-yet-cleared** — its open timestamp is strictly after `followedUpAt`. A
  marked page drops out; a LATER seller return re-qualifies (the dismiss is
  "clear up to here", never permanent suppression).

Derived from the bounded `recent` tail's per-session flags + timestamps (so
recency + meaningfulness are tied to a real moment), NOT the timestamp-less
aggregate rollups (which only drive the always-on Phase 2 chip facts).

## Read side (pure, owner-scoped)
- **Derivation** — `deriveFollowUpNudge(views, { nowMs, followedUpAt, windowMs? })`
  in [views-store.ts](../../src/lib/seller-presentation/views-store.ts). PURE,
  returns `{ worthFollowUp, reasons }`; reasons prioritized
  (returned-after-reveal → watched-video → read-to-end). No new capture.
- **Route** — [pages/route.ts](../../src/app/api/seller-presentation/pages/route.ts)
  computes `worthFollowUp` + `followUpReasons` per page under the flag, from
  `getViews(slug)` + the owner record's `followedUpAt` (mapped from
  `listOwnerHandoutRecords` — the owner-scoped spine, so agent A can never see
  agent B's nudges).
- **Projection** — [pages-library.ts](../../src/lib/seller-presentation/pages-library.ts):
  `followUpMarkerLabel` (marker + capped reasons), `countWorthFollowUp` (header
  count), the `mark-followed-up` `RowAction`, and the quiet "Worth a follow-up"
  token in `listMetaLine`. All pure; both layouts read them so the voice never
  drifts.

## Surface (calm, Decision 2)
- **Card marker** — a quiet accent line "Worth a follow-up · <reasons>" under the
  Phase 2 facts (`lib-card-followup`). No badge, no urgency, no red.
- **Header count** — "N worth a follow-up" pill next to the usage meter
  (`lib-followup-count`), only when N > 0.
- **List** — the dense meta line appends "Worth a follow-up"; the row "⋯" menu
  leads with "Mark as followed up".

## Dismiss — the one bounded write (Decision 3)
- **Helper** — `setHandoutFollowedUp(slug, ownerEmail, followedUpAt | null)` in
  [share-urls.ts](../../src/lib/share-urls.ts). Owner-checked (same guard as
  `setHandoutArchived`); deliberately does NOT bump `updatedAt` (quiet metadata,
  never re-sorts the library). `followedUpAt` is a new optional `HandoutRecord`
  field (absent on every pre-feature page; no migration).
- **Route** — [follow-up/route.ts](../../src/app/api/seller-presentation/follow-up/route.ts).
  Double-gated (library flag + nudge flag → 503), owner-scoped, advisory only —
  records intent, sends nothing. Body `{ slug, action?: 'mark' | 'clear' }`.

## Tests
- [e2e/viewed-signal.follow-up-nudge.spec.ts](../../e2e/viewed-signal.follow-up-nudge.spec.ts):
  the qualifying rule (meaningful vs thin), the recency window ageing-out, the
  dismiss + re-qualify behavior, the marker/count/meta projection, and the
  flag-off byte-identical guard.
- Owner-scoping + cross-agent isolation ride the existing
  `listOwnerHandoutRecords` spine (unchanged) — verified on preview.

## Checks
build ✅ · lint ✅ (no new errors; repo baseline `set-state-in-effect` unchanged)
· truthful-copy ✅ · em-dash ✅ · Playwright ✅ (126 viewed-signal/library + 5
truthful-copy).

## Do NOT merge — verify on preview first (flag ON in Preview only)
1. A page that watched the video / read to the end / returned after the reveal
   within ~14 days shows the calm "Worth a follow-up" marker + the concrete
   reason; a thin "opened once" page does NOT.
2. Header count is correct and owner-scoped (agent A can't see agent B's).
3. Engagement older than ~14 days no longer nudges.
4. "Mark as followed up" removes the page from the nudge set; a later seller
   return re-qualifies it.
5. The `/h/` seller page shows nothing new.
6. Flag-off byte-identical (no marker, no count, no dismiss, nothing stored).

Then merge first and flip the prod flag.
