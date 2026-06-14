"use client";

import { ImageUploadField } from "@/components/ImageUploadField";
import { VideoUploadField } from "@/components/VideoUploadField";
import { useSPEntitlement } from "@/tools/seller-presentation/components/SPEntitlementContext";
import {
  defaultValuationMessage,
  defaultWelcomeLine,
} from "@/tools/seller-presentation/output/flagship/state-a-copy";

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
  sampleVideoUrl,
  sampleVideoPosterUrl,
  onChange,
}: {
  signatureLine?: string;
  valuationMessage?: string;
  welcomeLine?: string;
  sampleListingPhotoUrl?: string;
  sampleVideoUrl?: string;
  sampleVideoPosterUrl?: string;
  /** Merge + persist a patch onto BrandSettings (atomic for multi-field clears). */
  onChange: (patch: {
    signatureLine?: string;
    valuationMessage?: string;
    welcomeLine?: string;
    sampleListingPhotoUrl?: string;
    sampleVideoUrl?: string;
    sampleVideoPosterUrl?: string;
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
            onChange({ sampleListingPhotoUrl: url || undefined })
          }
          previewAspect="aspect-[4/3]"
          folder="agent-sample-photo"
          testIdPrefix="brand-sample-photo"
          helpText="Your best listing photography, not this home. Shows how you shoot every listing."
        />
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
            // Removing the video (url === "") also clears its captured poster —
            // the frame belongs to a video that no longer exists. Done in one
            // atomic patch so the two fields never clobber each other.
            if (!url) {
              onChange({
                sampleVideoUrl: undefined,
                sampleVideoPosterUrl: undefined,
              });
              return;
            }
            onChange({ sampleVideoUrl: url });
          }}
          onPosterChange={(url) =>
            onChange({ sampleVideoPosterUrl: url || undefined })
          }
        />
      </div>
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
