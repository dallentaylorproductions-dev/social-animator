import { Newsreader } from "next/font/google";

/**
 * Flagship (v2) display serif — Newsreader (F1 foundation).
 *
 * Self-hosted via `next/font/google` (the repo's font pattern — CSS + font
 * files are downloaded at build time and served from our own static assets;
 * no external <link>, no browser request to Google, no new npm dependency).
 *
 * Tokenized as `--font-newsreader` so ONLY the component that applies
 * `newsreader.variable` opts in. In F1 that is exclusively the FlagshipPage
 * stub, which is unreachable in production (every published payload is
 * templateVersion 1), so this font is NOT attached to any live route and
 * carries no payload cost on today's pages. F2 consumes it from the real
 * flagship template.
 *
 * `preload: false` — the asset has no rendered route in F1, so there is
 * nothing to preload; this also guarantees no preload <link> can leak into a
 * v1 page's <head>. Weights 400/500 + italics cover the F2 text/display needs.
 */
export const newsreader = Newsreader({
  variable: "--font-newsreader",
  subsets: ["latin"],
  weight: ["400", "500"],
  style: ["normal", "italic"],
  display: "swap",
  preload: false,
});
