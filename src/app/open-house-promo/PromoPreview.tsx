"use client";

import { useEffect, useState } from "react";
import {
  type PromoDraft,
  formatTimeRange,
  formatEventDate,
} from "@/tools/open-house-promo/engine/types";
import {
  type BrandSettings,
  formatPhone,
  effectiveBrandAccent,
} from "@/lib/brand";
import {
  pickContrastText,
  pickContrastMuted,
} from "@/tools/listing-flyer/engine/contrast";
import { generateQrDataUrl } from "@/tools/open-house-promo/output/qr";

interface PromoPreviewProps {
  draft: PromoDraft;
  brand: BrandSettings;
}

const QR_DEBOUNCE_MS = 500;

/**
 * HTML/CSS approximation of the open-house-promo PDF. Mirrors
 * PromoDocument's eight-block layout exactly so the on-screen
 * preview tracks the export. Same brand-color application + same
 * empty-section hiding rules.
 *
 * QR code generation is debounced 500ms while the user types the
 * target URL — the qrcode lib's encode is fast (<5ms typical) but
 * regenerating on every keystroke produces visible flicker. The
 * debounce settles the preview after the user stops typing.
 */
export function PromoPreview({ draft, brand }: PromoPreviewProps) {
  const primary = brand.primaryColor || "#4ef2d9";
  // H-7i: accent drives only "PRESENTING" + "Scan for details"
  // labels. Bullets reverted to primary so they pair with the
  // FEATURES section header. effectiveBrandAccent auto-derives a
  // darker shade from primary when the user hasn't explicitly
  // chosen an accent.
  const accent = effectiveBrandAccent(brand);
  const background = brand.backgroundColor || "#ffffff";

  const textPrimary = pickContrastText(background);
  const textMuted = pickContrastMuted(background);
  const onPrimary = pickContrastText(primary);

  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  // Debounce QR regeneration while typing — colors are stable per
  // render, but URL changes frequently and the canvas redraw flickers
  // if we run it on every keystroke.
  useEffect(() => {
    let cancelled = false;
    const id = setTimeout(async () => {
      const url = await generateQrDataUrl(
        draft.qrTargetUrl,
        300,
        textPrimary,
        background
      );
      if (!cancelled) setQrDataUrl(url);
    }, QR_DEBOUNCE_MS);
    return () => {
      cancelled = true;
      clearTimeout(id);
    };
  }, [draft.qrTargetUrl, textPrimary, background]);

  const highlights = draft.propertyHighlights.filter(
    (h) => h.trim().length > 0
  );
  const useTwoCol = highlights.length >= 4;
  const splitAt = useTwoCol ? Math.ceil(highlights.length / 2) : highlights.length;
  const leftHi = highlights.slice(0, splitAt);
  const rightHi = highlights.slice(splitAt);
  const showHighlights = highlights.length > 0;
  const showDescription = draft.description.trim().length > 0;
  const showQr = !!qrDataUrl;
  const hasNotes = draft.eventNotes.trim().length > 0;

  const heroPhoto = draft.photos[0];
  const thumbPhotos = draft.photos.slice(1, 5);
  const showThumbStrip = thumbPhotos.length > 0;
  const dateLabel = draft.eventDate ? formatEventDate(draft.eventDate) : "";
  const timeLabel = formatTimeRange(draft.eventStartTime, draft.eventEndTime);
  // Footer center text — matches PromoDocument's logic exactly so
  // the live preview tracks the export. eventNotes wins; falls back
  // to address+city compose. Earlier preview rendered qrTargetUrl
  // here, which produced live-preview/PDF drift on smoke tests.
  const footerCenter = (() => {
    const notes = draft.eventNotes.trim();
    if (notes) return notes;
    const addressPart = draft.propertyAddress.trim();
    const cityPart = draft.propertyCity.trim();
    if (addressPart && cityPart) return `${addressPart}, ${cityPart}`;
    return addressPart || "Open House";
  })();

  return (
    <div
      className="shadow-2xl mx-auto overflow-hidden rounded-md flex flex-col"
      style={{
        maxWidth: "100%",
        backgroundColor: background,
        color: textPrimary,
        fontFamily:
          "'Inter', -apple-system, BlinkMacSystemFont, system-ui, sans-serif",
      }}
    >
      {/* Header band */}
      <div
        className="px-5 py-3 flex flex-col items-center justify-center text-center"
        style={{ backgroundColor: primary, color: onPrimary }}
      >
        <p
          className="font-bold uppercase"
          style={{ fontSize: 22, letterSpacing: 4 }}
        >
          Open House
        </p>
        {dateLabel && (
          <p
            className="font-bold mt-1"
            style={{ fontSize: 11, letterSpacing: 0.6 }}
          >
            {dateLabel}
          </p>
        )}
        <p className="text-[10px] opacity-90 leading-tight mt-0.5">
          {timeLabel}
        </p>
      </div>

      {/* Hero — H-7m switched from object-cover (over-cropping
          tall source photos) to object-contain with brand-primary
          fill. Box is fixed 3:2 so 3:2 source photos (the natural
          phone-camera real-estate aspect) fit edge-to-edge; other
          aspects get clean letterbox/pillarbox bars in the brand
          color. focalX/focalY no longer affect framing here since
          contain shows the full image — kept on PhotoEntry only
          for the thumb-strip cells (which still use cover). */}
      <div
        className="w-full overflow-hidden flex items-center justify-center"
        style={{
          aspectRatio: "3 / 2",
          backgroundColor: primary,
        }}
      >
        {heroPhoto ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={heroPhoto.src}
            alt="Hero"
            className="w-full h-full object-contain"
          />
        ) : (
          <p
            className="font-bold uppercase"
            style={{ fontSize: 28, letterSpacing: 6, color: onPrimary, opacity: 0.6 }}
          >
            Open House
          </p>
        )}
      </div>

      {/* Thumb strip — up to 4 thumbs of photos[1..5], hidden when
          there's only a hero (photos.length <= 1). H-7m: cells are
          now 3:2 (matching the natural real-estate photo aspect) so
          most phone-camera uploads fit edge-to-edge. Cover-fit
          stays on thumbs since minor cropping is acceptable at
          their small size; focal point still honored. */}
      {showThumbStrip && (
        <div className="grid grid-cols-4 gap-1 px-2 pt-1.5">
          {thumbPhotos.map((p, i) => (
            <div
              key={i}
              className="overflow-hidden rounded-sm"
              style={{ aspectRatio: "3 / 2", backgroundColor: "#1f2937" }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={p.src}
                alt={`Photo ${i + 2}`}
                className="w-full h-full object-cover"
                style={{
                  objectPosition: `${p.focalX}% ${p.focalY}%`,
                }}
              />
            </div>
          ))}
        </div>
      )}

      {/* Body */}
      <div className="px-5 py-4 flex-1">
        {/* Property */}
        <p
          className="text-[8px] font-bold uppercase tracking-[0.18em]"
          style={{ color: accent }}
        >
          Presenting
        </p>
        <div className="mt-1 flex items-end justify-between gap-3">
          <div className="flex-1 min-w-0">
            <h1
              className="text-base font-bold leading-tight"
              style={{ color: textPrimary }}
            >
              {draft.propertyAddress || "Property address"}
            </h1>
            {draft.propertyCity && (
              <p
                className="text-[10px] mt-0.5"
                style={{ color: textMuted }}
              >
                {draft.propertyCity}
              </p>
            )}
          </div>
          {draft.listingPrice && (
            <p
              className="text-base font-bold whitespace-nowrap"
              style={{ color: primary }}
            >
              {draft.listingPrice}
            </p>
          )}
        </div>

        {/* Highlights */}
        {showHighlights && (
          <>
            <SectionLabel color={primary}>Features</SectionLabel>
            <div className="mt-1.5 flex gap-4">
              <ul className="flex-1 space-y-1">
                {leftHi.map((h, i) => (
                  <li
                    key={`l-${i}`}
                    className="text-[10px] flex items-start gap-1.5"
                    style={{ color: textPrimary }}
                  >
                    <span
                      className="mt-1 inline-block w-1 h-1 rounded-full flex-shrink-0"
                      style={{ backgroundColor: primary }}
                    />
                    <span className="flex-1">{h}</span>
                  </li>
                ))}
              </ul>
              {useTwoCol && (
                <ul className="flex-1 space-y-1">
                  {rightHi.map((h, i) => (
                    <li
                      key={`r-${i}`}
                      className="text-[10px] flex items-start gap-1.5"
                      style={{ color: textPrimary }}
                    >
                      <span
                        className="mt-1 inline-block w-1 h-1 rounded-full flex-shrink-0"
                        style={{ backgroundColor: primary }}
                      />
                      <span className="flex-1">{h}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </>
        )}

        {/* Description */}
        {showDescription && (
          <p
            className="text-[10px] leading-relaxed mt-3"
            style={{ color: textPrimary }}
          >
            {draft.description}
          </p>
        )}

        {/* Agent + QR row */}
        <div className="mt-4 flex items-stretch gap-3">
          <div className="flex-1 flex flex-col justify-center">
            <div className="flex items-center gap-2">
              {brand.logoDataUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={brand.logoDataUrl}
                  alt="Logo"
                  className="h-7 w-7 object-contain flex-shrink-0"
                />
              ) : (
                <div
                  className="h-7 w-7 rounded-sm flex items-center justify-center text-[8px] font-bold flex-shrink-0"
                  style={{ backgroundColor: primary, color: onPrimary }}
                >
                  LOGO
                </div>
              )}
              <div className="min-w-0 leading-tight">
                <p
                  className="text-[11px] font-bold truncate"
                  style={{ color: textPrimary }}
                >
                  {brand.agentName || "Your name"}
                </p>
                {brand.brokerage && (
                  <p
                    className="text-[9px] truncate"
                    style={{ color: textMuted }}
                  >
                    {brand.brokerage}
                  </p>
                )}
              </div>
            </div>
            <div className="mt-1.5 space-y-0.5">
              {brand.contactPhone && (
                <p
                  className="text-[9px]"
                  style={{ color: textPrimary }}
                >
                  {formatPhone(brand.contactPhone)}
                </p>
              )}
              {brand.contactEmail && (
                <p
                  className="text-[9px] truncate"
                  style={{ color: textPrimary }}
                >
                  {brand.contactEmail}
                </p>
              )}
            </div>
          </div>
          {showQr && (
            <div className="w-[88px] flex flex-col items-center">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={qrDataUrl ?? undefined}
                alt="QR code"
                className="w-20 h-20 object-contain"
              />
              <p
                className="text-[6px] font-bold uppercase tracking-[0.15em] mt-1 text-center"
                style={{ color: accent }}
              >
                Scan for details
              </p>
            </div>
          )}
        </div>

        {/* Notes */}
        {hasNotes && (
          <p
            className="text-[10px] italic leading-relaxed mt-3"
            style={{ color: textMuted }}
          >
            {draft.eventNotes}
          </p>
        )}
      </div>

      {/* Footer band */}
      <div
        className="px-5 py-2 flex items-center justify-between"
        style={{ backgroundColor: primary, color: onPrimary }}
      >
        <p className="text-[10px] font-bold flex-1 text-center truncate">
          {footerCenter}
        </p>
        {brand.licenseNumber && (
          <p className="text-[8px] opacity-85 ml-2 flex-shrink-0">
            License #{brand.licenseNumber.replace(/^#/, "")}
          </p>
        )}
      </div>
    </div>
  );
}

function SectionLabel({
  children,
  color,
}: {
  children: React.ReactNode;
  color: string;
}) {
  return (
    <p
      className="text-[8px] font-bold uppercase tracking-[0.18em] mt-3"
      style={{ color }}
    >
      {children}
    </p>
  );
}
