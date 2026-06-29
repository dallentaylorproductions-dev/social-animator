/**
 * PREPARED_NEXT — compose the final draft from the model's text + code constants.
 *
 * The page link and the closing CTA are DETERMINISTIC, so the model never writes
 * them (it wasted budget on the long URL and truncated, v0.2 root cause). The
 * code appends the canonical published page link and then `FALLBACK_CTA` to each
 * variant AFTER the output validator has run — both are trusted code constants,
 * exempt from the denylist / em-dash scan exactly as the CTA always was.
 *
 * PURE. Shared by the prepare route and the TEMP debug endpoint so the composed
 * shape can never drift between them.
 */

import { FALLBACK_CTA } from "./constants";
import type { PreparedDraft } from "./work-order";

/**
 * Append the canonical page link + the closing CTA to each variant. The link is
 * the same `/h/<slug>` URL "Copy link" / "View live page" build. A blank link
 * (defensive) just yields the CTA, byte-identical to the pre-link behavior.
 */
export function composePreparedDraft(
  draft: PreparedDraft,
  pageUrl: string,
): PreparedDraft {
  const link = pageUrl.trim();
  const tail = link ? `${link}\n\n${FALLBACK_CTA}` : FALLBACK_CTA;
  return {
    textVariant: `${draft.textVariant}\n\n${tail}`,
    emailVariant: `${draft.emailVariant}\n\n${tail}`,
  };
}
