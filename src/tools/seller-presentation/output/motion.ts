"use client";

import { useEffect } from "react";

/**
 * Seller Presentation — CSS-first motion controller (v1.47 / A7b + A7c.8).
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
 * A7c.8 — recommended-price count-up. A second tiny observer watches
 * the `.price[data-price-countup]` element. When the price scrolls
 * into view (one-shot), it runs an rAF count-up that rises from
 * 10^(digits-1) to the true `data-price-final` value over
 * PRICE_COUNTUP_MS with an ease-out cubic curve. The digit groups
 * inside `[data-price-digits]` are re-rendered each frame; the brick
 * "$" outside the digits span is never touched. The start floor is
 * chosen so the digit COUNT never changes mid-climb — that's what
 * keeps the price line from jumping width during the animation
 * (paired with CSS `tabular-nums` on the price for sub-digit width
 * stability). Reduced-motion short-circuits the entire enhancement;
 * the SSR markup already renders the true price.
 *
 * Share button: the hero's `[data-share]` button (rendered by
 * presentation-page.tsx) wires up to `navigator.share()` when
 * available, falling back to copying the current URL to the
 * clipboard. Best-effort — failures are silently swallowed (the
 * button gives no error toast on this surface).
 */

// ---- A7c.8 count-up tunables ---------------------------------------------
// Duration of the price count-up in ms. Brief on purpose — long enough
// to register as a designed moment, short enough to not feel slow.
const PRICE_COUNTUP_MS = 1600;
// ease-out cubic — fast start, gentle deceleration into the rest value.
const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);

/** "675000" → "<span>675</span><span><span class=\"sep\">,</span>000</span>".
 *  Mirrors the SSR PriceDisplay group structure exactly so the final
 *  animated state is byte-identical to the SSR markup. */
function formatPriceGroupsHTML(n: number): string {
  const s = Math.max(0, Math.floor(n)).toString();
  const groups: string[] = [];
  for (let i = s.length; i > 0; i -= 3) {
    groups.unshift(s.slice(Math.max(0, i - 3), i));
  }
  return groups
    .map((g, i) =>
      i === 0
        ? `<span>${g}</span>`
        : `<span><span class="sep">,</span>${g}</span>`,
    )
    .join("");
}

function startPriceCountup(priceEl: HTMLElement): void {
  if (priceEl.dataset.priceCounted === "1") return;
  const digitsEl = priceEl.querySelector<HTMLElement>("[data-price-digits]");
  const finalRaw = priceEl.getAttribute("data-price-final");
  const finalValue = finalRaw ? parseInt(finalRaw, 10) : NaN;
  if (!digitsEl || !Number.isFinite(finalValue) || finalValue <= 0) return;

  // Start at 10^(digits-1) so the digit COUNT stays constant during
  // the climb (no layout shift mid-animation). E.g. final 675,000 →
  // start 100,000; final 1,200,000 → start 1,000,000.
  const digitCount = Math.floor(finalValue).toString().length;
  const startValue = Math.pow(10, digitCount - 1);
  if (startValue >= finalValue) {
    // Round numbers (e.g. exactly $100,000) collapse to zero range —
    // leave SSR digits in place.
    priceEl.dataset.priceCounted = "1";
    return;
  }

  priceEl.dataset.priceCounted = "1";
  const t0 =
    typeof performance !== "undefined" && typeof performance.now === "function"
      ? performance.now()
      : Date.now();

  const tick = (now: number) => {
    const elapsed = now - t0;
    const t = Math.min(1, elapsed / PRICE_COUNTUP_MS);
    if (t >= 1) {
      // Lock to the canonical integer at rest so the final HTML is
      // byte-identical to the SSR markup the digits were rendered
      // from. No rounding drift, no off-by-one.
      digitsEl.innerHTML = formatPriceGroupsHTML(finalValue);
      return;
    }
    const v = startValue + (finalValue - startValue) * easeOutCubic(t);
    digitsEl.innerHTML = formatPriceGroupsHTML(v);
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

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
    let priceObserver: IntersectionObserver | null = null;

    if (prefersReduced) {
      targets.forEach((el) => el.classList.add("in"));
      // Reduced-motion: SSR already rendered the true price; skip the
      // count-up entirely so the number is at rest from first paint.
    } else if (typeof window.IntersectionObserver === "function") {
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

      // Small dedicated observer for the price count-up — cleaner than
      // overloading the reveal observer (no `.in` class semantics).
      const priceTargets = root.querySelectorAll<HTMLElement>(
        "[data-price-countup]",
      );
      if (priceTargets.length > 0) {
        priceObserver = new IntersectionObserver(
          (entries) => {
            for (const entry of entries) {
              if (entry.isIntersecting) {
                startPriceCountup(entry.target as HTMLElement);
                priceObserver?.unobserve(entry.target);
              }
            }
          },
          { rootMargin: "0px 0px -8% 0px", threshold: 0.25 },
        );
        priceTargets.forEach((el) => priceObserver!.observe(el));
      }
    } else {
      // No IntersectionObserver (very old browser) — degrade to
      // showing everything immediately rather than hiding it forever.
      // Skip the count-up enhancement; SSR markup is already correct.
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
      priceObserver?.disconnect();
      shareButtons.forEach((btn) =>
        btn.removeEventListener("click", onShare),
      );
    };
  }, []);

  return null;
}
