"use client";

import {
  SEGMENTS,
  type SegmentKey,
} from "@/lib/studio-profile/setup-state";

/**
 * SegmentedProgress — six labeled segments (Studio Profile, Slice 1).
 *
 * NOT a percentage bar (the build packet's call): six discrete, labeled
 * segments — You ✓ · Reach ✓ · Proof ● · How you sell · Recent work · Brand —
 * so the flow reads finite and premium, with no odd percentage math. Phase 1
 * (Client-ready) and Phase 2 (Finish your reusable profile) are grouped so both
 * phases stay visible at once.
 *
 * Drives off three inputs: which segments are DONE (committed to the brand
 * record), which one is ACTIVE (the current step), and the rest UPCOMING. Phase
 * 2 segments render as quiet "upcoming" stubs in Slice 1.
 */
export function SegmentedProgress({
  done,
  active,
  layout = "rail",
  selectable,
  onSelect,
}: {
  done: ReadonlySet<SegmentKey>;
  active: SegmentKey | null;
  /** "rail" = desktop vertical left rail; "bar" = mobile horizontal strip. */
  layout?: "rail" | "bar";
  /** Segments the agent can click to jump back into (re-edit). */
  selectable?: ReadonlySet<SegmentKey>;
  onSelect?: (key: SegmentKey) => void;
}) {
  const phase1 = SEGMENTS.filter((s) => s.phase === 1);
  const phase2 = SEGMENTS.filter((s) => s.phase === 2);

  const renderItem = (key: SegmentKey, label: string) => {
    const state = done.has(key)
      ? "done"
      : key === active
        ? "active"
        : "upcoming";
    // Clickable only when reachable AND not the current step (no-op self-jump).
    const clickable = !!selectable?.has(key) && !!onSelect && key !== active;
    const mark = (
      <span className="sp-seg__mark" aria-hidden="true">
        {state === "done" ? "✓" : state === "active" ? "●" : ""}
      </span>
    );
    const labelEl = <span className="sp-seg__label">{label}</span>;
    if (clickable) {
      return (
        <li key={key} data-state={state}>
          <button
            type="button"
            className={`sp-seg sp-seg--${state} sp-seg--clickable`}
            data-testid={`sp-seg-${key}`}
            onClick={() => onSelect!(key)}
          >
            {mark}
            {labelEl}
          </button>
        </li>
      );
    }
    return (
      <li
        key={key}
        className={`sp-seg sp-seg--${state}`}
        data-testid={`sp-seg-${key}`}
        data-state={state}
        aria-current={state === "active" ? "step" : undefined}
      >
        {mark}
        {labelEl}
      </li>
    );
  };

  return (
    <nav
      className={`sp-progress sp-progress--${layout}`}
      data-testid="sp-progress"
      aria-label="Setup progress"
    >
      <div className="sp-progress__phase">
        <p className="sp-progress__phase-label">Phase 1 · Client-ready</p>
        <ul className="sp-progress__list">
          {phase1.map((s) => renderItem(s.key, s.label))}
        </ul>
      </div>
      <div className="sp-progress__phase sp-progress__phase--upcoming">
        <p className="sp-progress__phase-label">Phase 2 · Finish your reusable profile</p>
        <ul className="sp-progress__list">
          {phase2.map((s) => renderItem(s.key, s.label))}
        </ul>
      </div>
    </nav>
  );
}
