import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Seller Presentation — A7d.11 walk-through video upload robustness
 * (Dallen 2026-05-24 real-deploy smoke).
 *
 * Two reported symptoms — both rooted in the same problem: the in-
 * flight upload's state lived in `useState` inside `VideoUploadField`,
 * and the completion handler (`onChange`) lived in a closure inside
 * `VideoEditor.setVideo` that captured `draft`/`v` from a render-time
 * snapshot. Any parent re-render that unmounted/remounted the field
 * lost the upload's in-flight view; any sibling-field edit during the
 * upload made the eventual completion's stale closure clobber the
 * user's typed values (or, in the worst-case mount race, the section
 * card closed and the completed UI never appeared at all). The blob
 * itself always lands — `@vercel/blob/client.upload()` never sees an
 * `abortSignal` from the field — so the bug was purely React-side
 * state loss.
 *
 * A7d.11 fix shape:
 *
 *   1. `src/lib/video-upload-session.ts` — a module-level singleton
 *      that owns `status / progressPct / localObjectUrl / hostedUrl /
 *      durationSeconds / error` for an upload, keyed by the field's
 *      Blob folder. Lives OUTSIDE the React tree, so any remount of
 *      the field or its parents reads the live state on next mount.
 *   2. `VideoUploadField.tsx` — subscribes via `useSyncExternalStore`,
 *      delegates the actual `upload()` call to the session module,
 *      fires onChange exactly once when the session reaches
 *      `completed` (gated by a ref so a `value`-feedback re-render
 *      can't re-fire). The auto first-frame capture also moved into
 *      a completion-watching effect so it survives a mid-upload
 *      remount.
 *   3. `StepEditorial.tsx` — subscribes to the same session so the
 *      video card stays open while an upload is in flight (the
 *      remount → `sectionsWithContent(draft) === []` path no longer
 *      collapses it) and renders a brief reliable LOCK overlay that
 *      makes the rest of the step `inert` so the user can't trigger
 *      the stale-closure race by typing during the upload.
 *   4. `page.tsx` — `setDraft` now accepts either a value or a
 *      functional updater, so completion handlers that fire long
 *      after their owning render can merge against the freshest
 *      draft instead of clobbering it.
 *
 * Why grep-pattern wiring tests (and not a full browser e2e of the
 * upload byte-stream): the byte upload goes straight to Vercel Blob,
 * which isn't reachable from the local dev server. Like the rest of
 * the A7d.* suite, the route handshake is e2e-tested separately,
 * the SDK contract is locked via package.json version + grep, and
 * the full upload's live behavior is verified by Dallen's real-
 * deploy smoke on the preview URL. The contracts asserted here are
 * what prevents a future commit from regressing into the pre-A7d.11
 * shape that broke on the real deploy.
 */

test.describe('A7d.11 — walk-through video upload survives parent re-renders', () => {
  test('upload state lives in a module-level session (not in VideoUploadField useState)', () => {
    const sessionSrc = readFileSync(
      resolve(process.cwd(), 'src/lib/video-upload-session.ts'),
      'utf8',
    );
    const fieldSrc = readFileSync(
      resolve(process.cwd(), 'src/components/VideoUploadField.tsx'),
      'utf8',
    );

    // The session module exists and exposes the subscribe/getState/start
    // shape required by useSyncExternalStore + the field's wiring.
    expect(sessionSrc).toMatch(/export\s+function\s+getVideoUploadSessionState/);
    expect(sessionSrc).toMatch(/export\s+function\s+subscribeVideoUploadSession/);
    expect(sessionSrc).toMatch(/export\s+async\s+function\s+startVideoUpload/);
    expect(sessionSrc).toMatch(/export\s+function\s+resetVideoUploadSession/);

    // The actual @vercel/blob upload call is in the session, not the field.
    expect(sessionSrc).toMatch(/from\s+["']@vercel\/blob\/client["']/);
    expect(fieldSrc).not.toMatch(/from\s+["']@vercel\/blob\/client["']/);

    // The field consumes the session via useSyncExternalStore — the
    // React 19 hook for snapshot-stable reads of an external store.
    expect(fieldSrc).toMatch(/useSyncExternalStore/);
    expect(fieldSrc).toMatch(
      /from\s+["']@\/lib\/video-upload-session["']/,
    );

    // The previous shape's in-flight state setters MUST be gone. If
    // any of these come back, the field has regressed to owning the
    // upload state and the desktop-remount bug returns.
    expect(fieldSrc).not.toMatch(/const\s+\[uploading,\s*setUploading\]\s*=\s*useState/);
    expect(fieldSrc).not.toMatch(/const\s+\[progressPct,\s*setProgressPct\]\s*=\s*useState/);
    expect(fieldSrc).not.toMatch(/setLocalObjectUrl\(/);
  });

  test('upload completion uses a ref to avoid stale-closure re-fire', () => {
    const fieldSrc = readFileSync(
      resolve(process.cwd(), 'src/components/VideoUploadField.tsx'),
      'utf8',
    );

    // The field stashes `onChange` in a ref and updates it on every
    // render so a long-deferred completion fires the LATEST handler,
    // not a stale snapshot. The fired-hostedUrl ref guards against
    // double-fire when `value` rounds back as the props update.
    expect(fieldSrc).toMatch(/onChangeRef\s*=\s*useRef\(onChange\)/);
    expect(fieldSrc).toMatch(/lastFiredHostedUrlRef/);
    // Completion path checks status === "completed" before firing.
    expect(fieldSrc).toMatch(/session\.status\s*===\s*["']completed["']/);
  });

  test('StepEditorial keeps the video card open during an in-flight upload (even after a remount)', () => {
    const stepSrc = readFileSync(
      resolve(
        process.cwd(),
        'src/tools/seller-presentation/components/StepEditorial.tsx',
      ),
      'utf8',
    );

    // The mount-time `useEffect` that derives `added` from
    // sectionsWithContent ALSO consults the session. Without this,
    // a remount of StepEditorial during an upload would derive an
    // empty set (draft.video is still undefined at upload start),
    // collapse the section, unmount VideoUploadField, and lose the
    // in-flight UI — exactly the desktop "picker resets" symptom.
    expect(stepSrc).toMatch(/getVideoUploadSessionState/);
    expect(stepSrc).toMatch(/initial\.add\(["']video["']\)/);

    // `isOpen` also OR's in the upload-in-flight signal so a stale
    // `added` set can't close the card mid-upload via any other path.
    expect(stepSrc).toMatch(
      /isOpen.*videoUploadInFlight|videoUploadInFlight.*isOpen/s,
    );
  });

  test('StepEditorial renders the brief reliable lock overlay while uploading + makes the rest of the step inert', () => {
    const stepSrc = readFileSync(
      resolve(
        process.cwd(),
        'src/tools/seller-presentation/components/StepEditorial.tsx',
      ),
      'utf8',
    );

    // The lock overlay is rendered conditionally on the upload session.
    expect(stepSrc).toMatch(/UploadingLockOverlay/);
    expect(stepSrc).toMatch(/data-testid="step-editorial-upload-lock"/);

    // The step body uses `inert` to disable interaction. This is the
    // mechanism Dallen chose 2026-05-24: a reliable brief lock so
    // edits during the upload can't trigger a re-render race.
    expect(stepSrc).toMatch(/inert=\{videoUploadInFlight\b/);
    expect(stepSrc).toMatch(/aria-busy=\{videoUploadInFlight\}/);

    // Calm voice in the user-facing lock copy: "walkthrough" (one
    // word, not "walk-through") + a non-shouty "Hold tight" line.
    expect(stepSrc).toContain('Uploading walkthrough video');
    expect(stepSrc).toContain('Hold tight');
  });

  test('VideoEditor completion path uses a FUNCTIONAL setDraft (no stale-closure clobber)', () => {
    const stepSrc = readFileSync(
      resolve(
        process.cwd(),
        'src/tools/seller-presentation/components/StepEditorial.tsx',
      ),
      'utf8',
    );

    // setVideo merges via the functional form so a completion handler
    // that fires after the user typed in title/runtime/recordedOn
    // composes onto the LATEST draft, not the one captured at the
    // start of the upload.
    expect(stepSrc).toMatch(/setDraft\(\(prev\)\s*=>/);
    // The previous shape's `setDraft({ ...draft, video: hasAny ? ... })`
    // pattern must NOT come back inside `setVideo`. Looser regex to
    // catch a careless revert.
    const setVideoBlock = stepSrc.match(
      /const\s+setVideo\s*=\s*\(patch:[\s\S]*?^\s\s\};/m,
    );
    expect(setVideoBlock).not.toBeNull();
    expect(setVideoBlock?.[0] ?? '').toMatch(/setDraft\(\(prev\)\s*=>/);
    expect(setVideoBlock?.[0] ?? '').not.toMatch(
      /setDraft\(\{\s*\.\.\.draft\s*,/,
    );
  });

  test('useSellerPresentationState setDraft accepts a functional updater', () => {
    // Phase A moved the WorkflowInstance state (incl. the functional
    // setDraft) out of page.tsx into this hook. The protective intent is
    // unchanged: the signature must stay value-or-function so the
    // VideoEditor's `setDraft((prev) => ...)` call type-checks and a
    // future "fix" can't revert to the value-only stale-closure shape.
    const hookSrc = readFileSync(
      resolve(
        process.cwd(),
        'src/tools/seller-presentation/hooks/useSellerPresentationState.ts',
      ),
      'utf8',
    );

    expect(hookSrc).toMatch(
      /\(prev:\s*SellerPresentationDraft\)\s*=>\s*SellerPresentationDraft/,
    );
    expect(hookSrc).toMatch(/typeof\s+next\s*===\s*["']function["']/);
  });
});
