import { test, expect } from "@playwright/test";

/**
 * Seller Presentation — COMP_PHOTOS (per-comp Street View auto-photo + manual
 * upload override). Pure-Node specs, repo convention (no Vitest).
 *
 * Coverage:
 *   - street-view helpers: metadata parse (covered / no-coverage / malformed),
 *     static + metadata URL building (key-gated), resolve via injected fetch.
 *   - serializer: the flag gates the per-comp photo emit (OFF => byte-identical
 *     to today); manual `photoUrl` + the Street View pano carry independently;
 *     the read clamp round-trips them and drops tampered values.
 *   - COMPLIANCE proof: only the pano id + coverage flag are ever persisted.
 *     No Google IMAGE url or bytes ever reach the serialized payload (the
 *     Static url is built at render, never stored).
 *
 * Google is never hit live — `resolveStreetViewMeta` takes an injected fetch
 * and the URL builders are pure string construction.
 */

import {
  parseStreetViewMetadata,
  streetViewStaticUrl,
  streetViewMetadataUrl,
  resolveStreetViewMeta,
  isCompPhotosEnabled,
  streetViewBrowserKey,
} from "../src/lib/seller-presentation/street-view";
import {
  toPublicPayload,
  clampPublicPayload,
  type PublicComp,
} from "../src/tools/seller-presentation/output/public-payload";
import type {
  Comp,
  SellerPresentationDraft,
} from "../src/tools/seller-presentation/engine/types";

const KEY_ENV = "NEXT_PUBLIC_GOOGLE_STREETVIEW_BROWSER_KEY";
const FLAG_ENV = "COMP_PHOTOS_ENABLED";
const TEST_KEY = "TEST_BROWSER_KEY_123";

// ---- fixtures: mock Google metadata responses --------------------------
const COVERED_META = {
  status: "OK",
  pano_id: "PANO_COVERED_ABC123",
  location: { lat: 47.25, lng: -122.44 },
  date: "2023-06",
  copyright: "© Google",
};
const ZERO_RESULTS_META = { status: "ZERO_RESULTS" };
const NOT_FOUND_META = { status: "NOT_FOUND" };

/** A Response-like stub for the injected fetch. */
function fakeFetch(body: unknown, ok = true): typeof fetch {
  return (async () =>
    ({
      ok,
      json: async () => body,
    }) as unknown as Response) as unknown as typeof fetch;
}

function draftWith(comps: Comp[]): SellerPresentationDraft {
  return {
    propertyAddress: "1 Test St",
    recommendedPrice: "$675,000",
    comps,
    pitchPoints: [],
  } as unknown as SellerPresentationDraft;
}

function withEnv(
  vars: Record<string, string | undefined>,
  fn: () => void | Promise<void>,
): void | Promise<void> {
  const prior: Record<string, string | undefined> = {};
  for (const k of Object.keys(vars)) {
    prior[k] = process.env[k];
    if (vars[k] === undefined) delete process.env[k];
    else process.env[k] = vars[k];
  }
  const restore = () => {
    for (const k of Object.keys(vars)) {
      if (prior[k] === undefined) delete process.env[k];
      else process.env[k] = prior[k];
    }
  };
  try {
    const r = fn();
    if (r instanceof Promise) return r.finally(restore);
    restore();
  } catch (e) {
    restore();
    throw e;
  }
}

/* ---- helpers: metadata parse ------------------------------------------- */
test.describe("street-view · parseStreetViewMetadata", () => {
  test("OK + pano_id => coverage", () => {
    expect(parseStreetViewMetadata(COVERED_META)).toEqual({
      panoId: "PANO_COVERED_ABC123",
      hasStreetView: true,
    });
  });

  test("ZERO_RESULTS / NOT_FOUND => no coverage", () => {
    expect(parseStreetViewMetadata(ZERO_RESULTS_META)).toEqual({
      hasStreetView: false,
    });
    expect(parseStreetViewMetadata(NOT_FOUND_META)).toEqual({
      hasStreetView: false,
    });
  });

  test("OK but missing/blank pano_id => no coverage", () => {
    expect(parseStreetViewMetadata({ status: "OK" })).toEqual({
      hasStreetView: false,
    });
    expect(parseStreetViewMetadata({ status: "OK", pano_id: "   " })).toEqual({
      hasStreetView: false,
    });
  });

  test("malformed / non-object => no coverage", () => {
    for (const v of [null, undefined, "OK", 42, [], { foo: "bar" }]) {
      expect(parseStreetViewMetadata(v)).toEqual({ hasStreetView: false });
    }
  });
});

/* ---- helpers: URL builders (key-gated) --------------------------------- */
test.describe("street-view · URL builders", () => {
  test("no key => null (degrades to no photo)", () => {
    void withEnv({ [KEY_ENV]: undefined }, () => {
      expect(streetViewBrowserKey()).toBeUndefined();
      expect(streetViewStaticUrl("PANO_X")).toBeNull();
      expect(streetViewMetadataUrl("1 Main St")).toBeNull();
    });
  });

  test("static url: pano + size + key, addressed by pano (never location)", () => {
    void withEnv({ [KEY_ENV]: TEST_KEY }, () => {
      const url = streetViewStaticUrl("PANO_X");
      expect(url).toBeTruthy();
      const u = new URL(url!);
      expect(u.origin + u.pathname).toBe(
        "https://maps.googleapis.com/maps/api/streetview",
      );
      expect(u.searchParams.get("pano")).toBe("PANO_X");
      expect(u.searchParams.get("size")).toBe("600x400");
      expect(u.searchParams.get("key")).toBe(TEST_KEY);
      // exact-coverage source: we address by pano, not by free-text location.
      expect(u.searchParams.get("location")).toBeNull();
    });
  });

  test("static url: blank pano => null", () => {
    void withEnv({ [KEY_ENV]: TEST_KEY }, () => {
      expect(streetViewStaticUrl(undefined)).toBeNull();
      expect(streetViewStaticUrl("   ")).toBeNull();
    });
  });

  test("metadata url: free endpoint with location + key", () => {
    void withEnv({ [KEY_ENV]: TEST_KEY }, () => {
      const url = streetViewMetadataUrl("1015 N Prospect St, Tacoma WA");
      const u = new URL(url!);
      expect(u.origin + u.pathname).toBe(
        "https://maps.googleapis.com/maps/api/streetview/metadata",
      );
      expect(u.searchParams.get("location")).toBe(
        "1015 N Prospect St, Tacoma WA",
      );
      expect(u.searchParams.get("key")).toBe(TEST_KEY);
    });
  });
});

/* ---- helpers: resolve via injected fetch (mock Google) ----------------- */
test.describe("street-view · resolveStreetViewMeta (mock Google)", () => {
  test("covered address => panoId + coverage", async () => {
    await withEnv({ [KEY_ENV]: TEST_KEY }, async () => {
      const meta = await resolveStreetViewMeta(
        "1015 N Prospect St",
        fakeFetch(COVERED_META),
      );
      expect(meta).toEqual({
        panoId: "PANO_COVERED_ABC123",
        hasStreetView: true,
      });
    });
  });

  test("no-coverage address => hasStreetView false, no pano", async () => {
    await withEnv({ [KEY_ENV]: TEST_KEY }, async () => {
      const meta = await resolveStreetViewMeta(
        "middle of nowhere",
        fakeFetch(ZERO_RESULTS_META),
      );
      expect(meta).toEqual({ hasStreetView: false });
    });
  });

  test("network throw / non-ok / no key => graceful no-coverage", async () => {
    await withEnv({ [KEY_ENV]: TEST_KEY }, async () => {
      const thrower = (async () => {
        throw new Error("CORS / network");
      }) as unknown as typeof fetch;
      expect(await resolveStreetViewMeta("x", thrower)).toEqual({
        hasStreetView: false,
      });
      expect(
        await resolveStreetViewMeta("x", fakeFetch(COVERED_META, false)),
      ).toEqual({ hasStreetView: false });
    });
    // No key => never even fetches.
    await withEnv({ [KEY_ENV]: undefined }, async () => {
      let called = false;
      const spy = (async () => {
        called = true;
        return { ok: true, json: async () => COVERED_META } as Response;
      }) as unknown as typeof fetch;
      expect(await resolveStreetViewMeta("x", spy)).toEqual({
        hasStreetView: false,
      });
      expect(called).toBe(false);
    });
  });
});

/* ---- flag gate --------------------------------------------------------- */
test.describe("street-view · isCompPhotosEnabled", () => {
  test("strict 'true' only", () => {
    void withEnv({ [FLAG_ENV]: "true" }, () =>
      expect(isCompPhotosEnabled()).toBe(true),
    );
    for (const v of ["false", "1", "TRUE", "", undefined]) {
      void withEnv({ [FLAG_ENV]: v }, () =>
        expect(isCompPhotosEnabled()).toBe(false),
      );
    }
  });
});

/* ---- serializer: flag gating + field carry ----------------------------- */
const photoComp: Comp = {
  address: "100 Manual Ave",
  soldPrice: "$700,000",
  photoUrl: "https://blob.example.com/comps/my-upload.jpg",
  counted: true,
};
const streetComp: Comp = {
  address: "200 Street View Rd",
  soldPrice: "$680,000",
  streetViewPanoId: "PANO_COVERED_ABC123",
  hasStreetView: true,
  counted: true,
};
const noCoverageComp: Comp = {
  address: "300 No Coverage Ln",
  soldPrice: "$650,000",
  hasStreetView: false,
  counted: true,
};

test.describe("public-payload · COMP_PHOTOS flag gate", () => {
  test("flag OFF => no photo keys emitted (current behavior)", () => {
    const p = toPublicPayload(
      draftWith([photoComp, streetComp, noCoverageComp]),
      {},
      {},
      {},
      false,
      {},
      false, // compPhotos OFF
    );
    for (const c of p.comps) {
      expect(c).not.toHaveProperty("photoUrl");
      expect(c).not.toHaveProperty("streetViewPanoId");
      expect(c).not.toHaveProperty("hasStreetView");
    }
  });

  test("flag OFF is byte-identical to a draft with NO photo data", () => {
    // The whole feature's promise: flag off == today. A draft carrying photo
    // data, projected with the flag off, must serialize identically to the
    // same comps stripped of every photo field.
    const withData = toPublicPayload(
      draftWith([photoComp, streetComp]),
      {},
      {},
      {},
      false,
      {},
      false,
    );
    const stripped = toPublicPayload(
      draftWith([
        { address: photoComp.address, soldPrice: photoComp.soldPrice, counted: true },
        { address: streetComp.address, soldPrice: streetComp.soldPrice, counted: true },
      ]),
      {},
      {},
      {},
      false,
      {},
      false,
    );
    expect(JSON.stringify(withData)).toBe(JSON.stringify(stripped));
  });

  test("flag ON: manual photoUrl carries; manual takes precedence intent", () => {
    const p = toPublicPayload(draftWith([photoComp]), {}, {}, {}, false, {}, true);
    expect(p.comps[0].photoUrl).toBe(photoComp.photoUrl);
    expect(p.comps[0]).not.toHaveProperty("streetViewPanoId");
  });

  test("flag ON: Street View coverage carries pano + flag, no photoUrl", () => {
    const p = toPublicPayload(draftWith([streetComp]), {}, {}, {}, false, {}, true);
    expect(p.comps[0].streetViewPanoId).toBe("PANO_COVERED_ABC123");
    expect(p.comps[0].hasStreetView).toBe(true);
    expect(p.comps[0]).not.toHaveProperty("photoUrl");
  });

  test("flag ON: resolved no-coverage carries hasStreetView=false, no pano", () => {
    const p = toPublicPayload(
      draftWith([noCoverageComp]),
      {},
      {},
      {},
      false,
      {},
      true,
    );
    expect(p.comps[0].hasStreetView).toBe(false);
    expect(p.comps[0]).not.toHaveProperty("streetViewPanoId");
  });

  test("flag ON but no photo data on the comp => no photo keys (byte-identical)", () => {
    const plain: Comp = { address: "9 Plain St", soldPrice: "$1", counted: true };
    const on = toPublicPayload(draftWith([plain]), {}, {}, {}, false, {}, true);
    const off = toPublicPayload(draftWith([plain]), {}, {}, {}, false, {}, false);
    expect(JSON.stringify(on)).toBe(JSON.stringify(off));
  });
});

/* ---- serializer: read clamp round-trip --------------------------------- */
test.describe("public-payload · clampPublicComp carries + sanitizes", () => {
  test("photo fields round-trip through the read clamp", () => {
    const published = toPublicPayload(
      draftWith([photoComp, streetComp, noCoverageComp]),
      {},
      {},
      {},
      false,
      {},
      true,
    );
    const reclamped = clampPublicPayload(
      JSON.parse(JSON.stringify(published)),
    );
    const byAddr = (a: string) =>
      reclamped.comps.find((c) => c.address === a) as PublicComp;
    expect(byAddr("100 Manual Ave").photoUrl).toBe(photoComp.photoUrl);
    expect(byAddr("200 Street View Rd").streetViewPanoId).toBe(
      "PANO_COVERED_ABC123",
    );
    expect(byAddr("200 Street View Rd").hasStreetView).toBe(true);
    expect(byAddr("300 No Coverage Ln").hasStreetView).toBe(false);
  });

  test("tampered photo fields are dropped at the read boundary", () => {
    const tampered = clampPublicPayload({
      templateVersion: 2,
      comps: [
        {
          address: "evil",
          soldPrice: "$1",
          photoUrl: 42, // non-string
          streetViewPanoId: { nope: true }, // non-string
          hasStreetView: "true", // non-boolean
        },
      ],
    });
    const c = tampered.comps[0];
    expect(c).not.toHaveProperty("photoUrl");
    expect(c).not.toHaveProperty("streetViewPanoId");
    expect(c).not.toHaveProperty("hasStreetView");
  });
});

/* ---- COMPLIANCE: only pano id + coverage persisted --------------------- */
test.describe("public-payload · COMPLIANCE (no Google imagery persisted)", () => {
  test("serialized payload carries ONLY the pano id, never an image url/bytes", () => {
    void withEnv({ [KEY_ENV]: TEST_KEY }, () => {
      const published = toPublicPayload(
        draftWith([streetComp, noCoverageComp]),
        {},
        {},
        {},
        false,
        {},
        true,
      );
      const json = JSON.stringify(published);
      // The pano id (the one exempt datum) IS present.
      expect(json).toContain("PANO_COVERED_ABC123");
      // NO Street View image url, host, or endpoint is ever baked in. The
      // Static url is built only at render time from the pano id + key.
      expect(json).not.toContain("maps.googleapis.com");
      expect(json).not.toContain("streetview");
      expect(json).not.toContain(TEST_KEY);
      expect(json).not.toContain("data:image");
    });
  });
});
