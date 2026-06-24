"use client";

import { useEffect, useRef } from "react";
import { ImageUploadField } from "@/components/ImageUploadField";
import { NumberInput } from "@/components/inputs";
import { useSPEntitlement } from "@/tools/seller-presentation/components/SPEntitlementContext";
import { resolveCompCoverage } from "@/lib/seller-presentation/street-view";
import {
  type SettingsRecentListing,
  RECENT_LISTINGS_CAP,
  emptyRecentListing,
} from "@/lib/seller-presentation/recent-listings";

/**
 * Settings — Seller State A · Zone 5 "recent listings" editor (the editable
 * source of truth for the exposure coverflow).
 *
 * The agent enters their OWN recent listings here, set once: a photo, the
 * address + city, and an OPTIONAL view count. The block is lean by design
 * (the coverflow flexes IN): an agent who adds nothing simply gets the
 * capability-cards-only section, so the empty state offers a clear "skip and
 * add later" affordance and the whole thing is capped at RECENT_LISTINGS_CAP.
 *
 * Photo: hosted upload via the shared `ImageUploadField` (camera-roll → Vercel
 * Blob → hosted URL). When no photo is uploaded, a Street View of the address
 * is resolved (pano id only, never image bytes) exactly like the comp thumbs,
 * gated on the same `compPhotosEnabled` entitlement the comp resolver uses.
 *
 * Honesty: the view count is agent-entered (the public-portal / Zillow number),
 * never scraped and never auto-filled. Blank is a first-class state — the card
 * renders photo + address with no number.
 */

// Match StepNearbySales: resolve Street View 500ms after the agent stops
// editing the address, so a row resolves once (never per keystroke).
const STREET_VIEW_RESOLVE_MS = 500;

export function RecentListingsEditor({
  listings,
  onChange,
  enablePhotoPosition = false,
}: {
  listings: SettingsRecentListing[];
  onChange: (next: SettingsRecentListing[]) => void;
  /**
   * Studio Profile opt-in: show the per-listing photo position/zoom control.
   * Defaults false so the existing /settings usage is byte-identical; the Studio
   * "Recent work" step passes true.
   */
  enablePhotoPosition?: boolean;
}) {
  const { compPhotosEnabled } = useSPEntitlement();
  const atCap = listings.length >= RECENT_LISTINGS_CAP;

  const patch = (idx: number, next: Partial<SettingsRecentListing>) =>
    onChange(listings.map((l, i) => (i === idx ? { ...l, ...next } : l)));
  const remove = (idx: number) =>
    onChange(listings.filter((_, i) => i !== idx));
  const move = (from: number, to: number) => {
    if (to < 0 || to >= listings.length) return;
    const next = listings.slice();
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    onChange(next);
  };
  const add = () => {
    if (atCap) return;
    onChange([...listings, emptyRecentListing()]);
  };

  // Street View fallback resolver. Mirrors StepNearbySales exactly: only rows
  // with an address, no uploaded photo, and no resolution yet (hasStreetView
  // undefined) are pending, debounced so an agent mid-type never re-bills. A
  // ref holds the latest listings so the async result applies to current state.
  const listingsRef = useRef(listings);
  useEffect(() => {
    listingsRef.current = listings;
  }, [listings]);

  useEffect(() => {
    if (compPhotosEnabled !== true) return;
    const pending = listings.filter(
      (l) =>
        !!l.address?.trim() && !l.photoUrl && l.hasStreetView === undefined,
    );
    if (pending.length === 0) return;

    let cancelled = false;
    const id = setTimeout(() => {
      void (async () => {
        const results = await Promise.all(
          pending.map(async (l) => ({
            address: l.address,
            cov: await resolveCompCoverage(l.address),
          })),
        );
        if (cancelled) return;
        onChange(
          listingsRef.current.map((l) => {
            if (l.photoUrl || l.hasStreetView !== undefined || !l.address?.trim())
              return l;
            const hit = results.find((r) => r.address === l.address);
            if (!hit) return l;
            return {
              ...l,
              streetViewPanoId: hit.cov.panoId,
              hasStreetView: hit.cov.hasStreetView,
              streetViewHeading: hit.cov.heading,
            };
          }),
        );
      })();
    }, STREET_VIEW_RESOLVE_MS);

    return () => {
      cancelled = true;
      clearTimeout(id);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listings, compPhotosEnabled]);

  return (
    <div
      className="space-y-4 border-t border-neutral-900 pt-6"
      data-testid="brand-recent-listings"
    >
      <h3 className="text-xs uppercase tracking-[0.18em] text-neutral-500">
        Seller Presentation: recent listings
      </h3>
      <p className="-mt-2 text-[11px] text-neutral-600 leading-relaxed">
        Your own recent listings, shown as a flip-through on the invitation page.
        Add a photo, the address, and the number of views the listing got on its
        public portal. Views are optional and never invented. Add up to{" "}
        {RECENT_LISTINGS_CAP}, or skip this and add them later.
      </p>

      <div className="space-y-3">
        {listings.length === 0 && (
          <p className="text-xs text-neutral-500" data-testid="brand-listing-empty">
            No listings yet. This section is optional. Add one to show your recent
            reach, or leave it blank.
          </p>
        )}

        {listings.map((listing, idx) => (
          <div
            key={idx}
            className="space-y-3 rounded border border-neutral-800 bg-neutral-900/40 p-3"
            data-testid={`brand-listing-row-${idx}`}
          >
            <div className="flex items-center justify-between">
              <span className="text-[10px] uppercase tracking-wider text-neutral-500">
                Listing {idx + 1}
              </span>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => move(idx, idx - 1)}
                  disabled={idx === 0}
                  aria-label="Move up"
                  data-testid={`brand-listing-up-${idx}`}
                  className="text-xs text-neutral-500 hover:text-neutral-200 disabled:opacity-30"
                >
                  ↑
                </button>
                <button
                  type="button"
                  onClick={() => move(idx, idx + 1)}
                  disabled={idx === listings.length - 1}
                  aria-label="Move down"
                  data-testid={`brand-listing-down-${idx}`}
                  className="text-xs text-neutral-500 hover:text-neutral-200 disabled:opacity-30"
                >
                  ↓
                </button>
                <button
                  type="button"
                  onClick={() => remove(idx)}
                  data-testid={`brand-listing-remove-${idx}`}
                  className="text-xs text-neutral-500 hover:text-red-400"
                >
                  Remove
                </button>
              </div>
            </div>

            <ImageUploadField
              label="Listing photo"
              value={listing.photoUrl ?? ""}
              onChange={(url) =>
                // A new photo resets any prior framing so it starts centered.
                patch(idx, {
                  photoUrl: url || undefined,
                  photoFocalX: undefined,
                  photoFocalY: undefined,
                  photoScale: undefined,
                })
              }
              previewAspect="aspect-[4/3]"
              folder="agent-recent-listing"
              testIdPrefix={`brand-listing-photo-${idx}`}
              helpText="No photo? We will show a street view of the address."
            />

            {enablePhotoPosition && listing.photoUrl && (
              <div>
                <label className="block text-[10px] uppercase tracking-[0.15em] text-neutral-500 mb-2">
                  Photo position
                </label>
                <div className="flex gap-3 items-start">
                  {/* WYSIWYG preview in the SAME 3:4 the coverflow card uses;
                      click to set the focal point, drag the slider to zoom. */}
                  <button
                    type="button"
                    onClick={(e) => {
                      const rect = e.currentTarget.getBoundingClientRect();
                      const x = Math.round(
                        ((e.clientX - rect.left) / rect.width) * 100,
                      );
                      const y = Math.round(
                        ((e.clientY - rect.top) / rect.height) * 100,
                      );
                      patch(idx, {
                        photoFocalX: Math.min(100, Math.max(0, x)),
                        photoFocalY: Math.min(100, Math.max(0, y)),
                      });
                    }}
                    aria-label="Click where the home is to position the photo"
                    data-testid={`brand-listing-pos-${idx}`}
                    className="relative aspect-[3/4] w-20 shrink-0 cursor-crosshair overflow-hidden rounded-md border border-neutral-800"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={listing.photoUrl}
                      alt=""
                      draggable={false}
                      className="absolute inset-0 h-full w-full object-cover"
                      style={{
                        objectPosition: `${listing.photoFocalX ?? 50}% ${listing.photoFocalY ?? 50}%`,
                        transform:
                          (listing.photoScale ?? 1) > 1
                            ? `scale(${listing.photoScale})`
                            : undefined,
                        transformOrigin: `${listing.photoFocalX ?? 50}% ${listing.photoFocalY ?? 50}%`,
                      }}
                    />
                  </button>
                  <div className="flex-1">
                    <label className="block text-[10px] uppercase tracking-[0.15em] text-neutral-500 mb-1">
                      Zoom
                    </label>
                    <input
                      type="range"
                      min="1"
                      max="2"
                      step="0.05"
                      value={listing.photoScale ?? 1}
                      onChange={(e) => {
                        const v = parseFloat(e.target.value);
                        patch(idx, { photoScale: v > 1 ? v : undefined });
                      }}
                      data-testid={`brand-listing-zoom-${idx}`}
                      className="w-full"
                    />
                    <button
                      type="button"
                      onClick={() =>
                        patch(idx, {
                          photoFocalX: undefined,
                          photoFocalY: undefined,
                          photoScale: undefined,
                        })
                      }
                      data-testid={`brand-listing-pos-reset-${idx}`}
                      className="mt-1 text-[11px] text-neutral-500 hover:text-neutral-200"
                    >
                      Center
                    </button>
                    <p className="mt-1 text-[11px] text-neutral-600 leading-relaxed">
                      Click the photo where the home is, and zoom to fill the card.
                    </p>
                  </div>
                </div>
              </div>
            )}

            <div>
              <label className="block text-[10px] uppercase tracking-[0.15em] text-neutral-500 mb-2">
                Address
              </label>
              <input
                type="text"
                value={listing.address}
                onChange={(e) =>
                  // Editing the address invalidates any resolved Street View so a
                  // changed address re-resolves cleanly (never a stale pano).
                  patch(idx, {
                    address: e.target.value,
                    streetViewPanoId: undefined,
                    hasStreetView: undefined,
                    streetViewHeading: undefined,
                  })
                }
                placeholder="1240 Hawthorne St"
                data-testid={`brand-listing-address-${idx}`}
                className="w-full bg-neutral-900 border border-neutral-800 rounded-md px-3 py-2 text-base lg:text-sm focus:outline-none focus:border-mint"
              />
            </div>

            <div>
              <label className="block text-[10px] uppercase tracking-[0.15em] text-neutral-500 mb-2">
                City
              </label>
              <input
                type="text"
                value={listing.city ?? ""}
                onChange={(e) => patch(idx, { city: e.target.value || undefined })}
                placeholder="Tacoma"
                data-testid={`brand-listing-city-${idx}`}
                className="w-full bg-neutral-900 border border-neutral-800 rounded-md px-3 py-2 text-base lg:text-sm focus:outline-none focus:border-mint"
              />
            </div>

            <div>
              <label className="block text-[10px] uppercase tracking-[0.15em] text-neutral-500 mb-2">
                Views (optional)
              </label>
              <NumberInput
                value={listing.viewCount ?? ""}
                onChange={(v) => patch(idx, { viewCount: v || undefined })}
                placeholder="41,184"
                aria-label={`brand-listing-views-${idx}`}
              />
              <p className="mt-1 text-[11px] text-neutral-600 leading-relaxed">
                The view count from your listing&apos;s own portal or Zillow page.
                You enter it; we never pull it. Leave it blank to show the card
                with no number.
              </p>
            </div>
          </div>
        ))}

        {atCap ? (
          <p
            className="text-[11px] text-neutral-600 italic"
            data-testid="brand-listing-cap-nudge"
          >
            That is the most that fit the flip-through. Lead with your strongest{" "}
            {RECENT_LISTINGS_CAP}.
          </p>
        ) : (
          <button
            type="button"
            onClick={add}
            data-testid="brand-listing-add"
            className="rounded border border-neutral-700 px-3 py-1.5 text-xs text-text-primary hover:bg-neutral-800"
          >
            + Add a listing
          </button>
        )}
      </div>
    </div>
  );
}
