/**
 * Media storage adapter — interface (v1.47 / A7d.3 → A7d.3.1).
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
 * --- Two upload modes ---
 *
 * 1. `upload(input)` — SERVER-SIDE upload: the caller hands the file
 *    bytes to the adapter, which writes them to the backing store.
 *    This works fine for SMALL files (the existing image route still
 *    uses `put()` directly, not this method — but the shape is here
 *    for future unification or for batch jobs that already have
 *    bytes in hand).
 *
 * 2. `handleClientUploadRequest(input)` — CLIENT-DIRECT upload
 *    handshake: the file does NOT pass through the server. Instead
 *    the route delegates a small JSON handshake to the adapter,
 *    which issues a short-lived credential the BROWSER then uses to
 *    upload the file directly to the storage provider. This bypasses
 *    the platform's request-body limit (Vercel Functions cap incoming
 *    request bodies at ~4.5 MB, which 413's every real phone video
 *    when the file is POSTed through the route — the bug A7d.3.1
 *    fixes).
 *
 * A Cloudflare implementation would satisfy the same shape:
 *   - For Stream: `handleClientUploadRequest` mints a one-time direct
 *     upload URL (POST /accounts/.../stream/direct_upload) and
 *     returns it; the browser uploads via tus.
 *   - For R2: `handleClientUploadRequest` returns a presigned PUT URL
 *     (S3-style) the browser uses to upload directly to R2.
 *
 * The route layer stays identical (auth → adapter handshake → JSON
 * response); only the adapter implementation differs.
 *
 * --- What this seam IS NOT ---
 *
 * A video transcoding pipeline. The route + the VideoUploadField
 * enforce hard size + duration caps client-side; real adaptive-
 * bitrate / HLS comes "for free" once we adopt Cloudflare Stream and
 * replace the Vercel-Blob adapter. We intentionally don't pull
 * ffmpeg.wasm into the bundle to fake it.
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

/**
 * Input for `handleClientUploadRequest` (A7d.3.1 — client-direct).
 *
 * The route has already done auth + storage-configured checks before
 * calling the adapter. The adapter's job is to translate the
 * provider-agnostic policy (allowedContentTypes, maximumSizeInBytes,
 * allowedFolders) into whatever the storage provider expects, and
 * return the protocol response the SDK on the browser is waiting for.
 */
export interface ClientUploadHandshakeInput {
  /**
   * The incoming Request — the adapter forwards this to whatever
   * helper the SDK provides (Vercel: `handleUpload({ request, … })`).
   */
  request: Request;
  /** Parsed JSON body, shape depends on the SDK protocol. */
  body: unknown;
  /** Media kind for routing/labeling in logs. */
  kind: MediaKind;
  /**
   * Folder names the issued credential is allowed to write into. The
   * adapter validates the pathname's first segment against this set;
   * anything else is rejected before a token is minted.
   */
  allowedFolders: ReadonlySet<string>;
  /** MIME allowlist baked into the issued credential. */
  allowedContentTypes: readonly string[];
  /** Hard upper bound on the uploaded file size (bytes). */
  maximumSizeInBytes: number;
}

/**
 * Result of `handleClientUploadRequest` — passed back through the
 * route to the browser SDK. Provider-specific shape (Vercel returns
 * `{ type: 'blob.generate-client-token', clientToken }` or
 * `{ type: 'blob.upload-completed', response: 'ok' }`); kept `unknown`
 * here so a Cloudflare implementation can return its own protocol's
 * shape without leaking Vercel types into the interface.
 */
export type ClientUploadHandshakeResult = unknown;

export interface MediaStorageAdapter {
  /** Implementation name for logs / `/api/health` introspection. */
  readonly name: string;
  /**
   * True iff the adapter is configured (credentials present, etc.).
   * The route uses this to return a clean 503 instead of attempting
   * an upload that's certain to fail.
   */
  isConfigured(): boolean;
  /** Server-side upload (file bytes in hand). */
  upload(input: UploadMediaInput): Promise<UploadMediaResult>;
  /**
   * Client-direct upload handshake. The browser SDK calls this route
   * to obtain a credential; the adapter forwards the response.
   * Throws if the request body / pathname / policy don't validate —
   * the route turns the throw into a 4xx.
   */
  handleClientUploadRequest(
    input: ClientUploadHandshakeInput,
  ): Promise<ClientUploadHandshakeResult>;
}
