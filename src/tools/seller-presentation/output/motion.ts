"use client";

import { useEffect } from "react";

/**
 * Seller Presentation — CSS-first motion controller (v1.47 / A7b + A7c.8.1).
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
 * A7c.8 / A7c.8.1 — recommended-price count-up. A second tiny
 * observer watches the `.price[data-price-countup]` element. When the
 * price scrolls into view (one-shot), it runs an rAF count-up that
 * rises from ~90% of the `data-price-final` value to the true final
 * over PRICE_COUNTUP_MS with an ease-out quart curve — a quick,
 * graceful settle rather than a long sweep through hundreds of
 * thousands. The start is clamped to 10^(digits-1) so the digit COUNT
 * never changes mid-climb (paired with CSS `tabular-nums` for
 * sub-digit width stability, this guarantees zero layout shift during
 * the animation). Each frame writes a SINGLE text node into
 * `[data-price-digits]` via textContent — no per-frame child-span
 * restructuring, which was the visible stutter source in A7c.8. The
 * final at-rest state restores the SSR-shaped grouped markup once so
 * commas pick up the muted `.sep` color and the final HTML is
 * byte-identical to the SSR render. The brick "$" outside the digits
 * span is never touched. Reduced-motion short-circuits the entire
 * enhancement; the SSR markup already renders the true price.
 *
 * Share button: the hero's `[data-share]` button (rendered by
 * presentation-page.tsx) wires up to `navigator.share()` when
 * available, falling back to copying the current URL to the
 * clipboard. Best-effort — failures are silently swallowed (the
 * button gives no error toast on this surface).
 */

// ---- A7c.8.1 count-up tunables -------------------------------------------
// Duration of the price count-up in ms. A7c.8 shipped 1600ms which read
// as too long on mobile; this shortens to ~1s for a quick, confident
// settle rather than a drawn-out tally.
const PRICE_COUNTUP_MS = 1000;
// Start the climb close to the final value so the eye reads a graceful
// final approach, not a long sweep through hundreds of thousands. A7c.8
// shipped a full 10^(digits-1) sweep ($100,000 → $675,000) which blurred
// and dragged. Clamped below to keep the digit count stable.
const PRICE_COUNTUP_START_FRACTION = 0.9;
// ease-out quart — stronger deceleration than cubic; settles softly
// onto the final number rather than stopping abruptly.
const easeOutQuart = (t: number) => 1 - Math.pow(1 - t, 4);

/** "675000" → "675,000" — plain text with comma grouping. The per-frame
 *  tick writes this as a single text node into `[data-price-digits]`,
 *  which is the cheapest possible DOM mutation (no child elements
 *  created/destroyed → no layout thrash from rebuilding the digit-group
 *  span tree every frame). This is the A7c.8.1 stutter fix. */
function formatPriceGroupsText(n: number): string {
  const s = Math.max(0, Math.floor(n)).toString();
  const groups: string[] = [];
  for (let i = s.length; i > 0; i -= 3) {
    groups.unshift(s.slice(Math.max(0, i - 3), i));
  }
  return groups.join(",");
}

/** "675000" → "<span>675</span><span><span class=\"sep\">,</span>000</span>".
 *  Mirrors the SSR PriceDisplay group structure exactly. Used ONCE at
 *  animation end to restore the at-rest markup so commas pick up the
 *  muted `.sep` color and the final HTML is byte-identical to SSR. */
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

  // Keep the digit COUNT constant across the climb — that's what stops
  // the price line from jumping width mid-animation. Clamp the desired
  // ~90% start so its digit count never falls below the final's. E.g.
  // final 675,000 → start max(100,000, 607,500) = 607,500 (6 digits).
  const digitCount = Math.floor(finalValue).toString().length;
  const startFloor = Math.pow(10, digitCount - 1);
  const desiredStart = Math.floor(finalValue * PRICE_COUNTUP_START_FRACTION);
  const startValue = Math.max(startFloor, desiredStart);
  if (startValue >= finalValue) {
    // Zero-range case (round number like exactly $100,000, or the
    // fraction landed on the final) — leave SSR digits in place.
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
      // Restore the SSR-shaped grouped markup once at rest so commas
      // get the muted `.sep` color and the final HTML is byte-identical
      // to SSR. One innerHTML write here is fine — the per-frame
      // restructuring during the climb is what caused the stutter.
      digitsEl.innerHTML = formatPriceGroupsHTML(finalValue);
      return;
    }
    const v = startValue + (finalValue - startValue) * easeOutQuart(t);
    // Single text-node write per frame — no child-element churn, so
    // layout/paint stay on the fast path and the climb reads as smooth.
    digitsEl.textContent = formatPriceGroupsText(v);
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

// ---- v1.5x State-A coverflow: aggregate count-up + mobile swipe cue ----------
const AGG_COUNTUP_MS = 1100;
const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);
function nowMs(): number {
  return typeof performance !== "undefined" &&
    typeof performance.now === "function"
    ? performance.now()
    : Date.now();
}

/** Count-up for a State-A proof aggregate ([data-countup-num] carrying its true
 *  total in data-countup-final). Rises 0 → final with ease-out cubic, writing a
 *  grouped text node each frame. The SSR text is already the true total, so a
 *  no-JS / reduced-motion render shows it at rest (this only enhances). */
function startAggCountup(el: HTMLElement): void {
  if (el.dataset.countupDone === "1") return;
  const finalRaw = el.getAttribute("data-countup-final");
  const finalValue = finalRaw ? parseInt(finalRaw, 10) : NaN;
  if (!Number.isFinite(finalValue) || finalValue <= 0) return;
  el.dataset.countupDone = "1";
  const t0 = nowMs();
  const tick = (now: number) => {
    const t = Math.min(1, (now - t0) / AGG_COUNTUP_MS);
    el.textContent = Math.round(
      finalValue * easeOutCubic(t),
    ).toLocaleString("en-US");
    if (t < 1) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

/** PROPOSED mobile swipe cue: one gentle scroll nudge as the coverflow settles,
 *  signaling "this moves". Only fires when the fan is the mobile peek carousel
 *  (overflow-x auto) AND actually has overflow (2+ cards); the desktop 3D stage
 *  is overflow:visible and is skipped. Reduced motion skips it (the observer is
 *  never created on that path). Droppable in verification. */
function maybeSwipeCue(fan: HTMLElement): void {
  if (typeof fan.scrollTo !== "function") return;
  if (getComputedStyle(fan).overflowX === "visible") return;
  if (fan.scrollWidth - fan.clientWidth < 24) return;
  window.setTimeout(() => {
    fan.scrollTo({ left: 32, behavior: "smooth" });
    window.setTimeout(() => fan.scrollTo({ left: 0, behavior: "smooth" }), 520);
  }, 700);
}

/** The State-A welcome-video waveform is one play target: clicking the waveform
 *  pill (or pressing Enter/Space) plays the SAME video the center control does.
 *  Wires every [data-wave-play] to its section's <video>. No player rewrite. */
function wireWaveformPlay(root: Document): Array<() => void> {
  const teardowns: Array<() => void> = [];
  root.querySelectorAll<HTMLElement>("[data-wave-play]").forEach((pill) => {
    const video = pill
      .closest<HTMLElement>(".sa-hello, .sa-hello__pedestal")
      ?.querySelector<HTMLVideoElement>("video.sa-hero__video-player");
    if (!video) return;
    const play = () => {
      const p = video.play();
      if (p && typeof p.catch === "function") p.catch(() => {});
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        play();
      }
    };
    pill.addEventListener("click", play);
    pill.addEventListener("keydown", onKey);
    teardowns.push(() => {
      pill.removeEventListener("click", play);
      pill.removeEventListener("keydown", onKey);
    });
  });
  return teardowns;
}

// ---- Viewed signal (Phase 1): one beacon per session on open --------------
/** sessionStorage key for the opaque per-session view token. */
const VIEW_SID_KEY = "sa-view-sid";

/**
 * A stable opaque token for THIS browser session, minted once and reused across
 * in-session refreshes (sessionStorage), so the server can de-dupe a refresh
 * from a genuine later return (a new tab is a new session -> a new token). No
 * identity, never persisted past the session. Returns null when sessionStorage
 * is unavailable (private-mode edge), in which case the beacon is skipped.
 */
function sessionViewToken(): string | null {
  try {
    const store = window.sessionStorage;
    const existing = store.getItem(VIEW_SID_KEY);
    if (existing) return existing;
    const token =
      typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
        ? crypto.randomUUID()
        : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
    store.setItem(VIEW_SID_KEY, token);
    return token;
  } catch {
    return null;
  }
}

export function PresentationPageMotion({
  viewSignalSlug,
}: {
  /**
   * Viewed signal (Phase 1). When set (the page is a live /h/<slug> AND the
   * VIEWED_SIGNAL_ENABLED flag is on, resolved server-side by the render arm),
   * fire ONE fire-and-forget open beacon per session. Undefined (flag-off, or a
   * non-public render like the wizard preview) fires nothing - byte-identical.
   */
  viewSignalSlug?: string;
} = {}) {
  // Open beacon - isolated effect so it is independent of the motion wiring and
  // a no-op whenever `viewSignalSlug` is absent.
  useEffect(() => {
    if (!viewSignalSlug) return;
    const sid = sessionViewToken();
    if (!sid) return;
    const url = `/api/h/${encodeURIComponent(viewSignalSlug)}/view`;
    const payload = JSON.stringify({ sid });
    try {
      if (
        typeof navigator !== "undefined" &&
        typeof navigator.sendBeacon === "function"
      ) {
        navigator.sendBeacon(
          url,
          new Blob([payload], { type: "application/json" }),
        );
      } else {
        void fetch(url, {
          method: "POST",
          body: payload,
          headers: { "Content-Type": "application/json" },
          keepalive: true,
        }).catch(() => {});
      }
    } catch {
      // Best-effort: a capture failure never affects the seller's page.
    }
  }, [viewSignalSlug]);

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
    let aggObserver: IntersectionObserver | null = null;
    let cueObserver: IntersectionObserver | null = null;

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

      // State-A coverflow aggregate count-up ("buyer views" total). State-A-only
      // selector — no-op on the revealed page.
      const aggTargets = root.querySelectorAll<HTMLElement>(
        "[data-countup-num]",
      );
      if (aggTargets.length > 0) {
        aggObserver = new IntersectionObserver(
          (entries) => {
            for (const entry of entries) {
              if (entry.isIntersecting) {
                startAggCountup(entry.target as HTMLElement);
                aggObserver?.unobserve(entry.target);
              }
            }
          },
          { rootMargin: "0px 0px -8% 0px", threshold: 0.5 },
        );
        aggTargets.forEach((el) => aggObserver!.observe(el));
      }

      // State-A coverflow mobile swipe cue (one-time, optional).
      const cueTargets = root.querySelectorAll<HTMLElement>(".sa-cf__fan");
      if (cueTargets.length > 0) {
        cueObserver = new IntersectionObserver(
          (entries) => {
            for (const entry of entries) {
              if (entry.isIntersecting) {
                maybeSwipeCue(entry.target as HTMLElement);
                cueObserver?.unobserve(entry.target);
              }
            }
          },
          { threshold: 0.6 },
        );
        cueTargets.forEach((el) => cueObserver!.observe(el));
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

    // Wire the State-A welcome-video waveform as a play target (interaction, not
    // animation — wired regardless of reduced motion). No-op on the revealed page.
    const waveTeardowns = wireWaveformPlay(root);

    return () => {
      observer?.disconnect();
      priceObserver?.disconnect();
      aggObserver?.disconnect();
      cueObserver?.disconnect();
      shareButtons.forEach((btn) =>
        btn.removeEventListener("click", onShare),
      );
      waveTeardowns.forEach((fn) => fn());
    };
  }, []);

  return null;
}
