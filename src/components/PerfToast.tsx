"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  PERF_EVENT_NAME,
  getLastRun,
  usePerfEnabled,
  type RunRecord,
} from "@/lib/perf";

/**
 * H-7.14 perf toast — visible only when `?perf=1` is in the URL AND at
 * least one run has been recorded. Listens for the `perf-run-recorded`
 * window event, displays the latest run with a phase breakdown and a
 * "Copy data" button that dumps the RunRecord JSON to the clipboard.
 *
 * Mounted unconditionally in the root layout so toasts pick up runs from
 * any tool without each tool needing to render its own toast. Returns null
 * (no DOM) when perf is disabled — no overhead in the common path.
 *
 * Auto-dismisses after 60s of inactivity; hovering or interacting resets
 * the timer. Click the header to expand/collapse the phase breakdown.
 */

const AUTO_DISMISS_MS = 60_000;

export function PerfToast() {
  const enabled = usePerfEnabled();
  const [run, setRun] = useState<RunRecord | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [mounted, setMounted] = useState(false);
  const dismissTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Hydration guard: createPortal can't run during SSR; wait until mount
  // so the server output and first client render agree (no portal either
  // side).
  useEffect(() => {
    setMounted(true);
    // Pick up any run that fired before this component mounted (e.g., if
    // the user reloaded the page mid-export and the harness fired before
    // the toast hydrated).
    const last = getLastRun();
    if (last) setRun(last);
  }, []);

  useEffect(() => {
    if (!enabled) return;
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<RunRecord>).detail;
      if (!detail) return;
      setRun(detail);
      setExpanded(false);
      setCopied(false);
    };
    window.addEventListener(PERF_EVENT_NAME, handler);
    return () => window.removeEventListener(PERF_EVENT_NAME, handler);
  }, [enabled]);

  // Auto-dismiss timer. Reset on every new run AND while the user is
  // hovering. Cleared when run is null (no toast to dismiss).
  useEffect(() => {
    if (!run || hovered) {
      if (dismissTimerRef.current) {
        clearTimeout(dismissTimerRef.current);
        dismissTimerRef.current = null;
      }
      return;
    }
    dismissTimerRef.current = setTimeout(() => {
      setRun(null);
    }, AUTO_DISMISS_MS);
    return () => {
      if (dismissTimerRef.current) clearTimeout(dismissTimerRef.current);
    };
  }, [run, hovered]);

  // Phases sorted by descending duration. The top-3 view in the collapsed
  // body uses the first three; "+N more" shows the count of the rest.
  const sortedPhases = useMemo(() => {
    if (!run) return [];
    return Object.entries(run.phases)
      .sort((a, b) => b[1] - a[1])
      .map(([name, ms]) => ({ name, ms }));
  }, [run]);

  if (!enabled || !run || !mounted) return null;
  if (typeof document === "undefined") return null;

  const totalLabel = formatMs(run.totalMs);
  const visible = expanded ? sortedPhases : sortedPhases.slice(0, 3);
  const moreCount = sortedPhases.length - visible.length;

  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(JSON.stringify(run, null, 2));
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard blocked (insecure context, permission denied) — fall
      // back to a console log so the user can still scrape the JSON.
      console.log("[perf] copy failed, run record:", run);
    }
  };

  const node = (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        position: "fixed",
        bottom: "max(16px, env(safe-area-inset-bottom))",
        right: 16,
        maxWidth: 360,
        width: "auto",
        background: "#111",
        border: "1px solid #333",
        borderRadius: 12,
        padding: 16,
        boxShadow: "0 8px 24px rgba(0,0,0,0.45)",
        color: "#e5e5e5",
        fontFamily:
          "ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, sans-serif",
        fontSize: 12,
        lineHeight: 1.4,
        zIndex: 9999,
      }}
    >
      {/* Header row: collapse/expand toggle + total time + close */}
      <div
        onClick={() => setExpanded((v) => !v)}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          cursor: "pointer",
          minHeight: 44,
        }}
      >
        <span style={{ fontSize: 16 }}>⚡</span>
        <span style={{ fontWeight: 700, fontSize: 14, flex: 1 }}>
          {totalLabel}
        </span>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setRun(null);
          }}
          aria-label="Dismiss perf toast"
          style={{
            background: "transparent",
            border: "none",
            color: "#888",
            fontSize: 20,
            cursor: "pointer",
            minWidth: 44,
            minHeight: 44,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          ×
        </button>
      </div>

      {/* Meta line: tool · output · cold/warm */}
      <div style={{ color: "#a1a1aa", marginBottom: 10 }}>
        {run.toolId} · {run.output}
        {run.templateId ? ` · ${run.templateId}` : ""} ·{" "}
        <span
          style={{
            color: run.cold ? "#fca5a5" : "#86efac",
            fontWeight: 600,
          }}
        >
          {run.cold ? "cold" : "warm"}
        </span>{" "}
        · {run.photoCount} photo{run.photoCount === 1 ? "" : "s"}
      </div>

      {/* Phase breakdown */}
      <PhaseTable
        phases={visible}
        totalMs={run.totalMs}
        compact={!expanded}
      />

      {!expanded && moreCount > 0 && (
        <div style={{ color: "#71717a", marginTop: 6 }}>
          (+{moreCount} more — click header to expand)
        </div>
      )}

      {/* Frame stats (MP4 paths). Only render when present. */}
      {run.frameStats && (
        <div style={{ color: "#a1a1aa", marginTop: 10 }}>
          Frames: {run.frameStats.count} ·{" "}
          avg {formatMs(run.frameStats.avgMs)} ·{" "}
          min {formatMs(run.frameStats.minMs)} ·{" "}
          max {formatMs(run.frameStats.maxMs)}
        </div>
      )}

      {/* Footer */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          marginTop: 12,
        }}
      >
        <button
          type="button"
          onClick={onCopy}
          style={{
            background: copied ? "#16a34a" : "#27272a",
            color: copied ? "#fff" : "#e5e5e5",
            border: "1px solid #3f3f46",
            borderRadius: 6,
            padding: "8px 12px",
            fontSize: 12,
            fontWeight: 600,
            cursor: "pointer",
            minHeight: 44,
          }}
        >
          {copied ? "Copied!" : "Copy data"}
        </button>
        <span style={{ color: "#52525b", fontSize: 11 }}>
          window.__perf has {(globalThis as PerfWindow).__perf?.length ?? 0}
        </span>
      </div>
    </div>
  );

  return createPortal(node, document.body);
}

interface PerfWindow {
  __perf?: RunRecord[];
}

function PhaseTable({
  phases,
  totalMs,
  compact,
}: {
  phases: Array<{ name: string; ms: number }>;
  totalMs: number;
  compact: boolean;
}) {
  if (phases.length === 0) return null;
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: compact
          ? "1fr auto auto"
          : "1fr auto auto",
        rowGap: 4,
        columnGap: 12,
        fontFamily:
          "ui-monospace, SFMono-Regular, Menlo, monospace",
        fontSize: 11,
      }}
    >
      {phases.map(({ name, ms }) => {
        const pct = totalMs > 0 ? (ms / totalMs) * 100 : 0;
        return (
          <PhaseRow key={name} name={name} ms={ms} pct={pct} />
        );
      })}
    </div>
  );
}

function PhaseRow({
  name,
  ms,
  pct,
}: {
  name: string;
  ms: number;
  pct: number;
}) {
  return (
    <>
      <div style={{ color: "#d4d4d8", overflow: "hidden", textOverflow: "ellipsis" }}>
        {name}
      </div>
      <div style={{ color: "#e5e5e5", textAlign: "right" }}>{formatMs(ms)}</div>
      <div style={{ color: "#71717a", textAlign: "right" }}>{pct.toFixed(0)}%</div>
    </>
  );
}

/**
 * Format a wall-clock duration into a humans-can-read-it-at-a-glance
 * string. Sub-second: "347ms"; sub-minute: "12.4s"; longer: "2m 14s".
 */
function formatMs(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  const minutes = Math.floor(ms / 60_000);
  const seconds = Math.round((ms % 60_000) / 1000);
  return `${minutes}m ${seconds}s`;
}
