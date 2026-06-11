"use client";

import { useEffect, useRef, useState } from "react";
import { CurrencyInput } from "@/components/inputs/CurrencyInput";
import { NumberInput } from "@/components/inputs/NumberInput";
import { ImageUploadField } from "@/components/ImageUploadField";
import { computeCompMedian } from "@/lib/seller-presentation/median";
import { resolveCompCoverage } from "@/lib/seller-presentation/street-view";
import type { Comp, SellerPresentationDraft } from "../engine/types";
import { useImportComps } from "../hooks/useImportComps";
import { useSPEntitlement } from "./SPEntitlementContext";

/**
 * Seller Presentation Step 2 — "Your comps" (Phase B2 redesign).
 *
 * Four-state, import-first content over the substrate-shape `Comp`
 * (re-exported from SIR's engine). The agent exports recent comparable
 * sales from their MLS and drops the file here; the existing
 * /api/comp-import route structures them and they land directly on the
 * draft (apply-then-set-aside — no review modal, Phase 0 decision 1b#6).
 * A live comp-based median (Phase A's `computeCompMedian`) anchors the
 * price story and flows into Step 3 Strategy.
 *
 * States:
 *   - empty:      no comps + ImportZone + slim median placeholder
 *   - importing:  spinner + progress + skeleton (upload in flight)
 *   - populated:  SummaryBand (live median) + comp list + add row
 *   - messy:      sub-mode of populated — amber banner + per-row
 *                 "Check values" chips when an imported comp is
 *                 incomplete or low-confidence
 *
 * Truthful-copy promise (Phase 0 §4): the wizard never claims it
 * fetched / drafted on the agent's behalf, and the median placeholder
 * NEVER shows a fake number (the engine returns null at zero counted
 * comps and the band renders the placeholder copy instead).
 *
 * Public / private split is enforced downstream by `toPublicPayload`:
 *   - PUBLIC per-comp: address, soldPrice, soldDate, sqft, yearBuilt
 *   - PRIVATE per-comp: notes, source, fieldConfidence, AND the B2
 *     `counted` flag (set-aside comps are filtered OUT of the payload).
 *
 * Upload mechanics live in `useImportComps` (the headless extraction of
 * the old <ImportCompsButton/> state machine) — CSV multipart + PDF
 * base64+JSON, 15s timeout, 3 MB PDF cap, entitlement gating — all
 * UNCHANGED. This component only renders the affordances around it.
 */

interface StepCompsProps {
  draft: SellerPresentationDraft;
  setDraft: (next: SellerPresentationDraft) => void;
}

const MAX_COMPS = 5;

/**
 * Debounce before resolving Street View coverage for an edited address. The
 * metadata endpoint is free, but we only want one call once the agent stops
 * typing, and only for the comps actually shown (capped at MAX_COMPS).
 */
const STREET_VIEW_RESOLVE_MS = 700;

/* ---- value helpers ----------------------------------------------- */

const isCountedPredicate = (c: Comp) => c.counted !== false;

function parseMoney(s: string | undefined): number {
  if (!s) return 0;
  const n = Number(s.replace(/[$,\s]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

function parseSqft(s: string | undefined): number {
  if (!s) return 0;
  const n = parseInt(s.replace(/[^0-9]/g, ""), 10);
  return Number.isFinite(n) ? n : 0;
}

function fmtMoney(n: number): string {
  return "$" + Math.round(n).toLocaleString("en-US");
}

function fmtShort(n: number): string {
  return "$" + Math.round(n / 1000) + "k";
}

/** Imported comps carry a non-manual source; manual entries never flag. */
function isImported(c: Comp): boolean {
  return c.source != null && c.source !== "manual";
}

/**
 * Messy-import detection (field-derived — no new schema field). An
 * imported comp needs a quick check when a load-bearing field is
 * missing (blank address / no square footage) or the mapper flagged
 * address / soldPrice as low-confidence. Scoped to imported comps so
 * a hand-added comp without sqft is never falsely flagged. Editing the
 * comp (which clears fieldConfidence on save) self-clears the flag.
 */
function compNeedsCheck(c: Comp): boolean {
  if (!isImported(c)) return false;
  if (!c.address?.trim()) return true;
  if (parseSqft(c.squareFeet) === 0) return true;
  const fc = c.fieldConfidence;
  if (fc && (fc.address === "low" || fc.soldPrice === "low")) return true;
  return false;
}

/** Relative "sold N weeks/months ago" from an ISO/free-text sold date. */
function soldAgoLabel(soldDate: string, now: number): string {
  const t = Date.parse(soldDate);
  if (Number.isNaN(t)) return `sold ${soldDate}`;
  const weeks = (now - t) / (7 * 24 * 60 * 60 * 1000);
  if (weeks < 0) return "sold recently";
  if (weeks <= 1) return "sold this week";
  if (weeks < 5) return `sold ${Math.round(weeks)} weeks ago`;
  const months = Math.round(weeks / 4.3);
  return months <= 1 ? "sold last month" : `sold ${months} months ago`;
}

/* ---- icons ------------------------------------------------------- */
function IconCheck() {
  return (
    <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 6L9 17l-5-5" />
    </svg>
  );
}
function IconPencil() {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
    </svg>
  );
}
function IconPlus() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}
function IconPin() {
  return (
    <svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" />
      <circle cx="12" cy="10" r="2.4" />
    </svg>
  );
}
function IconUpload() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 16V4M7 9l5-5 5 5" />
      <path d="M5 20h14" />
    </svg>
  );
}
function IconRefresh() {
  return (
    <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 12a9 9 0 0 1 15-6.7L21 8" />
      <path d="M21 3v5h-5" />
      <path d="M21 12a9 9 0 0 1-15 6.7L3 16" />
      <path d="M3 21v-5h5" />
    </svg>
  );
}
function IconAlert() {
  return (
    <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 9v4M12 17h.01" />
      <path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" />
    </svg>
  );
}

/* ---- summary band (live median + spread → confidence) ------------ */
function SummaryBand({
  comps,
  skeleton,
}: {
  comps: Comp[];
  skeleton?: boolean;
}) {
  const result = computeCompMedian(comps, isCountedPredicate);
  const med = result?.median ?? 0;

  // Visible recalc: flash the median value whenever it changes.
  const [pulse, setPulse] = useState(false);
  const prev = useRef(med);
  useEffect(() => {
    if (prev.current !== med) {
      setPulse(true);
      prev.current = med;
      const id = setTimeout(() => setPulse(false), 650);
      return () => clearTimeout(id);
    }
  }, [med]);

  if (skeleton) {
    return (
      <div className="summary skeleton" data-testid="step-comps-summary-skeleton">
        <span className="med-label">Median sold price</span>
        <span className="sk-line" />
      </div>
    );
  }

  // Truthful-copy gate: null result (zero counted comps) → placeholder,
  // never a fabricated number.
  if (!result) {
    return (
      <div className="summary empty slim" data-testid="step-comps-summary-empty">
        <span className="med-label">Comp-based price</span>
        <p className="empty-placeholder">
          Add comps to see your comp-based price
          <span className="ph-dot">·</span>
          include at least one and the median appears here
        </p>
      </div>
    );
  }

  const counted = comps.filter(isCountedPredicate);
  const distances = counted
    .map((c) => (c.distanceMiles ? parseFloat(c.distanceMiles) : NaN))
    .filter((n) => Number.isFinite(n));
  const maxDist = distances.length ? Math.max(...distances) : null;
  const confLabel =
    result.confidence.charAt(0).toUpperCase() + result.confidence.slice(1);

  return (
    <div className="summary" data-testid="step-comps-summary">
      <div className="summary-med">
        <span className="med-label">Median sold price</span>
        <span
          className={"med-value" + (pulse ? " bump" : "")}
          data-testid="step-comps-median-value"
        >
          {fmtMoney(result.median)}
        </span>
      </div>
      <p className="summary-line">
        From <strong>{result.countedCount}</strong> of {comps.length}{" "}
        comparable {comps.length === 1 ? "sale" : "sales"} ·{" "}
        {fmtShort(result.low)}–{fmtShort(result.high)}
        {maxDist != null ? ` · all within ${maxDist} mi` : ""}
      </p>
      <div className="summary-meta">
        <span className={"spread-pill" + (pulse ? " bump" : "")}>
          Price spread {result.spreadPct}%
        </span>
        <span className="conf-feeds">
          feeds{" "}
          <strong className={"conf-" + result.confidence}>{confLabel}</strong>{" "}
          comp confidence on Strategy
        </span>
      </div>
      <p className="summary-foot">
        This sets the starting point for your price on{" "}
        <span className="foot-strong">Strategy</span>.
      </p>
    </div>
  );
}

/* ---- one comp ---------------------------------------------------- */
interface CompCardProps {
  comp: Comp;
  index: number;
  editing: boolean;
  currentYear: number | undefined;
  now: number | undefined;
  compPhotos: boolean;
  onEdit: () => void;
  onClose: () => void;
  onToggleCounted: () => void;
  onChange: (patch: Partial<Comp>) => void;
  onRemove: () => void;
}

function CompCard({
  comp,
  index,
  editing,
  currentYear,
  now,
  compPhotos,
  onEdit,
  onClose,
  onToggleCounted,
  onChange,
  onRemove,
}: CompCardProps) {
  const counted = comp.counted !== false;
  const flagged = compNeedsCheck(comp);
  const sqft = parseSqft(comp.squareFeet);
  const ppsf = sqft ? Math.round(parseMoney(comp.soldPrice) / sqft) : 0;

  return (
    <div
      className={
        "comp" +
        (counted ? "" : " out") +
        (editing ? " editing" : "") +
        (flagged ? " flagged" : "")
      }
      data-testid={`step-comps-card-${index}`}
    >
      <div className="comp-face">
        <button
          type="button"
          className={"count-toggle" + (counted ? " on" : "")}
          onClick={onToggleCounted}
          title={
            counted
              ? "Counted in the median. Click to set aside."
              : "Set aside. Click to count it."
          }
          aria-pressed={counted}
          aria-label={`comp-${index + 1}-counted`}
          data-testid={`step-comps-count-${index}`}
        >
          {counted && <IconCheck />}
        </button>

        <div className="comp-body">
          <div className="comp-titlerow">
            <h3 className="comp-addr">
              {comp.address?.trim() || "Untitled comp"}
            </h3>
            {flagged && (
              <span className="check-chip">
                <IconAlert /> Check values
              </span>
            )}
            {!counted && !flagged && <span className="aside-chip">Set aside</span>}
          </div>
          <div className="comp-meta">
            {sqft ? (
              <span>{sqft.toLocaleString()} sqft</span>
            ) : (
              <span className="miss">add sq ft</span>
            )}
            <span className="sep" />
            <span>{sqft ? fmtMoney(ppsf) + "/sqft" : "—/sqft"}</span>
            {comp.yearBuilt !== undefined && (
              <>
                <span className="sep" />
                <span>built {comp.yearBuilt}</span>
              </>
            )}
            {comp.distanceMiles && (
              <>
                <span className="sep dim" />
                <span className="meta-trust">
                  <IconPin /> {comp.distanceMiles} mi
                </span>
              </>
            )}
            {comp.soldDate && now !== undefined && (
              <>
                <span className="sep dim" />
                <span className="meta-trust">
                  {soldAgoLabel(comp.soldDate, now)}
                </span>
              </>
            )}
          </div>
        </div>

        <div className="comp-right">
          <span className="comp-price">
            {comp.soldPrice ? fmtMoney(parseMoney(comp.soldPrice)) : "—"}
          </span>
          <button
            type="button"
            className={"ghostbtn xs" + (flagged ? " confirm" : "")}
            onClick={editing ? onClose : onEdit}
            data-testid={`step-comps-edit-${index}`}
          >
            {editing ? (
              "Close"
            ) : flagged ? (
              "Confirm"
            ) : (
              <>
                <IconPencil /> Edit
              </>
            )}
          </button>
        </div>
      </div>

      {editing && (
        <CompEditor
          comp={comp}
          index={index}
          flagged={flagged}
          currentYear={currentYear}
          compPhotos={compPhotos}
          onChange={onChange}
          onClose={onClose}
          onRemove={onRemove}
        />
      )}
    </div>
  );
}

/* ---- comp editor ------------------------------------------------- */
function CompEditor({
  comp,
  index,
  flagged,
  currentYear,
  compPhotos,
  onChange,
  onClose,
  onRemove,
}: {
  comp: Comp;
  index: number;
  flagged: boolean;
  currentYear: number | undefined;
  compPhotos: boolean;
  onChange: (patch: Partial<Comp>) => void;
  onClose: () => void;
  onRemove: () => void;
}) {
  return (
    <div className="comp-editor">
      {flagged && (
        <p className="confirm-hint">
          <IconAlert /> Imported values can come in wrong. Check these, then
          save to confirm.
        </p>
      )}

      <label className="field">
        <span className="field-label">Address</span>
        <input
          type="text"
          className="input"
          value={comp.address}
          onChange={(e) =>
            onChange(
              // When the flag is on, editing the address invalidates any
              // resolved Street View coverage AND aiming data so the effect
              // re-resolves the new address (undefined => "not yet resolved").
              compPhotos
                ? {
                    address: e.target.value,
                    streetViewPanoId: undefined,
                    hasStreetView: undefined,
                    streetViewHeading: undefined,
                    houseLat: undefined,
                    houseLng: undefined,
                  }
                : { address: e.target.value },
            )
          }
          placeholder="1234 Elm Ave NE"
          data-testid={`step-comps-address-${index}`}
        />
      </label>

      {compPhotos && (
        <div className="comp-photo-field" data-testid={`step-comps-photo-${index}`}>
          <ImageUploadField
            label="Comp photo (optional)"
            value={comp.photoUrl ?? ""}
            onChange={(url) => onChange({ photoUrl: url || undefined })}
            previewAspect="aspect-[16/10]"
            folder="seller-presentation/comps"
            testIdPrefix={`step-comps-photo-upload-${index}`}
            disablePasteUrl
            emptyTitle="Use your own photo"
            emptySubtext={
              comp.photoUrl
                ? undefined
                : comp.hasStreetView === true
                  ? "A street photo for this address shows by default. Upload to use your own instead."
                  : comp.hasStreetView === false
                    ? "No street photo was found for this address. Upload one to show a photo."
                    : "Upload a photo of this home from your camera roll."
            }
            helpText="Your photo replaces the default street photo on the seller page."
          />
        </div>
      )}

      <div className="editor-grid">
        <label className="field">
          <span className="field-label">Sold price</span>
          <CurrencyInput
            className="input"
            value={comp.soldPrice}
            onChange={(v) => onChange({ soldPrice: v })}
            placeholder="$685,000"
            aria-label={`comp-${index + 1}-sold-price`}
          />
        </label>
        <label className={"field" + (flagged && parseSqft(comp.squareFeet) === 0 ? " need" : "")}>
          <span className="field-label">Sq ft</span>
          <NumberInput
            className="input"
            value={comp.squareFeet ?? ""}
            onChange={(v) => onChange({ squareFeet: v || undefined })}
            placeholder="2,840"
          />
        </label>
        <label className="field">
          <span className="field-label">Year built</span>
          {/* Numeric keypad on iOS; 4-digit cap on input. Range clamp
              (1800 ≤ y ≤ currentYear) runs on BLUR so the user can type
              "19" → "199" → "1998" without flicker. currentYear is
              populated in an effect to keep SSR + first paint identical. */}
          <input
            type="text"
            inputMode="numeric"
            className="input"
            value={comp.yearBuilt !== undefined ? String(comp.yearBuilt) : ""}
            onChange={(e) => {
              const digits = e.target.value.replace(/[^0-9]/g, "").slice(0, 4);
              if (!digits) {
                onChange({ yearBuilt: undefined });
                return;
              }
              onChange({ yearBuilt: parseInt(digits, 10) });
            }}
            onBlur={() => {
              const y = comp.yearBuilt;
              if (y === undefined || currentYear === undefined) return;
              if (y < 1800 || y > currentYear) onChange({ yearBuilt: undefined });
            }}
            placeholder="1998"
            data-testid={`step-comps-year-built-${index}`}
            aria-label={`comp-${index + 1}-year-built`}
          />
        </label>
        <label className="field">
          <span className="field-label">Sold date</span>
          <input
            type="date"
            className="input"
            value={comp.soldDate ?? ""}
            onChange={(e) => onChange({ soldDate: e.target.value || undefined })}
          />
        </label>
      </div>

      <div className="editor-grid">
        <label className="field">
          <span className="field-label">Days on market</span>
          <input
            type="text"
            inputMode="numeric"
            className="input"
            value={comp.daysOnMarket ?? ""}
            onChange={(e) =>
              onChange({
                daysOnMarket: e.target.value.replace(/[^0-9]/g, "") || undefined,
              })
            }
            placeholder="11"
          />
        </label>
        <label className="field">
          <span className="field-label">Sale-to-list %</span>
          {/* Decimal keypad for fractional ratios; auto-append "%" on
              blur when content present so stored value reads "98%". */}
          <input
            type="text"
            inputMode="decimal"
            className="input"
            value={comp.saleToListPercent ?? ""}
            onChange={(e) =>
              onChange({ saleToListPercent: e.target.value || undefined })
            }
            onBlur={(e) => {
              const raw = e.target.value.trim();
              if (!raw) {
                onChange({ saleToListPercent: undefined });
                return;
              }
              const next = raw.endsWith("%") ? raw : `${raw}%`;
              if (next !== raw) onChange({ saleToListPercent: next });
            }}
            placeholder="98%"
          />
        </label>
        <label className="field">
          <span className="field-label">Distance (mi)</span>
          <input
            type="text"
            inputMode="decimal"
            className="input"
            value={comp.distanceMiles ?? ""}
            onChange={(e) =>
              onChange({ distanceMiles: e.target.value || undefined })
            }
            placeholder="0.4"
          />
        </label>
      </div>

      <label className="field">
        <span className="field-label">
          Notes{" "}
          <span className="field-note-priv">
            🔒 private · stays on your prep doc, never on the seller page
          </span>
        </span>
        <textarea
          className="input"
          value={comp.notes ?? ""}
          onChange={(e) => onChange({ notes: e.target.value || undefined })}
          placeholder="Why this comp matters or doesn't"
          rows={2}
        />
      </label>

      <div className="editor-foot">
        <button
          type="button"
          className="link-danger"
          onClick={onRemove}
          data-testid={`step-comps-remove-${index}`}
        >
          Remove this comp
        </button>
        <div className="editor-foot-right">
          <button
            type="button"
            className="mintbtn sm"
            onClick={() => {
              // Saving confirms: clear the imported low-confidence flag so
              // the messy indicator self-clears for a now-reviewed comp.
              if (flagged) onChange({ fieldConfidence: undefined });
              onClose();
            }}
            data-testid={`step-comps-save-${index}`}
          >
            <IconCheck /> {flagged ? "Confirm" : "Done"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ---- add comp (inline form) -------------------------------------- */
function AddComp({
  onAdd,
  onCancel,
}: {
  onAdd: (comp: Comp) => void;
  onCancel: () => void;
}) {
  const [address, setAddress] = useState("");
  const [soldPrice, setSoldPrice] = useState("");
  const [squareFeet, setSquareFeet] = useState("");
  const [yearBuilt, setYearBuilt] = useState("");
  const ready = address.trim().length > 0 && soldPrice.trim().length > 0;

  return (
    <div className="comp editing add" data-testid="step-comps-add-form">
      <div className="comp-editor pad-top">
        <span className="add-eyebrow">Add a comparable sale</span>
        <label className="field">
          <span className="field-label">Address</span>
          <input
            type="text"
            className="input"
            autoFocus
            value={address}
            placeholder="1015 N Prospect St"
            onChange={(e) => setAddress(e.target.value)}
            data-testid="step-comps-add-address"
          />
        </label>
        <div className="editor-grid">
          <label className="field">
            <span className="field-label">Sold price</span>
            <CurrencyInput
              className="input"
              value={soldPrice}
              onChange={setSoldPrice}
              placeholder="$685,000"
              aria-label="comp-add-sold-price"
            />
          </label>
          <label className="field">
            <span className="field-label">Sq ft</span>
            <NumberInput
              className="input"
              value={squareFeet}
              onChange={setSquareFeet}
              placeholder="1,900"
            />
          </label>
          <label className="field">
            <span className="field-label">Year built</span>
            <input
              type="text"
              inputMode="numeric"
              className="input"
              value={yearBuilt}
              onChange={(e) =>
                setYearBuilt(e.target.value.replace(/[^0-9]/g, "").slice(0, 4))
              }
              placeholder="1998"
              aria-label="comp-add-year-built"
            />
          </label>
        </div>
        <div className="editor-foot">
          <span className="editor-hint">Adds to your median right away.</span>
          <div className="editor-foot-right">
            <button type="button" className="ghostbtn pad" onClick={onCancel}>
              Cancel
            </button>
            <button
              type="button"
              className="mintbtn sm"
              disabled={!ready}
              data-testid="step-comps-add-submit"
              onClick={() =>
                onAdd({
                  address: address.trim(),
                  soldPrice,
                  squareFeet: squareFeet || undefined,
                  yearBuilt: yearBuilt ? parseInt(yearBuilt, 10) : undefined,
                  source: "manual",
                  counted: true,
                })
              }
            >
              <IconCheck /> Add comp
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ---- import zone (empty state) ----------------------------------- */
function ImportZone({
  onOpen,
  locked,
  lockedLabel,
}: {
  onOpen: () => void;
  locked: boolean;
  lockedLabel: string;
}) {
  const [drag, setDrag] = useState(false);
  return (
    <div
      className={"importzone" + (drag ? " drag" : "")}
      role="button"
      tabIndex={0}
      data-testid="step-comps-importzone"
      data-locked={locked ? "1" : "0"}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen();
        }
      }}
      onDragOver={(e) => {
        e.preventDefault();
        setDrag(true);
      }}
      onDragLeave={() => setDrag(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDrag(false);
        onOpen();
      }}
    >
      <span className="iz-icon">
        <IconUpload />
      </span>
      {locked ? (
        <span className="iz-main">{lockedLabel}</span>
      ) : (
        <span className="iz-main">
          Drop your MLS export here, or <span className="iz-link">choose a file</span>
        </span>
      )}
      <span className="iz-sub">
        Export your comparable sales from your MLS, then drop the file here. We
        pull the details in for you.
      </span>
      <span className="iz-formats">Accepts CSV or PDF from most MLS systems</span>
    </div>
  );
}

/* ---- importing state --------------------------------------------- */
function ImportingState({ mapping }: { mapping: boolean }) {
  return (
    <div className="importing" data-testid="step-comps-importing">
      <div className="importing-head">
        <span className="spinner" />
        <span className="importing-title">
          {mapping ? "Structuring comparable sales…" : "Reading your file…"}
        </span>
      </div>
      <div className="progress">
        <span
          className="progress-bar"
          style={{ width: mapping ? "88%" : "38%" }}
        />
      </div>
      <p className="importing-sub">
        Matching columns and tidying up prices, beds, baths, and square footage.
      </p>
    </div>
  );
}

/* ---- step -------------------------------------------------------- */
export function StepComps({ draft, setDraft }: StepCompsProps) {
  const [editIndex, setEditIndex] = useState<number | null>(null);
  const [adding, setAdding] = useState(false);
  const [manualMode, setManualMode] = useState(false);
  const [justImported, setJustImported] = useState(false);

  // SSR-safe clocks: undefined on server + first client paint, then
  // populated in an effect so SSR and hydration render identically.
  const [currentYear, setCurrentYear] = useState<number | undefined>(undefined);
  const [now, setNow] = useState<number | undefined>(undefined);
  useEffect(() => {
    const d = new Date();
    setCurrentYear(d.getFullYear());
    setNow(d.getTime());
  }, []);

  const { compPhotosEnabled } = useSPEntitlement();

  // Latest-draft ref so the async Street View resolve below applies its writes
  // against the current comps (not the stale closure from when it was queued).
  // Updated in an effect (never during render) and read only inside the
  // debounced timeout, which fires long after this effect has run.
  const draftRef = useRef(draft);
  useEffect(() => {
    draftRef.current = draft;
  }, [draft]);

  const imp = useImportComps({
    draft,
    setDraft,
    max: MAX_COMPS,
    onApplied: () => {
      setJustImported(true);
      setManualMode(false);
      setAdding(false);
      setEditIndex(null);
    },
  });

  const comps = draft.comps;
  const hasComps = comps.length > 0;
  const showEmpty = !imp.busy && !hasComps && !manualMode;
  const flaggedCount = comps.filter(compNeedsCheck).length;
  const messy = flaggedCount > 0;

  // Manual path lands the agent straight in the add form, not an empty void.
  useEffect(() => {
    if (manualMode && !hasComps && !adding) setAdding(true);
  }, [manualMode, hasComps, adding]);

  // COMP_PHOTOS — resolve Street View coverage for the shown comps.
  //
  // Flag-gated, debounced, capped to the comps actually displayed (MAX_COMPS).
  // Compliance: this hits only the FREE metadata endpoint client-side and
  // persists ONLY the pano id + coverage flag onto the comp; no image bytes
  // are ever requested or stored here. A comp with a manual photo, or one
  // whose coverage is already resolved (`hasStreetView` set), is skipped — so
  // this never loops and never re-bills. Any resolve failure (no key, CORS,
  // no coverage) lands `hasStreetView: false`, which renders a clean
  // text-only comp downstream.
  useEffect(() => {
    if (compPhotosEnabled !== true) return;
    const pending = comps.filter(
      (c) =>
        !!c.address?.trim() && !c.photoUrl && c.hasStreetView === undefined,
    );
    if (pending.length === 0) return;

    let cancelled = false;
    const id = setTimeout(() => {
      void (async () => {
        const results = await Promise.all(
          pending.map(async (c) => ({
            address: c.address,
            cov: await resolveCompCoverage(c.address),
          })),
        );
        if (cancelled) return;
        // Apply against the LATEST draft, matching by address among comps that
        // are still unresolved, so a newer edit is never clobbered.
        const cur = draftRef.current;
        setDraft({
          ...cur,
          comps: cur.comps.map((c) => {
            if (c.photoUrl || c.hasStreetView !== undefined || !c.address?.trim())
              return c;
            const hit = results.find((r) => r.address === c.address);
            if (!hit) return c;
            // Persist coverage + the compliant aiming data (heading + house
            // latlng). heading/houseLat/houseLng are undefined when the geocode
            // failed or the address has no coverage — the comp then renders at
            // Street View's default heading (still a photo, just unaimed).
            return {
              ...c,
              streetViewPanoId: hit.cov.panoId,
              hasStreetView: hit.cov.hasStreetView,
              streetViewHeading: hit.cov.heading,
              houseLat: hit.cov.houseLat,
              houseLng: hit.cov.houseLng,
            };
          }),
        });
      })();
    }, STREET_VIEW_RESOLVE_MS);

    return () => {
      cancelled = true;
      clearTimeout(id);
    };
  }, [comps, compPhotosEnabled, setDraft]);

  const updateComp = (index: number, patch: Partial<Comp>) => {
    setDraft({
      ...draft,
      comps: comps.map((c, i) => (i === index ? { ...c, ...patch } : c)),
    });
  };
  const toggleCounted = (index: number) => {
    updateComp(index, { counted: !(comps[index].counted !== false) });
  };
  const removeComp = (index: number) => {
    setDraft({ ...draft, comps: comps.filter((_, i) => i !== index) });
    setEditIndex(null);
  };
  const addComp = (comp: Comp) => {
    setDraft({ ...draft, comps: [...comps, comp].slice(0, MAX_COMPS) });
    setAdding(false);
  };

  const goManual = () => {
    setManualMode(true);
    setAdding(true);
    setEditIndex(null);
  };

  const importAvailable = !imp.hidden;
  const atCap = comps.length >= MAX_COMPS;

  /* -- EMPTY ------------------------------------------------------- */
  if (showEmpty) {
    return (
      <section className="comps" data-testid="step-comps">
        <div className="sec-head">
          <h2 className="sec-title">Your comps</h2>
          <p className="sec-sub">
            Import your comps to anchor the price. They become a comp-based
            median that flows into your strategy.
          </p>
        </div>

        <SummaryBand comps={[]} />

        {importAvailable ? (
          <div className="importzone-wrap">
            <ImportZone
              onOpen={imp.openPicker}
              locked={imp.locked}
              lockedLabel={imp.lockedLabel}
            />
            <button
              type="button"
              className="manual-link"
              onClick={goManual}
              data-testid="step-comps-manual-link"
            >
              Or add a comp manually
            </button>
          </div>
        ) : (
          <div className="importzone-wrap">
            <button
              type="button"
              className="add-row"
              onClick={goManual}
              data-testid="step-comps-manual-link"
            >
              <span className="add-plus">
                <IconPlus />
              </span>
              Add a comp
            </button>
          </div>
        )}

        {imp.errorMessage && (
          <p className="import-error" data-testid="step-comps-import-error">
            {imp.errorMessage}
          </p>
        )}

        <p className="next-hint-inline">
          No comps yet. You can add one now, or skip and add them later on
          Strategy.
        </p>

        <input
          ref={imp.inputRef}
          type="file"
          accept={imp.accept}
          className="visually-hidden-input"
          data-testid="step-comps-import-input"
          onChange={(e) => imp.onFile(e.target.files?.[0] ?? null)}
        />
      </section>
    );
  }

  /* -- IMPORTING --------------------------------------------------- */
  if (imp.busy) {
    return (
      <section className="comps" data-testid="step-comps">
        <div className="sec-head">
          <h2 className="sec-title">Your comps</h2>
          <p className="sec-sub">Bringing in your file. This only takes a moment.</p>
        </div>
        <SummaryBand comps={[]} skeleton />
        <ImportingState mapping={imp.phase === "mapping"} />
        <input
          ref={imp.inputRef}
          type="file"
          accept={imp.accept}
          className="visually-hidden-input"
          data-testid="step-comps-import-input"
          onChange={(e) => imp.onFile(e.target.files?.[0] ?? null)}
        />
      </section>
    );
  }

  /* -- POPULATED (clean or messy) ---------------------------------- */
  return (
    <section className="comps" data-testid="step-comps">
      <div className="sec-head">
        <h2 className="sec-title">Your comps</h2>
        <p className="sec-sub">
          {justImported
            ? "Here are the comps from your import. Set aside any that don't fit, or add your own."
            : "Add the comparable sales you're using to anchor the price. Set aside any that don't fit."}
        </p>
        {importAvailable && (
          <div className="import-row">
            {justImported ? (
              <span className="import-note">
                <span className="dot-live" /> Imported from your MLS export · just
                now
              </span>
            ) : (
              <span />
            )}
            <button
              type="button"
              className="ghostbtn sm"
              onClick={imp.openPicker}
              disabled={imp.locked}
              data-testid="step-comps-import-again"
            >
              <IconRefresh /> {justImported ? "Import again" : "Import comps"}
            </button>
          </div>
        )}
      </div>

      <SummaryBand comps={comps} />

      {messy && (
        <div className="confirm-banner" data-testid="step-comps-messy-banner">
          <span className="cb-icon">
            <IconAlert />
          </span>
          <span className="cb-text">
            <strong>
              {flaggedCount} {flaggedCount === 1 ? "comp needs" : "comps need"} a
              quick check.
            </strong>{" "}
            Imported fields can come in wrong. Open <em>Confirm</em> on the
            flagged comps below.
          </span>
        </div>
      )}

      {imp.errorMessage && (
        <p className="import-error" data-testid="step-comps-import-error">
          {imp.errorMessage}
        </p>
      )}

      {hasComps && (
        <div className="comp-list">
          {comps.map((c, i) => (
            <CompCard
              key={i}
              comp={c}
              index={i}
              editing={editIndex === i}
              currentYear={currentYear}
              now={now}
              compPhotos={compPhotosEnabled === true}
              onEdit={() => {
                setEditIndex(i);
                setAdding(false);
              }}
              onClose={() => setEditIndex(null)}
              onToggleCounted={() => toggleCounted(i)}
              onChange={(patch) => updateComp(i, patch)}
              onRemove={() => removeComp(i)}
            />
          ))}
        </div>
      )}

      {adding ? (
        <AddComp onAdd={addComp} onCancel={() => setAdding(false)} />
      ) : (
        <button
          type="button"
          className="add-row"
          onClick={() => {
            setAdding(true);
            setEditIndex(null);
          }}
          disabled={atCap}
          data-testid="step-comps-add"
        >
          <span className="add-plus">
            <IconPlus />
          </span>
          Add a comp
          {atCap ? (
            <span className="add-hint">max {MAX_COMPS}</span>
          ) : (
            hasComps && <span className="add-hint">optional</span>
          )}
        </button>
      )}

      <input
        ref={imp.inputRef}
        type="file"
        accept={imp.accept}
        className="visually-hidden-input"
        data-testid="step-comps-import-input"
        onChange={(e) => imp.onFile(e.target.files?.[0] ?? null)}
      />
    </section>
  );
}
