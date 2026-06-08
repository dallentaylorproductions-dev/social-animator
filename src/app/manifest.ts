import type { MetadataRoute } from "next";

/**
 * Web app manifest, served by Next at /manifest.webmanifest.
 *
 * start_url is /dashboard so a returning agent launches straight into the
 * app; middleware redirects to /login if the session has lapsed (and back to
 * /dashboard after the magic link). Colors are the verified brand-dark
 * canvas (#0a0a0a) per the PWA-1 spec — theme_color drives the standalone
 * window chrome and the iOS/Android splash background.
 *
 * Icons resolve to the ImageResponse routes under /icons/* (192, 512, and a
 * 512 maskable with safe-zone padding).
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Studio SEP",
    short_name: "SEP",
    description:
      "Listing-appointment prep and premium seller pages for real estate agents.",
    start_url: "/dashboard",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    theme_color: "#0a0a0a",
    background_color: "#0a0a0a",
    icons: [
      { src: "/icons/192", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/512", sizes: "512x512", type: "image/png", purpose: "any" },
      {
        src: "/icons/maskable",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
