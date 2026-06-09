import { test, expect, type Page } from "@playwright/test";

/**
 * Flagship (v2) consumer page — render + role + reachability gate. Driven via
 * the stateless preview route with `?template=flagship` (the same read-time
 * override the /h/ route exposes). Deterministic DOM + computed-style
 * assertions (font-drift-immune).
 */

const INK = "rgb(27, 42, 46)"; // --ink #1B2A2E (D1 locked neutral, every signature)

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

// WCAG contrast ratio between two computed-style rgb() strings.
function contrastRatio(a: string, b: string): number {
  const la = luminance(a);
  const lb = luminance(b);
  const hi = Math.max(la, lb);
  const lo = Math.min(la, lb);
  return (hi + 0.05) / (lo + 0.05);
}

const TRANSPARENT = "rgba(0, 0, 0, 0)"; // computed background-color when unset

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
    await expect(page.locator(".fs-page .chart .line")).toHaveCount(1);
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
  test("video / reviews / pitch / area flex out; wordmark present", async ({
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
    // LS-1 — with no area-snapshot data the WHOLE §05 section flexes out (no
    // heading, no pending card, no placeholder). A "market snapshot on the way"
    // promise must never reach a real seller's published page.
    await expect(page.getByTestId("fs-area")).toHaveCount(0);
    await expect(page.getByTestId("fs-area-pending")).toHaveCount(0);
    await expect(page.getByTestId("fs-area-ready")).toHaveCount(0);
    await expect(page.locator("body")).not.toContainText(
      "A market snapshot is on the way",
    );
  });

  test("LS-1 — partial area snapshot renders the given fields, omits the rest, no placeholder", async ({
    page,
  }) => {
    await page.goto(
      "/seller-presentation-preview?fixture=area-partial&template=flagship",
    );
    // The section renders (it has data), in the ready state — never pending.
    await expect(page.getByTestId("fs-area")).toBeVisible();
    await expect(page.getByTestId("fs-area-ready")).toBeVisible();
    await expect(page.getByTestId("fs-area-pending")).toHaveCount(0);
    // LOCKED SPLIT — §05 shows ONLY the neighborhood MEDIAN SALE PRICE (+ the
    // chart when a series exists). The duplicate days-on-market / homes-sold /
    // sale-to-list cells are hidden (they live in "By the numbers").
    const area = page.getByTestId("fs-area");
    await expect(area).toContainText("Median Sale");
    await expect(area).toContainText("$642k");
    // The neighborhood overlap cells are suppressed here.
    await expect(area).not.toContainText("Days on market");
    await expect(area).not.toContainText("Homes sold");
    await expect(area).not.toContainText("Sale to list");
    // No chart (no monthly series) and no "on the way" placeholder.
    await expect(area.locator(".chart .line")).toHaveCount(0);
    await expect(page.locator("body")).not.toContainText(
      "A market snapshot is on the way",
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

  test("the earned price/count figures re-hue per signature; stats + body stay neutral ink", async ({
    page,
  }) => {
    const priceColors: string[] = [];
    const statColors: string[] = [];
    for (const accent of SIGS) {
      await page.goto(`${FLAGSHIP}&brandAccent=${accent}`);
      // The earned moments — price figure + the §02 count digit — carry the
      // deep teal (--teal-900, a signature mix), so they re-hue together.
      const priceBig = await read(
        page.locator(".fs-page .price__single").first(),
        "color",
      );
      const countDigit = await read(page.getByTestId("fs-count-digit"), "color");
      expect(countDigit, accent).toBe(priceBig);

      // Area stat values + comp prices + comp address are NEUTRAL ink — the
      // locked design keeps quiet figures off the accent.
      const statValue = await read(
        page.locator(".fs-page .stat__val").first(),
        "color",
      );
      const compAddr = await read(
        page.locator(".fs-page .comp-card__addr").first(),
        "color",
      );
      expect(statValue, accent).toBe(INK);
      expect(compAddr, accent).toBe(INK);

      priceColors.push(priceBig);
      statColors.push(statValue);
    }
    // The price figure re-hues → three distinct colors; the neutral stat value
    // is constant across all three signatures.
    expect(new Set(priceColors).size).toBe(3);
    expect(new Set(statColors).size).toBe(1);
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

  // F4 — white-label flag wired through the payload (`suppressWordmark`).
  test("suppressWordmark=true → wordmark absent from HTML; disclaimer stays", async ({
    page,
  }) => {
    await page.goto(`${FLAGSHIP}&suppressWordmark=1`);
    // The wordmark slot is gone entirely (not just hidden).
    await expect(page.getByTestId("fs-wordmark")).toHaveCount(0);
    // The footer still renders, and the disclaimer is ALWAYS present.
    const foot = page.getByTestId("fs-foot");
    await expect(foot).toBeVisible();
    await expect(foot).toContainText("drawn from public record");
  });

  test("no flag (default) → wordmark present", async ({ page }) => {
    await page.goto(FLAGSHIP);
    await expect(page.getByTestId("fs-wordmark")).toBeVisible();
    // A non-"1" value is treated as false → wordmark shows.
    await page.goto(`${FLAGSHIP}&suppressWordmark=yes`);
    await expect(page.getByTestId("fs-wordmark")).toBeVisible();
  });
});
