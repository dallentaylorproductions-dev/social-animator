"use client";

import { useEffect, useState } from "react";
import { ImageUploadField } from "@/components/ImageUploadField";
import type {
  AreaStats,
  AreaStatsMonthly,
  BuyerQuote,
  PresentationVideo,
  Review,
  ReviewsOutlink,
  SellerPresentationDraft,
  TrackRecord,
  TrackRecordFigure,
  TrackRecordTestimonial,
} from "../engine/types";

/**
 * Seller Presentation Step 5 — Editorial extras (v1.47 / A7d).
 *
 * One fully OPTIONAL step capturing every block the locked-design
 * renderer + serializer already handle (A7a/A7b): agentNote, video,
 * trackRecord, reviews, areaStats, buyerQuote, editorialPhotoUrl.
 *
 * Each block is a skippable card. When the agent hasn't added it,
 * a single "+ Add …" button shows. Clicking opens the inline editor
 * for that block. "Remove this section" clears the block's draft
 * fields and collapses the card back to the add affordance.
 *
 * Why no required fields, no gating, and no soft caps: the renderer
 * hides every block individually when its source data is absent
 * (see presentation-page.tsx's per-section null returns). Skipping
 * the whole step still publishes a tight page (the MINIMAL fixture
 * proves this in e2e/seller-presentation.page-render.spec.ts).
 *
 * Photos reuse the shared <ImageUploadField> (A7c.2): camera-roll
 * picker → client downscale → Vercel Blob → hosted URL stored on
 * the draft. No new upload infra. Video.videoUrl is a URL-only
 * input — real video hosting is a deferred Pro-tier follow-on.
 *
 * Copy rules carried from A7c.x:
 *   - Placeholders are short, real, in-window examples (not format
 *     descriptions).
 *   - Repeatable rows cycle a curated example set per index.
 *   - No em-dashes in any user-facing string.
 *   - One purpose line per card, written for a non-expert agent.
 *
 * SSR-safe (Substrate §9): `addedSections` initializes empty on
 * server + first client render, hydrates from the draft in a
 * useEffect post-mount. Without this, a section that was added on
 * a prior session would render unmounted on the server and remount
 * after hydration — a hydration-mismatch flake.
 *
 * No serializer / renderer changes — A7a/A7b already consume every
 * field captured here. The single source of truth for what reaches
 * /h/[slug] stays `toPublicPayload` in ../output/public-payload.ts.
 */

interface StepEditorialProps {
  draft: SellerPresentationDraft;
  setDraft: (next: SellerPresentationDraft) => void;
}

const inputCls =
  "w-full px-3 py-2 bg-neutral-900 border border-neutral-700 rounded text-sm focus:outline-none focus:border-mint";
const textareaCls = `${inputCls} resize-y min-h-[80px]`;

type SectionKey =
  | "agentNote"
  | "video"
  | "trackRecord"
  | "reviews"
  | "areaStats"
  | "buyerQuote"
  | "editorialPhoto";

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
    key: "agentNote",
    title: "Personal note",
    purpose:
      "One sentence from you, in your own voice, at the top of the page.",
    addLabel: "+ Add a personal note",
  },
  {
    key: "video",
    title: "Walk-through video",
    purpose:
      "A short video of you walking the seller through the plan. Hosted elsewhere; paste the link.",
    addLabel: "+ Add a video",
  },
  {
    key: "trackRecord",
    title: "Track record",
    purpose:
      "Up to three figures from your sales, and one testimonial. The card hides if you leave it empty.",
    addLabel: "+ Add your track record",
  },
  {
    key: "reviews",
    title: "Reviews",
    purpose:
      "A handful of reviews you'd hand a seller. Add as many or as few as you have.",
    addLabel: "+ Add reviews",
  },
  {
    key: "areaStats",
    title: "Area snapshot",
    purpose:
      "Stats for the seller's neighborhood. Each field is optional; leave any you don't have.",
    addLabel: "+ Add an area snapshot",
  },
  {
    key: "buyerQuote",
    title: "Pull-quote about the home",
    purpose:
      "A line from a buyer, peer, or your own writing that captures how this home reads.",
    addLabel: "+ Add a pull-quote",
  },
  {
    key: "editorialPhoto",
    title: "Editorial photo",
    purpose:
      "A second, warm photo that sets the tone above the pull-quote. Different from the hero.",
    addLabel: "+ Add an editorial photo",
  },
];

/** Rotating example placeholders for the reviews list. */
const REVIEW_EXAMPLES: ReadonlyArray<{
  body: string;
  name: string;
  year: string;
  street: string;
}> = [
  {
    body: "She walked us through every offer in plain English and never made us feel rushed.",
    name: "D. & K. Bauer",
    year: "2025",
    street: "Castle Avenue",
  },
  {
    body: "Quiet, calm, prepared. We had a clear plan from week one.",
    name: "A. Park",
    year: "2024",
    street: "Professor Avenue",
  },
  {
    body: "She turned what we thought would be a stressful summer into something almost easy.",
    name: "E. & T. Chen",
    year: "2023",
    street: "W 14th",
  },
];

/** Rotating example placeholders for track-record figures. */
const FIGURE_EXAMPLES: ReadonlyArray<{
  label: string;
  value: string;
  ctx: string;
}> = [
  { label: "Homes sold in Tremont", value: "40", ctx: "Trailing 36 months" },
  { label: "Average days on market", value: "11 days", ctx: "Area average is 21" },
  { label: "List-to-sale ratio", value: "102%", ctx: "How close listings close to ask" },
];

function reviewExample(idx: number) {
  return REVIEW_EXAMPLES[idx % REVIEW_EXAMPLES.length];
}

function figureExample(idx: number) {
  return FIGURE_EXAMPLES[idx % FIGURE_EXAMPLES.length];
}

/**
 * Detect which sections the loaded draft already has content for.
 * Used post-mount to open exactly those cards on resume so the agent
 * sees their prior work without an extra click.
 */
function sectionsWithContent(draft: SellerPresentationDraft): SectionKey[] {
  const out: SectionKey[] = [];
  if (draft.agentNote?.trim()) out.push("agentNote");
  if (draft.video && Object.values(draft.video).some((v) => v?.trim())) {
    out.push("video");
  }
  if (
    draft.trackRecord &&
    ((draft.trackRecord.figures && draft.trackRecord.figures.length > 0) ||
      draft.trackRecord.testimonial)
  ) {
    out.push("trackRecord");
  }
  if ((draft.reviews && draft.reviews.length > 0) || draft.reviewsOutlink) {
    out.push("reviews");
  }
  if (
    draft.areaStats &&
    Object.values(draft.areaStats).some(
      (v) => (Array.isArray(v) ? v.length > 0 : Boolean(v?.toString().trim())),
    )
  ) {
    out.push("areaStats");
  }
  if (draft.buyerQuote) out.push("buyerQuote");
  if (draft.editorialPhotoUrl?.trim()) out.push("editorialPhoto");
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
      case "agentNote":
        setDraft({ ...draft, agentNote: undefined });
        break;
      case "video":
        setDraft({ ...draft, video: undefined });
        break;
      case "trackRecord":
        setDraft({ ...draft, trackRecord: undefined });
        break;
      case "reviews":
        setDraft({ ...draft, reviews: undefined, reviewsOutlink: undefined });
        break;
      case "areaStats":
        setDraft({ ...draft, areaStats: undefined });
        break;
      case "buyerQuote":
        setDraft({ ...draft, buyerQuote: undefined });
        break;
      case "editorialPhoto":
        setDraft({ ...draft, editorialPhotoUrl: undefined });
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
            {s.key === "agentNote" && (
              <AgentNoteEditor draft={draft} setDraft={setDraft} />
            )}
            {s.key === "video" && (
              <VideoEditor draft={draft} setDraft={setDraft} />
            )}
            {s.key === "trackRecord" && (
              <TrackRecordEditor draft={draft} setDraft={setDraft} />
            )}
            {s.key === "reviews" && (
              <ReviewsEditor draft={draft} setDraft={setDraft} />
            )}
            {s.key === "areaStats" && (
              <AreaStatsEditor draft={draft} setDraft={setDraft} />
            )}
            {s.key === "buyerQuote" && (
              <BuyerQuoteEditor draft={draft} setDraft={setDraft} />
            )}
            {s.key === "editorialPhoto" && (
              <EditorialPhotoEditor draft={draft} setDraft={setDraft} />
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
// AGENT NOTE
// =====================================================================

function AgentNoteEditor({ draft, setDraft }: StepEditorialProps) {
  return (
    <label className="block">
      <span className="text-[10px] uppercase tracking-[0.15em] text-neutral-500">
        Your note
      </span>
      <textarea
        className={`${textareaCls} mt-1`}
        value={draft.agentNote ?? ""}
        onChange={(e) =>
          setDraft({ ...draft, agentNote: e.target.value || undefined })
        }
        placeholder="Here's exactly what I'd do to sell your home, and why I'm so confident in the number."
        data-testid="step-editorial-agent-note-input"
      />
    </label>
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
      <label className="block">
        <span className="text-[10px] uppercase tracking-[0.15em] text-neutral-500">
          Video link
        </span>
        <input
          type="url"
          className={`${inputCls} mt-1`}
          value={v.videoUrl ?? ""}
          onChange={(e) =>
            setVideo({ videoUrl: e.target.value || undefined })
          }
          placeholder="https://www.loom.com/share/your-walk-through"
          data-testid="step-editorial-video-url"
        />
        <span className="mt-1 block text-[11px] text-neutral-500">
          Loom, YouTube, Vimeo, or any host you already use.
        </span>
      </label>
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
            placeholder="2 min 14 sec"
            data-testid="step-editorial-video-runtime"
          />
        </label>
        <label className="block">
          <span className="text-[10px] uppercase tracking-[0.15em] text-neutral-500">
            Recorded on
          </span>
          <input
            type="text"
            className={`${inputCls} mt-1`}
            value={v.recordedOn ?? ""}
            onChange={(e) =>
              setVideo({ recordedOn: e.target.value || undefined })
            }
            placeholder="Recorded May 19"
            data-testid="step-editorial-video-recorded-on"
          />
        </label>
      </div>
      <ImageUploadField
        label="Poster image"
        value={v.posterUrl ?? ""}
        onChange={(url) => setVideo({ posterUrl: url || undefined })}
        previewAspect="aspect-video"
        folder="seller-presentation/video-poster"
        testIdPrefix="step-editorial-video-poster"
        helpText="Optional. The still frame buyers see before the video plays."
        urlPlaceholder="…or paste a poster image URL"
      />
    </>
  );
}

// =====================================================================
// TRACK RECORD
// =====================================================================

const MAX_FIGURES = 3;

function TrackRecordEditor({ draft, setDraft }: StepEditorialProps) {
  const tr: TrackRecord = draft.trackRecord ?? {};

  const updateTrackRecord = (next: TrackRecord) => {
    const hasFigures = (next.figures?.length ?? 0) > 0;
    const hasTestimonial = Boolean(next.testimonial);
    setDraft({
      ...draft,
      trackRecord: hasFigures || hasTestimonial ? next : undefined,
    });
  };

  const figures: TrackRecordFigure[] = tr.figures ?? [];

  const updateFigure = (idx: number, patch: Partial<TrackRecordFigure>) => {
    const nextFigures = figures.map((f, i) =>
      i === idx ? { ...f, ...patch } : f,
    );
    updateTrackRecord({ ...tr, figures: nextFigures });
  };

  const addFigure = () => {
    if (figures.length >= MAX_FIGURES) return;
    updateTrackRecord({
      ...tr,
      figures: [...figures, { label: "", value: "" }],
    });
  };

  const removeFigure = (idx: number) => {
    const nextFigures = figures.filter((_, i) => i !== idx);
    updateTrackRecord({
      ...tr,
      figures: nextFigures.length ? nextFigures : undefined,
    });
  };

  const t: TrackRecordTestimonial = tr.testimonial ?? {
    body: "",
    attributionShort: "",
  };
  const updateTestimonial = (patch: Partial<TrackRecordTestimonial>) => {
    const next: TrackRecordTestimonial = { ...t, ...patch };
    const hasContent =
      next.body.trim().length > 0 || next.attributionShort.trim().length > 0;
    updateTrackRecord({
      ...tr,
      testimonial: hasContent ? next : undefined,
    });
  };

  return (
    <>
      <div className="space-y-3">
        <div className="text-[10px] uppercase tracking-[0.15em] text-neutral-500">
          Figures (up to {MAX_FIGURES})
        </div>
        {figures.length === 0 && (
          <p className="text-xs text-neutral-500">
            No figures yet. Add one to start.
          </p>
        )}
        {figures.map((fig, idx) => {
          const ex = figureExample(idx);
          return (
            <div
              key={idx}
              className="space-y-2 rounded border border-neutral-800 bg-neutral-900/40 p-3"
              data-testid={`step-editorial-figure-${idx}`}
            >
              <div className="flex items-center justify-between">
                <span className="text-[10px] uppercase tracking-wider text-neutral-500">
                  Figure {idx + 1}
                </span>
                <button
                  type="button"
                  onClick={() => removeFigure(idx)}
                  className="text-xs text-neutral-500 hover:text-red-400"
                  data-testid={`step-editorial-figure-remove-${idx}`}
                >
                  Remove
                </button>
              </div>
              <input
                type="text"
                className={inputCls}
                value={fig.label}
                onChange={(e) => updateFigure(idx, { label: e.target.value })}
                placeholder={`e.g. ${ex.label}`}
                data-testid={`step-editorial-figure-label-${idx}`}
              />
              <input
                type="text"
                className={inputCls}
                value={fig.value}
                onChange={(e) => updateFigure(idx, { value: e.target.value })}
                placeholder={`e.g. ${ex.value}`}
                data-testid={`step-editorial-figure-value-${idx}`}
              />
              <input
                type="text"
                className={inputCls}
                value={fig.ctx ?? ""}
                onChange={(e) =>
                  updateFigure(idx, { ctx: e.target.value || undefined })
                }
                placeholder={`e.g. ${ex.ctx}`}
                data-testid={`step-editorial-figure-ctx-${idx}`}
              />
            </div>
          );
        })}
        {figures.length < MAX_FIGURES && (
          <button
            type="button"
            onClick={addFigure}
            data-testid="step-editorial-figure-add"
            className="rounded border border-neutral-700 px-3 py-1.5 text-xs text-text-primary hover:bg-neutral-800"
          >
            + Add a figure
          </button>
        )}
      </div>

      <div className="space-y-2">
        <div className="text-[10px] uppercase tracking-[0.15em] text-neutral-500">
          Testimonial (optional)
        </div>
        <textarea
          className={textareaCls}
          value={t.body}
          onChange={(e) => updateTestimonial({ body: e.target.value })}
          placeholder="She walked us through every offer in plain English and we closed at $24k over ask."
          data-testid="step-editorial-testimonial-body"
        />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <input
            type="text"
            className={inputCls}
            value={t.attributionShort}
            onChange={(e) =>
              updateTestimonial({ attributionShort: e.target.value })
            }
            placeholder="D. & K. Bauer"
            data-testid="step-editorial-testimonial-attribution"
          />
          <input
            type="text"
            className={inputCls}
            value={t.areaOrYear ?? ""}
            onChange={(e) =>
              updateTestimonial({ areaOrYear: e.target.value || undefined })
            }
            placeholder="Sold on Castle Avenue, 2025"
            data-testid="step-editorial-testimonial-area-or-year"
          />
        </div>
      </div>
    </>
  );
}

// =====================================================================
// REVIEWS
// =====================================================================

function ReviewsEditor({ draft, setDraft }: StepEditorialProps) {
  const reviews: Review[] = draft.reviews ?? [];
  const outlink: ReviewsOutlink | undefined = draft.reviewsOutlink;

  const updateReviews = (next: Review[]) => {
    setDraft({ ...draft, reviews: next.length ? next : undefined });
  };

  const addReview = () => {
    updateReviews([...reviews, { body: "", attributionName: "" }]);
  };

  const updateReview = (idx: number, patch: Partial<Review>) => {
    updateReviews(reviews.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  };

  const removeReview = (idx: number) => {
    updateReviews(reviews.filter((_, i) => i !== idx));
  };

  const updateOutlink = (patch: Partial<ReviewsOutlink>) => {
    const next: ReviewsOutlink = {
      label: outlink?.label ?? "",
      url: outlink?.url ?? "",
      ...patch,
    };
    const hasContent = next.label.trim().length > 0 || next.url.trim().length > 0;
    setDraft({ ...draft, reviewsOutlink: hasContent ? next : undefined });
  };

  return (
    <>
      <div className="space-y-3">
        {reviews.length === 0 && (
          <p className="text-xs text-neutral-500">
            No reviews yet. Add one to start.
          </p>
        )}
        {reviews.map((rev, idx) => {
          const ex = reviewExample(idx);
          return (
            <div
              key={idx}
              className="space-y-2 rounded border border-neutral-800 bg-neutral-900/40 p-3"
              data-testid={`step-editorial-review-${idx}`}
            >
              <div className="flex items-center justify-between">
                <span className="text-[10px] uppercase tracking-wider text-neutral-500">
                  Review {idx + 1}
                </span>
                <button
                  type="button"
                  onClick={() => removeReview(idx)}
                  className="text-xs text-neutral-500 hover:text-red-400"
                  data-testid={`step-editorial-review-remove-${idx}`}
                >
                  Remove
                </button>
              </div>
              <textarea
                className={textareaCls}
                value={rev.body}
                onChange={(e) => updateReview(idx, { body: e.target.value })}
                placeholder={`e.g. ${ex.body}`}
                data-testid={`step-editorial-review-body-${idx}`}
              />
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <input
                  type="text"
                  className={inputCls}
                  value={rev.attributionName}
                  onChange={(e) =>
                    updateReview(idx, { attributionName: e.target.value })
                  }
                  placeholder={`e.g. ${ex.name}`}
                  data-testid={`step-editorial-review-name-${idx}`}
                />
                <input
                  type="text"
                  className={inputCls}
                  value={rev.attributionYear ?? ""}
                  onChange={(e) =>
                    updateReview(idx, {
                      attributionYear: e.target.value || undefined,
                    })
                  }
                  placeholder={`e.g. ${ex.year}`}
                  data-testid={`step-editorial-review-year-${idx}`}
                />
                <input
                  type="text"
                  className={inputCls}
                  value={rev.attributionStreet ?? ""}
                  onChange={(e) =>
                    updateReview(idx, {
                      attributionStreet: e.target.value || undefined,
                    })
                  }
                  placeholder={`e.g. ${ex.street}`}
                  data-testid={`step-editorial-review-street-${idx}`}
                />
              </div>
            </div>
          );
        })}
        <button
          type="button"
          onClick={addReview}
          data-testid="step-editorial-review-add"
          className="rounded border border-neutral-700 px-3 py-1.5 text-xs text-text-primary hover:bg-neutral-800"
        >
          + Add a review
        </button>
      </div>

      <div className="space-y-2 border-t border-neutral-800 pt-3">
        <div className="text-[10px] uppercase tracking-[0.15em] text-neutral-500">
          Link out (optional)
        </div>
        <p className="text-xs text-neutral-500">
          Send seekers to a page with all your reviews.
        </p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_2fr]">
          <input
            type="text"
            className={inputCls}
            value={outlink?.label ?? ""}
            onChange={(e) => updateOutlink({ label: e.target.value })}
            placeholder="See all reviews on Zillow"
            data-testid="step-editorial-outlink-label"
          />
          <input
            type="url"
            className={inputCls}
            value={outlink?.url ?? ""}
            onChange={(e) => updateOutlink({ url: e.target.value })}
            placeholder="https://www.zillow.com/profile/your-handle"
            data-testid="step-editorial-outlink-url"
          />
        </div>
      </div>
    </>
  );
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

// =====================================================================
// BUYER QUOTE
// =====================================================================

function BuyerQuoteEditor({ draft, setDraft }: StepEditorialProps) {
  const q: BuyerQuote = draft.buyerQuote ?? { body: "", source: "" };
  const update = (patch: Partial<BuyerQuote>) => {
    const next: BuyerQuote = { ...q, ...patch };
    const hasContent =
      next.body.trim().length > 0 || next.source.trim().length > 0;
    setDraft({ ...draft, buyerQuote: hasContent ? next : undefined });
  };

  return (
    <>
      <label className="block">
        <span className="text-[10px] uppercase tracking-[0.15em] text-neutral-500">
          Quote
        </span>
        <textarea
          className={`${textareaCls} mt-1`}
          value={q.body}
          onChange={(e) => update({ body: e.target.value })}
          placeholder="A house like this doesn't sit on the market. It gets chosen, quickly, by the right person."
          data-testid="step-editorial-quote-body"
        />
      </label>
      <label className="block">
        <span className="text-[10px] uppercase tracking-[0.15em] text-neutral-500">
          Source
        </span>
        <input
          type="text"
          className={`${inputCls} mt-1`}
          value={q.source}
          onChange={(e) => update({ source: e.target.value })}
          placeholder="From a buyer's offer letter, April 2026"
          data-testid="step-editorial-quote-source"
        />
      </label>
    </>
  );
}

// =====================================================================
// EDITORIAL PHOTO
// =====================================================================

function EditorialPhotoEditor({ draft, setDraft }: StepEditorialProps) {
  return (
    <ImageUploadField
      label="Editorial photo"
      value={draft.editorialPhotoUrl ?? ""}
      onChange={(url) =>
        setDraft({ ...draft, editorialPhotoUrl: url || undefined })
      }
      previewAspect="aspect-[16/7]"
      folder="seller-presentation/editorial"
      testIdPrefix="step-editorial-photo"
      helpText="A wide, warm image. Lifestyle works better than another listing shot."
      urlPlaceholder="…or paste an image URL"
    />
  );
}

