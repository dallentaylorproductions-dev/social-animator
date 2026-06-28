import { test, expect } from "@playwright/test";
import {
  extractBulletCandidates,
  type BulletSection,
} from "../src/lib/seller-presentation/prepared-next/bullets";
import { resolveConfidence } from "../src/lib/seller-presentation/prepared-next/confidence";
import { MIN_BULLET_CHARS } from "../src/lib/seller-presentation/prepared-next/constants";
import type { PublicPayload } from "../src/tools/seller-presentation/output/public-payload";

/**
 * PREPARED_NEXT (Anticipation v0) — pure unit tests for the two deterministic
 * seams: `extractBulletCandidates` (the bullet extraction) and `resolveConfidence`
 * (the rule-derived buckets). Runs as a node-context Playwright spec — the only
 * runner this repo has — mirroring the viewed-signal views-store spec.
 *
 * Coverage: empty payload; the MIN_BULLET_CHARS boundary (strictly greater);
 * fixed priority ordering; first-3-only; and the confidence buckets incl. the
 * weak short-circuit and the single ask_field priority (seller name → appointment).
 */

const longEnough = "x".repeat(MIN_BULLET_CHARS + 1); // 21 chars → qualifies
const exactlyMin = "y".repeat(MIN_BULLET_CHARS); // 20 chars → does NOT qualify (strictly >)

/** Build a payload with the four sections selectively populated. */
function payload(opts: {
  value?: string;
  marketing?: string;
  comps?: string;
  agentPlan?: string;
  agentName?: string;
  propertyAddress?: string;
  preparedFor?: string;
  appointmentAt?: string;
  // ---- State-A invitation sources (v0.1 coverage fix) ----
  welcomeLine?: string;
  leadEmphasis?: string;
  recentListings?: Array<{ address: string; viewCount?: number }>;
  valuationMessage?: string;
}): PublicPayload {
  const p: Record<string, unknown> = {};
  if (opts.value !== undefined) p.priceRationale = opts.value;
  if (opts.marketing !== undefined) {
    p.whyUs = {
      ...(p.whyUs as object),
      marketingApproach: [{ title: opts.marketing, detail: "" }],
    };
  }
  if (opts.comps !== undefined) {
    p.comps = [{ address: opts.comps, soldPrice: "" }];
  }
  if (opts.agentPlan !== undefined) {
    p.whyUs = { ...(p.whyUs as object), guarantee: opts.agentPlan };
  }
  if (opts.agentName !== undefined) p.agent = { name: opts.agentName };
  if (opts.propertyAddress !== undefined) p.propertyAddress = opts.propertyAddress;
  if (opts.preparedFor !== undefined) p.preparedFor = opts.preparedFor;
  if (opts.appointmentAt !== undefined) p.appointmentAt = opts.appointmentAt;
  if (opts.welcomeLine !== undefined) p.welcomeLine = opts.welcomeLine;
  if (opts.leadEmphasis !== undefined) p.leadEmphasis = opts.leadEmphasis;
  if (opts.recentListings !== undefined) p.recentListings = opts.recentListings;
  if (opts.valuationMessage !== undefined) p.valuationMessage = opts.valuationMessage;
  return p as unknown as PublicPayload;
}

test.describe("extractBulletCandidates", () => {
  test("an empty payload yields no candidates", () => {
    expect(extractBulletCandidates(payload({}))).toEqual([]);
  });

  test("a value section over the boundary qualifies", () => {
    const out = extractBulletCandidates(payload({ value: longEnough }));
    expect(out).toHaveLength(1);
    expect(out[0].section).toBe<BulletSection>("value");
  });

  test("a section of EXACTLY MIN_BULLET_CHARS does not qualify (strictly greater)", () => {
    expect(extractBulletCandidates(payload({ value: exactlyMin }))).toEqual([]);
  });

  test("sections come back in fixed priority order, first-3-only", () => {
    const out = extractBulletCandidates(
      payload({
        value: longEnough,
        marketing: longEnough,
        comps: longEnough,
        agentPlan: longEnough,
      }),
    );
    expect(out.map((c) => c.section)).toEqual<BulletSection[]>([
      "value",
      "marketing",
      "comps",
    ]);
  });

  test("a missing earlier section does not block a later one", () => {
    const out = extractBulletCandidates(payload({ marketing: longEnough }));
    expect(out).toHaveLength(1);
    expect(out[0].section).toBe<BulletSection>("marketing");
  });
});

test.describe("extractBulletCandidates - State-A invitation coverage (v0.1)", () => {
  const hard = { agentName: "Dana Rae", propertyAddress: "412 Birchwood Lane" };
  const listings = [{ address: "88 Maple Court", viewCount: 1240 }];

  test("A - bare prepared invitation (welcomeLine + leadEmphasis + recentListings) reaches partial", () => {
    const p = payload({
      ...hard,
      welcomeLine: "I put this together before we meet so you can see how I think.",
      leadEmphasis: "social-reach",
      recentListings: listings,
    });
    const out = extractBulletCandidates(p);
    expect(out.length).toBeGreaterThanOrEqual(2);
    expect(out.map((c) => c.section)).toEqual<BulletSection[]>(["marketing", "agent_plan"]);
    expect(resolveConfidence(p, out).confidence).toBe("partial");
  });

  test("D - exposure content only (no comps/valuation/brand) reaches partial", () => {
    const p = payload({
      ...hard,
      welcomeLine: "A quick hello before our meeting so the page feels personal.",
      leadEmphasis: "buyer-network",
      recentListings: listings,
    });
    const out = extractBulletCandidates(p);
    expect(out.length).toBeGreaterThanOrEqual(2);
    expect(resolveConfidence(p, out).confidence).toBe("partial");
  });

  test("template-only payload stays weak (boilerplate is not a bullet)", () => {
    const p = payload({
      ...hard,
      welcomeLine: "At our meeting we will walk through the whole plan together.",
      valuationMessage: "I like to understand the market first before we talk price.",
    });
    const out = extractBulletCandidates(p);
    expect(out).toEqual([]);
    expect(resolveConfidence(p, out).confidence).toBe("weak");
  });

  test("priority order holds when State-A and State-B fields coexist (first 3)", () => {
    const p = payload({
      ...hard,
      value: longEnough, // value
      leadEmphasis: "video-story", // marketing
      comps: "9 Elm Street Northeast", // comps
      welcomeLine: "A warm personal hello that would otherwise be agent_plan.", // agent_plan, dropped
    });
    expect(extractBulletCandidates(p).map((c) => c.section)).toEqual<BulletSection[]>([
      "value",
      "marketing",
      "comps",
    ]);
  });
});

test.describe("resolveConfidence", () => {
  const hard = { agentName: "Dana Rae", propertyAddress: "12 Oak St" };

  test("weak when fewer than 2 candidates", () => {
    const p = payload({ ...hard, value: longEnough });
    const r = resolveConfidence(p, extractBulletCandidates(p));
    expect(r.confidence).toBe("weak");
    expect(r.askField).toBeNull();
  });

  test("weak when a hard_required (agent identity) is missing", () => {
    const p = payload({
      propertyAddress: "12 Oak St",
      value: longEnough,
      marketing: longEnough,
      comps: longEnough,
    });
    const r = resolveConfidence(p, extractBulletCandidates(p));
    expect(r.confidence).toBe("weak");
  });

  test("partial with exactly 2 candidates", () => {
    const p = payload({ ...hard, value: longEnough, marketing: longEnough });
    const r = resolveConfidence(p, extractBulletCandidates(p));
    expect(r.confidence).toBe("partial");
  });

  test("partial + ask seller_name when name missing (3 candidates)", () => {
    const p = payload({
      ...hard,
      value: longEnough,
      marketing: longEnough,
      comps: longEnough,
      appointmentAt: "2026-07-01T17:00",
    });
    const r = resolveConfidence(p, extractBulletCandidates(p));
    expect(r.confidence).toBe("partial");
    expect(r.askField).toBe("seller_name");
  });

  test("partial + ask appointment_timing when name present but appointment missing", () => {
    const p = payload({
      ...hard,
      preparedFor: "The Kims",
      value: longEnough,
      marketing: longEnough,
      comps: longEnough,
    });
    const r = resolveConfidence(p, extractBulletCandidates(p));
    expect(r.confidence).toBe("partial");
    expect(r.askField).toBe("appointment_timing");
  });

  test("enough when 3 candidates + both askable enrichments present", () => {
    const p = payload({
      ...hard,
      preparedFor: "The Kims",
      appointmentAt: "2026-07-01T17:00",
      value: longEnough,
      marketing: longEnough,
      comps: longEnough,
    });
    const r = resolveConfidence(p, extractBulletCandidates(p));
    expect(r.confidence).toBe("enough");
    expect(r.askField).toBeNull();
  });
});
