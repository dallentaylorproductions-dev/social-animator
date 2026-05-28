import { NextResponse } from "next/server";
import { kv } from "@vercel/kv";
import { auth } from "@/lib/auth";
import { getMediaStorage } from "@/lib/media-storage";
import { loadAgentProfile } from "@/lib/entitlements/load-agent-profile";
import { resolveEntitlements } from "@/lib/entitlements/resolver";
import {
  videoUploadCap30d,
  VIDEO_UPLOAD_WINDOW_SECONDS,
} from "@/lib/entitlements/usage-caps";

/**
 * POST /api/upload-video (v1.47 / A7d.3.1 — client-direct).
 *
 * Walk-through video upload handshake. The browser uses
 * `@vercel/blob/client`'s `upload()` to push the file STRAIGHT to
 * Vercel Blob; this route's only job is to mint the short-lived
 * client token that authorizes that upload, bound to a folder + MIME
 * allowlist + size cap.
 *
 * --- Why client-direct (vs. POSTing the file through here) ---
 *
 * Vercel Functions cap incoming request bodies at ~4.5 MB. The
 * previous server-receive shape (A7d.3) sent the video as a multipart
 * body to this route, which 413'd every real phone clip (a 7-second
 * iPhone video already exceeds 4.5 MB; a 60-second one is 80–200 MB).
 * Client-direct uploads skip the Function entirely for the file
 * bytes, so the only ceiling is the token's own `maximumSizeInBytes`
 * (the new 250 MB cap below).
 *
 * --- Auth ---
 *
 * Mirrors /api/upload-image: a logged-in agent only. An unauthed
 * request gets 401 BEFORE a token is minted — no token leaks to
 * anonymous callers.
 *
 * --- Storage-adapter seam ---
 *
 * The actual handshake is delegated to `media-storage/index.ts` so a
 * future Cloudflare implementation (Stream direct-upload URL / R2
 * presigned PUT) drops in behind the same route without touching the
 * field or the wizard. See `media-storage/types.ts` for shape.
 *
 * --- Test-mode hooks (E2E only, never in production) ---
 *
 * Under NODE_ENV !== "production" && E2E_TESTING === "1" the route
 * honors three narrow opt-in headers so route-level Playwright specs
 * can exercise post-auth paths without a real session:
 *   - x-e2e-bypass: 1         — synthesizes a fake authed email so
 *     the auth gate passes. WITHOUT this header the route still
 *     performs the real auth() check, so the 401 contract stays
 *     testable from the same E2E run.
 *   - x-e2e-force-no-token: 1 — pretend BLOB_READ_WRITE_TOKEN is
 *     missing so the 503 branch is testable on a dev box that has
 *     a real token.
 *   - x-e2e-simulate: 1       — short-circuit a successful token
 *     issuance and return a fake `clientToken` without touching the
 *     adapter, so the success branch is testable without a real
 *     BLOB_READ_WRITE_TOKEN. The browser SDK contract path is what
 *     gets exercised here — actual byte uploads to Blob are out of
 *     scope for unit/route tests and covered by the real-deploy
 *     smoke (see Session Handoff).
 * The NODE_ENV gate makes the headers inert in any production build
 * even if E2E_TESTING ever leaked into a prod env.
 */
export const runtime = "nodejs";

/**
 * Server-enforced cap on the issued token's `maximumSizeInBytes`.
 * The client pre-checks against the same value before invoking
 * upload(); this constant is the abuse backstop. Real phone videos
 * (60–90 s, 1080p) typically land 80–200 MB unmodified — 250 MB
 * gives comfortable headroom without inviting multi-GB abuse.
 *
 * If this needs adjusting later, update the matching constant in
 * src/components/VideoUploadField.tsx so the client + server caps
 * stay aligned.
 */
export const MAX_VIDEO_BYTES = 250 * 1024 * 1024;

const ALLOWED_TYPES = [
  "video/mp4",
  "video/quicktime",
  "video/webm",
] as const;

/**
 * Folders the issued token is permitted to write into. Matches the
 * `folder` prop StepEditorial passes to the field. Adding a new
 * upload surface (e.g. a buyer-side video) means adding its folder
 * name here; without an entry, the adapter will reject the
 * handshake with a 4xx.
 */
const ALLOWED_FOLDERS = new Set<string>([
  "uploads",
  "seller-presentation-video",
]);

function isE2EBypassActive(): boolean {
  return (
    process.env.NODE_ENV !== "production" &&
    process.env.E2E_TESTING === "1"
  );
}

/**
 * The SDK posts a discriminated event: `blob.generate-client-token`
 * before the upload, `blob.upload-completed` after. Defaults to the
 * token event when the shape is unrecognized (matches the adapter's own
 * default-to-token-issuance behavior).
 */
function readEventType(body: unknown): string {
  return typeof body === "object" &&
    body !== null &&
    "type" in body &&
    typeof (body as { type: unknown }).type === "string"
    ? (body as { type: string }).type
    : "blob.generate-client-token";
}

export async function POST(req: Request) {
  const e2e = isE2EBypassActive();
  const e2eAuthBypass = e2e && req.headers.get("x-e2e-bypass") === "1";
  const e2eForceNoToken =
    e2e && req.headers.get("x-e2e-force-no-token") === "1";
  const e2eSimulate = e2e && req.headers.get("x-e2e-simulate") === "1";

  // --- Auth ---
  // Performed BEFORE body parsing so an unauthed request fails fast
  // and doesn't leak any signal about what the handshake expects.
  let email: string | null | undefined;
  if (e2eAuthBypass) {
    email = "e2e@test";
  } else {
    const session = await auth();
    email = session?.user?.email;
  }
  if (!email) {
    return NextResponse.json(
      { ok: false, error: "Not authenticated" },
      { status: 401, headers: { "Cache-Control": "no-store" } },
    );
  }

  // --- Body ---
  // The browser SDK posts JSON (a `blob.generate-client-token` event
  // before upload, or a `blob.upload-completed` event after). Bad
  // JSON is a 400; the adapter validates the actual shape.
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "Expected JSON body" },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }

  const eventType = readEventType(body);

  // --- Per-user video upload cap (rolling 30 days, by access mode) ---
  // Counted on the token-generation event only — the upload-completed
  // callback is a post-upload notification, not a new upload, so it must
  // not double-count. The cap fires here, before token issuance, so a
  // user at the limit never starts an upload. On KV failure the cap is
  // skipped (mirrors /api/comp-import) — auth + folder/MIME/size gates
  // still hold. Test-only override header lets the 429 path be asserted
  // offline without an exhaustible KV (NODE_ENV-gated, inert in prod).
  if (eventType === "blob.generate-client-token") {
    const testForceVideoCap =
      e2e && req.headers.get("x-e2e-force-video-cap") === "1";
    if (testForceVideoCap) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "You've reached your video upload limit for the month. Reach out if you need more capacity.",
        },
        { status: 429, headers: { "Cache-Control": "no-store" } },
      );
    }
    try {
      const ent = resolveEntitlements(await loadAgentProfile(email));
      const cap = videoUploadCap30d(ent.accessMode);
      const capKey = `video_upload_count:${email}:rolling30d`;
      const pipe = kv.pipeline();
      pipe.incr(capKey);
      pipe.expire(capKey, VIDEO_UPLOAD_WINDOW_SECONDS);
      const [used] = (await pipe.exec()) as [number, number];
      if (used > cap) {
        return NextResponse.json(
          {
            ok: false,
            error:
              "You've reached your video upload limit for the month. Reach out if you need more capacity.",
          },
          { status: 429, headers: { "Cache-Control": "no-store" } },
        );
      }
    } catch (err) {
      if (!e2e) console.warn("[upload-video] cap KV unavailable:", err);
    }
  }

  // --- Test-only simulated handshake ---
  // Runs BEFORE the storage-configured check because simulate mode
  // never touches the adapter — it has to be reachable on dev boxes
  // that don't have BLOB_READ_WRITE_TOKEN set. Mirrors the SDK
  // response shape so the field treats the response identically.
  if (e2eSimulate) {
    if (eventType === "blob.upload-completed") {
      return NextResponse.json(
        { type: "blob.upload-completed", response: "ok" },
        { headers: { "Cache-Control": "no-store" } },
      );
    }
    return NextResponse.json(
      {
        type: "blob.generate-client-token",
        clientToken: "e2e-simulated-token",
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  }

  // --- Storage configured? ---
  const storage = getMediaStorage();
  if (!storage.isConfigured() || e2eForceNoToken) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "Video upload is not configured on this environment (missing BLOB_READ_WRITE_TOKEN).",
      },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }

  // --- Delegate handshake to the adapter ---
  try {
    const result = await storage.handleClientUploadRequest({
      request: req,
      body,
      kind: "video",
      allowedFolders: ALLOWED_FOLDERS,
      allowedContentTypes: ALLOWED_TYPES,
      maximumSizeInBytes: MAX_VIDEO_BYTES,
    });
    return NextResponse.json(result, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Handshake failed";
    return NextResponse.json(
      { ok: false, error: message },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }
}
