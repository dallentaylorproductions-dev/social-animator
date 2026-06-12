import type { PublicPayload } from "../public-payload";
import { priceRangeMidpoint } from "../../engine/price-range";

/**
 * §05 · Recent area sales — paper band, ported from the prototype's `AreaSales`
 * DOM + its self-contained SVG chart (so v2 no longer shares the v1 AreaChart —
 * v1 stays byte-identical).
 *
 * LOCKED SPLIT (decided with Dallen): this section shows ONLY the neighborhood
 * MEDIAN SALE PRICE + the 12-month price chart. Its days-on-market, homes-sold,
 * and sale-to-list cells are hidden (they duplicate the agent track-record stats
 * in "By the numbers"); the values stay in the payload, they just don't display.
 *
 * Field-by-field emptiness: renders only what the agent/derivation gave. The
 * whole section flexes out when there's neither a median nor a chart series
 * (LS-1 — no "snapshot on the way" placeholder ever reaches a real page).
 */
export function AreaStats({
  payload,
  showRecommended = true,
}: {
  payload: PublicPayload;
  /**
   * Whether to overlay the subject home's RECOMMENDED price on the neighborhood
   * chart (the "Recommended $X" cap + the dashed reference line). Default true =
   * today's full-presentation render, byte-identical. Seller State A passes
   * false: the prepared invitation shows the neighborhood trend ONLY, with NO
   * subject price anywhere (a real number means seeing the home first).
   */
  showRecommended?: boolean;
}) {
  const stats = payload.areaStats;
  const series = (stats?.monthlySeries ?? [])
    .map((m) => ({ month: m.month, v: parseK(m.medianPrice) }))
    .filter((p): p is { month: string; v: number } => p.v != null);

  const hasMedian = !!stats?.medianSale;
  const hasChart = series.length >= 2;
  if (!stats || (!hasMedian && !hasChart)) return null;

  // State A (showRecommended false) never derives a subject price — recK stays
  // null so the chart draws only the neighborhood median trend, no price overlay.
  const recommended = showRecommended
    ? priceRangeMidpoint(
        payload.property.recommendedListLow,
        payload.property.recommendedListHigh,
      ) ||
      payload.property.recommendedList ||
      payload.recommendedPrice
    : undefined;
  const recK = showRecommended ? parseK(recommended) : null;

  return (
    <section className="section area z-paper" data-testid="fs-area">
      <div className="reveal">
        <div className="eyebrow">
          <span className="num">05</span> · Recent Area Sales{" "}
          <span className="rule" aria-hidden="true" />
        </div>
        <h2 className="head">
          A neighborhood that <em>moves</em>.
        </h2>
      </div>

      <div data-testid="fs-area-ready">
        {hasMedian && (
          <div className="area__stats">
            <div className="stat reveal" data-testid="fs-area-median">
              <div className="stat__val">{stats!.medianSale}</div>
              <div className="stat__label">Median Sale</div>
              <div className="stat__sub">
                {stats!.medianSaleDeltaYoy || "Last 90 days"}
              </div>
            </div>
          </div>
        )}
        {hasChart && (
          <AreaChart
            series={series}
            recK={recK}
            showRecommended={showRecommended}
          />
        )}
      </div>
    </section>
  );
}

/** Ported SVG chart (the prototype's `AreaSales` chart, data-driven). */
function AreaChart({
  series,
  recK,
  showRecommended = true,
}: {
  series: Array<{ month: string; v: number }>;
  recK: number | null;
  /** State A passes false: drop the recommended cap + dashline, and scale the
   *  y-axis to the series alone (no subject price influencing the range). */
  showRecommended?: boolean;
}) {
  const W = 640,
    H = 250,
    padL = 48,
    padR = 16,
    padT = 28,
    padB = 34;
  const ys = series.map((p) => p.v);
  const rec = recK ?? Math.max(...ys);
  // Default path includes `rec` in the scale (byte-identical); State A scales to
  // the series only so the absent price never widens the neighborhood trend.
  const min = (showRecommended ? Math.min(...ys, rec) : Math.min(...ys)) - 8;
  const max = (showRecommended ? Math.max(...ys, rec) : Math.max(...ys)) + 8;
  const x = (i: number) =>
    padL + (series.length === 1 ? 0.5 : i / (series.length - 1)) * (W - padL - padR);
  const y = (v: number) => padT + (1 - (v - min) / (max - min || 1)) * (H - padT - padB);
  const line = series.map((p, i) => `${x(i).toFixed(1)},${y(p.v).toFixed(1)}`).join(" ");
  const areaPath =
    `M ${x(0)},${y(series[0].v)} ` +
    series.map((p, i) => `L ${x(i)},${y(p.v)}`).join(" ") +
    ` L ${x(series.length - 1)},${H - padB} L ${x(0)},${H - padB} Z`;
  const lastI = series.length - 1;
  // three clean value ticks spread across the domain
  const span = max - min;
  const ticks = [max - span * 0.18, min + span * 0.5, min + span * 0.16].map(
    (t) => Math.round(t),
  );
  const cur = series[lastI];

  return (
    <div className="chart reveal">
      <div className="chart__head">
        {showRecommended && (
          <div className="chart__cap">
            <span className="k">Recommended</span>
            <span className="v pill">{compactK(rec)}</span>
          </div>
        )}
        <div className="chart__cap r">
          <span className="k">{cur.month} · Current</span>
          <span className="v">{compactK(cur.v)}</span>
        </div>
      </div>
      <div className="chart__plot">
        <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Median sale price trend">
          {ticks.map((tv, i) => (
            <g key={"t" + i}>
              <line className="gridline" x1={padL} x2={W - padR} y1={y(tv)} y2={y(tv)} />
              <text className="ylabel" x={padL - 10} y={y(tv) + 3} textAnchor="end">
                ${tv}k
              </text>
            </g>
          ))}
          {showRecommended && recK != null && (
            <line className="dashline" x1={padL} x2={W - padR} y1={y(rec)} y2={y(rec)} />
          )}
          <path className="area-fill" d={areaPath} />
          <line
            className="dropline"
            x1={x(lastI)}
            x2={x(lastI)}
            y1={y(cur.v)}
            y2={H - padB}
          />
          <polyline
            className="line"
            points={line}
            pathLength={200}
            style={{ "--len": 200 } as React.CSSProperties}
          />
          {series.map((p, i) => (
            <g key={i}>
              {i === lastI && <circle className="halo" cx={x(i)} cy={y(p.v)} r="10" />}
              <circle
                className={"dot" + (i === lastI ? " cur" : "")}
                cx={x(i)}
                cy={y(p.v)}
                r={i === lastI ? 6 : 3.6}
              />
              <text className="xlabel" x={x(i)} y={H - 9} textAnchor="middle">
                {p.month}
              </text>
            </g>
          ))}
        </svg>
      </div>
    </div>
  );
}

/** "$642,000" / "$642k" / "642000" → 642 (thousands). */
function parseK(raw?: string): number | null {
  if (!raw) return null;
  const s = raw.trim().toLowerCase();
  const k = /k$/.test(s);
  const n = parseFloat(s.replace(/[^0-9.]/g, ""));
  if (!Number.isFinite(n)) return null;
  return k ? Math.round(n) : Math.round(n / 1000);
}

function compactK(k: number): string {
  return `$${Math.round(k)}k`;
}
