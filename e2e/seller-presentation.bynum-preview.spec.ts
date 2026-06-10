import { test, expect } from "@playwright/test";

/**
 * By-the-numbers — honest preview + real-data publish projection (pure-Node).
 *
 * Two boundaries, no browser:
 *
 *   1. `draftPreviewPayload` (the wizard live-preview helper) keeps the
 *      By-the-numbers band VISIBLE even before the agent fills their track
 *      record. When the agent's own stats are empty it substitutes the SAMPLE
 *      figures and stamps `whyUsStatsSample: true` so the band renders a
 *      "Sample" tag. When the agent HAS stats, no substitution, no flag.
 *
 *   2. `toPublicPayload` (the real publish path) projects the agent's filled
 *      stats straight through `clampPublicWhyUs` into `payload.whyUs
 *      .performanceStats` — so a real publish renders the band with HIS
 *      numbers. Empty stats project to no band (the published page hides it).
 *
 * The preview-only flag must NEVER ride the publish path: `toPublicPayload`
 * never sets `whyUsStatsSample`, so the published page is byte-identical.
 */

import { draftPreviewPayload } from "../src/tools/seller-presentation/components/preview/preview-payload";
import { toPublicPayload } from "../src/tools/seller-presentation/output/public-payload";
import type { BrandSettings } from "../src/lib/brand";
import type { WhyUs } from "../src/lib/whyus";

// A non-sparse draft (has an address) so the preview shows the REAL draft, not
// the whole-page sample fallback — this is the state where the band would
// otherwise flex out if the agent's stats are blank.
const NON_SPARSE_DRAFT = { propertyAddress: "123 Cedar Lane" };

// The agent's real, filled track record (his numbers).
const FILLED_WHYUS: WhyUs = {
  differentiators: [],
  marketingApproach: [],
  howWeWork: [],
  performanceStats: [
    {
      label: "Average sale-to-list",
      yourValue: "101%",
      marketValue: "97%",
      unit: "%",
    },
    { label: "Homes sold (last 12 months)", yourValue: "47" },
  ],
};

const brandWith = (whyUs?: WhyUs): BrandSettings =>
  ({ whyUs }) as unknown as BrandSettings;

test.describe("By-the-numbers — honest preview substitution", () => {
  test("empty stats → sample figures + Sample flag (band stays visible)", () => {
    const payload = draftPreviewPayload(NON_SPARSE_DRAFT, brandWith(undefined));
    // The band is kept visible with the curated sample figures...
    expect(payload.whyUs?.performanceStats?.length ?? 0).toBeGreaterThan(0);
    // ...and clearly marked as a sample so it can't be mistaken for real data.
    expect(payload.whyUsStatsSample).toBe(true);
    // The sample is the shared fixture's signature sale-to-list moment.
    const labels = payload.whyUs!.performanceStats.map((s) => s.label);
    expect(labels).toContain("Average sale-to-list");
  });

  test("filled stats → his numbers, no Sample flag", () => {
    const payload = draftPreviewPayload(
      NON_SPARSE_DRAFT,
      brandWith(FILLED_WHYUS),
    );
    expect(payload.whyUsStatsSample).toBeUndefined();
    const values = payload.whyUs!.performanceStats.map((s) => s.yourValue);
    expect(values).toContain("101%");
    expect(values).toContain("47");
    // The sample figures never leak in when the agent has their own.
    expect(values).not.toContain("99.4%");
  });
});

test.describe("By-the-numbers — real-data publish projection", () => {
  test("filled stats project into the published payload (band renders his numbers)", () => {
    const payload = toPublicPayload(
      { ...NON_SPARSE_DRAFT, comps: [], pitchPoints: [] } as never,
      { name: "Jane Agent" } as never,
      {},
      {},
      false,
      { whyUs: FILLED_WHYUS },
    );
    expect(payload.whyUs?.performanceStats).toEqual([
      {
        label: "Average sale-to-list",
        yourValue: "101%",
        marketValue: "97%",
        unit: "%",
      },
      { label: "Homes sold (last 12 months)", yourValue: "47" },
    ]);
    // The preview-only Sample flag NEVER rides the publish path.
    expect(payload.whyUsStatsSample).toBeUndefined();
  });

  test("empty/blank stats project to no band on the published page", () => {
    const blankWhyUs: WhyUs = {
      differentiators: [],
      marketingApproach: [],
      howWeWork: [],
      // Pre-labeled skeleton rows the agent never filled (blank yourValue).
      performanceStats: [
        { label: "Average sale-to-list", yourValue: "", unit: "%" },
        { label: "Homes sold (last 12 months)", yourValue: "" },
      ],
    };
    const payload = toPublicPayload(
      { ...NON_SPARSE_DRAFT, comps: [], pitchPoints: [] } as never,
      { name: "Jane Agent" } as never,
      {},
      {},
      false,
      { whyUs: blankWhyUs },
    );
    // No renderable stat survived → no performanceStats on the published page.
    expect(payload.whyUs?.performanceStats ?? []).toEqual([]);
  });
});
