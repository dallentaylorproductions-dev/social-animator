import { test, expect, type Page } from "@playwright/test";

/**
 * Flagship (v2) consumer page — render + role + reachability gate. Driven via
 * the stateless preview route with `?template=flagship` (the same read-time
 * override the /h/ route exposes). Deterministic DOM + computed-style
 * assertions (font-drift-immune).
 */

const INK = "rgb(26, 22, 18)"; // --ink #1a1612 (layout-locked, every signature)

const FLAGSHIP = "/seller-presentation-preview?fixture=full&template=flagship";

const read = (loc: ReturnType<Page["locator"]>, prop: string) =>
  loc.evaluate((el, p) => getComputedStyle(el).getPropertyValue(p), prop);

// WCAG relative luminance — classifies on-signature dark (ink) vs cream.
function luminance(rgb: string): number {
  const [r, g, b] = (rgb.match(/\d+/g) ?? ["0", "0", "0"]).map((n) => {
    const v = Number(n) / 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

test.describe("Flagship — reachability override (v1 byte-identity preserved)", () => {
  test("?template=flagship renders v2; its absence renders v1", async ({
    page,
  }) => {
    await page.goto(FLAGSHIP);
    await expect(page.getByTestId("seller-presentation-flagship")).toBeVisible();
    // The v1 root must NOT be present under the override.
    await expect(page.getByTestId("seller-presentation-public")).toHaveCount(0);

    await page.goto("/seller-presentation-preview?fixture=full");
    // No override → the stored (v1) template renders, flagship root absent.
    await expect(page.getByTestId("seller-presentation-public")).toBeVisible();
    await expect(page.getByTestId("seller-presentation-flagship")).toHaveCount(0);
  });

  test("a v2-stamped payload renders flagship with NO override (F3 publish stamp routes on its own)", async ({
    page,
  }) => {
    await page.goto("/seller-presentation-preview?fixture=full-v2");
    await expect(page.getByTestId("seller-presentation-flagship")).toBeVisible();
    await expect(page.getByTestId("seller-presentation-public")).toHaveCount(0);
  });

  test("?template=v1 forces the v1 renderer for a v2 payload (F3 inverse override)", async ({
    page,
  }) => {
    await page.goto("/seller-presentation-preview?fixture=full-v2&template=v1");
    await expect(page.getByTestId("seller-presentation-public")).toBeVisible();
    await expect(page.getByTestId("seller-presentation-flagship")).toHaveCount(0);
  });
});

test.describe("Flagship — per-section render (full fixture)", () => {
  test("every section renders", async ({ page }) => {
    await page.goto(FLAGSHIP);
    for (const id of [
      "fs-hero",
      "fs-price",
      "fs-note",
      "fs-why",
      "fs-pitch",
      "fs-reviews",
      "fs-area",
      "fs-agent",
      "fs-foot",
    ]) {
      await expect(page.getByTestId(id), id).toBeVisible();
    }
    // Frozen chart is mounted (the reused production AreaChart).
    await expect(page.locator(".fs-page .chart .line-stroke")).toHaveCount(1);
    // §02 agent message is the seller-visible rationale, bound as the ink lead.
    await expect(page.getByTestId("fs-count-msg")).toContainText(
      "anchor the recommendation",
    );
  });
});

test.describe("Flagship — count digit + n-aware grammar", () => {
  test("N (full = 3 counted comps) → plural", async ({ page }) => {
    await page.goto(FLAGSHIP);
    await expect(page.getByTestId("fs-count-digit")).toHaveText("3");
    await expect(page.getByTestId("fs-count-say")).toHaveText(
      "recent sales nearby anchor this number.",
    );
    await expect(page.getByTestId("fs-price")).toContainText(
      "Based on 3 recent sales nearby.",
    );
  });

  test("1 (minimal = 1 counted comp) → singular", async ({ page }) => {
    await page.goto("/seller-presentation-preview?fixture=minimal&template=flagship");
    await expect(page.getByTestId("fs-count-digit")).toHaveText("1");
    await expect(page.getByTestId("fs-count-say")).toHaveText(
      "recent sale nearby anchors this number.",
    );
    await expect(page.getByTestId("fs-price")).toContainText(
      "Based on 1 recent sale nearby.",
    );
  });

  test("the digit slot renders ONLY the numeral (no freeform text)", async ({
    page,
  }) => {
    await page.goto(FLAGSHIP);
    const digit = await page.getByTestId("fs-count-digit").textContent();
    expect(digit?.trim()).toMatch(/^\d+$/);
  });
});

test.describe("Flagship — optional-slot matrix (minimal reads complete)", () => {
  test("video / reviews / pitch flex out; area shows pending; wordmark present", async ({
    page,
  }) => {
    await page.goto("/seller-presentation-preview?fixture=minimal&template=flagship");
    // Present + complete:
    await expect(page.getByTestId("fs-hero")).toBeVisible();
    await expect(page.getByTestId("fs-price")).toBeVisible();
    await expect(page.getByTestId("fs-note")).toBeVisible(); // note text, no video
    await expect(page.getByTestId("fs-agent")).toBeVisible();
    await expect(page.getByTestId("fs-foot")).toBeVisible();
    await expect(page.getByTestId("fs-wordmark")).toBeVisible();
    // Optional slots absent:
    await expect(page.getByTestId("fs-note-video")).toHaveCount(0);
    await expect(page.getByTestId("fs-reviews")).toHaveCount(0);
    await expect(page.getByTestId("fs-pitch")).toHaveCount(0);
    // Area three-state: pending card, no ready block.
    await expect(page.getByTestId("fs-area")).toBeVisible();
    await expect(page.getByTestId("fs-area-pending")).toBeVisible();
    await expect(page.getByTestId("fs-area-ready")).toHaveCount(0);
    await expect(page.getByTestId("fs-area-pending")).toContainText(
      "A market snapshot is on the way.",
    );
  });

  test("outlink-only reviews → compact CTA card variant", async ({ page }) => {
    await page.goto(
      "/seller-presentation-preview?fixture=outlink-only&template=flagship",
    );
    const reviews = page.getByTestId("fs-reviews");
    await expect(reviews).toBeVisible();
    await expect(reviews).toHaveAttribute("data-variant", "outlink-only");
    await expect(page.getByTestId("fs-reviews-outlink")).toBeVisible();
  });
});

test.describe("Flagship — CTA on-signature contrast (contract §2/§4)", () => {
  test("default signature (F3 flagship blue) primary label resolves CREAM", async ({
    page,
  }) => {
    await page.goto(FLAGSHIP); // F3 default signature = flagship blue #037290
    const color = await read(page.getByTestId("fs-cta-primary"), "color");
    expect(luminance(color)).toBeGreaterThan(0.4); // cream, not dark ink
  });

  test("terracotta primary label resolves DARK (explicit signature)", async ({
    page,
  }) => {
    await page.goto(`${FLAGSHIP}&brandAccent=%23c26a4e`);
    const color = await read(page.getByTestId("fs-cta-primary"), "color");
    expect(luminance(color)).toBeLessThan(0.15); // dark ink, not cream
  });

  test("blue + green primary labels resolve CREAM", async ({ page }) => {
    for (const accent of ["%23037290", "%231c6b45"]) {
      await page.goto(`${FLAGSHIP}&brandAccent=${accent}`);
      const color = await read(page.getByTestId("fs-cta-primary"), "color");
      expect(luminance(color), accent).toBeGreaterThan(0.4); // cream
    }
  });
});

test.describe("Flagship — signature sweep (role distribution; body stays ink)", () => {
  const SIGS = ["%23c26a4e", "%23037290", "%23c8197b"]; // terracotta · blue · magenta

  test("signature role is consistent; deep differs; body text stays ink", async ({
    page,
  }) => {
    const signatureColors: string[] = [];
    for (const accent of SIGS) {
      await page.goto(`${FLAGSHIP}&brandAccent=${accent}`);
      const priceBig = await read(
        page.locator(".fs-page .fs-price__big").first(),
        "color",
      );
      const countDigit = await read(page.getByTestId("fs-count-digit"), "color");
      const statValue = await read(
        page.locator(".fs-page .fs-stat__v").first(),
        "color",
      );
      const compPrice = await read(
        page.locator(".fs-page .fs-comp__price").first(),
        "color",
      );
      const compAddr = await read(
        page.locator(".fs-page .fs-comp__addr").first(),
        "color",
      );

      // Substantive big numbers all carry the SAME --signature role.
      expect(countDigit, accent).toBe(priceBig);
      expect(statValue, accent).toBe(priceBig);
      // Comp price is --signature-deep — a distinct (darker) role.
      expect(compPrice, accent).not.toBe(priceBig);
      // Body text is layout-locked --ink under EVERY signature.
      expect(compAddr, accent).toBe(INK);

      signatureColors.push(priceBig);
    }
    // The three signatures produce three distinct signature colors.
    expect(new Set(signatureColors).size).toBe(3);
  });
});

test.describe("Flagship — wordmark slot", () => {
  test("wordmark renders 'Studio SEP' (SEP serif-italic)", async ({ page }) => {
    await page.goto(FLAGSHIP);
    const wordmark = page.getByTestId("fs-wordmark");
    await expect(wordmark).toBeVisible();
    await expect(wordmark).toContainText("Studio");
    await expect(wordmark.locator("em")).toHaveText("SEP");
  });
});
