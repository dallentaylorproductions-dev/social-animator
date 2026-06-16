# Viewed Signal — Phase 1 Session Handoff

> **Status: BUILT, flag-gated dark, NOT merged.** Branch off `main`. The flag
> `VIEWED_SIGNAL_ENABLED` stays OFF until Cowork verifies on a preview. Built to
> `docs/viewed-signal/tracking-scoping.md`; decisions locked in the build packet.

## What shipped
The agent-only engagement layer for sent seller pages: **opened**, **returned
after the reveal**, and a **repeat-open count**, captured by a cheap per-session
beacon and surfaced on the existing pages-library chip / meta line. Nothing is
seller-facing. Phase 2 (video/scroll/dwell "hot") and Phase 3 (advisory
follow-up) are out of scope and untouched.

## The flag
`VIEWED_SIGNAL_ENABLED` (env, read lazily) in
[src/lib/seller-presentation/viewed-signal.ts](../../src/lib/seller-presentation/viewed-signal.ts).
OFF by default. Flag-off is byte-identical: no beacon fires (the island gets
`undefined`), the view route no-ops, the publish route stamps no `revealedAt`,
and the pages route reads no views (so the chip / meta line is unchanged).

## Capture path
- **Beacon** — [motion.ts](../../src/tools/seller-presentation/output/motion.ts)
  `PresentationPageMotion` gained an optional `viewSignalSlug` prop. When set, it
  fires ONE `navigator.sendBeacon` (keepalive-fetch fallback) per session on
  mount to `POST /api/h/<slug>/view`. The three seller render arms (v1
  [presentation-page.tsx](../../src/tools/seller-presentation/output/presentation-page.tsx),
  [FlagshipPage.tsx](../../src/tools/seller-presentation/output/flagship/FlagshipPage.tsx),
  [StateAPage.tsx](../../src/tools/seller-presentation/output/flagship/StateAPage.tsx))
  pass `viewSignalSlugFor(handout)` — slug when the flag is on, else `undefined`.
- **Session token** — an opaque `sessionStorage` token (`sa-view-sid`), minted
  once per session, so in-session refreshes de-dupe but a new tab (genuine
  return) counts.
- **Route** — [src/app/api/h/[slug]/view/route.ts](../../src/app/api/h/%5Bslug%5D/view/route.ts).
  Flag-gated, bot-UA-guarded, reads the page via `fetchHandout` for its
  `revealedAt`, then `recordView`. Always returns 204 with no body. No auth, no
  PII.
- **Store** — [src/lib/seller-presentation/views-store.ts](../../src/lib/seller-presentation/views-store.ts).
  `views:<slug>` is its OWN KV key (never the handout record, so a hot view write
  never races a publish/edit). Pure `applyView` owns session de-dupe + the recent
  cap (`VIEWS_RECENT_CAP = 20`) + the before/after-reveal classification;
  `recordView`/`getViews` are the only KV surface.

## revealedAt (the one real gap, now closed)
- New optional `revealedAt` on `HandoutRecord`
  ([share-urls.ts](../../src/lib/share-urls.ts)); `updateHandout` accepts it and a
  new raw `getHandoutRecord` getter reads prior state.
- The **publish route**
  ([publish/route.ts](../../src/app/api/seller-presentation/publish/route.ts))
  stamps `revealedAt = now` exactly once, on the **invitation → revealed**
  transition (prior status is a State A invitation, new status is not), and only
  under the flag. A normal born-revealed page and a plain edit stamp nothing.
- No migration: absent `revealedAt` = no reveal moment, so "returned after
  reveal" never fires spuriously.

## Read / surface path (owner-scoped)
- **pages route**
  ([pages/route.ts](../../src/app/api/seller-presentation/pages/route.ts)) — under
  the flag, enriches each owner-scoped summary with its `views:<slug>` via
  `deriveViewSignal` (batched). Owner-scoping rides entirely on the existing
  `listOwnerHandoutRecords` spine: views are read only for slugs already in THIS
  agent's owner index, so agent A can never read agent B's views.
- **Model** — [pages-library.ts](../../src/lib/seller-presentation/pages-library.ts):
  `ServerPageSummary` + `PageCard` gained `lastViewedAt` + `returnedAfterReveal`
  (the reserved `viewCount` now gets populated); `mergePages` flows them onto the
  card; new pure `viewSignalLabel` + extended `listMetaLine`.
- **Chip / meta** —
  [PagesLibrary.tsx](../../src/app/seller-presentation/PagesLibrary.tsx): the
  card-view views line and the List meta line both read `viewSignalLabel` for the
  calm voice: `Returned`, `Opened · 2h ago`, then `N views`.

## Tests (green)
- [e2e/viewed-signal.views-store.spec.ts](../../e2e/viewed-signal.views-store.spec.ts)
  — applyView (first open, per-session de-dupe, new-session counts, recent cap,
  blank-sid drop), afterReveal classification incl. absent-revealedAt, deriveViewSignal, isBotUserAgent (real browsers vs unfurl bots vs absent UA).
- [e2e/viewed-signal.library-chip.spec.ts](../../e2e/viewed-signal.library-chip.spec.ts)
  — viewSignalLabel states, listMetaLine additive + **flag-off byte-identical**,
  mergePages passthrough.
- Regression green: `seller-presentation.pages-library` (61), `publish-allowlist`,
  all `state-a*` specs (148 in that batch). `tsc --noEmit` clean for every
  viewed-signal file (pre-existing errors in unrelated specs only). ESLint clean
  on new files (2 pre-existing `set-state-in-effect` errors in untouched
  PagesLibrary effects).

## Owner-scoping / privacy (the hard gate) — confirmed
Agent-only by construction: views are read only through the auth-gated,
owner-indexed pages route; nothing is read back onto the seller page; the store
holds a count + two timestamps + a bounded tail of `{at, opaque-sid,
afterReveal}` — no IP, UA, or identity.

## Verify on preview (set VIEWED_SIGNAL_ENABLED=true)
1. Open a published `/h/<slug>` → the library card/row shows `Opened · just now`;
   refresh in-session → count does NOT climb; open in a new tab → count climbs.
2. Reveal a State A page (Update live → revealed), then re-open → row shows
   `Returned`.
3. Second account cannot see the first's views (owner-scoped).
4. Seller page shows nothing new; link-unfurl preview does not trip "opened".
5. Flip the flag OFF → chip/meta and seller page byte-identical; no beacon fires.

## Out of scope / do-NOT (held)
No CRM, no third-party analytics, no follow-up nudge (Phase 3), no
video/scroll/dwell "hot" (Phase 2), no per-page timeline. The handout record is
never raced (separate `views:<slug>`); publish payload shape is unchanged beyond
the top-level `revealedAt`.

## Next packets
- **Phase 2** — hot/engagement depth (welcome-video play beacon, dwell buckets,
  then scroll), derived `hot` predicate at read time.
- **Phase 3** — advisory follow-up nudge on a per-page detail surface.
