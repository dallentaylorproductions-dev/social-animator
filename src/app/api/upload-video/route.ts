import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getMediaStorage } from "@/lib/media-storage";

/**
 * POST /api/upload-video (v1.47 / A7d.3).
 *
 * Camera-roll → hosted video URL for the Seller Presentation
 * walk-through. Auth-gated, MIME-allowlisted, hard size-capped.
 * Writes through the media-storage adapter
 * (`src/lib/media-storage/`) so the Vercel-Blob → Cloudflare-R2 /
 * Stream swap is a single drop-in replacement — no caller changes.
 *
 * Hard caps (mirror VideoUploadField's client-side caps; the route
 * is the backstop):
 *   - MIME: video/mp4, video/quicktime (.mov), video/webm
 *   - Body: 75 MiB (margin-safe per the v1.47 ratio: SEP pages are
 *     1:1, so per-file size × views is the cost; 75 MiB at 1-view
 *     average dominates and is the budget Dallen greenlit)
 *
 * Body (multipart/form-data):
 *   file       — the video File (camera-roll capture)
 *   folder?    — optional subfolder, [a-z0-9_-]+ (default "uploads")
 *
 * Response shape mirrors /api/upload-image so the wizard treats
 * both routes interchangeably client-side.
 *
 * --- Test-mode hooks (E2E only, never in production) ---
 * Under NODE_ENV !== "production" && E2E_TESTING === "1" the route
 * honors three narrow opt-in headers so route-level Playwright
 * specs can exercise post-auth paths without a real session:
 *   - x-e2e-bypass: 1           — synthesizes a fake authed email so
 *     the auth gate passes. WITHOUT this header the route still
 *     performs the real auth() check, so the 401 contract stays
 *     testable from the same E2E run.
 *   - x-e2e-force-no-token: 1   — pretend BLOB_READ_WRITE_TOKEN is
 *     missing so the 503 branch is testable on a dev box that has
 *     a real token.
 *   - x-e2e-simulate: 1         — short-circuit a successful upload
 *     and return a fake hosted URL without touching the adapter, so
 *     the success branch is testable without writing to real Blob.
 * The NODE_ENV gate makes the headers inert in any production build
 * even if E2E_TESTING ever leaked into a prod env.
 */
export const runtime = "nodejs";

const ALLOWED_TYPES = new Set([
  "video/mp4",
  "video/quicktime",
  "video/webm",
]);

export const MAX_VIDEO_BYTES = 75 * 1024 * 1024;

const FOLDER_RE = /^[a-z0-9_-]+$/;

function isE2EBypassActive(): boolean {
  return (
    process.env.NODE_ENV !== "production" &&
    process.env.E2E_TESTING === "1"
  );
}

export async function POST(req: Request) {
  const e2e = isE2EBypassActive();
  const e2eAuthBypass = e2e && req.headers.get("x-e2e-bypass") === "1";
  const e2eForceNoToken =
    e2e && req.headers.get("x-e2e-force-no-token") === "1";
  const e2eSimulate = e2e && req.headers.get("x-e2e-simulate") === "1";

  // --- Auth ---
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
  // Parse + validate the request BEFORE checking storage config, so a
  // malformed request gets a precise 4xx instead of a generic 503
  // that hides what was actually wrong. The 503 still wins when the
  // request is well-formed but the env can't fulfill it.
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json(
      { ok: false, error: "Expected multipart/form-data" },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }

  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json(
      { ok: false, error: "No file in request" },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }

  if (!ALLOWED_TYPES.has(file.type)) {
    return NextResponse.json(
      { ok: false, error: `Unsupported video type: ${file.type || "unknown"}` },
      { status: 415, headers: { "Cache-Control": "no-store" } },
    );
  }

  if (file.size > MAX_VIDEO_BYTES) {
    return NextResponse.json(
      {
        ok: false,
        error: `Video too large (${file.size} bytes). Maximum ${MAX_VIDEO_BYTES} bytes.`,
      },
      { status: 413, headers: { "Cache-Control": "no-store" } },
    );
  }

  const folderRaw = form.get("folder");
  const folder =
    typeof folderRaw === "string" && FOLDER_RE.test(folderRaw)
      ? folderRaw
      : "uploads";

  // --- Test-only simulated upload (E2E hosted-URL success path) ---
  // Runs BEFORE the storage-configured check because simulate mode
  // never touches the adapter — it has to be reachable on dev boxes
  // that don't have BLOB_READ_WRITE_TOKEN set.
  if (e2eSimulate) {
    const ext = extensionForType(file.type);
    const url = `https://blob.example.com/${folder}/e2e-${Date.now()}.${ext}`;
    return NextResponse.json(
      { ok: true, url },
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

  // --- Real upload ---
  try {
    const ext = extensionForType(file.type);
    const { url } = await storage.upload({
      file,
      folder,
      kind: "video",
      contentType: file.type,
      extension: ext,
    });
    return NextResponse.json(
      { ok: true, url },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Upload failed";
    return NextResponse.json(
      { ok: false, error: message },
      { status: 502, headers: { "Cache-Control": "no-store" } },
    );
  }
}

function extensionForType(type: string): string {
  switch (type) {
    case "video/mp4":
      return "mp4";
    case "video/quicktime":
      return "mov";
    case "video/webm":
      return "webm";
    default:
      return "bin";
  }
}
