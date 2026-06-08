"use client";

import { useEffect, useState } from "react";
import { NumberInput, PercentInput } from "@/components/inputs";
import type { Review } from "@/tools/seller-presentation/engine/types";
import {
  type WhyUs,
  type MarketingPoint,
  type PerformanceStat,
  type ProcessStep,
  WHYUS_CAPS,
  WHYUS_CAP_NUDGE,
} from "@/lib/whyus";
import type { ReviewDraftSuggestions } from "@/lib/ai/review-draft-mapper";

/**
 * B0a — "Why us" capture UI + the "Draft from your reviews" AI helper.
 *
 * Data-IN only (B0b renders these on the seller page). Matches the existing
 * BrandProfileForm visual language exactly — this is not a redesign. The
 * dashboard/settings stay clean + utilitarian; the design run targets the
 * consumer artifact, not this surface.
 */

const INPUT_CLASS =
  "w-full bg-neutral-900 border border-neutral-800 rounded-md px-3 py-2 text-base lg:text-sm focus:outline-none focus:border-mint";

// ---------------------------------------------------------------------------
// Draft from your reviews
// ---------------------------------------------------------------------------

type DraftTarget = "agentBioShort" | "agentTagline" | "reviewsHeadline";

/**
 * The button + panel that turns the agent's own reviews into editable bio /
 * tagline / reviews-headline suggestions. Operates ONLY on the reviews already
 * entered (passed in) plus an optional paste-in — never fetches a URL. The
 * agent edits then applies each suggestion to its field; nothing auto-writes.
 */
export function DraftFromReviews({
  reviews,
  onApply,
}: {
  reviews: Review[];
  onApply: (field: DraftTarget, value: string) => void;
}) {
  const [pasted, setPasted] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<ReviewDraftSuggestions | null>(null);
  // B0b — kill-switch gate (parity with ImportCompsButton). `null` while the
  // flag resolves; the affordance stays hidden until the server confirms
  // REVIEW_DRAFT_ENABLED === 'true', so a disabled feature never flashes a
  // button that 503s. Manual entry of bio/tagline/headline is unaffected.
  const [enabled, setEnabled] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/entitlements/me", { credentials: "same-origin" })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (cancelled || !data || !data.ok) return;
        setEnabled(!!data.features?.reviewDraftEnabled);
      })
      .catch(() => {
        // Network failure → stays hidden; the agent still writes these fields
        // by hand in the form above.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const hasSource = reviews.some((r) => r.body.trim()) || pasted.trim().length > 0;

  const runDraft = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/draft-from-reviews", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ reviews, pastedReviews: pasted }),
      });
      const data = (await res.json()) as
        | { ok: true; suggestions: ReviewDraftSuggestions }
        | { ok: false; message: string };
      if (!data.ok) {
        setError(data.message);
        return;
      }
      setDraft(data.suggestions);
    } catch {
      setError("Couldn't draft just now — you can write these yourself or try again.");
    } finally {
      setLoading(false);
    }
  };

  // Hidden until the kill switch confirms the feature is on (or still loading).
  if (enabled !== true) return null;

  return (
    <div
      className="space-y-3 rounded border border-neutral-800 bg-neutral-900/40 p-3"
      data-testid="draft-from-reviews"
    >
      <div className="flex items-center justify-between gap-3">
        <span className="text-[10px] uppercase tracking-[0.15em] text-neutral-500">
          Draft from your reviews
        </span>
        <button
          type="button"
          onClick={runDraft}
          disabled={loading || !hasSource}
          data-testid="draft-from-reviews-run"
          className="rounded border border-neutral-700 px-3 py-1.5 text-xs text-text-primary hover:bg-neutral-800 disabled:opacity-40 disabled:hover:bg-transparent"
        >
          {loading ? "Drafting…" : "Draft from your reviews"}
        </button>
      </div>
      <p className="text-[11px] text-neutral-600 leading-relaxed">
        Uses the reviews you&apos;ve entered to suggest a bio, tagline, and
        reviews headline. You edit anything before it&apos;s applied.
      </p>

      <details className="text-xs text-neutral-500">
        <summary className="cursor-pointer hover:text-neutral-300">
          Paste more reviews (optional)
        </summary>
        <textarea
          value={pasted}
          onChange={(e) => setPasted(e.target.value)}
          placeholder="Paste a few more reviews here if you have only a couple entered above."
          rows={4}
          data-testid="draft-from-reviews-paste"
          className={`${INPUT_CLASS} mt-2 resize-y`}
        />
      </details>

      {error && (
        <p
          className="text-[11px] text-amber-400/90 leading-relaxed"
          data-testid="draft-from-reviews-error"
        >
          {error}
        </p>
      )}

      {draft && (
        <div className="space-y-3 pt-1" data-testid="draft-from-reviews-results">
          <Suggestion
            label="Suggested bio"
            initial={draft.bio}
            multiline
            testId="suggested-bio"
            onApply={(v) => onApply("agentBioShort", v)}
          />
          <Suggestion
            label="Suggested tagline"
            initial={draft.tagline}
            testId="suggested-tagline"
            onApply={(v) => onApply("agentTagline", v)}
          />
          <Suggestion
            label="Suggested reviews headline"
            initial={draft.reviewsHeadline}
            testId="suggested-reviews-headline"
            onApply={(v) => onApply("reviewsHeadline", v)}
          />
        </div>
      )}
    </div>
  );
}

/** One editable suggestion card with an Apply button. */
function Suggestion({
  label,
  initial,
  multiline,
  testId,
  onApply,
}: {
  label: string;
  initial: string;
  multiline?: boolean;
  testId: string;
  onApply: (value: string) => void;
}) {
  const [value, setValue] = useState(initial);
  const [applied, setApplied] = useState(false);

  return (
    <div className="space-y-1.5" data-testid={testId}>
      <div className="flex items-center justify-between">
        <span className="text-[10px] uppercase tracking-[0.15em] text-neutral-500">
          {label}
        </span>
        <button
          type="button"
          onClick={() => {
            onApply(value);
            setApplied(true);
          }}
          data-testid={`${testId}-apply`}
          className="text-xs text-mint hover:underline"
        >
          {applied ? "Applied ✓" : "Apply"}
        </button>
      </div>
      {multiline ? (
        <textarea
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            setApplied(false);
          }}
          rows={3}
          data-testid={`${testId}-input`}
          className={`${INPUT_CLASS} resize-y`}
        />
      ) : (
        <input
          type="text"
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            setApplied(false);
          }}
          data-testid={`${testId}-input`}
          className={INPUT_CLASS}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Why us
// ---------------------------------------------------------------------------

/**
 * The collapsible "Why us" group. Add/remove/reorder rows per list, soft caps
 * with the calm nudge, formatted inputs for the stat numbers. Autosaves
 * through the same localStorage path as the rest of Settings (the parent's
 * onChange → update("whyUs", …)).
 */
export function WhyUsSection({
  whyUs,
  onChange,
}: {
  whyUs: WhyUs;
  onChange: (next: WhyUs) => void;
}) {
  const [open, setOpen] = useState(false);

  const setField = <K extends keyof WhyUs>(key: K, value: WhyUs[K]) =>
    onChange({ ...whyUs, [key]: value });

  return (
    <div className="space-y-4 border-t border-neutral-900 pt-6">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        data-testid="whyus-toggle"
        aria-expanded={open}
        className="flex w-full items-center justify-between text-left"
      >
        <span className="text-xs uppercase tracking-[0.18em] text-neutral-500">
          Why us
        </span>
        <span className="text-neutral-600 text-sm">{open ? "−" : "+"}</span>
      </button>
      <p className="-mt-2 text-[11px] text-neutral-600 leading-relaxed">
        Your pre-listing pitch — set once, shown on every seller page. Edit the
        examples below; leave anything blank to hide it.
      </p>

      {open && (
        <div className="space-y-8" data-testid="whyus-body">
          {/* Differentiators */}
          <StringListGroup
            heading="Why work with us"
            help="Short reasons a seller should choose your team."
            items={whyUs.differentiators}
            cap={WHYUS_CAPS.differentiators}
            placeholder="We average more views per listing than any team in the area."
            testPrefix="whyus-diff"
            onChange={(items) => setField("differentiators", items)}
          />

          {/* Marketing approach */}
          <TitleDetailGroup
            heading="How we market your home"
            help="The pieces of your marketing process."
            items={whyUs.marketingApproach}
            cap={WHYUS_CAPS.marketingApproach}
            titlePlaceholder="Professional photography & video"
            detailPlaceholder="Every listing, shot by a pro."
            titleKey="title"
            testPrefix="whyus-mkt"
            onChange={(items) => setField("marketingApproach", items as MarketingPoint[])}
          />

          {/* Performance stats */}
          <PerformanceStatsGroup
            stats={whyUs.performanceStats}
            cap={WHYUS_CAPS.performanceStats}
            onChange={(items) => setField("performanceStats", items)}
          />

          {/* How we work */}
          <TitleDetailGroup
            heading="How we work"
            help="Your step-by-step process, in order."
            items={whyUs.howWeWork}
            cap={WHYUS_CAPS.howWeWork}
            titlePlaceholder="Walk the home together"
            detailPlaceholder="We see what buyers will see and plan around it."
            titleKey="step"
            testPrefix="whyus-step"
            ordered
            onChange={(items) => setField("howWeWork", items as ProcessStep[])}
          />

          {/* Guarantee */}
          <div>
            <label className="block text-[10px] uppercase tracking-[0.15em] text-neutral-500 mb-2">
              Our guarantee (optional)
            </label>
            <textarea
              value={whyUs.guarantee ?? ""}
              onChange={(e) => setField("guarantee", e.target.value || undefined)}
              placeholder="If you're not happy, cancel anytime — no fees, no hard feelings."
              rows={2}
              data-testid="whyus-guarantee"
              className={`${INPUT_CLASS} resize-y`}
            />
          </div>
        </div>
      )}
    </div>
  );
}

/** Shared reorder controls. */
function RowControls({
  idx,
  count,
  onMove,
  onRemove,
  testPrefix,
}: {
  idx: number;
  count: number;
  onMove: (from: number, to: number) => void;
  onRemove: (idx: number) => void;
  testPrefix: string;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <button
        type="button"
        onClick={() => onMove(idx, idx - 1)}
        disabled={idx === 0}
        aria-label="Move up"
        data-testid={`${testPrefix}-up-${idx}`}
        className="text-xs text-neutral-500 hover:text-neutral-200 disabled:opacity-30"
      >
        ↑
      </button>
      <button
        type="button"
        onClick={() => onMove(idx, idx + 1)}
        disabled={idx === count - 1}
        aria-label="Move down"
        data-testid={`${testPrefix}-down-${idx}`}
        className="text-xs text-neutral-500 hover:text-neutral-200 disabled:opacity-30"
      >
        ↓
      </button>
      <button
        type="button"
        onClick={() => onRemove(idx)}
        data-testid={`${testPrefix}-remove-${idx}`}
        className="text-xs text-neutral-500 hover:text-red-400"
      >
        Remove
      </button>
    </div>
  );
}

function moveItem<T>(items: T[], from: number, to: number): T[] {
  if (to < 0 || to >= items.length) return items;
  const next = items.slice();
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
}

function GroupHeading({ heading, help }: { heading: string; help: string }) {
  return (
    <div className="space-y-1">
      <h4 className="text-[11px] font-medium text-neutral-300">{heading}</h4>
      <p className="text-[11px] text-neutral-600 leading-relaxed">{help}</p>
    </div>
  );
}

function CapNudge({ atCap }: { atCap: boolean }) {
  if (!atCap) return null;
  return (
    <p className="text-[11px] text-neutral-600 italic" data-testid="whyus-cap-nudge">
      {WHYUS_CAP_NUDGE}
    </p>
  );
}

/** A simple string[] list group (differentiators). */
function StringListGroup({
  heading,
  help,
  items,
  cap,
  placeholder,
  testPrefix,
  onChange,
}: {
  heading: string;
  help: string;
  items: string[];
  cap: number;
  placeholder: string;
  testPrefix: string;
  onChange: (items: string[]) => void;
}) {
  const atCap = items.length >= cap;
  return (
    <div className="space-y-3">
      <GroupHeading heading={heading} help={help} />
      {items.map((item, idx) => (
        <div key={idx} className="space-y-1.5" data-testid={`${testPrefix}-row-${idx}`}>
          <div className="flex items-center justify-end">
            <RowControls
              idx={idx}
              count={items.length}
              onMove={(f, t) => onChange(moveItem(items, f, t))}
              onRemove={(i) => onChange(items.filter((_, j) => j !== i))}
              testPrefix={testPrefix}
            />
          </div>
          <input
            type="text"
            value={item}
            onChange={(e) => onChange(items.map((it, j) => (j === idx ? e.target.value : it)))}
            placeholder={placeholder}
            data-testid={`${testPrefix}-input-${idx}`}
            className={INPUT_CLASS}
          />
        </div>
      ))}
      <CapNudge atCap={atCap} />
      {!atCap && (
        <button
          type="button"
          onClick={() => onChange([...items, ""])}
          data-testid={`${testPrefix}-add`}
          className="rounded border border-neutral-700 px-3 py-1.5 text-xs text-text-primary hover:bg-neutral-800"
        >
          + Add
        </button>
      )}
    </div>
  );
}

/**
 * A {title|step, detail?} row. Both MarketingPoint and ProcessStep widen to
 * this (all keys optional) so the group can edit either; the call site casts
 * the result back to the concrete type.
 */
interface TitleDetailItem {
  title?: string;
  step?: string;
  detail?: string;
}

/** A {title|step, detail?} list group (marketing approach / how-we-work). */
function TitleDetailGroup({
  heading,
  help,
  items,
  cap,
  titlePlaceholder,
  detailPlaceholder,
  titleKey,
  testPrefix,
  ordered,
  onChange,
}: {
  heading: string;
  help: string;
  items: TitleDetailItem[];
  cap: number;
  titlePlaceholder: string;
  detailPlaceholder: string;
  titleKey: "title" | "step";
  testPrefix: string;
  ordered?: boolean;
  onChange: (items: TitleDetailItem[]) => void;
}) {
  const atCap = items.length >= cap;
  const patch = (idx: number, key: keyof TitleDetailItem, value: string) =>
    onChange(items.map((it, j) => (j === idx ? { ...it, [key]: value || undefined } : it)));

  return (
    <div className="space-y-3">
      <GroupHeading heading={heading} help={help} />
      {items.map((item, idx) => (
        <div
          key={idx}
          className="space-y-2 rounded border border-neutral-800 bg-neutral-900/40 p-3"
          data-testid={`${testPrefix}-row-${idx}`}
        >
          <div className="flex items-center justify-between">
            <span className="text-[10px] uppercase tracking-wider text-neutral-500">
              {ordered ? `Step ${idx + 1}` : `Point ${idx + 1}`}
            </span>
            <RowControls
              idx={idx}
              count={items.length}
              onMove={(f, t) => onChange(moveItem(items, f, t))}
              onRemove={(i) => onChange(items.filter((_, j) => j !== i))}
              testPrefix={testPrefix}
            />
          </div>
          <input
            type="text"
            value={item[titleKey] ?? ""}
            onChange={(e) => patch(idx, titleKey, e.target.value)}
            placeholder={titlePlaceholder}
            data-testid={`${testPrefix}-title-${idx}`}
            className={INPUT_CLASS}
          />
          <textarea
            value={item.detail ?? ""}
            onChange={(e) => patch(idx, "detail", e.target.value)}
            placeholder={detailPlaceholder}
            rows={2}
            data-testid={`${testPrefix}-detail-${idx}`}
            className={`${INPUT_CLASS} resize-y`}
          />
        </div>
      ))}
      <CapNudge atCap={atCap} />
      {!atCap && (
        <button
          type="button"
          onClick={() => onChange([...items, { [titleKey]: "" }])}
          data-testid={`${testPrefix}-add`}
          className="rounded border border-neutral-700 px-3 py-1.5 text-xs text-text-primary hover:bg-neutral-800"
        >
          + Add
        </button>
      )}
    </div>
  );
}

/**
 * The quantified-comparison rows. Arrives PRE-LABELED so the agent only types
 * numbers. The label is editable (for custom rows) but the canonical rows lead
 * with their label set. `unit === "%"` → PercentInput (decimals), else
 * NumberInput (comma-grouped integers) — never a raw input.
 */
function PerformanceStatsGroup({
  stats,
  cap,
  onChange,
}: {
  stats: PerformanceStat[];
  cap: number;
  onChange: (items: PerformanceStat[]) => void;
}) {
  const atCap = stats.length >= cap;
  const patch = (idx: number, patchObj: Partial<PerformanceStat>) =>
    onChange(stats.map((s, j) => (j === idx ? { ...s, ...patchObj } : s)));

  const ValueInput = ({
    value,
    unit,
    onValue,
    testId,
    placeholder,
  }: {
    value: string;
    unit?: string;
    onValue: (v: string) => void;
    testId: string;
    placeholder: string;
  }) =>
    unit === "%" ? (
      <PercentInput value={value} onChange={onValue} placeholder={placeholder} aria-label={testId} />
    ) : (
      <NumberInput value={value} onChange={onValue} placeholder={placeholder} aria-label={testId} />
    );

  return (
    <div className="space-y-3">
      <GroupHeading
        heading="Your results, by the numbers"
        help="Pre-labeled — just fill in the numbers. Leave any row blank to hide it."
      />
      {stats.map((stat, idx) => (
        <div
          key={idx}
          className="space-y-2 rounded border border-neutral-800 bg-neutral-900/40 p-3"
          data-testid={`whyus-stat-row-${idx}`}
        >
          <div className="flex items-center justify-between gap-2">
            <input
              type="text"
              value={stat.label}
              onChange={(e) => patch(idx, { label: e.target.value })}
              placeholder="Stat label"
              data-testid={`whyus-stat-label-${idx}`}
              className={`${INPUT_CLASS} flex-1`}
            />
            <RowControls
              idx={idx}
              count={stats.length}
              onMove={(f, t) => onChange(moveItem(stats, f, t))}
              onRemove={(i) => onChange(stats.filter((_, j) => j !== i))}
              testPrefix="whyus-stat"
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-[9px] uppercase tracking-wider text-neutral-600 mb-1">
                You{stat.unit ? ` (${stat.unit})` : ""}
              </label>
              <ValueInput
                value={stat.yourValue}
                unit={stat.unit}
                onValue={(v) => patch(idx, { yourValue: v })}
                testId={`whyus-stat-your-${idx}`}
                placeholder={stat.unit === "%" ? "98.2%" : "1,240"}
              />
            </div>
            <div>
              <label className="block text-[9px] uppercase tracking-wider text-neutral-600 mb-1">
                Market avg (optional)
              </label>
              <ValueInput
                value={stat.marketValue ?? ""}
                unit={stat.unit}
                onValue={(v) => patch(idx, { marketValue: v || undefined })}
                testId={`whyus-stat-market-${idx}`}
                placeholder={stat.unit === "%" ? "96.0%" : "—"}
              />
            </div>
          </div>
        </div>
      ))}
      <CapNudge atCap={atCap} />
      {!atCap && (
        <button
          type="button"
          onClick={() => onChange([...stats, { label: "", yourValue: "" }])}
          data-testid="whyus-stat-add"
          className="rounded border border-neutral-700 px-3 py-1.5 text-xs text-text-primary hover:bg-neutral-800"
        >
          + Add a stat
        </button>
      )}
    </div>
  );
}
