"use client";

import { useEffect, useRef, useState } from "react";
import { useBrandSettings } from "@/lib/brand";
import { brandToPublishInputs } from "./preview/preview-payload";
import { spStrategyDisplayLabel } from "../content/strategy-display-labels";
import {
  isInvitationStatus,
  validateForExport,
  REQUIRED_INPUT_LABELS,
  type SellerPresentationDraft,
} from "../engine/types";
import { formatAppointment } from "../engine/appointment";
import {
  formatPriceRangeDisplay,
  isPriceRangeActive,
} from "../engine/price-range";
import { useSPEntitlement } from "./SPEntitlementContext";

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
  /**
   * SP-LIB — the slug this instance is already published to, if any.
   * When present, publish re-publishes into the SAME page (the publish
   * route calls updateHandout) so the seller's existing link is stable.
   * Undefined for a never-published draft, or when the library flag is
   * off (the page passes nothing, byte-identical to today).
   */
  publishedSlug?: string;
  /**
   * SP-LIB — called with the assigned slug after a successful publish so
   * the page can stamp the instance (markPublished) and the library can
   * derive Live / edits-pending. Optional; absent when the flag is off.
   */
  onPublished?: (slug: string) => void;
}

type PublishState =
  | { kind: "idle" }
  | { kind: "publishing" }
  | { kind: "published"; slug: string }
  | { kind: "revoking" }
  | { kind: "revoked" }
  | { kind: "error"; message: string };

type ExportState = "idle" | "downloading" | "done" | { error: string };

// Maps a missing-required key to the wizard step that collects it. The
// human LABEL comes from the shared REQUIRED_INPUT_LABELS so this hint and
// the publish route's named-rejection message always agree.
function fieldToStep(field: string): { stepId: StepId; label: string } {
  const label = REQUIRED_INPUT_LABELS[field] ?? field;
  switch (field) {
    case "propertyAddress":
      return { stepId: "property", label };
    case "recommendedPrice":
      return { stepId: "strategy", label };
    case "comps":
    case "comps[0]":
      return { stepId: "comps", label };
    default:
      return { stepId: "property", label };
  }
}

export function StepReview({
  draft,
  goToStep,
  publishedSlug,
  onPublished,
}: StepReviewProps) {
  const [publishState, setPublishState] = useState<PublishState>({
    kind: "idle",
  });
  const [exportState, setExportState] = useState<ExportState>("idle");
  const { settings: brand } = useBrandSettings();
  const { sellerStateAEnabled } = useSPEntitlement();
  const missing = validateForExport(draft);

  // Seller State A — the prepared invitation is a leaner, pre-walkthrough
  // surface: it carries no price, no pricing strategy, and no pitch points, so
  // the Review step drops those summary rows (they would all read "—" and
  // re-introduce the very price the invitation is built to withhold) and speaks
  // in "send your invitation" language instead of "publish the full
  // presentation." Full presentation (revealed / absent, or the flag off) is
  // byte-identical to before.
  const invitation =
    sellerStateAEnabled === true && isInvitationStatus(draft.valuationStatus);
  const appointmentLabel = formatAppointment(draft.appointmentAt)?.full ?? "—";

  // The publish inputs (agentContact + A7d.2 reviews + E.0/E.1 brand colors)
  // are built by the SHARED `brandToPublishInputs` so this real publish and the
  // wizard live preview construct the identical payload — one source, no drift.
  // The route forwards these to `toPublicPayload`, which projects/validates them.
  const { agentContact, brandReviews, brandColors, brandWhyUs } =
    brandToPublishInputs(brand);

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
        body: JSON.stringify({
          draft,
          agentContact,
          brandReviews,
          brandColors,
          brandWhyUs,
          // SP-LIB — re-publish into the existing page when we have one.
          // Undefined here ⇒ omitted ⇒ the route mints a fresh slug
          // (today's behavior, and the flag-off path).
          slug: publishedSlug,
        }),
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
      // SP-LIB — record the publish onto the instance (Live + stable link).
      onPublished?.(body.slug);
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
        <h2 className="sec-title">{invitation ? "Review and send" : "Review"}</h2>
        <p className="sec-sub">
          {invitation
            ? "Take one last look, then send your seller the invitation. It shows them you have done your homework before you even meet."
            : "Check the summary. Publish to get a shareable link for your seller, then download the prep PDF for yourself."}
        </p>
      </div>

      {missing ? (
        <ValidationBlock missing={missing} goToStep={goToStep} />
      ) : (
        <div className="sec6-ready" data-testid="step-review-ready">
          <span className="sec6-ready-dot" aria-hidden />
          <span className="sec6-ready-label">
            {invitation ? "Ready to send" : "Ready to publish"}
          </span>
        </div>
      )}

      <div className="sec6-summary" data-testid="step-review-summary">
        <h3 className="sec6-summary-head">Summary</h3>
        {invitation ? (
          // Invitation summary — only what the invitation actually carries. No
          // price / rationale / strategy / confidence / pitch-point rows: those
          // belong to the full presentation and would read "—" here, re-surfacing
          // the very price the invitation is built to withhold.
          <div className="sec6-rows">
            <SummaryRow label="Property" value={draft.propertyAddress || "—"} />
            {draft.propertyCity && (
              <SummaryRow label="City" value={draft.propertyCity} />
            )}
            <SummaryRow label="Appointment" value={appointmentLabel} />
            <SummaryRow
              label="Nearby sales"
              value={`${draft.comps.length} ready to show`}
            />
          </div>
        ) : (
          <div className="sec6-rows">
            <SummaryRow label="Property" value={draft.propertyAddress || "—"} />
            {draft.propertyCity && (
              <SummaryRow label="City" value={draft.propertyCity} />
            )}
            <SummaryRow
              label="Recommended price"
              value={
                isPriceRangeActive(
                  draft.recommendedPriceLow,
                  draft.recommendedPriceHigh,
                )
                  ? formatPriceRangeDisplay(
                      draft.recommendedPriceLow!,
                      draft.recommendedPriceHigh!,
                    )
                  : draft.recommendedPrice || "—"
              }
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
        )}
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
          invitation={invitation}
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
            {invitation
              ? "Private companion for your own prep. Holds the nearby sales you reviewed and your notes for the walkthrough. Not shared with the client."
              : "Private companion to the seller page. Includes your full strategy, comp notes, and private talking points. Not shared with the client."}
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
  invitation,
  propertyAddress,
  propertyCity,
  preparedFor,
  agentName,
}: {
  state: PublishState;
  onPublish: () => void;
  onRevoke: (slug: string) => void;
  disabled: boolean;
  /** Seller State A — drives the "invitation" vs "seller page" publish copy. */
  invitation: boolean;
  propertyAddress: string;
  propertyCity: string;
  preparedFor: string;
  agentName: string;
}) {
  // The publish action verb + noun, in invitation vs full-presentation voice.
  const publishLabel = invitation ? "Publish invitation" : "Publish seller page";
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
      invitation,
    });
    return (
      <div className="sec6-published" data-testid="step-review-published">
        <div className="sec6-published-head">
          <span className="sec6-published-dot" aria-hidden />
          <span className="sec6-published-label">
            {invitation ? "Invitation published" : "Seller page published"}
          </span>
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
          <p className="sec6-sample-eyebrow">Now send this to your seller</p>
          <p className="sec6-sample-text" data-testid="step-review-sample-text">
            {sample}
          </p>
          <CopyButton
            value={sample}
            label="Copy sample text"
            testId="step-review-copy-sample"
            className="sec6-publish-btn"
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
          {publishLabel}
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
      {state.kind === "publishing" ? "Publishing…" : publishLabel}
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
  /**
   * Seller State A — the prepared invitation is a BEFORE-appointment page with
   * no price yet, so its sample message frames a quick look ahead of the
   * meeting and never mentions pricing context or a recommendation. Defaults
   * false so the full-presentation message is byte-identical to before.
   */
  invitation?: boolean;
}): string {
  const sellerName = deriveSellerName(input.preparedFor);
  const propertyLabel = derivePropertyLabel(
    input.propertyAddress,
    input.propertyCity,
  );
  const agentName = (input.agentName ?? "").trim();

  const greeting = sellerName ? `Hi ${sellerName},` : "Hi there,";
  const body = input.invitation
    ? `I put together a quick page for ${propertyLabel} ahead of our appointment, so you can see how I'm preparing and what to expect when we meet.`
    : `I put together the presentation for ${propertyLabel} so you can review everything in one place, including pricing context, recent nearby sales, and the plan I'd recommend if we move forward.`;
  const link = `Here's the link: ${input.presentationUrl}`;
  const closing = input.invitation
    ? "Take a look when you have a minute. I'm looking forward to walking through everything with you in person."
    : "Take a look when you have a minute, and if anything stands out or you want to talk through the pricing together, I'm happy to walk through it with you.";

  // Blank-line spacing between each paragraph so the message is scannable
  // when pasted into a text or email, and the link sits on its own line
  // (not buried mid-sentence). Em-dash-free; see the doc comment above.
  const lines = [greeting, body, link, closing];
  if (agentName) lines.push(agentName);
  return lines.join("\n\n");
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
