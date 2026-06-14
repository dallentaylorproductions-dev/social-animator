import { test, expect, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Seller State A — holistic video treatment + hero top inset (Dallen real smoke).
 *
 * Three pre-existing State A polish issues, fixed as ONE system:
 *
 *   1. INLINE VIDEO FULL-FRAME — the hero "Watch a 15-second hello" player used
 *      `object-fit: cover` + the agent's focal/zoom framing, which cropped a
 *      portrait talking-head mid-face. It now shows the WHOLE frame via
 *      `object-fit: contain` on a portrait-friendly (4/5) box, letterboxed onto
 *      the dossier ink mat. The campaign "Video tour" poster (a background-image,
 *      not a <video>) biases its cover-crop upward (.sa-frame__photo--face) so a
 *      talking-head poster is never cut mid-face.
 *
 *   2. FULLSCREEN LETTERBOX — taking the hero <video> to native fullscreen had no
 *      contain override, so a portrait clip blew out / cropped. Mirrors the
 *      revealed-page A7d.12 fix: a `:fullscreen` AND a SEPARATE
 *      `:-webkit-full-screen` rule (a comma-list with an unknown pseudo gets the
 *      whole rule discarded), each `object-fit: contain` on a black mat.
 *
 *   3. HERO TOP INSET — the "PREPARED PRIVATELY · FOR [family]" line sat flush
 *      against the frame's top edge (base inset too small) and, on an installed
 *      PWA, under the iOS notch (State A never got the standalone safe-area rule
 *      the flagship hero has). The base inset is now comfortable (22px) and a
 *      `@media (display-mode: standalone)` block floors the offset at the base
 *      with max(env(safe-area-inset-top)), re-anchors the scrim, and scopes the
 *      embedded previews (.fs-static / .sep-embed) back to the base.
 *
 * Scoping: all changes target State-A-only selectors (.sa-hero__video-player /
 * .sa-hero__pers / .sa-frame__photo--face). The revealed-page player is a
 * DIFFERENT element/class (.video__player in flagship.css), so this leaves the
 * full presentation byte-identical — asserted below as a guard.
 *
 * Driven via the stateless preview route's State A fixture (the same CSS the /h/
 * route serves). Native fullscreen + the real notch inset need a device, so CI
 * proves the rules parsed (CSSOM) and the shape is locked (source-grep); Dallen's
 * desktop + real-iPhone smoke is the decisive end-to-end check.
 */

const STATE_A = "/seller-presentation-preview?fixture=state-a";
const MOBILE = { width: 390, height: 800 };

const STATE_A_CSS = resolve(
  process.cwd(),
  "src/tools/seller-presentation/output/flagship/state-a.css",
);
const FLAGSHIP_CSS = resolve(
  process.cwd(),
  "src/tools/seller-presentation/output/flagship/flagship.css",
);
const AGENT_NOTE = resolve(
  process.cwd(),
  "src/tools/seller-presentation/output/flagship/AgentNote.tsx",
);

// Locate the standalone hero-line rule and report what it touches.
async function standalonePersRule(page: Page): Promise<{
  found: boolean;
  text: string;
  touchesPhoto: boolean;
}> {
  return page.evaluate(() => {
    for (const sheet of Array.from(document.styleSheets)) {
      let rules: CSSRuleList;
      try {
        rules = sheet.cssRules;
      } catch {
        continue; // cross-origin
      }
      for (const rule of Array.from(rules)) {
        const cond = (rule as CSSMediaRule).conditionText ?? "";
        if (!/display-mode\s*:\s*standalone/.test(cond)) continue;
        const text = rule.cssText;
        if (!text.includes("sa-hero__pers")) continue;
        return {
          found: true,
          text,
          touchesPhoto:
            text.includes("sa-hero__photo") || text.includes("sa-hero__cover"),
        };
      }
    }
    return { found: false, text: "", touchesPhoto: false };
  });
}

test.describe("State A — inline video shows the full frame (no mid-face crop)", () => {
  test("the hero <video> is object-fit: contain (not cover), centered", async ({
    page,
  }) => {
    await page.goto(STATE_A);
    await expect(page.getByTestId("fs-sa-hero-video")).toBeVisible();

    const player = page.locator(".fs-page.state-a .sa-hero__video-player");
    await expect(player).toHaveCount(1);

    const fit = await player.evaluate(
      (el) => getComputedStyle(el).objectFit,
    );
    expect(fit, "the hero hello must show the full frame, never cover-crop").toBe(
      "contain",
    );
  });

  test("source: the hero video is not object-fit: cover and carries no focal/zoom crop", () => {
    const src = readFileSync(
      resolve(
        process.cwd(),
        "src/tools/seller-presentation/output/flagship/StateAHero.tsx",
      ),
      "utf8",
    );
    // The inline style block on the hero <video> must be contain/center and must
    // NOT reintroduce a cover-crop or the focal/zoom transform.
    expect(src).toMatch(/objectFit:\s*"contain"/);
    expect(src).not.toMatch(/objectFit:\s*"cover"/);
    expect(src, "the cover-crop focal framing must not drive the hero").not.toMatch(
      /transform:\s*`scale\(/,
    );
  });

  test("the campaign 'Video tour' poster biases its crop upward (face-safe)", async ({
    page,
  }) => {
    await page.goto(STATE_A);
    const frame = page.getByTestId("fs-sa-spread-video");
    await expect(frame).toBeVisible();

    const photo = frame.locator(".sa-frame__photo--face");
    await expect(
      photo,
      "the video-tour poster must carry the face-safe modifier",
    ).toHaveCount(1);

    const pos = await photo.evaluate(
      (el) => getComputedStyle(el).backgroundPosition,
    );
    // center 30% → "50% 30%". The vertical bias must be above center so a
    // talking-head poster is never cut mid-face.
    expect(pos).toBe("50% 30%");
  });
});

test.describe("State A — hero video fullscreen letterbox (A7d.12 shape)", () => {
  test("CSS adds a :fullscreen contain override scoped to .sa-hero__video-player", () => {
    const css = readFileSync(STATE_A_CSS, "utf8");
    const rule = css.match(
      /\.sa-hero__video-player:fullscreen\s*\{[\s\S]*?\}/,
    );
    expect(rule, ":fullscreen rule for .sa-hero__video-player not found").toBeTruthy();
    expect(rule![0]).toMatch(/object-fit:\s*contain/);
    expect(rule![0]).toMatch(/width:\s*100%/);
    expect(rule![0]).toMatch(/height:\s*100%/);
  });

  test("CSS adds a :-webkit-full-screen override in a SEPARATE rule (selector-list-discard safety)", () => {
    const css = readFileSync(STATE_A_CSS, "utf8");
    const webkit = css.match(
      /\.sa-hero__video-player:-webkit-full-screen\s*\{[\s\S]*?\}/,
    );
    expect(
      webkit,
      ":-webkit-full-screen rule for .sa-hero__video-player not found",
    ).toBeTruthy();
    expect(webkit![0]).toMatch(/object-fit:\s*contain/);

    // The two pseudos must never share a comma-list — that's the exact pattern
    // this guards against (one unknown pseudo discards the whole rule).
    expect(css).not.toMatch(
      /sa-hero__video-player:fullscreen\s*,\s*[^{]*:-webkit-full-screen/,
    );
    expect(css).not.toMatch(
      /sa-hero__video-player:-webkit-full-screen\s*,\s*[^{]*:fullscreen/,
    );
  });

  test("the browser parsed the :fullscreen rule (CSSOM, not discarded)", async ({
    page,
  }) => {
    await page.goto(STATE_A);
    await expect(page.getByTestId("fs-sa-hero-video")).toBeVisible();

    const snapshot = await page.evaluate(() => {
      const matches: Array<{ selector: string; objectFit: string }> = [];
      for (const sheet of Array.from(document.styleSheets)) {
        let rules: CSSRuleList | null = null;
        try {
          rules = sheet.cssRules;
        } catch {
          continue;
        }
        if (!rules) continue;
        for (const rule of Array.from(rules)) {
          if (!(rule instanceof CSSStyleRule)) continue;
          if (!rule.selectorText.includes("sa-hero__video-player")) continue;
          if (
            !/:fullscreen\b/.test(rule.selectorText) &&
            !/:-webkit-full-screen\b/.test(rule.selectorText)
          ) {
            continue;
          }
          matches.push({
            selector: rule.selectorText,
            objectFit: rule.style.getPropertyValue("object-fit").trim(),
          });
        }
      }
      return matches;
    });

    expect(
      snapshot.length,
      "no :fullscreen / :-webkit-full-screen rule for .sa-hero__video-player survived parsing",
    ).toBeGreaterThanOrEqual(1);
    for (const m of snapshot) {
      expect(m.objectFit, `rule "${m.selector}" must declare contain`).toBe(
        "contain",
      );
    }
  });
});

test.describe("State A — hero top inset (comfortable base + standalone safe-area)", () => {
  test.use({ viewport: MOBILE });

  test("normal tab: the eyebrow has a comfortable base top inset (not flush)", async ({
    page,
  }) => {
    await page.goto(STATE_A);
    const pers = page.getByTestId("fs-sa-hero-pers");
    await expect(pers).toBeVisible();

    // CI is a normal tab (not standalone) → the standalone override is inert, so
    // the base inset applies. 22px gives the line room off the top edge.
    expect(await pers.evaluate((el) => getComputedStyle(el).top)).toBe("22px");
  });

  test("the served CSS floors the inset with max(env()), re-anchors the scrim, scopes embeds, never the photo", async ({
    page,
  }) => {
    await page.goto(STATE_A);
    await expect(page.getByTestId("fs-sa-hero-pers")).toBeVisible();

    const rule = await standalonePersRule(page);
    expect(rule.found, "a display-mode: standalone rule for .sa-hero__pers").toBe(
      true,
    );
    expect(rule.text).toContain("env(safe-area-inset-top");
    expect(rule.text).toContain("max(");
    expect(
      rule.text,
      "the offset must not re-add the base on top of the inset",
    ).not.toContain("22px + env");
    expect(rule.text).toContain("::before");
    expect(
      rule.text,
      "the in-wizard live preview (.fs-static) must be scoped out",
    ).toContain("fs-static");
    expect(
      rule.text,
      "the settings embed (.sep-embed) must be scoped out",
    ).toContain("sep-embed");
    expect(
      rule.touchesPhoto,
      "the standalone rule must not inset the hero photo",
    ).toBe(false);
  });
});

test.describe("State A video changes leave the full presentation byte-identical", () => {
  test("the revealed-page .video__player fullscreen rules are untouched", () => {
    const css = readFileSync(FLAGSHIP_CSS, "utf8");
    expect(css).toMatch(
      /\.fs-page\s+\.video__player:fullscreen\s*\{[^}]*object-fit:\s*contain[^}]*\}/,
    );
    expect(css).toMatch(
      /\.fs-page\s+\.video__player:-webkit-full-screen\s*\{[^}]*object-fit:\s*contain[^}]*\}/,
    );
  });

  test("the revealed-page AgentNote inlay still cover-crops with the agent's framing", () => {
    const src = readFileSync(AGENT_NOTE, "utf8");
    // The revealed page keeps its deliberate cover + focal framing — only State A
    // diverges to contain. A regression here would mean the contain change leaked
    // into the shared revealed-page render.
    expect(src).toMatch(/objectFit:\s*"cover"/);
  });

  test("State A CSS does not restyle the revealed-page .video__player", () => {
    const css = readFileSync(STATE_A_CSS, "utf8");
    expect(
      css.includes(".video__player"),
      "state-a.css must not reach into the revealed-page video element",
    ).toBe(false);
  });
});
