"use client";

import { useEffect, useMemo, useState } from "react";
import type { ImportedComp } from "@/lib/ai/comp-import-project";

/**
 * Comp-import review modal (v1.47 Lane C — the trust gate).
 *
 * Renders candidate comps after a successful import; agent picks /
 * edits / applies. Per packet:
 *   - Files with ≤4 rows default ALL checked (Cowork lean,
 *     Dallen-confirmed 2026-05-25).
 *   - Files with >4 rows default ALL UNCHECKED — the picker is a
 *     curator, not a dump.
 *   - Low-confidence fields visually flagged (⚠ + tinted background).
 *   - Meta line ("we read 'Selling Price' as Sold Price; …") so a
 *     mis-mapping is one tap to fix at the field level.
 *   - Inline edit on every visible field.
 *   - Apply selected → onApply([…]); Cancel → onCancel().
 *   - Esc / scrim click both = Cancel.
 *
 * Bedrooms / bathrooms render as read-only display chips; they're not
 * in the substrate Comp shape so they don't persist on Apply — but
 * showing them helps the agent recognize each row.
 */

interface MappingNote {
  schemaField: string;
  sourceColumn: string | null;
  confidence: number;
}

interface Props {
  candidates: ImportedComp[];
  mappingNotes: MappingNote[];
  totalRows: number;
  returnedCount: number;
  /** Input mode that produced these candidates. Drives the optional
   *  "PDF parsed via vision — verify the numbers" hint at the top of
   *  the modal. Defaults to "csv" (the legacy path). */
  mode?: "csv" | "pdf";
  onApply: (selected: ImportedComp[]) => void;
  onCancel: () => void;
}

interface RowState extends ImportedComp {
  checked: boolean;
}

export function ImportCompsReview({
  candidates,
  mappingNotes,
  totalRows,
  returnedCount,
  mode = "csv",
  onApply,
  onCancel,
}: Props) {
  const [rows, setRows] = useState<RowState[]>(() => {
    const defaultChecked = candidates.length <= 4;
    return candidates.map((c) => ({ ...c, checked: defaultChecked }));
  });

  // Esc closes.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [onCancel]);

  const selectedCount = useMemo(
    () => rows.filter((r) => r.checked).length,
    [rows],
  );

  const setRow = (idx: number, patch: Partial<RowState>) => {
    setRows((prev) =>
      prev.map((r, i) => (i === idx ? { ...r, ...patch } : r)),
    );
  };

  const applySelected = () => {
    const selected = rows
      .filter((r) => r.checked)
      // Strip the local `checked` flag before bubbling up.
      .map(({ checked: _checked, ...rest }) => rest);
    onApply(selected);
  };

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/65 p-4 backdrop-blur"
      data-testid="sep-comps-import-review"
      onClick={onCancel}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="sep-comps-import-review-title"
        className="flex max-h-[90vh] w-full max-w-3xl flex-col gap-4 overflow-hidden rounded-2xl border border-neutral-700 bg-neutral-900 p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-start justify-between gap-4">
          <div>
            <div className="text-[11px] uppercase tracking-[0.16em] text-mint">
              REVIEW IMPORTED COMPS
            </div>
            <h2
              id="sep-comps-import-review-title"
              className="mt-1 text-xl font-semibold"
            >
              Here&apos;s what I found.
            </h2>
            <p className="mt-1 text-sm text-neutral-400">
              {returnedCount === totalRows
                ? `${candidates.length} comp${candidates.length === 1 ? "" : "s"} from your export.`
                : `Showing ${returnedCount} of ${totalRows} — refine your MLS search if you need different ones.`}
            </p>
          </div>
          <button
            type="button"
            onClick={onCancel}
            className="grid h-9 w-9 place-items-center rounded-lg border border-neutral-700 text-neutral-400 hover:bg-neutral-800 hover:text-white"
            aria-label="Close"
            data-testid="sep-comps-import-review-close"
          >
            ✕
          </button>
        </header>

        {mode === "pdf" && (
          <p
            className="rounded border border-amber-700/50 bg-amber-950/40 p-3 text-xs leading-relaxed text-amber-200"
            data-testid="sep-comps-import-review-vision-hint"
          >
            <span className="font-semibold">PDF parsed via vision —</span>{" "}
            verify the numbers carefully. CSV/TSV is the most accurate path.
          </p>
        )}

        {/* Mapping meta — surface what the AI matched, one tap away from a fix. */}
        <MappingMeta notes={mappingNotes} />

        <div className="flex-1 overflow-y-auto">
          {rows.length === 0 ? (
            <p className="py-6 text-sm italic text-neutral-500">
              No usable comps found in the export.
            </p>
          ) : (
            <ul className="flex flex-col gap-3">
              {rows.map((row, i) => (
                <CandidateRow
                  key={i}
                  index={i}
                  row={row}
                  onChange={(patch) => setRow(i, patch)}
                />
              ))}
            </ul>
          )}
        </div>

        <footer className="flex items-center justify-between gap-3 border-t border-neutral-800 pt-4">
          <span className="text-xs text-neutral-500">
            {selectedCount} selected
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onCancel}
              className="rounded border border-neutral-700 px-4 py-2 text-sm text-neutral-300 hover:bg-neutral-800"
              data-testid="sep-comps-import-review-cancel"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={applySelected}
              disabled={selectedCount === 0}
              className="rounded bg-mint px-4 py-2 text-sm font-semibold text-black transition hover:bg-mint-hover disabled:cursor-not-allowed disabled:opacity-40"
              data-testid="sep-comps-import-review-apply"
            >
              Apply {selectedCount > 0 ? selectedCount : ""} selected
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}

function MappingMeta({ notes }: { notes: MappingNote[] }) {
  // Filter to fields that mapped to something — the unmatched ones are
  // already implied by their absence in the row display.
  const matched = notes.filter((n) => n.sourceColumn);
  if (matched.length === 0) return null;
  return (
    <p
      className="rounded border border-neutral-800 bg-neutral-950 p-3 text-xs leading-relaxed text-neutral-400"
      data-testid="sep-comps-import-review-mapping"
    >
      <span className="font-semibold text-neutral-300">I read:</span>{" "}
      {matched
        .map((n) => `'${n.sourceColumn}' as ${humanLabel(n.schemaField)}`)
        .join("; ")}
      .
    </p>
  );
}

function humanLabel(schemaField: string): string {
  switch (schemaField) {
    case "address":
      return "Address";
    case "soldPrice":
      return "Sold Price";
    case "soldDate":
      return "Sold Date";
    case "squareFeet":
      return "Sqft";
    case "yearBuilt":
      return "Year Built";
    case "bedrooms":
      return "Beds";
    case "bathrooms":
      return "Baths";
    default:
      return schemaField;
  }
}

function CandidateRow({
  index,
  row,
  onChange,
}: {
  index: number;
  row: RowState;
  onChange: (patch: Partial<RowState>) => void;
}) {
  const fc = row.fieldConfidence ?? {};
  const isLow = (k: keyof typeof fc) => fc[k] === "low";

  const cellClass = (low: boolean) =>
    `rounded border px-2 py-1 text-xs ${
      low
        ? "border-amber-500/40 bg-amber-500/10 text-amber-100"
        : "border-neutral-700 bg-neutral-950 text-neutral-100"
    }`;

  return (
    <li
      className="rounded border border-neutral-800 bg-neutral-950/50 p-3"
      data-testid={`sep-comps-import-review-row-${index}`}
    >
      <div className="flex items-start gap-3">
        <input
          type="checkbox"
          checked={row.checked}
          onChange={(e) => onChange({ checked: e.target.checked })}
          className="mt-1"
          data-testid={`sep-comps-import-review-check-${index}`}
          aria-label={`Select comp ${index + 1}`}
        />
        <div className="flex-1 space-y-2">
          {/* Address: full width, inline editable. */}
          <input
            type="text"
            value={row.address}
            onChange={(e) => onChange({ address: e.target.value })}
            className={`${cellClass(isLow("address"))} w-full`}
            data-testid={`sep-comps-import-review-address-${index}`}
            placeholder="Street address"
          />
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <label className="flex flex-col gap-1">
              <span className="text-[10px] uppercase tracking-wider text-neutral-500">
                Sold price{isLow("soldPrice") && <span aria-hidden> ⚠</span>}
              </span>
              <input
                type="text"
                value={row.soldPrice}
                onChange={(e) => onChange({ soldPrice: e.target.value })}
                className={cellClass(isLow("soldPrice"))}
                data-testid={`sep-comps-import-review-soldprice-${index}`}
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[10px] uppercase tracking-wider text-neutral-500">
                Sold date{isLow("soldDate") && <span aria-hidden> ⚠</span>}
              </span>
              <input
                type="text"
                value={row.soldDate ?? ""}
                onChange={(e) =>
                  onChange({ soldDate: e.target.value || undefined })
                }
                className={cellClass(isLow("soldDate"))}
                data-testid={`sep-comps-import-review-solddate-${index}`}
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[10px] uppercase tracking-wider text-neutral-500">
                Sqft{isLow("squareFeet") && <span aria-hidden> ⚠</span>}
              </span>
              <input
                type="text"
                value={row.squareFeet ?? ""}
                onChange={(e) =>
                  onChange({ squareFeet: e.target.value || undefined })
                }
                className={cellClass(isLow("squareFeet"))}
                data-testid={`sep-comps-import-review-sqft-${index}`}
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[10px] uppercase tracking-wider text-neutral-500">
                Year built
              </span>
              <input
                type="text"
                value={row.yearBuilt !== undefined ? String(row.yearBuilt) : ""}
                onChange={(e) => {
                  const digits = e.target.value.replace(/[^0-9]/g, "").slice(0, 4);
                  onChange({
                    yearBuilt: digits ? parseInt(digits, 10) : undefined,
                  });
                }}
                className={cellClass(false)}
                data-testid={`sep-comps-import-review-yearbuilt-${index}`}
              />
            </label>
          </div>
          {/* Beds / baths shown as read-only tags — not in Comp shape; the
              substrate keeps comp persistence narrow. */}
          {(row.bedrooms || row.bathrooms) && (
            <div className="flex gap-2 text-[11px] text-neutral-500">
              {row.bedrooms && <span>{row.bedrooms} bd</span>}
              {row.bathrooms && <span>{row.bathrooms} ba</span>}
            </div>
          )}
        </div>
      </div>
    </li>
  );
}
