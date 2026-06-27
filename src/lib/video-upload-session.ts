"use client";

import { upload } from "@vercel/blob/client";

/**
 * Module-level walk-through video upload session (v1.47 / A7d.11).
 *
 * --- Why this exists ---
 *
 * The A7d.3 → A7d.8.5 walk-through video uploader held its in-flight
 * state (`uploading`, `progressPct`, `localObjectUrl`, the completion
 * handler) entirely inside `VideoUploadField`. Two real-deploy bugs
 * Dallen hit on 2026-05-24 share the same root: that state is local
 * React state, so any parent re-render that unmounts/remounts the
 * field — or any `onChange` arrow that captures stale closure values
 * from the parent's render — destroys or corrupts the in-flight
 * upload's view, even though the blob itself ALWAYS lands (the SDK
 * never sees an `abortSignal` from the field, so the network upload
 * is impossible to abort from React-side).
 *
 *   1. DESKTOP: the picker resets mid-upload without any user input —
 *      `uploading` and `localObjectUrl` go back to their initial
 *      `useState` values, the completed UI never shows.
 *   2. BOTH: editing sibling fields during the upload clobbers the
 *      user's edits because the OLD `setVideo` arrow captured stale
 *      `v` / `draft` from a previous render.
 *
 * --- The shape ---
 *
 * The upload session is a module-level singleton (keyed by a stable
 * "session key" — typically the field's Blob folder, e.g.
 * `seller-presentation-video`) that lives OUTSIDE the React tree.
 * `VideoUploadField` subscribes via `useSyncExternalStore` so it
 * always reads the live state regardless of mount/unmount, and the
 * completion path is consumed via an effect that uses a `setDraft`
 * functional updater (never a stale closure) so sibling-field edits
 * cannot clobber the upload's URL write-back.
 *
 * A second consequence: while a session is `uploading`, the parent
 * (StepEditorial) reads the same state and renders a brief, reliable
 * lock overlay across the rest of the step body — the user cannot
 * interrupt the in-flight upload by typing into another field. Dallen
 * 2026-05-24 chose this UX explicitly: the upload is quick, so a calm
 * brief lock is acceptable.
 *
 * --- Failure handling ---
 *
 * On error/timeout the session transitions to `failed` with an
 * `error` message. The field surfaces the error inline + offers a
 * retry; the parent unlocks the step (the user is NEVER trapped).
 * A `failed` session is reset to `idle` on the next `startVideoUpload`
 * (retry) or `resetVideoUploadSession` (Remove / step teardown).
 *
 * --- Lifecycle of `localObjectUrl` ---
 *
 * The local objectURL is created here (on `startVideoUpload`) and
 * lives in the session for the entire duration of the upload AND the
 * subsequent in-session preview (so the scrubber's fast random-access
 * seek keeps working until the user clicks Replace/Remove). It's
 * revoked exactly once — either when a new upload supersedes it
 * (Replace flow) or when `resetVideoUploadSession` is called (Remove
 * flow / page navigation if the parent chooses to tear it down).
 */

/**
 * A7d.13 — translate the @vercel/blob/client SDK's opaque token error
 * into a clear, actionable message (Dallen 2026-06-10 iOS bug).
 *
 * The SDK throws the literal string "Failed to retrieve the client
 * token" for ANY non-2xx from /api/upload-video — auth (401), cap
 * (429), unconfigured (503), bad body (400) — and DISCARDS the route's
 * JSON error body, so the precise reason can't reach the client through
 * the SDK. The single most likely cause on a real device (page loads,
 * upload fails) is an expired/absent session, so the rewritten message
 * leads with that while naming the other possibilities. The exact
 * server-side reason is in the Vercel runtime logs (see route.ts
 * A7d.13 logging).
 */
export function friendlyUploadError(err: unknown): string {
  const raw = err instanceof Error ? err.message : "Upload failed";
  if (/failed to\s+retrieve the client token/i.test(raw)) {
    // The SDK collapses every non-2xx handshake into this one opaque error, so we
    // can't name the exact cause here — present the real possibilities evenly
    // rather than over-attributing to an expired session (which mislabeled the
    // folder-allowlist failure). The precise reason is in the Vercel runtime logs.
    return "Couldn't start the upload. This can happen if the file is too large or an unsupported format, or if your session expired (refresh and sign in again). Try again, and if it keeps failing try a smaller file.";
  }
  return raw;
}

export type VideoUploadStatus = "idle" | "uploading" | "completed" | "failed";

export interface VideoUploadSessionState {
  status: VideoUploadStatus;
  /** 0–100 once the SDK has reported at least one progress event; null in the handshake / single-PUT prelude. */
  progressPct: number | null;
  /** Local objectURL of the picked File. Survives remount; revoked only on reset/Replace. */
  localObjectUrl: string | null;
  /** Hosted Blob URL once the upload resolves. */
  hostedUrl: string | null;
  /** Source video duration in seconds (read before upload). */
  durationSeconds: number | null;
  /** Human-readable error when `status === "failed"`. */
  error: string | null;
}

const IDLE_STATE: VideoUploadSessionState = {
  status: "idle",
  progressPct: null,
  localObjectUrl: null,
  hostedUrl: null,
  durationSeconds: null,
  error: null,
};

interface SessionInternal {
  state: VideoUploadSessionState;
  /**
   * Wired into @vercel/blob/client.upload(). The SDK supports an
   * abortSignal on its handshake fetches; we keep one per session so
   * the Replace flow can cleanly cancel an in-flight upload before
   * starting a new one. (The byte-stream PUT itself doesn't fully
   * honor the signal — Blob may still finish the write — but the
   * field's view-state contract is what matters here.)
   */
  abortController: AbortController;
  listeners: Set<() => void>;
}

const sessions = new Map<string, SessionInternal>();

function getOrInit(key: string): SessionInternal {
  let s = sessions.get(key);
  if (!s) {
    s = {
      state: { ...IDLE_STATE },
      abortController: new AbortController(),
      listeners: new Set(),
    };
    sessions.set(key, s);
  }
  return s;
}

function notify(s: SessionInternal): void {
  // Snapshot the listener set before iterating — a listener may
  // unsubscribe in response to the state change.
  for (const l of Array.from(s.listeners)) l();
}

function applyPatch(
  key: string,
  patch: Partial<VideoUploadSessionState>,
): void {
  const s = sessions.get(key);
  if (!s) return;
  s.state = { ...s.state, ...patch };
  notify(s);
}

/**
 * Synchronous read. `useSyncExternalStore`-compatible: returns the
 * same reference across calls until a notify fires, so React's
 * snapshot-stability invariant is satisfied.
 */
export function getVideoUploadSessionState(
  key: string,
): VideoUploadSessionState {
  return sessions.get(key)?.state ?? IDLE_STATE;
}

/**
 * Subscribe to session changes. Returns an unsubscribe fn that the
 * caller is responsible for cleaning up (the usual useSyncExternalStore
 * contract). Auto-initializes the session on first subscribe so the
 * subscribe-before-start ordering works.
 */
export function subscribeVideoUploadSession(
  key: string,
  listener: () => void,
): () => void {
  const s = getOrInit(key);
  s.listeners.add(listener);
  return () => {
    s.listeners.delete(listener);
  };
}

export interface StartVideoUploadOptions {
  /** Blob pathname under the folder (the SDK joins folder+filename). */
  pathname: string;
  contentType: string;
  /** Always `/api/upload-video` for the SP walk-through field. */
  handleUploadUrl: string;
  /** Threshold-gated by the caller. */
  multipart: boolean;
  /** Pre-read from the File's loadedmetadata. May be null on decode failure. */
  durationSeconds: number | null;
}

/**
 * Begin an upload. Idempotent against a stuck `uploading` state:
 * any prior in-flight session under the same key is aborted, its
 * objectURL revoked, and a new session takes its place. Returns the
 * promise so callers can `void` it (the session state is the source
 * of truth — the resolved value isn't read).
 */
export async function startVideoUpload(
  key: string,
  file: File,
  opts: StartVideoUploadOptions,
): Promise<void> {
  const existing = sessions.get(key);
  const preservedListeners = existing?.listeners ?? new Set<() => void>();

  if (existing) {
    if (existing.state.status === "uploading") {
      // Cancel the prior handshake; the abort propagates into the
      // SDK's fetch. Replace-while-uploading is rare but valid.
      try {
        existing.abortController.abort();
      } catch {
        // ignore — best-effort tear-down
      }
    }
    if (existing.state.localObjectUrl) {
      URL.revokeObjectURL(existing.state.localObjectUrl);
    }
  }

  const localObjectUrl = URL.createObjectURL(file);
  const session: SessionInternal = {
    state: {
      ...IDLE_STATE,
      status: "uploading",
      localObjectUrl,
      durationSeconds: opts.durationSeconds,
    },
    abortController: new AbortController(),
    listeners: preservedListeners,
  };
  sessions.set(key, session);
  notify(session);

  try {
    const result = await upload(opts.pathname, file, {
      access: "public",
      handleUploadUrl: opts.handleUploadUrl,
      contentType: opts.contentType,
      multipart: opts.multipart,
      // A7d.13 — thread the content type + size to the token route via
      // clientPayload PURELY for server-side diagnostics. The SDK's
      // token request otherwise carries NO content type, so without
      // this the route can't log what the phone actually sent. The
      // route ignores it for policy (the token's allowedContentTypes +
      // Blob's PUT-time check remain the single enforcement point), so
      // this is observe-only and changes no acceptance behavior.
      clientPayload: JSON.stringify({
        contentType: opts.contentType,
        size: file.size,
      }),
      abortSignal: session.abortController.signal,
      onUploadProgress: (e) => {
        if (
          typeof e?.percentage === "number" &&
          Number.isFinite(e.percentage)
        ) {
          // Guard against a stale callback resolving against a
          // session that's already been replaced under the key.
          const current = sessions.get(key);
          if (current !== session) return;
          const pct = Math.max(0, Math.min(100, e.percentage));
          applyPatch(key, { progressPct: pct });
        }
      },
    });
    const current = sessions.get(key);
    if (current !== session) {
      // We were superseded mid-upload. The new session owns the
      // listeners; the bytes we just uploaded land in Blob anyway —
      // a leaked successful upload is preferable to corrupting the
      // newer session's state with our stale completion.
      return;
    }
    if (!result.url || !/^https?:\/\//.test(result.url)) {
      throw new Error("Upload did not return a hosted URL");
    }
    applyPatch(key, {
      status: "completed",
      progressPct: 100,
      hostedUrl: result.url,
    });
  } catch (err) {
    const current = sessions.get(key);
    if (current !== session) return;
    applyPatch(key, {
      status: "failed",
      error: friendlyUploadError(err),
    });
  }
}

/**
 * Tear the session down completely. Aborts any in-flight upload,
 * revokes the local objectURL, and snaps state to `idle`. Use on
 * Remove (the user explicitly cleared the field) and on a session
 * that the parent has already consumed (e.g., post-completion, if
 * the parent decides to tear down the local preview).
 */
export function resetVideoUploadSession(key: string): void {
  const s = sessions.get(key);
  if (!s) return;
  if (s.state.status === "uploading") {
    try {
      s.abortController.abort();
    } catch {
      // ignore
    }
  }
  if (s.state.localObjectUrl) URL.revokeObjectURL(s.state.localObjectUrl);
  s.state = { ...IDLE_STATE };
  s.abortController = new AbortController();
  notify(s);
}
