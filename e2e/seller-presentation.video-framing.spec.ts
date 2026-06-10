import { test, expect } from "@playwright/test";
import { toPublicPayload } from "../src/tools/seller-presentation/output/public-payload";
import {
  clampVideoFraming,
  effectiveFraming,
  DEFAULT_VIDEO_FRAMING,
  type SellerPresentationDraft,
  type PresentationVideo,
} from "../src/tools/seller-presentation/engine/types";

/**
 * P2-VIDEO-2 — inlay framing model: defaults, boundary clamping, and the
 * draft→public projection. Pure (node-context) — no browser, no Vitest.
 */

const draftWith = (video: PresentationVideo): SellerPresentationDraft =>
  ({
    propertyAddress: "1 Test St",
    recommendedPrice: "$675,000",
    comps: [],
    pitchPoints: [],
    video,
  }) as unknown as SellerPresentationDraft;

const framingOf = (video: PresentationVideo) =>
  toPublicPayload(draftWith(video), {}).video?.framing;

test.describe("P2-VIDEO-2 — effectiveFraming defaults", () => {
  test("undefined video → the unframed default (50 / 30 / 1)", () => {
    expect(effectiveFraming(undefined)).toEqual(DEFAULT_VIDEO_FRAMING);
    expect(DEFAULT_VIDEO_FRAMING).toEqual({ focalX: 50, focalY: 30, zoom: 1 });
  });

  test("video with no framing → the unframed default", () => {
    expect(effectiveFraming({ videoUrl: "https://x/v.mp4" })).toEqual(
      DEFAULT_VIDEO_FRAMING,
    );
  });

  test("partial framing fills the missing siblings from the default", () => {
    expect(
      effectiveFraming({
        videoUrl: "https://x/v.mp4",
        framing: { focalX: 20 } as PresentationVideo["framing"],
      }),
    ).toEqual({ focalX: 20, focalY: 30, zoom: 1 });
  });
});

test.describe("P2-VIDEO-2 — clampVideoFraming (boundary clamp)", () => {
  test("in-range values pass through untouched", () => {
    expect(clampVideoFraming({ focalX: 25, focalY: 70, zoom: 1.8 })).toEqual({
      focalX: 25,
      focalY: 70,
      zoom: 1.8,
    });
  });

  test("out-of-range focal/zoom clamp to the boundary", () => {
    expect(clampVideoFraming({ focalX: -40, focalY: 250, zoom: 9 })).toEqual({
      focalX: 0,
      focalY: 100,
      zoom: 3,
    });
    // zoom floor is 1 — can't zoom out past fill.
    expect(clampVideoFraming({ zoom: 0.2 })?.zoom).toBe(1);
  });

  test("non-finite / non-number sub-fields fall back to the default", () => {
    expect(
      clampVideoFraming({ focalX: NaN, focalY: "70", zoom: Infinity }),
    ).toBeUndefined();
    // one good field is enough to keep the record (siblings defaulted).
    expect(clampVideoFraming({ focalX: 10, focalY: "x", zoom: null })).toEqual({
      focalX: 10,
      focalY: 30,
      zoom: 1,
    });
  });

  test("no framing fields present → undefined (stays tidy)", () => {
    expect(clampVideoFraming({})).toBeUndefined();
    expect(clampVideoFraming(undefined)).toBeUndefined();
    expect(clampVideoFraming("nope")).toBeUndefined();
  });
});

test.describe("P2-VIDEO-2 — projection through toPublicPayload", () => {
  test("framing projects field-by-field onto the public payload", () => {
    expect(
      framingOf({
        videoUrl: "https://x/v.mp4",
        framing: { focalX: 35, focalY: 60, zoom: 1.5 },
      }),
    ).toEqual({ focalX: 35, focalY: 60, zoom: 1.5 });
  });

  test("a tampered out-of-range framing is re-clamped at the write boundary", () => {
    expect(
      framingOf({
        videoUrl: "https://x/v.mp4",
        framing: {
          focalX: 999,
          focalY: -10,
          zoom: 50,
        } as PresentationVideo["framing"],
      }),
    ).toEqual({ focalX: 100, focalY: 0, zoom: 3 });
  });

  test("a video with no framing projects no framing (renderer defaults it)", () => {
    expect(framingOf({ videoUrl: "https://x/v.mp4" })).toBeUndefined();
  });
});
