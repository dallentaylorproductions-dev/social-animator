import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { withFirstFrameHint } from "../src/tools/seller-presentation/engine/types";

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
