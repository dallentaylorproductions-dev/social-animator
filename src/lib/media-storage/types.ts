/**
 * Media storage adapter — interface (v1.47 / A7d.3).
 *
 * The single seam between media uploads (images, video) and the
 * concrete blob host. The wizard's field components and the
 * /api/upload-* routes call the adapter; the adapter knows what to
 * do.
 *
 * Why a seam at all: the v1.47 SEP consumer page is 1:1 (low view
 * counts per page), so the dominant cost is per-file size × views.
 * Vercel Blob is fine for v1.47 launch but its egress pricing makes
 * larger fan-out painful. The substrate's eventual path is to swap
 * to Cloudflare R2 (near-zero egress) for files and Cloudflare
 * Stream for video. THIS interface is the only thing those
 * implementations need to satisfy — no wizard, page, or route caller
 * changes are required to flip a deployment over.
 *
 * Selection is process-wide and decided by the factory in
 * `./index.ts` from env (defaults to Vercel Blob). The 'kind' arg
 * lets a future implementation split the destination per media kind
 * (e.g. R2 for images, Stream for video) without changing the
 * caller contract.
 *
 * What this seam IS NOT: a video transcoding pipeline. The route +
 * the VideoUploadField enforce hard size + duration caps client-
 * side; real adaptive-bitrate / HLS comes "for free" once we adopt
 * Cloudflare Stream and replace the Vercel-Blob adapter. We
 * intentionally don't pull ffmpeg.wasm into the bundle to fake it.
 */

export type MediaKind = "image" | "video";

export interface UploadMediaInput {
  /** The bytes to upload. */
  file: File | Blob;
  /**
   * Subfolder under the adapter's namespace. Sanitized by the caller
   * (`^[a-z0-9_-]+$`) before reaching here, so the adapter can use it
   * verbatim in a pathname.
   */
  folder: string;
  /**
   * Media kind. Implementations MAY route different kinds to
   * different storage backends (e.g. images → R2, videos → Stream).
   * The default Vercel-Blob implementation treats all kinds the same.
   */
  kind: MediaKind;
  /** MIME type — the adapter sets the stored Content-Type from this. */
  contentType: string;
  /**
   * Filename extension (no leading dot, e.g. "mp4"). Used by the
   * adapter to compose the stored pathname.
   */
  extension: string;
}

export interface UploadMediaResult {
  /** Publicly fetchable URL — what the caller persists in the draft. */
  url: string;
}

export interface MediaStorageAdapter {
  /** Implementation name for logs / `/api/health` introspection. */
  readonly name: string;
  /**
   * True iff the adapter is configured (credentials present, etc.).
   * The route uses this to return a clean 503 instead of attempting
   * an upload that's certain to fail.
   */
  isConfigured(): boolean;
  upload(input: UploadMediaInput): Promise<UploadMediaResult>;
}
