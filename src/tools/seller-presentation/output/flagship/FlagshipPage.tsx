import type { ReactNode } from "react";
import { newsreader } from "./fonts";

/**
 * FlagshipPage — the v2 (templateVersion: 2) consumer-page shell.
 *
 * F1 STUB: invisible rails. It DELEGATES to the existing v1 markup, which the
 * dispatcher passes in as `children` (a true passthrough — the v1 JSX is not
 * forked), and wraps it only in the flagship display-serif shell. Applying
 * `newsreader.variable` HERE — and nowhere else — is what makes the
 * self-hosted Newsreader font exist in the build.
 *
 * It deliberately takes `children` rather than importing the v1 component, so
 * this module's graph carries ONLY the font: combined with the dynamic import
 * in presentation-page.tsx, the Newsreader @font-face lands in FlagshipPage's
 * own code-split chunk, never the v1 seller-presentation CSS chunk. Since no
 * production payload is v2, that chunk (and the font) never load on a live
 * page — v1 stays byte-identical.
 *
 * F2 replaces the delegated children with the real flagship template,
 * consuming the brand roles via `deriveConsumerRoles` and `--font-newsreader`.
 */
export function FlagshipPage({ children }: { children: ReactNode }) {
  return (
    <div className={newsreader.variable} data-flagship-shell>
      {children}
    </div>
  );
}
