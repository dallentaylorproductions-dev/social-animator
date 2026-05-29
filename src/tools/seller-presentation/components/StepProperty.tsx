"use client";

import { useEffect } from "react";
import { useListingProfile } from "@/lib/listing-profile";
import { CurrencyInput } from "@/components/inputs/CurrencyInput";
import { ImageUploadField } from "@/components/ImageUploadField";
import { COHORT_EXAMPLE_URL } from "@/lib/config/cohort-example";
import type { SellerPresentationDraft } from "../engine/types";

/**
 * Seller Presentation Step 1 — Property + personalization (v1.47 / A7c).
 *
 * Reads + writes the SHARED Property primitive via useListingProfile
 * (src/lib/listing-profile.ts). The substrate's "Property is shared
 * across skills" rule (audit §2) means an edit here is visible to
 * Listing Flyer / OH Prep / SIR on their next mount — they all live
 * over the same `socanim_listing_profile` localStorage record.
 *
 * Lineage:
 *   A5a — address + cityState (single combined field).
 *   A7c — split city/state/zip into structured fields; add hero
 *         photo (URL input OR file upload reusing FileReader → data
 *         URL, same pattern as BrandProfileForm's logo upload — no
 *         new file/Blob infra); add `preparedFor` personalization
 *         (writes direct to the SP draft; it's a per-presentation
 *         field, not a Property primitive field).
 *   A7c.2 — swap the FileReader→data-URL hero pattern for the shared
 *         <ImageUploadField>, which downscales client-side + uploads
 *         to Vercel Blob and stores the hosted URL. Phone camera-roll
 *         picker is the primary path; "paste URL" stays as fallback.
 *         The data-URL path is gone — the published payload now
 *         references a small hosted URL, not a multi-MB embedded blob.
 *
 * Legacy bridge: the SP wizard writes BOTH structured city/state AND
 * the legacy `cityState` string ("${city}, ${state}") so older tools
 * that still read `cityState` keep working. Older drafts without the
 * structured fields just have empty city/state/zip until the user
 * fills them in here — no fragile auto-parsing of the legacy field.
 *
 * Mirror effect: useListingProfile is called twice in this view
 * (once here, once it could be called by future siblings) — each
 * call owns its own React state, so cross-call updates don't
 * propagate. To give the wizard SHELL a single source of truth for
 * Step 1's "Next" gating, this step mirrors the listing profile's
 * (propertyId, address, city, state, zip, heroPhoto) into the
 * SellerPresentationDraft on every relevant change. The shell reads
 * from `instance.draft.propertyId` to enable/disable Next.
 *
 * SSR-safe: useListingProfile initializes empty on server + first
 * client render, populates via useEffect (the React #418 fix
 * documented at src/lib/brand.ts:203). This component renders a
 * "Loading…" placeholder until hydrated.
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
    const draftCity = draft.propertyCity ?? undefined;
    const draftState = draft.propertyState ?? undefined;
    const draftZip = draft.propertyZip ?? undefined;
    const draftHero = draft.heroPhotoUrl ?? undefined;
    const settingsCity = settings.city || undefined;
    const settingsState = settings.state || undefined;
    const settingsZip = settings.zip || undefined;
    const settingsHero = settings.heroPhoto || undefined;
    const matches =
      draft.propertyId === settings.propertyId &&
      draft.propertyAddress === (settings.address || undefined) &&
      draftCity === settingsCity &&
      draftState === settingsState &&
      draftZip === settingsZip &&
      draftHero === settingsHero;
    if (matches) return;
    setDraft({
      ...draft,
      propertyId: settings.propertyId,
      propertyAddress: settings.address || undefined,
      propertyCity: settingsCity,
      propertyState: settingsState,
      propertyZip: settingsZip,
      heroPhotoUrl: settingsHero,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    hydrated,
    settings.propertyId,
    settings.address,
    settings.city,
    settings.state,
    settings.zip,
    settings.heroPhoto,
  ]);

  /**
   * Update city/state and maintain the legacy `cityState` string in
   * sync so OH Prep / Listing Flyer / SIR (which still read the
   * single combined field) keep rendering correctly. The structured
   * fields are the new source of truth for the SP renderer; the
   * derived string is the legacy bridge.
   */
  const updateCityState = (
    patch: { city?: string; state?: string },
  ) => {
    const nextCity = patch.city ?? settings.city ?? "";
    const nextState = patch.state ?? settings.state ?? "";
    const derivedCityState = [nextCity, nextState]
      .filter((s) => s.trim().length > 0)
      .join(", ");
    update({
      city: nextCity || undefined,
      state: nextState || undefined,
      cityState: derivedCityState,
    });
  };

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
          The home you&apos;re presenting. This sets the address and the
          headline photo buyers see first.
        </p>
        {/* Anticipation Layer (v1.47) — reinforced at-start anchor. A
            slightly more prominent, aspirationally framed link so the
            agent begins with the destination in mind. Personalizes with
            preparedFor when present; falls back to a generic phrasing
            otherwise. Same swappable URL constant as the wizard chrome;
            target="_blank" preserves the in-progress draft. */}
        <p className="mt-3 text-sm text-neutral-400">
          {draft.preparedFor
            ? `Building ${draft.preparedFor}'s presentation. `
            : null}
          <a
            href={COHORT_EXAMPLE_URL}
            target="_blank"
            rel="noopener noreferrer"
            data-testid="cohort-example-link-step1"
            className="text-mint underline-offset-2 transition-opacity hover:underline hover:opacity-90"
          >
            {draft.preparedFor
              ? "Here's what they'll receive →"
              : "Here's what your seller receives →"}
          </a>
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

      {/* A7c — split city/state/zip. Legacy `cityState` is derived from
          city + state via updateCityState() so OH Prep / Listing Flyer
          stay aligned. Mobile: stack via grid; desktop: side-by-side. */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-[1fr_120px_140px]">
        <label className="block">
          <span className="text-xs uppercase tracking-wider text-gray-500">
            City
          </span>
          <input
            type="text"
            value={settings.city ?? ""}
            onChange={(e) => updateCityState({ city: e.target.value })}
            placeholder="Tacoma"
            className={inputCls}
            data-testid="step-property-city"
          />
        </label>
        <label className="block">
          <span className="text-xs uppercase tracking-wider text-gray-500">
            State
          </span>
          <input
            type="text"
            value={settings.state ?? ""}
            onChange={(e) =>
              updateCityState({
                state: e.target.value.toUpperCase().slice(0, 2),
              })
            }
            placeholder="WA"
            maxLength={2}
            className={inputCls}
            data-testid="step-property-state"
          />
        </label>
        <label className="block">
          <span className="text-xs uppercase tracking-wider text-gray-500">
            ZIP
          </span>
          <input
            type="text"
            inputMode="numeric"
            value={settings.zip ?? ""}
            onChange={(e) =>
              update({ zip: e.target.value.replace(/[^0-9-]/g, "").slice(0, 10) })
            }
            placeholder="98402"
            className={inputCls}
            data-testid="step-property-zip"
          />
        </label>
      </div>

      <label className="block">
        <span className="text-xs uppercase tracking-wider text-gray-500">
          List price (your initial estimate)
        </span>
        {/* A7c.1: CurrencyInput brings up the iOS numeric keypad
            (inputMode="numeric") + live currency formatting — same
            pattern as the comps Sold-price field. */}
        <CurrencyInput
          className={`${inputCls} mt-1`}
          value={settings.price}
          onChange={(v) => update({ price: v })}
          placeholder="$685,000"
          aria-label="list-price"
        />
        <span className="mt-1 block text-[11px] text-neutral-500">
          You&apos;ll refine this on the Strategy step.
        </span>
      </label>

      {/* A7c.2 — hero photo via the shared <ImageUploadField>. The
          component downscales client-side + uploads to Vercel Blob
          and reports back a hosted URL. settings.heroPhoto stores
          that URL (the mirror effect above copies it to
          draft.heroPhotoUrl). The "paste URL" fallback inside the
          component covers Zillow/FMLS/Dropbox links the agent
          already has. */}
      <ImageUploadField
        label="Hero photo"
        value={settings.heroPhoto}
        onChange={(url) => update({ heroPhoto: url })}
        previewAspect="aspect-[4/3]"
        folder="seller-presentation"
        testIdPrefix="step-property-hero"
        helpText="A landscape photo of the home reads best on the published page."
      />

      {/* A7c — "prepared for" personalization. Writes DIRECT to the SP
          draft (not the Property primitive — this is per-presentation,
          not a property fact). Hides personalization on the published
          page when blank (see locked design's graceful-states contract). */}
      <label className="block">
        <span className="text-xs uppercase tracking-wider text-gray-500">
          Prepared for
        </span>
        <input
          type="text"
          value={draft.preparedFor ?? ""}
          onChange={(e) =>
            setDraft({
              ...draft,
              preparedFor: e.target.value || undefined,
            })
          }
          placeholder="the Halloran family"
          className={inputCls}
          data-testid="step-property-prepared-for"
        />
        <span className="mt-1 block text-[11px] text-neutral-500">
          Optional. Shows as &ldquo;For the …&rdquo; in the page caption +
          footer. Leave blank for a non-personalized presentation.
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
