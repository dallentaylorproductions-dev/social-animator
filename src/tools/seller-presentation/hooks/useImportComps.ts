"use client";

import { useRef, useState } from "react";
import type { Comp, SellerPresentationDraft } from "../engine/types";
import { useSPEntitlement } from "../components/SPEntitlementContext";
import type { ImportedComp } from "@/lib/ai/comp-import-project";

/**
 * useImportComps — headless comp-import flow (Phase B2 extraction).
 *
 * Phase A/B1 shipped the upload mechanics inside <ImportCompsButton/>:
 * the file picker, the CSV multipart POST, the PDF base64+JSON POST that
 * bypasses Vercel's multipart parser (v1.48 hotfix v3), the 15s timeout,
 * the 3 MB PDF cap, and the entitlement gating. B2's four-state Step 2
 * UI needs that exact machine but renders its own affordances (an
 * ImportZone in the empty state, an "Import again" button in the
 * populated state) — so the machine is lifted into this hook UNCHANGED
 * and the rendering surface moves to the caller.
 *
 * The ONE behavioral change vs. the old button: apply-then-set-aside.
 * Phase 0 decision 1b#6 eliminated the candidate-review modal. On a
 * successful import the hook applies the top `max` candidates DIRECTLY
 * to the draft (each `counted: true`), then `onApplied` fires so the
 * caller can flip its "imported just now" affordance. The agent curates
 * after the fact via the per-row counted/set-aside toggle on the
 * populated comp list — no modal, no <=4 default-check heuristic.
 *
 * The server contract (/api/comp-import), the %PDF guard, daily caps,
 * rate limits, KV cache + PROMPT_VERSION, and the NWMLS canonical
 * mapping are all untouched — this hook only moves CLIENT rendering.
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

export type ImportPhase = "idle" | "reading" | "mapping" | "failed";

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
  mode?: "csv" | "pdf";
  code?: string;
  message?: string;
}

type State =
  | { phase: "idle" }
  | { phase: "reading" }
  | { phase: "mapping" }
  | { phase: "failed"; message: string };

export interface UseImportComps {
  /** Current upload-machine phase. */
  phase: ImportPhase;
  /** Whether an upload is in flight (reading | mapping) — drives the importing UI. */
  busy: boolean;
  /** Feature flag OFF or still loading — the caller hides the import affordance entirely. */
  hidden: boolean;
  /** aiAccess not 'available' — the caller shows upgrade copy instead of a working picker. */
  locked: boolean;
  /** Calm upgrade label from the entitlement resolver (§8.4 voice). */
  lockedLabel: string;
  /** Calm error copy after a failed import (timeout / unreadable file). */
  errorMessage: string | null;
  /** `accept` attribute for the hidden file input. */
  accept: string;
  /** Attach to the hidden <input type="file">. */
  inputRef: React.RefObject<HTMLInputElement | null>;
  /** Open the OS file picker (no-op when locked). */
  openPicker: () => void;
  /** Wire to the input's onChange — kicks off the upload. */
  onFile: (file: File | null) => void;
}

export function useImportComps({
  draft,
  setDraft,
  max,
  onApplied,
}: {
  draft: SellerPresentationDraft;
  setDraft: (next: SellerPresentationDraft) => void;
  /** Cap applied candidates (MAX_COMPS = 5). */
  max: number;
  /** Fires after candidates land in the draft (caller flips "imported just now"). */
  onApplied?: () => void;
}): UseImportComps {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [state, setState] = useState<State>({ phase: "idle" });
  const { aiAccessState, aiAccessLabel, compImportEnabled } =
    useSPEntitlement();

  // Mirror ImportCompsButton's flag gating: hide the affordance entirely
  // when COMP_IMPORT_ENABLED is not true on the server, OR while the
  // entitlement context is still resolving (null) — avoids a flash of UI
  // that disappears on first paint. Manual entry stays available either way.
  const hidden = compImportEnabled === false || compImportEnabled === null;
  const locked = aiAccessState !== null && aiAccessState !== "available";

  const openPicker = () => {
    if (locked || hidden) return;
    inputRef.current?.click();
  };

  // Apply-then-set-aside: candidates land DIRECTLY on the draft, top
  // `max`, each counted by default. REPLACE semantics — re-importing
  // swaps the previous import for the fresh one (matches the redesign's
  // "Import again" flow). The messy-import detector then derives
  // needs-check per row from each comp's fields + fieldConfidence.
  const onApply = (candidates: ImportedComp[]) => {
    const newComps: Comp[] = candidates.slice(0, max).map((c) => ({
      address: c.address,
      soldPrice: c.soldPrice,
      soldDate: c.soldDate,
      squareFeet: c.squareFeet,
      yearBuilt: c.yearBuilt,
      // FR-2 — carry the richer imported fields onto the Comp so the §05
      // area snapshot can auto-derive DOM + list-to-sale ratio.
      daysOnMarket: c.daysOnMarket,
      saleToListPercent: c.saleToListPercent,
      source: c.source,
      fieldConfidence: c.fieldConfidence,
      counted: true,
    }));
    setDraft({ ...draft, comps: newComps });
    setState({ phase: "idle" });
    onApplied?.();
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
      // No modal: apply directly (apply-then-set-aside).
      onApply(data.candidates);
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

  return {
    phase: state.phase,
    busy: state.phase === "reading" || state.phase === "mapping",
    hidden,
    locked,
    lockedLabel:
      aiAccessLabel ||
      "Upgrade to Pro to import comps from your MLS export",
    errorMessage: state.phase === "failed" ? state.message : null,
    accept:
      ".csv,.tsv,.txt,.pdf,text/csv,text/tab-separated-values,text/plain,application/pdf",
    inputRef,
    openPicker,
    onFile,
  };
}
