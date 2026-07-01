/**
 * Buyer Tour Brief V1 — the Quick Read + comparison card (the "spine", the emotional
 * peak). Built to mock 2h ("How the homes compare"): a plain-English Quick Read that
 * lands in ~3s, then the proof rows beneath it, one per priority, each marking the
 * STRONGEST MATCH on that axis (never an overall "best"). A/B/C identity. Derived
 * entirely from the existing payload (see buyer-tour-v1.ts); renders nothing when there
 * is nothing to compare (graceful).
 *
 * FAIR HOUSING: factual proximity + size only; the "Studio never rates a school or
 * neighborhood" disclaimer is retained in the footer note.
 */

import type { BuyerTourPublicPayload } from "./public-payload";
import { deriveComparison, deriveQuickRead } from "./buyer-tour-v1";

const SERIF =
  '"Iowan Old Style","Palatino Linotype",Palatino,Georgia,"Times New Roman",serif';

export function QuickReadComparison({
  payload,
  accent,
}: {
  payload: BuyerTourPublicPayload;
  /** The agent tour-thread accent — owns the A/B/C letter badges (matches the map pins). */
  accent: string;
}) {
  const axes = deriveComparison(payload);
  if (axes.length === 0) return null;
  const quickRead = deriveQuickRead(payload);

  return (
    <section className="px-3.5 pb-1.5 pt-6" data-testid="btb-comparison">
      <div className="overflow-hidden rounded-[20px] border border-[#E4EEF7] bg-white shadow-[0_2px_4px_rgba(22,33,31,.04),0_12px_30px_rgba(22,33,31,.09)]">
        {/* header */}
        <div className="border-b border-[#F0EBE1] bg-gradient-to-b from-[#F0F6FB] to-white px-[18px] pb-3.5 pt-4">
          <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-[#C2703D]">
            The tradeoffs
          </div>
          <h2 className="mt-1.5 text-[21px] font-semibold" style={{ fontFamily: SERIF }}>
            How the homes compare
          </h2>
          <p className="mt-1 text-[12.5px] text-[#7C8A86]">
            The strongest match is marked for each priority.
          </p>
        </div>

        {/* Quick Read */}
        {quickRead.length > 0 && (
          <div
            className="border-b border-[#F0EBE1] px-[18px] py-3.5"
            style={{ background: "#F0F6FB" }}
            data-testid="btb-quick-read"
          >
            <div className="mb-2.5 text-[10.5px] font-extrabold uppercase tracking-[0.1em] text-[#234F80]">
              Quick read
            </div>
            <div className="flex flex-col gap-2">
              {quickRead.map((c) => (
                <div
                  key={c.key}
                  className="flex items-center gap-2.5 text-[13.5px] text-[#16211F]"
                  data-testid={`btb-quick-read-${c.key}`}
                >
                  <span
                    className="h-[9px] w-[9px] flex-none rounded-full"
                    style={{ background: c.color }}
                  />
                  {c.label}
                  <span
                    className="ml-auto rounded-[6px] px-[9px] py-px text-[12px] font-extrabold text-white"
                    style={{ background: accent }}
                  >
                    {c.letter}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* proof rows — strongest match per axis */}
        {axes.map((axis) => (
          <div
            key={axis.key}
            className="border-b border-[#F0EBE1] px-[18px] py-3.5 last:border-b-0"
            data-testid={`btb-cmp-row-${axis.key}`}
          >
            <div className="mb-2.5 flex items-center gap-[7px] text-[11px] font-bold uppercase tracking-[0.06em] text-[#7C8A86]">
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: axis.color }} />
              {axis.label}
            </div>
            <div className="flex flex-wrap gap-2">
              {axis.cells.map((cell) => (
                <span
                  key={cell.stop}
                  className={`flex items-center gap-[7px] py-[5px] pl-[5px] pr-1 text-[13px] ${
                    cell.isBest ? "text-[#16211F]" : "text-[#7C8A86]"
                  }`}
                  data-testid={`btb-cmp-${axis.key}-${cell.letter}${cell.isBest ? "-best" : ""}`}
                >
                  <span
                    className="flex h-[19px] w-[19px] items-center justify-center rounded-[6px] text-[11px] font-bold"
                    style={
                      cell.isBest
                        ? { background: accent, color: "#fff" }
                        : { background: "#E7E0D5", color: "#42514E" }
                    }
                  >
                    {cell.letter}
                  </span>
                  <span className={cell.isBest ? "font-bold" : ""}>
                    {cell.value ?? "—"}
                  </span>
                  {cell.isBest && (
                    <span
                      className="rounded-[5px] px-1.5 py-0.5 text-[9.5px] font-extrabold uppercase tracking-[0.04em] text-white"
                      style={{ background: accent }}
                    >
                      {axis.tag}
                    </span>
                  )}
                </span>
              ))}
            </div>
          </div>
        ))}

        <div className="bg-[#F7F3EA] px-[18px] py-3 text-[11px] text-[#7C8A86]" data-testid="btb-cmp-note">
          Factual proximity and size, ranked per priority, never an overall best. Your
          agent confirms each; Studio never rates a school or neighborhood.
        </div>
      </div>
    </section>
  );
}
