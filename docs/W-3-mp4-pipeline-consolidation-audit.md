# W-3.1 — MP4 pipeline consolidation audit

**Date:** 2026-05-14
**Branch:** `phase-w3-1-mp4-pipeline-audit` (cut from `2dd0552` / v1.41)
**Status:** Investigation-only; audit-first gate per CONTEXT.md §6.

---

## TL;DR — what the data says

**The H-7.14 audit's framing was directionally right but technically incomplete.** It described the divergence as "Listing Flyer + OH Promo use ffmpeg.wasm; Social Animator uses MediaRecorder." Reading the code in detail: **all three paths use ffmpeg.wasm.** The actual divergence is in *what gets fed to ffmpeg* — Listing Flyer / OH Promo run a frame-by-frame PNG-sequence encode (the expensive path); Social Animator hands ffmpeg a pre-recorded WebM blob and asks for a container re-mux + normalization (the cheap path). Same ffmpeg, very different workloads.

**The consolidation is more localized than the H-7.14 audit suggested.** The "frame-by-frame" code lives in exactly one function — `renderFrameByFrame` in [src/engine/frame-render.ts:190-363](src/engine/frame-render.ts#L190-L363). The MediaRecorder path already exists in the same file as `renderViaMediaRecorder` ([src/engine/frame-render.ts:124-181](src/engine/frame-render.ts#L124-L181)) and is the iOS Safari branch. Routing desktop through the same function the iOS branch already uses is the entire refactor — no new modules, no new abstractions.

**Social Animator is already on the target shape and doesn't need to change.** Its [`ExportButton.tsx`](src/components/ExportButton.tsx) calls `recordCanvas` + `webmToMp4` directly from `src/engine/export.ts` — same two helpers `renderViaMediaRecorder` wraps. So the W-3.2 refactor unifies LF + OHP onto the same building blocks Social Animator already uses, just with the LF-specific warmup/heartbeat preserved.

**Expected outcome:** Listing Flyer MP4 Reel drops from ~88s to ~17-25s on Mac Chrome (per H-7.14 measurements of Social Animator's pipeline, which the LF path would inherit). OH Promo similar. The `renderFrameByFrame` function (~175 lines) and its supporting helpers (`createRenderCanvas`, `canvasToBlob`, `frameFilename`, `cleanupFrameFiles`, plus the `MAX_FRAME_SLOTS` constant) can be deleted outright. The iOS Safari branch becomes the only branch. ~200 lines of code deletion against maybe ~10 lines of restructuring — a strongly net-negative diff.

---

## 1. Methodology

Read the following files in full or in relevant sections:

- [src/engine/export.ts](src/engine/export.ts) (lines 1-429) — the two universal helpers (`recordCanvas`, `webmToMp4`) + `getFFmpeg` + delivery helpers
- [src/engine/frame-render.ts](src/engine/frame-render.ts) (lines 1-446) — the routing function for LF/OHP MP4
- [src/tools/listing-flyer/engine/render-mp4.ts](src/tools/listing-flyer/engine/render-mp4.ts) (lines 1-122) — LF-specific `renderTimelineToWebm` (rAF loop + heartbeat + warmup hold)
- [src/tools/open-house-promo/engine/render-mp4.ts](src/tools/open-house-promo/engine/render-mp4.ts) (lines 1-243) — OH Promo's `renderPromoMp4` wrapper that calls `renderTimelineToMp4`
- [src/components/ExportButton.tsx](src/components/ExportButton.tsx) (lines 1-180) — Social Animator's per-template export entry point
- [src/app/listing-flyer/ExportButtons.tsx](src/app/listing-flyer/ExportButtons.tsx) (lines 180-390) — LF MP4 handler in the user-facing form
- [src/app/open-house-promo/ExportButtons.tsx](src/app/open-house-promo/ExportButtons.tsx) (lines 196-369) — OH Promo MP4 handler
- [src/tools/listing-flyer/engine/template-mapping.ts](src/tools/listing-flyer/engine/template-mapping.ts) (full) — `mapFlyerToShowcase` (the v1.39.2 translator)
- [docs/H-7.14-render-perf-audit.md](docs/H-7.14-render-perf-audit.md) — reference perf data

Grepped for `ffmpeg`, `MediaRecorder`, `captureStream`, `webmToMp4`, `recordCanvas`, `renderTimelineToMp4`, `renderFrameByFrame`, `renderTimelineToWebm` across `src/` to confirm no other code paths exist.

Excluded from this audit:

- Individual `src/templates/*.ts` build() functions — they paint into a canvas, agnostic to which encoder downstream reads from it. The refactor doesn't touch them.
- PDF / JPEG / QR export paths — out of scope; W-3.2 is MP4 only.
- The Canvas component ([src/engine/canvas.tsx](src/engine/canvas.tsx)) — it's the live-preview player used by all four tools' editors; only referenced from MP4 paths via `canvasRef` passing.

---

## 2. Listing Flyer + OH Promo MP4 pipeline — current state

### 2.1 Listing Flyer entry chain

User clicks "Export MP4 / Reel / Square" in the Listing Flyer form. The handler at [src/app/listing-flyer/ExportButtons.tsx:180-390](src/app/listing-flyer/ExportButtons.tsx#L180-L390) iterates the user-selected sizes ([reel 1080×1920, square 1080×1080]) and for each one calls:

```ts
// src/app/listing-flyer/ExportButtons.tsx:344-351
const mp4 = await renderTimelineToMp4(
  canvas,
  timeline,
  { width: sz.width, height: sz.height },
  draft.duration,
  state.background ?? "#0a0a0a",
  (p) => { /* progress dispatch */ }
);
```

The `state` + `timeline` are produced upstream from `mapFlyerToShowcase(draft, photos, brand, brandLogoImg)` — the same translator we patched in v1.39.2 to fix the bullet regression — followed by `listingShowcaseTemplate.build(state, size, assets)` which returns the Timeline.

### 2.2 OH Promo entry chain

Almost identical shape. OH Promo wraps the engine call in its own `renderPromoMp4` ([src/tools/open-house-promo/engine/render-mp4.ts:70-208](src/tools/open-house-promo/engine/render-mp4.ts#L70-L208)) that does the same pre-cropping work + builds a Timeline via `buildPromoTimeline`, then:

```ts
// src/tools/open-house-promo/engine/render-mp4.ts:195-207
return renderTimelineToMp4(canvas, timeline, size, durationSec, background, (p) => { ... });
```

OH Promo's [ExportButtons.tsx:346](src/app/open-house-promo/ExportButtons.tsx#L346) calls `renderPromoMp4` once per selected aspect ratio. Same end behavior as LF.

### 2.3 The routing function (`renderTimelineToMp4`)

Both LF and OHP funnel into one function:

```ts
// src/engine/frame-render.ts:97-116
export async function renderTimelineToMp4(
  canvas: HTMLCanvasElement,
  timeline: Timeline,
  size: { width: number; height: number },
  durationSec: number,
  background: string,
  onProgress?: (p: FrameRenderProgress) => void
): Promise<Blob> {
  if (isIOSSafari()) {
    return renderViaMediaRecorder(canvas, timeline, size, durationSec, background, onProgress);
  }
  return renderFrameByFrame(timeline, size, durationSec, background, onProgress);
}
```

iOS Safari → MediaRecorder path. Everything else → frame-by-frame path.

### 2.4 The frame-by-frame path (the slow one)

`renderFrameByFrame` at [src/engine/frame-render.ts:190-363](src/engine/frame-render.ts#L190-L363):

1. Create an `OffscreenCanvas` (with `<canvas>` fallback) at the target dimensions ([line 200](src/engine/frame-render.ts#L200))
2. Load ffmpeg.wasm via `getFFmpeg()` ([line 207](src/engine/frame-render.ts#L207))
3. Clean up any leftover frame files in ffmpeg's virtual FS ([line 222](src/engine/frame-render.ts#L222))
4. **For each of `durationSec * 30` frames** (240–450 frames typical):
   - `ctx.fillRect` + `timeline.render(t, ctx)` to paint the frame ([lines 246-251](src/engine/frame-render.ts#L246-L251))
   - `canvasToBlob(canvas, "image/png")` — PNG-encode the frame ([line 255](src/engine/frame-render.ts#L255))
   - `ffmpeg.writeFile(frame_NNNNN.png, buffer)` — write to wasm FS ([line 258](src/engine/frame-render.ts#L258))
   - Every 30th frame, also encode a JPEG q=0.6 thumbnail for the live preview UI ([lines 265-273](src/engine/frame-render.ts#L265-L273))
   - Yield to the event loop every 5 frames ([lines 288-290](src/engine/frame-render.ts#L288-L290))
5. After the loop, invoke ffmpeg to encode the PNG sequence ([lines 304-324](src/engine/frame-render.ts#L304-L324)):
   ```
   ffmpeg -framerate 30 -i frame_%05d.png \
     -c:v libx264 -profile:v high -preset medium -crf 18 \
     -pix_fmt yuv420p -movflags +faststart output.mp4
   ```
6. Read `output.mp4` from wasm FS, wrap as a Blob ([lines 328-336](src/engine/frame-render.ts#L328-L336))
7. Clean up: delete all PNG frame files + output.mp4 ([lines 347-352](src/engine/frame-render.ts#L347-L352))

**Where the time goes** (per H-7.14 §4):
- PNG encoding per frame: 52-59ms avg on Mac Chrome at 1080×1350. Across 240 frames that's ~13s of PNG work attributed to `frame-capture-loop`.
- `ffmpeg-encode` (the PNG-sequence-to-MP4 step): 84% of total time, ~70s+. The encoder is reading 240+ PNGs and re-encoding each, single-threaded, JS-wasm.

### 2.5 The iOS path (the existing MediaRecorder path)

`renderViaMediaRecorder` at [src/engine/frame-render.ts:124-181](src/engine/frame-render.ts#L124-L181):

1. Call `renderTimelineToWebm(canvas, timeline, ...)` ([line 152](src/engine/frame-render.ts#L152)) — this is in `src/tools/listing-flyer/engine/render-mp4.ts` (despite the directory naming; it's a generic helper). That function:
   - Sets canvas dimensions ([render-mp4.ts:29-30](src/tools/listing-flyer/engine/render-mp4.ts#L29-L30))
   - Starts a rAF loop painting `timeline.render(animT, ctx)` every frame, plus a "heartbeat pixel" trick to keep iOS Safari's `captureStream` happy during static holds ([render-mp4.ts:64-114](src/tools/listing-flyer/engine/render-mp4.ts#L64-L114))
   - Calls `recordCanvas(canvas, seconds, 30, onProgress, warmupMs, onPreview)` ([render-mp4.ts:118](src/tools/listing-flyer/engine/render-mp4.ts#L118)) which uses MediaRecorder + canvas.captureStream
2. The returned WebM (or MP4 on iOS Safari native MediaRecorder) blob feeds into `webmToMp4(webm, size, durationSec, ..., getWarmupMs())` ([line 171](src/engine/frame-render.ts#L171))
3. `webmToMp4` ([src/engine/export.ts:262-357](src/engine/export.ts#L262-L357)) does a single-pass re-encode via ffmpeg:
   ```
   ffmpeg -i input.<ext> -ss <warmupSec> \
     -vf "tpad=stop_mode=clone:stop_duration=<dur>,scale=...,pad=..." \
     -t <dur> -r 30 -c:v libx264 -profile:v high \
     -preset ultrafast -crf 18 -pix_fmt yuv420p -movflags +faststart \
     output.mp4
   ```
   Note `-preset ultrafast` (the iOS / MediaRecorder path) vs `-preset medium` (the frame-by-frame path). The MediaRecorder path uses ultrafast because the input already encodes the frames; ffmpeg is doing a transcode + trim + pad, not a from-scratch encode.

### 2.6 The warmup + heartbeat — LF/OHP-specific quirks

The MediaRecorder path holds the animation timeline at t=0 for `warmupMs` (1.5s desktop, 5.5s mobile per [src/engine/export.ts:31-35](src/engine/export.ts#L31-L35)) before letting it advance. This is to absorb iOS Safari's slow captureStream startup. A "heartbeat pixel" — `ctx.fillRect(frameCount % 2, 0, 1, 1)` with a varying gray value — runs every frame to defeat encoder dedup of static frames ([render-mp4.ts:86-88](src/tools/listing-flyer/engine/render-mp4.ts#L86-L88)).

These two mechanisms are LF/OHP-specific (Social Animator doesn't have them). They exist because:
- LF/OHP entries land within the first ~3.3s of the animation — losing those to a slow capture start would gut the export
- iOS Safari is the worst offender

`webmToMp4` then trims `-ss <warmupSec>` to remove the held-at-t=0 prefix from the final output ([export.ts:312-317](src/engine/export.ts#L312-L317)).

### 2.7 State management for LF / OHP MP4

- **Brand colors:** Read via `useBrandSettings` in the page; merged into `state` before timeline build.
- **Listing data:** Read from the page-level draft (for LF: `listingFlyer:draft` localStorage; for OHP: `openHousePromo:draft`).
- **Photos:** Translated through `mapFlyerToShowcase` (LF) / `preBlurFillLayered` + `preCropToCanvas` (OHP) before timeline build. Both compose photos onto the canvas via `drawImage` inside the timeline's per-frame paint.

The v1.39.2 bullet regression originated here: `mapFlyerToShowcase` emitted the legacy `statusColor` / `featureColor` / etc. names, but the migrated `listingShowcaseTemplate.build()` read the new `state.primary` / `state.accent` names. The MP4 path was the only consumer that hit this translator — the PDF path uses a parallel React-PDF document and was unaffected.

---

## 3. Social Animator MP4 pipeline — current state

### 3.1 Entry chain

User clicks "Export MP4" in any Social Animator template editor. The Canvas live-preview is already painting via rAF (it's the editor's interactive preview). The handler at [src/components/ExportButton.tsx:76-97](src/components/ExportButton.tsx#L76-L97):

```ts
const handleExportMp4 = async () => {
  const perfRun = startRun({ ... });
  try {
    const ffmpegPromise = measurePhase(PHASE_NAMES.FFMPEG_LOAD, () => getFFmpeg());
    setState({ kind: "recording", progress: 0 });
    const webm = await measurePhase(PHASE_NAMES.RECORDER_ACTIVE, () => doRecord());
    setState({ kind: "converting", progress: 0 });
    await ffmpegPromise;
    const mp4 = await measurePhase(PHASE_NAMES.RECORDER_FINALIZE, () =>
      webmToMp4(webm, size, duration, (progress) =>
        setState({ kind: "converting", progress })
      )
    );
    await finishWithBlob(mp4, `${filename}.mp4`);
  } catch (err) { ... } finally { endRun(perfRun); }
};
```

Where `doRecord()` ([ExportButton.tsx:47-60](src/components/ExportButton.tsx#L47-L60)) is:

```ts
const doRecord = async (): Promise<Blob> => {
  const canvas = canvasRef.current;
  if (!canvas) throw new Error("Canvas is not ready yet.");
  onStartRecording?.();
  // Two frames for React commit + Canvas re-init at t=0
  await new Promise<void>((r) => requestAnimationFrame(() => r()));
  await new Promise<void>((r) => requestAnimationFrame(() => r()));
  return recordCanvas(canvas, duration, 30, (progress) =>
    setState({ kind: "recording", progress })
  );
};
```

So Social Animator's pipeline is, end-to-end:

1. The Canvas live-preview is already painting (managed by [src/engine/canvas.tsx](src/engine/canvas.tsx))
2. Two rAF ticks of warmup ([ExportButton.tsx:54-55](src/components/ExportButton.tsx#L54-L55)) — enough for React commit + Canvas re-init at t=0, very different from LF/OHP's full warmup
3. `recordCanvas(canvas, duration, 30, onProgress)` ([ExportButton.tsx:72](src/components/ExportButton.tsx#L72)) — captures the live canvas via MediaRecorder for `duration` seconds, returns the WebM (or native MP4 on iOS)
4. `webmToMp4(webm, size, duration, onProgress)` — same transcode as LF/OHP's iOS path, with `warmupMs=0` (no trim needed since there's no warmup hold)
5. Final blob → `finishWithBlob` → either auto-download (desktop) or wait-for-tap (mobile)

### 3.2 What's missing vs LF/OHP MediaRecorder path

- **No separate hidden canvas.** Social Animator captures the visible live-preview canvas. LF/OHP has a hidden 1×1 canvas at `position: fixed; left: -9999` that gets resized to the export dimensions, repainted, and captured.
- **No warmup phase.** Two rAFs vs 1.5s (desktop) / 5.5s (mobile). Social Animator scenes are designed to play in 8-12s and the canvas is already warm from being the live preview, so there's no captureStream startup gap to absorb.
- **No heartbeat pixel.** Social Animator's templates have continuous animation (Ken Burns, badge pop-ins, type-on, etc.), so encoder dedup of static frames isn't a concern.
- **iOS-agnostic.** No `isIOSSafari()` branching — `recordCanvas` itself adapts MIME candidates for iOS native MP4 encoding ([export.ts:97-112](src/engine/export.ts#L97-L112)). iOS works on the same code path as desktop.

### 3.3 Per-template state

Each template's state initializes from `FieldDef.default` + (optionally) the shared `socanim_listing_profile` localStorage for `listing-card` + `listing-showcase`. Brand colors resolve via [src/templates/brand-slots.ts](src/templates/brand-slots.ts)'s `resolveBrandColors` — the same path the live preview uses. No translator in between like LF's `mapFlyerToShowcase`; the editor's `state` IS the template state.

---

## 4. Shared vs different — line-referenced breakdown

### 4.1 Already shared

| Capability | Location | Used by |
|---|---|---|
| ffmpeg.wasm lazy loading | [src/engine/export.ts:44-59](src/engine/export.ts#L44-L59) (`getFFmpeg`) | All three paths |
| MediaRecorder capture | [src/engine/export.ts:76-256](src/engine/export.ts#L76-L256) (`recordCanvas`) | Social Animator directly; LF/OHP via the iOS branch + `renderTimelineToWebm` |
| WebM/MP4 → normalized MP4 transcode | [src/engine/export.ts:262-357](src/engine/export.ts#L262-L357) (`webmToMp4`) | Social Animator directly; LF/OHP via the iOS branch |
| Mobile detection | [src/engine/export.ts:426-429](src/engine/export.ts#L426-L429) (`isMobileDevice`) | All paths |
| Warmup constant + lookup | [src/engine/export.ts:31-36](src/engine/export.ts#L31-L36) | LF/OHP only (Social Animator passes `warmupMs=0`) |
| Download + share delivery | [src/engine/export.ts:371-423](src/engine/export.ts#L371-L423) (`downloadBlob`, `shareOrDownload`) | All paths |
| iOS Safari detection | [src/engine/frame-render.ts:79-86](src/engine/frame-render.ts#L79-L86) (`isIOSSafari`) | Routing in `renderTimelineToMp4` only — Social Animator doesn't need it because both branches lead to the same code |
| Brand color resolution | [src/templates/brand-slots.ts](src/templates/brand-slots.ts) (`resolveBrandColors`) | All four tools' canvases |
| Photo decoding (raw File → HTMLImageElement) | per-tool (LF uses `waitForPhoto`; OHP uses `srcToImage`; SA uses `useListingProfile` materialization) | Per tool — minor duplication, but unrelated to MP4 |

### 4.2 Different

| Behavior | LF + OHP path | Social Animator path |
|---|---|---|
| Render canvas | Hidden 1×1 DOM canvas, resized at export time | The visible live-preview canvas, sized by the editor |
| Painting cadence | rAF loop inside `renderTimelineToWebm` (iOS path) OR synchronous for-loop in `renderFrameByFrame` (desktop) | rAF loop owned by the Canvas component (always live) |
| Encoder backend | `renderFrameByFrame`: PNG-sequence ffmpeg encode (240+ PNGs in JS, then ffmpeg's `medium` preset) | `recordCanvas` → MediaRecorder (native browser encoder) → `webmToMp4` ffmpeg transcode (`ultrafast` preset, single-pass) |
| Warmup mechanism | 1.5-5.5s held at t=0 + heartbeat pixel + ffmpeg `-ss` trim | None — two rAF ticks |
| Routing branch | `isIOSSafari` decides MediaRecorder vs frame-by-frame | None — one code path |
| Total wall-clock at typical inputs (Mac Chrome) | ~88s P50 (LF MP4 Reel, 5 photos), ~34s (OHP MP4 Reel, 0 photos) per H-7.14 §4 | ~17s cold (Social Animator listing-carousel MP4) per H-7.14 §4 |

**The structural difference is one routing decision in [frame-render.ts:105-114](src/engine/frame-render.ts#L105-L114).** Everything downstream of "use MediaRecorder" already exists. The frame-by-frame branch is unique to that one function.

---

## 5. Proposed consolidation plan

### 5.1 Target architecture

Single MP4 path for all four tools, all platforms:

```
  user clicks Export MP4
    ↓
  (per tool: build Timeline + sized hidden canvas if not visible)
    ↓
  renderTimelineToWebm(canvas, timeline, size, durationSec, background,
                      onProgress, warmupMs, onPreview)
    ↓ (MediaRecorder, ~real-time)
  webmToMp4(webm, size, durationSec, onProgress, warmupMs)
    ↓ (single-pass ffmpeg transcode, ~5-15s on Mac Chrome)
  delivered as MP4 blob
```

Social Animator already follows this pattern with `warmupMs=0` and `onPreview=undefined`. LF + OHP keep their existing `warmupMs=getWarmupMs()` to preserve the iOS captureStream startup absorption.

### 5.2 Specific code changes

**Delete:**

- [src/engine/frame-render.ts](src/engine/frame-render.ts) lines 183-446: `renderFrameByFrame` + `createRenderCanvas` + `canvasToBlob` + `frameFilename` + `cleanupFrameFiles` + `MAX_FRAME_SLOTS` constant. ~265 lines.
- The `isIOSSafari()` function ([frame-render.ts:72-86](src/engine/frame-render.ts#L72-L86)) — no callers remain after the branch is gone. ~15 lines.
- The frame-by-frame architecture doc-comment ([frame-render.ts:14-53](src/engine/frame-render.ts#L14-L53)) — describes a path being removed. ~40 lines.

**Modify:**

- [src/engine/frame-render.ts:97-116](src/engine/frame-render.ts#L97-L116) — `renderTimelineToMp4` collapses from branching dispatcher to a one-line wrapper around `renderViaMediaRecorder`'s body. Or inline it entirely — the wrapper exists only because of the historical branching.
- [src/engine/frame-render.ts:124-181](src/engine/frame-render.ts#L124-L181) — `renderViaMediaRecorder` becomes the only renderer; its body moves into `renderTimelineToMp4` directly OR is renamed. Either way, no behavioral change for callers.
- Comments in [src/tools/open-house-promo/engine/render-mp4.ts:188-207](src/tools/open-house-promo/engine/render-mp4.ts#L188-L207) updated to reflect the single path (the existing comment talks about "iOS routes through MediaRecorder; everything else routes through frame-by-frame" — that's no longer true post-consolidation).
- The `frame-render-loop` / `frame-capture-loop` / `ffmpeg-encode` perf phase names in [src/lib/perf.ts](src/lib/perf.ts) ([PHASE_NAMES](src/lib/perf.ts) constants) become dead code if `renderFrameByFrame` is deleted. Remove them along with the function.
- The W-2 perf instrumentation wrapping inside `renderFrameByFrame` (the `measurePhase` calls around the frame loop) is deleted with the function.

**Does NOT need to change:**

- Social Animator (any of it). [src/components/ExportButton.tsx](src/components/ExportButton.tsx) already calls `recordCanvas` + `webmToMp4` directly and bypasses `renderTimelineToMp4`. The refactor is invisible to it.
- The MediaRecorder helpers (`recordCanvas`, `webmToMp4`) themselves — they already do the right thing for all platforms.
- The Listing Flyer translator [src/tools/listing-flyer/engine/template-mapping.ts](src/tools/listing-flyer/engine/template-mapping.ts) — already patched in v1.39.2; refactor doesn't touch it. (Worth noting: the structural risk of parallel-path divergence is REDUCED by the refactor since one code path replaces two.)
- LF + OHP template `build()` functions in [src/templates/listing-showcase.ts](src/templates/listing-showcase.ts) etc. — they paint into the canvas the same way regardless of encoder.
- The live-preview Canvas component [src/engine/canvas.tsx](src/engine/canvas.tsx).
- All W-2 tests — they assert size + extension + (for Social Animator) ~30s wall-clock. LF/OHP MP4 tests will pass faster after the change.

### 5.3 Estimated scope

~265 lines deleted, ~10 lines modified, 0 lines added. Net change: **~-255 LOC.**

Single prompt for W-3.2 is appropriate. The work is concentrated in one file (`frame-render.ts`) and one call site (`renderTimelineToMp4`); fan-out is small.

### 5.4 What stays in place but becomes dead code (deferred cleanup)

The H-7.14 perf instrumentation that wraps the frame-by-frame phases will have no remaining consumers. The phase constants in [src/lib/perf.ts](src/lib/perf.ts) (`FRAME_RENDER_LOOP`, `FRAME_CAPTURE_LOOP`, `FFMPEG_ENCODE`, `FFMPEG_LOAD`) can be removed in the same commit OR deferred. Recommend removing in the same commit — leaving instrumentation pointing at deleted code paths invites confusion in future audits.

---

## 6. Risks to validate during W-3.2

### 6.1 MP4 visual quality / codec parameters

**Risk:** The frame-by-frame path uses `-preset medium -crf 18` on a PNG-sequence input. The MediaRecorder path uses `-preset ultrafast -crf 18` on an already-encoded WebM input. The post-consolidation output may differ in:

- File size (MediaRecorder path is sometimes 10-30% smaller for matched perceptual quality due to the input already being H.264-encoded; that re-encode is lossy + cumulative)
- Sharpness on text-heavy frames (badge text, address) — VP8/VP9 → H.264 transcode may soften 1px-wide text edges visibly
- Banding on subtle gradients (sky in hero photos, etc.) — the source WebM is 4 Mbps which may show ringing the PNG-source encode doesn't have

**What catches it:** Nothing automated today. W-2's MP4 file-level tests assert size 50KB-50MB, which the consolidated output will comfortably hit. The W-2 visual snapshot tests run on PDF + JPEG, not MP4.

**Mitigation:** Manual smoke comparison required. Recommended W-3.2 acceptance test: export a 5-photo LF MP4 Reel and a 0-photo OH Promo MP4 Reel before + after the refactor; open both side-by-side in QuickTime, scrub through the address-reveal and feature-bullet animations specifically. If text edges or feature bullets look softer post-refactor, the `ultrafast` preset may need to upgrade to `fast` (a 2-3x slowdown on the ffmpeg transcode step — but the transcode step is still ~5-10s, so adjusting is cheap). The CRF 18 setting stays.

### 6.2 File size shift may exit the W-2 test bounds

**Risk:** W-2 file-level tests assert `50_000 < size < 50_000_000`. Real Listing Flyer MP4 Reel from the frame-by-frame path measures 2-6 MB. MediaRecorder-recorded WebM at 4 Mbps is about half that (1-3 MB). After ffmpeg transcode at `ultrafast`, the output is likely 1-4 MB. Still inside bounds — but the lower bound is comfortably distant; the upper bound might brush 50 MB on a 15s reel with a lot of motion.

**What catches it:** W-2 tests will fail if size leaves the range. CI will block the merge. Loosening bounds is a one-line change in each `.spec.ts` if needed.

**Mitigation:** Run the suite locally before opening the W-3.2 PR; adjust bounds in the same commit if they trip. Snapshot baselines are unaffected (they're PDF/JPEG only).

### 6.3 iOS Safari behavior

**Risk:** iOS Safari already runs on the MediaRecorder path today (via the `isIOSSafari()` branch). Post-consolidation it runs on the SAME path. Theoretically zero risk — but:

- `isIOSSafari()` returns true → before refactor, the code goes through `renderViaMediaRecorder` → after refactor, it goes through the same logic (just no longer behind a branch)
- The mobile-vs-desktop distinction inside `recordCanvas` ([export.ts:97-112](src/engine/export.ts#L97-L112)) — MIME candidate order — still respects `isMobileDevice()` which iOS triggers. No change.

**What catches it:** Manual smoke test on a real iPhone. The Social Animator export ALSO runs on iOS today, so any iOS-specific MediaRecorder breakage would already have surfaced on those tools.

**Mitigation:** None needed. The path being consolidated to is the path iOS already runs.

### 6.4 Parallel-path drift (the v1.39.2 bullet-regression risk)

**Risk:** The W-3.2 refactor reduces the number of MP4 code paths from 2 → 1. This makes the bullet-regression class MORE difficult to reintroduce, not less. Specifically:

- v1.39.2 broke because Listing Flyer's `mapFlyerToShowcase` translator emitted legacy field names but the migrated `listing-showcase.build()` read new ones. The MP4 path (which went through the translator) broke; the PDF path (which uses a parallel React-PDF document) did not.
- Post-refactor, the translator path is unchanged; it's still the layer between the LF draft and the listing-showcase build. The refactor only changes what happens to the CANVAS output, not how state flows in.
- BUT: post-refactor, the MP4 visual output is produced by recording the same canvas that the live preview uses. If a translator bug breaks the canvas paint, the live preview will visibly break — which means the bug is much more likely to be caught at development time before the export is even tested.

**What catches it:** W-2 visual snapshot tests on PDF + JPEG (already armed). Live-preview canvas inspection during development (now-easier with the refactor).

**Mitigation:** No new test needed for this risk class — the refactor improves the situation.

### 6.5 Per-tool customizations missed in the refactor

**Risk:** The frame-by-frame path may do something the MediaRecorder path doesn't. Specifically check:

- **OffscreenCanvas usage** ([frame-render.ts:381-407](src/engine/frame-render.ts#L381-L407)): the frame-by-frame path renders to OffscreenCanvas when available, which has slightly different `imageSmoothingQuality` defaults than DOM canvas. The MediaRecorder path captures the visible DOM canvas. **Possible quality variance.** Validate by exporting the same LF flyer pre + post refactor and comparing the address-line typography.
- **PNG-sequence color reproduction**: PNG is lossless. WebM (VP9 at 4 Mbps) is lossy. The MediaRecorder path adds one lossy step the frame-by-frame path doesn't have. Subtle gradient banding is the most likely failure mode. **Same mitigation as 6.1.**
- **Frame timing precision**: The frame-by-frame path renders exactly `durationSec * 30` frames at exactly the right timestamps. MediaRecorder records real-time and depends on rAF actually firing at 60 Hz. If the browser tab is throttled (backgrounded), frame timing drifts. **Existing behavior** — Social Animator has lived with this for the entire product lifetime; LF/OHP would inherit it. The user-visible symptom is "the MP4 plays slightly faster or slower than expected if the browser was lagging during capture." Acceptable given the 4-5x speedup.

### 6.6 Memory pressure changes

**Risk:** The frame-by-frame path holds 240-450 PNG buffers in ffmpeg.wasm's heap simultaneously (per [frame-render.ts:36-40](src/engine/frame-render.ts#L36-L40) — ~225-900 MB working set). The MediaRecorder path holds a single growing WebM buffer that's typically 1-3 MB.

**Net effect:** Memory pressure DECREASES post-refactor. No risk; this is a side benefit.

---

## 7. Test strategy under existing W-2 coverage

| Test | Affected by W-3.2? | What it asserts | Will it pass post-refactor? |
|---|---|---|---|
| smoke.spec.ts | No | Marketing page loads | Pass |
| listing-flyer PDF (visual snapshot) | No | PDF page 1 pixel-diff vs golden | Pass |
| listing-flyer JPEG (visual snapshot) | No | JPEG pixel-diff vs golden | Pass |
| listing-flyer MP4 reel | YES | Size 50KB-50MB, .mp4 extension | Probably pass; size lower bound is the only risk (typical MediaRecorder reel ~1-3 MB, well above 50KB floor) |
| listing-flyer MP4 square | YES | Same as reel | Same |
| oh-promo PDF / JPEG / QR (snapshots) | No | Pixel-diff vs golden | Pass |
| oh-promo MP4 reel / square | YES | Size 50KB-50MB | Same as LF — size bounds likely accommodate |
| listing-presentation PDF / JPEG (snapshots) | No | Pixel-diff vs golden | Pass |
| social-animator listing-carousel MP4 | No | Already on the target path; no change | Pass |
| social-animator listing-showcase MP4 | No | Same | Pass |

**Recommended NEW automated test for W-3.2:**

- **MP4 first-frame visual snapshot.** Extract the first non-warmup frame of an LF MP4 (via ffmpeg on the test side, or Playwright's video frame extraction) and pixel-diff against a golden. Catches MP4-specific visual regressions (bullet color drift, text rendering shift) that the PDF/JPEG snapshots don't see.
- **Optional:** add it to LF + OHP only (Social Animator already runs through the same pipeline so visual coverage is implicit in the LF/OHP tests). Keep tolerance loose (`threshold: 0.3, maxDiffPixelRatio: 0.10`) — the MediaRecorder encoder's frame timing variance and the heartbeat pixel ([render-mp4.ts:86-88](src/tools/listing-flyer/engine/render-mp4.ts#L86-L88)) make 1:1 pixel comparison too strict.

This new test is OPTIONAL for W-3.2; the manual smoke comparison (§6.1) covers the visual quality validation for the initial refactor. Adding it later as W-3.3 if MP4 regressions surface in practice is also reasonable.

---

## 8. Rollback story

### 8.1 The safe-revert path

W-3.2 ships as a single feature branch (matching the W-1 / W-2 / v1.39 pattern). A regression after merge has two recovery routes:

**Option A — Single revert commit:**

```bash
git revert -m 1 <merge-sha>
```

Restores the frame-by-frame path entirely. Production exports go back to ~88s wall-clock but bullet-perfect.

**Option B — Keep the deleted code as a feature-flagged fallback (NOT recommended):**

Conditionally route based on a `process.env.NEXT_PUBLIC_LEGACY_MP4_PATH === '1'` flag. The H-7.14 audit specifically called out that the right move is to remove the legacy path entirely as part of W-3.2 — a dead-code fallback creates the exact parallel-path-divergence class the consolidation is trying to eliminate.

**Recommendation: Option A.** The W-2 CI gate + manual smoke before merge catches most regressions before they ship. If something does surface post-merge, a single revert undoes everything cleanly. The dead fallback path is anti-pattern.

### 8.2 What's recoverable from the git history

The deleted `renderFrameByFrame` function and its supporting helpers will live in the v1.41 / pre-v1.42 commit history. If a future need for synchronous frame-by-frame rendering arises (some quality-critical export format, video conversion CLI integration, etc.), the code can be pulled back from the historical commit and adapted. Nothing is permanently lost.

### 8.3 No per-user feature flags

Per CONTEXT.md §4, the codebase doesn't use feature flags. The W-3.2 refactor lands as-is for all users on the next production deploy. The Vercel preview deploy of the W-3.2 PR is the canary; Dallen smoke-tests it before the merge prompt runs.

---

## 9. Confidence and known limitations

- **High confidence:** the structural divergence is exactly one function (`renderFrameByFrame`). I read the codebase end-to-end and grepped for any other ffmpeg / MediaRecorder usage. No hidden third path.
- **High confidence:** Social Animator's pipeline doesn't need to change. It already uses the building blocks the refactor is unifying around.
- **Medium confidence:** the MP4 visual quality post-refactor. The encoder parameters are similar (`-crf 18`, `libx264`, `yuv420p`) but the input source differs (PNG sequence vs MediaRecorder WebM/MP4). Manual side-by-side validation required during W-3.2 (§6.1).
- **Medium confidence:** the perf gains are at the claimed magnitude. H-7.14 measured Social Animator's pipeline at 17s on a similar canvas complexity. LF + OHP have slightly heavier compositions (more text, larger photos) so the actual speedup may be 3-4x rather than 5x. Still a big win.
- **Low risk:** iOS Safari. Already on the target path; refactor doesn't change its code path at all.
- **Single Mac Chrome measurement environment.** Per H-7.14 §11 (the perf audit), all measurements are from one machine. Real-world variance across browsers + devices is unmeasured.

The H-7.14 audit doc itself is the single best perf reference for this work and is committed at [docs/H-7.14-render-perf-audit.md](docs/H-7.14-render-perf-audit.md).

---

## Sources

| File | Lines read | Purpose |
|---|---|---|
| src/engine/export.ts | 1-429 (full) | Two shared helpers (`recordCanvas`, `webmToMp4`) + `getFFmpeg` + delivery |
| src/engine/frame-render.ts | 1-446 (full) | The routing function for LF/OHP + the frame-by-frame implementation |
| src/tools/listing-flyer/engine/render-mp4.ts | 1-122 (full) | LF-specific rAF + heartbeat + warmup hold |
| src/tools/open-house-promo/engine/render-mp4.ts | 1-243 (full) | OH Promo's wrapper calling the shared engine |
| src/components/ExportButton.tsx | 1-180 (full) | Social Animator's per-template export entry |
| src/app/listing-flyer/ExportButtons.tsx | 180-390 | LF MP4 handler in the user-facing form |
| src/app/open-house-promo/ExportButtons.tsx | 196-369 | OH Promo MP4 handler |
| src/tools/listing-flyer/engine/template-mapping.ts | 1-89 (full) | `mapFlyerToShowcase` translator (v1.39.2 fix site) |
| docs/H-7.14-render-perf-audit.md | All | Perf data + earlier-phase context |
| Grep across src/ | — | Confirmation that no other MP4 paths exist (`ffmpeg`, `MediaRecorder`, `captureStream`, etc.) |
