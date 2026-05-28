import { VercelBlobAdapter } from "./vercel-blob";
import type { MediaStorageAdapter } from "./types";

export type { MediaStorageAdapter, MediaKind, UploadMediaInput, UploadMediaResult } from "./types";

/**
 * Media-storage adapter selector (v1.47 / A7d.3).
 *
 * Process-wide singleton chosen from `MEDIA_STORAGE_PROVIDER`. The
 * full Cloudflare swap is two edits — a new implementation file
 * and an extra branch here — touching no callers, no fields, no
 * wizard, no page.
 *
 *   MEDIA_STORAGE_PROVIDER=vercel-blob  (default)
 *   MEDIA_STORAGE_PROVIDER=cloudflare-r2 (future)
 *   MEDIA_STORAGE_PROVIDER=cloudflare-stream (future, video-only)
 */
function buildAdapter(): MediaStorageAdapter {
  const provider = process.env.MEDIA_STORAGE_PROVIDER ?? "vercel-blob";
  switch (provider) {
    case "vercel-blob":
      return new VercelBlobAdapter();
    default:
      // Unknown provider: fail loud at startup rather than silently
      // dropping to Vercel Blob, which would mask a config error in
      // an environment that meant to use something else.
      throw new Error(
        `Unknown MEDIA_STORAGE_PROVIDER: ${provider}. Expected "vercel-blob".`,
      );
  }
}

let adapter: MediaStorageAdapter | null = null;

export function getMediaStorage(): MediaStorageAdapter {
  if (!adapter) {
    adapter = buildAdapter();
  }
  return adapter;
}
