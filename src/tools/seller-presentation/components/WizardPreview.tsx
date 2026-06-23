"use client";

import { useEffect, useRef, useState } from "react";
import type { HandoutRecord } from "@/lib/share-urls";
import { useBrandSettings } from "@/lib/brand";
import { useSPEntitlement } from "./SPEntitlementContext";
import type { SellerPresentationDraft } from "../engine/types";
import type { StepId } from "../hooks/useSellerPresentationState";
import { FlagshipPage } from "../output/flagship/FlagshipPage";
import { StateAPage } from "../output/flagship/StateAPage";
import { isInvitationStatus } from "../engine/types";
import {
  draftPreviewPayload,
  isDraftSparse,
  samplePayload,
  sampleStateAPayload,
} from "./preview/preview-payload";
import "./wizard-preview.css";

/**
 * WizardPreview — the wizard's live seller-page panel (capstone).
 *
 * Renders the REAL flagship page (the same `FlagshipPage` /h/ serves) directly
 * in the wizard's client tree from the agent's in-progress draft — no iframe,
 * no bridge, no server round-trip (ratified: direct client render). It updates
 * as the agent edits (debounced ~300ms off the autosaved draft).
 *
 *  - SPARSE draft (nothing worth previewing) → the fully-filled SAMPLE (the
 *    shared fixture) in the agent's brand color, behind a calm EXAMPLE badge.
 *  - NON-SPARSE → the agent's real draft, badge gone.
 *
 * Desktop (≥1200px): a sticky phone-frame docked beside the form. Mobile: the
 * dock is replaced by a floating "Preview ↗" button that opens it full-screen
 * (no layout shift to the form). The flagship's own scoped CSS (`.fs-page`)
 * keeps it from leaking into the wizard chrome; `fs-static` forces the motion
 * end-states so the snapshot is legible without the live page's scroll-driven
 * reveal island.
 */

const DESKTOP_QUERY = "(min-width: 1200px)";
const DEBOUNCE_MS = 300;

// Stable record chrome — FlagshipPage reads only `data`, so the timestamps are
// inert; a constant avoids needless churn on every re-render.
const PREVIEW_RECORD_BASE = {
  slug: "wizard-preview",
  type: "seller-presentation" as const,
  ownerEmail: "preview@local",
  createdAt: "1970-01-01T00:00:00.000Z",
  updatedAt: "1970-01-01T00:00:00.000Z",
};

// Step → the flagship section the panel scrolls to when the agent lands on it.
// Best-effort wayfinding; never blocks.
const STEP_SECTION: Record<StepId, string> = {
  property: "fs-hero",
  comps: "fs-why",
  strategy: "fs-price",
  // D1-CLEANUP — pitch cards split by theme; most (the home's selling points)
  // land in the "Selling points" section, so wayfind there.
  pitch: "fs-whyus-selling",
  editorial: "fs-area",
  review: "fs-agent",
};

const INPUT_DEBOUNCE_MS = 200;

// Field → flagship anchor (FIELD-level scroll-sync). When the agent focuses or
// edits a form field, the preview scrolls the matching flagship element into
// view so they see what they're changing. Resolved by climbing from the focused
// element to the nearest identifiable field container; rules are ordered
// specific → generic and the FIRST with a matching ancestor wins. Every anchor
// is an EXISTING flagship `data-testid` — no FlagshipPage markup edit. Purely
// best-effort: a field with no clean anchor simply doesn't scroll.
const FIELD_ANCHOR_RULES: Array<{
  match: string;
  anchor: (el: HTMLElement) => string;
}> = [
  // a comp row (the card wraps all its inputs) → that comp in the comps list
  {
    match: '[data-testid^="step-comps-card-"]',
    anchor: (el) => `fs-comp-${el.dataset.testid!.replace("step-comps-card-", "")}`,
  },
  // adding / importing comps → the comps section as a whole
  { match: '[data-testid^="step-comps"]', anchor: () => "fs-why" },
  // a pitch card → that routed pitch item in whichever section it landed in
  // ("Selling points" or "How we market"). D1-CLEANUP keeps the original pitch
  // index as the routed card's testid suffix. A card that de-duped against a
  // dedicated card / a How-we-work step has no anchor — best-effort, so it
  // simply doesn't scroll.
  {
    match: '[data-testid^="step-pitch-card-"]',
    anchor: (el) =>
      `fs-whyus-pitch-${el.dataset.testid!.replace("step-pitch-card-", "")}`,
  },
  { match: '[data-testid^="step-pitch"]', anchor: () => "fs-whyus-selling" },
  // the "Why this price" note → the rendered note paragraph in §02 (WhyPrice,
  // `fs-count-msg`), NOT the recommended-price block. `priceRationale`
  // publishes into §02, so editing it must reveal THAT element; the generic
  // step-strategy rule below would park the preview at the list price
  // (`fs-price`, top of §03) and hide the very text being typed. Ordered
  // before the generic rule so it wins (first match). Best-effort: the anchor
  // only exists once the note has text, so the first keystrokes simply don't
  // scroll until the live render mounts it — then every input event lands it.
  {
    match: '[data-testid="step-strategy-rationale"]',
    anchor: () => "fs-count-msg",
  },
  // price / confidence / approach → the price block
  { match: '[data-testid^="step-strategy"]', anchor: () => "fs-price" },
  // the walkthrough video → the agent-note band; area stats → the area band
  { match: '[data-testid^="step-editorial-video"]', anchor: () => "fs-note" },
  { match: '[data-testid^="step-editorial-area"]', anchor: () => "fs-area" },
  // property facts → the hero
  { match: '[data-testid^="step-property"]', anchor: () => "fs-hero" },
];

function resolveAnchor(target: EventTarget | null): string | null {
  if (!(target instanceof Element)) return null;
  for (const rule of FIELD_ANCHOR_RULES) {
    const hit = target.closest<HTMLElement>(rule.match);
    if (hit) return rule.anchor(hit);
  }
  return null;
}

// Scroll the phone screen (NOT the page) so the anchored flagship element is
// centered. Honors prefers-reduced-motion (jump instead of smooth).
function scrollScreenToAnchor(screen: HTMLElement, anchor: string) {
  const target = screen.querySelector<HTMLElement>(
    `[data-testid="${anchor}"]`,
  );
  if (!target) return; // best-effort: no clean anchor → no scroll
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const sRect = screen.getBoundingClientRect();
  const tRect = target.getBoundingClientRect();
  const delta =
    tRect.top - sRect.top - (screen.clientHeight - tRect.height) / 2;
  screen.scrollTo({
    top: screen.scrollTop + delta,
    behavior: reduce ? "auto" : "smooth",
  });
}

function useDebounced<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return debounced;
}

/** The phone-framed flagship snapshot + its badge/header. */
function PreviewSurface({
  handout,
  sparse,
  isStateA,
  currentStep,
  onClose,
  reviewSourceLogos = false,
}: {
  handout: HandoutRecord;
  sparse: boolean;
  /** Render the prepared-invitation (State A) template instead of the full page. */
  isStateA: boolean;
  currentStep: StepId;
  onClose?: () => void;
  reviewSourceLogos?: boolean;
}) {
  const screenRef = useRef<HTMLDivElement>(null);

  // Scroll-sync: when the step changes, bring the matching flagship section to
  // the top of the phone screen. Best-effort — a missing section is a no-op.
  useEffect(() => {
    const screen = screenRef.current;
    if (!screen) return;
    const target = screen.querySelector<HTMLElement>(
      `[data-testid="${STEP_SECTION[currentStep]}"]`,
    );
    if (!target) return;
    screen.scrollTo({
      top: target.offsetTop,
      behavior: "auto",
    });
  }, [currentStep, sparse]);

  // Mobile overlay opens at the TOP of the seller page (from the hero down),
  // not wherever the step-sync above last parked it — the overlay mounts fresh
  // per open, so this runs on mount and, defined after the step-sync effect,
  // wins the initial scroll position. Overlay only (onClose present); the
  // desktop dock keeps its step wayfinding.
  useEffect(() => {
    if (!onClose) return;
    const screen = screenRef.current;
    if (screen) screen.scrollTop = 0;
  }, [onClose]);

  // Field-level scroll-sync: focusing or editing a form field brings the
  // matching flagship element into view. A document-level delegated listener
  // keeps this entirely inside the panel — no wiring into the step components.
  // Focus scrolls immediately; input is debounced (~200ms) so a typing burst
  // settles before the jump.
  useEffect(() => {
    const screen = screenRef.current;
    if (!screen) return;
    let inputTimer: ReturnType<typeof setTimeout> | undefined;

    const go = (target: EventTarget | null) => {
      const anchor = resolveAnchor(target);
      if (anchor) scrollScreenToAnchor(screen, anchor);
    };
    const onFocusIn = (e: FocusEvent) => go(e.target);
    const onInput = (e: Event) => {
      const target = e.target;
      clearTimeout(inputTimer);
      inputTimer = setTimeout(() => go(target), INPUT_DEBOUNCE_MS);
    };
    document.addEventListener("focusin", onFocusIn);
    document.addEventListener("input", onInput);
    return () => {
      clearTimeout(inputTimer);
      document.removeEventListener("focusin", onFocusIn);
      document.removeEventListener("input", onInput);
    };
  }, []);

  return (
    <div className="sep-preview-surface">
      <div className="sep-preview-head">
        <span className="sep-preview-eyebrow">Seller page</span>
        {sparse ? (
          <span className="sep-preview-badge" data-testid="wizard-preview-badge">
            Example preview
          </span>
        ) : (
          <span className="sep-preview-live" data-testid="wizard-preview-live">
            Live
          </span>
        )}
        {onClose && (
          <button
            type="button"
            className="sep-preview-close"
            onClick={onClose}
            aria-label="Close preview"
            data-testid="wizard-preview-close"
          >
            ✕
          </button>
        )}
      </div>
      <div className="sep-preview-phone">
        <div
          className="sep-preview-screen fs-static"
          ref={screenRef}
          data-testid="wizard-preview-screen"
          data-state={sparse ? "example" : "draft"}
        >
          {/* `fs-static` forces the reveal/chart end-states (no scroll-driven
              motion island here) so the snapshot is always legible — see
              wizard-preview.css. No FlagshipPage edit needed. State A renders the
              prepared-invitation template; everything else is the full page. */}
          {isStateA ? (
            <StateAPage handout={handout} reviewSourceLogos={reviewSourceLogos} />
          ) : (
            <FlagshipPage handout={handout} reviewSourceLogos={reviewSourceLogos} />
          )}
        </div>
      </div>
    </div>
  );
}

export function WizardPreview({
  draft,
  currentStep,
}: {
  draft: SellerPresentationDraft;
  currentStep: StepId;
}) {
  const { settings: brand } = useBrandSettings();
  const {
    compPhotosEnabled,
    reviewSourceLogosEnabled,
    sellerStateAEnabled,
    marketingZoneRedesignEnabled,
  } = useSPEntitlement();
  const debouncedDraft = useDebounced(draft, DEBOUNCE_MS);

  const [mounted, setMounted] = useState(false);
  const [isDesktop, setIsDesktop] = useState(false);
  const [open, setOpen] = useState(false);
  const [fabHidden, setFabHidden] = useState(false);

  useEffect(() => {
    setMounted(true);
    const mq = window.matchMedia(DESKTOP_QUERY);
    const update = () => setIsDesktop(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  // Lock the wizard's body scroll while the full-screen overlay is open so a
  // touch-drag scrolls the preview itself (overscroll-behavior: contain on the
  // screen) instead of the page behind it — the core "preview won't scroll /
  // background scrolls instead" bug. position:fixed is the iOS-reliable lock;
  // the prior scroll position is captured and restored exactly on close (so ✕
  // returns the agent to the same wizard step + offset). Desktop never opens.
  useEffect(() => {
    if (!open) return;
    const body = document.body;
    const scrollY = window.scrollY;
    const prev = {
      position: body.style.position,
      top: body.style.top,
      left: body.style.left,
      right: body.style.right,
      width: body.style.width,
      overflow: body.style.overflow,
    };
    body.style.position = "fixed";
    body.style.top = `-${scrollY}px`;
    body.style.left = "0";
    body.style.right = "0";
    body.style.width = "100%";
    body.style.overflow = "hidden";
    return () => {
      body.style.position = prev.position;
      body.style.top = prev.top;
      body.style.left = prev.left;
      body.style.right = prev.right;
      body.style.width = prev.width;
      body.style.overflow = prev.overflow;
      window.scrollTo(0, scrollY);
    };
  }, [open]);

  // FAB auto-hide: the floating Preview button "feels in the way" if it sits
  // there forever, so fade it out ~2.5s after scrolling stops and bring it
  // back on any scroll (up or down). Starts visible so it's always findable;
  // mobile only (the desktop dock is live, no FAB). The fade lives in CSS.
  useEffect(() => {
    if (isDesktop) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const onScroll = () => {
      setFabHidden(false);
      clearTimeout(timer);
      timer = setTimeout(() => setFabHidden(true), 2500);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      clearTimeout(timer);
      window.removeEventListener("scroll", onScroll);
    };
  }, [isDesktop]);

  // Don't render until mounted — matchMedia is client-only, and the panel is
  // non-critical chrome, so a deterministic empty first paint avoids any
  // hydration mismatch.
  if (!mounted) return null;

  // The page type the agent has selected, read off the raw draft so it holds
  // even while the draft is still sparse (the toggle sets the status before any
  // address is typed). Drives BOTH which sample we fall back to and which
  // template renders, so the preview matches the chosen stage from the first
  // click — never a full presentation (with a price) while building an invitation.
  const invitationMode =
    sellerStateAEnabled === true && isInvitationStatus(debouncedDraft.valuationStatus);

  const sparse = isDraftSparse(debouncedDraft);
  const payload = sparse
    ? invitationMode
      ? sampleStateAPayload(
          brand,
          debouncedDraft.appointmentAt,
          marketingZoneRedesignEnabled === true,
        )
      : samplePayload(brand)
    : draftPreviewPayload(
        debouncedDraft,
        brand,
        compPhotosEnabled === true,
        sellerStateAEnabled === true,
        marketingZoneRedesignEnabled === true,
      );
  // State A renders whenever the resolved payload carries an invitation status —
  // true for the State A sample (sparse + invitation mode) AND for a real
  // invitation draft (draftPreviewPayload bakes the status when the flag is on).
  const isStateA =
    sellerStateAEnabled === true &&
    payload.valuationStatus !== undefined &&
    payload.valuationStatus !== "revealed";
  const handout: HandoutRecord = {
    ...PREVIEW_RECORD_BASE,
    data: payload as unknown as Record<string, unknown>,
  };

  if (isDesktop) {
    return (
      <aside className="sep-preview-dock" data-testid="wizard-preview-dock">
        <PreviewSurface
          handout={handout}
          sparse={sparse}
          isStateA={isStateA}
          currentStep={currentStep}
          reviewSourceLogos={reviewSourceLogosEnabled === true}
        />
      </aside>
    );
  }

  return (
    <>
      <button
        type="button"
        className="sep-preview-fab"
        data-hidden={fabHidden}
        onClick={() => setOpen(true)}
        data-testid="wizard-preview-fab"
      >
        Preview ↗
      </button>
      {open && (
        <div className="sep-preview-overlay" data-testid="wizard-preview-overlay">
          <PreviewSurface
            handout={handout}
            sparse={sparse}
            isStateA={isStateA}
            currentStep={currentStep}
            onClose={() => setOpen(false)}
            reviewSourceLogos={reviewSourceLogosEnabled === true}
          />
        </div>
      )}
    </>
  );
}
