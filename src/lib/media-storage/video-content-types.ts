/**
 * Single source of truth for the walk-through video upload's accepted
 * MIME types (v1.47 / A7d.3.1; extracted A7d.13).
 *
 * Shared by BOTH sides of the client-direct upload so they can never
 * drift:
 *   - the client field (src/components/VideoUploadField.tsx) — the
 *     pre-flight guard that blocks an unsupported file BEFORE invoking
 *     `@vercel/blob/client`'s upload();
 *   - the token route (src/app/api/upload-video/route.ts) — the list is
 *     baked into the issued client token's `allowedContentTypes`, which
 *     Vercel Blob enforces at PUT time.
 *
 * Why ONE list matters for the iOS bug surface (Dallen 2026-06-10):
 * the SDK's token-generation request does NOT carry the file's content
 * type — it only sends `{ pathname, clientPayload, multipart }`. So the
 * content type is NEVER what causes "Failed to retrieve the client
 * token" (that string means the token POST returned a non-2xx). A
 * disallowed content type instead surfaces LATER as a PUT-time failure
 * with a different message. Keeping the client guard and the server
 * token bound to the same list means an accepted client file is always
 * an accepted token type, so a content-type mismatch can't sneak in
 * between the two layers.
 *
 * iOS camera-roll clips are `video/quicktime` (.MOV); desktop exports
 * are typically `video/mp4`. BOTH have been in this list since the
 * original v1.47 cutover — this is why the iOS upload failure is NOT a
 * content-type problem.
 */
export const VIDEO_CONTENT_TYPES = [
  "video/mp4",
  "video/quicktime",
  "video/webm",
] as const;

export type VideoContentType = (typeof VIDEO_CONTENT_TYPES)[number];

/**
 * True iff `type` is one of the accepted walk-through video MIME types.
 * An empty/blank/odd type (which iOS can occasionally hand the File
 * API) returns false — the caller decides how to handle that (the
 * client field shows a plain-language "try MP4, MOV, or WebM" hint).
 */
export function isAllowedVideoContentType(type: string): boolean {
  return (VIDEO_CONTENT_TYPES as readonly string[]).includes(type);
}
