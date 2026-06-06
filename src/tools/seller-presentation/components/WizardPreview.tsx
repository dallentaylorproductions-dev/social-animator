"use client";

import { useEffect, useRef, useState } from "react";
import type { HandoutRecord } from "@/lib/share-urls";
import { useBrandSettings } from "@/lib/brand";
import type { SellerPresentationDraft } from "../engine/types";
import type { StepId } from "../hooks/useSellerPresentationState";
import { FlagshipPage } from "../output/flagship/FlagshipPage";
import {
  draftPreviewPayload,
  isDraftSparse,
  samplePayload,
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
  pitch: "fs-pitch",
  editorial: "fs-area",
  review: "fs-agent",
};

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
  currentStep,
  onClose,
}: {
  handout: HandoutRecord;
  sparse: boolean;
  currentStep: StepId;
  onClose?: () => void;
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

  return (
    <div className="sep-preview-surface">
      <div className="sep-preview-head">
        <span className="sep-preview-eyebrow">Seller page</span>
        {sparse ? (
          <span className="sep-preview-badge" data-testid="wizard-preview-badge">
            EXAMPLE — this is what your seller receives
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
              wizard-preview.css. No FlagshipPage edit needed. */}
          <FlagshipPage handout={handout} />
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
  const debouncedDraft = useDebounced(draft, DEBOUNCE_MS);

  const [mounted, setMounted] = useState(false);
  const [isDesktop, setIsDesktop] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    setMounted(true);
    const mq = window.matchMedia(DESKTOP_QUERY);
    const update = () => setIsDesktop(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  // Don't render until mounted — matchMedia is client-only, and the panel is
  // non-critical chrome, so a deterministic empty first paint avoids any
  // hydration mismatch.
  if (!mounted) return null;

  const sparse = isDraftSparse(debouncedDraft);
  const payload = sparse
    ? samplePayload(brand)
    : draftPreviewPayload(debouncedDraft, brand);
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
          currentStep={currentStep}
        />
      </aside>
    );
  }

  return (
    <>
      <button
        type="button"
        className="sep-preview-fab"
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
            currentStep={currentStep}
            onClose={() => setOpen(false)}
          />
        </div>
      )}
    </>
  );
}
