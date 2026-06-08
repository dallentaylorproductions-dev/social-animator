import { ImageResponse } from "next/og";
import { SepMark } from "@/lib/pwa-icon";

// Manifest icon (192×192, purpose "any"). Stable URL so manifest.ts can
// reference it directly; Next's file-convention icon routes get hashed URLs
// that are awkward to hardcode in the manifest, so these are plain handlers.
export function GET() {
  return new ImageResponse(<SepMark size={192} />, { width: 192, height: 192 });
}
