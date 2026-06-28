"use client";

import { useState } from "react";
import { NumberInput, PercentInput } from "@/components/inputs";
import {
  type WhyUs,
  type MarketingPoint,
  type PerformanceStat,
  type ProcessStep,
  WHYUS_CAPS,
  WHYUS_CAP_NUDGE,
} from "@/lib/whyus";

/**
 * B0a — "Why us" capture UI.
 *
 * Data-IN only (B0b renders these on the seller page). Matches the existing
 * BrandProfileForm visual language exactly — this is not a redesign. The
 * dashboard/settings stay clean + utilitarian; the design run targets the
 * consumer artifact, not this surface.
 */

const INPUT_CLASS =
  "w-full bg-neutral-900 border border-neutral-800 rounded-md px-3 py-2 text-base lg:text-sm focus:outline-none focus:border-mint";

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
        <span className="text-xs uppercase tracking-[0.18em] text-neutral-400">
          Why us
        </span>
        <span aria-hidden className="text-base leading-none text-mint">
          {open ? "▾" : "▸"}
        </span>
      </button>
      <p className="-mt-2 text-[11px] text-neutral-600 leading-relaxed">
        Your pre-listing pitch, set once, shown on every seller page. Edit the
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
          <p
            className="text-[11px] text-neutral-500 leading-relaxed mb-2"
            data-testid="whyus-stats-help"
          >
            Optional. Pull these from your portal or agent profile — your
            Zillow/MLS dashboard usually shows sale-to-list, days on market, and
            views. Skip any you don&apos;t have; empty stats simply don&apos;t
            show.
          </p>
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
              placeholder="If you're not happy, cancel anytime. No fees, no hard feelings."
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
 * One stat value cell. Defined at MODULE scope on purpose: when this lived
 * inside PerformanceStatsGroup's body it was a fresh component identity on every
 * render, so each keystroke (onChange → parent re-render) remounted the input
 * and dropped focus after a single digit (P0). Hoisted out, its identity is
 * stable, so the field keeps focus while the agent types. `unit === "%"` routes
 * to PercentInput (decimals + "%"), anything else to NumberInput (comma-grouped
 * integers) — never a raw input. Both format on blur, not per keystroke.
 */
function StatValueInput({
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
}) {
  return unit === "%" ? (
    <PercentInput
      value={value}
      onChange={onValue}
      placeholder={placeholder}
      aria-label={testId}
    />
  ) : (
    <NumberInput
      value={value}
      onChange={onValue}
      placeholder={placeholder}
      aria-label={testId}
    />
  );
}

/**
 * A usable EXAMPLE value for a stat's own number field — a real-looking figure
 * the agent can pattern-match against, not a format description. Keyed off the
 * canonical unit/label so each pre-labeled row shows what "good" looks like.
 */
function statExample(stat: PerformanceStat): string {
  const label = stat.label.toLowerCase();
  if (stat.unit === "%") return "99%";
  if (stat.unit === "days" || label.includes("day")) return "14";
  if (stat.unit === "views" || label.includes("view")) return "1,240";
  if (label.includes("sold")) return "32";
  if (label.includes("review")) return "120";
  return "1,240";
}

/** A light market-average example: only the percentage rows get a number; the
 *  rest leave the optional column visibly empty. */
function marketExample(stat: PerformanceStat): string {
  return stat.unit === "%" ? "96%" : "—";
}

/**
 * The quantified-comparison rows ("Your results, by the numbers"). Arrives
 * PRE-LABELED so the agent only types numbers; the label stays editable for
 * custom rows. Presented as a prominent, collapsible card (the agent's moment
 * to flex their proof) with a filled/unfilled indicator. Default OPEN so it
 * reads as an invitation, not a tucked-away advanced setting.
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
  const [open, setOpen] = useState(true);
  const atCap = stats.length >= cap;
  const filled = stats.filter((s) => s.yourValue.trim()).length;
  const patch = (idx: number, patchObj: Partial<PerformanceStat>) =>
    onChange(stats.map((s, j) => (j === idx ? { ...s, ...patchObj } : s)));

  return (
    <div
      className="space-y-3 rounded-lg border border-neutral-800 bg-neutral-900/50 p-4"
      data-testid="whyus-stats-group"
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        data-testid="whyus-stats-toggle"
        aria-expanded={open}
        className="flex w-full items-start justify-between gap-3 text-left"
      >
        <div className="space-y-1">
          <h4 className="text-sm font-semibold text-text-primary">
            Your results, by the numbers
          </h4>
          <p className="text-[11px] text-neutral-500 leading-relaxed">
            This is your track record. It is what earns you the listing.
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span
            className={`rounded-full border px-2 py-0.5 text-[10px] ${
              filled > 0
                ? "border-mint/40 text-mint"
                : "border-neutral-700 text-neutral-500"
            }`}
            data-testid="whyus-stats-filled"
          >
            {filled > 0 ? `${filled} filled` : "Not started"}
          </span>
          <span aria-hidden className="text-base leading-none text-neutral-400">
            {open ? "▾" : "▸"}
          </span>
        </div>
      </button>

      {open && (
        <div className="space-y-3 pt-1" data-testid="whyus-stats-body">
          <p className="text-[11px] text-neutral-600 leading-relaxed">
            Fill in the numbers you are proud of. Each row shows on your
            presentation once it has a number, next to the market average if you
            add one. Leave any row blank to hide it. Two or three strong numbers
            land harder than a full wall.
          </p>
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
                  placeholder="What does this number measure?"
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
                    Your number
                  </label>
                  <StatValueInput
                    value={stat.yourValue}
                    unit={stat.unit}
                    onValue={(v) => patch(idx, { yourValue: v })}
                    testId={`whyus-stat-your-${idx}`}
                    placeholder={statExample(stat)}
                  />
                </div>
                <div>
                  <label className="block text-[9px] uppercase tracking-wider text-neutral-600 mb-1">
                    Market average (optional)
                  </label>
                  <StatValueInput
                    value={stat.marketValue ?? ""}
                    unit={stat.unit}
                    onValue={(v) => patch(idx, { marketValue: v || undefined })}
                    testId={`whyus-stat-market-${idx}`}
                    placeholder={marketExample(stat)}
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
      )}
    </div>
  );
}
