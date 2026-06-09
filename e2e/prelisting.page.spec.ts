import { test, expect, type Page } from "@playwright/test";

/**
 * B0c — standalone pre-listing page render (flagship language, agent-constant).
 *
 * Driven via the dev preview route (compiled-in fixtures, no auth/KV). Asserts:
 *   - FULL: identity + why-us (with comparison bars) + reviews all render;
 *     legibility (reading text stays ink, not the accent); tagline + reviews
 *     headline surface; exactly ONE CTA (the intentional close) and NONE of the
 *     seller page's dual agent-band CTAs;
 *   - MINIMAL (identity only): every optional block flexes out, page still
 *     reads complete (agent + CTA + footer), no orphan headers;
 *   - PARTIAL: why-us present, reviews absent — mixed flex is clean;
 *   - NO listing surfaces (price / hero / comps) ever render on this page.
 */

const INK = "rgb(27, 42, 46)"; // --ink #1B2A2E (D1 locked neutral), layout-locked across every signature

const FULL = "/prelisting-preview?fixture=full";
const MINIMAL = "/prelisting-preview?fixture=minimal";
const PARTIAL = "/prelisting-preview?fixture=partial";

const read = (loc: ReturnType<Page["locator"]>, prop: string) =>
  loc.evaluate((el, p) => getComputedStyle(el).getPropertyValue(p), prop);

test.describe("Pre-listing page — full fixture", () => {
  test("identity + why-us + reviews all render", async ({ page }) => {
    await page.goto(FULL);

    await expect(page.getByTestId("prelisting-flagship")).toBeVisible();
    await expect(page.getByTestId("fs-agent")).toBeVisible();
    await expect(page.getByTestId("fs-agent-tagline")).toContainText(
      "Eight families a year",
    );

    await expect(page.getByTestId("fs-whyus")).toBeVisible();
    await expect(page.getByTestId("fs-whyus-diff-0")).toBeVisible();
    await expect(page.getByTestId("fs-whyus-bar-0")).toBeVisible();

    await expect(page.getByTestId("fs-reviews")).toBeVisible();
    await expect(
      page.getByTestId("fs-reviews").locator(".fs-headline"),
    ).toContainText("What sellers say");
  });

  test("exactly ONE CTA — the intentional close; no seller-page dual CTAs", async ({
    page,
  }) => {
    await page.goto(FULL);

    const cta = page.getByTestId("pl-cta-primary");
    await expect(cta).toBeVisible();
    await expect(cta).toContainText("Schedule a listing consultation");
    await expect(cta).toHaveAttribute("href", /^mailto:/);

    // The AgentBand's own dual CTAs (primary + ghost) are suppressed here, so
    // the page presents one decided next step, never a menu.
    await expect(page.getByTestId("fs-cta-primary")).toHaveCount(0);
    await expect(page.getByTestId("fs-cta-ghost")).toHaveCount(0);
    await expect(page.getByTestId("pl-cta-primary")).toHaveCount(1);
  });

  test("legibility — a differentiator stays ink, not the accent", async ({
    page,
  }) => {
    await page.goto(FULL);
    const diffText = page
      .getByTestId("fs-whyus-diff-0")
      .locator(".fs-whyus__card-text");
    expect(await read(diffText, "color")).toBe(INK);
  });

  test("no listing surfaces render on the standalone page", async ({ page }) => {
    await page.goto(FULL);
    // The seller-page-only sections are never composed here.
    await expect(page.locator(".fs-hero")).toHaveCount(0);
    await expect(page.locator(".fs-price")).toHaveCount(0);
    await expect(page.getByTestId("fs-whyprice")).toHaveCount(0);
    await expect(page.getByTestId("fs-area")).toHaveCount(0);
  });
});

test.describe("Pre-listing page — flex (minimal fixture)", () => {
  test("identity only: optional blocks flex out, page still complete", async ({
    page,
  }) => {
    await page.goto(MINIMAL);

    await expect(page.getByTestId("prelisting-flagship")).toBeVisible();
    // No why-us, no reviews, no orphan sub-headers / tagline.
    await expect(page.getByTestId("fs-whyus")).toHaveCount(0);
    await expect(page.getByTestId("fs-whyus-stats")).toHaveCount(0);
    await expect(page.getByTestId("fs-reviews")).toHaveCount(0);
    await expect(page.getByTestId("fs-agent-tagline")).toHaveCount(0);

    // The page still reads complete: identity, the single CTA, the footer.
    // This is the realistic published floor — agent name + a contact email and
    // NOTHING else (no reassurance line). The CTA close (the page's whole
    // purpose) MUST still render against this minimal data; the bug that
    // shipped was the live page going reviews → footer with no close, because
    // earlier coverage only ever asserted the CTA against a fully-populated
    // fixture. The reassurance line is the ONLY optional piece — it absents.
    await expect(page.getByTestId("fs-agent")).toBeVisible();
    const cta = page.getByTestId("pl-cta-primary");
    await expect(cta).toBeVisible();
    await expect(cta).toContainText("Schedule a listing consultation");
    await expect(cta).toHaveAttribute("href", /^mailto:/);
    await expect(
      page.getByTestId("pl-cta").locator(".fs-btn-reassure"),
    ).toHaveCount(0);
    await expect(page.getByTestId("fs-foot")).toBeVisible();
  });
});

test.describe("Pre-listing page — mixed flex (partial fixture)", () => {
  test("why-us present, reviews absent — both states clean", async ({
    page,
  }) => {
    await page.goto(PARTIAL);

    await expect(page.getByTestId("fs-whyus")).toBeVisible();
    await expect(page.getByTestId("fs-whyus-diff-0")).toBeVisible();
    // No reviews configured → the reviews block is absent (no empty header).
    await expect(page.getByTestId("fs-reviews")).toHaveCount(0);
    // The single CTA still closes the page.
    await expect(page.getByTestId("pl-cta-primary")).toBeVisible();
  });
});
