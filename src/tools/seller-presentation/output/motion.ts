"use client";

import { useEffect } from "react";

/**
 * Seller Presentation — CSS-first motion controller (v1.47 / A7b).
 *
 * One small client island wired up alongside the server-rendered
 * consumer page. Adds an `.in` class to every `.reveal`, `.chart`,
 * and `.agent-photo` when it enters view, then unobserves it — the
 * CSS transitions in presentation-page.css do all the actual
 * animating (line draw-on, point pop, verify-tick scale, agent-photo
 * reveal, ken-burns hero is pure-CSS @keyframes already).
 *
 * Restraint by design: only the few motion moments earned by the
 * locked design are wired; no other micro-motion. No JS animation
 * library — IntersectionObserver + class toggle is the entire moving
 * part.
 *
 * Reduced-motion: when the user has `prefers-reduced-motion: reduce`,
 * skip the observer entirely and just add `.in` to everything on
 * mount so the motion-final states render immediately. The CSS file
 * also has belt-and-suspenders `@media (prefers-reduced-motion)`
 * rules that null all motion-related properties.
 *
 * Share button: the hero's `[data-share]` button (rendered by
 * presentation-page.tsx) wires up to `navigator.share()` when
 * available, falling back to copying the current URL to the
 * clipboard. Best-effort — failures are silently swallowed (the
 * button gives no error toast on this surface).
 */

export function PresentationPageMotion() {
  useEffect(() => {
    const root = document;
    const targets = root.querySelectorAll<HTMLElement>(
      ".reveal, .chart, .agent-photo",
    );

    const prefersReduced =
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    let observer: IntersectionObserver | null = null;
    if (prefersReduced) {
      targets.forEach((el) => el.classList.add("in"));
    } else if (
      typeof window.IntersectionObserver === "function"
    ) {
      observer = new IntersectionObserver(
        (entries) => {
          for (const entry of entries) {
            if (entry.isIntersecting) {
              entry.target.classList.add("in");
              observer?.unobserve(entry.target);
            }
          }
        },
        { rootMargin: "0px 0px -8% 0px", threshold: 0.12 },
      );
      targets.forEach((el) => observer!.observe(el));
    } else {
      // No IntersectionObserver (very old browser) — degrade to
      // showing everything immediately rather than hiding it forever.
      targets.forEach((el) => el.classList.add("in"));
    }

    // Wire up the share affordance — single button per page; query
    // unconditionally so we silently no-op when it isn't present
    // (e.g. on a minimal payload that hides chrome elements).
    const shareButtons = root.querySelectorAll<HTMLElement>("[data-share]");
    const onShare = async (e: Event) => {
      e.preventDefault();
      const url = window.location.href;
      const title = document.title;
      try {
        if (
          typeof navigator !== "undefined" &&
          typeof navigator.share === "function"
        ) {
          await navigator.share({ title, url });
          return;
        }
      } catch {
        // user canceled or share failed — fall through to clipboard
      }
      try {
        if (navigator?.clipboard?.writeText) {
          await navigator.clipboard.writeText(url);
        }
      } catch {
        // ignore — best-effort
      }
    };
    shareButtons.forEach((btn) =>
      btn.addEventListener("click", onShare),
    );

    return () => {
      observer?.disconnect();
      shareButtons.forEach((btn) =>
        btn.removeEventListener("click", onShare),
      );
    };
  }, []);

  return null;
}
