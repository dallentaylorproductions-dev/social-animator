"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
} from "react";
import { ImageUploadField } from "@/components/ImageUploadField";
import { VideoUploadField } from "@/components/VideoUploadField";
import { CurrencyInput } from "@/components/inputs/CurrencyInput";
import { NumberInput } from "@/components/inputs/NumberInput";
import { PercentInput } from "@/components/inputs/PercentInput";
import {
  getVideoUploadSessionState,
  subscribeVideoUploadSession,
} from "@/lib/video-upload-session";
import type {
  AreaStats,
  AreaStatsMonthly,
  PresentationVideo,
  SellerPresentationDraft,
} from "../engine/types";
import { effectivePosterUrl } from "../engine/types";

/**
 * A7d.11 — the upload session key used by the walk-through video
 * field. Mirrors the `folder` prop passed to `VideoUploadField` so
 * StepEditorial and the field both read the same module-level
 * session. Keep these in sync if the folder ever changes.
 */
const VIDEO_UPLOAD_SESSION_KEY = "seller-presentation-video";

/**
 * Seller Presentation Step 5 — Editorial extras (v1.47 / A7d + A7d.1 + A7d.2).
 *
 * One fully OPTIONAL step. After A7d.2's relocation the surviving
 * blocks are: walk-through video and the area snapshot (the chart).
 * Reviews moved to brand Settings (agent-constant — entered once,
 * shown on every seller page).
 *
 * SSR-safe (Substrate §9): `addedSections` initializes empty on
 * server + first client render, hydrates from the draft in a
 * useEffect post-mount.
 */

interface StepEditorialProps {
  draft: SellerPresentationDraft;
  /**
   * A7d.11 — accepts either a replacement draft (legacy callers) or a
   * functional updater. The functional form is load-bearing for the
   * walk-through-video upload completion path so a stale onChange
   * closure cannot clobber the user's mid-upload sibling-field edits.
   */
  setDraft: (
    next:
      | SellerPresentationDraft
      | ((prev: SellerPresentationDraft) => SellerPresentationDraft),
  ) => void;
}

type SectionKey = "video" | "areaStats";

interface SectionDef {
  key: SectionKey;
  title: string;
  /** Short, plain-language purpose line shown when the section is open. */
  purpose: string;
  /** Label on the "+ Add …" button when the section is closed. */
  addLabel: string;
}

const SECTIONS: SectionDef[] = [
  {
    key: "video",
    title: "Your video message",
    purpose:
      "A 60 to 90 second video walking your seller through your plan. Not a tour of the home.",
    addLabel: "+ Add a video",
  },
  {
    key: "areaStats",
    title: "Area snapshot",
    purpose:
      "Builds the animated neighborhood chart and stats block on the seller's page. Every field is optional. Fill what you have, skip what you don't.",
    addLabel: "+ Add an area snapshot",
  },
];

/**
 * Detect which sections the loaded draft already has content for.
 * Used post-mount to open exactly those cards on resume so the agent
 * sees their prior work without an extra click.
 */
function sectionsWithContent(draft: SellerPresentationDraft): SectionKey[] {
  const out: SectionKey[] = [];
  if (draft.video && Object.values(draft.video).some((v) => v?.trim())) {
    out.push("video");
  }
  if (
    draft.areaStats &&
    Object.values(draft.areaStats).some(
      (v) => (Array.isArray(v) ? v.length > 0 : Boolean(v?.toString().trim())),
    )
  ) {
    out.push("areaStats");
  }
  return out;
}

export function StepEditorial({ draft, setDraft }: StepEditorialProps) {
  // SSR-safe: start empty on server + first client render, hydrate
  // from draft in an effect. Without this, a section that was added
  // on a prior session would render unmounted on the server and
  // remount after hydration.
  const [added, setAdded] = useState<Set<SectionKey>>(() => new Set());
  useEffect(() => {
    const initial = new Set(sectionsWithContent(draft));
    // A7d.11 — if an upload is mid-flight (e.g., this StepEditorial
    // just remounted while the user's walkthrough video is uploading),
    // keep the video section open so its in-flight state is reachable.
    // Without this, a remount whose `draft.video` is still undefined
    // would re-derive `added` to {} and collapse the section, hiding
    // the field while the bytes are still flowing — exactly the
    // desktop "picker resets mid-upload" symptom from 2026-05-24.
    if (
      getVideoUploadSessionState(VIDEO_UPLOAD_SESSION_KEY).status !==
      "idle"
    ) {
      initial.add("video");
    }
    setAdded(initial);
    // Open exactly the sections that have content on first mount. We
    // intentionally don't depend on `draft` here — subsequent edits
    // shouldn't close a section the agent is actively editing (an
    // edit that empties every field of a block should still leave
    // the card open so the agent can keep typing).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // A7d.11 — subscribe to the walk-through video upload session so we
  // can render the step-level lock overlay during upload AND keep the
  // video card open while an upload is in flight even if it landed
  // here via a remount whose `useEffect` initialization saw an empty
  // `draft.video`. `useSyncExternalStore` is the React 19 hook for a
  // stable, snapshot-consistent read of a non-React store.
  const videoUploadSession = useSyncExternalStore(
    useCallback(
      (l) => subscribeVideoUploadSession(VIDEO_UPLOAD_SESSION_KEY, l),
      [],
    ),
    useCallback(
      () => getVideoUploadSessionState(VIDEO_UPLOAD_SESSION_KEY),
      [],
    ),
    useCallback(
      () => getVideoUploadSessionState(VIDEO_UPLOAD_SESSION_KEY),
      [],
    ),
  );
  const videoUploadInFlight = videoUploadSession.status === "uploading";

  const isOpen = (k: SectionKey) =>
    added.has(k) || (k === "video" && videoUploadInFlight);

  const openSection = (k: SectionKey) => {
    setAdded((prev) => {
      const next = new Set(prev);
      next.add(k);
      return next;
    });
  };

  const closeSection = (k: SectionKey) => {
    setAdded((prev) => {
      const next = new Set(prev);
      next.delete(k);
      return next;
    });
    // Clear the draft fields so the published page hides the block.
    // A7d.11 — functional setDraft so a click on Remove that races with
    // any in-flight write (e.g. a typed sibling field that hasn't
    // flushed yet) still merges against the freshest draft.
    switch (k) {
      case "video":
        setDraft((prev) => ({ ...prev, video: undefined }));
        break;
      case "areaStats":
        setDraft((prev) => ({ ...prev, areaStats: undefined }));
        break;
    }
  };

  return (
    <section className="sec5" data-testid="step-editorial">
      <div className="sec-head">
        <h2 className="sec-title">Editorial extras</h2>
        <p className="sec-sub">
          Optional. Add the sections that fit this listing. Skip the rest and
          the page hides them cleanly.
        </p>
      </div>

      {/* A7d.11 — step body wrapper. The lock overlay below sits
          absolutely over this container while the walk-through video
          upload is in flight, so the agent cannot edit OTHER fields
          (or remove/replace the in-flight video card) during the
          upload. Dallen 2026-05-24 picked this UX explicitly — the
          upload is quick, so a brief reliable lock is acceptable and
          is the intended design (vs. trying to support edits during
          a stale-closure-prone in-flight state). The lock unlocks on
          completion OR failure (a failed upload must never trap the
          user — VideoUploadField surfaces a retry + manual fallback). */}
      <div className="sec5-canvas">
        <div
          className="sec5-sections"
          // aria-busy mirrors the visual lock for assistive tech.
          aria-busy={videoUploadInFlight}
          // pointer-events:none on the body during upload moves the
          // tap target up to the overlay, so a touchstart on a child
          // input still intercepts cleanly. The visible inputs also
          // dim slightly so the lock reads as INTENTIONAL not broken.
          inert={videoUploadInFlight || undefined}
          data-step-locked={videoUploadInFlight ? "true" : undefined}
        >
          {SECTIONS.map((s) => (
            <SectionCard
              key={s.key}
              def={s}
              open={isOpen(s.key)}
              onAdd={() => openSection(s.key)}
              onRemove={() => closeSection(s.key)}
            >
              {s.key === "video" && (
                <VideoEditor draft={draft} setDraft={setDraft} />
              )}
              {s.key === "areaStats" && (
                <AreaStatsEditor draft={draft} setDraft={setDraft} />
              )}
            </SectionCard>
          ))}
        </div>
        {videoUploadInFlight && (
          <UploadingLockOverlay progressPct={videoUploadSession.progressPct} />
        )}
      </div>
    </section>
  );
}

/**
 * A7d.11 — the brief, reliable input lock shown over the editorial
 * step body while the walk-through video upload is in flight. Calm
 * voice ("Uploading walkthrough video"), determinate or indeterminate
 * progress mirroring the field's own bar, no em-dashes. Dismissable
 * only by the upload finishing — there is no Cancel button because
 * canceling an in-flight Vercel Blob upload doesn't actually stop the
 * bytes from landing (the abortSignal is honored at the handshake but
 * not the byte PUT), so a Cancel would mislead the agent. On failure
 * the field's own retry surface is reachable as soon as this overlay
 * unmounts.
 */
function UploadingLockOverlay({
  progressPct,
}: {
  progressPct: number | null;
}) {
  const label =
    progressPct === null
      ? "Uploading walkthrough video"
      : `Uploading walkthrough video ${Math.round(progressPct)}%`;
  return (
    <div
      className="sec5-lock"
      role="status"
      aria-live="polite"
      data-testid="step-editorial-upload-lock"
    >
      <div className="sec5-lock-card">
        <p className="sec5-lock-label">{label}</p>
        <div className="sec5-lock-track">
          <div
            className={
              progressPct === null
                ? "sec5-lock-bar indeterminate"
                : "sec5-lock-bar determinate"
            }
            style={
              progressPct === null
                ? undefined
                : {
                    width: `${Math.max(0, Math.min(100, progressPct))}%`,
                  }
            }
            data-testid="step-editorial-upload-lock-progress"
            data-progress-mode={
              progressPct === null ? "indeterminate" : "determinate"
            }
            data-progress-pct={
              progressPct === null ? "" : String(Math.round(progressPct))
            }
          />
        </div>
        <p className="sec5-lock-note">
          Hold tight. The rest of the step unlocks the moment this finishes.
        </p>
      </div>
    </div>
  );
}

interface SectionCardProps {
  def: SectionDef;
  open: boolean;
  onAdd: () => void;
  onRemove: () => void;
  children: React.ReactNode;
}

function SectionCard({ def, open, onAdd, onRemove, children }: SectionCardProps) {
  const tid = `step-editorial-${def.key}`;
  if (!open) {
    return (
      <div
        className="sec5-card closed"
        data-testid={`${tid}-card`}
        data-state="closed"
      >
        <div className="sec5-head">
          <div className="sec5-headings">
            <h3 className="sec5-title">{def.title}</h3>
            <p className="sec5-purpose">{def.purpose}</p>
          </div>
          <button
            type="button"
            onClick={onAdd}
            data-testid={`${tid}-add`}
            className="sec5-add"
          >
            {def.addLabel}
          </button>
        </div>
      </div>
    );
  }
  return (
    <div
      className="sec5-card open"
      data-testid={`${tid}-card`}
      data-state="open"
    >
      <div className="sec5-head">
        <div className="sec5-headings">
          <h3 className="sec5-title">{def.title}</h3>
          <p className="sec5-purpose">{def.purpose}</p>
        </div>
        <button
          type="button"
          onClick={onRemove}
          data-testid={`${tid}-remove`}
          className="sec5-remove"
        >
          Remove this section
        </button>
      </div>
      <div className="sec5-body">{children}</div>
    </div>
  );
}

// =====================================================================
// VIDEO
// =====================================================================

function VideoEditor({ draft, setDraft }: StepEditorialProps) {
  const v = draft.video ?? {};
  // A7d.11 — setVideo now uses a FUNCTIONAL setDraft so the merge
  // always reads the freshest draft.video, not a render-time closure.
  // This is load-bearing for the walkthrough-upload completion path:
  // VideoUploadField's onChange may fire long after the user typed
  // sibling fields (title, runtime, recordedOn) during the upload,
  // and the pre-A7d.11 closure-captured `v` / `draft` would have
  // clobbered those edits. The functional form makes the order of
  // setState calls irrelevant — each merge composes onto the latest.
  const setVideo = (patch: Partial<PresentationVideo>) => {
    setDraft((prev) => {
      const prevVideo = prev.video ?? {};
      const merged: PresentationVideo = { ...prevVideo, ...patch };
      // Drop the block when every field is empty so the renderer hides it.
      const hasAny = Object.values(merged).some(
        (val) => typeof val === "string" && val.trim().length > 0,
      );
      return { ...prev, video: hasAny ? merged : undefined };
    });
  };

  return (
    <>
      {/* A7d.3: camera-roll upload (no paste-URL). Plays inline on
          the seller page via <video controls playsInline>.
          A7d.8: also drives the first-frame auto-capture + scrubber
          (never-blank poster + Instagram-style frame picker). */}
      <VideoUploadField
        label="Your video message"
        value={v.videoUrl ?? ""}
        onChange={(url, durationSeconds) => {
          // Apply both edits in a SINGLE setVideo call. Two
          // separate setVideo calls would race — both read draft
          // .video captured at render time, so the second one
          // would clobber the first (this regressed once when
          // onChange + onDuration were split props).
          //
          // A7d.8 — on Replace / Remove we ALSO clear the auto +
          // scrub poster URLs because they're captured frames of a
          // video that no longer exists. The manual `posterUrl`
          // override stays (some agents upload a branded still that
          // outlives their walk-through edits — and the renderer's
          // precedence still has it on top).
          const patch: Partial<PresentationVideo> = {
            videoUrl: url || undefined,
            autoPosterUrl: undefined,
            scrubPosterUrl: undefined,
          };
          if (
            durationSeconds !== undefined &&
            Number.isFinite(durationSeconds)
          ) {
            patch.runtime = formatRuntime(durationSeconds);
          }
          setVideo(patch);
        }}
        onPosterChange={(url, source) => {
          // A7d.8 — the field captures two kinds of posters:
          //   'auto'  → first-frame default (never-blank baseline)
          //   'scrub' → frame picked via the Instagram-style scrubber
          // Each lands in its own draft field so the renderer's
          // precedence (override > scrub > auto) can pick correctly.
          if (source === "auto") {
            setVideo({ autoPosterUrl: url || undefined });
          } else {
            setVideo({ scrubPosterUrl: url || undefined });
          }
        }}
        currentPosterUrl={effectivePosterUrl(draft.video)}
        folder="seller-presentation-video"
        testIdPrefix="step-editorial-video"
        helpText="Up to 90 seconds, 250 MB. MP4, MOV, or WebM."
      />
      <label className="field-block">
        <span className="field-label">Title</span>
        <input
          type="text"
          className="input"
          value={v.title ?? ""}
          onChange={(e) => setVideo({ title: e.target.value || undefined })}
          placeholder="A walk-through of your plan, recorded yesterday."
          data-testid="step-editorial-video-title"
        />
      </label>
      <div className="sec5-grid">
        <label className="field-block">
          <span className="field-label">Runtime</span>
          <input
            type="text"
            className="input"
            value={v.runtime ?? ""}
            onChange={(e) =>
              setVideo({ runtime: e.target.value || undefined })
            }
            placeholder="0:14"
            data-testid="step-editorial-video-runtime"
          />
          <span className="hint">Filled automatically from the video.</span>
        </label>
        <label className="field-block">
          <span className="field-label">Recorded on</span>
          {/* A7d.3: native date picker (matches A7c.1 comps pattern).
              Stored as ISO YYYY-MM-DD; the renderer displays verbatim. */}
          <input
            type="date"
            className="input"
            value={v.recordedOn ?? ""}
            onChange={(e) =>
              setVideo({ recordedOn: e.target.value || undefined })
            }
            data-testid="step-editorial-video-recorded-on"
          />
        </label>
      </div>
      {/* A7d.3: thumbnail = poster, camera-roll-only (no paste-URL). */}
      <ImageUploadField
        label="Video thumbnail"
        value={v.posterUrl ?? ""}
        onChange={(url) => setVideo({ posterUrl: url || undefined })}
        previewAspect="aspect-video"
        folder="seller-presentation-video-poster"
        testIdPrefix="step-editorial-video-poster"
        helpText="The still frame buyers see before the video plays."
        disablePasteUrl
      />
    </>
  );
}

/** Format a duration in seconds as mm:ss (e.g. 74 → "1:14"). */
function formatRuntime(totalSeconds: number): string {
  const safe = Math.max(0, Math.round(totalSeconds));
  const m = Math.floor(safe / 60);
  const s = safe % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

// =====================================================================
// AREA STATS
// =====================================================================

const MAX_MONTHLY = 12;
const DEFAULT_MONTHLY_COUNT = 6;

const MONTH_SHORT_NAMES = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

/** Today's month in the native <input type="month"> "YYYY-MM" format. */
function currentMonthYYYYMM(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/** "2026-05" → "May '26"; falls back to the input if unparseable. */
function formatMonthLabel(yyyyMm: string): string {
  const match = /^(\d{4})-(\d{2})$/.exec(yyyyMm);
  if (!match) return yyyyMm;
  const year = parseInt(match[1], 10);
  const monthIdx = parseInt(match[2], 10) - 1;
  if (
    !Number.isFinite(year) ||
    monthIdx < 0 ||
    monthIdx >= MONTH_SHORT_NAMES.length
  ) {
    return yyyyMm;
  }
  return `${MONTH_SHORT_NAMES[monthIdx]} '${String(year).slice(-2)}`;
}

/**
 * Best-effort parse of a free-text month label like "May '26", "May 2026",
 * "may 26", or "2026-05" back into "YYYY-MM". Returns null if no recognized
 * form. Used to recover a "latest month" anchor from a persisted draft
 * (including older drafts written by the free-text editor pre-A7d.4).
 */
function parseMonthLabel(label: string): string | null {
  if (!label) return null;
  const isoMatch = /^(\d{4})-(\d{1,2})$/.exec(label.trim());
  if (isoMatch) {
    const y = parseInt(isoMatch[1], 10);
    const m = parseInt(isoMatch[2], 10);
    if (m >= 1 && m <= 12) {
      return `${y}-${String(m).padStart(2, "0")}`;
    }
  }
  const wordMatch = /^([A-Za-z]{3,})\s*'?(\d{2,4})$/.exec(label.trim());
  if (!wordMatch) return null;
  const monthName = wordMatch[1].toLowerCase().slice(0, 3);
  const monthIdx = MONTH_SHORT_NAMES.findIndex(
    (n) => n.toLowerCase() === monthName,
  );
  if (monthIdx < 0) return null;
  let year = parseInt(wordMatch[2], 10);
  if (!Number.isFinite(year)) return null;
  if (year < 100) year += 2000;
  return `${year}-${String(monthIdx + 1).padStart(2, "0")}`;
}

/**
 * Generate a chronological list of "YYYY-MM" strings ending at `latestYyyyMm`
 * and going back `count` months (inclusive). Result is oldest-first so the
 * chart's left-to-right reading matches the array order.
 */
function monthsEndingAt(latestYyyyMm: string, count: number): string[] {
  const match = /^(\d{4})-(\d{2})$/.exec(latestYyyyMm);
  if (!match) return [];
  const year = parseInt(match[1], 10);
  const monthIdx = parseInt(match[2], 10) - 1;
  if (
    !Number.isFinite(year) ||
    monthIdx < 0 ||
    monthIdx >= 12 ||
    count < 1
  ) {
    return [];
  }
  const out: string[] = [];
  for (let i = count - 1; i >= 0; i--) {
    const d = new Date(year, monthIdx - i, 1);
    out.push(
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`,
    );
  }
  return out;
}

interface AreaMonthlyEditorState {
  latestMonth: string;
  count: number;
  /** Map from auto-generated label (e.g. "May '26") to the typed price. */
  prices: Record<string, string>;
}

/**
 * Derive the editor state from the persisted series. Picks the most-recent
 * recognizable month as the anchor, defaults the count to the persisted
 * length (clamped), and seeds the price map from the persisted entries.
 * Legacy entries whose label can't be parsed keep their prices recorded
 * (so they re-appear if the auto-generated labels happen to match).
 */
function deriveMonthlyEditorState(
  persisted: AreaStatsMonthly[],
): AreaMonthlyEditorState {
  const prices: Record<string, string> = {};
  for (const row of persisted) {
    if (row.month) prices[row.month] = row.medianPrice;
  }
  // Find the freshest parseable month in the persisted series. Series is
  // typically oldest-first, so we scan from the tail for the latest one.
  let latest: string | null = null;
  for (let i = persisted.length - 1; i >= 0; i--) {
    const parsed = parseMonthLabel(persisted[i].month);
    if (parsed) {
      latest = parsed;
      break;
    }
  }
  const count = Math.max(
    1,
    Math.min(MAX_MONTHLY, persisted.length || DEFAULT_MONTHLY_COUNT),
  );
  return {
    latestMonth: latest ?? currentMonthYYYYMM(),
    count,
    prices,
  };
}

function AreaStatsEditor({ draft, setDraft }: StepEditorialProps) {
  const stats: AreaStats = draft.areaStats ?? {};

  const update = (patch: Partial<AreaStats>) => {
    const next: AreaStats = { ...stats, ...patch };
    const hasAny = Object.entries(next).some(([, v]) => {
      if (Array.isArray(v)) return v.length > 0;
      return typeof v === "string" && v.trim().length > 0;
    });
    setDraft({ ...draft, areaStats: hasAny ? next : undefined });
  };

  // ---- Monthly chart editor ----
  // Local UI state for the chart input (latest month + how many months to
  // show + a price map keyed by friendly label). Initialized SSR-safely
  // and hydrated from either the persisted draft or the device clock on
  // mount.
  //
  // SSR-safe pattern (Substrate §9): the initial render uses an EMPTY
  // anchor so the server and the first client paint match exactly. The
  // device-clock default is applied in a useEffect — `new Date()` inside
  // useState would diverge between server-time and client-time and
  // trigger React #418 the moment they fall on either side of a month
  // boundary. A7d.6 fix: anchor MUST come from the device clock so the
  // "Latest month" self-updates as the calendar turns over.
  const persistedSeries: AreaStatsMonthly[] = stats.monthlySeries ?? [];
  const [editor, setEditor] = useState<AreaMonthlyEditorState>(() => ({
    latestMonth: "",
    count: DEFAULT_MONTHLY_COUNT,
    prices: {},
  }));
  useEffect(() => {
    if (persistedSeries.length > 0) {
      setEditor(deriveMonthlyEditorState(persistedSeries));
    } else {
      // No persisted series → seed with the actual current month from
      // the device clock. Trailing labels back-fill from this anchor
      // (the A7d.4 auto-label logic is untouched).
      setEditor((prev) => ({ ...prev, latestMonth: currentMonthYYYYMM() }));
    }
    // Run only on mount; subsequent draft edits originate FROM this editor,
    // so re-deriving on every persisted-series change would echo back and
    // overwrite the user's latest typing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const labels = useMemo(
    () =>
      monthsEndingAt(editor.latestMonth, editor.count).map((iso) => ({
        iso,
        display: formatMonthLabel(iso),
      })),
    [editor.latestMonth, editor.count],
  );

  /**
   * Persist the chart series. We only write rows whose price is non-empty
   * so a half-filled editor doesn't push empty entries into the chart
   * (the renderer's parsePriceToNumber returns null for those, but they
   * would still pollute the x-axis tick positions).
   */
  const persistSeries = (
    nextLabels: { iso: string; display: string }[],
    nextPrices: Record<string, string>,
  ) => {
    const rows: AreaStatsMonthly[] = nextLabels
      .map(({ display }) => ({
        month: display,
        medianPrice: nextPrices[display] ?? "",
      }))
      .filter((row) => row.medianPrice.trim().length > 0);
    update({ monthlySeries: rows.length ? rows : undefined });
  };

  const setLatestMonth = (next: string) => {
    const safe = next || currentMonthYYYYMM();
    const nextLabels = monthsEndingAt(safe, editor.count).map((iso) => ({
      iso,
      display: formatMonthLabel(iso),
    }));
    setEditor((prev) => ({ ...prev, latestMonth: safe }));
    persistSeries(nextLabels, editor.prices);
  };

  const setCount = (next: number) => {
    const safe = Math.max(1, Math.min(MAX_MONTHLY, Math.round(next)));
    const nextLabels = monthsEndingAt(editor.latestMonth, safe).map((iso) => ({
      iso,
      display: formatMonthLabel(iso),
    }));
    setEditor((prev) => ({ ...prev, count: safe }));
    persistSeries(nextLabels, editor.prices);
  };

  // A7d.7 Fix 2 — months-of-history input must allow an empty intermediate
  // state while editing. The A7d.6 onChange clamped on every keystroke, so
  // backspacing "12" instantly snapped back to "1" and the agent couldn't
  // retype (Dallen smoke 2026-05-23 — "get stuck in a loop"). Local string
  // state holds the raw input so '' / '6' / '12' all flow through; the
  // numeric clamp only fires on blur. While editing, in-range numbers are
  // applied live so the row count updates as the agent types.
  const [countInput, setCountInput] = useState<string>(
    String(DEFAULT_MONTHLY_COUNT),
  );
  useEffect(() => {
    setCountInput(String(editor.count));
  }, [editor.count]);

  const handleCountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    // Accept '' (mid-backspace) or 1-2 digit integers ≤ MAX. Anything
    // outside that window is silently dropped — keeps the input from
    // letting in "123" or "9a" before blur normalization.
    if (raw === "" || /^\d{1,2}$/.test(raw)) {
      const n = parseInt(raw, 10);
      if (raw === "" || (Number.isFinite(n) && n <= MAX_MONTHLY)) {
        setCountInput(raw);
        // Apply IN-RANGE numbers live so labels update as the user types.
        // Skip the live-apply when the input is empty or below 1 — wait
        // for blur to normalize.
        if (Number.isFinite(n) && n >= 1 && n <= MAX_MONTHLY) {
          setCount(n);
        }
      }
    }
  };

  const handleCountBlur = () => {
    const n = parseInt(countInput, 10);
    if (!Number.isFinite(n) || n < 1) {
      setCountInput(String(DEFAULT_MONTHLY_COUNT));
      setCount(DEFAULT_MONTHLY_COUNT);
    } else if (n > MAX_MONTHLY) {
      setCountInput(String(MAX_MONTHLY));
      setCount(MAX_MONTHLY);
    }
  };

  const setPriceFor = (label: string, price: string) => {
    const nextPrices = { ...editor.prices, [label]: price };
    setEditor((prev) => ({ ...prev, prices: nextPrices }));
    persistSeries(labels, nextPrices);
  };

  return (
    <>
      {/* Discovery framing — make the chart payoff unmistakable so the
          agent realizes this section is what populates the animated
          neighborhood chart on the published page. */}
      <AreaChartHint />

      <div className="sec5-grid">
        <label className="field-block">
          <span className="field-label">Median sale price</span>
          <CurrencyInput
            className="input"
            value={stats.medianSale ?? ""}
            onChange={(v) => update({ medianSale: v || undefined })}
            placeholder="$642,000"
            aria-label="area-median-sale"
          />
        </label>
        <label className="field-block">
          <span className="field-label">Year-over-year change</span>
          <PercentInput
            className="input"
            value={stats.medianSaleDeltaYoy ?? ""}
            onChange={(v) => update({ medianSaleDeltaYoy: v || undefined })}
            placeholder="+4.6%"
            signed
            aria-label="area-yoy"
          />
        </label>
        <label className="field-block">
          <span className="field-label">Days on market</span>
          <NumberInput
            className="input"
            value={stats.daysOnMarket ?? ""}
            onChange={(v) => update({ daysOnMarket: v || undefined })}
            placeholder="14"
            aria-label="area-dom"
          />
        </label>
        <label className="field-block">
          <span className="field-label">Area DOM comparison</span>
          <input
            type="text"
            className="input"
            value={stats.daysOnMarketZipAvg ?? ""}
            onChange={(e) =>
              update({ daysOnMarketZipAvg: e.target.value || undefined })
            }
            placeholder="vs Tremont avg 21"
            data-testid="step-editorial-area-dom-comp"
          />
        </label>
        <label className="field-block">
          <span className="field-label">Closings in last 90 days</span>
          <NumberInput
            className="input"
            value={stats.closings90d ?? ""}
            onChange={(v) => update({ closings90d: v || undefined })}
            placeholder="38"
            aria-label="area-closings"
          />
        </label>
        <label className="field-block">
          <span className="field-label">List-to-sale ratio</span>
          <PercentInput
            className="input"
            value={stats.listToSaleRatio ?? ""}
            onChange={(v) => update({ listToSaleRatio: v || undefined })}
            placeholder="101%"
            aria-label="area-ratio"
          />
        </label>
      </div>

      <div className="sec5-monthly" data-testid="step-editorial-area-monthly">
        <span className="field-label">Median price by month</span>
        <p className="sec5-monthly-intro">
          We label the months automatically. Pick the latest month + how many
          months of history you have, then fill in the prices you know.
        </p>

        <div className="sec5-grid">
          <label className="field-block">
            <span className="field-label">Latest month</span>
            <input
              type="month"
              className="input"
              value={editor.latestMonth}
              onChange={(e) => setLatestMonth(e.target.value)}
              data-testid="step-editorial-area-latest-month"
            />
          </label>
          <label className="field-block">
            <span className="field-label">
              Months of history (1–{MAX_MONTHLY})
            </span>
            <input
              type="text"
              inputMode="numeric"
              autoComplete="off"
              className="input"
              value={countInput}
              onChange={handleCountChange}
              onBlur={handleCountBlur}
              data-testid="step-editorial-area-month-count"
            />
          </label>
        </div>

        <div className="sec5-month-rows">
          {labels.map(({ display }, idx) => (
            <div
              key={display}
              className="sec5-month-row"
              data-testid={`step-editorial-area-month-${idx}`}
            >
              <div
                className="sec5-month-label"
                data-testid={`step-editorial-area-month-label-${idx}`}
              >
                {display}
              </div>
              <CurrencyInput
                className="input"
                value={editor.prices[display] ?? ""}
                onChange={(v) => setPriceFor(display, v)}
                placeholder="$642,000"
                aria-label={`area-month-${idx}-price`}
              />
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

/**
 * Inline hint that makes the Area-snapshot payoff visible inside the wizard.
 * A tiny SVG of the line chart + one sentence of value framing — the
 * static-discovery cure (the live-preview "Preview button" track is parked).
 */
function AreaChartHint() {
  return (
    <div className="sec5-hint" data-testid="step-editorial-area-hint">
      <svg
        width="40"
        height="22"
        viewBox="0 0 40 22"
        fill="none"
        aria-hidden="true"
      >
        <path
          d="M2 18 L10 12 L18 14 L26 6 L34 9 L38 4"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
        <circle cx="38" cy="4" r="2" fill="currentColor" />
      </svg>
      <span>
        What you fill here becomes the animated neighborhood chart + stats
        on the seller&apos;s page.
      </span>
    </div>
  );
}

