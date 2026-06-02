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
  title: "Social Animator",
  description:
    "Animated Instagram posts for real estate. Pick a template, fill it in, export.",
};

// Mobile viewport: device-width + 1.0 initial scale prevents iOS Safari
// from auto-zooming the marketing page on first load. NO maximum-scale or
// user-scalable=no — pinch-zoom must remain available for accessibility.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
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
        {children}
        {/* H-7.14: gated behind ?perf=1 — renders null otherwise so the
         *  overhead in the common path is one URLSearchParams check at
         *  mount + nothing else. */}
        <PerfToast />
      </body>
    </html>
  );
}
