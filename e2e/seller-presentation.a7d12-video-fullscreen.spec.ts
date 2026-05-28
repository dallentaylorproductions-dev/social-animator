import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Seller Presentation — A7d.12 walk-through video fullscreen fit
 * (Dallen 2026-05-25 real-deploy smoke).
 *
 * Reported symptom: on the published consumer page (/h/[slug],
 * section "01 — A SHORT NOTE"), the walkthrough video plays inline
 * with the correct fit (portrait phone clip filling the editorial
 * 4/5 frame). Pressing the NATIVE fullscreen control "blows the
 * video out of the frame" — the portrait source gets scaled to
 * cover a landscape display, cropping the top and bottom so only a
 * zoomed center strip shows. Exiting fullscreen restores the
 * correct inline view.
 *
 * Root cause: the <video> carries `object-fit: cover` (deliberate
 * for the inline 4/5 box). The browser's native fullscreen control
 * takes the <video> ELEMENT itself fullscreen, and `object-fit:
 * cover` persists in the fullscreen-rendered state — covering a
 * wide viewport with a portrait video forces the large top/bottom
 * crop. Purely a CSS issue; upload, blob, payload, and inline
 * rendering are all correct.
 *
 * A7d.12 fix shape: add a `:fullscreen` / `:-webkit-full-screen`
 * scoped override on `.video-player` that swaps to `object-fit:
 * contain` ONLY when the element is in native fullscreen. The
 * inline frame is untouched (it still uses `cover`).
 *
 * Why two SEPARATE rules and not a comma-list: per CSS selector
 * parsing, if any item in a comma-separated selector list is
 * unknown to the UA, the entire rule is discarded. Splitting
 * `:fullscreen` and `:-webkit-full-screen` into separate blocks
 * guarantees each survives parsing on the engine that knows it.
 *
 * Why source-grep + CSSOM and not a full
 * page.evaluate(requestFullscreen) drive: native fullscreen
 * requires a user gesture and is not reliably available in
 * headless Chromium. The CSSOM check proves the browser actually
 * parsed and accepted the rule (i.e., the `:fullscreen` selector
 * didn't fail parsing and discard the block); the source-grep
 * locks the shape so a future edit can't silently regress the rule
 * structure. The end-to-end behaviour is verified by Dallen's
 * real-deploy desktop + phone smoke, called out explicitly in the
 * handoff.
 *
 * Out of scope: the wizard preview (`VideoUploadField.tsx`) does
 * not use `object-fit: cover` — its <video> is styled with
 * Tailwind's `aspect-video w-full` only, so the same fullscreen
 * blowout can't reproduce there. No change needed there for
 * A7d.12.
 */

const CSS_PATH = resolve(
  process.cwd(),
  'src/tools/seller-presentation/output/presentation-page.css',
);
const PAGE_PATH = resolve(
  process.cwd(),
  'src/tools/seller-presentation/output/presentation-page.tsx',
);

test.describe('A7d.12 — walk-through video fullscreen fit', () => {
  test('inline .video-player rule is unchanged: still object-fit: cover (no regression of the editorial 4/5 fit)', () => {
    const css = readFileSync(CSS_PATH, 'utf8');
    // The plain (non-fullscreen) rule is the one that determines
    // the inline appearance. It must still resolve to
    // `object-fit: cover` — Dallen has signed off on the inline
    // look as correct, and A7d.12 must not move it.
    expect(css).toMatch(
      /\.sep-presentation\s+\.video-poster\s+\.video-player\s*\{[^}]*object-fit:\s*cover[^}]*\}/,
    );
  });

  test('CSS adds a :fullscreen override scoped to .video-player with object-fit: contain', () => {
    const css = readFileSync(CSS_PATH, 'utf8');
    // The :fullscreen rule must:
    //   - target .video-player (not a wrapper),
    //   - declare object-fit: contain (the actual fix),
    //   - size to 100% × 100% so the fullscreen viewport drives
    //     the box, not any inherited aspect-ratio from the inline
    //     wrapper.
    const fsRule = css.match(
      /\.sep-presentation\s+\.video-poster\s+\.video-player:fullscreen\s*\{[\s\S]*?\}/,
    );
    expect(fsRule, ':fullscreen rule for .video-player not found').toBeTruthy();
    expect(fsRule![0]).toMatch(/object-fit:\s*contain/);
    expect(fsRule![0]).toMatch(/width:\s*100%/);
    expect(fsRule![0]).toMatch(/height:\s*100%/);
  });

  test('CSS adds a :-webkit-full-screen override in a SEPARATE rule (selector-list-discard safety)', () => {
    const css = readFileSync(CSS_PATH, 'utf8');
    // Per CSS selector parsing, if any item in a comma-separated
    // selector list is unknown to the UA, the entire rule is
    // discarded. The WebKit alias MUST live in its own rule so it
    // can't take the standard :fullscreen rule down with it on a
    // browser that doesn't recognize one or the other.
    const webkitRule = css.match(
      /\.sep-presentation\s+\.video-poster\s+\.video-player:-webkit-full-screen\s*\{[\s\S]*?\}/,
    );
    expect(
      webkitRule,
      ':-webkit-full-screen rule for .video-player not found',
    ).toBeTruthy();
    expect(webkitRule![0]).toMatch(/object-fit:\s*contain/);

    // Belt-and-braces: make sure the WebKit selector is NOT in a
    // comma-list with :fullscreen — that's the exact pattern this
    // test exists to prevent.
    expect(css).not.toMatch(
      /:fullscreen\s*,\s*[^{]*:-webkit-full-screen/,
    );
    expect(css).not.toMatch(
      /:-webkit-full-screen\s*,\s*[^{]*:fullscreen/,
    );
  });

  test('<video> element carries the .video-player class so the fullscreen rule actually applies', () => {
    const pageSrc = readFileSync(PAGE_PATH, 'utf8');
    // The fullscreen override is scoped to `.video-player`. The
    // <video> element must keep that class — if it ever gets
    // renamed without updating the CSS selector, the override is
    // dead silently. Pin the className on the actual <video>
    // element (not the wrapper).
    const videoBlock = pageSrc.match(/<video\b[\s\S]*?\/>/);
    expect(videoBlock, '<video> element not found in presentation-page.tsx').toBeTruthy();
    expect(videoBlock![0]).toMatch(/className="video-player"/);
  });

  test('rendered consumer page exposes the :fullscreen rule via CSSOM (browser parsed it, did not discard)', async ({
    page,
  }) => {
    // Driving native fullscreen in headless Chromium is unreliable
    // (requires a user gesture and the headless permission story
    // varies by version). Instead, prove the rule survived parsing
    // by walking the loaded document's styleSheets and finding a
    // CSSStyleRule whose selectorText targets `.video-player`
    // under the fullscreen pseudo-class with `object-fit: contain`.
    // If the browser had rejected the rule at parse time (e.g.
    // because the pseudo-class was unknown and the selector was in
    // a comma-list with another unknown item), it would not appear
    // in document.styleSheets. That's the regression this asserts
    // against.
    await page.goto('/seller-presentation-preview?fixture=full');
    await expect(page.getByTestId('sep-video-el')).toBeVisible();

    const ruleSnapshot = await page.evaluate(() => {
      const matches: Array<{ selector: string; objectFit: string }> = [];
      for (const sheet of Array.from(document.styleSheets)) {
        let rules: CSSRuleList | null = null;
        try {
          rules = sheet.cssRules;
        } catch {
          // cross-origin sheets throw on cssRules access — skip
          continue;
        }
        if (!rules) continue;
        for (const rule of Array.from(rules)) {
          if (!(rule instanceof CSSStyleRule)) continue;
          if (!rule.selectorText.includes('.video-player')) continue;
          // Match :fullscreen OR :-webkit-full-screen — the
          // browser may only retain one of the two (whichever it
          // recognizes), and either alone is sufficient to keep
          // the buyer's fullscreen view letterboxed.
          if (
            !/:fullscreen\b/.test(rule.selectorText) &&
            !/:-webkit-full-screen\b/.test(rule.selectorText)
          ) {
            continue;
          }
          matches.push({
            selector: rule.selectorText,
            objectFit: rule.style.getPropertyValue('object-fit').trim(),
          });
        }
      }
      return matches;
    });

    expect(
      ruleSnapshot.length,
      'no :fullscreen / :-webkit-full-screen rule for .video-player found in document.styleSheets — the rule was either not shipped or got discarded at parse time',
    ).toBeGreaterThanOrEqual(1);
    for (const m of ruleSnapshot) {
      expect(
        m.objectFit,
        `rule "${m.selector}" did not declare object-fit: contain`,
      ).toBe('contain');
    }
  });
});
