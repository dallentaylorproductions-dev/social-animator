import { put } from "@vercel/blob";
import type {
  MediaStorageAdapter,
  UploadMediaInput,
  UploadMediaResult,
} from "./types";

/**
 * Vercel Blob implementation of MediaStorageAdapter (v1.47 / A7d.3).
 *
 * Treats every kind the same — writes to public Blob with a random
 * suffix on the supplied folder pathname. Mirrors the conventions
 * the existing /api/upload-image route used directly (the route
 * still does, by Dallen's explicit "don't refactor that" pin).
 *
 * Configured-ness check reads BLOB_READ_WRITE_TOKEN at call time
 * (not at module load) so a missing-in-preview / present-in-prod
 * environment doesn't permanently latch a stale answer.
 */
export class VercelBlobAdapter implements MediaStorageAdapter {
  readonly name = "vercel-blob";

  isConfigured(): boolean {
    return Boolean(process.env.BLOB_READ_WRITE_TOKEN);
  }

  async upload(input: UploadMediaInput): Promise<UploadMediaResult> {
    const pathname = `${input.folder}/${Date.now()}.${input.extension}`;
    const { url } = await put(pathname, input.file, {
      access: "public",
      addRandomSuffix: true,
      contentType: input.contentType,
    });
    return { url };
  }
}
