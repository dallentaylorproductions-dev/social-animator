/**
 * Buyer Tour Brief V1 — the map pin summary card (mock 2h). Tapping a home pin surfaces
 * this calm, dismissible card over the map (letter, address, key facts, why, "View home")
 * INSTEAD of hijacking the page with an auto-scroll. "View home" is the explicit,
 * user-driven jump to the full card. Rendered by BuyerTourPage as an overlay inside the
 * (relative) map frame.
 */

import type { PublicHome } from "./public-payload";

function specLine(home: PublicHome): string {
  const parts: string[] = [];
  if (typeof home.beds === "number") parts.push(`${home.beds} bd`);
  if (typeof home.baths === "number") parts.push(`${home.baths} ba`);
  if (typeof home.sqft === "number") parts.push(`${home.sqft.toLocaleString("en-US")} sqft`);
  return parts.join(" · ");
}

export function PinSummaryCard({
  home,
  letter,
  accent,
  onJump,
  onClose,
}: {
  home: PublicHome;
  letter: string;
  accent: string;
  onJump: () => void;
  onClose: () => void;
}) {
  const specs = specLine(home);
  return (
    <div
      className="absolute inset-x-3 bottom-3 z-10 rounded-[14px] border border-[#EAE3D8] bg-white p-[13px_14px] shadow-[0_8px_26px_rgba(22,33,31,.18)]"
      role="dialog"
      aria-label={`Home ${letter} summary`}
      data-testid="btb-pin-card"
    >
      <div className="flex items-center gap-[9px]">
        <div
          className="flex h-[26px] w-[26px] flex-none items-center justify-center rounded-[8px] text-[13px] font-bold text-white"
          style={{ background: accent }}
        >
          {letter}
        </div>
        <div className="min-w-0">
          <div className="truncate text-[13.5px] font-bold text-[#16211F]">{home.address}</div>
          {home.price !== undefined && (
            <div className="text-[11px] text-[#7C8A86]">${home.price.toLocaleString("en-US")}</div>
          )}
        </div>
      </div>

      {specs && (
        <div className="mt-2.5 flex flex-wrap gap-2">
          <span className="rounded-[7px] border border-[#EAE3D8] bg-[#F7F3EA] px-2 py-1 text-[11.5px] text-[#42514E]">
            {specs}
          </span>
        </div>
      )}

      {home.whyOnList && (
        <div className="mt-2.5 line-clamp-2 text-[12.5px] text-[#42514E]">
          <b className="text-[#16211F]">Why:</b> {home.whyOnList}
        </div>
      )}

      <div className="mt-[11px] flex items-center justify-between">
        <button
          type="button"
          onClick={onJump}
          className="text-[12.5px] font-bold text-[#234F80]"
          data-testid="btb-pin-card-jump"
        >
          View home &rarr;
        </button>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="text-[16px] leading-none text-[#7C8A86]"
          data-testid="btb-pin-card-close"
        >
          &times;
        </button>
      </div>
    </div>
  );
}
