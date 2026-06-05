import type { PublicPayload } from "../public-payload";
import { AreaChart } from "../presentation-page";
import { Eyebrow } from "./Eyebrow";

/**
 * §05 · Recent area sales — confident-tint band. OPTIONAL, two payload-
 * derived states (the prototype's third "off" was Mock-states review chrome,
 * stripped per BUILD_PACKET §5):
 *  - ready  : areaStats present → stat grid (value = --signature, card fill
 *             = --tint-6) + the FROZEN production chart, reskinned by the
 *             flagship stylesheet (TOKEN_MAP §7).
 *  - pending: areaStats absent → the calm "market snapshot on the way" card
 *             (the verbatim production copy), so the editorial rhythm holds.
 *
 * The chart is the EXISTING production `AreaChart` mounted verbatim — its
 * geometry / scales / label-placement / draw-on motion are untouched; only
 * a color/type/chrome skin is applied via the scoped flagship CSS.
 */
export function AreaStats({ payload }: { payload: PublicPayload }) {
  const stats = payload.areaStats;
  const recommended =
    payload.property.recommendedList || payload.recommendedPrice;

  const cells: Array<{ k: string; v: string; sub?: string }> = [];
  if (stats?.medianSale)
    cells.push({
      k: "Median sale",
      v: stats.medianSale,
      sub: stats.medianSaleDeltaYoy || "Last 90 days",
    });
  if (stats?.daysOnMarket)
    cells.push({
      k: "Days on market",
      v: stats.daysOnMarket,
      sub: stats.daysOnMarketZipAvg || "Median",
    });
  if (stats?.closings90d)
    cells.push({ k: "Homes sold", v: stats.closings90d, sub: "Last 90 days" });
  if (stats?.listToSaleRatio)
    cells.push({
      k: "Sale to list",
      v: stats.listToSaleRatio,
      sub: "Median ratio",
    });

  const isReady = !!stats && (cells.length > 0 || !!stats.monthlySeries?.length);

  return (
    <section className="fs-area fs-block tint-confident" data-testid="fs-area">
      <div className="fs-wrap">
        <Eyebrow index="05" label="Recent area sales" />
        <h2 className="fs-headline reveal">
          A neighborhood that <em>moves</em>.
        </h2>

        {isReady ? (
          <div data-testid="fs-area-ready">
            {cells.length > 0 && (
              <div className="fs-stats">
                {cells.map((c, i) => (
                  <div className="fs-stat reveal" key={i}>
                    <div className="fs-stat__k">{c.k}</div>
                    <div className="fs-stat__v">{c.v}</div>
                    {c.sub && <div className="fs-stat__sub">{c.sub}</div>}
                  </div>
                ))}
              </div>
            )}
            <AreaChart series={stats!.monthlySeries} recommended={recommended} />
          </div>
        ) : (
          <div className="fs-area__pending" data-testid="fs-area-pending">
            <div className="fs-area__pk">
              <span className="fs-area__shimmer" aria-hidden="true" />
              Market snapshot
            </div>
            <p>
              A market snapshot is on the way. We&apos;re cross-checking the
              freshest closings before showing them here.
            </p>
          </div>
        )}
      </div>
    </section>
  );
}
