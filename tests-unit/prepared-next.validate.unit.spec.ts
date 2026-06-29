import { test, expect } from "@playwright/test";
import { validatePreparedOutput } from "../src/lib/seller-presentation/prepared-next/validate";

/**
 * PREPARED_NEXT v1.4 - regression lock for `validate.ts`, the honesty gate. This
 * is the ONLY automated guard against a private value reaching a seller, so every
 * reject path + a clean pass is pinned here.
 *
 * Pure node-context spec (no browser, no KV), matching prepared-next.bullets.
 * The validator consumes the model's RAW variants plus a route-built `denyValues`
 * list (the dynamic per-page private values). `buildDenyValues` itself lives in
 * the route (not exported), so the dynamic path is exercised here at the
 * validator's real input contract: representative private payload values are
 * passed as `denyValues`, exactly as the route feeds them.
 *
 * Failure precedence inside the validator is: empty -> truncated -> em-dash ->
 * denylist; each test isolates one gate so the asserted reason is unambiguous.
 */

const CLEAN_TEXT =
  "Hi there. I put together a private overview of 4270 Dudley Dr NE so you can look it over before we meet.";
const CLEAN_EMAIL =
  "Hello. I prepared a private overview of the property ahead of our appointment. Take a look whenever it suits you.";

test.describe("validatePreparedOutput - em-dash gate", () => {
  test("an em dash (U+2014) in a variant is rejected", () => {
    const r = validatePreparedOutput({
      textVariant: "Hi there. A quick note about your overview — nothing is sent.",
      emailVariant: CLEAN_EMAIL,
    });
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.reason).toBe("em-dash");
  });

  test("a horizontal bar (U+2015) in a variant is rejected", () => {
    const r = validatePreparedOutput({
      textVariant: CLEAN_TEXT,
      emailVariant: "Hello ― a short note for you.",
    });
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.reason).toBe("em-dash");
  });

  test("an en dash (U+2013) is intentionally ALLOWED", () => {
    const r = validatePreparedOutput({
      textVariant: "Hi there. The 2 to 3 day window – it works for me.",
      emailVariant: CLEAN_EMAIL,
    });
    expect(r.ok).toBe(true);
  });
});

test.describe("validatePreparedOutput - denylist gate", () => {
  test("a STATIC private-field token leaking verbatim is rejected", () => {
    // e.g. the model echoing a raw field key it must never surface.
    const r = validatePreparedOutput({
      textVariant: "Hi there. Your soldPrice looks strong for the area.",
      emailVariant: CLEAN_EMAIL,
    });
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.reason).toBe("denylist");
    expect(r.ok === false && r.detail).toBe("soldprice");
  });

  test("a 'seller motivation' / 'internal note' static token is rejected", () => {
    const r = validatePreparedOutput({
      textVariant: CLEAN_TEXT,
      emailVariant: "Hello. Per the internal note, you are motivated to move quickly.",
    });
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.reason).toBe("denylist");
    expect(r.ok === false && r.detail).toBe("internal note");
  });

  test("a DYNAMIC per-page private value (route-built denyValues) leaking verbatim is rejected", () => {
    // Stand-ins for private payload values the route collects OUTSIDE the safe
    // clip (a comp sold price, a private motivation line) and passes as denyValues.
    const denyValues = ["$1,250,000 sold", "relocating for a new job out of state"];
    const r = validatePreparedOutput({
      textVariant: CLEAN_TEXT,
      emailVariant:
        "Hello. Comparable homes near you recently went for $1,250,000 sold, which is encouraging.",
      denyValues,
    });
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.reason).toBe("denylist");
  });

  test("a short denyValue (< 8 chars) is NOT scanned (false-positive guard)", () => {
    const r = validatePreparedOutput({
      textVariant: "Hi there. Oak St works well for buyers.",
      emailVariant: CLEAN_EMAIL,
      denyValues: ["Oak St"], // 6 chars -> below the length gate, ignored
    });
    expect(r.ok).toBe(true);
  });
});

test.describe("validatePreparedOutput - truncation gate", () => {
  test("an explicit token-cap hit is rejected as truncated", () => {
    const r = validatePreparedOutput({
      textVariant: CLEAN_TEXT,
      emailVariant: CLEAN_EMAIL,
      tokenCapHit: true,
    });
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.reason).toBe("truncated");
  });

  test("a variant cut mid-sentence (no terminal punctuation) is rejected as truncated", () => {
    const r = validatePreparedOutput({
      textVariant: "Hi there. I put together a private overview of your property and it really",
      emailVariant: CLEAN_EMAIL,
    });
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.reason).toBe("truncated");
  });
});

test.describe("validatePreparedOutput - empty gate", () => {
  test("an empty variant is rejected", () => {
    const r = validatePreparedOutput({ textVariant: "", emailVariant: CLEAN_EMAIL });
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.reason).toBe("empty");
  });

  test("a whitespace-only variant is rejected", () => {
    const r = validatePreparedOutput({ textVariant: CLEAN_TEXT, emailVariant: "   \n  " });
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.reason).toBe("empty");
  });
});

test.describe("validatePreparedOutput - clean pass", () => {
  test("a normal minimal-claims draft passes (no private values, no em dash, complete)", () => {
    const r = validatePreparedOutput({
      textVariant: CLEAN_TEXT,
      emailVariant: CLEAN_EMAIL,
      denyValues: ["a private payload value the model never saw and did not emit"],
    });
    expect(r.ok).toBe(true);
  });

  test("ordinary words and punctuation are not false-positives; the validator scans the model variants BEFORE the link/CTA append", () => {
    // The route appends the page link + FALLBACK_CTA AFTER this gate (compose.ts),
    // so the validator only ever sees the model text. A normal draft with commas,
    // periods, and a quoted phrase must pass cleanly.
    const r = validatePreparedOutput({
      textVariant: 'Hi there. I prepared "a private overview" for you, ready when you are.',
      emailVariant: CLEAN_EMAIL,
    });
    expect(r.ok).toBe(true);
  });
});
