import { test, expect } from "@playwright/test";
import { FLAGSHIP_PRIVACY_SENTINELS } from "../src/tools/seller-presentation/output/__fixtures__/sample-payload";

/**
 * Flagship (v2) privacy gate. The flagship renders the SAME public payload as
 * v1, through the SAME `clampPublicPayload` boundary. This proves that even
 * when the raw record is tampered with rogue private keys (the flagship-
 * privacy fixture), NONE reach the rendered flagship HTML — and that the
 * `counted` median-engine filter key never appears in markup.
 *
 * (Projection-time guarantees — set-aside comp filtering, private pitch
 * dropping, strategy/confidence stripping at PUBLISH time — are proven by the
 * untouched seller-presentation.publish-allowlist.spec.ts.)
 */

test.describe("Flagship — privacy (rogue private keys never render)", () => {
  test("clamp boundary strips every private sentinel before the flagship renders", async ({
    page,
  }) => {
    await page.goto(
      "/seller-presentation-preview?fixture=flagship-privacy&template=flagship",
    );
    await expect(page.getByTestId("seller-presentation-flagship")).toBeVisible();

    const html = await page.content();

    // Every injected private sentinel is ABSENT (strategy id/label,
    // confidence, per-comp note + field-confidence, private pitch point).
    for (const sentinel of Object.values(FLAGSHIP_PRIVACY_SENTINELS)) {
      expect(html, sentinel).not.toContain(sentinel);
    }

    // The `counted` median-engine filter key never appears in the markup.
    expect(html).not.toContain("counted");

    // Sanity: the PUBLIC content DID render (proves we asserted on a real page,
    // not an empty/error surface).
    await expect(page.getByTestId("fs-why")).toBeVisible();
    await expect(page.getByTestId("fs-comp-0")).toContainText("$648,000");
  });
});
