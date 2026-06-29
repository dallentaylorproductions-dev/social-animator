import { test, expect } from "@playwright/test";
import {
  ensureEligibleWorkOrder,
  saveWorkOrder,
  newEligibleWorkOrder,
  preparedKey,
  workOrderIdentity,
  type FollowUpRecapWorkOrder,
  type WorkOrderStatus,
} from "../src/lib/seller-presentation/prepared-next/work-order";
import { viewedSignalMoment } from "../src/lib/seller-presentation/prepared-next/moment";
import { MAX_GENERATIONS_PER_WORK_ORDER } from "../src/lib/seller-presentation/prepared-next/constants";
// KV test controls come from the in-memory fake imported by its RELATIVE path.
// work-order.ts reaches the SAME file via the remapped "@vercel/kv" specifier
// (tsconfig.unit.json); module identity is by resolved absolute path, so both
// share one singleton + backing store. Importing the controls relatively (not via
// "@vercel/kv") keeps the spec type-clean under the MAIN tsconfig too, so the
// `next build` type-check never sees fake-only exports on the real kv type.
import {
  __resetKv,
  __seedKv,
  __readKv,
  __keyCount,
  __hideNextGet,
} from "./_fakes/vercel-kv";

/**
 * PREPARED_NEXT v1.4 - regression lock for `work-order.ts` lifecycle integrity:
 * idempotency, the NX race, dismiss-preserve, and version-reset. These keep a
 * dismissed agent from being re-nagged and a republished page from inheriting a
 * stale terminal state. `@vercel/kv` is redirected to an in-memory fake
 * (tsconfig.unit.json); the `__`-helpers come from that same module singleton.
 */

const ACCOUNT = "agent@example.com";

function moment(slug: string, version: string) {
  return viewedSignalMoment({
    slug,
    ownerEmail: ACCOUNT,
    handoutUpdatedAt: version,
    timestamp: "2026-06-28T12:00:00.000Z",
  });
}

function seedWorkOrder(
  slug: string,
  version: string,
  overrides: Partial<FollowUpRecapWorkOrder>,
): Promise<void> {
  const base = newEligibleWorkOrder({ moment: moment(slug, version), accountId: ACCOUNT, version });
  return saveWorkOrder(slug, { ...base, ...overrides });
}

test.beforeEach(() => __resetKv());
test.afterEach(() => __resetKv());

test.describe("workOrderIdentity - deterministic key", () => {
  test("same account + slug + version yields the same identity string", () => {
    const a = workOrderIdentity({ accountId: ACCOUNT, slug: "abc12345", version: "v1" });
    const b = workOrderIdentity({ accountId: ACCOUNT.toUpperCase(), slug: "abc12345", version: "v1" });
    expect(a).toBe(b); // account is lowercased into the identity
    expect(a).toContain("follow_up_recap:viewed_signal:v1");
  });
});

test.describe("ensureEligibleWorkOrder - idempotency (same version)", () => {
  test("two calls for the same page+version yield exactly ONE Work Order", async () => {
    const slug = "idem0001";
    const first = await ensureEligibleWorkOrder({ moment: moment(slug, "v1"), accountId: ACCOUNT, version: "v1" });
    const second = await ensureEligibleWorkOrder({ moment: moment(slug, "v1"), accountId: ACCOUNT, version: "v1" });
    expect(__keyCount()).toBe(1);
    expect(first.version).toBe("v1");
    expect(second.version).toBe("v1");
    expect(second.status).toBe("eligible");
    expect(second.generationCount).toBe(0);
  });

  test("a same-version re-view returns the ADVANCED record untouched (no reset to eligible)", async () => {
    const slug = "idem0002";
    await ensureEligibleWorkOrder({ moment: moment(slug, "v1"), accountId: ACCOUNT, version: "v1" });
    // The page later advanced to prepared with one generation spent...
    await seedWorkOrder(slug, "v1", {
      status: "prepared",
      generationCount: 1,
      draftOutput: { textVariant: "hi", emailVariant: "hello" },
    });
    // ...a fresh duplicate view of the SAME version must not clobber it.
    const again = await ensureEligibleWorkOrder({ moment: moment(slug, "v1"), accountId: ACCOUNT, version: "v1" });
    expect(again.status).toBe("prepared");
    expect(again.generationCount).toBe(1);
    expect(__keyCount()).toBe(1);
  });
});

test.describe("ensureEligibleWorkOrder - NX race", () => {
  test("a lost NX create re-reads and returns the winner, not a duplicate", async () => {
    const slug = "race0001";
    // A concurrent writer already wrote the record under this key...
    const winner = { ...newEligibleWorkOrder({ moment: moment(slug, "v1"), accountId: ACCOUNT, version: "v1" }), whyNow: "WINNER" };
    __seedKv(preparedKey(slug), winner);
    // ...but it is not yet visible to THIS reader's first get, so the caller
    // falls into the create path; the NX set then loses and it re-reads.
    __hideNextGet();
    const result = await ensureEligibleWorkOrder({ moment: moment(slug, "v1"), accountId: ACCOUNT, version: "v1" });
    expect(result.whyNow).toBe("WINNER");
    expect(__keyCount()).toBe(1);
  });
});

test.describe("ensureEligibleWorkOrder - dismissed preserved across a version change", () => {
  test("an existing dismissed WO + a NEW version stays dismissed (not reset)", async () => {
    const slug = "dism0001";
    await seedWorkOrder(slug, "v1", { status: "dismissed", approvalAction: "dismiss" });
    const res = await ensureEligibleWorkOrder({ moment: moment(slug, "v2"), accountId: ACCOUNT, version: "v2" });
    expect(res.status).toBe("dismissed");
    expect(res.version).toBe("v1"); // the dismissed record is returned untouched
    const stored = __readKv(preparedKey(slug)) as FollowUpRecapWorkOrder;
    expect(stored.status).toBe("dismissed");
    expect(stored.version).toBe("v1");
  });
});

test.describe("ensureEligibleWorkOrder - version reset (every non-dismissed terminal/active state)", () => {
  const resettable: WorkOrderStatus[] = ["failed", "failed_final", "prepared", "stale"];
  for (const status of resettable) {
    test(`an existing '${status}' WO + a NEW version is superseded with a fresh eligible (generationCount 0)`, async () => {
      const slug = `rst_${status}`;
      await seedWorkOrder(slug, "v1", {
        status,
        generationCount: MAX_GENERATIONS_PER_WORK_ORDER,
        draftOutput: status === "prepared" ? { textVariant: "x", emailVariant: "y" } : null,
      });
      const res = await ensureEligibleWorkOrder({ moment: moment(slug, "v2"), accountId: ACCOUNT, version: "v2" });
      expect(res.status).toBe("eligible");
      expect(res.version).toBe("v2");
      expect(res.generationCount).toBe(0);
      expect(res.draftOutput).toBeNull();
      expect(__keyCount()).toBe(1);
    });
  }
});

test.describe("generation budget invariants (work-order surface)", () => {
  // NOTE: the run-time cap CHECK (generationCount >= MAX -> failed_final, no third
  // generation) is enforced in the prepare ROUTE, not in work-order.ts, and is
  // covered by code-read (QA item 16). What work-order.ts OWNS is the budget
  // identity, locked here: a fresh / superseded WO always starts at 0, so each
  // content version gets its own two-generation budget and a stale count can never
  // carry across a republish.
  test("a fresh eligible WO starts at generationCount 0", () => {
    const wo = newEligibleWorkOrder({ moment: moment("fresh001", "v1"), accountId: ACCOUNT, version: "v1" });
    expect(wo.generationCount).toBe(0);
    expect(wo.status).toBe("eligible");
    expect(wo.draftOutput).toBeNull();
    expect(wo.writeback).toBeNull();
  });

  test("the cap is two (one initial + one manual retry)", () => {
    expect(MAX_GENERATIONS_PER_WORK_ORDER).toBe(2);
  });
});
