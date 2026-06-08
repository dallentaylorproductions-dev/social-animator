import { test, expect } from "@playwright/test";

/**
 * UX-2b — repositionable headshot.
 *
 * Aaron's live test: his headshot was cut off at the top of the circular agent-
 * band frame. The fix lets him set a focal point (+ optional zoom) that travels
 * with the photo and is applied as a pure CSS display transform on every
 * surface (seller page + /why). The image bytes are never re-cropped.
 *
 * Two halves:
 *   1. PURE-NODE round-trip / clamp / byte-identical — proves the focal/scale
 *      persist through the publish projection + read clamp on BOTH payloads,
 *      that out-of-range values are dropped, and that an un-repositioned agent
 *      emits NO focal/scale keys (byte-identical to a pre-UX-2b publish).
 *   2. RENDER — drives the dev preview route and asserts the agent band maps a
 *      set focal point onto `background-position` (and zoom onto `transform`),
 *      while a centered photo renders the byte-identical default markup.
 */

import {
  toPublicPayload,
  clampPublicPayload,
  toPrelistingPayload,
  clampPrelistingPayload,
  type AgentBranding,
} from "../src/tools/seller-presentation/output/public-payload";
import type { SellerPresentationDraft } from "../src/tools/seller-presentation/engine/types";

// Minimal draft — toPublicPayload only needs the listing scalars + the two
// arrays it filters/maps. Everything else is legitimately absent here.
const DRAFT = {
  propertyAddress: "1 Main St",
  recommendedPrice: "$500,000",
  comps: [],
  pitchPoints: [],
} as unknown as SellerPresentationDraft;

const AGENT_BASE: AgentBranding = {
  name: "Aaron Thomas",
  email: "aaron@example.com",
  photoUrl: "https://blob.example.com/agent-headshots/aaron.jpg",
};

test.describe("UX-2b headshot — projection round-trip (pure node)", () => {
  test("focal + scale persist through publish projection and read clamp", () => {
    const agent: AgentBranding = {
      ...AGENT_BASE,
      photoFocalX: 50,
      photoFocalY: 18,
      photoScale: 1.3,
    };
    const payload = toPublicPayload(DRAFT, agent);
    expect(payload.agent.photoFocalX).toBe(50);
    expect(payload.agent.photoFocalY).toBe(18);
    expect(payload.agent.photoScale).toBe(1.3);

    // Survive the KV serialize → read-clamp boundary intact.
    const roundTripped = clampPublicPayload(
      JSON.parse(JSON.stringify(payload)),
    );
    expect(roundTripped.agent.photoFocalX).toBe(50);
    expect(roundTripped.agent.photoFocalY).toBe(18);
    expect(roundTripped.agent.photoScale).toBe(1.3);
  });

  test("no focal set → NO focal/scale keys emitted (byte-identical default)", () => {
    const payload = toPublicPayload(DRAFT, { ...AGENT_BASE });
    const serialized = JSON.stringify(payload.agent);
    expect(serialized).not.toContain("photoFocal");
    expect(serialized).not.toContain("photoScale");
    expect(payload.agent.photoFocalX).toBeUndefined();
    expect(payload.agent.photoFocalY).toBeUndefined();
    expect(payload.agent.photoScale).toBeUndefined();

    // And the serialized agent block is identical to a literal pre-UX-2b agent
    // block (same keys, same order — projectAgent enumerates them).
    const baseline = toPublicPayload(DRAFT, {
      name: AGENT_BASE.name,
      email: AGENT_BASE.email,
      photoUrl: AGENT_BASE.photoUrl,
    });
    expect(JSON.stringify(payload.agent)).toBe(
      JSON.stringify(baseline.agent),
    );
  });

  test("out-of-range focal/scale are clamped away (defense at boundary)", () => {
    const tampered: AgentBranding = {
      ...AGENT_BASE,
      photoFocalX: 150, // > 100
      photoFocalY: -10, // < 0
      photoScale: 5, // > 2
    };
    const payload = toPublicPayload(DRAFT, tampered);
    expect(payload.agent.photoFocalX).toBeUndefined();
    expect(payload.agent.photoFocalY).toBeUndefined();
    expect(payload.agent.photoScale).toBeUndefined();

    // Read boundary independently rejects a hand-edited KV record.
    const clamped = clampPublicPayload({
      agent: {
        name: "X",
        photoUrl: "u",
        photoFocalX: 9999,
        photoScale: 0.2, // < 1 → would expose bare edges; rejected
      },
    });
    expect(clamped.agent.photoFocalX).toBeUndefined();
    expect(clamped.agent.photoScale).toBeUndefined();
  });

  test("boundary values are accepted (0, 100, 1.0, 2.0)", () => {
    const payload = toPublicPayload(DRAFT, {
      ...AGENT_BASE,
      photoFocalX: 0,
      photoFocalY: 100,
      photoScale: 2,
    });
    expect(payload.agent.photoFocalX).toBe(0);
    expect(payload.agent.photoFocalY).toBe(100);
    expect(payload.agent.photoScale).toBe(2);

    const scaleOne = toPublicPayload(DRAFT, { ...AGENT_BASE, photoScale: 1 });
    expect(scaleOne.agent.photoScale).toBe(1);
  });

  test("prelisting (/why) payload carries focal + scale the same way", () => {
    const payload = toPrelistingPayload({
      ...AGENT_BASE,
      photoFocalX: 40,
      photoFocalY: 22,
      photoScale: 1.5,
    });
    expect(payload.agent.photoFocalX).toBe(40);
    expect(payload.agent.photoFocalY).toBe(22);
    expect(payload.agent.photoScale).toBe(1.5);

    const roundTripped = clampPrelistingPayload(
      JSON.parse(JSON.stringify(payload)),
    );
    expect(roundTripped.agent.photoFocalY).toBe(22);
    expect(roundTripped.agent.photoScale).toBe(1.5);
  });
});

test.describe("UX-2b headshot — agent band render", () => {
  test("a set focal point maps onto the avatar's background-position + zoom", async ({
    page,
  }) => {
    await page.goto("/prelisting-preview?fixture=headshot");

    await expect(page.getByTestId("fs-agent")).toBeVisible();
    // The repositioned variant renders.
    await expect(page.locator(".fs-agent__avatar--adj")).toHaveCount(1);

    const img = page.getByTestId("fs-agent-avatar-img");
    await expect(img).toHaveCount(1);

    const pos = await img.evaluate(
      (el) => getComputedStyle(el).backgroundPosition,
    );
    // Focal (50%, 18%) from the fixture → object/background-position.
    expect(pos).toBe("50% 18%");

    const transform = await img.evaluate(
      (el) => getComputedStyle(el).transform,
    );
    // scale(1.3) resolves to a matrix with 1.3 on the diagonal.
    expect(transform).toContain("matrix(1.3");
  });

  test("a centered photo renders the byte-identical default (no --adj layer)", async ({
    page,
  }) => {
    await page.goto("/prelisting-preview?fixture=headshot-centered");

    await expect(page.getByTestId("fs-agent")).toBeVisible();
    // Default path: the plain photo avatar, NO reposition variant, NO inner
    // clip/image layer.
    await expect(page.locator(".fs-agent__avatar--adj")).toHaveCount(0);
    await expect(page.getByTestId("fs-agent-avatar-img")).toHaveCount(0);
    const avatar = page.locator(".fs-agent__avatar--photo");
    await expect(avatar).toHaveCount(1);
    const bg = await avatar.evaluate(
      (el) => getComputedStyle(el).backgroundImage,
    );
    expect(bg).toContain("data:image/png");
  });
});

const STORE = "socanim_brand_settings";
// 1×1 transparent PNG — a stored headshot so the reposition control shows
// without exercising the (separately tested) upload pipeline.
const PHOTO_DATA_URL =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M8AAAMBAQDJ/pLvAAAAAElFTkSuQmCC";

type StoredBrand = {
  agentHeadshotFocalX?: number;
  agentHeadshotFocalY?: number;
  agentHeadshotScale?: number;
};

const readBrand = (page: import("@playwright/test").Page) =>
  page.evaluate((k) => {
    const raw = window.localStorage.getItem(k);
    return raw ? (JSON.parse(raw) as StoredBrand) : null;
  }, STORE);

test.describe("UX-2b headshot — Settings reposition control", () => {
  test.beforeEach(async ({ page }) => {
    // Seed a brand record with a headshot already set, before the app mounts.
    await page.addInitScript(
      ([k, photo]) => {
        window.localStorage.setItem(
          k,
          JSON.stringify({ agentName: "Aaron Thomas", agentPhotoUrl: photo }),
        );
      },
      [STORE, PHOTO_DATA_URL] as const,
    );
  });

  test("drag + zoom persist focal/scale to brand settings; reset clears them", async ({
    page,
  }) => {
    await page.goto("/settings");

    const frame = page.getByTestId("brand-headshot-reposition-frame");
    await expect(frame).toBeVisible({ timeout: 10_000 });
    await frame.scrollIntoViewIfNeeded();

    // Drag the photo right + down → reveals the top-left → focal DECREASES
    // from the centered 50/50.
    const box = await frame.boundingBox();
    if (!box) throw new Error("frame has no box");
    const cx = box.x + box.width / 2;
    const cy = box.y + box.height / 2;
    await page.mouse.move(cx, cy);
    await page.mouse.down();
    await page.mouse.move(cx + 40, cy + 40, { steps: 6 });
    await page.mouse.up();

    await expect
      .poll(async () => (await readBrand(page))?.agentHeadshotFocalX)
      .toBeLessThan(50);
    const afterDrag = await readBrand(page);
    expect(afterDrag?.agentHeadshotFocalX).toBeGreaterThanOrEqual(0);
    expect(afterDrag?.agentHeadshotFocalY).toBeLessThan(50);
    expect(afterDrag?.agentHeadshotFocalY).toBeGreaterThanOrEqual(0);

    // Set the zoom slider to 1.5×.
    await page.getByTestId("brand-headshot-zoom").evaluate((el) => {
      const input = el as HTMLInputElement;
      const setter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        "value",
      )!.set!;
      setter.call(input, "1.5");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await expect
      .poll(async () => (await readBrand(page))?.agentHeadshotScale)
      .toBe(1.5);

    // Reset returns to centered (fields cleared).
    await page.getByTestId("brand-headshot-reposition-reset").click();
    await expect
      .poll(async () => (await readBrand(page))?.agentHeadshotScale)
      .toBeUndefined();
    const afterReset = await readBrand(page);
    expect(afterReset?.agentHeadshotFocalX).toBeUndefined();
    expect(afterReset?.agentHeadshotFocalY).toBeUndefined();
  });
});
