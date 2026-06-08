import { test, expect } from "@playwright/test";

/**
 * B0c — standalone pre-listing payload allowlist proof (data-OUT + read-back).
 *
 * The standalone page carries ONLY agent-constant marketing fields and NONE of
 * the seller page's listing data. `toPrelistingPayload` projects field-by-field
 * (never a spread) and `clampPrelistingPayload` re-runs the same allowlist on a
 * KV record. This spec drives both directly with sentinels in every renderable
 * slot PLUS rogue/listing/private keys, and asserts:
 *   - agent-constant content round-trips;
 *   - rogue top-level / nested / __proto__ keys + a listing key DROP;
 *   - empty inputs collapse to "absent" (flex), never a half-object;
 *   - the read clamp drops the same rogue keys a hand-edited KV record glues on.
 *
 * Pure-Node test — no browser, no HTTP. Privacy doesn't ride on routing.
 */

import {
  toPrelistingPayload,
  clampPrelistingPayload,
  type AgentBranding,
  type BrandWhyUsInput,
  type BrandReviewsInput,
} from "../src/tools/seller-presentation/output/public-payload";
import { WHYUS_CAPS } from "../src/lib/whyus";

const S = {
  agentName: "PUBLIC_SENTINEL_AGENT_NAME",
  agentBio: "PUBLIC_SENTINEL_AGENT_BIO",
  agentReassure: "PUBLIC_SENTINEL_REASSURE",
  tagline: "PUBLIC_SENTINEL_TAGLINE",
  diff: "PUBLIC_SENTINEL_DIFFERENTIATOR",
  statLabel: "PUBLIC_SENTINEL_STAT_LABEL",
  reviewBody: "PUBLIC_SENTINEL_REVIEW_BODY",
  reviewName: "PUBLIC_SENTINEL_REVIEW_NAME",
  reviewsHeadline: "PUBLIC_SENTINEL_REVIEWS_HEADLINE",
  outlinkUrl: "https://www.zillow.com/profile/PUBLIC_SENTINEL_OUTLINK",
  // Must NEVER survive:
  rogueAgentKey: "PRIVATE_SENTINEL_ROGUE_AGENT",
  rogueWhyUsTop: "PRIVATE_SENTINEL_WHYUS_ROGUE_TOP",
  rogueWhyUsNested: "PRIVATE_SENTINEL_WHYUS_ROGUE_NESTED",
  rogueProto: "PRIVATE_SENTINEL_WHYUS_ROGUE_PROTO",
  // A listing field a tampered record might try to ride onto the standalone page.
  listingAddress: "PRIVATE_SENTINEL_LISTING_ADDRESS",
  recommendedPrice: "PRIVATE_SENTINEL_RECOMMENDED_PRICE",
  skeletonStat: "REMOVED_SENTINEL_SKELETON_STAT",
};

const AGENT: AgentBranding & Record<string, unknown> = {
  name: S.agentName,
  brokerage: "Test Realty",
  phone: "2532028825",
  email: "aaron@example.com",
  licenseNumber: "WA-12345",
  bioShort: S.agentBio,
  ctaReassurance: S.agentReassure,
  // Rogue private key on the agent input — explicit field-by-field projection drops it.
  negotiationNotes: S.rogueAgentKey,
};

const BRAND_WHYUS: BrandWhyUsInput = {
  whyUs: {
    differentiators: [S.diff, "", "   "],
    marketingApproach: [{ title: "Pro photography", rogue: S.rogueWhyUsNested }],
    performanceStats: [
      { label: S.statLabel, yourValue: "99.4%", marketValue: "97.1%", unit: "%" },
      { label: S.skeletonStat, yourValue: "" }, // skeleton row → drops
    ],
    howWeWork: [{ step: "Walk the home" }],
    guarantee: "Cancel any time.",
    rogueGroup: S.rogueWhyUsTop,
    ["__proto__rogue"]: S.rogueProto,
  } as unknown as BrandWhyUsInput["whyUs"],
  agentTagline: S.tagline,
  reviewsHeadline: S.reviewsHeadline,
};

const BRAND_REVIEWS: BrandReviewsInput = {
  reviews: [{ body: S.reviewBody, attributionName: S.reviewName, attributionYear: "2025" }],
  reviewsOutlinkUrl: S.outlinkUrl,
};

const ALLOWED_TOP_LEVEL_KEYS = new Set([
  "templateVersion",
  "suppressWordmark",
  "agent",
  "agentTagline",
  "whyUs",
  "reviews",
  "reviewsOutlink",
  "reviewsHeadline",
  "brandColors",
]);

test.describe("toPrelistingPayload — agent-constant allowlist (B0c)", () => {
  test("agent-constant content round-trips; nothing listing-shaped is even possible", () => {
    const payload = toPrelistingPayload(
      AGENT,
      BRAND_WHYUS,
      BRAND_REVIEWS,
      { brandAccent: "#1f6f5c" },
      false,
    );

    expect(payload.templateVersion).toBe(2);
    expect(payload.agent.name).toBe(S.agentName);
    expect(payload.agent.bioShort).toBe(S.agentBio);
    expect(payload.agent.ctaReassurance).toBe(S.agentReassure);
    expect(payload.agentTagline).toBe(S.tagline);

    expect(payload.whyUs?.differentiators).toEqual([S.diff]);
    expect(payload.whyUs?.marketingApproach).toEqual([{ title: "Pro photography" }]);
    expect(payload.whyUs?.performanceStats).toHaveLength(1);
    expect(payload.whyUs?.performanceStats[0].label).toBe(S.statLabel);
    expect(payload.whyUs?.guarantee).toBe("Cancel any time.");

    expect(payload.reviews).toHaveLength(1);
    expect(payload.reviews?.[0].body).toBe(S.reviewBody);
    expect(payload.reviewsOutlink?.url).toBe(S.outlinkUrl);
    expect(payload.reviewsOutlink?.label).toBe("See all reviews on Zillow");
    expect(payload.reviewsHeadline).toBe(S.reviewsHeadline);
    expect(payload.brandColors).toEqual({ accent: "#1f6f5c" });

    // Only the agent-constant top-level keys exist — no listing slots at all.
    const json = JSON.parse(JSON.stringify(payload)) as Record<string, unknown>;
    for (const key of Object.keys(json)) {
      expect(ALLOWED_TOP_LEVEL_KEYS.has(key), `unexpected top-level key "${key}"`).toBe(true);
    }
  });

  test("rogue / nested / __proto__ / skeleton + a private agent key all DROP", () => {
    const payload = toPrelistingPayload(AGENT, BRAND_WHYUS, BRAND_REVIEWS);
    const serialized = JSON.stringify(payload);

    for (const rogue of [
      S.rogueAgentKey,
      S.rogueWhyUsTop,
      S.rogueWhyUsNested,
      S.rogueProto,
      S.skeletonStat,
    ]) {
      expect(serialized).not.toContain(rogue);
    }
    for (const key of ["negotiationNotes", "rogueGroup", "rogue", "__proto__rogue"]) {
      expect(serialized).not.toContain(`"${key}":`);
    }
    // Positive control — allowlisted sentinels DID survive (real projection,
    // not a wholesale drop).
    expect(serialized).toContain(S.diff);
    expect(serialized).toContain(S.statLabel);
  });

  test("over-cap why-us lists are hard-clamped to the soft caps", () => {
    const over = (n: number, make: (i: number) => unknown) =>
      Array.from({ length: n }, (_, i) => make(i));
    const payload = toPrelistingPayload(AGENT, {
      whyUs: {
        differentiators: over(20, (i) => `diff ${i}`),
        marketingApproach: over(20, (i) => ({ title: `m ${i}` })),
        performanceStats: over(20, (i) => ({ label: `s ${i}`, yourValue: "1" })),
        howWeWork: over(20, (i) => ({ step: `step ${i}` })),
      },
    } as unknown as BrandWhyUsInput);

    expect(payload.whyUs?.differentiators.length).toBe(WHYUS_CAPS.differentiators);
    expect(payload.whyUs?.marketingApproach.length).toBe(WHYUS_CAPS.marketingApproach);
    expect(payload.whyUs?.performanceStats.length).toBe(WHYUS_CAPS.performanceStats);
    expect(payload.whyUs?.howWeWork.length).toBe(WHYUS_CAPS.howWeWork);
  });

  test("empty inputs collapse to absent (flex) — never a half-populated object", () => {
    const payload = toPrelistingPayload({ name: "Solo Agent" });
    const serialized = JSON.stringify(payload);

    expect(payload.whyUs).toBeUndefined();
    expect(payload.agentTagline).toBeUndefined();
    expect(payload.reviews).toBeUndefined();
    expect(payload.reviewsOutlink).toBeUndefined();
    expect(payload.reviewsHeadline).toBeUndefined();
    expect(payload.brandColors).toBeUndefined();
    for (const key of ["whyUs", "reviews", "reviewsOutlink", "reviewsHeadline", "brandColors", "agentTagline"]) {
      expect(serialized).not.toContain(`"${key}":`);
    }
    // The agent (required) still emits, with the name.
    expect(payload.agent.name).toBe("Solo Agent");
  });

  test("white-label flag: only literal true projects suppressWordmark", () => {
    expect(toPrelistingPayload({ name: "A" }, {}, {}, {}, true).suppressWordmark).toBe(true);
    expect(toPrelistingPayload({ name: "A" }, {}, {}, {}, false).suppressWordmark).toBeUndefined();
    expect(JSON.stringify(toPrelistingPayload({ name: "A" }))).not.toContain('"suppressWordmark":');
  });
});

test.describe("clampPrelistingPayload — read boundary (B0c)", () => {
  test("re-runs the allowlist on a hand-edited KV record (drops rogue + listing keys)", () => {
    const clamped = clampPrelistingPayload({
      templateVersion: 2,
      agent: { name: S.agentName, negotiationNotes: S.rogueAgentKey },
      agentTagline: S.tagline,
      whyUs: {
        differentiators: [S.diff, ""],
        marketingApproach: [{ title: "Pro photo", secretFee: "PRIVATE_KV_ROGUE" }],
        performanceStats: [{ label: S.statLabel, yourValue: "99%" }],
        howWeWork: [{ step: "Walk" }],
        tamperedTopKey: "PRIVATE_KV_TOP_ROGUE",
      },
      reviews: [{ body: S.reviewBody, attributionName: S.reviewName }],
      reviewsOutlink: { label: "See all reviews on Zillow", url: S.outlinkUrl },
      // Listing keys a tampered record glues on — must be ignored entirely.
      propertyAddress: S.listingAddress,
      recommendedPrice: S.recommendedPrice,
      comps: [{ address: S.listingAddress, soldPrice: "$1" }],
    });
    const serialized = JSON.stringify(clamped);

    expect(clamped.agent.name).toBe(S.agentName);
    expect(clamped.whyUs?.differentiators).toEqual([S.diff]);
    expect(clamped.reviews).toHaveLength(1);

    // Rogue + listing content all absent (value AND key).
    for (const sentinel of [S.rogueAgentKey, S.listingAddress, S.recommendedPrice, "PRIVATE_KV_ROGUE", "PRIVATE_KV_TOP_ROGUE"]) {
      expect(serialized).not.toContain(sentinel);
    }
    for (const key of ["negotiationNotes", "secretFee", "tamperedTopKey", "propertyAddress", "recommendedPrice", "comps", "property", "whyPrice"]) {
      expect(serialized).not.toContain(`"${key}":`);
    }
  });

  test("a non-object / empty record clamps to a safe agent-empty payload", () => {
    for (const bad of [undefined, null, "nope", 42, []]) {
      const clamped = clampPrelistingPayload(bad);
      expect(clamped.templateVersion).toBe(2);
      expect(clamped.agent).toEqual({});
      expect(clamped.whyUs).toBeUndefined();
    }
  });
});
