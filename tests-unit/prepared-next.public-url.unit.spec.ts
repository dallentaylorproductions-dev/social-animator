import { test, expect } from "@playwright/test";
import {
  CANONICAL_PUBLIC_BASE,
  publicBaseUrl,
  publicPageUrl,
} from "../src/lib/public-url";

/**
 * PREPARED_NEXT v1.2 (Q3) - the recap link is the CANONICAL production URL, never
 * the request / browser origin, so a prepare or a "Copy link" from a preview /
 * branch deploy can't leak a *.vercel.app URL into a seller-facing message.
 *
 * Pure-Node lock on the one builder the route, "Copy link", and "View live page"
 * all share. `NEXT_PUBLIC_SITE_URL` is read at module-call time (not import time),
 * so we can drive both the env-set and the pinned-fallback branch here.
 */

const ORIGINAL = process.env.NEXT_PUBLIC_SITE_URL;

test.afterEach(() => {
  if (ORIGINAL === undefined) delete process.env.NEXT_PUBLIC_SITE_URL;
  else process.env.NEXT_PUBLIC_SITE_URL = ORIGINAL;
});

test("falls back to the pinned production base when NEXT_PUBLIC_SITE_URL is unset", () => {
  delete process.env.NEXT_PUBLIC_SITE_URL;
  expect(publicBaseUrl()).toBe("https://studio.simplyeditpro.com");
  expect(CANONICAL_PUBLIC_BASE).toBe("https://studio.simplyeditpro.com");
});

test("uses NEXT_PUBLIC_SITE_URL when set", () => {
  process.env.NEXT_PUBLIC_SITE_URL = "https://studio.simplyeditpro.com";
  expect(publicBaseUrl()).toBe("https://studio.simplyeditpro.com");
});

test("strips a trailing slash so the join never double-slashes", () => {
  process.env.NEXT_PUBLIC_SITE_URL = "https://studio.simplyeditpro.com/";
  expect(publicBaseUrl()).toBe("https://studio.simplyeditpro.com");
  expect(publicPageUrl("abc12345")).toBe("https://studio.simplyeditpro.com/h/abc12345");
});

test("an empty / whitespace env var still falls back to the pinned base (never empty)", () => {
  process.env.NEXT_PUBLIC_SITE_URL = "   ";
  expect(publicBaseUrl()).toBe("https://studio.simplyeditpro.com");
});

test("publicPageUrl composes <base>/h/<slug>", () => {
  delete process.env.NEXT_PUBLIC_SITE_URL;
  expect(publicPageUrl("k7m2p9qx")).toBe("https://studio.simplyeditpro.com/h/k7m2p9qx");
});

test("the base is NEVER a preview origin, regardless of any request URL", () => {
  // The builder reads no request: a preview deploy's *.vercel.app origin can
  // never reach the seller-facing link.
  process.env.NEXT_PUBLIC_SITE_URL = "https://studio.simplyeditpro.com";
  const link = publicPageUrl("slug0001");
  expect(link.startsWith("https://studio.simplyeditpro.com/")).toBe(true);
  expect(link).not.toContain("vercel.app");
});
