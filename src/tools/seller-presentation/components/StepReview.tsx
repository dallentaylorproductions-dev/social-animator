"use client";

import { useEffect, useRef, useState } from "react";
import { useBrandSettings } from "@/lib/brand";
import { spStrategyDisplayLabel } from "../content/strategy-display-labels";
import { ThemePickerCard } from "./ThemePickerCard";
import {
  validateForExport,
  type SellerPresentationDraft,
} from "../engine/types";

type StepId =
  | "property"
  | "comps"
  | "strategy"
  | "pitch"
  | "editorial"
  | "review";

/**
 * Seller Presentation Step 5 — Review (v1.47 / A5b LIVE).
 *
 * Ports the dual-output state machine from OH Prep's StepReview
 * verbatim, then swaps:
 *   - API path: /api/oh-prep/* → /api/seller-presentation/*
 *   - PDF module: open-house-prep/output/pdf-export →
 *                 seller-presentation/output/prep-pdf
 *
 * A6 lit up Publish (fetch('/api/seller-presentation/publish')). A7e
 * lit up the prep PDF (dynamic-import('../output/prep-pdf') →
 * downloadSellerPresentationPrepPdf). The OH Prep error-state UX
 * (rounded red panel + "Try again" button) absorbs failures in either
 * path without crashing.
 *
 * Public-payload preview (A6 anchor): the summary block below shows
 * the agent-controlled public/private split — comp count, recommended
 * price + rationale, public vs private pitch points. This is the
 * UI surface where A6's `toPublicPayload` becomes obvious to the
 * agent before publish.
 *
 * Phase B6 — onboarded onto the `.sep-wizard` warm-dark canvas: the
 * header, validation/ready cards, summary rows, brand-incomplete
 * warning, the 5-state PublishSection, and the download-prep button all
 * use the scoped `.sec6-*` classes in sep-wizard.css. The Pricing
 * strategy summary row now shows the SP display label (Create Urgency …)
 * via `spStrategyDisplayLabel` — the same label the agent picked on
 * Step 3 — while the prep PDF keeps the formal SIR catalog name.
 * Every load-bearing piece (PublishState/ExportState unions, the
 * publish/revoke/download handlers, the agentContact + brandReviews
 * projections, buildSampleSendText, CopyButton, the SSR-safe origin
 * guard, and every data-testid) is preserved byte-for-byte.
 */

interface StepReviewProps {
  draft: SellerPresentationDraft;
  goToStep: (stepId: StepId) => void;
  /** Phase E — the theme picker writes the selected themeId back to the draft. */
  setDraft: (next: SellerPresentationDraft) => void;
}

type PublishState =
  | { kind: "idle" }
  | { kind: "publishing" }
  | { kind: "published"; slug: string }
  | { kind: "revoking" }
  | { kind: "revoked" }
  | { kind: "error"; message: string };

type ExportState = "idle" | "downloading" | "done" | { error: string };

function fieldToStep(field: string): { stepId: StepId; label: string } {
  switch (field) {
    case "propertyAddress":
      return { stepId: "property", label: "property address" };
    case "recommendedPrice":
      return { stepId: "strategy", label: "recommended price" };
    case "comps":
      return { stepId: "comps", label: "at least one comp" };
    case "comps[0]":
      return {
        stepId: "comps",
        label: "Comp 1 address + sold price",
      };
    default:
      return { stepId: "property", label: field };
  }
}

export function StepReview({ draft, goToStep, setDraft }: StepReviewProps) {
  const [publishState, setPublishState] = useState<PublishState>({
    kind: "idle",
  });
  const [exportState, setExportState] = useState<ExportState>("idle");
  const { settings: brand } = useBrandSettings();
  const missing = validateForExport(draft);

  const agentContact = {
    name: brand.agentName || "",
    brokerage: brand.brokerage || "",
    phone: brand.contactPhone || "",
    email: brand.contactEmail || "",
    licenseNumber: brand.licenseNumber || "",
    // A7c — Seller Presentation agent-profile extensions captured in
    // Settings/BrandProfileForm. The publish route forwards
    // `agentContact` to `toPublicPayload` which projects these onto
    // `payload.agent.{areasServed, photoUrl, bioShort, yearsInArea,
    // ctaReassurance}` — the locked-design renderer reads from there.
    areasServed: brand.agentAreasServed,
    photoUrl: brand.agentPhotoUrl,
    bioShort: brand.agentBioShort,
    yearsInArea: brand.agentYearsInArea,
    ctaReassurance: brand.agentCtaReassurance,
  };

  // A7d.2 — curated reviews + the "see all on Zillow" outlink also live
  // in Settings (agent-constant). Forwarded as a separate payload field
  // so the projector emits them at the top level (`payload.reviews` +
  // `payload.reviewsOutlink`), not inside `payload.agent`.
  const brandReviews = {
    reviews: brand.agentReviews,
    reviewsOutlinkUrl: brand.reviewsOutlinkUrl,
  };

  // A7c.4: StepPitch seeds INITIAL_VISIBLE_ROWS empty rows on mount
  // so the agent lands on a finite canvas — those rows persist with
  // default `visibility: 'private'`, but they have NO content and
  // shouldn't be counted in the Review summary's public/private
  // breakdown (and shouldn't appear in any downstream public payload,
  // which is already guarded by projectPitchCard's content check).
  const hasContent = (p: (typeof draft.pitchPoints)[number]) => {
    const title = (p.title ?? p.text ?? "").trim();
    return title.length > 0;
  };
  const publicPitchPoints = draft.pitchPoints.filter(
    (p) => p.visibility === "public" && hasContent(p),
  );
  const privatePitchPoints = draft.pitchPoints.filter(
    (p) => p.visibility === "private" && hasContent(p),
  );

  async function handlePublish() {
    if (missing) return;
    setPublishState({ kind: "publishing" });
    try {
      const res = await fetch("/api/seller-presentation/publish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ draft, agentContact, brandReviews }),
      });
      const body = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        slug?: string;
        error?: string;
      };
      if (!res.ok || !body.ok || !body.slug) {
        setPublishState({
          kind: "error",
          message: body.error ?? `Publish failed (${res.status})`,
        });
        return;
      }
      setPublishState({ kind: "published", slug: body.slug });
    } catch (err) {
      setPublishState({
        kind: "error",
        message:
          err instanceof Error
            ? err.message
            : "Publish failed. The backend may not be deployed yet (A6).",
      });
    }
  }

  async function handleRevoke(slug: string) {
    setPublishState({ kind: "revoking" });
    try {
      const res = await fetch("/api/seller-presentation/revoke", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug }),
      });
      const body = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
      };
      if (!res.ok || !body.ok) {
        setPublishState({
          kind: "error",
          message: body.error ?? `Revoke failed (${res.status})`,
        });
        return;
      }
      setPublishState({ kind: "revoked" });
    } catch (err) {
      setPublishState({
        kind: "error",
        message: err instanceof Error ? err.message : "Revoke failed",
      });
    }
  }

  async function handleDownloadPrep() {
    if (missing) return;
    setExportState("downloading");
    try {
      const mod = await import("../output/prep-pdf");
      await mod.downloadSellerPresentationPrepPdf(draft, agentContact);
      setExportState("done");
      setTimeout(() => setExportState("idle"), 2000);
    } catch (err) {
      setExportState({
        error: err instanceof Error ? err.message : "Export failed",
      });
    }
  }

  const confidenceLabel = draft.confidence
    ? draft.confidence.charAt(0).toUpperCase() + draft.confidence.slice(1)
    : "—";
  const totalPitchPoints =
    publicPitchPoints.length + privatePitchPoints.length;

  return (
    <section className="sec6" data-testid="step-review">
      <div className="sec-head">
        <h2 className="sec-title">Review</h2>
        <p className="sec-sub">
          Check the summary. Publish to get a shareable link for your seller,
          then download the prep PDF for yourself.
        </p>
      </div>

      <ThemePickerCard
        themeId={draft.themeId}
        onChange={(next) => setDraft({ ...draft, themeId: next })}
      />

      {missing ? (
        <ValidationBlock missing={missing} goToStep={goToStep} />
      ) : (
        <div className="sec6-ready" data-testid="step-review-ready">
          <span className="sec6-ready-dot" aria-hidden />
          <span className="sec6-ready-label">Ready to publish</span>
        </div>
      )}

      <div className="sec6-summary" data-testid="step-review-summary">
        <h3 className="sec6-summary-head">Summary</h3>
        <div className="sec6-rows">
          <SummaryRow label="Property" value={draft.propertyAddress || "—"} />
          {draft.propertyCity && (
            <SummaryRow label="City" value={draft.propertyCity} />
          )}
          <SummaryRow
            label="Recommended price"
            value={draft.recommendedPrice || "—"}
          />
          <SummaryRow
            label="Price rationale"
            value={
              draft.priceRationale
                ? `${draft.priceRationale.slice(0, 80)}${draft.priceRationale.length > 80 ? "…" : ""}`
                : "—"
            }
          />
          <SummaryRow
            label="Pricing strategy"
            value={spStrategyDisplayLabel(draft.pricingStrategyId)}
          />
          <SummaryRow label="Confidence" value={confidenceLabel} />
          <SummaryRow label="Comps" value={`${draft.comps.length} provided`} />
          <div className="sec6-row">
            <span className="sec6-row-label">Pitch points</span>
            <span className="sec6-row-value sec6-pitch">
              <span className="sec6-pitch-total">{totalPitchPoints} total</span>
              <span className="sec6-pitch-sep">·</span>
              <span className="sec6-pitch-count">
                {publicPitchPoints.length} 🌐 public
              </span>
              <span className="sec6-pitch-sep">·</span>
              <span className="sec6-pitch-count">
                {privatePitchPoints.length} 🔒 private
              </span>
            </span>
          </div>
        </div>
      </div>

      <div className="sec6-outputs">
        {!brand.agentName?.trim() && (
          <div className="sec6-warning">
            <p className="sec6-warning-text">
              <strong>Brand profile incomplete.</strong> The seller page will
              publish, but the &ldquo;Your agent&rdquo; section will be hidden
              because no agent name is set.{" "}
              <a href="/settings" className="sec6-warning-link">
                Set up your brand profile
              </a>{" "}
              first so visitors see your contact info.
            </p>
          </div>
        )}

        <PublishSection
          state={publishState}
          onPublish={handlePublish}
          onRevoke={handleRevoke}
          disabled={Boolean(missing)}
          propertyAddress={draft.propertyAddress ?? ""}
          propertyCity={draft.propertyCity ?? ""}
          preparedFor={draft.preparedFor ?? ""}
          agentName={brand.agentName ?? ""}
        />

        <div className="sec6-download-block">
          <button
            type="button"
            onClick={handleDownloadPrep}
            disabled={Boolean(missing) || exportState === "downloading"}
            data-testid="step-review-download"
            className="sec6-download-btn"
          >
            {exportState === "downloading"
              ? "Preparing PDF…"
              : exportState === "done"
                ? "Downloaded ✓"
                : "Download prep PDF (agent only)"}
          </button>
          <p className="sec6-download-sub">
            Private companion to the seller page. Includes your full strategy,
            comp notes, and private talking points. Not shared with the client.
          </p>
          {typeof exportState === "object" && "error" in exportState && (
            <p className="sec6-download-error" data-testid="step-review-download-error">
              Export failed: {exportState.error}
            </p>
          )}
        </div>
      </div>
    </section>
  );
}

function PublishSection({
  state,
  onPublish,
  onRevoke,
  disabled,
  propertyAddress,
  propertyCity,
  preparedFor,
  agentName,
}: {
  state: PublishState;
  onPublish: () => void;
  onRevoke: (slug: string) => void;
  disabled: boolean;
  propertyAddress: string;
  propertyCity: string;
  preparedFor: string;
  agentName: string;
}) {
  if (state.kind === "published") {
    const origin =
      typeof window !== "undefined" ? window.location.origin : "";
    const url = `${origin}/h/${state.slug}`;
    const sample = buildSampleSendText({
      preparedFor,
      propertyAddress,
      propertyCity,
      presentationUrl: url,
      agentName,
    });
    return (
      <div className="sec6-published" data-testid="step-review-published">
        <div className="sec6-published-head">
          <span className="sec6-published-dot" aria-hidden />
          <span className="sec6-published-label">Seller page published</span>
        </div>
        <div className="sec6-url-row">
          <code className="sec6-url">{url}</code>
          <CopyButton
            value={url}
            label="Copy URL"
            testId="step-review-copy-url"
            className="sec6-copy-btn"
          />
        </div>
        <div className="sec6-sample">
          <p className="sec6-sample-eyebrow">Sample text to send</p>
          <p className="sec6-sample-text" data-testid="step-review-sample-text">
            {sample}
          </p>
          <CopyButton
            value={sample}
            label="Copy sample text"
            testId="step-review-copy-sample"
            className="sec6-copy-btn sec6-copy-btn-sm"
          />
        </div>
        <div className="sec6-published-actions">
          <button
            type="button"
            onClick={onPublish}
            className="sec6-link-action"
          >
            Publish again (new URL)
          </button>
          <button
            type="button"
            onClick={() => onRevoke(state.slug)}
            className="sec6-link-action sec6-link-revoke"
          >
            Revoke this URL
          </button>
        </div>
      </div>
    );
  }

  if (state.kind === "revoking") {
    return <p className="sec6-revoking">Revoking page…</p>;
  }

  if (state.kind === "revoked") {
    return (
      <div className="sec6-revoked">
        <p className="sec6-revoked-label">Page revoked</p>
        <p className="sec6-revoked-note">
          The previous URL now returns a &ldquo;not available&rdquo; page.
          Publish again to share a fresh link.
        </p>
        <button
          type="button"
          onClick={onPublish}
          disabled={disabled}
          className="sec6-publish-btn"
        >
          Publish seller page
        </button>
      </div>
    );
  }

  if (state.kind === "error") {
    return (
      <div className="sec6-publish-error" data-testid="step-review-publish-error">
        <p className="sec6-publish-error-label">Something went wrong</p>
        <p className="sec6-publish-error-msg">{state.message}</p>
        <button
          type="button"
          onClick={onPublish}
          disabled={disabled}
          className="sec6-publish-btn"
        >
          Try again
        </button>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={onPublish}
      disabled={disabled || state.kind === "publishing"}
      data-testid="step-review-publish"
      className="sec6-publish-btn"
    >
      {state.kind === "publishing" ? "Publishing…" : "Publish seller page"}
    </button>
  );
}

function ValidationBlock({
  missing,
  goToStep,
}: {
  missing: string;
  goToStep: (stepId: StepId) => void;
}) {
  const { stepId, label } = fieldToStep(missing);
  return (
    <div className="sec6-missing" data-testid="step-review-missing">
      <p className="sec6-missing-label">Missing: {label}</p>
      <button
        type="button"
        onClick={() => goToStep(stepId)}
        className="sec6-missing-action"
      >
        Go back to fix →
      </button>
    </div>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="sec6-row">
      <span className="sec6-row-label">{label}</span>
      <span className="sec6-row-value">{value}</span>
    </div>
  );
}

/**
 * A7c.5 — Personalized "Copy sample text" message builder.
 *
 * Renders the post-publish message the agent copies into iMessage. The
 * generic A7c.3 string ("Hey, here's the listing presentation for…")
 * read like an automated blast; this one threads the seller's name,
 * the property, the live URL, and the agent's signature into copy that
 * sounds like a real follow-up after a listing appointment.
 *
 * Fallbacks are deliberate so no input combination ever leaks a literal
 * {{token}}: missing seller → "Hi there,", missing address → "your
 * home", missing agent → signature line omitted entirely. The
 * presentation URL is always present here because PublishSection only
 * renders this UI in the `published` state.
 *
 * Em-dash-free on purpose (codebase-wide sweep — Dallen reads them as
 * an AI tell).
 */
export function buildSampleSendText(input: {
  preparedFor?: string;
  propertyAddress?: string;
  propertyCity?: string;
  presentationUrl: string;
  agentName?: string;
}): string {
  const sellerName = deriveSellerName(input.preparedFor);
  const propertyLabel = derivePropertyLabel(
    input.propertyAddress,
    input.propertyCity,
  );
  const agentName = (input.agentName ?? "").trim();

  const greeting = sellerName ? `Hi ${sellerName},` : "Hi there,";
  const body = `I put together the presentation for ${propertyLabel} so you can review everything in one place, including pricing context, recent nearby sales, and the plan I'd recommend if we move forward.`;
  const link = `Here's the link: ${input.presentationUrl}`;
  const closing =
    "Take a look when you have a minute, and if anything stands out or you want to talk through the pricing together, I'm happy to walk through it with you.";

  const lines = [greeting, body, link, closing];
  if (agentName) lines.push(agentName);
  return lines.join("\n");
}

function deriveSellerName(raw?: string): string {
  const trimmed = (raw ?? "").trim();
  if (!trimmed) return "";
  // "the Halloran family" / "The Smiths" already read as a greeting
  // subject; keep verbatim instead of slicing to "the".
  if (/^the\b/i.test(trimmed)) return trimmed;
  // Titled forms ("Mr. Smith", "Mrs. Garcia") read better whole than
  // as a bare title-only first token.
  if (/^(mr|mrs|ms|dr|miss)\.?\s/i.test(trimmed)) return trimmed;
  // Default: first whitespace-separated token reads as a first name.
  return trimmed.split(/\s+/)[0];
}

function derivePropertyLabel(address?: string, city?: string): string {
  const street = (address ?? "").trim();
  const cityPart = (city ?? "").trim();
  if (!street) return "your home";
  return cityPart ? `${street}, ${cityPart}` : street;
}

/**
 * Copy-to-clipboard button with a 2-second "Copied!" confirmation.
 * Inline label swap + check icon for sighted users; aria-live="polite"
 * announces the change for screen readers. The clipboard call is
 * best-effort — if the API is unavailable we still flip the visible
 * state so the agent gets the same affordance.
 */
function CopyButton({
  value,
  label,
  testId,
  className,
}: {
  value: string;
  label: string;
  testId?: string;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current !== null) clearTimeout(timerRef.current);
    };
  }, []);

  const handleClick = () => {
    try {
      void navigator.clipboard?.writeText(value);
    } catch {
      // best-effort
    }
    setCopied(true);
    if (timerRef.current !== null) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setCopied(false), 2000);
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      aria-live="polite"
      data-testid={testId}
      className={className}
    >
      {copied ? (
        <span className="inline-flex items-center gap-1">
          <svg
            viewBox="0 0 24 24"
            width="12"
            height="12"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.4"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M5 12l4 4 10-10" />
          </svg>
          Copied!
        </span>
      ) : (
        label
      )}
    </button>
  );
}
