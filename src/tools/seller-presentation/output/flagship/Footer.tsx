import type { PublicPayload } from "../public-payload";

/**
 * §9 · Footer — dark band. The wordmark is a CONDITIONAL white-label slot:
 * "Studio SEP" ("SEP" serif-italic in --signature, NO floating "S" mark). It
 * is ALWAYS rendered in F2 but gated by one boolean prop (default true) so the
 * F4 white-label entitlement is a one-line wire-up; the footer reads balanced
 * with it present OR absent. The disclaimer is ALWAYS present — the verbatim
 * production string with the prepared-for name interpolated.
 */
export function Footer({
  payload,
  showWordmark = true,
}: {
  payload: PublicPayload;
  showWordmark?: boolean;
}) {
  const preparedFor = payload.preparedFor?.trim();
  const disclaimer = preparedFor
    ? `Prepared privately for ${preparedFor}. The information above is drawn from public record. This page is not an advertisement and does not constitute an offer.`
    : "The information above is drawn from public record. This page is not an advertisement and does not constitute an offer.";

  return (
    <footer className="fs-foot" data-testid="fs-foot">
      <div className="fs-wrap">
        <div className="fs-foot__inner">
          {showWordmark && (
            <div className="fs-foot__word" data-testid="fs-wordmark">
              Studio <em>SEP</em>
            </div>
          )}
          <p className="fs-foot__disc">{disclaimer}</p>
        </div>
      </div>
    </footer>
  );
}
