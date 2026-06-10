import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  withFirstFrameHint,
  effectivePosterUrl,
} from "../src/tools/seller-presentation/engine/types";

/**
 * P2-VIDEO-3 — iOS first-frame paint (Dallen real-iPhone bug, 2026-06-10).
 *
 * After uploading a walk-through video, iPhone Safari showed BLACK in the
 * preview box and GRAY in the inlay-framing box until the agent manually
 * dragged the thumbnail slider — desktop auto-painted frame 1 everywhere.
 * Root cause: iOS Safari paints a posterless <video> black until it is
 * played or seeked, and the desktop "auto first frame" leaned on a canvas
 * capture that hangs on iOS.
 *
 * The fix needs no canvas: append the media fragment `#t=0.1` to the
 * HOSTED <video> srcs (the flagship §01 inlay player + the wizard inlay
 * framing control) so iOS seeks to ~0.1s and paints that frame; for the
 * wizard preview box (whose src can be a blob: objectURL that doesn't
 * honor fragments on iOS) seek programmatically on loadedmetadata.
 *
 * iOS frame-paint itself can't be asserted in CI; this suite locks in the
 * pieces that CAN be: the helper's behavior, the rendered flagship src,
 * the wizard wiring, and the v1 byte-identical guarantee (v1 video src is
 * untouched — no fragment).
 */

test.describe("P2-VIDEO-3 — withFirstFrameHint helper", () => {
  test("appends #t=0.1 to a bare hosted URL", () => {
    expect(withFirstFrameHint("https://blob.example.com/a/v.mp4")).toBe(
      "https://blob.example.com/a/v.mp4#t=0.1",
    );
  });

  test("is idempotent — never stacks a second fragment", () => {
    // A URL that already carries any fragment is returned unchanged.
    expect(withFirstFrameHint("https://x/v.mp4#t=0.1")).toBe(
      "https://x/v.mp4#t=0.1",
    );
    expect(withFirstFrameHint("https://x/v.mp4#t=5")).toBe(
      "https://x/v.mp4#t=5",
    );
  });

  test("passes blank/undefined through so callers can spread conditionally", () => {
    expect(withFirstFrameHint(undefined)).toBeUndefined();
    expect(withFirstFrameHint("")).toBe("");
  });
});

test.describe("P2-VIDEO-3 — flagship (v2) §01 inlay player", () => {
  test("the rendered inlay <video> src carries the #t=0.1 first-frame hint", async ({
    page,
  }) => {
    await page.goto("/seller-presentation-preview?fixture=full&template=flagship");
    const player = page.locator('[data-testid="fs-note-video"] .video__player');
    await expect(player).toBeVisible();
    const src = await player.getAttribute("src");
    expect(src).toBeTruthy();
    // The hosted fixture URL + the iOS first-frame fragment, no data: URL.
    expect(src!.endsWith("#t=0.1")).toBe(true);
    expect(src!.startsWith("data:")).toBe(false);
  });
});

test.describe("P2-VIDEO-3 — wizard wiring", () => {
  const FRAMING = resolve(process.cwd(), "src/components/VideoFramingField.tsx");
  const FIELD = resolve(process.cwd(), "src/components/VideoUploadField.tsx");

  test("inlay framing control feeds its <video> src through withFirstFrameHint", () => {
    const src = readFileSync(FRAMING, "utf8");
    expect(src).toMatch(/src=\{withFirstFrameHint\(videoUrl\)\}/);
    expect(src).toMatch(
      /from\s+["']@\/tools\/seller-presentation\/engine\/types["']/,
    );
  });

  test("wizard preview box seeks to the first frame on loadedmetadata (iOS black-paint fix)", () => {
    const src = readFileSync(FIELD, "utf8");
    // The blob:-safe path: a programmatic seek on the preview element,
    // NOT a canvas capture (capture hangs on iOS).
    expect(src).toMatch(/currentTime\s*=\s*0\.1/);
    // Guarded to the start so it never yanks an already-scrubbed video.
    expect(src).toMatch(/currentTime\s*<\s*0\.05/);
  });
});

/**
 * P2-VIDEO-3 follow-up (PR #57 review, Dallen 2026-06-10).
 *
 * Fix 1: "Use this frame" didn't reach the preview. The chosen poster DID
 * land in state + payload (effectivePosterUrl precedence is correct), but
 * the #57 `#t=0.1` fragment on the flagship player's src made the browser
 * seek to 0.1s and PAINT that first frame OVER the poster — so the live
 * preview / mobile Preview / published page showed the first frame instead
 * of the agent's pick. Fix: posterless-ONLY fragment (raw url when a poster
 * is set), so the chosen poster image shows everywhere.
 */
test.describe("P2-VIDEO-3 (fix) — manual pick beats the first-frame paint", () => {
  test("effectivePosterUrl precedence: override > scrub > auto > none", () => {
    const base = { videoUrl: "https://x/v.mp4" };
    expect(effectivePosterUrl({ ...base, autoPosterUrl: "a" })).toBe("a");
    // A scrub pick beats the auto first-frame default.
    expect(
      effectivePosterUrl({ ...base, autoPosterUrl: "a", scrubPosterUrl: "s" }),
    ).toBe("s");
    // A manual override beats both.
    expect(
      effectivePosterUrl({
        ...base,
        autoPosterUrl: "a",
        scrubPosterUrl: "s",
        posterUrl: "o",
      }),
    ).toBe("o");
    expect(effectivePosterUrl(base)).toBeUndefined();
  });

  test("flagship player shows the SCRUB-picked poster — raw src, NO #t=0.1 overpaint", async ({
    page,
  }) => {
    await page.goto(
      "/seller-presentation-preview?fixture=poster-scrub-over-auto&template=flagship",
    );
    const player = page.locator('[data-testid="fs-note-video"] .video__player');
    await expect(player).toBeVisible();
    const src = await player.getAttribute("src");
    const poster = await player.getAttribute("poster");
    // The chosen frame is the poster…
    expect(poster).toBe("https://blob.example.com/scrub-picked-frame.jpg");
    // …and the src is the RAW video URL — no fragment, so the 0.1s frame
    // can't paint over and discard the pick.
    expect(src).toBe("https://example.com/walkthrough.mp4");
    expect(src!.includes("#t=")).toBe(false);
  });

  test("flagship player keeps the #t=0.1 hint ONLY when there's no poster", async ({
    page,
  }) => {
    await page.goto(
      "/seller-presentation-preview?fixture=poster-none&template=flagship",
    );
    const player = page.locator('[data-testid="fs-note-video"] .video__player');
    await expect(player).toBeVisible();
    const src = await player.getAttribute("src");
    const poster = await player.getAttribute("poster");
    expect(poster).toBeNull();
    expect(src).toBe("https://example.com/walkthrough.mp4#t=0.1");
  });

  test("flagship player shows the manual-override poster (raw src)", async ({
    page,
  }) => {
    await page.goto(
      "/seller-presentation-preview?fixture=poster-override-wins&template=flagship",
    );
    const player = page.locator('[data-testid="fs-note-video"] .video__player');
    await expect(player).toBeVisible();
    expect(await player.getAttribute("poster")).toBe(
      "https://blob.example.com/manual-override-thumbnail.jpg",
    );
    expect(await player.getAttribute("src")).toBe(
      "https://example.com/walkthrough.mp4",
    );
  });

  test("AgentNote source gates the fragment on the absence of a poster", () => {
    const src = readFileSync(
      resolve(
        process.cwd(),
        "src/tools/seller-presentation/output/flagship/AgentNote.tsx",
      ),
      "utf8",
    );
    // posterless-only: raw url when poster is set, hinted url otherwise.
    expect(src).toMatch(
      /src=\{poster\s*\?\s*v!\.videoUrl\s*:\s*withFirstFrameHint\(v!\.videoUrl\)\}/,
    );
  });
});

/**
 * Fix 2: iOS Safari's central "start playback" button covered the agent's
 * face in the authoring preview while they scrubbed "Pick a thumbnail".
 */
test.describe("P2-VIDEO-3 (fix) — play button doesn't cover the face while scrubbing", () => {
  test("the authoring preview hides the iOS central play overlay (controls bar stays)", () => {
    const field = readFileSync(
      resolve(process.cwd(), "src/components/VideoUploadField.tsx"),
      "utf8",
    );
    const css = readFileSync(
      resolve(process.cwd(), "src/app/seller-presentation/sep-wizard.css"),
      "utf8",
    );
    // The preview <video> carries the authoring-only hook class…
    expect(field).toMatch(/sep-video-authoring-preview/);
    // …and the CSS hides ONLY the central start-playback overlay button
    // (the native controls bar — and its own play button — is untouched).
    expect(css).toMatch(
      /\.sep-video-authoring-preview::-webkit-media-controls-start-playback-button\s*\{[\s\S]*?display:\s*none/,
    );
  });
});

test.describe("P2-VIDEO-3 — v1 page stays byte-identical (no fragment)", () => {
  test("the v1 VideoBlock <video> src is the raw videoUrl — no #t= hint added", () => {
    const pageSrc = readFileSync(
      resolve(
        process.cwd(),
        "src/tools/seller-presentation/output/presentation-page.tsx",
      ),
      "utf8",
    );
    // The v1 arm must render exactly as before — the first-frame hint is a
    // v2/wizard-only change. v1's branded no-poster panel covers iOS there.
    const v1VideoBlock = pageSrc.match(
      /<video[\s\S]*?data-testid="sep-video-el"[\s\S]*?\/>/,
    );
    expect(v1VideoBlock).toBeTruthy();
    expect(v1VideoBlock![0]).toMatch(/src=\{v\.videoUrl\}/);
    expect(v1VideoBlock![0]).not.toMatch(/withFirstFrameHint/);
    expect(v1VideoBlock![0]).not.toMatch(/#t=/);
  });
});
