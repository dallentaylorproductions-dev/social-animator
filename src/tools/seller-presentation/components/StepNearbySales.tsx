"use client";

import { useEffect, useRef, useState } from "react";
import type { Comp } from "@/tools/seller-intelligence-report/engine/types";
import type { SellerPresentationDraft } from "../engine/types";
import { useSPEntitlement } from "./SPEntitlementContext";
import { ImageUploadField } from "@/components/ImageUploadField";
import { CompPhotoPlaceholder } from "../output/flagship/CompPhotoPlaceholder";
import {
  resolveCompCoverage,
  streetViewStaticUrl,
  STREET_VIEW_IMG_SIZE,
  STREET_VIEW_FOV,
  STREET_VIEW_PITCH,
} from "@/lib/seller-presentation/street-view";

/**
 * Seller State A - the "nearby sales" step (invitation mode only).
 *
 * Phase 2 turns this from a manual ADDRESS-ENTRY step into a REVIEW step. The
 * agent sets the subject address once on Step 1; the prepared-invitation flow
 * auto-pulls a few recent nearby sales (RentCast, server-side) and resolves a
 * Street View thumbnail for each, writing them onto `draft.comps`. By the time
 * the agent lands here, the sales are already there - so this step is "review
 * and trim," not "look up and type":
 *
 *   - Each comp renders as a compact card: Street View thumbnail + street name.
 *     NO price (the prepared invitation carries no price; the full price data
 *     rides the private draft for Stage 2 and is stripped from the State A
 *     publish by toPublicPayload).
 *   - The agent can REMOVE any sale that does not fit.
 *   - A manual ADD input remains as the fallback - if the auto-pull returned
 *     nothing (a rural address, a plan gap, an outage), the agent can still seed
 *     a couple of streets by hand, exactly as before.
 *
 * Entirely OPTIONAL: with no comps the brief's nearby-sales block flexes out
 * cleanly. Rendered ONLY in the invitation flow, so the full presentation's
 * StepComps (and flag-off) are untouched.
 */

const MAX_NEARBY = 4;
/** Debounce before resolving Street View for a freshly-added manual address, so
 *  a fast typist doesn't fire a metadata lookup per keystroke. */
const STREET_VIEW_RESOLVE_MS = 500;

interface StepNearbySalesProps {
  draft: SellerPresentationDraft;
  setDraft: (next: SellerPresentationDraft) => void;
}

function nearbyComp(address: string): Comp {
  return { address, soldPrice: "", source: "manual" };
}

export function StepNearbySales({ draft, setDraft }: StepNearbySalesProps) {
  const { compPhotosEnabled } = useSPEntitlement();
  // `comps` is always an array (SellerPresentationDraft.comps is required;
  // EMPTY_DRAFT seeds []), so reference it directly. A `?? []` fallback would be
  // a fresh array each render and churn the resolver effect's deps.
  const comps = draft.comps;
  const canAdd = comps.length < MAX_NEARBY;
  const [pendingAddress, setPendingAddress] = useState("");
  // Which comp's "add / replace photo" panel is open (one at a time keeps the
  // review focused, not a wall of dropzones). Indexed; reset when the matching
  // card is removed so the panel never lands on the wrong card.
  const [openPhotoIdx, setOpenPhotoIdx] = useState<number | null>(null);

  // Latest-draft ref so the async Street View resolve applies against the
  // current comps, not the stale closure from when it was queued (same posture
  // as StepComps).
  const draftRef = useRef(draft);
  useEffect(() => {
    draftRef.current = draft;
  }, [draft]);

  // COMP_PHOTOS - resolve Street View coverage for any comp that does not have
  // it yet (a manual add here, or an auto-pulled comp whose resolve was missed).
  // Auto-pulled comps usually arrive already resolved from Step 1, so this is a
  // safety net + the manual-add path. Flag-gated, debounced, idempotent (a comp
  // with a manual photo or already-set hasStreetView is skipped), so it never
  // loops or re-bills. Mirrors StepComps' resolver exactly.
  useEffect(() => {
    if (compPhotosEnabled !== true) return;
    const pending = comps.filter(
      (c) =>
        !!c.address?.trim() && !c.photoUrl && c.hasStreetView === undefined,
    );
    if (pending.length === 0) return;

    let cancelled = false;
    const id = setTimeout(() => {
      void (async () => {
        const results = await Promise.all(
          pending.map(async (c) => ({
            address: c.address,
            cov: await resolveCompCoverage(c.address),
          })),
        );
        if (cancelled) return;
        const cur = draftRef.current;
        setDraft({
          ...cur,
          comps: cur.comps.map((c) => {
            if (
              c.photoUrl ||
              c.hasStreetView !== undefined ||
              !c.address?.trim()
            )
              return c;
            const hit = results.find((r) => r.address === c.address);
            if (!hit) return c;
            return {
              ...c,
              streetViewPanoId: hit.cov.panoId,
              hasStreetView: hit.cov.hasStreetView,
              streetViewHeading: hit.cov.heading,
              houseLat: hit.cov.houseLat,
              houseLng: hit.cov.houseLng,
            };
          }),
        });
      })();
    }, STREET_VIEW_RESOLVE_MS);

    return () => {
      cancelled = true;
      clearTimeout(id);
    };
  }, [comps, compPhotosEnabled, setDraft]);

  const removeAt = (index: number) => {
    if (openPhotoIdx === index) setOpenPhotoIdx(null);
    setDraft({ ...draft, comps: comps.filter((_, i) => i !== index) });
  };

  // An agent-supplied photo (Vercel Blob) for a comp that lacks Street View
  // coverage - or that the agent simply prefers a different shot of. It takes
  // precedence over Street View at render and counts as "photographed", so the
  // comp earns its slot in the brief. Empty string clears it (back to Street
  // View or the placeholder).
  const setPhotoAt = (index: number, url: string) => {
    setDraft({
      ...draft,
      comps: comps.map((c, i) =>
        i === index ? { ...c, photoUrl: url || undefined } : c,
      ),
    });
  };

  const addManual = () => {
    const value = pendingAddress.trim();
    if (!value || !canAdd) return;
    setDraft({ ...draft, comps: [...comps, nearbyComp(value)].slice(0, MAX_NEARBY) });
    setPendingAddress("");
  };

  const hasComps = comps.length > 0;

  return (
    <section className="home" data-testid="step-nearby-sales">
      <div className="sec-head">
        <h2 className="sec-title">Nearby sales</h2>
        <p className="sec-sub">
          {hasComps
            ? "Recent sales near your seller's home, ready for you to review. Remove any that do not fit. They show up as “nearby sales reviewed” in the invitation, so it reads like you have already done your homework."
            : "Recent sales near your seller's home will appear here once you set the address on the first step. You can also add a couple by hand below."}
        </p>
      </div>

      {hasComps && (
        <div className="sa-review" data-testid="step-nearby-sales-list">
          {comps.map((c, index) => {
            const sv =
              compPhotosEnabled === true && c.hasStreetView
                ? streetViewStaticUrl(c.streetViewPanoId, {
                    size: STREET_VIEW_IMG_SIZE,
                    heading: c.streetViewHeading,
                    fov: STREET_VIEW_FOV,
                    pitch: STREET_VIEW_PITCH,
                  })
                : null;
            const photo = c.photoUrl?.trim() || sv;
            const photoOpen = openPhotoIdx === index;
            return (
              <div
                className="sa-review__card"
                key={index}
                data-testid={`step-nearby-sales-card-${index}`}
              >
                <div className="sa-review__main">
                  <div className="sa-review__thumb">
                    {photo ? (
                      // eslint-disable-next-line @next/next/no-img-element -- fetched fresh from Google in the agent's browser, never proxied or stored (same compliance path as the flagship comp card)
                      <img
                        src={photo}
                        alt=""
                        aria-hidden="true"
                        loading="lazy"
                        decoding="async"
                        data-testid={`step-nearby-sales-thumb-${index}`}
                      />
                    ) : (
                      <CompPhotoPlaceholder
                        testId={`step-nearby-sales-placeholder-${index}`}
                      />
                    )}
                  </div>
                  <div className="sa-review__addr">{c.address || "Nearby"}</div>
                  {compPhotosEnabled === true && (
                    <button
                      type="button"
                      className="sa-review__photo-toggle"
                      onClick={() =>
                        setOpenPhotoIdx(photoOpen ? null : index)
                      }
                      aria-expanded={photoOpen}
                      data-testid={`step-nearby-sales-photo-toggle-${index}`}
                    >
                      {photoOpen ? "Done" : photo ? "Replace photo" : "Add photo"}
                    </button>
                  )}
                  <button
                    type="button"
                    className="sa-nearby__remove"
                    onClick={() => removeAt(index)}
                    aria-label={`Remove nearby sale ${index + 1}`}
                    data-testid={`step-nearby-sales-remove-${index}`}
                  >
                    ✕
                  </button>
                </div>
                {compPhotosEnabled === true && photoOpen && (
                  <div className="sa-review__photo">
                    <ImageUploadField
                      label="Photo for this sale"
                      value={c.photoUrl ?? ""}
                      onChange={(url) => setPhotoAt(index, url)}
                      previewAspect="aspect-[4/3]"
                      folder="seller-presentation/comps"
                      testIdPrefix={`step-nearby-sales-photo-${index}`}
                      disablePasteUrl
                      emptyTitle="Choose a photo"
                      emptySubtext="Use your own photo of this home for the invitation."
                      helpText="Your photo replaces the default street photo for this sale."
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {canAdd && (
        <div className="fields sa-nearby">
          <div className="sa-nearby__row">
            <input
              type="text"
              className="input"
              value={pendingAddress}
              onChange={(e) => setPendingAddress(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addManual();
                }
              }}
              onBlur={addManual}
              placeholder={hasComps ? "Add another recent sale nearby" : "742 N Cedar St"}
              aria-label="Add a nearby sale address"
              data-testid="step-nearby-sales-add"
            />
          </div>
          <p className="hint">
            {hasComps
              ? `${comps.length} added. Leave it here, or add a couple more up to ${MAX_NEARBY}.`
              : "Optional. Skip it and the invitation simply leaves this out."}
          </p>
        </div>
      )}

      <p className="autosave-note">
        <span className="dot-live" /> Saved automatically.
      </p>
    </section>
  );
}
