import type { PublicPayload } from "../public-payload";
import { priceRangeMidpoint } from "../../engine/price-range";
import { AreaChart } from "../presentation-page";
import { Eyebrow } from "./Eyebrow";

/**
 * §05 · Recent area sales — confident-tint band. OPTIONAL: it renders ONLY when
 * the agent actually entered area-snapshot data (≥1 stat cell or a monthly
 * chart series). With nothing renderable the whole section flexes out — no
 * heading, no placeholder card — exactly like every other optional block
 * (Pitch / Reviews / WhyUs return null when empty). The serializer already
 * keeps an empty snapshot out of the at-rest payload (projectAreaStats /
 * clampAreaStats collapse it to `undefined`), so an empty published page never
 * carries this section. LS-1 removed the old "market snapshot on the way…"
 * pending card: a promise of future content must never appear on a real
 * seller's /h/<slug> page.
 *
 * Emptiness is judged field-by-field: each `cells` push below is guarded by its
 * own value, so a PARTIALLY-filled snapshot still renders exactly the fields the
 * agent gave and omits the rest.
 *
 * The chart is the EXISTING production `AreaChart` mounted verbatim — its
 * geometry / scales / label-placement / draw-on motion are untouched; only
 * a color/type/chrome skin is applied via the scoped flagship CSS.
 */
export function AreaStats({ payload }: { payload: PublicPayload }) {
  const stats = payload.areaStats;

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

  // Nothing the agent entered is renderable → flex out entirely (match the
  // other optional blocks). No heading, no placeholder.
  const isReady = !!stats && (cells.length > 0 || !!stats.monthlySeries?.length);
  if (!isReady) return null;

  // UX-2a — the chart's recommended line is a FIXED reference banner (A7d.10,
  // not data-scaled), so a range needs NO geometry change: feed the chip the
  // range MIDPOINT (renders one compact number, e.g. "$750k"). Single price
  // path is unchanged.
  const recommended =
    priceRangeMidpoint(
      payload.property.recommendedListLow,
      payload.property.recommendedListHigh,
    ) ||
    payload.property.recommendedList ||
    payload.recommendedPrice;

  return (
    <section className="fs-area fs-block tint-confident" data-testid="fs-area">
      <div className="fs-wrap">
        <Eyebrow index="05" label="Recent area sales" />
        <h2 className="fs-headline reveal">
          A neighborhood that <em>moves</em>.
        </h2>

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
      </div>
    </section>
  );
}
