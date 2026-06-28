"use client";

import { ImageUploadField } from "@/components/ImageUploadField";
import { VideoUploadField } from "@/components/VideoUploadField";
import { ListingPhotoCrop } from "@/components/ListingPhotoCrop";
import { useSPEntitlement } from "@/tools/seller-presentation/components/SPEntitlementContext";
import {
  defaultValuationMessage,
  defaultWelcomeLine,
} from "@/tools/seller-presentation/output/flagship/state-a-copy";
import { RecentListingsEditor } from "./RecentListingsEditor";
import type { SettingsRecentListing } from "@/lib/seller-presentation/recent-listings";

/**
 * Settings — Seller Presentation "prepared invitation" (State A) content.
 *
 * The agent-constant, set-once copy + capability assets that flow into the
 * pre-appointment invitation page:
 *
 *   • The editable VOICE LINES (quiet signature, valuation message, personal
 *     welcome). Each ships a strong default rendered when left blank, shown here
 *     as the placeholder, so an agent who edits nothing still gets premium copy.
 *   • The set-once CAPABILITY SAMPLES (the agent's best listing photo + a recent
 *     video tour). These show the agent's capability across listings, NOT this
 *     not-yet-shot home, and are reused on every invitation. Each frame flexes
 *     out of the page when its sample is unset.
 *
 * Gated behind the SELLER_STATE_A entitlement so nothing new surfaces until the
 * flag is on. All fields are additive + optional: an agent who never opens this
 * section publishes a byte-identical State B / full presentation.
 */
export function PreparedInvitationFields({
  signatureLine,
  valuationMessage,
  welcomeLine,
  sampleListingPhotoUrl,
  sampleListingPhotoFocalX,
  sampleListingPhotoFocalY,
  sampleListingPhotoScale,
  sampleVideoUrl,
  sampleVideoPosterUrl,
  sampleVideoPosterFocalX,
  sampleVideoPosterFocalY,
  sampleVideoPosterScale,
  recentListings,
  onChange,
}: {
  signatureLine?: string;
  valuationMessage?: string;
  welcomeLine?: string;
  sampleListingPhotoUrl?: string;
  sampleListingPhotoFocalX?: number;
  sampleListingPhotoFocalY?: number;
  sampleListingPhotoScale?: number;
  sampleVideoUrl?: string;
  sampleVideoPosterUrl?: string;
  sampleVideoPosterFocalX?: number;
  sampleVideoPosterFocalY?: number;
  sampleVideoPosterScale?: number;
  recentListings?: SettingsRecentListing[];
  /** Merge + persist a patch onto BrandSettings (atomic for multi-field clears). */
  onChange: (patch: {
    signatureLine?: string;
    valuationMessage?: string;
    welcomeLine?: string;
    sampleListingPhotoUrl?: string;
    sampleListingPhotoFocalX?: number;
    sampleListingPhotoFocalY?: number;
    sampleListingPhotoScale?: number;
    sampleVideoUrl?: string;
    sampleVideoPosterUrl?: string;
    sampleVideoPosterFocalX?: number;
    sampleVideoPosterFocalY?: number;
    sampleVideoPosterScale?: number;
    recentListings?: SettingsRecentListing[];
  }) => void;
}) {
  const { sellerStateAEnabled } = useSPEntitlement();
  // Render only once the gate resolves to ON. `null` (loading) / `false` keep the
  // section hidden, so an agent without the flag never sees State A content.
  if (sellerStateAEnabled !== true) return null;

  return (
    <div
      className="space-y-6 border-t border-neutral-900 pt-6"
      data-testid="brand-prepared-invitation"
    >
      <h3 className="text-xs uppercase tracking-[0.18em] text-neutral-500">
        Seller Presentation: prepared invitation
      </h3>
      <p className="-mt-3 text-[11px] text-neutral-600 leading-relaxed">
        Copy and samples for the invitation you send before the appointment. Set
        once; reused on every invitation. Leave a line blank to use the strong
        default shown in the field.
      </p>

      <Field label="Quiet signature line">
        <TextInput
          value={signatureLine ?? ""}
          onChange={(v) => onChange({ signatureLine: v || undefined })}
          placeholder="Known for quiet, thorough preparation, so the number we land on is one you can stand behind."
        />
      </Field>

      <Field label="Welcome line (near your name)">
        <TextAreaInput
          value={welcomeLine ?? ""}
          onChange={(v) => onChange({ welcomeLine: v || undefined })}
          placeholder={defaultWelcomeLine()}
        />
      </Field>

      <Field label="Valuation message">
        <TextAreaInput
          value={valuationMessage ?? ""}
          onChange={(v) => onChange({ valuationMessage: v || undefined })}
          placeholder={defaultValuationMessage()}
        />
      </Field>

      <div className="space-y-1">
        <ImageUploadField
          label="Sample listing photo"
          value={sampleListingPhotoUrl ?? ""}
          onChange={(url) =>
            onChange({
              sampleListingPhotoUrl: url || undefined,
              // A new photo starts centered (mirror Studio WorkFields).
              sampleListingPhotoFocalX: undefined,
              sampleListingPhotoFocalY: undefined,
              sampleListingPhotoScale: undefined,
            })
          }
          previewAspect="aspect-[4/3]"
          folder="agent-sample-photo"
          testIdPrefix="brand-sample-photo"
          helpText="Your best listing photography, not this home. Shows how you shoot every listing."
        />
        {sampleListingPhotoUrl && (
          <>
            <ListingPhotoCrop
              photoUrl={sampleListingPhotoUrl}
              focalX={sampleListingPhotoFocalX}
              focalY={sampleListingPhotoFocalY}
              scale={sampleListingPhotoScale}
              aspect={4 / 3}
              testIdPrefix="brand-sample-photo"
              onChange={(p) =>
                onChange({
                  ...("focalX" in p ? { sampleListingPhotoFocalX: p.focalX } : {}),
                  ...("focalY" in p ? { sampleListingPhotoFocalY: p.focalY } : {}),
                  ...("scale" in p ? { sampleListingPhotoScale: p.scale } : {}),
                })
              }
            />
            {/* Settings has no live seller-page preview; the crop applies on the
                published State-A page (the thumbnail above reflects the adjustment). */}
            <p className="text-[11px] text-neutral-600 leading-relaxed">
              Shows on your prepared-invitation page.
            </p>
          </>
        )}
      </div>

      <div className="space-y-1">
        <VideoUploadField
          label="Sample video tour"
          value={sampleVideoUrl ?? ""}
          folder="agent-sample-video"
          testIdPrefix="brand-sample-video"
          helpText="A recent video tour you produced. Separate from your per-invitation hello in the wizard."
          currentPosterUrl={sampleVideoPosterUrl}
          onChange={(url) => {
            // Removing the video (url === "") also clears its captured poster +
            // poster framing — the frame belongs to a video that no longer
            // exists. Done in one atomic patch so the fields never clobber.
            if (!url) {
              onChange({
                sampleVideoUrl: undefined,
                sampleVideoPosterUrl: undefined,
                sampleVideoPosterFocalX: undefined,
                sampleVideoPosterFocalY: undefined,
                sampleVideoPosterScale: undefined,
              });
              return;
            }
            onChange({ sampleVideoUrl: url });
          }}
          onPosterChange={(url) =>
            // A new poster starts centered (mirror the sample-photo reset).
            onChange({
              sampleVideoPosterUrl: url || undefined,
              sampleVideoPosterFocalX: undefined,
              sampleVideoPosterFocalY: undefined,
              sampleVideoPosterScale: undefined,
            })
          }
        />
        {sampleVideoPosterUrl && (
          <>
            <ListingPhotoCrop
              photoUrl={sampleVideoPosterUrl}
              focalX={sampleVideoPosterFocalX}
              focalY={sampleVideoPosterFocalY}
              scale={sampleVideoPosterScale}
              aspect={16 / 9}
              testIdPrefix="brand-sample-video-poster"
              onChange={(p) =>
                onChange({
                  ...("focalX" in p ? { sampleVideoPosterFocalX: p.focalX } : {}),
                  ...("focalY" in p ? { sampleVideoPosterFocalY: p.focalY } : {}),
                  ...("scale" in p ? { sampleVideoPosterScale: p.scale } : {}),
                })
              }
            />
            <p className="text-[11px] text-neutral-600 leading-relaxed">
              Position the poster still so the subject is not cut off.
            </p>
          </>
        )}
      </div>

      {/* Seller State A · Zone 5 — the agent's recent listings (the exposure
          coverflow source). Lean + optional; an agent who adds nothing gets the
          capability-cards-only section. Persists with an empty array cleared to
          undefined so "no listings" stays a single state. */}
      <RecentListingsEditor
        listings={recentListings ?? []}
        enablePhotoPosition
        onChange={(next) =>
          onChange({ recentListings: next.length ? next : undefined })
        }
      />
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="block text-[10px] uppercase tracking-[0.15em] text-neutral-500 mb-2">
        {label}
      </label>
      {children}
    </div>
  );
}

function TextInput({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-full bg-neutral-900 border border-neutral-800 rounded-md px-3 py-2 text-base lg:text-sm focus:outline-none focus:border-mint"
    />
  );
}

function TextAreaInput({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <textarea
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      rows={3}
      className="w-full bg-neutral-900 border border-neutral-800 rounded-md px-3 py-2 text-base lg:text-sm focus:outline-none focus:border-mint resize-y"
    />
  );
}
