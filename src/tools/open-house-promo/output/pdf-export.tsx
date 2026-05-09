"use client";

import { pdf } from "@react-pdf/renderer";
import { type PromoDraft } from "../engine/types";
import { type BrandSettings } from "@/lib/brand";
import { PromoDocument } from "./PromoDocument";
import { generateQrDataUrl } from "./qr";
import { pickContrastText } from "@/tools/listing-flyer/engine/contrast";

/**
 * Generate the open-house-promo PDF blob from the current draft.
 * Shared by both PDF export (pipes the blob to shareOrDownload) and
 * JPEG export (rasterizes the same blob via pdfjs-dist).
 *
 * QR code is generated outside the document component so its async
 * API doesn't have to participate in react-pdf's render lifecycle.
 * The PNG data URL is then embedded as a regular <Image> in the
 * document. fgColor follows the page-bg luminance so the QR scans
 * against any brand background.
 */
export async function generatePdfBlob(
  draft: PromoDraft,
  brand: BrandSettings
): Promise<Blob> {
  const qrFg = pickContrastText(brand.backgroundColor || "#ffffff");
  const qrBg = brand.backgroundColor || "#ffffff";
  const qrDataUrl = await generateQrDataUrl(draft.qrTargetUrl, 400, qrFg, qrBg);
  return pdf(
    <PromoDocument draft={draft} brand={brand} qrDataUrl={qrDataUrl} />
  ).toBlob();
}
