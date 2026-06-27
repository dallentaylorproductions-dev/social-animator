import { NextResponse } from "next/server";
import { kv } from "@vercel/kv";
import { auth } from "@/lib/auth";
import { getMediaStorage } from "@/lib/media-storage";
import { VIDEO_CONTENT_TYPES } from "@/lib/media-storage/video-content-types";
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

/**
 * Accepted video MIME types, baked into the issued client token's
 * `allowedContentTypes` (Vercel Blob enforces it at PUT time). Imported
 * from the shared module so the client field's pre-flight guard and
 * this token can never drift. NOTE: the SDK does NOT send the content
 * type during token generation, so this list is irrelevant to the
 * "Failed to retrieve the client token" failure mode — see
 * video-content-types.ts.
 */
const ALLOWED_TYPES = VIDEO_CONTENT_TYPES;

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
  // The agent's reusable "sample video tour" (Settings prepared-invitation +
  // Studio Profile WorkFields). Same auth + token handshake + caps as the
  // seller-presentation video; it was simply never added here, so its handshake
  // was rejected ("Folder not allowed") and surfaced as a misleading session error.
  "agent-sample-video",
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

/**
 * A7d.13 — token-route diagnostics (Dallen 2026-06-10).
 *
 * The browser SDK collapses ANY non-2xx from this route (401 auth, 429
 * cap, 400 bad-body, 503 unconfigured, or a handshake throw) into the
 * single opaque client string "Failed to retrieve the client token."
 * That made the real-iPhone failure undiagnosable: desktop uploads
 * succeed, iPhone fails, same deployment — but the client never reveals
 * WHICH gate rejected. These helpers log the real reason server-side so
 * the next mobile attempt is readable in the Vercel runtime logs.
 *
 * The content type is logged from the SDK's `clientPayload` (the field
 * now threads `{ contentType, size }` through it) — NOT from any
 * token-time content-type check, because the SDK doesn't send the
 * content type at token time. Cookie PRESENCE (never the value) is the
 * key signal: a token request that arrives WITHOUT the Auth.js session
 * cookie is the smoking gun for the iOS failure, since the wizard page
 * itself loads fine on the phone.
 */
function requestDiag(req: Request): Record<string, unknown> {
  const h = req.headers;
  const cookie = h.get("cookie") ?? "";
  return {
    ua: (h.get("user-agent") ?? "").slice(0, 160),
    origin: h.get("origin"),
    referer: h.get("referer"),
    hasCookie: cookie.length > 0,
    // Auth.js v5 JWT session cookie, across the secure/non-secure +
    // chunked variants. Absent → the route will 401 even though the
    // user is "signed in" for page loads on the same host.
    hasSessionCookie:
      /(?:^|[;\s])(?:__Secure-|__Host-)?(?:authjs|next-auth)\.session-token(?:\.\d+)?=/.test(
        cookie,
      ),
  };
}

/**
 * Pull the diagnostic `{ contentType, size }` the field threads through
 * the SDK's `clientPayload`. Defensive: clientPayload is a free-form
 * string (or null) in the protocol, so anything unparseable yields an
 * empty object rather than throwing inside the handshake path.
 */
function readClientDiag(
  body: unknown,
): { contentType?: string; size?: number } {
  try {
    const payload = (body as { payload?: { clientPayload?: unknown } })
      ?.payload?.clientPayload;
    if (typeof payload !== "string") return {};
    const parsed = JSON.parse(payload) as {
      contentType?: unknown;
      size?: unknown;
    };
    return {
      contentType:
        typeof parsed.contentType === "string" ? parsed.contentType : undefined,
      size: typeof parsed.size === "number" ? parsed.size : undefined,
    };
  } catch {
    return {};
  }
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
  let authThrew = false;
  if (e2eAuthBypass) {
    email = "e2e@test";
  } else {
    try {
      const session = await auth();
      email = session?.user?.email;
    } catch (err) {
      // A7d.13 — a malformed/partial session cookie can make auth()
      // THROW rather than return null. Previously that surfaced as a
      // 500 (still opaque to the SDK); now we log it and fall through
      // to the same clear 401 so the failure mode is one diagnosable
      // path, not two.
      authThrew = true;
      console.error("[upload-video] auth() threw during token request:", err);
    }
  }
  if (!email) {
    // A7d.13 — THE prime diagnostic for the iOS bug. If this fires on a
    // real-phone attempt, the token request arrived without a valid
    // session (cookie missing/expired/threw) — NOT a content-type
    // problem. `hasSessionCookie:false` in this line pins the cause.
    console.warn("[upload-video] DENY 401 not-authenticated", {
      authThrew,
      ...requestDiag(req),
    });
    return NextResponse.json(
      {
        ok: false,
        error:
          "You're not signed in (or your session expired). Refresh the page, sign in again, then retry the upload.",
      },
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
        console.warn("[upload-video] DENY 429 cap-reached", {
          email,
          used,
          cap,
          ...requestDiag(req),
        });
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
    console.warn("[upload-video] DENY 503 not-configured", requestDiag(req));
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
  // A7d.13 — log the requested content type + size (threaded by the
  // field through clientPayload) on EVERY token request, success or
  // fail, so a real-phone attempt is fully readable in the runtime
  // logs even when the SDK shows only its generic error.
  const clientDiag = readClientDiag(body);
  try {
    const result = await storage.handleClientUploadRequest({
      request: req,
      body,
      kind: "video",
      allowedFolders: ALLOWED_FOLDERS,
      allowedContentTypes: ALLOWED_TYPES,
      maximumSizeInBytes: MAX_VIDEO_BYTES,
    });
    if (eventType === "blob.generate-client-token") {
      console.info("[upload-video] OK token issued", {
        email,
        ...clientDiag,
        ...requestDiag(req),
      });
    }
    return NextResponse.json(result, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (err) {
    // A7d.13 — the adapter's handleUpload() throws on a bad pathname/
    // folder (and would throw on a content-type/size policy violation
    // if the SDK ever sent those at token time). Log the REAL reason —
    // this is what the SDK swallows into "Failed to retrieve the
    // client token."
    const message = err instanceof Error ? err.message : "Handshake failed";
    console.error("[upload-video] DENY 400 handshake-rejected", {
      email,
      reason: message,
      ...clientDiag,
      ...requestDiag(req),
    });
    return NextResponse.json(
      { ok: false, error: message },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }
}
