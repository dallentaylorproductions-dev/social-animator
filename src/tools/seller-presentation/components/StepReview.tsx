"use client";

import { useEffect, useRef, useState } from "react";
import { useBrandSettings } from "@/lib/brand";
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
 * Neither backend exists in A5b — A6 builds the publish endpoint +
 * the public-payload serializer, A6/A7 build the PDF + web-page
 * renderers. Until then both buttons are wired but fail gracefully:
 *
 *   - Publish: fetch('/api/seller-presentation/publish') → 404 →
 *     parsed as a non-ok body → error state with the message.
 *   - Download prep PDF: dynamic-import('../output/prep-pdf') →
 *     ModuleNotFoundError → caught → error state.
 *
 * The OH Prep error-state UX (rounded red panel + "Try again" button)
 * absorbs both cases without crashing. A6 lights up Publish; A7 lights
 * up the PDF.
 *
 * Public-payload preview (A6 anchor): the summary block below shows
 * the agent-controlled public/private split — comp count, recommended
 * price + rationale, public vs private pitch points. This is the
 * UI surface where A6's `toPublicPayload` becomes obvious to the
 * agent before publish.
 */

interface StepReviewProps {
  draft: SellerPresentationDraft;
  goToStep: (stepId: StepId) => void;
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

export function StepReview({ draft, goToStep }: StepReviewProps) {
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
      // A7 ships ../output/prep-pdf with downloadSellerPresentationPrepPdf.
      // Until then the dynamic import throws ModuleNotFoundError, which we
      // catch and surface as a non-fatal error state. The @ts-expect-error
      // is self-deleting: once A7 lands the file, the suppression becomes
      // unused-and-erroring, forcing this branch to be cleaned up.
      // @ts-expect-error A7 lands ../output/prep-pdf; remove this directive then.
      const mod = (await import("../output/prep-pdf").catch((err: unknown) => {
        throw err instanceof Error
          ? err
          : new Error(
              "Prep PDF renderer not deployed yet. A7 wires the react-pdf module.",
            );
      })) as {
        downloadSellerPresentationPrepPdf: (
          d: SellerPresentationDraft,
          a: typeof agentContact,
        ) => Promise<void>;
      };
      await mod.downloadSellerPresentationPrepPdf(draft, agentContact);
      setExportState("done");
      setTimeout(() => setExportState("idle"), 2000);
    } catch (err) {
      setExportState({
        error: err instanceof Error ? err.message : "Export failed",
      });
    }
  }

  return (
    <div className="space-y-6" data-testid="step-review">
      <header>
        <h2 className="text-lg font-medium">Review</h2>
        <p className="mt-1 text-xs text-gray-500">
          Check everything, then publish to get a shareable link for your
          client.
        </p>
      </header>

      {missing ? (
        <ValidationBlock missing={missing} goToStep={goToStep} />
      ) : (
        <div
          className="rounded border border-mint/40 bg-mint/5 p-4"
          data-testid="step-review-ready"
        >
          <p className="text-sm font-medium text-mint">Ready to publish</p>
        </div>
      )}

      <section
        className="space-y-3 text-sm text-gray-300"
        data-testid="step-review-summary"
      >
        <h3 className="text-xs uppercase tracking-wider text-gray-500">
          Summary
        </h3>
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
          value={draft.pricingStrategyId || "—"}
        />
        <SummaryRow
          label="Confidence"
          value={draft.confidence || "—"}
        />
        <SummaryRow label="Comps" value={`${draft.comps.length} provided`} />
        <SummaryRow
          label="Pitch points"
          value={`${publicPitchPoints.length + privatePitchPoints.length} total · ${publicPitchPoints.length} 🌐 public · ${privatePitchPoints.length} 🔒 private`}
        />
      </section>

      <div className="space-y-4 border-t border-neutral-800 pt-4">
        {!brand.agentName?.trim() && (
          <div className="rounded-md border border-gold/40 bg-gold/10 p-3">
            <p className="text-sm text-gold">
              <strong>Brand profile incomplete.</strong> The seller page will
              publish, but the &ldquo;Your agent&rdquo; section will be hidden
              because no agent name is set.{" "}
              <a href="/settings" className="underline hover:no-underline">
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

        <div className="flex flex-col gap-2">
          {/* A7c.1: prep-PDF is disabled with a "coming soon" label
              until A7e ships the renderer. Clicking can't happen
              while disabled, so the dynamic-import to ../output/prep-pdf
              never executes — the previous flow that surfaced a
              "Cannot find module" error in Dallen's smoke is gone.
              The handleDownloadPrep wiring + the @ts-expect-error
              dynamic-import stay in the file for A7e to light up
              (the directive will self-delete when prep-pdf.tsx
              lands and the suppression goes unused). */}
          <button
            type="button"
            onClick={handleDownloadPrep}
            disabled
            data-testid="step-review-download"
            aria-label="Prep PDF (coming soon, A7e)"
            className="self-start rounded border border-neutral-700 px-5 py-2.5 text-sm font-medium text-neutral-500 disabled:cursor-not-allowed"
          >
            Prep PDF (coming soon)
          </button>
          {typeof exportState === "object" && "error" in exportState && (
            <p
              className="text-xs text-red-400"
              data-testid="step-review-download-error"
            >
              Export failed: {exportState.error}
            </p>
          )}
        </div>
      </div>
    </div>
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
      <div
        className="space-y-3 rounded border border-mint/40 bg-mint/5 p-4"
        data-testid="step-review-published"
      >
        <p className="text-sm font-medium text-mint">Seller page published</p>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <code className="flex-1 break-all rounded border border-neutral-700 bg-neutral-900 px-3 py-2 text-xs text-text-primary">
            {url}
          </code>
          <CopyButton
            value={url}
            label="Copy URL"
            testId="step-review-copy-url"
            className="rounded border border-neutral-700 px-3 py-2 text-xs text-text-primary hover:bg-neutral-800"
          />
        </div>
        <div>
          <p className="mt-2 text-[11px] uppercase tracking-wider text-gray-500">
            Sample text to send
          </p>
          <p
            className="mt-1 whitespace-pre-line text-xs italic leading-relaxed text-gray-300"
            data-testid="step-review-sample-text"
          >
            {sample}
          </p>
          <CopyButton
            value={sample}
            label="Copy sample text"
            testId="step-review-copy-sample"
            className="mt-2 rounded border border-neutral-700 px-3 py-1.5 text-[11px] text-text-primary hover:bg-neutral-800"
          />
        </div>
        <div className="flex gap-3 pt-1">
          <button
            type="button"
            onClick={onPublish}
            className="text-xs text-mint hover:underline"
          >
            Publish again (new URL)
          </button>
          <button
            type="button"
            onClick={() => onRevoke(state.slug)}
            className="text-xs text-gray-500 hover:text-red-400"
          >
            Revoke this URL
          </button>
        </div>
      </div>
    );
  }

  if (state.kind === "revoking") {
    return <p className="text-xs italic text-gray-500">Revoking page…</p>;
  }

  if (state.kind === "revoked") {
    return (
      <div className="space-y-3 rounded border border-neutral-800 bg-neutral-900 p-4">
        <p className="text-sm font-medium text-text-primary">Page revoked</p>
        <p className="text-xs text-gray-500">
          The previous URL now returns a &ldquo;not available&rdquo; page.
          Publish again to share a fresh link.
        </p>
        <button
          type="button"
          onClick={onPublish}
          disabled={disabled}
          className="rounded bg-mint px-5 py-2.5 text-sm font-medium text-black hover:bg-mint-hover disabled:cursor-not-allowed disabled:opacity-40"
        >
          Publish seller page
        </button>
      </div>
    );
  }

  if (state.kind === "error") {
    return (
      <div
        className="space-y-2 rounded border border-red-500/40 bg-red-500/5 p-4"
        data-testid="step-review-publish-error"
      >
        <p className="text-sm font-medium text-red-300">Something went wrong</p>
        <p className="text-xs text-red-200/80">{state.message}</p>
        <button
          type="button"
          onClick={onPublish}
          disabled={disabled}
          className="rounded bg-mint px-5 py-2.5 text-sm font-medium text-black hover:bg-mint-hover disabled:cursor-not-allowed disabled:opacity-40"
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
      className="rounded bg-mint px-5 py-2.5 text-sm font-semibold text-black hover:bg-mint-hover disabled:cursor-not-allowed disabled:opacity-40"
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
    <div
      className="space-y-3 rounded border border-red-500/40 bg-red-500/5 p-4"
      data-testid="step-review-missing"
    >
      <p className="text-sm font-medium text-red-300">Missing: {label}</p>
      <button
        type="button"
        onClick={() => goToStep(stepId)}
        className="text-xs text-mint hover:underline"
      >
        Go back to fix →
      </button>
    </div>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline gap-3">
      <span className="min-w-[180px] text-xs uppercase tracking-wider text-gray-500">
        {label}
      </span>
      <span className="flex-1">{value}</span>
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
