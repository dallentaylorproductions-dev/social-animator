import { ImageResponse } from "next/og";
import { SepMark } from "@/lib/pwa-icon";

// Apple touch icon (180×180). MUST be fully opaque — iOS renders a
// transparent touch icon as a black box on the home screen. SepMark paints a
// solid #0a0a0a background, and we add no rounded corners here because iOS
// masks its own.
export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(<SepMark size={size.width} />, { ...size });
}
