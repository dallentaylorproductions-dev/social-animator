import { test, expect } from "@playwright/test";
import { readFileSync } from "fs";
import path from "path";
import {
  cardLead,
  cardMode,
  resolveViewMode,
  LIBRARY_MOBILE_MAX_WIDTH,
  type PageCard,
} from "../src/lib/seller-presentation/pages-library";

/**
 * Pages Library v3 — Pass 3a (card hierarchy) + Pass 3c (Cards is the only view)
 * (PAGES_LIBRARY_V3).
 *
 * Pass 3a does the structural-visual half of the cockpit polish: every card
 * leads with ONE clear state by mode (follow-up / live / draft) via the
 * action-first hierarchy (address anchor → lead → reason once → muted context).
 * Pass 3c finishes the cockpit by hiding the Cards/List toggle entirely — Cards
 * is the single, intentional operating view under V3 (a real dense-management
 * List returns later as its own dedicated effort). Both are pure derivation /
 * flag gating, so — consistent with how Pass 1/2 were pinned (the e2e harness
 * renders the WIZARD on the bare route, library flag off) — this runs as a
 * node-context spec:
 *
 *   1. PURE: the view resolution (still resolved + preserved for the future
 *      List effort), the per-status card MODE, and the three-tier lead
 *      projection (no fact shown twice), pinned across every state.
 *   2. SOURCE-CONTRACT: the flag is read + threaded, the V3 render is forced to
 *      Cards + the List toggle is hidden (`showViewToggle = !libraryV3Enabled`,
 *      Pass 3c), and the `data-mode` weight class + three-tier DOM render only
 *      under the flag — so flag-off is byte-identical.
 *
 * The in-browser verification (Cards only, no List toggle, no dead UI, flag-off
 * identical) is the preview check the packet assigns to Cowork, with
 * PAGES_LIBRARY_V3=true.
 */

const NOW = Date.parse("2026-06-16T12:00:00.000Z");
const HOUR = 60 * 60 * 1000;
const isoBefore = (ms: number) => new Date(NOW - ms).toISOString();

function card(over: Partial<PageCard> = {}): PageCard {
  return {
    key: "k",
    status: "live",
    propertyLine: "123 Main St",
    updatedAt: isoBefore(3 * HOUR),
    ...over,
  };
}

// ── view mode: Cards is the mobile default; List is desktop-only ──

test.describe("resolveViewMode — V3 makes Cards the mobile default", () => {
  test("mobile with no stored pref opens in Cards (was List pre-V3)", () => {
    expect(resolveViewMode(null, LIBRARY_MOBILE_MAX_WIDTH, true)).toBe("cards");
    expect(resolveViewMode(null, LIBRARY_MOBILE_MAX_WIDTH - 1, true)).toBe("cards");
    expect(resolveViewMode(null, 360, true)).toBe("cards");
  });

  test("List is desktop-only: a saved List pref is ignored on mobile", () => {
    // The preference is preserved in storage (governs desktop) but mobile is
    // always Cards — List is hidden there.
    expect(resolveViewMode("list", LIBRARY_MOBILE_MAX_WIDTH, true)).toBe("cards");
    expect(resolveViewMode("list", 360, true)).toBe("cards");
  });

  test("desktop is unchanged: saved pref wins, default stays Cards", () => {
    expect(resolveViewMode("list", LIBRARY_MOBILE_MAX_WIDTH + 1, true)).toBe("list");
    expect(resolveViewMode("list", 1440, true)).toBe("list");
    expect(resolveViewMode(null, 1440, true)).toBe("cards");
  });

  test("flag-off is byte-identical: mobile default stays List", () => {
    // Both the explicit `false` and the omitted-arg form keep today's behavior.
    expect(resolveViewMode(null, LIBRARY_MOBILE_MAX_WIDTH, false)).toBe("list");
    expect(resolveViewMode(null, LIBRARY_MOBILE_MAX_WIDTH)).toBe("list");
    expect(resolveViewMode("list", 360, false)).toBe("list");
    expect(resolveViewMode(null, 1440, false)).toBe("cards");
  });
});

// ── card mode: one clear lead, by status ──

test.describe("cardMode — the one idea each card leads with", () => {
  test("archived / draft lead with their own state", () => {
    expect(cardMode(card({ status: "archived" }))).toBe("archived");
    expect(cardMode(card({ status: "draft" }))).toBe("draft");
  });

  test("a published page leads with the WORK (follow-up) over plain activity", () => {
    expect(cardMode(card({ status: "live", worthFollowUp: true }))).toBe("follow-up");
    expect(cardMode(card({ status: "live" }))).toBe("live");
  });

  test("edits-pending follows the same work-vs-activity split", () => {
    expect(
      cardMode(card({ status: "live-edits-pending", worthFollowUp: true })),
    ).toBe("follow-up");
    expect(cardMode(card({ status: "live-edits-pending" }))).toBe("live");
  });

  test("worthFollowUp is only ever set under the nudge flag ⇒ flag-off = live", () => {
    // No `worthFollowUp` field (the flag-off shape) ⇒ a published page is "live".
    expect(cardMode(card({ status: "live" }))).toBe("live");
  });
});

// ── card lead: lead → reason once → muted context, never a fact twice ──

test.describe("cardLead — one lead, reason once, muted context", () => {
  test("follow-up: lead + reasons + recency/count, no fact repeated", () => {
    const h = cardLead(
      card({
        status: "live",
        worthFollowUp: true,
        followUpReasons: ["Watched your video", "Read to the end"],
        viewCount: 3,
        lastViewedAt: isoBefore(2 * HOUR),
        watchedVideo: true,
        readToEnd: true,
      }),
      NOW,
    );
    expect(h.lead).toBe("Worth a follow-up");
    expect(h.reason).toBe("Watched your video · Read to the end");
    expect(h.context).toBe("Opened · 2 hours ago · 3 views");
    // The reason owns the engagement facts; the context never repeats them.
    expect(h.context).not.toContain("Watched your video");
    expect(h.context).not.toContain("Read to the end");
  });

  test("live (opened): status lead + one fact + count, calm and de-duplicated", () => {
    const h = cardLead(
      card({
        status: "live",
        viewCount: 4,
        lastViewedAt: isoBefore(3 * HOUR),
        watchedVideo: true,
        readToEnd: true, // two facts available; the card shows only the strongest
      }),
      NOW,
    );
    expect(h.lead).toBe("Opened · 3 hours ago");
    expect(h.reason).toBe("Watched your video");
    expect(h.context).toBe("4 views");
  });

  test("live (returned): lead is 'Returned', not repeated in context", () => {
    const h = cardLead(
      card({
        status: "live",
        returnedAfterReveal: true,
        viewCount: 2,
        lastViewedAt: isoBefore(1 * HOUR),
      }),
      NOW,
    );
    expect(h.lead).toBe("Returned");
    expect(h.context).toBe("2 views");
    expect(h.context).not.toContain("Returned");
  });

  test("draft / archived / never-opened / flag-off: no signal lines", () => {
    expect(cardLead(card({ status: "draft" }), NOW)).toEqual({});
    expect(cardLead(card({ status: "archived" }), NOW)).toEqual({});
    expect(cardLead(card({ status: "live", viewCount: 0 }), NOW)).toEqual({});
    expect(cardLead(card({ status: "live" }), NOW)).toEqual({}); // no viewCount = flag-off shape
  });
});

// ── flag-off / desktop byte-identical: source-contract guards ──

test.describe("PAGES_LIBRARY_V3 is gated (flag-off + desktop byte-identical)", () => {
  const tsx = readFileSync(
    path.resolve(__dirname, "../src/app/seller-presentation/PagesLibrary.tsx"),
    "utf8",
  );
  const page = readFileSync(
    path.resolve(__dirname, "../src/app/seller-presentation/page.tsx"),
    "utf8",
  );
  const css = readFileSync(
    path.resolve(__dirname, "../src/app/seller-presentation/pages-library.css"),
    "utf8",
  );

  test("the page reads the PAGES_LIBRARY_V3 env flag and threads it down", () => {
    expect(page).toContain('process.env.PAGES_LIBRARY_V3 === "true"');
    expect(page).toContain("libraryV3Enabled={libraryV3Enabled}");
  });

  test("the saved view pref still resolves (preserved for a future List effort)", () => {
    // resolveViewMode still runs + threads the flag, so `viewMode` is preserved
    // in storage even though Pass 3c forces the V3 render to Cards. A future
    // dedicated management-List effort can revive the saved preference.
    expect(tsx).toContain(
      "resolveViewMode(saved, window.innerWidth, libraryV3Enabled)",
    );
  });

  test("under V3 the render is forced to Cards and the toggle hides entirely (Pass 3c)", () => {
    // Cards is the single operating view under V3 — on every viewport, not just
    // mobile. Flag-off ⇒ effectiveViewMode === viewMode, so it is byte-identical.
    expect(tsx).toContain(
      'const effectiveViewMode: ViewMode = libraryV3Enabled ? "cards" : viewMode;',
    );
    expect(tsx).toContain("const showViewToggle = !libraryV3Enabled;");
    expect(tsx).toContain("{showViewToggle && (");
    // The V3 mobile-only viewport listener is gone — the toggle no longer keys
    // off a breakpoint; it is purely flag-gated.
    expect(tsx).not.toContain(
      "window.matchMedia(`(max-width: ${LIBRARY_MOBILE_MAX_WIDTH}px)`)",
    );
  });

  test("the card hierarchy DOM is emitted only inside the libraryV3 branch", () => {
    // data-mode (the weight class) and the three-tier lead are behind the flag,
    // so a flag-off card carries no data-mode and renders the V2 signal lines.
    expect(tsx).toContain("data-mode={libraryV3 ? cardMode(card) : undefined}");
    expect(tsx).toContain("{libraryV3 ? (");
    expect(tsx).toContain('data-testid="lib-card-lead"');
    expect(tsx).toContain('data-testid="lib-card-reason"');
  });

  test("the hierarchy is weight/spacing/tone only — no accent (3b owns accent)", () => {
    // The V3 lead/reason/context + per-mode rules carry no accent color; the
    // distinction is weight, size, spacing, and neutral/muted tone.
    expect(css).toContain(".sep-library .lib-card[data-mode]");
    expect(css).toContain(".sep-library .lib-lead {");
    expect(css).toContain(".sep-library .lib-reason {");
    expect(css).toContain(".sep-library .lib-context {");
    expect(css).toContain('.sep-library .lib-card[data-mode="follow-up"] .lib-lead');
    expect(css).toContain('.sep-library .lib-card[data-mode="live"] .lib-lead');
    // The collapsed mobile card stays ruthless: context folds away until expand.
    expect(css).toContain(
      '.sep-library .lib-card[data-expandable="true"]:not([data-expanded="true"]) .lib-context',
    );
  });
});
