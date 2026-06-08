import type { Metadata, Viewport } from "next";
import {
  Geist,
  Geist_Mono,
  Inter,
  Instrument_Serif,
  Hanken_Grotesk,
  JetBrains_Mono,
} from "next/font/google";
import "./globals.css";
import { SerwistProvider } from "@serwist/turbopack/react";
import { PerfToast } from "@/components/PerfToast";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800", "900"],
});

// Display serif for the locked Seller Presentation consumer page
// (v1.47 / A7b). Tokenized as `--font-instrument-serif` so only the
// pages that opt in via the CSS variable actually use it; other pages
// keep the Geist/Inter stack unchanged.
const instrumentSerif = Instrument_Serif({
  variable: "--font-instrument-serif",
  subsets: ["latin"],
  weight: ["400"],
  style: ["normal", "italic"],
});

// Seller Presentation redesign typography (Phase B1). Tokenized as
// `--font-hanken` (readable text) + `--font-jetbrains-mono` (mono
// eyebrows / labels) so only the wizard route's scoped `.sep-wizard`
// stylesheet opts in; every other route keeps the Geist/Inter stack.
// next/font self-hosts both families — no external <link>, no new npm
// dependency.
const hankenGrotesk = Hanken_Grotesk({
  variable: "--font-hanken",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
  weight: ["400", "500"],
});

export const metadata: Metadata = {
  // Brand the tab / iOS share sheet / add-to-home default to match the PWA
  // manifest name ("Studio SEP", short_name "SEP"). M-1 — was the stale
  // "Social Animator" project name. Manifest + icons are unchanged.
  title: "Studio SEP",
  description:
    "Animated Instagram posts for real estate. Pick a template, fill it in, export.",
  // PWA install metadata (PWA-1). The manifest carries the install name
  // ("Studio SEP" / "SEP"); appleWebApp.title is the iOS home-screen label.
  // black-translucent lets the dark app go full-bleed under the status bar
  // (paired with viewport-fit=cover below + a standalone-only safe-area inset
  // on the dashboard topbar). icon.tsx / apple-icon.tsx are auto-linked by
  // Next's file convention, so no explicit `icons` entry is needed here.
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "SEP",
    statusBarStyle: "black-translucent",
  },
};

// Mobile viewport: device-width + 1.0 initial scale prevents iOS Safari
// from auto-zooming the marketing page on first load. NO maximum-scale or
// user-scalable=no — pinch-zoom must remain available for accessibility.
// themeColor tints the standalone window chrome (brand dark); viewport-fit
// cover lets standalone mode paint into the safe-area insets.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#0a0a0a",
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        // overflow-x-hidden as a band-aid against any element that ever
        // grows past 100vw — keeps mobile pages from showing a horizontal
        // scrollbar even if a transform/animation extends a bounding box
        // past the viewport (e.g., gallery card 3D rotateY).
        className={`${geistSans.variable} ${geistMono.variable} ${inter.variable} ${instrumentSerif.variable} ${hankenGrotesk.variable} ${jetbrainsMono.variable} antialiased overflow-x-hidden`}
      >
        {/* PWA service-worker registration (PWA-1). Registers /serwist/sw.js
         *  at scope "/" after hydration. Disabled outside production so normal
         *  Turbopack dev + the Playwright e2e suites are untouched, and
         *  killable via NEXT_PUBLIC_DISABLE_SW=1 (see PWA handoff). The risky
         *  defaults are turned OFF: cacheOnNavigation would proactively cache
         *  authed pathnames; reloadOnOnline would auto-reload mid-edit. */}
        <SerwistProvider
          swUrl="/serwist/sw.js"
          disable={
            process.env.NODE_ENV !== "production" ||
            process.env.NEXT_PUBLIC_DISABLE_SW === "1"
          }
          cacheOnNavigation={false}
          reloadOnOnline={false}
        >
          {children}
        </SerwistProvider>
        {/* H-7.14: gated behind ?perf=1 — renders null otherwise so the
         *  overhead in the common path is one URLSearchParams check at
         *  mount + nothing else. */}
        <PerfToast />
      </body>
    </html>
  );
}
