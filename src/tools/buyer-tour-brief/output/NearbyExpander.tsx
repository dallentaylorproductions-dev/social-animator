"use client";

/**
 * Buyer Tour Brief V1 — the per-home "See everything near this home" expander (mock 2h).
 * An OBVIOUS button (looks interactive without hover) that reveals the full nearby list
 * for a home from existing proximity data. No hidden horizontal sliders. Collapses with a
 * motion-safe height transition (static for reduced-motion viewers).
 */

import { useState } from "react";
import type { ProximityCategory } from "../engine/types";
import type { PublicProximityChip } from "./public-payload";
import { AXIS_COLOR } from "./buyer-tour-v1";

const CATEGORY_LABEL: Record<ProximityCategory, string> = {
  commute: "Commute",
  schools: "School",
  parks: "Park",
  coffee: "Coffee",
  grocery: "Grocery",
};

export function NearbyExpander({
  letter,
  chips,
}: {
  letter: string;
  chips: PublicProximityChip[];
}) {
  const [open, setOpen] = useState(false);
  if (!Array.isArray(chips) || chips.length === 0) return null;

  return (
    <div className="mt-3.5" data-testid={`btb-expander-${letter}`}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center justify-center gap-2 rounded-[11px] border border-[#E4EEF7] bg-[#F0F6FB] p-[11px] text-[13px] font-bold text-[#234F80]"
        data-testid={`btb-expander-btn-${letter}`}
      >
        <span
          className="flex h-[18px] w-[18px] items-center justify-center rounded-full text-[14px] leading-none text-white"
          style={{ background: open ? "#234F80" : "#2F6FB0" }}
        >
          {open ? "–" : "+"}
        </span>
        {open ? "Hide nearby detail" : "See everything near this home"}
      </button>
      <div
        className="overflow-hidden motion-safe:transition-[max-height] motion-safe:duration-300"
        style={{ maxHeight: open ? 420 : 0 }}
        data-testid={`btb-expander-body-${letter}`}
      >
        <div className="pb-0.5 pt-2.5 text-[10.5px] text-[#7C8A86]">
          Everything near home {letter}
        </div>
        {chips.map((chip) => (
          <div
            key={chip.category}
            className="flex items-center gap-[9px] border-t border-[#F0EBE1] py-[7px] text-[12.5px]"
          >
            <span
              className="h-2 w-2 flex-none rounded-full"
              style={{ background: AXIS_COLOR[chip.category] ?? AXIS_COLOR.size }}
            />
            <span className="w-[64px] flex-none text-[11px] font-bold uppercase tracking-[0.05em] text-[#7C8A86]">
              {CATEGORY_LABEL[chip.category]}
            </span>
            <span className="text-[#42514E]">
              <b className="text-[#16211F]">{chip.value}</b>
              {chip.label ? ` to ${chip.label}` : ""}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
