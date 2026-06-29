import { test, expect } from "@playwright/test";
import {
  extractBulletCandidates,
  type BulletSection,
} from "../src/lib/seller-presentation/prepared-next/bullets";
import { resolveConfidence } from "../src/lib/seller-presentation/prepared-next/confidence";
import { composePreparedDraft } from "../src/lib/seller-presentation/prepared-next/compose";
import {
  MIN_BULLET_CHARS,
  FALLBACK_CTA,
} from "../src/lib/seller-presentation/prepared-next/constants";
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
    expect(resolveConfidence(p).confidence).toBe("partial");
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
    expect(resolveConfidence(p).confidence).toBe("partial");
  });

  test("template-only payload yields no bullet candidates (boilerplate is not a bullet)", () => {
    const p = payload({
      ...hard,
      welcomeLine: "At our meeting we will walk through the whole plan together.",
      valuationMessage: "I like to understand the market first before we talk price.",
    });
    // The boilerplate guard still drops these (extractBulletCandidates is unchanged
    // in v0.5; it is just no longer consulted by the gate).
    expect(extractBulletCandidates(p)).toEqual([]);
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

test.describe("composePreparedDraft - link + CTA appended by code (v0.2)", () => {
  const url = "https://studio.example.com/h/f3r6vy96";
  const draft = {
    textVariant: "Hi there. Quick note about your page.",
    emailVariant: "Hello. A short body for the email.",
  };

  test("appends the page link AND the CTA to both variants, after the model text", () => {
    const out = composePreparedDraft(draft, url);
    for (const v of [out.textVariant, out.emailVariant]) {
      expect(v).toContain(url);
      expect(v.endsWith(FALLBACK_CTA)).toBe(true);
    }
    expect(out.textVariant.startsWith(draft.textVariant)).toBe(true);
    expect(out.emailVariant.startsWith(draft.emailVariant)).toBe(true);
  });

  test("a blank link yields just the CTA (byte-identical to the pre-link append)", () => {
    const out = composePreparedDraft(draft, "");
    expect(out.textVariant).toBe(`${draft.textVariant}\n\n${FALLBACK_CTA}`);
    expect(out.emailVariant).toBe(`${draft.emailVariant}\n\n${FALLBACK_CTA}`);
  });
});

test.describe("resolveConfidence - v0.5 minimal-claims gate (no bullet dependency)", () => {
  const hard = { agentName: "Dana Rae", propertyAddress: "12 Oak St" };

  test("weak when the page subject is missing", () => {
    const r = resolveConfidence(payload({ agentName: "Dana Rae" }));
    expect(r.confidence).toBe("weak");
    expect(r.askField).toBeNull();
  });

  test("weak when agent identity is missing", () => {
    const r = resolveConfidence(payload({ propertyAddress: "12 Oak St" }));
    expect(r.confidence).toBe("weak");
  });

  test("partial + ask seller_name when the seller name is unknown (no page data needed)", () => {
    const r = resolveConfidence(payload({ ...hard }));
    expect(r.confidence).toBe("partial");
    expect(r.askField).toBe("seller_name");
  });

  test("a thin page with zero bullet candidates is still partial (was weak pre-v0.5)", () => {
    const p = payload({ ...hard }); // no value/marketing/comps/agent_plan content
    expect(extractBulletCandidates(p)).toEqual([]);
    expect(resolveConfidence(p).confidence).toBe("partial");
  });

  test("enough when the seller name is known", () => {
    const r = resolveConfidence(payload({ ...hard, preparedFor: "The Kims" }));
    expect(r.confidence).toBe("enough");
    expect(r.askField).toBeNull();
  });

  test("an agent-supplied seller name upgrades partial to enough", () => {
    const p = payload({ ...hard });
    expect(resolveConfidence(p, { sellerName: "The Kims" }).confidence).toBe("enough");
  });
});
