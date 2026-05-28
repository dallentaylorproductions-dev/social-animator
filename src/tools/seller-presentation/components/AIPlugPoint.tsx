"use client";

import type {
  ImportToCompMode,
  SellerPresentationPlugPointType,
} from "../skill";
import type { SellerPresentationDraft } from "../engine/types";
import { ImportCompsButton } from "./ImportCompsButton";

/**
 * AI plug-point dispatcher (v1.47 Lane C — first plug-point lands here).
 *
 * Switches by (`type`, `mode`). Each step in the wizard mounts an
 * `<AIPlugPoint>` at the top with its declared `type`; this component
 * renders the right concrete proposer UI per the substrate §3.4
 * plug-point catalog.
 *
 * Today only `import-to-comp` + `mode='csv'` (which also covers TSV —
 * the route auto-detects delimiter) is wired. `address-autofill`,
 * `copy-suggestion`, and the `mode='vision'` PDF/screenshot path
 * render null until they ship.
 *
 * Per substrate §5.3: every plug-point's manual-entry fallback is
 * always available below the proposer. AIPlugPoint NEVER replaces
 * manual entry — it only adds the AI affordance on top.
 */

export interface AIPlugPointProps {
  type: SellerPresentationPlugPointType;
  mode?: ImportToCompMode;
  draft: SellerPresentationDraft;
  setDraft: (next: SellerPresentationDraft) => void;
}

export function AIPlugPoint({ type, mode, draft, setDraft }: AIPlugPointProps) {
  if (type === "import-to-comp" && (mode === "csv" || mode === "tsv")) {
    return <ImportCompsButton draft={draft} setDraft={setDraft} />;
  }
  // Other plug-point types render null until they ship.
  return null;
}
