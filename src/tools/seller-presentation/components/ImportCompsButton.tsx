"use client";

import type { SellerPresentationDraft } from "../engine/types";
import { useImportComps } from "../hooks/useImportComps";

/**
 * Import-comps button (v1.47 Lane C → Phase B2 thin wrapper).
 *
 * Phase B2 lifted the upload state machine into `useImportComps` and
 * eliminated the candidate-review modal (apply-then-set-aside, Phase 0
 * decision 1b#6). Step 2 now renders its own ImportZone / "Import again"
 * affordances directly off the hook, so this button is no longer mounted
 * inside StepComps. It's kept as a thin wrapper for the AIPlugPoint
 * dispatcher (substrate §5.3 — the plug-point catalog still references
 * `import-to-comp`) and for any other consumer that wants a one-button
 * import surface. The button consumes the SAME hook: candidates apply
 * directly to the draft on success — no modal, no <=4 default-check
 * heuristic.
 *
 * MAX_COMPS is mirrored here (the hook caps applied candidates). The
 * server contract, %PDF guard, caps, rate limits, KV cache, and NWMLS
 * mapping are untouched — see useImportComps for the unchanged mechanics.
 */

const MAX_COMPS = 5;

export function ImportCompsButton({
  draft,
  setDraft,
}: {
  draft: SellerPresentationDraft;
  setDraft: (next: SellerPresentationDraft) => void;
}) {
  const imp = useImportComps({ draft, setDraft, max: MAX_COMPS });

  // Feature-flag kill switch — hide the affordance entirely when
  // COMP_IMPORT_ENABLED is not true (or still loading). Manual entry
  // stays available below regardless.
  if (imp.hidden) return null;

  return (
    <div data-testid="sep-comps-import-slot">
      <button
        type="button"
        onClick={imp.openPicker}
        disabled={imp.locked || imp.busy}
        data-testid="sep-comps-import-button"
        data-state={imp.phase}
        data-locked={imp.locked ? "1" : "0"}
        className={`inline-flex items-center gap-2 rounded border px-4 py-2 text-sm transition ${
          imp.locked
            ? "border-neutral-700 text-neutral-500 cursor-not-allowed"
            : "border-mint text-mint hover:bg-mint/10"
        }`}
      >
        {buttonLabel(imp.phase, imp.locked, imp.lockedLabel)}
      </button>
      {imp.errorMessage && (
        <p
          className="mt-2 text-xs text-neutral-400"
          data-testid="sep-comps-import-error"
        >
          {imp.errorMessage}
        </p>
      )}
      <p
        className="mt-1 text-xs text-neutral-500"
        data-testid="sep-comps-import-format-hint"
      >
        CSV or TSV gives the cleanest read; PDF works too.
      </p>
      <input
        ref={imp.inputRef}
        type="file"
        accept={imp.accept}
        className="hidden"
        data-testid="sep-comps-import-input"
        onChange={(e) => imp.onFile(e.target.files?.[0] ?? null)}
      />
    </div>
  );
}

function buttonLabel(
  phase: "idle" | "reading" | "mapping" | "failed",
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
    case "failed":
    case "idle":
    default:
      return "Import comps from your MLS export";
  }
}
