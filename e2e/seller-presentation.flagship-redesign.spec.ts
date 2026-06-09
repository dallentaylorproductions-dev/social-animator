import { test, expect, type Page } from "@playwright/test";
import { pickIcon } from "../src/tools/seller-presentation/output/flagship/icons";

/**
 * D1 — consumer seller-page visual redesign (static end-state). Asserts the
 * locked-design structure the restyle introduces, all data/words preserved:
 *   - the deterministic auto-icon keyword map (pure, node context);
 *   - the 4 evenly-spaced DARK beats (hero · by-the-numbers · reviews · agent);
 *   - auto-icons render on why-work-with-us + how-we-market cards;
 *   - the comp photo SLOT flexes out cleanly (text-only card, D1 default);
 *   - reviews is a dark beat with 5.0 stars + a confidence card + logo slot.
 *
 * Driven via the stateless preview route with `?template=flagship`.
 */

const FLAGSHIP = "/seller-presentation-preview?fixture=full&template=flagship";

const read = (loc: ReturnType<Page["locator"]>, prop: string) =>
  loc.evaluate((el, p) => getComputedStyle(el).getPropertyValue(p), prop);

// WCAG relative luminance of a computed rgb() string (0 = black … 1 = white).
function luminance(rgb: string): number {
  const [r, g, b] = (rgb.match(/\d+/g) ?? ["0", "0", "0"]).map((n) => {
    const v = Number(n) / 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

test.describe("D1 — auto-icon keyword map (deterministic, pure)", () => {
  test("titles map to the expected themed icon; unmatched → sparkle", () => {
    // Real-estate themes resolve from the title.
    expect(pickIcon("Professional photography & video")).toBe("camera");
    expect(pickIcon("Targeted digital ad funnel")).toBe("target");
    expect(pickIcon("Featured placement & syndication")).toBe("broadcast");
    expect(pickIcon("Priced on real comps")).toBe("tag");
    expect(pickIcon("Open house every weekend")).toBe("key");
    expect(pickIcon("We stage every home")).toBe("home");
    expect(pickIcon("Negotiate and close")).toBe("doc");
    // D1-CLEANUP §5 — "launch" is a marketing keyword (ahead of `tag`), so a
    // launch card is a megaphone, not the price-tag its body word "compress"
    // would trip via the `tag` rule's "comp".
    expect(
      pickIcon(
        "A launch built around the first weekend.",
        "Pre-market push designed to compress the offer window.",
      ),
    ).toBe("megaphone");
    // Unmatched copy falls through to the universal mark (never a placeholder).
    expect(pickIcon("Something entirely unrelated")).toBe("sparkle");
  });

  test("body is a tiebreaker when the title has no keyword", () => {
    expect(pickIcon("Step one", "We shoot professional photography first")).toBe(
      "camera",
    );
    // Title keyword wins over the body.
    expect(pickIcon("Pricing", "with professional photography")).toBe("tag");
  });

  test("deterministic — same input always maps to the same icon", () => {
    expect(pickIcon("Targeted digital ad funnel")).toBe(
      pickIcon("Targeted digital ad funnel"),
    );
  });
});

test.describe("D1-FIX — price card (order + containment)", () => {
  test("meta row (label + based-on) precedes the number; number stays inside the card", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 360, height: 780 });
    await page.goto(FLAGSHIP);
    const price = page.getByTestId("fs-price");

    // Meta row carries BOTH the label and the based-on subline, above the number.
    const meta = price.locator(".price__meta");
    await expect(meta).toContainText("Based on");
    await expect(meta).toContainText("nearby");

    // The number is fully contained within the price panel at 360px — even when
    // forced to a 7-figure value (the overflow bug this fix closes).
    const fits = await page.evaluate(() => {
      const big = document.querySelector<HTMLElement>(".fs-page .price__single");
      const panel = document.querySelector<HTMLElement>(".fs-page .price__card");
      const digits = big?.querySelector<HTMLElement>("[data-price-digits]");
      if (digits)
        digits.innerHTML =
          '<span>1</span><span><span class="sep">,</span>250</span><span><span class="sep">,</span>000</span>';
      if (!big || !panel) return false;
      const b = big.getBoundingClientRect();
      const p = panel.getBoundingClientRect();
      return b.right <= p.right + 1 && b.left >= p.left - 1;
    });
    expect(fits, "7-figure price must not escape the card at 360px").toBe(true);
  });
});

test.describe("D1-FIX — desktop hero is side-by-side", () => {
  test("photo + dark band sit in two columns on a wide frame", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 1000 });
    await page.goto(FLAGSHIP);
    const cols = await page
      .getByTestId("fs-hero")
      .evaluate((el) => getComputedStyle(el).gridTemplateColumns);
    // Two resolved track widths → photo / band side-by-side (not the mobile stack).
    expect(cols.trim().split(/\s+/).length).toBe(2);
  });
});

test.describe("D1 — four dark beats, evenly spaced, none adjacent", () => {
  test("hero · by-the-numbers · reviews · agent are dark; the bands between are light", async ({
    page,
  }) => {
    await page.goto(FLAGSHIP);

    // The 4 dark beats.
    for (const id of ["fs-hero", "fs-whyus-stats", "fs-reviews", "fs-agent"]) {
      const bg = await read(page.getByTestId(id), "background-color");
      expect(luminance(bg), `${id} should be a dark beat`).toBeLessThan(0.06);
    }

    // Representative LIGHT sections that sit between the dark beats — proving the
    // beats are not adjacent (price/comps before by-numbers, area before agent).
    for (const id of ["fs-price", "fs-why", "fs-note", "fs-area"]) {
      const bg = await read(page.getByTestId(id), "background-color");
      expect(luminance(bg), `${id} should be a light band`).toBeGreaterThan(0.5);
    }
  });
});

test.describe("D1 — auto-icons on selling-points + how-we-market cards", () => {
  test("each card renders an auto-assigned line icon; the launch card is not a price tag", async ({
    page,
  }) => {
    await page.goto(FLAGSHIP);

    // D1-CLEANUP — the "Why work with us" differentiators wall is gone. The
    // agent's non-marketing pitch cards now render in "Selling points"; each
    // resolves an icon. (The fixture's "A Friday-evening update…" point lands
    // here under its routed testid fs-whyus-pitch-2.)
    await expect(
      page.getByTestId("fs-whyus-pitch-2").locator("[data-icon]"),
    ).toHaveCount(1);

    // How-we-market: the 3 dedicated feature cards each resolve an icon.
    for (const i of [0, 1, 2]) {
      await expect(
        page.getByTestId(`fs-whyus-mkt-${i}`).locator("[data-icon]"),
      ).toHaveCount(1);
    }
    await expect(
      page.getByTestId("fs-whyus-mkt-1").locator("[data-icon]"),
    ).toHaveAttribute("data-icon", "target");

    // D1-CLEANUP §5 — the routed "A launch built around the first weekend." card
    // (in How-we-market) gets a MARKETING glyph (megaphone), never the price-tag
    // its body word "compress" would otherwise trip via the `tag` rule.
    const launch = page.getByTestId("fs-whyus-pitch-1");
    await expect(launch).toContainText("launch built around the first weekend");
    const launchIcon = await launch
      .locator("[data-icon]")
      .getAttribute("data-icon");
    expect(launchIcon).not.toBe("tag");
    expect(launchIcon).toBe("megaphone");
  });

  test("the by-the-numbers home figure is the rare --mint (not ink, not market)", async ({
    page,
  }) => {
    await page.goto(FLAGSHIP);
    const home = page.locator(".fs-page .cmp__col--you .spark").first();
    await expect(home).toContainText("99.4");
    const homeColor = await read(home, "color");
    const mktColor = await read(
      page.locator(".fs-page .cmp__col--mkt .cmp__v").first(),
      "color",
    );
    // The home figure is bright (the mint light-tip) and distinct from the muted
    // market value — it clears AA-large on the dark beat regardless of how deep
    // the agent's signature is.
    expect(luminance(homeColor)).toBeGreaterThan(0.3);
    expect(luminance(homeColor)).toBeGreaterThan(luminance(mktColor));
    expect(homeColor).not.toBe(mktColor);
  });
});

test.describe("D1 — comp photo slot flexes out cleanly (text-only default)", () => {
  test("the card renders its data with NO photo block (D1 default)", async ({
    page,
  }) => {
    await page.goto(FLAGSHIP);
    const comp = page.getByTestId("fs-comp-0");
    await expect(comp).toBeVisible();
    // D1 ships the slot only — projectComp never sets photoUrl, so the photo
    // block is absent and the card reads as a clean text-only card.
    await expect(page.getByTestId("fs-comp-0-photo")).toHaveCount(0);
    await expect(comp).not.toHaveClass(/has-photo/);
    // The comp data is still present.
    await expect(comp.locator(".comp-card__addr")).not.toBeEmpty();
    await expect(comp.locator(".comp-card__price")).not.toBeEmpty();
    // SOURCE · PUBLIC RECORD line is preserved.
    await expect(page.getByTestId("fs-why")).toContainText("Public Record");
  });
});

test.describe("D1 — reviews dark beat (5.0 stars + confidence card + logo slot)", () => {
  test("ready state: dark band, 5 stars, confidence card, Zillow logo slot", async ({
    page,
  }) => {
    await page.goto(FLAGSHIP);
    const reviews = page.getByTestId("fs-reviews");
    await expect(reviews).toBeVisible();

    // Dark beat.
    const bg = await read(reviews, "background-color");
    expect(luminance(bg)).toBeLessThan(0.06);

    // The confidence card with the clean 5.0 + five stars.
    const conf = page.getByTestId("fs-reviews-confidence");
    await expect(conf).toBeVisible();
    await expect(conf).toContainText("5.0");
    await expect(conf.locator(".stars").first()).toContainText("★★★★★");

    // The logo slot (D4 swaps the official SVG) carries the detected source.
    const logo = page.getByTestId("fs-reviews-logo-slot");
    await expect(logo).toHaveAttribute("data-source", "Zillow");

    // The pull-quote copy is preserved verbatim.
    await expect(reviews).toContainText("She knew the neighborhood cold");
    // The reviews headline override surfaces.
    await expect(reviews.locator("h2.head")).toContainText(
      "What sellers say",
    );
  });

  test("outlink-only variant: compact dark CTA card + stars", async ({
    page,
  }) => {
    await page.goto(
      "/seller-presentation-preview?fixture=outlink-only&template=flagship",
    );
    const reviews = page.getByTestId("fs-reviews");
    await expect(reviews).toHaveAttribute("data-variant", "outlink-only");
    await expect(reviews.locator(".stars").first()).toContainText("★★★★★");
    await expect(page.getByTestId("fs-reviews-outlink")).toBeVisible();
  });
});
