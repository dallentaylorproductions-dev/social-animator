"use client";

import { useEffect, useState } from "react";
import { ImageUploadField } from "@/components/ImageUploadField";
import { VideoUploadField } from "@/components/VideoUploadField";
import type {
  AreaStats,
  AreaStatsMonthly,
  PresentationVideo,
  SellerPresentationDraft,
} from "../engine/types";

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
  setDraft: (next: SellerPresentationDraft) => void;
}

const inputCls =
  "w-full px-3 py-2 bg-neutral-900 border border-neutral-700 rounded text-sm focus:outline-none focus:border-mint";

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
    title: "Walk-through video",
    purpose:
      "A short video of you walking the seller through the plan. Upload from your phone — plays inline on the page.",
    addLabel: "+ Add a video",
  },
  {
    key: "areaStats",
    title: "Area snapshot",
    purpose:
      "Stats for the seller's neighborhood. Each field is optional; leave any you don't have.",
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
    setAdded(new Set(sectionsWithContent(draft)));
    // Open exactly the sections that have content on first mount. We
    // intentionally don't depend on `draft` here — subsequent edits
    // shouldn't close a section the agent is actively editing (an
    // edit that empties every field of a block should still leave
    // the card open so the agent can keep typing).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const isOpen = (k: SectionKey) => added.has(k);

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
    switch (k) {
      case "video":
        setDraft({ ...draft, video: undefined });
        break;
      case "areaStats":
        setDraft({ ...draft, areaStats: undefined });
        break;
    }
  };

  return (
    <div className="space-y-6" data-testid="step-editorial">
      <header>
        <h2 className="text-lg font-medium">Editorial extras</h2>
        <p className="mt-1 text-xs text-gray-500">
          Optional. Add only the sections you want on the page. Skip the rest
          and the page hides them cleanly.
        </p>
      </header>

      <div className="space-y-4">
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
        className="rounded border border-dashed border-neutral-700 bg-neutral-900/20 p-4"
        data-testid={`${tid}-card`}
        data-state="closed"
      >
        <div className="flex items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-medium text-text-primary">
              {def.title}
            </h3>
            <p className="mt-1 text-xs text-neutral-500">{def.purpose}</p>
          </div>
          <button
            type="button"
            onClick={onAdd}
            data-testid={`${tid}-add`}
            className="shrink-0 rounded border border-mint px-3 py-1.5 text-xs text-mint hover:bg-mint/10"
          >
            {def.addLabel}
          </button>
        </div>
      </div>
    );
  }
  return (
    <div
      className="rounded border border-neutral-700 bg-neutral-900/30 p-4"
      data-testid={`${tid}-card`}
      data-state="open"
    >
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-medium text-text-primary">{def.title}</h3>
          <p className="mt-1 text-xs text-neutral-500">{def.purpose}</p>
        </div>
        <button
          type="button"
          onClick={onRemove}
          data-testid={`${tid}-remove`}
          className="shrink-0 text-xs text-neutral-500 hover:text-red-400"
        >
          Remove this section
        </button>
      </div>
      <div className="space-y-3">{children}</div>
    </div>
  );
}

// =====================================================================
// VIDEO
// =====================================================================

function VideoEditor({ draft, setDraft }: StepEditorialProps) {
  const v = draft.video ?? {};
  const setVideo = (patch: Partial<PresentationVideo>) => {
    const merged: PresentationVideo = { ...v, ...patch };
    // Drop the block when every field is empty so the renderer hides it.
    const hasAny = Object.values(merged).some(
      (val) => typeof val === "string" && val.trim().length > 0,
    );
    setDraft({ ...draft, video: hasAny ? merged : undefined });
  };

  return (
    <>
      {/* A7d.3: camera-roll upload (no paste-URL). Plays inline on
          the seller page via <video controls playsInline>. */}
      <VideoUploadField
        label="Walk-through video"
        value={v.videoUrl ?? ""}
        onChange={(url, durationSeconds) => {
          // Apply both edits in a SINGLE setVideo call. Two
          // separate setVideo calls would race — both read draft
          // .video captured at render time, so the second one
          // would clobber the first (this regressed once when
          // onChange + onDuration were split props).
          const patch: Partial<PresentationVideo> = {
            videoUrl: url || undefined,
          };
          if (
            durationSeconds !== undefined &&
            Number.isFinite(durationSeconds)
          ) {
            patch.runtime = formatRuntime(durationSeconds);
          }
          setVideo(patch);
        }}
        folder="seller-presentation-video"
        testIdPrefix="step-editorial-video"
        helpText="Up to 90 seconds, 250 MB. MP4, MOV, or WebM."
      />
      <label className="block">
        <span className="text-[10px] uppercase tracking-[0.15em] text-neutral-500">
          Title
        </span>
        <input
          type="text"
          className={`${inputCls} mt-1`}
          value={v.title ?? ""}
          onChange={(e) => setVideo({ title: e.target.value || undefined })}
          placeholder="A walk-through of your plan, recorded yesterday."
          data-testid="step-editorial-video-title"
        />
      </label>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="text-[10px] uppercase tracking-[0.15em] text-neutral-500">
            Runtime
          </span>
          <input
            type="text"
            className={`${inputCls} mt-1`}
            value={v.runtime ?? ""}
            onChange={(e) =>
              setVideo({ runtime: e.target.value || undefined })
            }
            placeholder="0:14"
            data-testid="step-editorial-video-runtime"
          />
          <span className="mt-1 block text-[11px] text-neutral-500">
            Filled automatically from the video.
          </span>
        </label>
        <label className="block">
          <span className="text-[10px] uppercase tracking-[0.15em] text-neutral-500">
            Recorded on
          </span>
          {/* A7d.3: native date picker (matches A7c.1 comps pattern).
              Stored as ISO YYYY-MM-DD; the renderer displays verbatim. */}
          <input
            type="date"
            className={`${inputCls} mt-1`}
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

  const series: AreaStatsMonthly[] = stats.monthlySeries ?? [];

  const updateSeries = (next: AreaStatsMonthly[]) => {
    update({ monthlySeries: next.length ? next : undefined });
  };

  const updateMonth = (idx: number, patch: Partial<AreaStatsMonthly>) => {
    updateSeries(series.map((m, i) => (i === idx ? { ...m, ...patch } : m)));
  };

  const addMonth = () => {
    if (series.length >= MAX_MONTHLY) return;
    updateSeries([...series, { month: "", medianPrice: "" }]);
  };

  const removeMonth = (idx: number) => {
    updateSeries(series.filter((_, i) => i !== idx));
  };

  return (
    <>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="text-[10px] uppercase tracking-[0.15em] text-neutral-500">
            Median sale price
          </span>
          <input
            type="text"
            className={`${inputCls} mt-1`}
            value={stats.medianSale ?? ""}
            onChange={(e) =>
              update({ medianSale: e.target.value || undefined })
            }
            placeholder="$642k"
            data-testid="step-editorial-area-median-sale"
          />
        </label>
        <label className="block">
          <span className="text-[10px] uppercase tracking-[0.15em] text-neutral-500">
            Year-over-year change
          </span>
          <input
            type="text"
            className={`${inputCls} mt-1`}
            value={stats.medianSaleDeltaYoy ?? ""}
            onChange={(e) =>
              update({ medianSaleDeltaYoy: e.target.value || undefined })
            }
            placeholder="+4.1% vs prior year"
            data-testid="step-editorial-area-yoy"
          />
        </label>
        <label className="block">
          <span className="text-[10px] uppercase tracking-[0.15em] text-neutral-500">
            Days on market
          </span>
          <input
            type="text"
            inputMode="numeric"
            className={`${inputCls} mt-1`}
            value={stats.daysOnMarket ?? ""}
            onChange={(e) =>
              update({ daysOnMarket: e.target.value || undefined })
            }
            placeholder="14"
            data-testid="step-editorial-area-dom"
          />
        </label>
        <label className="block">
          <span className="text-[10px] uppercase tracking-[0.15em] text-neutral-500">
            Area DOM comparison
          </span>
          <input
            type="text"
            className={`${inputCls} mt-1`}
            value={stats.daysOnMarketZipAvg ?? ""}
            onChange={(e) =>
              update({ daysOnMarketZipAvg: e.target.value || undefined })
            }
            placeholder="vs Tremont avg 21"
            data-testid="step-editorial-area-dom-comp"
          />
        </label>
        <label className="block">
          <span className="text-[10px] uppercase tracking-[0.15em] text-neutral-500">
            Closings in last 90 days
          </span>
          <input
            type="text"
            inputMode="numeric"
            className={`${inputCls} mt-1`}
            value={stats.closings90d ?? ""}
            onChange={(e) =>
              update({ closings90d: e.target.value || undefined })
            }
            placeholder="38"
            data-testid="step-editorial-area-closings"
          />
        </label>
        <label className="block">
          <span className="text-[10px] uppercase tracking-[0.15em] text-neutral-500">
            List-to-sale ratio
          </span>
          <input
            type="text"
            className={`${inputCls} mt-1`}
            value={stats.listToSaleRatio ?? ""}
            onChange={(e) =>
              update({ listToSaleRatio: e.target.value || undefined })
            }
            placeholder="101%"
            data-testid="step-editorial-area-ratio"
          />
        </label>
      </div>

      <div className="space-y-2 border-t border-neutral-800 pt-3">
        <div className="text-[10px] uppercase tracking-[0.15em] text-neutral-500">
          Median price by month (up to {MAX_MONTHLY})
        </div>
        <p className="text-xs text-neutral-500">
          Drives the chart on the page. Add as many months as you have. The
          chart shows whatever you give it.
        </p>
        {series.length === 0 && (
          <p className="text-xs italic text-neutral-500">
            No months yet. Add one to start.
          </p>
        )}
        {series.length > 0 && (
          <div className="space-y-2">
            {series.map((m, idx) => (
              <div
                key={idx}
                className="grid grid-cols-[1fr_1fr_auto] items-center gap-2"
                data-testid={`step-editorial-area-month-${idx}`}
              >
                <input
                  type="text"
                  className={inputCls}
                  value={m.month}
                  onChange={(e) => updateMonth(idx, { month: e.target.value })}
                  placeholder="May '26"
                  data-testid={`step-editorial-area-month-label-${idx}`}
                />
                <input
                  type="text"
                  inputMode="numeric"
                  className={inputCls}
                  value={m.medianPrice}
                  onChange={(e) =>
                    updateMonth(idx, { medianPrice: e.target.value })
                  }
                  placeholder="642000"
                  data-testid={`step-editorial-area-month-value-${idx}`}
                />
                <button
                  type="button"
                  onClick={() => removeMonth(idx)}
                  className="text-xs text-neutral-500 hover:text-red-400"
                  data-testid={`step-editorial-area-month-remove-${idx}`}
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
        )}
        {series.length < MAX_MONTHLY && (
          <button
            type="button"
            onClick={addMonth}
            data-testid="step-editorial-area-month-add"
            className="rounded border border-neutral-700 px-3 py-1.5 text-xs text-text-primary hover:bg-neutral-800"
          >
            + Add a month
          </button>
        )}
      </div>
    </>
  );
}

