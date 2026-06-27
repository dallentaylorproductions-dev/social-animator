"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  useBrandSettings,
  extractPhoneDigits,
  formatPhone,
  EDITORIAL_BRAND_DEFAULTS,
} from "@/lib/brand";
import type { BrandSettings } from "@/lib/brand";
import { type WhyUs, defaultWhyUs } from "@/lib/whyus";
import {
  recentListingsToPublishInput,
  RECENT_LISTINGS_CAP,
} from "@/lib/seller-presentation/recent-listings";
import type {
  PublicPayload,
  PublicRecentListing,
} from "@/tools/seller-presentation/output/public-payload";
import {
  LEAD_EMPHASIS_LABELS,
  LEAD_EMPHASIS_PRIMARY,
  type LeadEmphasisKey,
} from "@/lib/seller-presentation/lead-emphasis";
import { HeadshotField } from "@/app/settings/HeadshotField";
import type { HeadshotCropValue } from "@/app/settings/HeadshotCropEditor";
import { RecentListingsEditor } from "@/app/settings/RecentListingsEditor";
import { PhoneInput } from "@/components/inputs/PhoneInput";
import { ImageUploadField } from "@/components/ImageUploadField";
import { VideoUploadField } from "@/components/VideoUploadField";
import { ListingPhotoCrop } from "@/components/ListingPhotoCrop";
import { BrandEngine } from "@/lib/brand/color-engine";
import { buildSamplePreviewPayload } from "@/lib/onboarding/sample-listing-draft";
import { emitStudioEvent, STUDIO_EVENTS } from "@/lib/studio-profile/funnel";
import {
  completedSegments,
  isClientReady,
  isFullyComplete,
  isProofDone,
  isBrandDone,
  EMPTY_WHYUS,
  type SegmentKey,
} from "@/lib/studio-profile/setup-state";
import {
  clearStudioBuffer,
  loadStudioBuffer,
  saveStudioBuffer,
} from "@/lib/studio-profile/setup-storage";
import { SegmentedProgress } from "./SegmentedProgress";
import { AssetPreviewFrame } from "./AssetPreviewFrame";
import {
  SectionDeck,
  YOU_SECTION,
  REACH_SECTION,
  PROOF_SECTION,
  SELL_SECTION,
  WORK_SECTION,
  type SectionConfig,
} from "./SectionDeck";
import "./studio.css";

/**
 * StudioProfileSetup — the complete guided activation (Studio Profile).
 *
 * The full 6-step flow: intro → You → Reach → Proof → (client-ready continue
 * beat) → How you sell → Recent work → Brand → launch. Desktop renders a
 * three-panel console (rail · capture · live asset-preview); mobile stacks
 * (progress · field · preview beneath).
 *
 * MOMENTUM (the core revision): there is NO mid-flow exit. "I'll do this later"
 * lives ONLY on the intro. Client-ready is a brief calm CONTINUE beat (one
 * forward action), never a fork — the sparse-page off-ramp is gone. A constant
 * reassurance line keeps the "set once, reused everywhere" frame present at every
 * step. The ONLY "Create your first seller page" CTA is at TRUE completion (after
 * Brand) — the launch moment.
 *
 * Save model: each field edits a LOCAL overlay that feeds the live preview;
 * "Save & continue" is the reward COMMIT — it writes the brand record via
 * useBrandSettings().update, plays the save animation + the reuse-teaching
 * confirmation + the rail check, then advances. A quiet background buffer
 * (socanim_studio_setup) holds the unsaved overlay for crash-safety only.
 */

type Screen = "intro" | SegmentKey | "clientready" | "launch";
const STEP_ORDER: SegmentKey[] = ["you", "reach", "proof", "sell", "work", "brand"];

/**
 * BRAND_SECTION lives here (not in SectionDeck) because its controls are the
 * console-local SignatureColorField + the shared ImageUploadField — importing them
 * into SectionDeck would be a circular dependency. Signature color renders as a
 * (keyboardless) custom control; logo is an optional media subsection.
 */
const BRAND_SECTION: SectionConfig = {
  id: "brand",
  satisfied: isBrandDone,
  renderSection: (payload, reducedMotion, saved) => (
    <AssetPreviewFrame
      payload={payload}
      asset="brand"
      saved={saved}
      reducedMotion={reducedMotion}
    />
  ),
  subsections: [
    {
      key: "color",
      prompt: "Signature color",
      kind: "media",
      required: false,
      read: (b) => b.brandAccent ?? "",
      write: () => ({}),
      renderMedia: (effective, setField) => (
        <SignatureColorField
          value={effective.brandAccent ?? EDITORIAL_BRAND_DEFAULTS.accent}
          onChange={(hex) => setField({ brandAccent: hex })}
        />
      ),
    },
    {
      key: "logo",
      prompt: "Logo (optional)",
      kind: "media",
      required: false,
      read: (b) => b.logoDataUrl ?? "",
      write: () => ({}),
      renderMedia: (effective, setField) => (
        <ImageUploadField
          label="Logo"
          value={effective.logoDataUrl ?? ""}
          onChange={(url) => setField({ logoDataUrl: url || null })}
          folder="brand-logo"
          testIdPrefix="sp-logo"
          previewAspect="aspect-[5/1]"
          previewFit="contain"
        />
      ),
    },
  ],
};

/**
 * All six steps now route through the MOBILE SectionDeck (stable-section +
 * subsection prompt deck). No legacy in-place focus shell remains on mobile.
 */
const DECK_SECTIONS: Partial<Record<SegmentKey, SectionConfig>> = {
  you: YOU_SECTION,
  reach: REACH_SECTION,
  proof: PROOF_SECTION,
  sell: SELL_SECTION,
  work: WORK_SECTION,
  brand: BRAND_SECTION,
};
const SAVE_ANIM_MS = 1100;
/** Fallback attribution so the review preview renders from the body alone. */
const DEFAULT_REVIEW_ATTRIBUTION = "A past client";
/** Sample showcase image so "the work" tile is never blank before the agent uploads. */
const SAMPLE_SHOWCASE_PHOTO = "/sample-assets/living-room.webp";

/** Where each step advances after its commit. */
const NEXT_SCREEN: Record<SegmentKey, Screen> = {
  you: "reach",
  reach: "proof",
  proof: "clientready", // the calm continue beat, not a fork
  sell: "work",
  work: "brand",
  brand: "launch", // true completion → the launch moment
};

/** Where "Back" returns to (so a saved step can be revisited to fix a typo). */
const PREV_SCREEN: Record<SegmentKey, Screen> = {
  you: "intro",
  reach: "you",
  proof: "reach",
  sell: "clientready",
  work: "sell",
  brand: "work",
};

/** The reuse-teaching confirmation per step (the "thankful" moment). */
const SAVE_TOAST: Record<SegmentKey, string> = {
  you: "Saved. Studio will introduce you this way across your pages.",
  reach: "Saved. Sellers can reach you from every page now.",
  proof: "Saved. Studio will reuse this proof on your seller pages and follow-ups.",
  sell: "Saved. Studio will explain how you sell across your pages.",
  work: "Saved. Your recent work now shows up everywhere Studio introduces you.",
  brand: "Saved. Your brand color now carries across Studio assets.",
};

/**
 * MOBILE focus model (the four-state shell). Each editor field carries a
 * `data-region` so the shell can (a) name the thing being edited in the
 * "Editing your {label}" caption and (b) scroll/highlight the matching sub-region
 * of the REAL isolated asset. The highlight + de-emphasis themselves are pure
 * CSS keyed off `data-focus-region` on the console root (see studio.css), so the
 * flagship components stay untouched (no consumer-page impact). This map is the
 * field-region → asset-selector anchor used only to scroll the region into view.
 */
const REGION_SELECTOR: Record<string, string> = {
  // You = the isolated AgentBand identity (see AssetPreviewFrame). The mobile You
  // preview is TRIMMED to the identity card (no big serif "{name}." headline), so
  // the name region is the card name (.agent__who .n), the avatar, and the role
  // line (brokerage) — the three parts of the trimmed identity.
  name: ".agent__who .n",
  avatar: ".agent__avatar",
  brokerage: ".agent__who .r",
  email: '[data-testid="fs-sa-confirm-email"]',
  phone: '[data-testid="fs-sa-confirm-phone"]',
  schedule: '[data-testid="fs-sa-confirm-schedule"]',
  review: ".sa-quote__q",
  sell: ".sa-frame--lead",
  work: ".sa-cf__card",
  brand: ".agent .btn--primary",
};

/** The human label for the "Editing your {label}" focus caption. */
const REGION_LABEL: Record<string, string> = {
  name: "name",
  avatar: "headshot",
  brokerage: "brokerage",
  email: "email",
  phone: "phone",
  schedule: "scheduling link",
  review: "review",
  sell: "marketing approach",
  work: "recent work",
  brand: "brand color",
};

/**
 * Focus-mode preview is a COMPACT, height-bounded region window (not a dimmed
 * full-height asset): the real component still renders in full inside it, but the
 * window clips to this height and the inner asset is translated so the active
 * region sits centered. A bounded window is what guarantees the field + Save
 * always have room above the keyboard. Kept in sync with `.sp--focus .sp-asset`
 * height in studio.css.
 */
const FOCUS_WINDOW_H = 150;

const STEP_FRAME: Record<
  SegmentKey,
  { eyebrow: string; title: string; sub: string }
> = {
  you: {
    eyebrow: "You",
    title: "Make your pages feel like you.",
    sub: "Your name, face, and brokerage appear anywhere Studio introduces you.",
  },
  reach: {
    eyebrow: "Reach",
    title: "Give sellers one clear way to reach you.",
    sub: "Email or phone is enough. Add a scheduling link if you use one.",
  },
  proof: {
    eyebrow: "Proof",
    title: "Add one piece of proof sellers can trust.",
    sub: "A review is best. If you can't paste one, a credential still makes the page read credible.",
  },
  sell: {
    eyebrow: "How you sell",
    title: "Show how you get homes seen.",
    sub: "Your marketing approach and edge, reused in every page's marketing section.",
  },
  work: {
    eyebrow: "Recent work",
    title: "Prove your reach.",
    sub: "Recent listings with real view counts power your showcase coverflow.",
  },
  brand: {
    eyebrow: "Brand",
    title: "Make it unmistakably yours.",
    sub: "Your signature color carries across every page, promo, and follow-up.",
  },
};

const REASSURANCE =
  "Your one-time Studio setup · saved once, reused on every page, promo & follow-up.";

export function StudioProfileSetup({ ownerEmail }: { ownerEmail: string | null }) {
  const router = useRouter();
  const { settings, update } = useBrandSettings();

  const [overlay, setOverlay] = useState<Partial<BrandSettings>>({});
  const effective = useMemo<BrandSettings>(
    () => ({ ...settings, ...overlay }),
    [settings, overlay],
  );

  const [screen, setScreen] = useState<Screen>("intro");
  const [savedAsset, setSavedAsset] = useState<SegmentKey | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const reducedMotion = usePrefersReducedMotion();
  const startedAtRef = useRef<number>(0);
  const hydratedRef = useRef(false);

  // ── MOBILE four-state shell (Browse / Focus / Expanded / Saved) ───────────
  // Desktop stays the 3-panel console untouched: all of the below only takes
  // effect when isMobile, and the focus visuals live behind a mobile media query
  // so the desktop render is byte-identical. New mobile-only DOM (the focus
  // caption, the Expand affordance, the expanded sheet) is gated on isMobile so
  // it never enters the desktop tree at all.
  const isMobile = useIsMobile();
  const [focusField, setFocusField] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  // Browse scroll offset captured at focus-in (before the console goes
  // position:fixed and the browser clamps scrollY to 0), so it can be restored
  // when Focus closes.
  const browseScrollRef = useRef(0);
  const focusActive = isMobile && focusField !== null;

  // One-time hydrate from the crash-safety buffer, then announce start.
  useEffect(() => {
    if (hydratedRef.current) return;
    hydratedRef.current = true;
    const buf = loadStudioBuffer();
    if (buf?.overlay) setOverlay(buf.overlay);
    if (buf?.screen) setScreen(buf.screen as Screen);
    startedAtRef.current = buf?.startedAt ?? Date.now();
    emitStudioEvent(STUDIO_EVENTS.setupStarted);
  }, []);

  // Quiet background safety net (debounced) — NOT the commit.
  useEffect(() => {
    if (!hydratedRef.current) return;
    const id = window.setTimeout(() => {
      saveStudioBuffer({ screen, overlay, startedAt: startedAtRef.current });
    }, 800);
    return () => window.clearTimeout(id);
  }, [screen, overlay]);

  const activeStep: SegmentKey | null = (STEP_ORDER as string[]).includes(screen)
    ? (screen as SegmentKey)
    : null;

  // Deck steps (You, Reach) use the mobile SECTION DECK, so they never enter the
  // in-place focus shell. The remaining steps keep the legacy in-place shell;
  // `inPlaceFocus` gates it to those non-deck steps only.
  const deckSection = activeStep ? DECK_SECTIONS[activeStep] : undefined;
  const mobileDeck = isMobile && !!deckSection;
  const inPlaceFocus = focusActive && !mobileDeck;

  // Per-step entry instrumentation.
  useEffect(() => {
    if (activeStep) emitStudioEvent(STUDIO_EVENTS.stepEntered, { step: activeStep });
  }, [activeStep]);

  // Auto-scroll the newly-active section into view on every screen change
  // (advance / Back / rail-jump / continue beat), so the agent is never left
  // looking at the wrong part of the console after changing steps. Smooth on
  // desktop; reduced-motion jumps instead of animating.
  useEffect(() => {
    if (typeof window === "undefined") return;
    window.scrollTo({ top: 0, behavior: reducedMotion ? "auto" : "smooth" });
  }, [screen, reducedMotion]);

  // Leaving a step (advance / back / checkpoint) drops focus mode + the sheet.
  // On mobile, each step starts in Browse (no auto keyboard): neutralize the
  // name field's autoFocus (which desktop keeps) so the four-state shell begins
  // in Browse and the user taps to enter Focus.
  useEffect(() => {
    setFocusField(null);
    setExpanded(false);
    if (!isMobile || typeof document === "undefined") return;
    const ae = document.activeElement as HTMLElement | null;
    if (
      ae &&
      rootRef.current?.contains(ae) &&
      (ae.tagName === "INPUT" || ae.tagName === "TEXTAREA")
    ) {
      ae.blur();
    }
  }, [screen, isMobile]);

  // Keyboard-safe sizing: mirror the visual viewport (which shrinks when the
  // soft keyboard opens) into CSS vars so the focused shell can be a fixed,
  // exactly-keyboard-tall flex column with no page scroll. Degrades gracefully:
  // if visualViewport is unavailable the focus container falls back to 100dvh.
  useEffect(() => {
    if (!isMobile || typeof window === "undefined") return;
    const vv = window.visualViewport;
    if (!vv) return;
    const apply = () => {
      const el = rootRef.current;
      if (!el) return;
      el.style.setProperty("--sp-vvh", `${Math.round(vv.height)}px`);
      el.style.setProperty("--sp-vvt", `${Math.round(vv.offsetTop)}px`);
    };
    apply();
    vv.addEventListener("resize", apply);
    vv.addEventListener("scroll", apply);
    return () => {
      vv.removeEventListener("resize", apply);
      vv.removeEventListener("scroll", apply);
    };
  }, [isMobile]);

  // FRAME the active region inside the compact focus window (replaces the old
  // page-level scrollIntoView, which scrolled the whole page and fought iOS).
  // We measure the [data-region] target's offset within the asset and translate
  // the inner asset so the region is vertically centered in the fixed-height
  // window. A ResizeObserver re-frames as the asset's content height changes
  // (e.g. the review quote appearing/growing as the agent types).
  useEffect(() => {
    if (!inPlaceFocus || !focusField || typeof window === "undefined") return;
    const sel = REGION_SELECTOR[focusField];
    const asset = document.querySelector<HTMLElement>(".sp__preview .sp-asset");
    const page = document.querySelector<HTMLElement>(".sp__preview .sp-asset__page");
    if (!asset || !page) return;
    const frame = () => {
      // Measure untranslated, then compute + apply the centering translate.
      asset.style.setProperty("--sp-frame-y", "0px");
      const region = sel ? page.querySelector<HTMLElement>(sel) : null;
      if (!region) return; // no target yet (e.g. empty review) → asset sits at top
      const pageRect = page.getBoundingClientRect();
      const rRect = region.getBoundingClientRect();
      const regionCenter = rRect.top - pageRect.top + rRect.height / 2;
      const pageH = page.scrollHeight;
      // Center against the ACTUAL bounded window height (the .sp-asset clientHeight
      // in focus), so it stays correct whatever a step sets the window height to.
      const winH = asset.clientHeight || FOCUS_WINDOW_H;
      let ty = winH / 2 - regionCenter;
      ty = Math.max(Math.min(0, winH - pageH), Math.min(0, ty));
      asset.style.setProperty("--sp-frame-y", `${Math.round(ty)}px`);
    };
    const id = window.requestAnimationFrame(frame);
    const t = window.setTimeout(frame, 220);
    let ro: ResizeObserver | null = null;
    if (typeof ResizeObserver !== "undefined") {
      ro = new ResizeObserver(frame);
      ro.observe(page);
    }
    return () => {
      window.cancelAnimationFrame(id);
      window.clearTimeout(t);
      ro?.disconnect();
    };
  }, [inPlaceFocus, focusField]);

  // Lock body scroll while Focus owns the visual viewport, so iOS Safari can't
  // scroll the input out from under the keyboard-pinned column. The position:fixed
  // lock would reset the page to the top, so we PRESERVE the Browse scroll offset
  // (shift the body up by scrollY while locked) and RESTORE it on exit — otherwise
  // Browse jumps to the top every time the keyboard dismisses.
  useEffect(() => {
    if (!inPlaceFocus || typeof document === "undefined") return;
    const body = document.body;
    // Use the offset captured at focus-in (window.scrollY is already 0 here, the
    // console having gone position:fixed in this render).
    const scrollY = browseScrollRef.current;
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
  }, [inPlaceFocus]);

  // Focus controller: a field gaining focus enters Focus mode for its region; a
  // blur that doesn't land on another field (keyboard dismiss, tapping Save)
  // exits. Reading the region from the nearest [data-region] handles embedded
  // editors (Recent work) and multi-input fields (Proof) cleanly.
  // Not gated on isMobile: focusField is harmless on desktop (focusActive =
  // isMobile && focusField, and only focusActive applies the shell), and leaving
  // it ungated means a focus that fires before the isMobile flip still resolves
  // into Focus once mobile is known.
  const onCenterFocus = (e: React.FocusEvent<HTMLElement>) => {
    if (activeStep && DECK_SECTIONS[activeStep]) return; // deck steps own their focus
    const region = e.target.closest?.("[data-region]")?.getAttribute("data-region");
    if (!region) return;
    // Capture the Browse scroll BEFORE entering Focus (focusActive still false),
    // i.e. before the console becomes position:fixed and scrollY clamps to 0.
    if (!focusActive && typeof window !== "undefined") {
      browseScrollRef.current = window.scrollY;
    }
    setFocusField(region);
  };
  const onCenterBlur = (e: React.FocusEvent<HTMLElement>) => {
    if (activeStep && DECK_SECTIONS[activeStep]) return;
    const next = e.relatedTarget as HTMLElement | null;
    const region = next?.closest?.("[data-region]")?.getAttribute("data-region");
    setFocusField(region ?? null);
  };

  const setField = (patch: Partial<BrandSettings>) =>
    setOverlay((o) => ({ ...o, ...patch }));

  // Item 5a — when the agent adds a listing, bring the live preview's listings
  // coverflow into view so they SEE the effect (most agents click Add without
  // having scrolled the preview down to the cards). Smooth on desktop; reduced
  // motion jumps. rAF so the just-appended slot has rendered first.
  const scrollPreviewToListings = () => {
    if (typeof window === "undefined") return;
    window.requestAnimationFrame(() => {
      const el = document.querySelector('[data-testid="fs-sa-cf"]');
      el?.scrollIntoView({
        behavior: reducedMotion ? "auto" : "smooth",
        block: "center",
      });
    });
  };

  const elapsed = () => Math.max(0, Date.now() - startedAtRef.current);

  const done = useMemo(
    () => new Set<SegmentKey>(completedSegments(effective)),
    [effective],
  );

  // PREVIEW-ONLY normalization (never persisted, never touches the editor): make
  // every preview render full from defaults/sample context so the agent always
  // refines a real asset, never stares at a blank or a name-gated section.
  const previewBrand = useMemo<BrandSettings>(() => {
    let b = effective;
    // #1 — render the review from its BODY alone: default the attribution when
    // the name box is still empty (the projector drops a nameless review).
    const rv = b.agentReviews?.[0];
    if (rv?.body?.trim() && !rv.attributionName?.trim()) {
      b = {
        ...b,
        agentReviews: [{ ...rv, attributionName: DEFAULT_REVIEW_ATTRIBUTION }],
      };
    }
    // #4 — the marketing zone is never blank: default the 3 marketing points
    // (so the cards + their icons render from the start) and feed a sample
    // showcase image (so "the work" tile is populated, not a big empty space).
    if (!b.whyUs || b.whyUs.marketingApproach.length === 0) {
      b = {
        ...b,
        whyUs: {
          ...(b.whyUs ?? (EMPTY_WHYUS as unknown as WhyUs)),
          marketingApproach: defaultWhyUs().marketingApproach,
        },
      };
    }
    if (!b.sampleListingPhotoUrl) {
      b = { ...b, sampleListingPhotoUrl: SAMPLE_SHOWCASE_PHOTO };
    }
    // #3/#7 — the preview's default signature color must equal the real brand
    // default (the teal-blue #037290), NOT the onboarding "studio mint" that
    // `buildSamplePreviewPayload` otherwise substitutes for an unset accent.
    // Seeding the default here makes the review/TrustStrip + the CTA buttons
    // render in the true default blue and keeps the Brand-step swatch (which also
    // defaults to #037290) matching the live preview exactly. A real accent wins.
    if (!b.brandAccent?.trim()) {
      b = { ...b, brandAccent: EDITORIAL_BRAND_DEFAULTS.accent };
    }
    return b;
  }, [effective]);

  // Live preview payload. marketingZoneRedesign=true so the marketing-zone
  // preview is the v1.7 redesigned one; for the Recent-work step, overlay the
  // agent's OWN listings (the sample seeds the rest so nothing is empty).
  const basePayload = useMemo(
    () => buildSamplePreviewPayload(previewBrand, ownerEmail ?? "", true),
    [previewBrand, ownerEmail],
  );
  const previewPayload = useMemo(() => {
    // Carry the logo so the Brand-step AgentBand preview shows it in the global
    // logo slot. Studio-preview-only: the publish path never sets brandLogoUrl,
    // so published pages stay byte-identical (wordmark).
    const logo = effective.logoDataUrl || undefined;
    let payload = logo ? { ...basePayload, brandLogoUrl: logo } : basePayload;
    if (activeStep === "work") {
      // Preview-only: the agent's own listings as the public shape (the publish
      // projector remains the real clamp/cap boundary; this mapper's objects
      // match PublicRecentListing structurally — address + optional fields).
      const own = (recentListingsToPublishInput(effective.recentListings ?? []) ??
        []) as PublicRecentListing[];
      const samples = (basePayload.recentListings ?? []) as PublicRecentListing[];
      // Item 5 state model — the listings section ALWAYS reads full: the agent's
      // real cards lead, and the sample/example cards backfill the remaining
      // slots up to the display target (4 = the sample fan size), capped at
      // RECENT_LISTINGS_CAP (5). So examples are replaced ONE AT A TIME as real
      // listings land — the section never collapses to a single empty slot, and
      // at 4–5 real listings the samples drop out entirely. PREVIEW-ONLY: the
      // publish path still projects ONLY the agent's own listings.
      const TARGET = 4;
      const fill = Math.max(0, TARGET - own.length);
      const merged = [...own, ...samples.slice(0, fill)].slice(0, RECENT_LISTINGS_CAP);
      payload = { ...payload, recentListings: merged };
    }
    if (activeStep === "you") {
      // PREVIEW-ONLY: the You step previews the AgentBand identity, which renders
      // nothing without a name. Seed a placeholder so the identity asset is never
      // blank; the agent's typed values flow through `effective` and override it
      // the moment they type. MOBILE (the section deck) uses neutral "Your Name" /
      // "Your Brokerage" placeholders — never a fake sample identity. DESKTOP keeps
      // the original sample so its console preview stays byte-identical. These
      // strings are render-only and are NEVER written back to the brand record.
      const ag = payload.agent;
      payload = {
        ...payload,
        agent: {
          ...ag,
          name: ag.name?.trim()
            ? ag.name
            : isMobile
              ? "Your Name"
              : "Aaron Thomas",
          brokerage: ag.brokerage?.trim()
            ? ag.brokerage
            : isMobile
              ? "Your Brokerage"
              : "Windermere · Tacoma",
        },
      };
    }
    return payload;
  }, [basePayload, activeStep, effective.recentListings, effective.logoDataUrl, isMobile]);

  // Pre-populate the How-you-sell step: the moment it opens, seed the default
  // marketing approach so the editor "arrives done" (3 cards to keep + edit) and
  // a Save persists them. Seeds whenever marketing is empty (NOT gated on the
  // whole whyUs), so a proof-point set earlier on the Proof step can't suppress
  // it. Preserves any existing whyUs fields (e.g. that proof point).
  useEffect(() => {
    if (screen !== "sell") return;
    const cur = overlay.whyUs ?? settings.whyUs;
    if (!cur || cur.marketingApproach.length === 0) {
      const baseWhy = cur ?? (EMPTY_WHYUS as unknown as WhyUs);
      setOverlay((o) => ({
        ...o,
        whyUs: { ...baseWhy, marketingApproach: defaultWhyUs().marketingApproach },
      }));
    }
  }, [screen, settings.whyUs, overlay.whyUs]);

  const commitAndAdvance = (step: SegmentKey) => {
    const wasReady = isClientReady(settings);
    const merged = { ...settings, ...overlay };
    // Normalize the proof review at commit: trim the raw-stored text and apply
    // the empty-name default (kept raw during editing so spaces type normally).
    if (step === "proof" && merged.agentReviews?.[0]) {
      const r = merged.agentReviews[0];
      const body = r.body.trim();
      merged.agentReviews = body
        ? [{ ...r, body, attributionName: r.attributionName.trim() || DEFAULT_REVIEW_ATTRIBUTION }]
        : undefined;
    }
    update(merged); // the reward commit → brand record (+ server autosave)
    setOverlay({});
    emitStudioEvent(STUDIO_EVENTS.stepSaved, { step });
    if (!wasReady && isClientReady(merged)) {
      emitStudioEvent(STUDIO_EVENTS.clientReadyReached, { ms: elapsed() });
    }
    if (step === "brand" && isFullyComplete(merged)) {
      emitStudioEvent(STUDIO_EVENTS.fullSetupCompleted, { ms: elapsed() });
    }
    setSavedAsset(step);
    setToast(SAVE_TOAST[step]);
    window.setTimeout(
      () => {
        setSavedAsset(null);
        setToast(null);
        setScreen(NEXT_SCREEN[step]);
      },
      reducedMotion ? 60 : SAVE_ANIM_MS,
    );
  };

  // Re-edit navigation: Back returns to the previous screen; the rail lets the
  // agent jump back into any step they've already reached. Overlay edits are
  // never cleared on navigation (only an explicit commit clears them) and
  // committed values live in `settings`, so no entered data is lost going back.
  const goTo = (next: Screen) => {
    if (savedAsset) return; // ignore mid-save-animation
    setScreen(next);
  };

  const onLater = () => {
    // The ONLY defer/exit — intro screen only. Keep the buffer so a return resumes.
    router.push("/dashboard");
  };
  const onCreatePage = () => {
    emitStudioEvent(STUDIO_EVENTS.createPageClicked, { from: "launch" });
    clearStudioBuffer();
    router.push("/dashboard");
  };
  const onReview = () => {
    clearStudioBuffer();
    router.push("/settings");
  };

  /* ───────────────────────── intro / continue / launch ───────────────────── */

  if (screen === "intro") {
    // B — a confident, full-screen entrance (referencing the old /welcome
    // composition: wordmark anchored top, a vertically-centered eyebrow +
    // headline + subline, the six steps as a crafted list, full-width stacked
    // actions, generous balanced whitespace) so the first screen feels like a
    // crafted, high-end app, not a bordered card floating mid-screen. Evergreen
    // copy is preserved.
    return (
      <div className="sp sp--intro" data-testid="sp-intro">
        <div className="sp-intro__inner">
          <header className="sp-intro__top">
            <span className="sp__wordmark">
              Studio <em>SEP</em>
            </span>
          </header>
          <div className="sp-intro__body">
            <p className="sp-eyebrow">Studio Profile</p>
            <h1 className="sp-intro__title">Set up Studio once.</h1>
            <p className="sp-intro__sub">
              Most agents finish in 5 to 8 minutes. Studio reuses these details
              across your seller pages, listing promos, follow-ups, and every new
              tool you create later, so you never rebuild them per page.
            </p>
            <ol className="sp-intro__steps" data-testid="sp-intro-map">
              {["You", "Reach", "Proof", "How you sell", "Recent work", "Brand"].map(
                (label, i) => (
                  <li className="sp-intro__step" key={label}>
                    <span className="sp-intro__step-num">{i + 1}</span>
                    <span className="sp-intro__step-label">{label}</span>
                  </li>
                ),
              )}
            </ol>
            <div className="sp-intro__actions">
              <button
                type="button"
                className="sp-btn sp-btn--primary"
                data-testid="sp-intro-start"
                onClick={() => setScreen("you")}
              >
                Start setup
              </button>
              <button
                type="button"
                className="sp-btn sp-btn--ghost"
                data-testid="sp-intro-later"
                onClick={onLater}
              >
                I&rsquo;ll do this later
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (screen === "clientready") {
    // An earned MILESTONE, then a single forward action. No fork, no off-ramp.
    return (
      <CenteredScreen testid="sp-clientready" milestone>
        <span className="sp-seal sp-seal--anim" data-testid="sp-seal" aria-hidden="true">
          <svg className="sp-seal__svg" viewBox="0 0 52 52">
            <circle className="sp-seal__ring" cx="26" cy="26" r="24" />
            <path className="sp-seal__check" d="M15 27 l7 7 l15 -16" />
          </svg>
        </span>
        <p className="sp-eyebrow sp-ms sp-ms--1">Milestone</p>
        <h1 className="sp-title sp-ms sp-ms--2">You&rsquo;re client-ready.</h1>
        <p className="sp-sub sp-ms sp-ms--3">
          Your first seller page now has you, a way to reach you, and proof
          sellers can trust. Finish the next 3 steps so every Studio tool starts
          stronger.
        </p>
        <div className="sp-ms sp-ms--4" style={{ width: "100%" }}>
          <div className="sp-ckpt-progress" data-testid="sp-clientready-progress" aria-hidden="true">
            <span className="sp-ckpt-progress__fill" />
            <span className="sp-ckpt-progress__count">3 of 6</span>
          </div>
          <div className="sp-actions">
            <button
              type="button"
              className="sp-btn sp-btn--primary"
              data-testid="sp-clientready-continue"
              onClick={() => setScreen("sell")}
            >
              Finish setup
            </button>
          </div>
        </div>
      </CenteredScreen>
    );
  }

  if (screen === "launch") {
    // D — the finish reward: reuse the mid-flow milestone checkmark entrance
    // (the beat Dallen liked) so completing the flow lands with delight — the
    // seal draws on as the hero, then the copy settles in. Plays once on mount;
    // prefers-reduced-motion just appears, fully drawn.
    return (
      <CenteredScreen testid="sp-launch" milestone>
        <span className="sp-seal sp-seal--anim" data-testid="sp-launch-seal" aria-hidden="true">
          <svg className="sp-seal__svg" viewBox="0 0 52 52">
            <circle className="sp-seal__ring" cx="26" cy="26" r="24" />
            <path className="sp-seal__check" d="M15 27 l7 7 l15 -16" />
          </svg>
        </span>
        <p className="sp-eyebrow sp-ms sp-ms--1">You&rsquo;re set</p>
        <h1 className="sp-title sp-ms sp-ms--2">Your seller page is ready.</h1>
        <p className="sp-sub sp-ms sp-ms--3">
          Studio will carry your identity, proof, marketing, recent work, and
          brand into every page you create. Extras for your full presentation and
          pre-listing page live in Settings whenever you want.
        </p>
        <div className="sp-actions sp-ms sp-ms--4">
          <button
            type="button"
            className="sp-btn sp-btn--primary"
            data-testid="sp-launch-create"
            onClick={onCreatePage}
          >
            Create your first seller page
          </button>
          <button
            type="button"
            className="sp-btn sp-btn--ghost"
            data-testid="sp-launch-review"
            onClick={onReview}
          >
            Review my Studio Profile
          </button>
        </div>
      </CenteredScreen>
    );
  }

  /* ─────────────────────────── the step console ──────────────────────────── */

  const step = activeStep as SegmentKey;
  const frame = STEP_FRAME[step];
  // Phase-1 essentials gate to client-ready (required, no skip); Phase-2
  // enrichment can always continue (encouraged via reassurance, never forced).
  const canSave =
    step === "you"
      ? !!effective.agentName?.trim()
      : step === "reach"
        ? !!(effective.contactEmail?.trim() || effective.contactPhone?.trim())
        : step === "proof"
          ? isProofDone(effective)
          : true;
  // Item 8 — ALL six steps are freely clickable in the rail: the agent can jump
  // ahead or back to any step, not just completed ones. Unsaved overlay edits are
  // never cleared on navigation (only an explicit commit clears them) and
  // committed values live in `settings`, so a jump never wipes entered data; a
  // forward jump simply lands on a step whose Save stays gated until valid.
  const reachable = new Set<SegmentKey>(STEP_ORDER);

  // Item 11 — quiet orientation copy that fills the rail's lower region with
  // something earned (a progress summary + the one-time-setup reassurance)
  // rather than a void.
  const doneCount = STEP_ORDER.filter((s) => done.has(s)).length;

  // Mobile top-chrome context: "Step N of 6 · {phase}", and the expand
  // affordance only appears once the asset is worth enlarging (step 3 on).
  const stepIndex = STEP_ORDER.indexOf(step);
  const stepNum = stepIndex + 1;
  const phaseLabel = stepIndex < 3 ? "Client-ready" : "Finish your profile";
  const expandable = stepIndex >= 2;

  // MOBILE deck steps (You, Reach): the stable-section + subsection prompt deck
  // replaces the whole console for this step (no Browse/Focus split, no lens
  // overlay). rootRef still hosts it so the visualViewport → --sp-vvh/--sp-vvt
  // publishing applies and the deck (a child) inherits the keyboard-safe vars.
  if (mobileDeck && deckSection) {
    return (
      <div
        ref={rootRef}
        className="sp sp--console sp--deck-host"
        data-testid="sp-console"
        data-step={step}
      >
        <SectionDeck
          section={deckSection}
          effective={effective}
          setField={setField}
          previewPayload={previewPayload}
          reducedMotion={reducedMotion}
          done={done}
          saving={savedAsset !== null}
          savedNow={savedAsset === step}
          toast={toast}
          onFinish={() => commitAndAdvance(step)}
          onBack={() => goTo(PREV_SCREEN[step])}
        />
      </div>
    );
  }

  return (
    <div
      ref={rootRef}
      className={`sp sp--console${inPlaceFocus ? " sp--focus" : ""}`}
      data-testid="sp-console"
      data-step={step}
      data-focus-region={inPlaceFocus ? (focusField ?? undefined) : undefined}
    >
      {/* Item 11 — light anchoring chrome so the console feels like a place. */}
      <header className="sp__topbar">
        <span className="sp__wordmark">
          Studio <em>SEP</em>
        </span>
        <span className="sp__topbar-ctx" data-testid="sp-topbar-ctx">
          <span className="sp__topbar-kicker">Studio setup</span>
          <span className="sp__topbar-sep" aria-hidden="true">
            /
          </span>
          <span className="sp__topbar-step">{frame.eyebrow}</span>
        </span>
        <span className="sp__topbar-count" aria-hidden="true">
          {doneCount} / {STEP_ORDER.length}
        </span>
      </header>

      <div className="sp__grid">
        <aside className="sp__rail">
          <div className="sp__rail-top">
            <SegmentedProgress
              done={done}
              active={step}
              layout="rail"
              selectable={reachable}
              onSelect={goTo}
            />
          </div>
          <div className="sp__rail-foot">
            <p className="sp-rail-summary" data-testid="sp-rail-summary">
              {doneCount} of {STEP_ORDER.length} steps saved
            </p>
            <p className="sp-reassure" data-testid="sp-reassure">
              {REASSURANCE}
            </p>
          </div>
        </aside>

        <div className="sp__bar">
          {/* Mobile top chrome (mobile-only; in Focus it collapses to the thin
              segmented bar). Gated on isMobile so it never enters the desktop
              tree, keeping the desktop console byte-identical. */}
          {isMobile && (
            <div className="sp__m-chrome" aria-hidden="true">
              <p className="sp__m-title">Set up Studio once</p>
              <p className="sp__m-step">
                Step {stepNum} of {STEP_ORDER.length} &middot; {phaseLabel}
              </p>
            </div>
          )}
          <SegmentedProgress
            done={done}
            active={step}
            layout="bar"
            selectable={reachable}
            onSelect={goTo}
          />
        </div>

        <main
          className="sp__center"
          data-testid={`sp-step-${step}`}
          onFocusCapture={onCenterFocus}
          onBlurCapture={onCenterBlur}
        >
        <p className="sp-eyebrow">{frame.eyebrow}</p>
        <h1 className="sp-step-title">{frame.title}</h1>
        <p className="sp-sub">{frame.sub}</p>

        {/* Focus-mode caption (mobile only): replaces the field label. */}
        {isMobile && focusField && (
          <p className="sp-focus-cap" data-testid="sp-focus-caption">
            Editing your {REGION_LABEL[focusField] ?? "profile"}
          </p>
        )}

        <div className="sp-fields">
          {step === "you" && (
            <YouFields effective={effective} setField={setField} />
          )}
          {step === "reach" && (
            <ReachFields effective={effective} setField={setField} />
          )}
          {step === "proof" && (
            <ProofFields effective={effective} setField={setField} />
          )}
          {step === "sell" && <SellFields effective={effective} setField={setField} />}
          {step === "work" && (
            <WorkFields
              effective={effective}
              setField={setField}
              onAddListing={scrollPreviewToListings}
            />
          )}
          {step === "brand" && <BrandFields effective={effective} setField={setField} />}
        </div>

        {toast && (
          <p className="sp-toast" data-testid="sp-toast" role="status">
            {toast}
          </p>
        )}

        <div className="sp-actions">
          <button
            type="button"
            className="sp-btn sp-btn--primary"
            data-testid="sp-save-continue"
            disabled={!canSave || savedAsset !== null}
            onClick={() => commitAndAdvance(step)}
          >
            Save &amp; continue
          </button>
          <button
            type="button"
            className="sp-btn sp-btn--ghost"
            data-testid="sp-back"
            disabled={savedAsset !== null}
            onClick={() => goTo(PREV_SCREEN[step])}
          >
            Back
          </button>
        </div>
      </main>

        <section className="sp__preview" data-testid="sp-preview">
          <div className="sp__stage">
            <p className="sp__stage-eyebrow" aria-hidden="true">
              {/* Mobile keeps a quiet "Live preview" label (the loud "WHAT SELLERS
                  SEE" competes with the step headline on a phone); desktop stays
                  byte-identical. */}
              {isMobile ? "Live preview" : "What sellers see"}
            </p>
            <AssetPreviewFrame
              payload={previewPayload}
              asset={step}
              saved={savedAsset === step}
              reducedMotion={reducedMotion}
              youIdentity={isMobile}
            />
            {/* Expanded preview affordance (mobile, from step 3 on) — opens the
                isolated asset larger with its reuse context. */}
            {isMobile && expandable && (
              <button
                type="button"
                className="sp-expand"
                data-testid="sp-expand"
                onClick={() => setExpanded(true)}
              >
                Expand preview
              </button>
            )}
            {/* Item 9 (A2) — one complete thought: the detail entered here is
                reused across every surface. The three surfaces read as an EQUAL,
                informational set (not a tab control), so nothing implies a
                selected destination or a switch. */}
            <div className="sp-dest" data-testid="sp-destinations">
              <p className="sp-dest__label">Reused everywhere you show up</p>
              <div className="sp-dest__set" aria-hidden="true">
                <span className="sp-dest__chip">Seller pages</span>
                <span className="sp-dest__chip">Follow-ups</span>
                <span className="sp-dest__chip">Pre-listing</span>
              </div>
            </div>
          </div>
        </section>
      </div>

      {/* Expanded preview sheet (mobile) — the isolated asset larger, with the
          reuse context. Swipe down or tap X / the backdrop to dismiss. */}
      {isMobile && expanded && (
        <ExpandedSheet onClose={() => setExpanded(false)}>
          <p className="sp-sheet__eyebrow">What sellers see</p>
          <div className="sp-sheet__asset">
            <AssetPreviewFrame
              payload={previewPayload}
              asset={step}
              saved={false}
              reducedMotion={reducedMotion}
              youIdentity={isMobile}
            />
          </div>
          <p className="sp-sheet__used">
            Used in: Seller page &middot; Follow-up &middot; Pre-listing
          </p>
          <p className="sp-sheet__note">
            This updates automatically anywhere Studio uses your profile.
          </p>
        </ExpandedSheet>
      )}

    </div>
  );
}

/* ───────────────────────────── step field groups ───────────────────────────── */

function YouFields({
  effective,
  setField,
}: {
  effective: BrandSettings;
  setField: (patch: Partial<BrandSettings>) => void;
}) {
  // DESKTOP console editing surface (real inputs). MOBILE Step 1 is the section
  // deck (see SectionDeck), which never renders YouFields — so this is the single
  // desktop path, byte-identical to before.
  const nameVal = effective.agentName ?? "";
  const brokerageVal = effective.brokerage ?? "";
  return (
    <>
      <label className="sp-field sp-field--primary" data-region="name">
        <span className="sp-label">Your name</span>
        <input
          className="sp-input"
          data-testid="sp-input-name"
          type="text"
          autoFocus
          value={nameVal}
          placeholder="Aaron Thomas"
          onChange={(e) => setField({ agentName: e.target.value })}
        />
      </label>

      <div className="sp-you-secondary">
      <div className="sp-field" data-region="avatar">
        <span className="sp-label">Your headshot</span>
        <p className="sp-hint">Clean initials work beautifully until you add one.</p>
        <HeadshotField
          photoUrl={effective.agentPhotoUrl}
          focalX={effective.agentHeadshotFocalX ?? 50}
          focalY={effective.agentHeadshotFocalY ?? 50}
          scale={effective.agentHeadshotScale ?? 1}
          monogramName={effective.agentName ?? ""}
          onPhotoChange={(url) =>
            setField({
              agentPhotoUrl: url || undefined,
              agentHeadshotFocalX: undefined,
              agentHeadshotFocalY: undefined,
              agentHeadshotScale: undefined,
            })
          }
          onCropChange={({ focalX, focalY, scale }: HeadshotCropValue) => {
            const centered = focalX === 50 && focalY === 50 && scale === 1;
            setField({
              agentHeadshotFocalX: centered ? undefined : focalX,
              agentHeadshotFocalY: centered ? undefined : focalY,
              agentHeadshotScale: centered ? undefined : scale,
            });
          }}
        />
      </div>

      <label className="sp-field" data-region="brokerage">
        <span className="sp-label">Brokerage</span>
        <input
          className="sp-input"
          data-testid="sp-input-brokerage"
          type="text"
          value={brokerageVal}
          placeholder="Windermere · Tacoma"
          onChange={(e) => setField({ brokerage: e.target.value })}
        />
      </label>
      </div>
    </>
  );
}

function ReachFields({
  effective,
  setField,
}: {
  effective: BrandSettings;
  setField: (patch: Partial<BrandSettings>) => void;
}) {
  return (
    <>
      <label className="sp-field" data-region="email">
        <span className="sp-label">Email</span>
        <input
          className="sp-input"
          data-testid="sp-input-email"
          type="email"
          inputMode="email"
          value={effective.contactEmail ?? ""}
          placeholder="you@brokerage.com"
          onChange={(e) => setField({ contactEmail: e.target.value })}
        />
      </label>

      <label className="sp-field" data-region="phone">
        <span className="sp-label">Phone</span>
        <PhoneInput
          className="sp-input"
          value={formatPhone(effective.contactPhone ?? "")}
          onChange={(formatted) =>
            setField({ contactPhone: extractPhoneDigits(formatted) })
          }
          placeholder="(253) 555-0188"
          aria-label="Phone"
        />
      </label>

      <label className="sp-field" data-region="schedule">
        <span className="sp-label">Scheduling link (optional)</span>
        <input
          className="sp-input"
          data-testid="sp-input-scheduling"
          type="url"
          inputMode="url"
          value={effective.schedulingUrl ?? ""}
          placeholder="calendly.com/your-handle"
          onChange={(e) => setField({ schedulingUrl: e.target.value })}
        />
      </label>
    </>
  );
}

function ProofFields({
  effective,
  setField,
}: {
  effective: BrandSettings;
  setField: (patch: Partial<BrandSettings>) => void;
}) {
  const review = effective.agentReviews?.[0];
  const body = review?.body ?? "";
  const name = review?.attributionName ?? "";
  // Store the text RAW (no trim) so the controlled inputs don't strip the space
  // at the caret on every keystroke (the "can't type spaces" bug). Trimming +
  // the empty-name default are applied once at commit (see commitAndAdvance).
  const setReview = (b: string, n: string) =>
    setField({
      agentReviews: b.trim() ? [{ body: b, attributionName: n }] : undefined,
    });
  const base = effective.whyUs ?? (EMPTY_WHYUS as unknown as WhyUs);
  const proofPoint = base.differentiators?.[0] ?? "";
  // Store RAW (no per-keystroke trim) so the spacebar isn't swallowed; the
  // projector/load-clamp trims for display on the real page.
  const setProofPoint = (v: string) =>
    setField({
      whyUs: {
        ...base,
        differentiators: v.trim()
          ? [v, ...base.differentiators.slice(1)]
          : base.differentiators.slice(1),
      },
    });

  return (
    <>
      <div className="sp-field" data-region="review">
        <span className="sp-label">Paste a review (recommended)</span>
        <p className="sp-hint">A few words a past seller gave you.</p>
        <textarea
          className="sp-input sp-textarea"
          data-testid="sp-input-review-body"
          rows={3}
          value={body}
          placeholder="They made the whole sale feel easy…"
          onChange={(e) => setReview(e.target.value, name)}
        />
        <input
          className="sp-input"
          data-testid="sp-input-review-name"
          type="text"
          value={name}
          placeholder="Who said it (e.g. J. Mendoza)"
          onChange={(e) => setReview(body, e.target.value)}
        />
        <input
          className="sp-input"
          data-testid="sp-input-review-outlink"
          type="url"
          inputMode="url"
          value={effective.reviewsOutlinkUrl ?? ""}
          placeholder="Link to all your reviews (e.g. Zillow profile)"
          onChange={(e) => setField({ reviewsOutlinkUrl: e.target.value })}
        />
      </div>

      {/* Always visible (not collapsed): the review is primary, and these add to
          it. Both optional. */}
      <div className="sp-extras" data-testid="sp-proof-extras" data-region="review">
        <p className="sp-extras__head">Add these too (optional)</p>
        <label className="sp-field">
          <span className="sp-label">Years of experience</span>
          <input
            className="sp-input"
            data-testid="sp-input-years"
            type="text"
            inputMode="numeric"
            value={effective.agentYearsInArea ?? ""}
            placeholder="11"
            onChange={(e) =>
              setField({ agentYearsInArea: e.target.value.replace(/\D/g, "") })
            }
          />
        </label>
        <label className="sp-field">
          <span className="sp-label">One proof point</span>
          <input
            className="sp-input"
            data-testid="sp-input-proofpoint"
            type="text"
            value={proofPoint}
            placeholder="Sold 30+ homes in North Tacoma"
            onChange={(e) => setProofPoint(e.target.value)}
          />
        </label>
      </div>
    </>
  );
}

const MARKETING_CAP = 3;

function SellFields({
  effective,
  setField,
}: {
  effective: BrandSettings;
  setField: (patch: Partial<BrandSettings>) => void;
}) {
  // Narrow step: ONLY what the State-A marketing-zone preview renders — the lead
  // emphasis (→ the zone headline) and the marketing approach points (→ the
  // "What's included" cards), hard-capped at 3. Differentiators / how-we-work /
  // guarantee / stats stay editable in Settings (they power the full-presentation
  // & pre-listing WhyUs), so "done" here is honest about the preview.
  const whyUs = effective.whyUs ?? defaultWhyUs();
  const points = whyUs.marketingApproach.slice(0, MARKETING_CAP);
  const writePoints = (next: typeof points) =>
    setField({ whyUs: { ...whyUs, marketingApproach: next } });

  return (
    <>
      <div className="sp-field" data-region="sell">
        <span className="sp-label">What gets buyers in?</span>
        <p className="sp-hint">
          Pick the angle you lead with. It becomes your page&rsquo;s
          &ldquo;How I&rsquo;ll get your home seen&rdquo; headline.
        </p>
        <div className="sp-levers" data-testid="sp-levers">
          {LEAD_EMPHASIS_PRIMARY.map((k) => (
            <button
              key={k}
              type="button"
              className={`sp-lever${effective.leadEmphasis === k ? " sp-lever--active" : ""}`}
              data-testid={`sp-lever-${k}`}
              onClick={() => setField({ leadEmphasis: k as LeadEmphasisKey })}
            >
              {LEAD_EMPHASIS_LABELS[k]}
            </button>
          ))}
        </div>
      </div>

      <div className="sp-field" data-testid="sp-marketing" data-region="sell">
        {/* Label matches the prominent eyebrow the preview renders. */}
        <span className="sp-label">How I&rsquo;ll get your home seen</span>
        <p className="sp-hint">
          Your {MARKETING_CAP} strongest marketing points. They appear under
          &ldquo;What&rsquo;s included&rdquo; on your page.
        </p>
        {points.map((p, i) => (
          <div className="sp-mkt-point" key={i} data-testid={`sp-mkt-point-${i}`}>
            <input
              className="sp-input"
              type="text"
              value={p.title}
              placeholder="Professional photography & video"
              data-testid={`sp-mkt-title-${i}`}
              onChange={(e) =>
                writePoints(
                  points.map((q, j) =>
                    j === i ? { ...q, title: e.target.value } : q,
                  ),
                )
              }
            />
            <textarea
              className="sp-input sp-textarea"
              rows={2}
              value={p.detail ?? ""}
              placeholder="Every listing, shot by a pro."
              data-testid={`sp-mkt-detail-${i}`}
              onChange={(e) =>
                writePoints(
                  points.map((q, j) =>
                    j === i ? { ...q, detail: e.target.value } : q,
                  ),
                )
              }
            />
            {points.length > 1 && (
              <button
                type="button"
                className="sp-mkt-remove"
                data-testid={`sp-mkt-remove-${i}`}
                onClick={() => writePoints(points.filter((_, j) => j !== i))}
              >
                Remove
              </button>
            )}
          </div>
        ))}
        {points.length < MARKETING_CAP ? (
          <button
            type="button"
            className="sp-mkt-add"
            data-testid="sp-mkt-add"
            onClick={() => writePoints([...points, { title: "", detail: "" }])}
          >
            + Add a point
          </button>
        ) : (
          <p className="sp-hint">
            That&rsquo;s your {MARKETING_CAP} strongest. Your page shows three.
          </p>
        )}
      </div>
    </>
  );
}

function WorkFields({
  effective,
  setField,
  onAddListing,
}: {
  effective: BrandSettings;
  setField: (patch: Partial<BrandSettings>) => void;
  onAddListing?: () => void;
}) {
  return (
    <>
      <div className="sp-field" data-region="work">
        <span className="sp-label">Sample listing photo (optional)</span>
        <p className="sp-hint">
          Your best listing photography. It leads your &ldquo;How I&rsquo;ll get
          your home seen&rdquo; showcase.
        </p>
        <ImageUploadField
          label="Sample photo"
          value={effective.sampleListingPhotoUrl ?? ""}
          onChange={(url) =>
            setField({
              sampleListingPhotoUrl: url || undefined,
              // A new photo starts centered.
              sampleListingPhotoFocalX: undefined,
              sampleListingPhotoFocalY: undefined,
              sampleListingPhotoScale: undefined,
            })
          }
          folder="agent-sample-photo"
          testIdPrefix="sp-sample-photo"
          previewAspect="aspect-[4/3]"
        />
        {effective.sampleListingPhotoUrl && (
          <ListingPhotoCrop
            photoUrl={effective.sampleListingPhotoUrl}
            focalX={effective.sampleListingPhotoFocalX}
            focalY={effective.sampleListingPhotoFocalY}
            scale={effective.sampleListingPhotoScale}
            aspect={4 / 3}
            testIdPrefix="sp-sample-photo"
            onChange={(p) =>
              setField({
                ...("focalX" in p ? { sampleListingPhotoFocalX: p.focalX } : {}),
                ...("focalY" in p ? { sampleListingPhotoFocalY: p.focalY } : {}),
                ...("scale" in p ? { sampleListingPhotoScale: p.scale } : {}),
              })
            }
          />
        )}
      </div>

      <div className="sp-field" data-region="work">
        <span className="sp-label">Sample video tour (optional)</span>
        <p className="sp-hint">A recent tour you produced, shown in the showcase.</p>
        <VideoUploadField
          label="Sample video"
          value={effective.sampleVideoUrl ?? ""}
          onChange={(url) => setField({ sampleVideoUrl: url || undefined })}
          folder="agent-sample-video"
          testIdPrefix="sp-sample-video"
          currentPosterUrl={effective.sampleVideoPosterUrl}
          onPosterChange={(url) =>
            setField({ sampleVideoPosterUrl: url || undefined })
          }
        />
        {/* VIDEO-THUMBNAIL CROP — follow-on (item 6 scaffold). The same recycled
            <ListingPhotoCrop> applies cleanly to the poster frame; it needs three
            new display-only BrandSettings fields (sampleVideoPosterFocalX/Y/Scale)
            registered + projected the same way sampleListingPhoto* are, then:
              {effective.sampleVideoPosterUrl && (
                <ListingPhotoCrop aspect={16/9} photoUrl={effective.sampleVideoPosterUrl} … />
              )}
            Deferred here to avoid net-new payload fields in this pass — it is a
            small follow-on, not a redesign. */}
      </div>

      <div className="sp-embed" data-testid="sp-recent-listings" data-region="work">
        <RecentListingsEditor
          listings={effective.recentListings ?? []}
          onChange={(next) => setField({ recentListings: next })}
          enablePhotoPosition
          onAdd={onAddListing}
        />
      </div>
    </>
  );
}

function BrandFields({
  effective,
  setField,
}: {
  effective: BrandSettings;
  setField: (patch: Partial<BrandSettings>) => void;
}) {
  return (
    <>
      <div className="sp-field" data-region="brand">
        <span className="sp-label">Signature color</span>
        <p className="sp-hint">Carries across every page, promo, and follow-up.</p>
        <SignatureColorField
          value={effective.brandAccent ?? EDITORIAL_BRAND_DEFAULTS.accent}
          onChange={(hex) => setField({ brandAccent: hex })}
        />
      </div>
      <div className="sp-field" data-region="brand">
        <span className="sp-label">Logo (optional)</span>
        <ImageUploadField
          label="Logo"
          value={effective.logoDataUrl ?? ""}
          onChange={(url) => setField({ logoDataUrl: url || null })}
          folder="brand-logo"
          testIdPrefix="sp-logo"
          previewAspect="aspect-[5/1]"
          previewFit="contain"
        />
        <p className="sp-hint">Shown at its true size on your pages, never cropped.</p>
      </div>
    </>
  );
}

/**
 * The signature-color control — the approved production picker pattern (the
 * BrandKit `ColorRow`/`HexField`): a native swatch trigger + a validated hex
 * field that commits on blur/Enter and reverts an invalid value (via the SAME
 * `BrandEngine.normHex` the brand-kit form uses), now themed for the dark Studio
 * console. The single-source default is `EDITORIAL_BRAND_DEFAULTS.accent`
 * (#037290) — exactly what the live preview renders — and a "Default" affordance
 * resets to it. Writes `brandAccent` (the seller-page signature), never
 * primaryColor/accentColor.
 */
function SignatureColorField({
  value,
  onChange,
}: {
  value: string;
  onChange: (hex: string) => void;
}) {
  const [draft, setDraft] = useState(value);
  const [bad, setBad] = useState(false);
  useEffect(() => {
    setDraft(value);
  }, [value]);

  const commit = (v: string) => {
    const n = BrandEngine.normHex(v.trim());
    if (n) {
      setBad(false);
      onChange(n);
    } else {
      setBad(true);
    }
  };

  const normalized = (BrandEngine.normHex(value) || "").toLowerCase();
  const defaultHex = EDITORIAL_BRAND_DEFAULTS.accent;
  const isDefault = normalized === defaultHex.toLowerCase();
  const pickerValue = (BrandEngine.normHex(value) || defaultHex).toLowerCase();

  return (
    <div className="sp-color">
      <input
        type="color"
        className="sp-color__swatch"
        data-testid="sp-input-brand-color"
        value={pickerValue}
        aria-label="Signature color"
        onChange={(e) => onChange(BrandEngine.normHex(e.target.value) || e.target.value)}
      />
      <div className="sp-color__field">
        <input
          type="text"
          className={`sp-input sp-color__hex${bad ? " sp-color__hex--bad" : ""}`}
          data-testid="sp-input-brand-color-hex"
          value={draft}
          spellCheck={false}
          aria-label="Signature color hex"
          aria-invalid={bad || undefined}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={(e) => commit(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") (e.target as HTMLInputElement).blur();
          }}
        />
        <button
          type="button"
          className="sp-color__reset"
          data-testid="sp-brand-color-reset"
          disabled={isDefault}
          onClick={() => onChange(defaultHex)}
        >
          Default
        </button>
      </div>
      {bad && (
        <span className="sp-color__hint" role="alert">
          Not a valid hex. Use 6 digits, like {defaultHex}.
        </span>
      )}
    </div>
  );
}

/* ───────────────────────────── shared chrome ───────────────────────────── */

/**
 * ExpandedSheet — the mobile "Expanded" state: a bottom sheet showing the
 * isolated asset larger with its reuse context. Dismiss via the X, the backdrop,
 * or a downward swipe on the sheet. Esc also closes (keyboard users).
 */
function ExpandedSheet({
  children,
  onClose,
}: {
  children: React.ReactNode;
  onClose: () => void;
}) {
  const startY = useRef<number | null>(null);
  const [drag, setDrag] = useState(0);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="sp-sheet__backdrop"
      data-testid="sp-sheet-backdrop"
      onClick={onClose}
    >
      <div
        className="sp-sheet"
        data-testid="sp-sheet"
        role="dialog"
        aria-modal="true"
        style={drag ? { transform: `translateY(${drag}px)` } : undefined}
        onClick={(e) => e.stopPropagation()}
        onTouchStart={(e) => {
          startY.current = e.touches[0]?.clientY ?? null;
        }}
        onTouchMove={(e) => {
          if (startY.current == null) return;
          const dy = (e.touches[0]?.clientY ?? 0) - startY.current;
          setDrag(Math.max(0, dy));
        }}
        onTouchEnd={() => {
          if (drag > 70) onClose();
          else setDrag(0);
          startY.current = null;
        }}
      >
        <button
          type="button"
          className="sp-sheet__close"
          data-testid="sp-sheet-close"
          aria-label="Close preview"
          onClick={onClose}
        >
          &times;
        </button>
        <span className="sp-sheet__grip" aria-hidden="true" />
        {children}
      </div>
    </div>
  );
}

function CenteredScreen({
  children,
  testid,
  milestone = false,
}: {
  children: React.ReactNode;
  testid: string;
  milestone?: boolean;
}) {
  return (
    <div className="sp sp--centered" data-testid={testid}>
      <div className={`sp-card${milestone ? " sp-card--milestone" : ""}`}>
        {children}
      </div>
    </div>
  );
}

/**
 * True below the 960px console breakpoint. Starts false so SSR + the desktop
 * tree are identical; flips on the client only on a real phone-width viewport,
 * which is what gates every mobile-only node + behavior of the four-state shell.
 */
function useIsMobile(): boolean {
  const [mobile, setMobile] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia("(max-width: 959.98px)");
    setMobile(mq.matches);
    const onChange = () => setMobile(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  return mobile;
}

function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    const onChange = () => setReduced(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  return reduced;
}
