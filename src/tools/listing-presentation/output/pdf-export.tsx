"use client";

import { pdf } from "@react-pdf/renderer";
import { type PresentationDraft } from "../engine/types";
import { type BrandSettings } from "@/lib/brand";
import { PresentationDocument } from "./PresentationDocument";
import {
  PHASE_NAMES,
  measurePhase,
  measurePhaseSync,
} from "@/lib/perf";

/**
 * Generate the listing-presentation PDF blob from the current draft.
 *
 * Shared by both:
 *  - PDF export (pipes the blob straight to shareOrDownload)
 *  - JPEG export (rasterizes this same blob via pdfjs-dist)
 *
 * Unlike the flyer, the presentation has only one user-supplied image
 * (the agent headshot), and it's already pre-compressed to ~400×400
 * JPEG q=0.85 at upload time (see PresentationForm). No additional
 * photo prep is needed at export time — the data URL passes straight
 * through to react-pdf.
 *
 * H-7.2.5-1 added a non-blocking page-count assertion mirroring the
 * pattern in src/tools/open-house-promo/output/pdf-export.tsx. The
 * presentation was spec'd as 1-page-only in H-6b; if Marketing
 * Strategy or Why Choose Me overflow into a second page, the JPEG
 * export (which only rasterizes page 1) silently drops content.
 * The cap changes in types.ts (4 strategies, 80 chars each, 280
 * chars closing pitch) should prevent overflow in legal drafts;
 * this assertion catches future regressions.
 */
export async function generatePdfBlob(
  draft: PresentationDraft,
  brand: BrandSettings
): Promise<Blob> {
  const doc = measurePhaseSync(PHASE_NAMES.PDF_DOC_BUILD, () => (
    <PresentationDocument draft={draft} brand={brand} />
  ));
  const blob = await measurePhase(PHASE_NAMES.PDF_RENDER_TO_BLOB, () =>
    pdf(doc).toBlob()
  );

  void assertSinglePage(blob, draft);

  return blob;
}

let pdfjsPromise: Promise<typeof import("pdfjs-dist")> | null = null;

function loadPdfjs(): Promise<typeof import("pdfjs-dist")> {
  if (pdfjsPromise) return pdfjsPromise;
  pdfjsPromise = (async () => {
    const lib = await import("pdfjs-dist/legacy/build/pdf.mjs");
    if (!lib.GlobalWorkerOptions.workerSrc) {
      lib.GlobalWorkerOptions.workerSrc = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${lib.version}/legacy/build/pdf.worker.min.mjs`;
    }
    return lib as unknown as typeof import("pdfjs-dist");
  })();
  return pdfjsPromise;
}

/**
 * Best-effort telemetry: if the generated PDF runs onto a second
 * page, log a warning with a snapshot of fields that drive layout
 * height so the regression can be diagnosed without reproducing
 * the user's full draft. Never blocks the export path — pdfjs
 * load failures are swallowed.
 */
async function assertSinglePage(
  blob: Blob,
  draft: PresentationDraft
): Promise<void> {
  try {
    const pdfjsLib = await loadPdfjs();
    const data = await blob.arrayBuffer();
    const pdfDoc = await pdfjsLib.getDocument({ data }).promise;
    const numPages = pdfDoc.numPages;
    await pdfDoc.destroy();
    if (numPages !== 1) {
      console.warn(
        `[presentation pdf] generated ${numPages} pages — expected 1. Draft snapshot:`,
        {
          strategiesCount: draft.marketingStrategies.filter((s) =>
            s.trim()
          ).length,
          strategyLengths: draft.marketingStrategies.map((s) => s.length),
          whyChooseMeLen: draft.whyChooseMe.length,
          agentBioLen: draft.agentBio.length,
          compsCount: draft.comparableSales.filter((c) =>
            c.address.trim()
          ).length,
        }
      );
    }
  } catch {
    // Best-effort telemetry — don't fail the export path if pdfjs
    // hiccups during the assertion.
  }
}
