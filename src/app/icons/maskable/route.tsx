import { ImageResponse } from "next/og";
import { SepMark } from "@/lib/pwa-icon";

// Manifest maskable icon (512×512, purpose "maskable"). ~12% safe-zone inset
// so Android's adaptive circular/squircle masks don't crop the wordmark, on a
// full-bleed opaque brand background.
export function GET() {
  return new ImageResponse(<SepMark size={512} inset={0.12} />, {
    width: 512,
    height: 512,
  });
}
