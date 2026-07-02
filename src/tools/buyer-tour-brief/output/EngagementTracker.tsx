"use client";

/**
 * Buyer Tour Brief — engagement instrumentation island (BUYER_TOUR_ANALYTICS).
 *
 * A null-rendering client component mounted inside `BuyerTourPage` ONLY when analytics
 * is enabled (and a slug is present). It adds NO markup — it attaches only BEHAVIOR to
 * elements the page already renders (by their existing `data-testid`s), so the page
 * HTML is byte-identical whether analytics is on or off:
 *
 *   • `tour_opened` — once on mount.
 *   • `reached_comparison` / `school_section_viewed` / `reached_end` — Intersection
 *     Observer on the existing comparison card / school section / agent-close panel;
 *     each fires once when it scrolls into view.
 *   • `home_expander_opened` — delegated click on the existing per-home expander
 *     buttons (`btb-expander-btn-A|B|C…`); deduped, so only the first (the open) fires.
 *   • `school_link_clicked` — delegated click on any link inside the school section.
 *   • `cta_clicked` — delegated click on the primary contact CTA.
 *
 * `map_pin_tapped` / `pin_summary_opened` are fired directly from `BuyerTourPage`'s
 * pin handler (it owns that interaction); those calls no-op when analytics is off
 * because the client singleton is never initialized.
 *
 * All firing goes through the fire-and-forget `trackEngagement` singleton — never
 * awaited, never throws into the page.
 */

import { useEffect } from "react";
import {
  initEngagement,
  resetEngagement,
  trackEngagement,
} from "./engagement-client";
import { isHomeLetter } from "../engine/engagement";

export function EngagementTracker({
  slug,
  enabled,
}: {
  slug: string | undefined;
  enabled: boolean;
}) {
  useEffect(() => {
    const active = initEngagement({ slug, enabled });
    if (!active) return;

    // 1) tour_opened — the page was viewed.
    trackEngagement("tour_opened");

    // 2) Scroll-into-view "reached" events via one IntersectionObserver. Each target
    //    is observed once; on first intersection we fire and unobserve.
    const io =
      typeof IntersectionObserver !== "undefined"
        ? new IntersectionObserver(
            (entries, obs) => {
              for (const entry of entries) {
                if (!entry.isIntersecting) continue;
                const testid = entry.target.getAttribute("data-testid");
                if (testid === "btb-comparison") {
                  trackEngagement("reached_comparison");
                } else if (testid === "btb-school-section") {
                  trackEngagement("school_section_viewed");
                } else if (testid === "btb-agent") {
                  trackEngagement("reached_end");
                }
                obs.unobserve(entry.target);
              }
            },
            { threshold: 0.4 },
          )
        : null;

    if (io) {
      for (const sel of [
        '[data-testid="btb-comparison"]',
        '[data-testid="btb-school-section"]',
        '[data-testid="btb-agent"]',
      ]) {
        const el = document.querySelector(sel);
        if (el) io.observe(el);
      }
    }

    // 3) Delegated clicks — no listeners added to the components themselves.
    const onClick = (e: MouseEvent) => {
      const target = e.target as Element | null;
      if (!target || typeof target.closest !== "function") return;

      // Primary contact CTA.
      if (target.closest('[data-testid="btb-primary-cta"]')) {
        trackEngagement("cta_clicked");
        return;
      }

      // Per-home "see everything near this home" expander (letter in the testid).
      const expander = target.closest<HTMLElement>(
        '[data-testid^="btb-expander-btn-"]',
      );
      if (expander) {
        const letter = expander
          .getAttribute("data-testid")
          ?.replace("btb-expander-btn-", "");
        if (isHomeLetter(letter)) trackEngagement("home_expander_opened", letter);
        return;
      }

      // A link tapped inside the school section.
      if (
        target.closest('[data-testid="btb-school-section"]') &&
        target.closest("a")
      ) {
        trackEngagement("school_link_clicked");
        return;
      }
    };
    document.addEventListener("click", onClick, { capture: true });

    return () => {
      io?.disconnect();
      document.removeEventListener("click", onClick, { capture: true });
      resetEngagement();
    };
  }, [slug, enabled]);

  return null;
}
