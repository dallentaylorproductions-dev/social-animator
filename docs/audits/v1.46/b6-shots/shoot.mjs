import { chromium } from "playwright";

const BASE = "http://localhost:3000";
const OUT = "docs/audits/v1.46/b6-shots";

async function addFirstComp(page, addr, price) {
  await page.getByTestId("step-comps-manual-link").click();
  await page.getByTestId("step-comps-add-address").fill(addr);
  await page.getByLabel("comp-add-sold-price").fill(price);
  await page.getByTestId("step-comps-add-submit").click();
  await page.getByTestId("step-comps-card-0").waitFor({ state: "visible" });
}

async function fillToReview(page) {
  await page.goto(`${BASE}/seller-presentation`);
  await page.getByTestId("step-property-address").fill("1234 Test Drive NE");
  const next = page.getByTestId("wizard-next");
  await next.click();
  // comps step
  await addFirstComp(page, "5678 Elm Ave NE", "685000").catch(() => {});
  await next.click();
  await page.getByLabel("recommended-price").fill("700000");
  await next.click();
  await next.click(); // skip pitch
  await next.click(); // skip editorial
  await page.getByTestId("step-review").waitFor({ state: "visible" });
}

async function shoot(page, name, vw) {
  await page.waitForTimeout(250);
  await page.screenshot({ path: `${OUT}/${name}-${vw}.png`, fullPage: true });
  console.log("shot", name, vw);
}

for (const vw of [880, 390]) {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: vw, height: 900 } });

  // Mock publish/revoke so we can drive the published + revoked + error states.
  let publishCalls = 0;
  await page.route("**/api/seller-presentation/publish", async (route) => {
    publishCalls++;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ok: true, slug: `mockslug${publishCalls}` }),
    });
  });
  await page.route("**/api/seller-presentation/revoke", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ok: true }),
    });
  });

  await fillToReview(page);

  // 1) ready + summary + brand-incomplete warning (default: no agent name)
  await shoot(page, "01-ready-summary-warning", vw);

  // 2) published success card
  await page.getByTestId("step-review-publish").click();
  await page.getByTestId("step-review-published").waitFor({ state: "visible" });
  await shoot(page, "02-published", vw);

  // 3) revoked state
  await page.getByText("Revoke this URL").click();
  await page.waitForTimeout(400);
  await shoot(page, "03-revoked", vw);

  await browser.close();
}

// Error + missing states need separate routes.
{
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 880, height: 900 } });
  await page.route("**/api/seller-presentation/publish", async (route) => {
    await route.fulfill({
      status: 500,
      contentType: "application/json",
      body: JSON.stringify({ ok: false, error: "Backend unavailable (mock)" }),
    });
  });
  await fillToReview(page);
  await page.getByTestId("step-review-publish").click();
  await page.getByTestId("step-review-publish-error").waitFor({ state: "visible" });
  await shoot(page, "04-publish-error", 880);
  await browser.close();
}

// Missing-required state: stop before filling price.
{
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 880, height: 900 } });
  await page.goto(`${BASE}/seller-presentation`);
  await page.getByTestId("step-property-address").fill("1234 Test Drive NE");
  const next = page.getByTestId("wizard-next");
  await next.click();
  await next.click(); // comps (skip — comp required will be the blocker)
  await next.click(); // strategy
  await next.click(); // pitch
  await next.click(); // editorial
  await page.getByTestId("step-review").waitFor({ state: "visible" });
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${OUT}/05-missing-880.png`, fullPage: true });
  console.log("shot 05-missing 880");
  await browser.close();
}

console.log("DONE");
