"use client";

import {
  type PresentationDraft,
} from "@/tools/listing-presentation/engine/types";
import { type BrandSettings, formatPhone } from "@/lib/brand";
import {
  pickContrastText,
  pickContrastMuted,
} from "@/tools/listing-flyer/engine/contrast";

interface PresentationPreviewProps {
  draft: PresentationDraft;
  brand: BrandSettings;
}

/**
 * HTML/CSS approximation of the PDF presentation. Mirrors
 * PresentationDocument's section layout so the on-screen preview
 * tracks the export output. Same brand-color application + same
 * empty-section hiding rules so the preview never shows a section
 * the PDF would omit.
 *
 * Sized at US Letter portrait aspect (8.5 × 11 = 0.773); rendered
 * at the natural width of its container, ScaleToFit (in page.tsx)
 * scales it down on mobile.
 */
export function PresentationPreview({
  draft,
  brand,
}: PresentationPreviewProps) {
  const primary = brand.primaryColor || "#4ef2d9";
  const accent = brand.accentColor || "#0a0a0a";
  const background = brand.backgroundColor || "#ffffff";

  const textPrimary = pickContrastText(background);
  const textMuted = pickContrastMuted(background);
  const onPrimary = pickContrastText(primary);
  const headerTextColor = pickContrastText(accent);
  const onDark = textPrimary === "#ffffff";
  const tileBg = onDark ? "rgba(255,255,255,0.06)" : "#f4f4f5";
  const tileBorder = onDark ? "rgba(255,255,255,0.12)" : "#e4e4e7";

  const strategies = draft.marketingStrategies.filter(
    (s) => s.trim().length > 0
  );
  const comps = draft.comparableSales.filter(
    (c) =>
      c.address.trim() ||
      c.soldPrice.trim() ||
      c.daysOnMarket.trim() ||
      c.saleToListPercent.trim()
  );
  const showStrategies = strategies.length > 0;
  const showComps = comps.length > 0;
  const showWhy = draft.whyChooseMe.trim().length > 0;

  const stats: Array<{ value: string; label: string }> = [
    { value: draft.homesSold || "—", label: "Homes sold this year" },
    { value: draft.averageDaysOnMarket || "—", label: "Avg days on market" },
    { value: draft.saleToListRatio || "—", label: "Sale-to-list ratio" },
    { value: draft.yearsExperience || "—", label: "Years experience" },
  ];

  const headshotInitial = (
    brand.agentName.trim().charAt(0) || "A"
  ).toUpperCase();

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
      {/* ── Header band ───────────────────────────────────── */}
      <div
        className="px-5 py-3 flex items-center gap-3"
        style={{ backgroundColor: accent, color: headerTextColor }}
      >
        {brand.logoDataUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={brand.logoDataUrl}
            alt="Brand logo"
            className="h-8 w-auto object-contain"
          />
        ) : (
          <div
            className="h-8 w-8 rounded-sm flex items-center justify-center text-[10px] font-bold"
            style={{ backgroundColor: primary, color: onPrimary }}
          >
            LOGO
          </div>
        )}
        <div className="flex-1 min-w-0 leading-tight">
          <p className="text-[12px] font-semibold">
            {brand.agentName || "Your name"}
          </p>
          {brand.brokerage && (
            <p className="text-[11px] opacity-75">{brand.brokerage}</p>
          )}
        </div>
        <div className="text-right text-[10px] opacity-85 leading-tight">
          {brand.contactPhone && <div>{formatPhone(brand.contactPhone)}</div>}
          {brand.contactEmail && <div>{brand.contactEmail}</div>}
        </div>
      </div>

      {/* ── Body ──────────────────────────────────────────── */}
      <div className="px-5 py-4 flex-1">
        {/* Property */}
        <p
          className="text-[8px] font-bold uppercase tracking-[0.18em]"
          style={{ color: primary }}
        >
          Presentation for
        </p>
        <h1
          className="text-[22px] font-bold leading-tight mt-1"
          style={{ color: textPrimary }}
        >
          {draft.propertyAddress || "Property address"}
        </h1>
        {draft.propertyCity && (
          <p
            className="text-[11px] mt-0.5"
            style={{ color: textMuted }}
          >
            {draft.propertyCity}
          </p>
        )}
        {draft.ownerName && (
          <p
            className="text-[10px] italic mt-1.5"
            style={{ color: textMuted }}
          >
            Prepared for {draft.ownerName}
          </p>
        )}

        {/* Agent */}
        <SectionLabel color={primary}>Meet your agent</SectionLabel>
        <div className="mt-2 flex items-start gap-4">
          {draft.agentHeadshot ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={draft.agentHeadshot}
              alt="Agent"
              className="w-20 h-20 rounded-full object-cover flex-shrink-0"
            />
          ) : (
            <div
              className="w-20 h-20 rounded-full flex items-center justify-center flex-shrink-0"
              style={{ backgroundColor: primary, color: onPrimary }}
            >
              <span className="text-[26px] font-bold">{headshotInitial}</span>
            </div>
          )}
          <p
            className="text-[11px] leading-relaxed flex-1"
            style={{ color: textPrimary }}
          >
            {draft.agentBio ||
              "Add a 3-4 sentence bio in the form. Lead with your local expertise."}
          </p>
        </div>

        {/* Track record */}
        <SectionLabel color={primary}>Track record</SectionLabel>
        <div className="mt-2 grid grid-cols-4 gap-2">
          {stats.map((s, i) => (
            <div
              key={i}
              className="rounded px-2 py-3"
              style={{ backgroundColor: tileBg }}
            >
              <p
                className="text-[20px] font-bold leading-none"
                style={{ color: primary }}
              >
                {s.value}
              </p>
              <p
                className="text-[7px] font-bold uppercase tracking-wider mt-1.5 leading-snug"
                style={{ color: textMuted }}
              >
                {s.label}
              </p>
            </div>
          ))}
        </div>

        {/* Marketing strategy */}
        {showStrategies && (
          <>
            <SectionLabel color={primary}>Marketing strategy</SectionLabel>
            <ul className="mt-2 space-y-1.5">
              {strategies.map((s, i) => (
                <li
                  key={i}
                  className="text-[10.5px] leading-relaxed flex items-start gap-2"
                  style={{ color: textPrimary }}
                >
                  <span
                    className="mt-1 inline-block w-1.5 h-1.5 rounded-full flex-shrink-0"
                    style={{ backgroundColor: primary }}
                  />
                  <span className="flex-1">{s}</span>
                </li>
              ))}
            </ul>
          </>
        )}

        {/* Comparable sales */}
        {showComps && (
          <>
            <SectionLabel color={primary}>
              Recent comparable sales
            </SectionLabel>
            <div className="mt-2 grid grid-cols-3 gap-2">
              {comps.map((c, i) => (
                <div
                  key={i}
                  className="rounded p-2 border"
                  style={{
                    backgroundColor: tileBg,
                    borderColor: tileBorder,
                  }}
                >
                  <p
                    className="text-[9px] font-bold leading-tight min-h-[22px]"
                    style={{ color: textPrimary }}
                  >
                    {c.address || "—"}
                  </p>
                  <p
                    className="text-[15px] font-bold mt-1.5"
                    style={{ color: primary }}
                  >
                    {c.soldPrice || "—"}
                  </p>
                  <p
                    className="text-[8px] mt-0.5 tracking-wide"
                    style={{ color: textMuted }}
                  >
                    {[
                      c.daysOnMarket ? `${c.daysOnMarket} DOM` : null,
                      c.saleToListPercent
                        ? `${c.saleToListPercent} S/L`
                        : null,
                    ]
                      .filter(Boolean)
                      .join("  ·  ")}
                  </p>
                </div>
              ))}
            </div>
          </>
        )}

        {/* Why choose me */}
        {showWhy && (
          <div className="mt-5">
            <SectionLabel color={primary} mt={false}>
              Why choose me
            </SectionLabel>
            <p
              className="text-[11px] leading-relaxed mt-2"
              style={{ color: textPrimary }}
            >
              {draft.whyChooseMe}
            </p>
          </div>
        )}
      </div>

      {/* ── Footer band ──────────────────────────────────── */}
      <div
        className="px-5 py-2 flex items-center justify-between text-[9px]"
        style={{ backgroundColor: accent, color: headerTextColor }}
      >
        <span className="truncate">
          {brand.agentName || "Your name"}
          {brand.licenseNumber &&
            `  ·  License #${brand.licenseNumber.replace(/^#/, "")}`}
        </span>
        <span className="opacity-85 truncate">
          {[formatPhone(brand.contactPhone), brand.contactEmail]
            .filter(Boolean)
            .join("  ·  ")}
        </span>
      </div>
    </div>
  );
}

function SectionLabel({
  children,
  color,
  mt = true,
}: {
  children: React.ReactNode;
  color: string;
  mt?: boolean;
}) {
  return (
    <p
      className={`text-[8px] font-bold uppercase tracking-[0.18em] ${mt ? "mt-5" : ""}`}
      style={{ color }}
    >
      {children}
    </p>
  );
}
