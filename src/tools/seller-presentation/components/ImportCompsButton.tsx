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

// PDF uploads bypass Vercel's multipart parser (v1.48 hotfix v3): the parser
// corrupts binary File bodies on Lambda before any server read runs, so the
// client base64-encodes the PDF (browser File-API bytes are intact) and POSTs
// a JSON body instead. The base64 of a 1 MB PDF is ~1.4 MB — well under
// Vercel's 4.5 MB request-body cap. Cap the raw PDF at 3 MB so the encoded
// body (~4 MB) stays under that platform limit; larger PDFs get the calm
// "try CSV/TSV" nudge rather than a silent 413 from the edge.
const PDF_JSON_MAX_BYTES = 3 * 1024 * 1024;

/**
 * Read a File as raw base64 (no `data:` prefix, no whitespace) in the browser.
 * FileReader.readAsDataURL is the cleanest path — it never spreads the byte
 * array onto the call stack (which `btoa(String.fromCharCode(...bytes))` does,
 * blowing up on ~1 MB inputs) and yields a canonical base64 payload we can
 * decode server-side with Buffer.from(b64, 'base64').
 */
function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () =>
      reject(reader.error ?? new Error("file read failed"));
    reader.onload = () => {
      const result = reader.result;
      if (typeof result !== "string") {
        reject(new Error("unexpected FileReader result"));
        return;
      }
      // Strip the "data:application/pdf;base64," prefix.
      const comma = result.indexOf(",");
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.readAsDataURL(file);
  });
}

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
      mode: "csv" | "pdf";
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
  /** "csv" | "pdf" — surfaces a "PDF parsed via vision — verify the numbers" hint in the review modal when "pdf". */
  mode?: "csv" | "pdf";
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

    const isPdf =
      /\.pdf$/i.test(file.name) || file.type === "application/pdf";

    // PDF-only client guard: a raw PDF over 3 MB would base64-encode past
    // Vercel's 4.5 MB request-body cap on the JSON path. Surface the calm
    // CSV nudge here rather than letting the edge reject the body silently.
    if (isPdf && file.size > PDF_JSON_MAX_BYTES) {
      setState({
        phase: "failed",
        message:
          "That PDF is a bit large to read directly. For the cleanest results, try the CSV or TSV export from your MLS — or add comps by hand below.",
      });
      if (inputRef.current) inputRef.current.value = "";
      return;
    }

    setState({ phase: "reading" });
    const url = new URL("/api/comp-import", window.location.origin);
    const testTier = new URLSearchParams(window.location.search).get(
      "testTier",
    );
    if (testTier) url.searchParams.set("testTier", testTier);

    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    // Flip to "Matching columns…" after the file finishes reading on the
    // wire; the route's AI call kicks in after that point.
    const phaseFlip = setTimeout(() => {
      setState((s) => (s.phase === "reading" ? { phase: "mapping" } : s));
    }, 400);

    try {
      // PDF → JSON+base64 (bypasses the multipart parser that mangles binary
      // on Lambda). CSV/TSV stays on multipart — it's valid UTF-8, survives
      // the parser, and there's no reason to touch the working path.
      let res: Response;
      if (isPdf) {
        const base64 = await fileToBase64(file);
        res = await fetch(url.toString(), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ mode: "pdf", filename: file.name, base64 }),
          credentials: "same-origin",
          signal: ctrl.signal,
        });
      } else {
        const form = new FormData();
        form.append("file", file);
        res = await fetch(url.toString(), {
          method: "POST",
          body: form,
          credentials: "same-origin",
          signal: ctrl.signal,
        });
      }
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
        mode: data.mode ?? "csv",
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
      {/* Format hint — CSV/TSV stays the documented "best accuracy" path
          (the column-aware mapper sees richer headers). PDF is the
          convenience path for agents who default to a Print → PDF export
          from their MLS. The review modal's row-by-row confirmation is
          the safety net for any miss on the PDF side. */}
      <p
        className="mt-1 text-xs text-neutral-500"
        data-testid="sep-comps-import-format-hint"
      >
        CSV or TSV gives the cleanest read; PDF works too.
      </p>
      <input
        ref={inputRef}
        type="file"
        accept=".csv,.tsv,.txt,.pdf,text/csv,text/tab-separated-values,text/plain,application/pdf"
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
          mode={state.mode}
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
