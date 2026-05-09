"use client";

import { pdf } from "@react-pdf/renderer";
import { type PresentationDraft } from "../engine/types";
import { type BrandSettings } from "@/lib/brand";
import { PresentationDocument } from "./PresentationDocument";

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
 */
export async function generatePdfBlob(
  draft: PresentationDraft,
  brand: BrandSettings
): Promise<Blob> {
  return pdf(
    <PresentationDocument draft={draft} brand={brand} />
  ).toBlob();
}
