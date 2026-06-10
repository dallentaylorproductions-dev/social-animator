import type { PublicPayload } from "../public-payload";

/**
 * Standalone footer — the prototype's `agent__foot` rendered as its OWN dark
 * section (the seller page folds this into AgentBand; the prelisting standalone
 * page renders it separately after its single close). The Studio SEP wordmark is
 * a conditional white-label slot (default shown); the disclaimer is always
 * present, verbatim with the prepared-for name interpolated.
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
    <section className="agent" data-testid="fs-foot" style={{ paddingTop: 0 }}>
      <div className="agent__foot" style={{ marginTop: 0, borderTop: "none" }}>
        <div className="agent__lower">
          {showWordmark && (
            <div className="agent__brand" data-testid="fs-wordmark">
              Studio <em>SEP</em>
            </div>
          )}
          <div className="agent__disc">{disclaimer}</div>
        </div>
      </div>
    </section>
  );
}
