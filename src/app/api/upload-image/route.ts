import { NextResponse } from "next/server";
import { put } from "@vercel/blob";
import { auth } from "@/lib/auth";

/**
 * POST /api/upload-image (v1.47 / A7c.2).
 *
 * Reusable, auth-gated image upload to Vercel Blob. Built for the
 * Seller Presentation hero photo + agent headshot (A7c.2 wiring), but
 * generic enough for any tool that wants a phone-camera-roll → hosted
 * URL flow. A7d will reuse this for the editorial photo + video poster;
 * other tools (OH Prep / SIR / Listing Flyer / brand logo) adopt it
 * opportunistically when next touched.
 *
 * The component (src/components/ImageUploadField.tsx) downscales the
 * source image client-side (canvas → JPEG, longest edge ~1600px,
 * quality 0.82) so uploads stay small. This route is the dumb thin
 * server-side: prove auth, write to Blob, return URL.
 *
 * Body (multipart/form-data):
 *   file       — the image File (already downscaled by the client)
 *   folder?    — optional subfolder name (defaults to "uploads").
 *                Only [a-z0-9_-]+ — the route sanitizes before
 *                composing the pathname, so a malicious value can't
 *                traverse out of the blob store.
 *
 * Response:
 *   { ok: true, url } — the hosted Blob URL, store this in your draft.
 *   { ok: false, error } — anything else.
 *
 * The MIME-type allowlist + the 8 MiB body cap are defense in depth
 * against an authed user uploading garbage. Real downscale happens
 * client-side, so 8 MiB is generous — a downscaled JPEG at longest-
 * edge 1600 / quality 0.82 lands ~150–400 KiB on iPhone photos.
 *
 * Why public access: the published consumer page is unauthenticated;
 * a buyer viewing /h/[slug] needs to fetch the image. Each blob's URL
 * is unguessable (Blob adds a random suffix by default), so this is
 * the same security posture as the existing publish flow's KV records.
 */
export const runtime = "nodejs";

const ALLOWED_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
]);

const MAX_BYTES = 8 * 1024 * 1024;

const FOLDER_RE = /^[a-z0-9_-]+$/;

export async function POST(req: Request) {
  const session = await auth();
  const email = session?.user?.email;
  if (!email) {
    return NextResponse.json(
      { ok: false, error: "Not authenticated" },
      { status: 401, headers: { "Cache-Control": "no-store" } },
    );
  }

  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "Image upload is not configured on this environment (missing BLOB_READ_WRITE_TOKEN).",
      },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }

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
      { ok: false, error: `Unsupported image type: ${file.type || "unknown"}` },
      { status: 415, headers: { "Cache-Control": "no-store" } },
    );
  }

  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      {
        ok: false,
        error: `Image too large (${file.size} bytes). Maximum ${MAX_BYTES} bytes.`,
      },
      { status: 413, headers: { "Cache-Control": "no-store" } },
    );
  }

  const folderRaw = form.get("folder");
  const folder =
    typeof folderRaw === "string" && FOLDER_RE.test(folderRaw)
      ? folderRaw
      : "uploads";

  const ext = extensionForType(file.type);
  const pathname = `${folder}/${Date.now()}.${ext}`;

  try {
    const { url } = await put(pathname, file, {
      access: "public",
      addRandomSuffix: true,
      contentType: file.type,
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
    case "image/jpeg":
      return "jpg";
    case "image/png":
      return "png";
    case "image/webp":
      return "webp";
    case "image/heic":
      return "heic";
    case "image/heif":
      return "heif";
    default:
      return "bin";
  }
}
