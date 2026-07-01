"use client";

/**
 * Buyer Tour Brief — the buyer-facing page (BUYER_TOUR_BRIEF, v0.1 cream re-skin).
 *
 * The buyer-side twin of the Seller Presentation, in the SAME light/cream serif
 * premium family as the seller consumer page. Ported from the approved mock: top
 * bar, serif hero, Tour Snapshot, static "planned around" card, the Buyer Day Map +
 * wrapping checkbox legend, ordered home cards (stop badge, "why" accent bar, "watch
 * for", factual proximity chips), the after-tour comparison preview, the agent close,
 * and the Fair-Housing footer. Renders ONLY from the clamped public payload.
 *
 * Color discipline (the two-color rule, preserved): the agent brand `accent` rides
 * the TOUR THREAD only (brand mark, map pins + route, order-strip step numbers, the
 * "why" accent bar, the primary CTA), run through `pickContrastText` for legibility.
 * The fixed semantic palette owns the MAP LOGIC (markers + legend + chips). Everything
 * else stays the mock's cream / neutral palette.
 *
 * Image fallbacks (no broken-image glyphs): a home photo that is absent OR fails to
 * load renders the branded placeholder; an absent/failed agent headshot renders a
 * monogram. Motion respects prefers-reduced-motion (static highlight, no flash).
 */

import {
  type ReactNode,
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import type { ProximityCategory } from "../engine/types";
import type {
  BuyerTourPublicPayload,
  PublicAgent,
  PublicHome,
} from "./public-payload";
import { AFTER_TOUR_TEASER, FOOTER_DISCLAIMER, LAYER_HINTS, LAYER_LABELS } from "./copy";
import { DEFAULT_TOUR_ACCENT, LAYER_COLOR, StylizedMap } from "./StylizedMap";
import { pickContrastText } from "@/tools/listing-flyer/engine/contrast";

/**
 * The mock's system serif stack (Iowan / Palatino / Georgia). Deliberately a SYSTEM
 * stack, not a web font: it adds zero network/build dependency (no Google Fonts
 * fetch) and matches the mock 1:1. The seller flagship's Newsreader could be wired
 * later for exact cross-surface type if desired — flagged in the handoff.
 */
const SERIF =
  '"Iowan Old Style", "Palatino Linotype", Palatino, Georgia, "Times New Roman", serif';

const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

function subscribeReducedMotion(onChange: () => void): () => void {
  if (typeof window === "undefined" || !window.matchMedia) return () => {};
  const mq = window.matchMedia(REDUCED_MOTION_QUERY);
  mq.addEventListener?.("change", onChange);
  return () => mq.removeEventListener?.("change", onChange);
}

/** SSR-safe prefers-reduced-motion read via external-store subscription. */
function useReducedMotion(): boolean {
  return useSyncExternalStore(
    subscribeReducedMotion,
    () =>
      typeof window !== "undefined" && window.matchMedia
        ? window.matchMedia(REDUCED_MOTION_QUERY).matches
        : false,
    () => false,
  );
}

function initials(name?: string): string {
  if (!name) return "";
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "";
  const first = parts[0][0] ?? "";
  const last = parts.length > 1 ? parts[parts.length - 1][0] : "";
  return (first + last).toUpperCase();
}

function formatPrice(price?: number): string | null {
  return price === undefined ? null : `$${price.toLocaleString("en-US")}`;
}

function splitAddress(address: string): { street: string; rest: string } {
  const i = address.indexOf(",");
  if (i === -1) return { street: address, rest: "" };
  return {
    street: address.slice(0, i).trim(),
    rest: address.slice(i + 1).trim(),
  };
}

/** Short AREA label for the order strip — the locality (token after the first
 *  comma), else the street. Generic by construction: derived from the address, no
 *  hardcoded regions. */
function areaLabel(address: string): string {
  const parts = address
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return parts.length >= 2 ? parts[1] : parts[0] ?? "";
}

/** Estimate tour length from the stop count when the agent didn't set one.
 *  ~0.6 hr/stop, rounded to the nearest half hour. */
function estimateLength(stops: number): string {
  if (stops <= 0) return "";
  const hrs = Math.max(0.5, Math.round(stops * 0.6 * 2) / 2);
  const label = Number.isInteger(hrs) ? `${hrs}` : `${hrs}`;
  return `About ${label} ${hrs === 1 ? "hr" : "hrs"}`;
}

/** One Tour Snapshot cell (the mock's 2x2 grid). */
function SnapCell({
  k,
  v,
  testid,
  rightBorder,
  bottomBorder,
}: {
  k: string;
  v: string;
  testid?: string;
  rightBorder?: boolean;
  bottomBorder?: boolean;
}) {
  return (
    <div
      className={`px-4 py-3 ${rightBorder ? "border-r border-[#F0EBE1]" : ""} ${
        bottomBorder ? "border-b border-[#F0EBE1]" : ""
      }`}
    >
      <div className="text-[10.5px] font-bold uppercase tracking-[0.12em] text-[#7C8A86]">
        {k}
      </div>
      <div
        className="mt-0.5 text-[15px] font-semibold"
        style={{ fontFamily: SERIF }}
        data-testid={testid}
      >
        {v}
      </div>
    </div>
  );
}

/** Eyebrow — thin uppercase letter-spaced label. Neutral (accent discipline). */
function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-[#7C8A86]">
      {children}
    </div>
  );
}

/**
 * Image load state machine that DEFEATS the SSR hydration race.
 *
 * The page is server-rendered. If an <img> is in the SSR HTML, the browser begins
 * loading it BEFORE React hydrates and attaches `onError`; a failure that lands in
 * that window is never caught and the broken glyph sticks. So we:
 *   1. Never SSR the <img> — it is mounted CLIENT-SIDE ONLY (after `mounted`), so the
 *      onLoad/onError handlers are attached the instant the element (and its request)
 *      exists. No pre-hydration window.
 *   2. Default to the placeholder/monogram; reveal the photo ONLY on `loaded`.
 *   3. Defensively reconcile against the ref after mount: a cached image may already
 *      be `complete` (→ loaded), and an already-errored image reports
 *      `complete && naturalWidth === 0` (→ failed). Catches anything the events miss.
 *
 * Returns whether to render the <img> at all, plus the resolved status.
 */
function useRevealOnLoad(hasUrl: boolean) {
  // `isClient` is false on the server + first hydration snapshot, true on the client
  // thereafter — the lint-clean "is-hydrated" pattern (no set-state-in-effect). The
  // <img> is rendered only when isClient, so it never appears in the SSR HTML.
  const isClient = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
  const [status, setStatus] = useState<"pending" | "loaded" | "failed">(
    "pending",
  );
  const ref = useRef<HTMLImageElement | null>(null);

  // Defensive reconcile against the SSR/cache race: an already-cached image is
  // `complete` (→ loaded); an already-errored image is `complete && naturalWidth 0`
  // (→ failed). Catches anything the onLoad/onError events miss.
  useEffect(() => {
    if (!isClient) return;
    const img = ref.current;
    if (img && img.complete) {
      setStatus(img.naturalWidth > 0 ? "loaded" : "failed");
    }
  }, [isClient]);

  return {
    ref,
    // The <img> lives only client-side and only until a failure is known.
    renderImg: hasUrl && isClient && status !== "failed",
    loaded: status === "loaded",
    onLoad: () => setStatus("loaded"),
    onError: () => setStatus("failed"),
  };
}

/** Home photo — placeholder by default; the photo is revealed only after it loads. */
function HomePhoto({ home, accent }: { home: PublicHome; accent: string }) {
  const { street, rest } = splitAddress(home.address);
  const { ref, renderImg, loaded, onLoad, onError } = useRevealOnLoad(
    !!home.photoUrl,
  );

  return (
    <div className="relative flex h-[150px] items-end overflow-hidden">
      {/* Branded placeholder base — visible in every state except a loaded photo.
          Never a broken-image glyph. */}
      {!loaded && (
        <div
          className="absolute inset-0 flex items-center justify-center"
          style={{ background: "linear-gradient(135deg,#F2ECDE,#E7DECB)" }}
          data-testid={`btb-home-${home.stop}-placeholder`}
        >
          <svg
            width="42"
            height="42"
            viewBox="0 0 24 24"
            fill="none"
            stroke={accent}
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            opacity="0.9"
            aria-hidden="true"
          >
            <path d="M3 10.5 12 3l9 7.5" />
            <path d="M5 9.5V21h14V9.5" />
          </svg>
          <div className="absolute bottom-0 w-full px-4 pb-3 pt-7">
            <div className="text-[15.5px] font-bold leading-tight text-[#16211F]">
              {street}
            </div>
            {rest && <div className="mt-0.5 text-xs text-[#42514E]">{rest}</div>}
          </div>
        </div>
      )}

      {/* Photo — client-mounted only, transparent until loaded (so a still-loading
          or failed image shows nothing over the placeholder), removed on failure. */}
      {renderImg && (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            ref={ref}
            src={home.photoUrl}
            alt=""
            onLoad={onLoad}
            onError={onError}
            className={`absolute inset-0 h-full w-full object-cover transition-opacity ${
              loaded ? "opacity-100" : "opacity-0"
            }`}
            data-testid={`btb-home-${home.stop}-photo`}
          />
          {loaded && (
            <div
              className="absolute bottom-0 w-full px-4 pb-3 pt-7"
              style={{
                background:
                  "linear-gradient(180deg, rgba(22,33,31,0), rgba(22,33,31,.82))",
              }}
            >
              <div className="text-[15.5px] font-bold leading-tight text-white">
                {street}
              </div>
              {rest && (
                <div className="mt-0.5 text-xs text-[#E7E0D5]">{rest}</div>
              )}
            </div>
          )}
        </>
      )}

      {/* Stop badge — paper chip with accent number (per mock). */}
      <div
        className="absolute left-2.5 top-2.5 z-10 flex h-[30px] w-[30px] items-center justify-center rounded-[9px] bg-white text-[15px] font-bold shadow-[0_1px_2px_rgba(22,33,31,.06),0_6px_20px_rgba(22,33,31,.06)]"
        style={{ color: accent }}
        data-testid={`btb-home-${home.stop}-badge`}
      >
        {home.stop}
      </div>
    </div>
  );
}

/**
 * Agent avatar — monogram by default; the headshot is revealed only after it loads
 * (same SSR-race-proof pattern as HomePhoto). A missing/failed headshot never leaves
 * a broken glyph: the monogram is the base and the <img> is client-mounted, kept
 * transparent until loaded, and removed on failure.
 */
function AgentAvatar({ agent }: { agent: PublicAgent }) {
  const mono = initials(agent.name) || "•";
  const { ref, renderImg, loaded, onLoad, onError } = useRevealOnLoad(
    !!agent.photoUrl,
  );
  return (
    <div
      className="relative h-14 w-14 flex-none overflow-hidden rounded-[14px]"
      data-testid="btb-agent-avatar"
    >
      {!loaded && (
        <div
          className="absolute inset-0 flex items-center justify-center border border-white/10 text-[20px] font-semibold text-[#9FE3D6]"
          style={{
            fontFamily: SERIF,
            background: "linear-gradient(135deg,#2A3D39,#1A2A27)",
          }}
        >
          {mono}
        </div>
      )}
      {renderImg && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          ref={ref}
          src={agent.photoUrl}
          alt=""
          onLoad={onLoad}
          onError={onError}
          className={`absolute inset-0 h-14 w-14 object-cover transition-opacity ${
            loaded ? "opacity-100" : "opacity-0"
          }`}
        />
      )}
    </div>
  );
}

export function BuyerTourPage({
  payload,
  schoolSection,
}: {
  payload: BuyerTourPublicPayload;
  /**
   * The GreatSchools "School context" section, prerendered SERVER-SIDE by the
   * `/tour/[slug]` page from a live render-time fetch and injected here as a node so
   * GreatSchools data never enters this client component's props/bundle. Absent
   * (flag/toggle off, or unavailable) → nothing renders here (byte-identical).
   */
  schoolSection?: ReactNode;
}) {
  const reduced = useReducedMotion();

  const accent = payload.brandAccent ?? DEFAULT_TOUR_ACCENT;
  const onAccent = pickContrastText(accent);

  const [activeLayers, setActiveLayers] = useState<Set<ProximityCategory>>(
    () => new Set(payload.priorities),
  );
  const [highlightedStop, setHighlightedStop] = useState<number | null>(null);

  const cardRefs = useRef<Map<number, HTMLElement | null>>(new Map());
  const clearTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (clearTimer.current) clearTimeout(clearTimer.current);
    };
  }, []);

  const toggleLayer = useCallback((cat: ProximityCategory) => {
    setActiveLayers((prev) => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat);
      else next.add(cat);
      return next;
    });
  }, []);

  const onPinTap = useCallback(
    (stop: number) => {
      const el = cardRefs.current.get(stop);
      if (el) {
        el.scrollIntoView({
          behavior: reduced ? "auto" : "smooth",
          block: "center",
        });
      }
      setHighlightedStop(stop);
      if (clearTimer.current) clearTimeout(clearTimer.current);
      clearTimer.current = setTimeout(() => setHighlightedStop(null), 2200);
    },
    [reduced],
  );

  // Map shows when at least ONE home geocoded (one pin, no route). Zero geocoded →
  // the calm "Map unavailable" fallback (tour order + cards still render below).
  const geocodedCount = payload.homes.filter(
    (h) => h.lat !== undefined && h.lng !== undefined,
  ).length;
  const hasMap = geocodedCount >= 1;

  // The commute layer only makes sense with an anchor set — hide it cleanly
  // otherwise (never imply a default destination). Every other layer passes through.
  const legendCats = payload.priorities.filter(
    (c) => c !== "commute" || !!payload.commuteAnchor,
  );

  const greeting = payload.buyerName
    ? `Hi ${payload.buyerName}, here's the day I planned for you.`
    : "Here's the day I planned for you.";

  const agentFirst = payload.agent.name?.trim().split(/\s+/)[0] ?? "your agent";
  const primaryCta = payload.agent.phone
    ? { label: `Text ${agentFirst} about the tour`, href: `sms:${payload.agent.phone}` }
    : payload.agent.schedulingUrl
      ? { label: "Plan the day", href: payload.agent.schedulingUrl }
      : payload.agent.email
        ? { label: `Email ${agentFirst}`, href: `mailto:${payload.agent.email}` }
        : null;

  const brandName = payload.agent.brokerage || payload.agent.name || "Your agent";
  const brandMark = initials(payload.agent.brokerage || payload.agent.name) || "•";

  return (
    <main
      className="min-h-screen bg-[#ECE6DB] text-[#16211F] [overflow-x:hidden]"
      data-testid="buyer-tour-page"
    >
      <div className="mx-auto w-full max-w-[480px] bg-[#FBF8F3]">
        {/* ---------- top bar ---------- */}
        <div className="flex items-center justify-between border-b border-[#EAE3D8] bg-white px-6 py-4">
          <div className="flex items-center gap-2.5">
            <div
              className="flex h-[34px] w-[34px] flex-none items-center justify-center rounded-[9px] text-base font-bold"
              style={{ background: accent, color: onAccent, fontFamily: SERIF }}
            >
              {brandMark}
            </div>
            <div className="min-w-0">
              <div className="truncate text-sm font-bold leading-tight">
                {brandName}
              </div>
              {payload.agent.name && (
                <div className="text-[11px] text-[#7C8A86]">
                  Prepared for you by {payload.agent.name}
                </div>
              )}
            </div>
          </div>
          {payload.tourDate && (
            <div className="text-right text-[10.5px] leading-snug text-[#7C8A86]">
              {payload.tourDate}
            </div>
          )}
        </div>

        {/* ---------- hero ---------- */}
        <div
          className="border-b border-[#EAE3D8] px-6 pb-6 pt-7"
          style={{
            background:
              "radial-gradient(130% 90% at 100% 0%, #EFF6F4 0%, rgba(239,246,244,0) 62%), #FFFFFF",
          }}
        >
          <Eyebrow>Your tour, planned around you</Eyebrow>
          <h1
            className="mt-3 text-[28px] font-semibold leading-[1.14] tracking-[-0.01em]"
            style={{ fontFamily: SERIF }}
          >
            {greeting}
          </h1>
          <p className="mt-3 text-[15px] text-[#42514E]">
            {payload.homes.length} {payload.homes.length === 1 ? "home" : "homes"},
            in the order I think they&rsquo;ll feel best to see. I chose each one
            around what you told me matters most.
          </p>
        </div>

        {/* ---------- tour snapshot ---------- */}
        <div className="px-6 pt-5">
          <div className="overflow-hidden rounded-[14px] border border-[#EAE3D8] bg-white shadow-[0_1px_2px_rgba(22,33,31,.04),0_6px_20px_rgba(22,33,31,.06)]">
            <div className="grid grid-cols-2">
              <SnapCell
                k="Date"
                v={payload.tourDate || "To be set"}
                testid="btb-tour-date"
                rightBorder
                bottomBorder
              />
              <SnapCell k="Start" v={payload.startTime || "To be set"} bottomBorder />
              <SnapCell
                k="Homes"
                v={`${payload.homes.length} ${payload.homes.length === 1 ? "stop" : "stops"}`}
                rightBorder
              />
              <SnapCell
                k="Length"
                v={payload.length || estimateLength(payload.homes.length)}
              />
            </div>
            {payload.meetingPoint && (
              <div
                className="px-4 py-2.5 text-[12.5px] text-[#42514E]"
                data-testid="btb-meeting-point"
              >
                Meeting point&nbsp;&nbsp;·&nbsp;&nbsp;
                <b className="font-semibold text-[#16211F]">
                  {payload.meetingPoint}
                </b>
              </div>
            )}
          </div>
        </div>

        {/* ---------- planned around = BUYER priorities (custom, not map layers) ---------- */}
        {payload.buyerPriorities.length > 0 && (
          <div className="px-6 pt-3" data-testid="btb-planned-around">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2.5 rounded-[14px] border border-[#EAE3D8] bg-[#F7F3EA] px-4 py-3.5">
              <span className="text-[10.5px] font-bold uppercase tracking-[0.1em] text-[#C2703D]">
                Planned around
              </span>
              <div className="flex flex-wrap gap-2">
                {payload.buyerPriorities.map((p, i) => (
                  <span
                    key={`${p}-${i}`}
                    className="rounded-full border border-[#EAE3D8] bg-white px-3 py-1.5 text-[12.5px] font-semibold text-[#42514E]"
                  >
                    {p}
                  </span>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ---------- buyer day map ---------- */}
        {hasMap && (
          <section className="pt-6" data-testid="btb-map-section">
            <div className="mb-3.5 px-6">
              <Eyebrow>The route</Eyebrow>
              <h2
                className="mt-1.5 text-[20px] font-semibold"
                style={{ fontFamily: SERIF }}
              >
                Your Buyer Day Map
              </h2>
              <p className="mt-1 text-[13px] text-[#7C8A86]">
                {`The ${payload.homes.length} ${
                  payload.homes.length === 1 ? "stop" : "stops"
                } in order.`}{" "}
                Turn a layer on to see what&rsquo;s nearby.
              </p>
            </div>
            <div className="px-4">
              <div className="overflow-hidden rounded-[18px] border border-[#EAE3D8] bg-white shadow-[0_1px_2px_rgba(22,33,31,.04),0_6px_20px_rgba(22,33,31,.06)]">
                <StylizedMap
                  homes={payload.homes}
                  anchor={payload.commuteAnchor}
                  activeLayers={activeLayers}
                  highlightedStop={highlightedStop}
                  onPinTap={onPinTap}
                  accent={accent}
                />

                {legendCats.length > 0 && (
                  <div data-testid="btb-legend">
                    <div className="border-t border-[#EAE3D8] bg-[#F7F3EA] px-[18px] pt-3 text-[10.5px] font-bold uppercase tracking-[0.12em] text-[#7C8A86]">
                      Map layers
                    </div>
                    <div className="flex flex-wrap gap-2 bg-[#F7F3EA] px-3.5 pb-3.5 pt-2.5">
                      {legendCats.map((cat) => {
                        const on = activeLayers.has(cat);
                        const col = LAYER_COLOR[cat];
                        return (
                          <button
                            key={cat}
                            type="button"
                            role="switch"
                            aria-checked={on}
                            aria-label={`${LAYER_LABELS[cat]} — ${LAYER_HINTS[cat]}`}
                            title={LAYER_HINTS[cat]}
                            onClick={() => toggleLayer(cat)}
                            data-testid={`btb-legend-${cat}`}
                            data-active={on ? "true" : "false"}
                            className="inline-flex min-h-[44px] items-center gap-2.5 rounded-[11px] border bg-white px-3.5 text-[12.5px] font-semibold motion-safe:transition-colors"
                            style={{
                              borderColor: on ? "#D5DCD7" : "#EAE3D8",
                              color: on ? "#16211F" : "#7C8A86",
                            }}
                          >
                            {/* Checkbox affordance — the LAYER'S category color fills
                                it when on (the semantic legend; never the brand accent). */}
                            <span
                              aria-hidden="true"
                              className="flex h-[17px] w-[17px] flex-none items-center justify-center rounded-[5px] border-[1.5px]"
                              style={{
                                backgroundColor: on ? col : "#fff",
                                borderColor: on ? col : "#CBD2CD",
                              }}
                            >
                              {on && (
                                <svg
                                  width="9"
                                  height="9"
                                  viewBox="0 0 12 12"
                                  fill="none"
                                >
                                  <path
                                    d="M2 6.5 5 9.5 10 3"
                                    stroke="#fff"
                                    strokeWidth="2"
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                  />
                                </svg>
                              )}
                            </span>
                            {LAYER_LABELS[cat]}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                <div className="border-t border-[#EAE3D8] bg-white px-[18px] py-3 text-[11px] leading-relaxed text-[#7C8A86]">
                  School locations and places show nearby points and approximate
                  distances for orientation only. They are not ratings,
                  recommendations, or judgments about any school or area.
                </div>
              </div>
            </div>
          </section>
        )}

        {/* ---------- map-unavailable fallback (no home geocoded) ---------- */}
        {!hasMap && (
          <section className="px-6 pt-6" data-testid="btb-map-unavailable">
            <div className="rounded-[14px] border border-[#EAE3D8] bg-[#F7F3EA] px-4 py-5 text-center">
              <p className="text-[13px] text-[#7C8A86]">
                Map unavailable, tour order shown below.
              </p>
            </div>
          </section>
        )}

        {/* ---------- tour order ---------- */}
        {payload.homes.length > 0 && (
          <section className="pt-6">
            <div className="mb-3.5 px-6">
              <Eyebrow>The order</Eyebrow>
              <h2
                className="mt-1.5 text-[20px] font-semibold"
                style={{ fontFamily: SERIF }}
              >
                How the day flows
              </h2>
            </div>
            <div className="flex items-stretch px-6">
              {payload.homes.map((home, i) => (
                <div key={home.stop} className="relative flex-1 text-center">
                  {i > 0 && (
                    <span
                      aria-hidden="true"
                      className="absolute left-[-50%] top-[15px] z-0 h-0.5 w-full"
                      style={{
                        background: `repeating-linear-gradient(90deg, ${accent} 0 4px, transparent 4px 9px)`,
                      }}
                    />
                  )}
                  <div
                    className="relative z-[2] mx-auto flex h-[30px] w-[30px] items-center justify-center rounded-full text-sm font-bold"
                    style={{ background: accent, color: onAccent }}
                    data-testid={`btb-order-${home.stop}`}
                  >
                    {home.stop}
                  </div>
                  {/* Short AREA label only — full street addresses live on the cards. */}
                  <div className="mx-auto mt-1.5 line-clamp-2 px-1 text-[11px] leading-tight text-[#7C8A86]">
                    {areaLabel(home.address)}
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* ---------- home cards ---------- */}
        <section className="pt-6" data-testid="btb-homes">
          <div className="mb-3.5 px-6">
            <Eyebrow>The homes</Eyebrow>
            <h2
              className="mt-1.5 text-[20px] font-semibold"
              style={{ fontFamily: SERIF }}
            >
              Each stop, and why it&rsquo;s on the list
            </h2>
          </div>
          <ol className="px-4">
            {payload.homes.map((home) => {
              const highlighted = highlightedStop === home.stop;
              const price = formatPrice(home.price);
              const specs: React.ReactNode[] = [];
              if (home.beds !== undefined)
                specs.push(
                  <span key="bd">
                    <b className="font-semibold text-[#16211F]">{home.beds}</b> bd
                  </span>,
                );
              if (home.baths !== undefined)
                specs.push(
                  <span key="ba">
                    <b className="font-semibold text-[#16211F]">{home.baths}</b> ba
                  </span>,
                );
              if (home.sqft !== undefined)
                specs.push(
                  <span key="sf">
                    <b className="font-semibold text-[#16211F]">
                      {home.sqft.toLocaleString("en-US")}
                    </b>{" "}
                    sqft
                  </span>,
                );
              return (
                <li
                  key={home.stop}
                  ref={(el) => {
                    cardRefs.current.set(home.stop, el);
                  }}
                  data-testid={`btb-home-${home.stop}`}
                  data-highlighted={highlighted ? "true" : "false"}
                  className="mb-4 scroll-mt-6 overflow-hidden rounded-[18px] border bg-white motion-safe:transition-[border-color,box-shadow]"
                  style={
                    highlighted
                      ? { borderColor: accent, boxShadow: `0 0 0 2px ${accent}80` }
                      : { borderColor: "#EAE3D8" }
                  }
                >
                  <HomePhoto home={home} accent={accent} />
                  <div className="px-4 pb-4 pt-3.5">
                    <div className="flex flex-wrap items-baseline gap-x-3.5 gap-y-1">
                      {price && (
                        <div
                          className="text-[21px] font-semibold"
                          style={{ fontFamily: SERIF }}
                        >
                          {price}
                        </div>
                      )}
                      {specs.length > 0 && (
                        <div className="text-[13px] text-[#42514E]">
                          {specs.reduce<React.ReactNode[]>((acc, el, idx) => {
                            if (idx > 0) acc.push(<span key={`s${idx}`}> · </span>);
                            acc.push(el);
                            return acc;
                          }, [])}
                        </div>
                      )}
                    </div>

                    {home.whyOnList && (
                      <div className="mt-3.5">
                        <div
                          className="mb-1.5 flex items-center gap-2 text-[12px] font-semibold"
                          style={{ color: accent }}
                        >
                          <span
                            className="h-0.5 w-[13px] rounded-sm"
                            style={{ background: accent }}
                          />
                          Why I included it
                        </div>
                        <p className="m-0 whitespace-pre-line text-sm leading-relaxed text-[#42514E]">
                          {home.whyOnList}
                        </p>
                      </div>
                    )}

                    {home.watchFor && (
                      <div className="mt-3">
                        <div className="mb-1.5 flex items-center gap-2 text-[12px] font-semibold text-[#C2703D]">
                          <span className="h-0.5 w-[13px] rounded-sm bg-[#C2703D]" />
                          What to watch for
                        </div>
                        <p className="m-0 whitespace-pre-line text-sm leading-relaxed text-[#42514E]">
                          {home.watchFor}
                        </p>
                      </div>
                    )}

                    {home.proximity.length > 0 && (
                      <ul
                        className="mt-3.5 flex flex-wrap gap-1.5 border-t border-[#F0EBE1] pt-3.5"
                        data-testid={`btb-home-${home.stop}-chips`}
                      >
                        {home.proximity.map((chip, idx) => {
                          const on = activeLayers.has(chip.category);
                          const col = LAYER_COLOR[chip.category];
                          // Render-only tidy: a commute value like "12 min drive"
                          // reads better as "12 min to <anchor>".
                          const value =
                            chip.category === "commute"
                              ? chip.value.replace(/\s*drive$/i, "")
                              : chip.value;
                          return (
                            <li
                              key={`${chip.category}-${idx}`}
                              data-testid={`btb-chip-${home.stop}-${chip.category}`}
                              data-active={on ? "true" : "false"}
                              className="inline-flex min-h-[26px] max-w-full items-center gap-1.5 rounded-[8px] border px-2.5 py-1 text-[11.5px] font-medium motion-safe:transition-colors"
                              style={
                                on
                                  ? {
                                      borderColor: `${col}59`,
                                      backgroundColor: `${col}14`,
                                      color: "#16211F",
                                    }
                                  : {
                                      borderColor: "#EAE3D8",
                                      backgroundColor: "#F7F3EA",
                                      color: "#7C8A86",
                                    }
                              }
                            >
                              <span
                                aria-hidden="true"
                                className="h-2 w-2 flex-none rounded-full"
                                style={{ backgroundColor: on ? col : "#C9CEC8" }}
                              />
                              <span className="truncate">
                                <b className="font-semibold">{value}</b>
                                {chip.label ? ` to ${chip.label}` : ""}
                              </span>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </div>
                </li>
              );
            })}
          </ol>
        </section>

        {/* ---------- school context (GreatSchools, server-rendered; null when off) ---------- */}
        {schoolSection}

        {/* ---------- after tour ---------- */}
        <section className="px-6 pt-2" data-testid="btb-after-tour">
          <div className="rounded-[16px] border border-[#EAE3D8] bg-[#F2ECDE] p-[18px]">
            <div className="flex items-start gap-3.5">
              <div className="flex h-[38px] w-[38px] flex-none items-center justify-center rounded-[11px] bg-white shadow-[0_1px_2px_rgba(22,33,31,.06)]">
                <svg
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke={accent}
                  strokeWidth="2"
                >
                  <path d="M9 11l3 3L22 4" />
                  <path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11" />
                </svg>
              </div>
              <div>
                <h3
                  className="m-0 text-base font-semibold"
                  style={{ fontFamily: SERIF }}
                >
                  After we tour
                </h3>
                <p className="mt-1.5 text-[13px] text-[#42514E]">
                  {AFTER_TOUR_TEASER}
                </p>
              </div>
            </div>
            <div className="mt-3.5 flex items-stretch gap-2.5" aria-hidden="true">
              <div className="flex-1 rounded-[10px] border border-[#EAE3D8] bg-white p-2.5 opacity-85">
                <div className="text-[9.5px] font-semibold uppercase tracking-[0.04em] text-[#7C8A86]">
                  Stop 1
                </div>
                <div className="mb-1.5 mt-1 h-[7px] w-[70%] rounded bg-[#D7E2DD]" />
                <div className="h-[7px] w-[45%] rounded bg-[#EAE3D8]" />
              </div>
              <div className="flex items-center text-[10px] font-bold text-[#7C8A86]">
                vs
              </div>
              <div className="flex-1 rounded-[10px] border border-[#EAE3D8] bg-white p-2.5 opacity-85">
                <div className="text-[9.5px] font-semibold uppercase tracking-[0.04em] text-[#7C8A86]">
                  Stop {Math.min(3, payload.homes.length) || 1}
                </div>
                <div className="mb-1.5 mt-1 h-[7px] w-[70%] rounded bg-[#D7E2DD]" />
                <div className="h-[7px] w-[45%] rounded bg-[#EAE3D8]" />
              </div>
            </div>
          </div>
        </section>

        {/* ---------- agent close (dark accent panel) ---------- */}
        <div className="px-4 pt-6" data-testid="btb-agent">
          <div
            className="rounded-[20px] px-5 py-6 text-[#EAF1EE]"
            style={{ background: "linear-gradient(160deg,#16211F,#0F1A18)" }}
          >
            <div className="flex items-center gap-3.5">
              <AgentAvatar agent={payload.agent} />
              <div className="min-w-0">
                {payload.agent.name && (
                  <div className="text-base font-bold text-white">
                    {payload.agent.name}
                  </div>
                )}
                {payload.agent.brokerage && (
                  <div className="mt-0.5 text-[12.5px] text-[#9FB6B0]">
                    {payload.agent.brokerage}
                  </div>
                )}
              </div>
            </div>
            <p
              className="mt-4 text-sm leading-[1.55] text-[#C8D6D2]"
              data-testid="btb-agent-note"
            >
              {payload.agentNote ||
                "Text me anytime before the day if you want to add a home, drop one, or shift the start time. This is your day, so let's shape it around you."}
            </p>
            {primaryCta && (
              <a
                href={primaryCta.href}
                className="mt-[18px] block rounded-[12px] py-3.5 text-center text-[14.5px] font-bold no-underline"
                style={{ background: accent, color: onAccent }}
                data-testid="btb-primary-cta"
              >
                {primaryCta.label}
              </a>
            )}
            {payload.agent.phone && (
              <div className="mt-3 text-center text-[12.5px] text-[#8FA8A2]">
                or call{" "}
                <a
                  href={`tel:${payload.agent.phone}`}
                  className="font-semibold text-[#BFE7DD] no-underline"
                >
                  {payload.agent.phone}
                </a>
              </div>
            )}
            <div className="mt-3.5 text-center text-xs leading-relaxed text-[#8FA8A2]">
              No rush and no pressure. We&rsquo;ll go at your pace.
            </div>
          </div>
        </div>

        {/* ---------- footer ---------- */}
        <div className="px-6 py-6 text-center">
          <p
            className="mb-3 text-[10.5px] leading-[1.6] text-[#7C8A86]"
            data-testid="btb-disclaimer"
          >
            {FOOTER_DISCLAIMER}
          </p>
          <div className="text-[11px] font-semibold tracking-[0.04em] text-[#7C8A86]">
            Prepared with{" "}
            <b style={{ color: accent }}>Simply Edit Pro Studio</b>
          </div>
        </div>
      </div>
    </main>
  );
}
