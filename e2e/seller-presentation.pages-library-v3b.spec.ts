import { test, expect } from "@playwright/test";
import { readFileSync } from "fs";
import path from "path";

/**
 * Pages Library v3 — Pass 3b: accent system + cockpit polish (PAGES_LIBRARY_V3).
 *
 * Pass 3b makes the cockpit feel like one calm, intentional system. The
 * organizing rule is strict: TEAL marks a NEXT ACTION / active work state only —
 * the "Worth a follow-up" marker and the primary/accent actions — never evidence
 * (Opened / Returned / Watched) and never metadata (views, plan limit, chips).
 *
 * 3b is presentation-only: no new pure model (so no pure spec beyond Pass 3a's),
 * just a flag-gated placeholder swap, a root accent hook, and CSS. Consistent
 * with how Passes 1/2/3a were pinned (the e2e harness renders the WIZARD on the
 * bare route, library flag off), this runs as a node-context SOURCE-CONTRACT
 * spec: the accent lands only on next-action elements, the follow-up marker is a
 * small pill + rail (not a tinted card), the cap pill is never error-styled, the
 * placeholder reads valid, and every page-level rule is gated so flag-off stays
 * byte-identical.
 *
 * The in-browser look (the pill, the rail, the tray dot, the prepared
 * placeholder, the calm caught-up panel) is the preview check the packet assigns
 * to Cowork, at mobile width with PAGES_LIBRARY_V3=true.
 */

const tsx = readFileSync(
  path.resolve(__dirname, "../src/app/seller-presentation/PagesLibrary.tsx"),
  "utf8",
);
const css = readFileSync(
  path.resolve(__dirname, "../src/app/seller-presentation/pages-library.css"),
  "utf8",
);

// ── root gate + placeholder are flag-gated (flag-off byte-identical) ──

test.describe("Pass 3b is flag-gated (flag-off byte-identical)", () => {
  test("the root carries data-library-v3 only under the flag", () => {
    expect(tsx).toContain(
      'data-library-v3={libraryV3Enabled ? "true" : undefined}',
    );
  });

  test("the prepared-page placeholder renders only under libraryV3", () => {
    // The ◇ markup is preserved on the flag-off branch; the prepared placeholder
    // (a home glyph) is a separate branch behind `libraryV3`.
    // The prepared placeholder uses the House glyph from lucide-react. Assert
    // the icon is imported without pinning the exact set (icons get added /
    // reordered over time; an exact-substring match re-breaks on every change).
    expect(tsx).toMatch(/import \{[^}]*\bHouse\b[^}]*\} from "lucide-react"/);
    expect(tsx).toContain(") : libraryV3 ? (");
    expect(tsx).toContain(
      'className="lib-poster-empty lib-poster-prepared"',
    );
    expect(tsx).toContain('<House className="lib-poster-icon"');
    // the flag-off diamond is untouched
    expect(tsx).toContain("<span>◇</span>");
  });

  test("every page-level 3b rule sits under the root gate", () => {
    // Header pills, the follow-up tray dot, and the caught-up panel are all
    // scoped under [data-library-v3="true"] — none leak to a flag-off library.
    expect(css).toContain(
      '.sep-library[data-library-v3="true"] .lib-followup-count',
    );
    expect(css).toContain(
      '.sep-library[data-library-v3="true"] [data-testid="lib-followup-group"] .lib-section-title::before',
    );
    expect(css).toContain(
      '.sep-library[data-library-v3="true"] .lib-caughtup',
    );
  });
});

// ── accent system: teal = next action / the work, only ──

test.describe("accent system — teal marks a next action / the work only", () => {
  test("the follow-up marker is a small teal PILL with a leading dot", () => {
    // a pill that shrinks to content (align-self) + a dot, NOT a full teal block
    const rule =
      css.split('.sep-library .lib-card[data-mode="follow-up"] .lib-lead {')[1];
    expect(rule).toBeTruthy();
    const block = rule.split("}")[0];
    expect(block).toContain("align-self: flex-start");
    expect(block).toContain("border-radius: 999px");
    expect(block).toContain("color: var(--accent)");
    expect(css).toContain(
      '.sep-library .lib-card[data-mode="follow-up"] .lib-lead::before',
    );
  });

  test("follow-up cards carry a subtle teal left rail (no full tint)", () => {
    const rule = css.split('.sep-library .lib-card[data-mode="follow-up"] {')[1];
    expect(rule).toBeTruthy();
    const block = rule.split("}")[0];
    // an inset rail, not a flooded background-color tint of the whole card
    expect(block).toContain("inset 3px 0 0");
    expect(block).toContain("var(--accent)");
    expect(block).not.toContain("background:");
  });

  test("evidence stays neutral/muted — the live lead + reason + context are NOT teal", () => {
    const liveLead = css
      .split('.sep-library .lib-card[data-mode="live"] .lib-lead {')[1]
      .split("}")[0];
    expect(liveLead).not.toContain("var(--accent)");
    expect(liveLead).toContain("var(--fg-dim)");

    const reason = css.split(".sep-library .lib-reason {")[1].split("}")[0];
    expect(reason).not.toContain("var(--accent)");
    expect(reason).toContain("var(--fg-mute)");

    const context = css.split(".sep-library .lib-context {")[1].split("}")[0];
    expect(context).not.toContain("var(--accent)");
    expect(context).toContain("var(--fg-dim)");
  });

  test("the prepared-page placeholder is neutral (no accent — not an action)", () => {
    const rule = css.split(".sep-library .lib-poster-prepared {")[1];
    expect(rule).toBeTruthy();
    const block = rule.split("}")[0];
    expect(block).not.toContain("var(--accent)");
  });
});

// ── header pills: soft-accent follow-up, neutral cap ──

test.describe("header pills — follow-up soft-accent, cap neutral", () => {
  test("the follow-up count earns a soft teal accent", () => {
    const rule = css
      .split('.sep-library[data-library-v3="true"] .lib-followup-count {')[1]
      .split("}")[0];
    expect(rule).toContain("var(--accent)");
  });

  test("the usage / plan-limit pill is pinned neutral, never error-styled", () => {
    // Both the base meter and the at-limit hook are forced to muted/neutral
    // under the cockpit — the agent is not blocked, so no warning color.
    expect(css).toContain(
      '.sep-library[data-library-v3="true"] .lib-meter[data-at-limit="true"]',
    );
    const block = css
      .split('.sep-library[data-library-v3="true"] .lib-meter,')[1]
      .split("}")[0];
    expect(block).toContain("var(--fg-mute)");
    expect(block).not.toContain("st-pending");

    // And the V2 usage branch itself never sets the at-limit hook (the label is
    // "N live pages · plan limit M", not an alarming "68 of 25").
    const v2Branch = tsx.split("libraryV2Enabled ? (")[1].split(") : (")[0];
    expect(v2Branch).toContain("usageMeterLabel(liveCount, cap)");
    expect(v2Branch).not.toContain("data-at-limit");
  });
});

// ── action-row weight + chevron semantics (carried, verified) ──

test.describe("cockpit grammar — action weight + chevron", () => {
  test("secondary (quiet) card actions shed their border so the primary leads", () => {
    expect(css).toContain(
      ".sep-library .lib-card[data-mode] .lib-actions .lib-btn-quiet",
    );
    const block = css
      .split(
        ".sep-library .lib-card[data-mode] .lib-actions .lib-btn-quiet {",
      )[1]
      .split("}")[0];
    expect(block).toContain("border-color: transparent");
  });

  test("the chevron rotates when open and never the action buttons toggle expand", () => {
    // disclosure rotation (Pass 2, still the contract under V3)
    expect(css).toContain(
      '.sep-library .lib-card[data-expanded="true"] .lib-chevron-icon',
    );
    expect(css).toContain("transform: rotate(180deg)");
    // a tap that bubbled from any button/link/control never toggles the body
    expect(tsx).toContain(
      'if ((e.target as HTMLElement).closest("button, a, label, input")) return;',
    );
  });
});
