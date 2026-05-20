"use client";

import { useEffect } from "react";
import { useListingProfile } from "@/lib/listing-profile";
import type { SellerPresentationDraft } from "../engine/types";

/**
 * Seller Presentation Step 1 — Property (v1.47 / A5a LIVE).
 *
 * Reads + writes the SHARED Property primitive via useListingProfile
 * (src/lib/listing-profile.ts). The substrate's "Property is shared
 * across skills" rule (audit §2) means an edit here is visible to
 * Listing Flyer / OH Prep / SIR on their next mount — they all live
 * over the same `socanim_listing_profile` localStorage record.
 *
 * Mirror effect: useListingProfile is called twice in this view
 * (once here, once it could be called by future siblings) — each
 * call owns its own React state, so cross-call updates don't
 * propagate. To give the wizard SHELL a single source of truth for
 * Step 1's "Next" gating, this step mirrors the listing profile's
 * (propertyId, address, city) into the SellerPresentationDraft on
 * every relevant change. The shell reads from
 * `instance.draft.propertyId` to enable/disable Next — never from
 * its own useListingProfile hook.
 *
 * propertyId materializes automatically: useListingProfile's
 * saveListingProfile backfills it on the first save (A2 wiring).
 * The user types an address, the hook persists, propertyId appears,
 * the mirror fires, the draft updates, the shell enables Next.
 *
 * SSR-safe: useListingProfile initializes empty on server + first
 * client render, populates via useEffect (the React #418 fix
 * documented at src/lib/brand.ts:203). This component renders a
 * "Loading…" placeholder until hydrated to avoid showing empty
 * fields where saved values exist.
 */

interface StepPropertyProps {
  draft: SellerPresentationDraft;
  setDraft: (next: SellerPresentationDraft) => void;
}

const inputCls =
  "mt-1 w-full px-3 py-2 bg-neutral-900 border border-neutral-700 rounded text-sm focus:outline-none focus:border-mint";

export function StepProperty({ draft, setDraft }: StepPropertyProps) {
  const { settings, update, hydrated } = useListingProfile();

  // Mirror the shared Property primitive → draft so the shell's
  // gating reads from a single source. Effect deps intentionally
  // exclude `draft` to avoid an infinite update loop; mirror only on
  // listing changes.
  useEffect(() => {
    if (!hydrated) return;
    const propertyIdMatches = draft.propertyId === settings.propertyId;
    const addressMatches = draft.propertyAddress === (settings.address || undefined);
    const cityMatches = draft.propertyCity === (settings.cityState || undefined);
    if (propertyIdMatches && addressMatches && cityMatches) return;
    setDraft({
      ...draft,
      propertyId: settings.propertyId,
      propertyAddress: settings.address || undefined,
      propertyCity: settings.cityState || undefined,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated, settings.propertyId, settings.address, settings.cityState]);

  if (!hydrated) {
    return (
      <p className="text-sm text-neutral-400" data-testid="step-property-loading">
        Loading listing profile…
      </p>
    );
  }

  return (
    <div className="space-y-6" data-testid="step-property">
      <header>
        <h2 className="text-lg font-medium">The home</h2>
        <p className="mt-1 text-xs text-gray-500">
          These fields are your shared listing profile — edits sync across
          every Studio skill that uses the same property.
        </p>
      </header>

      <label className="block">
        <span className="text-xs uppercase tracking-wider text-gray-500">
          Address
        </span>
        <input
          type="text"
          value={settings.address}
          onChange={(e) => update({ address: e.target.value })}
          placeholder="1234 Test Drive NE"
          className={inputCls}
          data-testid="step-property-address"
        />
      </label>

      <label className="block">
        <span className="text-xs uppercase tracking-wider text-gray-500">
          City / state
        </span>
        <input
          type="text"
          value={settings.cityState}
          onChange={(e) => update({ cityState: e.target.value })}
          placeholder="Tacoma, WA"
          className={inputCls}
          data-testid="step-property-city"
        />
      </label>

      <label className="block">
        <span className="text-xs uppercase tracking-wider text-gray-500">
          List price (your initial estimate)
        </span>
        <input
          type="text"
          value={settings.price}
          onChange={(e) => update({ price: e.target.value })}
          placeholder="$685,000"
          className={inputCls}
          data-testid="step-property-price"
        />
        <span className="mt-1 block text-[11px] text-neutral-500">
          You&apos;ll refine this on the Strategy step (coming in A5b).
        </span>
      </label>

      {settings.propertyId ? (
        <p
          className="text-xs text-mint"
          data-testid="step-property-saved-hint"
        >
          Saved · property id{" "}
          <code className="font-mono">{settings.propertyId}</code>
        </p>
      ) : (
        <p className="text-xs text-neutral-500">
          Enter an address to save. A property id is assigned automatically.
        </p>
      )}
    </div>
  );
}
