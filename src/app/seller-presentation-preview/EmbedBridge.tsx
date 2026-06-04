"use client";

import { useEffect } from "react";

/**
 * EmbedBridge — Brand kit v3 live-preview bridge (Item 6).
 *
 * Mounted only when the preview route runs with `?embed=1`. It turns the
 * preview into a same-origin embeddable surface that the Brand kit settings
 * form drives live, with zero reloads:
 *
 *  - Marks <html> with `sep-embed` so the stylesheet can hide non-page chrome
 *    (the share button) — this is a preview, not an interactive page.
 *  - Posts `{type:'sep-embed-ready'}` to the opener so the form knows the
 *    bridge is live and can stop falling back to param reloads.
 *  - Listens for SAME-ORIGIN-ONLY messages:
 *      • {type:'sep-brand-vars', vars}  → applies the derived CSS custom
 *        properties to the page root (reuses BrandEngine.applyVars' shape:
 *        a { '--token': '#hex' } map), so dialing a color repaints instantly.
 *      • {type:'sep-highlight-role', role} → briefly outlines elements that
 *        carry that ramp role (the palette-chip highlight stretch). No-op when
 *        no elements are tagged with `data-brand-role`.
 *
 * Security: every message is rejected unless `event.origin` equals this
 * window's origin — a cross-origin frame can never push vars or highlights.
 */

type BrandVarsMessage = { type: "sep-brand-vars"; vars: Record<string, string> };
type HighlightMessage = { type: "sep-highlight-role"; role: string };
type EmbedMessage = BrandVarsMessage | HighlightMessage;

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

export function EmbedBridge() {
  useEffect(() => {
    const root = document.documentElement;
    root.classList.add("sep-embed");

    const pageRoot = () =>
      document.querySelector<HTMLElement>("main.sep-presentation");

    // tell the opener the live bridge is up (same-origin target only)
    try {
      if (window.parent && window.parent !== window) {
        window.parent.postMessage(
          { type: "sep-embed-ready" },
          window.location.origin,
        );
      }
    } catch {
      /* opener gone / cross-origin — the form falls back to param reloads */
    }

    let highlightTimer: ReturnType<typeof setTimeout> | undefined;

    const onMessage = (event: MessageEvent) => {
      // SAME-ORIGIN ONLY — reject anything else outright.
      if (event.origin !== window.location.origin) return;
      const data = event.data as EmbedMessage;
      if (!isRecord(data)) return;

      if (data.type === "sep-brand-vars" && isRecord(data.vars)) {
        const el = pageRoot();
        if (!el) return;
        for (const [k, v] of Object.entries(data.vars)) {
          if (typeof k === "string" && k.startsWith("--") && typeof v === "string") {
            el.style.setProperty(k, v);
          }
        }
        return;
      }

      if (data.type === "sep-highlight-role" && typeof data.role === "string") {
        const role = data.role;
        const marks = document.querySelectorAll<HTMLElement>(
          `[data-brand-role~="${CSS.escape(role)}"]`,
        );
        if (marks.length === 0) return;
        marks.forEach((m) => m.classList.add("sep-role-highlight"));
        if (highlightTimer) clearTimeout(highlightTimer);
        highlightTimer = setTimeout(() => {
          marks.forEach((m) => m.classList.remove("sep-role-highlight"));
        }, 1500);
        return;
      }
    };

    window.addEventListener("message", onMessage);
    return () => {
      window.removeEventListener("message", onMessage);
      root.classList.remove("sep-embed");
      if (highlightTimer) clearTimeout(highlightTimer);
    };
  }, []);

  return null;
}
