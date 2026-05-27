"use client";

import { useRef, useState } from "react";
import type { SellerPresentationDraft } from "../engine/types";
import { useSPEntitlement } from "./SPEntitlementContext";
import { ImportCompsReview } from "./ImportCompsReview";
import type { ImportedComp } from "@/lib/ai/comp-import-project";

/**
 * Import-comps button + flow (v1.47 Lane C friction-AI).
 *
 * State machine:
 *   - idle:    "Import comps from your MLS export"
 *   - reading: "Reading your file…" (file picked, upload in flight)
 *   - mapping: "Matching columns…"  (server processing)
 *   - ready:   review modal open with candidates
 *   - failed:  calm copy + retry available
 *   - locked:  aiAccess !== 'available' → upgrade copy
 *
 * Hard timeout: 15s total. We let fetch run, but the UI surfaces the
 * timeout copy on its side after 15s and stops listening. Server-side
 * the AI call has its own 12s budget; the route returns well before
 * 15s in steady state.
 *
 * The button NEVER replaces manual entry below — substrate §5.3
 * "always has a manual fallback" rule. Even on locked / failed, the
 * Add comp button below the AIPlugPoint slot stays fully functional.
 */

const TIMEOUT_MS = 15_000;

type State =
  | { phase: "idle" }
  | { phase: "reading" }
  | { phase: "mapping" }
  | {
      phase: "ready";
      candidates: ImportedComp[];
      mappingNotes: MappingNote[];
      totalRows: number;
      returnedCount: number;
    }
  | { phase: "failed"; message: string };

interface MappingNote {
  schemaField: string;
  sourceColumn: string | null;
  confidence: number;
}

interface ApiResponse {
  ok: boolean;
  candidates?: ImportedComp[];
  mappingNotes?: MappingNote[];
  totalRows?: number;
  returnedCount?: number;
  code?: string;
  message?: string;
}

export function ImportCompsButton({
  draft,
  setDraft,
}: {
  draft: SellerPresentationDraft;
  setDraft: (next: SellerPresentationDraft) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [state, setState] = useState<State>({ phase: "idle" });
  const { aiAccessState, aiAccessLabel, compImportEnabled } =
    useSPEntitlement();

  // Feature-flag kill switch — hide the affordance entirely when
  // COMP_IMPORT_ENABLED is not true on the server. While loading
  // (compImportEnabled === null), don't pre-render the button either:
  // avoids a flash of UI that disappears on first paint of the
  // entitlement context. Manual entry stays available below regardless.
  if (compImportEnabled === false || compImportEnabled === null) {
    return null;
  }

  const locked = aiAccessState !== null && aiAccessState !== "available";

  const pick = () => {
    if (locked) return;
    inputRef.current?.click();
  };

  const onFile = async (file: File | null) => {
    if (!file) return;
    setState({ phase: "reading" });
    const url = new URL("/api/comp-import", window.location.origin);
    const testTier = new URLSearchParams(window.location.search).get(
      "testTier",
    );
    if (testTier) url.searchParams.set("testTier", testTier);

    const form = new FormData();
    form.append("file", file);

    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    // Flip to "Matching columns…" after the file finishes reading on the
    // wire; the route's AI call kicks in after that point.
    const phaseFlip = setTimeout(() => {
      setState((s) => (s.phase === "reading" ? { phase: "mapping" } : s));
    }, 400);

    try {
      const res = await fetch(url.toString(), {
        method: "POST",
        body: form,
        credentials: "same-origin",
        signal: ctrl.signal,
      });
      const data = (await res.json()) as ApiResponse;
      if (!res.ok || !data.ok || !data.candidates) {
        setState({
          phase: "failed",
          message:
            data.message ??
            "I couldn't read that file clearly. You can still add comps by hand below.",
        });
        return;
      }
      setState({
        phase: "ready",
        candidates: data.candidates,
        mappingNotes: data.mappingNotes ?? [],
        totalRows: data.totalRows ?? data.candidates.length,
        returnedCount: data.returnedCount ?? data.candidates.length,
      });
    } catch (err) {
      const message =
        err instanceof DOMException && err.name === "AbortError"
          ? "That took longer than expected. You can still add comps by hand below."
          : "I couldn't read that file clearly. You can still add comps by hand below.";
      setState({ phase: "failed", message });
    } finally {
      clearTimeout(timer);
      clearTimeout(phaseFlip);
      // Reset the input so the same file can be picked again after a
      // failure → retry.
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const onApply = (selected: ImportedComp[]) => {
    // Project each ImportedComp onto the substrate Comp shape. The
    // packet's design pass restricts the persisted shape to address,
    // soldPrice, soldDate, squareFeet, yearBuilt + source + fieldConfidence.
    // Bedrooms / bathrooms are display-only on the review screen.
    const newComps = selected.map((c) => ({
      address: c.address,
      soldPrice: c.soldPrice,
      soldDate: c.soldDate,
      squareFeet: c.squareFeet,
      yearBuilt: c.yearBuilt,
      source: c.source,
      fieldConfidence: c.fieldConfidence,
    }));
    setDraft({ ...draft, comps: [...draft.comps, ...newComps] });
    setState({ phase: "idle" });
  };

  const onCancel = () => setState({ phase: "idle" });

  return (
    <div data-testid="sep-comps-import-slot">
      <button
        type="button"
        onClick={pick}
        disabled={locked || state.phase === "reading" || state.phase === "mapping"}
        data-testid="sep-comps-import-button"
        data-state={state.phase}
        data-locked={locked ? "1" : "0"}
        className={`inline-flex items-center gap-2 rounded border px-4 py-2 text-sm transition ${
          locked
            ? "border-neutral-700 text-neutral-500 cursor-not-allowed"
            : "border-mint text-mint hover:bg-mint/10"
        }`}
      >
        {buttonLabel(state.phase, locked, aiAccessLabel)}
      </button>
      {state.phase === "failed" && (
        <p
          className="mt-2 text-xs text-neutral-400"
          data-testid="sep-comps-import-error"
        >
          {state.message}
        </p>
      )}
      <input
        ref={inputRef}
        type="file"
        accept=".csv,.tsv,.txt,text/csv,text/tab-separated-values,text/plain"
        className="hidden"
        data-testid="sep-comps-import-input"
        onChange={(e) => onFile(e.target.files?.[0] ?? null)}
      />
      {state.phase === "ready" && (
        <ImportCompsReview
          candidates={state.candidates}
          mappingNotes={state.mappingNotes}
          totalRows={state.totalRows}
          returnedCount={state.returnedCount}
          onApply={onApply}
          onCancel={onCancel}
        />
      )}
    </div>
  );
}

function buttonLabel(
  phase: State["phase"],
  locked: boolean,
  lockedLabel: string,
): string {
  if (locked) {
    return lockedLabel || "Upgrade to Pro to import comps from your MLS export";
  }
  switch (phase) {
    case "reading":
      return "Reading your file…";
    case "mapping":
      return "Matching columns…";
    case "ready":
      return "Review imported comps";
    case "failed":
    case "idle":
    default:
      return "Import comps from your MLS export";
  }
}
