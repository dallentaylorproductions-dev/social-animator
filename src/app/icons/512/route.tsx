import { ImageResponse } from "next/og";
import { SepMark } from "@/lib/pwa-icon";

// Manifest icon (512×512, purpose "any").
export function GET() {
  return new ImageResponse(<SepMark size={512} />, { width: 512, height: 512 });
}
