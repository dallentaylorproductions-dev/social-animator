import { put } from "@vercel/blob";
import {
  handleUpload,
  type HandleUploadBody,
} from "@vercel/blob/client";
import type {
  ClientUploadHandshakeInput,
  ClientUploadHandshakeResult,
  MediaStorageAdapter,
  UploadMediaInput,
  UploadMediaResult,
} from "./types";

/**
 * Vercel Blob implementation of MediaStorageAdapter (v1.47 / A7d.3 →
 * A7d.3.1).
 *
 * Two upload paths, same backing store:
 *
 *   - `upload()` — server-side put (kept for parity with the image
 *     route + future batch jobs; not used by the video route after
 *     A7d.3.1).
 *
 *   - `handleClientUploadRequest()` — client-direct upload handshake.
 *     The browser calls `upload()` from `@vercel/blob/client`, which
 *     POSTs a small JSON envelope to /api/upload-video; this method
 *     unpacks that envelope, validates the pathname's folder, and
 *     mints a short-lived client token bound to the requested
 *     pathname + MIME + size cap. The actual file bytes are then
 *     streamed straight from the browser to Vercel Blob, bypassing
 *     Vercel's ~4.5 MB Function request-body limit (the platform
 *     ceiling that was 413'ing every real phone video on the old
 *     server-receive route).
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

  async handleClientUploadRequest(
    input: ClientUploadHandshakeInput,
  ): Promise<ClientUploadHandshakeResult> {
    return handleUpload({
      request: input.request,
      body: input.body as HandleUploadBody,
      onBeforeGenerateToken: async (pathname) => {
        // Lock the issued token to a known folder so a malicious
        // client can't write to arbitrary blob paths. The folder is
        // the FIRST path segment; pathname format is e.g.
        // "seller-presentation-video/1716480000000.mp4".
        const firstSegment = pathname.split("/")[0];
        if (!input.allowedFolders.has(firstSegment)) {
          throw new Error(
            `Folder not allowed for upload: ${firstSegment || "(empty)"}`,
          );
        }
        return {
          allowedContentTypes: [...input.allowedContentTypes],
          maximumSizeInBytes: input.maximumSizeInBytes,
          addRandomSuffix: true,
        };
      },
      // No-op: the browser receives the hosted URL synchronously from
      // upload()'s resolved value, so there is nothing for the server
      // to persist on upload-completed.
      onUploadCompleted: async () => {
        /* intentionally empty */
      },
    });
  }
}
