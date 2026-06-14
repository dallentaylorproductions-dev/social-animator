"use client";

import { useEffect, useRef, useState } from "react";
import { useListingProfile } from "@/lib/listing-profile";
import { CurrencyInput } from "@/components/inputs/CurrencyInput";
import { NumberInput } from "@/components/inputs/NumberInput";
import { ImageUploadField } from "@/components/ImageUploadField";
import { isInvitationStatus, type SellerPresentationDraft } from "../engine/types";
import type { Comp } from "@/tools/seller-intelligence-report/engine/types";
import { formatAppointment } from "../engine/appointment";
import { useSPEntitlement } from "./SPEntitlementContext";
import { resolveCompCoverage } from "@/lib/seller-presentation/street-view";
import {
  normalizeAddressKey,
  selectKeptComps,
  MAX_AUTOFILL_COMPS,
} from "@/lib/seller-presentation/rentcast-autofill";

/**
 * Seller Presentation Step 1 — Property + personalization.
 *
 * Phase B1 brings Step 1's CONTENT onto the Claude Design redesign
 * (warm-dark canvas, Hanken Grotesk + JetBrains Mono, mint accent) while
 * preserving every load-bearing behavior from v1.47 / A7c:
 *
 *   - useListingProfile() — the SHARED Property primitive read/write.
 *     The substrate's "Property is shared across skills" rule (audit §2)
 *     means an edit here is visible to Listing Flyer / OH Prep / SIR on
 *     their next mount (same `socanim_listing_profile` localStorage
 *     record). The mirror effect below copies the resolved primitive
 *     into the SP draft so the shell can gate Step 1's Next on draft
 *     fields alone.
 *   - <ImageUploadField> for the cover photo — downscales client-side +
 *     uploads to Vercel Blob, stores the HOSTED url (never a blob: /
 *     object-URL). B1 feeds it context-aware empty-state copy via the
 *     additive emptyTitle/emptySubtext props (no fork).
 *   - SSR-safe "Loading…" placeholder until useListingProfile hydrates
 *     (React #418 fix, see src/lib/brand.ts:203).
 *   - The legacy `cityState` bridge ("${city}, ${state}") kept in sync
 *     via updateCityState() so older consumers keep rendering.
 *
 * New in B1:
 *   - The five optional subject* fields (shipped on the draft schema in
 *     Phase A) surface here behind a quiet "+ Quick property details"
 *     reach. All optional; empty fields persist as `undefined`.
 *
 * Design decisions worth knowing (see the B1 session handoff):
 *   - The smart-address type-ahead from the Claude Design prototype is
 *     intentionally NOT shipped — it relied on a hardcoded Tacoma
 *     SAMPLE_ADDRESSES dataset that doesn't exist in production. We keep
 *     the existing structured city/state/zip data model and add the
 *     redesign's Saved chip + confirm line instead.
 *   - City/State/ZIP stay always-visible (the prototype collapses them
 *     behind an "Edit" reach). Direct-fill e2e specs target these inputs
 *     by testid without expanding a reach; collapsing them would break
 *     ~13 green seller-presentation specs.
 */

interface StepPropertyProps {
  draft: SellerPresentationDraft;
  setDraft: (next: SellerPresentationDraft) => void;
}

export function StepProperty({ draft, setDraft }: StepPropertyProps) {
  const { settings, update, hydrated } = useListingProfile();
  const { sellerStateAEnabled, compPhotosEnabled } = useSPEntitlement();

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

  // SP-AUTOFILL (Phase 2) - "type the address once" build state. A ref to the
  // latest draft so the async RentCast resolve below applies its writes against
  // the CURRENT draft (not the stale closure from when blur fired); a ref to the
  // last address we already pulled so a re-blur of the same address never
  // re-bills RentCast; and a calm status for the loading microcopy.
  const draftRef = useRef(draft);
  useEffect(() => {
    draftRef.current = draft;
  }, [draft]);
  const pulledAddrRef = useRef<string>("");
  const [autofillStatus, setAutofillStatus] = useState<
    "idle" | "pulling" | "done" | "error"
  >("idle");
  const [autofillCompCount, setAutofillCompCount] = useState(0);

  /**
   * Update city/state and maintain the legacy `cityState` string in
   * sync so OH Prep / Listing Flyer / SIR (which still read the
   * single combined field) keep rendering correctly. The structured
   * fields are the new source of truth for the SP renderer; the
   * derived string is the legacy bridge.
   */
  const updateCityState = (patch: { city?: string; state?: string }) => {
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
      <p className="hint" data-testid="step-property-loading">
        Loading listing profile…
      </p>
    );
  }

  const street = settings.address.trim();
  const hasLocation = Boolean(settings.city || settings.state || settings.zip);

  // Seller State A — in the prepared invitation the page carries no price yet,
  // so the shared List price field is hidden (it belongs to the full
  // presentation's Strategy step). Flag-off / full presentation is unchanged.
  const invitation =
    sellerStateAEnabled === true && isInvitationStatus(draft.valuationStatus);

  /**
   * SP-AUTOFILL - the centerpiece: on address BLUR (invitation mode only) pull
   * the subject property details + nearby recent sales for the address, so the
   * agent types the address once and the invitation builds itself. Fires only
   * when there's a street AND a locale signal (ZIP or city), and only ONCE per
   * address (pulledAddrRef guard) so it never re-bills RentCast on a re-blur.
   * Everything degrades cleanly: a non-ok response just lands the "fill by hand"
   * microcopy; nothing here ever blocks the agent.
   */
  const runAutofill = async () => {
    if (!invitation) return;
    const streetVal = settings.address?.trim() ?? "";
    const cityVal = settings.city?.trim() ?? "";
    const stateVal = settings.state?.trim() ?? "";
    const zipVal = settings.zip?.trim() ?? "";
    if (!streetVal) return;
    // Need a locale signal so RentCast can resolve the address (a bare street is
    // ambiguous). Either a 5-digit ZIP or a city is enough.
    if (!/\d{5}/.test(zipVal) && !cityVal) return;

    const full = [streetVal, cityVal, [stateVal, zipVal].filter(Boolean).join(" ")]
      .filter((s) => s.length > 0)
      .join(", ");
    const norm = normalizeAddressKey(full);
    if (!norm || norm === pulledAddrRef.current) return;
    pulledAddrRef.current = norm;
    setAutofillStatus("pulling");

    let data:
      | {
          ok: true;
          property?: Partial<
            Record<"bedrooms" | "baths" | "sqft" | "yearBuilt", string>
          >;
          comps?: Comp[];
        }
      | { ok: false }
      | undefined;
    try {
      const res = await fetch("/api/seller-presentation/autofill", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ address: full }),
      });
      data = (await res.json()) as typeof data;
    } catch {
      setAutofillStatus("error");
      return;
    }
    if (!data || data.ok !== true) {
      setAutofillStatus("error");
      return;
    }

    // 1) Property details -> the optional subject* fields, ONLY where the agent
    //    has left the field empty (never clobber a value they typed).
    const cur = draftRef.current;
    const p = data.property ?? {};
    const patch: Partial<SellerPresentationDraft> = {};
    if (p.bedrooms && !cur.subjectBedrooms) patch.subjectBedrooms = p.bedrooms;
    if (p.baths && !cur.subjectBaths) patch.subjectBaths = p.baths;
    if (p.sqft && !cur.subjectSqft) patch.subjectSqft = p.sqft;
    if (p.yearBuilt && !cur.subjectYearBuilt)
      patch.subjectYearBuilt = p.yearBuilt;

    // 2) Nearby sales -> draft.comps, ONLY when the agent has no MANUAL comps
    //    (so a curated list is never clobbered). The auto-pulled comps carry
    //    source "imported"; a manual add carries another source.
    //
    //    The route returns a CANDIDATE POOL (up to MAX_COMP_CANDIDATES). When
    //    comp photos are on we seed the WHOLE pool so the Street View resolve
    //    below can keep the comps that actually have a photo; the pool is then
    //    trimmed to MAX_AUTOFILL_COMPS once coverage is known (step 3). When
    //    photos are off there is nothing to select on, so we trim to the final
    //    cap up front - keeping the draft (and any later full presentation) at
    //    the same comp count it has always been.
    const pulledComps: Comp[] = Array.isArray(data.comps) ? data.comps : [];
    const hasManual = cur.comps.some((c) => c.source !== "imported");
    const seedComps = !hasManual && pulledComps.length > 0;
    const seededComps =
      compPhotosEnabled === true
        ? pulledComps
        : pulledComps.slice(0, MAX_AUTOFILL_COMPS);
    const nextComps = seedComps ? seededComps : cur.comps;

    // The committed draft after autofill. We merge Street View into THIS object
    // (not a re-read of draftRef, which may not have flushed yet) so the second
    // setDraft can never clobber the property patch we just applied.
    const baseDraft: SellerPresentationDraft = {
      ...cur,
      ...patch,
      comps: nextComps,
    };
    setDraft(baseDraft);
    // When photos are on the pool is trimmed to MAX_AUTOFILL_COMPS once coverage
    // resolves (below), so show the final cap up front rather than the larger
    // candidate count - it only ever settles DOWN from here, never up.
    setAutofillCompCount(
      compPhotosEnabled === true
        ? Math.min(seededComps.length, MAX_AUTOFILL_COMPS)
        : seededComps.length,
    );
    setAutofillStatus("done");

    // 3) Resolve Street View coverage for the seeded comps client-side so the
    //    thumbnails land in the live preview. Compliance: hits only the FREE
    //    Google metadata endpoint + persists ONLY the pano id + aiming data
    //    (never image bytes), exactly like the full comps step. Gated on
    //    COMP_PHOTOS; a comp already resolved or carrying a manual photo is
    //    skipped, so this never loops or re-bills.
    //
    //    Then KEEP the photographed comps (selectKeptComps): a comp with no
    //    resolvable photo would render an empty frame, so it should not take a
    //    slot. This trims the candidate pool back to MAX_AUTOFILL_COMPS, so the
    //    persisted draft - and any later full presentation built from it - holds
    //    the same comp count it always has, just photographed-first.
    if (compPhotosEnabled === true && seedComps) {
      const results = await Promise.all(
        seededComps.map(async (c) => ({
          address: c.address,
          cov: await resolveCompCoverage(c.address),
        })),
      );
      const resolved = baseDraft.comps.map((c) => {
        if (c.photoUrl || c.hasStreetView !== undefined || !c.address?.trim())
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
      });
      const kept = selectKeptComps(resolved, MAX_AUTOFILL_COMPS);
      setDraft({ ...baseDraft, comps: kept });
      setAutofillCompCount(kept.length);
    }
  };

  const handleAddressBlur = () => {
    void runAutofill();
  };

  return (
    <section className="home" data-testid="step-property">
      <div className="sec-head">
        <h2 className="sec-title">The home</h2>
        <p className="sec-sub">
          {invitation
            ? "Just the basics and your appointment. We'll turn it into a polished invitation your seller opens before you meet."
            : "A few basics, and we'll build a polished landing page for your seller."}
        </p>
        {/* The static example anchor is retired (capstone): the live preview
            panel shows the fully-filled sample in the agent's brand color until
            the draft has something to render, then becomes their real page. */}
      </div>

      <div className="fields">
        {/* ---- Seller State A: mode + appointment (flag-gated) ---- */}
        {sellerStateAEnabled === true && (
          <StateAMode draft={draft} setDraft={setDraft} />
        )}

        {/* ---- Address ---- */}
        <div className="field-block">
          <label className="field-label" htmlFor="sp-address">
            <IconPin /> Address
          </label>
          <input
            id="sp-address"
            type="text"
            className="input lg"
            value={settings.address}
            onChange={(e) => update({ address: e.target.value })}
            onBlur={invitation ? handleAddressBlur : undefined}
            placeholder="1234 Test Drive NE"
            data-testid="step-property-address"
          />

          {/* City / State / ZIP — always visible (see header note on
              why they're not collapsed behind an Edit reach). Legacy
              `cityState` is derived from city + state via
              updateCityState(). */}
          <div className="addr-parts">
            <label className="mini">
              <span>City</span>
              <input
                type="text"
                className="input sm"
                value={settings.city ?? ""}
                onChange={(e) => updateCityState({ city: e.target.value })}
                onBlur={invitation ? handleAddressBlur : undefined}
                placeholder="Tacoma"
                data-testid="step-property-city"
              />
            </label>
            <label className="mini">
              <span>State</span>
              <input
                type="text"
                className="input sm"
                value={settings.state ?? ""}
                onChange={(e) =>
                  updateCityState({
                    state: e.target.value.toUpperCase().slice(0, 2),
                  })
                }
                placeholder="WA"
                maxLength={2}
                data-testid="step-property-state"
              />
            </label>
            <label className="mini">
              <span>ZIP</span>
              <input
                type="text"
                inputMode="numeric"
                className="input sm"
                value={settings.zip ?? ""}
                onChange={(e) =>
                  update({
                    zip: e.target.value.replace(/[^0-9-]/g, "").slice(0, 10),
                  })
                }
                onBlur={invitation ? handleAddressBlur : undefined}
                placeholder="98402"
                data-testid="step-property-zip"
              />
            </label>
          </div>

          {settings.propertyId ? (
            <div className="addr-confirm">
              {hasLocation && (
                <span className="ac-loc">
                  <IconCheck />
                  {[settings.city, settings.state].filter(Boolean).join(", ")}{" "}
                  {settings.zip}
                </span>
              )}
              {/* Keeps the "property id …" contract the e2e suite asserts
                  (toContainText /property id\s+property_…/). text-transform
                  is visual only — the DOM textContent stays lowercase. */}
              <span className="saved-chip" data-testid="step-property-saved-hint">
                Saved · property id <code>{settings.propertyId}</code>
              </span>
            </div>
          ) : (
            <p className="hint">
              Enter an address to save. A property id is assigned
              automatically.
            </p>
          )}

          {/* SP-AUTOFILL - calm status while the address builds the invitation.
              Honest copy only (the truthful-copy gate forbids over-claims): it
              names what is happening plainly, with no hype. Invitation mode
              only, so the full presentation + flag-off are untouched. */}
          {invitation && autofillStatus === "pulling" && (
            <p className="hint" data-testid="step-property-autofill-status">
              <span className="dot-live" /> Looking up the property and recent
              sales nearby…
            </p>
          )}
          {invitation && autofillStatus === "done" && autofillCompCount > 0 && (
            <p className="hint" data-testid="step-property-autofill-status">
              Found {autofillCompCount} recent{" "}
              {autofillCompCount === 1 ? "sale" : "sales"} nearby and filled in
              the property details below. Review them on the next steps.
            </p>
          )}
          {invitation && autofillStatus === "done" && autofillCompCount === 0 && (
            <p className="hint" data-testid="step-property-autofill-status">
              Filled in what was available for this address. Add nearby sales by
              hand on the next step.
            </p>
          )}
          {invitation && autofillStatus === "error" && (
            <p className="hint" data-testid="step-property-autofill-status">
              Could not look up this address automatically. You can fill in the
              details by hand.
            </p>
          )}
        </div>

        {/* ---- List price (listing-profile primitive; shared) ----
            Hidden in the prepared invitation (no price before the walkthrough);
            shown for the full presentation exactly as before. */}
        {!invitation && (
          <div className="field-block">
            <label className="field-label" htmlFor="sp-price">
              List price <span className="opt">your starting estimate</span>
            </label>
            {/* CurrencyInput brings up the iOS numeric keypad + live
                currency formatting — same pattern as the comps Sold-price
                field. Bound to the shared listing-profile price. */}
            <CurrencyInput
              className="input lg"
              value={settings.price}
              onChange={(v) => update({ price: v })}
              placeholder="$685,000"
              aria-label="list-price"
            />
            <p className="hint">You&apos;ll refine this on the Strategy step.</p>
          </div>
        )}

        {/* ---- Cover photo (Vercel Blob via ImageUploadField) ---- */}
        <div className="field-block">
          <ImageUploadField
            label="Cover photo"
            value={settings.heroPhoto}
            onChange={(url) => update({ heroPhoto: url })}
            previewAspect="aspect-[16/10]"
            folder="seller-presentation"
            testIdPrefix="step-property-hero"
            emptyTitle={
              street
                ? `Add a photo of ${street}`
                : "Add a photo of your seller's home"
            }
            emptySubtext="A wide photo of the front of the house works best. It is the first thing buyers see."
          />
        </div>

        {/* ---- Prepared for (per-presentation; writes to the draft) ---- */}
        <div className="field-block">
          <label className="field-label" htmlFor="sp-prepared">
            Prepared for <span className="opt">optional</span>
          </label>
          <input
            id="sp-prepared"
            type="text"
            className="input"
            value={draft.preparedFor ?? ""}
            onChange={(e) =>
              setDraft({
                ...draft,
                preparedFor: e.target.value || undefined,
              })
            }
            placeholder="the Halloran family"
            data-testid="step-property-prepared-for"
          />
          <p className="hint">
            {draft.preparedFor && draft.preparedFor.trim() ? (
              <>
                Appears as{" "}
                <span className="cap-preview">
                  For {draft.preparedFor.trim()}
                </span>{" "}
                on the page.
              </>
            ) : (
              <>
                Personalizes the page caption. Leave blank for a general
                presentation.
              </>
            )}
          </p>
        </div>

        {/* ---- Quick property details reach (the five subject* fields) ---- */}
        <SubjectDetails draft={draft} setDraft={setDraft} />
      </div>

      <p className="autosave-note">
        <span className="dot-live" /> Saved automatically.
      </p>
    </section>
  );
}

/**
 * "+ Quick property details" — the five OPTIONAL subject* fields shipped
 * on the draft in Phase A, surfaced in B1 behind a quiet reach. Starts
 * COLLAPSED, but auto-expands on a return visit once any field has a
 * value (so the agent sees their prior work). All fields write
 * `value || undefined` so an emptied field persists as `undefined`, not
 * an empty string (matches clampString's contract in engine/types.ts).
 *
 * a11y: a single <button aria-expanded> toggles the panel; the inputs
 * are removed from the DOM when collapsed (no hidden focusable elements,
 * so no focus trap on collapse).
 */
function SubjectDetails({ draft, setDraft }: StepPropertyProps) {
  const hasAny = Boolean(
    draft.subjectBedrooms ||
      draft.subjectBaths ||
      draft.subjectSqft ||
      draft.subjectYearBuilt ||
      draft.subjectLotSqft,
  );
  const [open, setOpen] = useState(hasAny);

  const setField = (
    key:
      | "subjectBedrooms"
      | "subjectBaths"
      | "subjectSqft"
      | "subjectYearBuilt"
      | "subjectLotSqft",
    value: string,
  ) => {
    setDraft({ ...draft, [key]: value || undefined });
  };

  return (
    <div className="field-block">
      <button
        type="button"
        className="reach-toggle"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        data-testid="step-property-subject-toggle"
      >
        {open ? "–" : "+"} Quick property details{" "}
        <span className="opt">optional</span>
      </button>

      {open && (
        <div className="subject-grid" data-testid="step-property-subject-grid">
          <label className="mini">
            <span>Bedrooms</span>
            <input
              type="text"
              inputMode="numeric"
              className="input sm"
              value={draft.subjectBedrooms ?? ""}
              onChange={(e) =>
                setField(
                  "subjectBedrooms",
                  e.target.value.replace(/[^0-9]/g, "").slice(0, 2),
                )
              }
              placeholder="3"
              data-testid="step-property-subject-bedrooms"
            />
          </label>
          <label className="mini">
            <span>Bathrooms</span>
            <input
              type="text"
              inputMode="decimal"
              className="input sm"
              value={draft.subjectBaths ?? ""}
              onChange={(e) =>
                setField(
                  "subjectBaths",
                  e.target.value.replace(/[^0-9.]/g, "").slice(0, 4),
                )
              }
              placeholder="2.5"
              data-testid="step-property-subject-baths"
            />
          </label>
          <label className="mini">
            <span>Square feet</span>
            <NumberInput
              className="input sm"
              value={draft.subjectSqft ?? ""}
              onChange={(v) => setField("subjectSqft", v)}
              placeholder="2,140"
              aria-label="subject-sqft"
            />
          </label>
          <label className="mini">
            <span>Year built</span>
            <input
              type="text"
              inputMode="numeric"
              className="input sm"
              value={draft.subjectYearBuilt ?? ""}
              onChange={(e) =>
                setField(
                  "subjectYearBuilt",
                  e.target.value.replace(/[^0-9]/g, "").slice(0, 4),
                )
              }
              placeholder="1998"
              data-testid="step-property-subject-year-built"
            />
          </label>
          <label className="mini">
            <span>Lot size (sq ft)</span>
            <NumberInput
              className="input sm"
              value={draft.subjectLotSqft ?? ""}
              onChange={(v) => setField("subjectLotSqft", v)}
              placeholder="6,500"
              aria-label="subject-lot-sqft"
            />
          </label>
        </div>
      )}
    </div>
  );
}

/**
 * Seller State A — the mode toggle + appointment picker (flag-gated; rendered
 * only when SELLER_STATE_A_ENABLED is on, so flag-off StepProperty is unchanged).
 *
 * The agent explicitly chooses between the prepared invitation (the
 * before-appointment page, no price yet) and the full presentation (today's
 * page). Picking the invitation sets `valuationStatus =
 * preparing_for_walkthrough`; the appointment date+time is then the page's
 * premise. Picking the full presentation sets `revealed` (the default behavior).
 */
function StateAMode({ draft, setDraft }: StepPropertyProps) {
  const invitation = isInvitationStatus(draft.valuationStatus);
  const appt = formatAppointment(draft.appointmentAt);

  const setMode = (mode: "invitation" | "full") => {
    setDraft({
      ...draft,
      valuationStatus:
        mode === "invitation" ? "preparing_for_walkthrough" : "revealed",
    });
  };

  return (
    <div className="field-block" data-testid="step-property-state-a">
      <label className="field-label">
        Page type <span className="opt">when are you sending this?</span>
      </label>
      <div className="mode-toggle" role="radiogroup" aria-label="Page type">
        <button
          type="button"
          role="radio"
          aria-checked={invitation}
          className={`mode-option${invitation ? " is-active" : ""}`}
          onClick={() => setMode("invitation")}
          data-testid="step-property-mode-invitation"
        >
          <span className="mode-option-title">Prepared invitation</span>
          <span className="mode-option-sub">
            Before the appointment. Shows your prep, not a price yet.
          </span>
        </button>
        <button
          type="button"
          role="radio"
          aria-checked={!invitation}
          className={`mode-option${!invitation ? " is-active" : ""}`}
          onClick={() => setMode("full")}
          data-testid="step-property-mode-full"
        >
          <span className="mode-option-title">Full presentation</span>
          <span className="mode-option-sub">
            At or after the appointment. The complete page.
          </span>
        </button>
      </div>

      {invitation && (
        <div className="appt-field" data-testid="step-property-appointment-field">
          <label className="field-label" htmlFor="sp-appointment">
            Appointment date and time
          </label>
          <input
            id="sp-appointment"
            type="datetime-local"
            className="input"
            value={draft.appointmentAt ?? ""}
            onChange={(e) =>
              setDraft({
                ...draft,
                appointmentAt: e.target.value || undefined,
              })
            }
            data-testid="step-property-appointment"
          />
          <p className="hint">
            {appt ? (
              <>
                Appears as{" "}
                <span className="cap-preview">{appt.full}</span> on the page.
              </>
            ) : (
              <>Powers the &ldquo;prepared for [day]&rdquo; invitation copy.</>
            )}
          </p>
        </div>
      )}
    </div>
  );
}

/* ---- icons (ported from the Claude Design source) ---- */
function IconPin() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="15"
      height="15"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" />
      <circle cx="12" cy="10" r="2.6" />
    </svg>
  );
}

function IconCheck() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="13"
      height="13"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M20 6L9 17l-5-5" />
    </svg>
  );
}
