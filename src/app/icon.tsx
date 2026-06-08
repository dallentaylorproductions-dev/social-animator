import { ImageResponse } from "next/og";
import { SepMark } from "@/lib/pwa-icon";

// Browser-tab / PWA favicon, generated from the shared SEP mark. Coexists
// with the legacy favicon.ico (Next emits both <link>s); this one gives a
// crisp, brand-correct icon on high-DPI tabs and the Android install banner.
export const size = { width: 512, height: 512 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(<SepMark size={size.width} />, { ...size });
}
