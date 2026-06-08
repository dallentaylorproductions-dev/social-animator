import type {
  PerformanceStat,
  PublicPayload,
  PublicWhyUs,
} from "../public-payload";
import { Eyebrow } from "./Eyebrow";

/**
 * B0b · Why us — the agent-constant "why list with us" chapter (paper-tinted
 * band). The FIRST piece of the Beacon-grade consumer page: the differentiation
 * the seller actually sees. Sourced from brand Settings, snapshotted into the
 * payload at publish (`payload.whyUs`), rendered ONLY on the flagship (v2)
 * template — v1 slugs never mount this.
 *
 * FLEX (sep-flex-in-out-optional-blocks): every sub-block hides cleanly when
 * its list is empty. The page reads complete with all of why-us, some, or none
 * — no empty headers, no "coming soon." The whole section is absent when the
 * clamp returned no renderable content (`payload.whyUs === undefined`).
 *
 * COLOR / LEGIBILITY (sep-template-image-text-legibility-rule): the substantive
 * numbers — the comparison bars + single big stats — carry the agent's
 * `--signature`; ALL reading text stays `--ink` / `--ink-soft`. The bars sit on
 * tinted tracks (real tonal range, calm ≠ flat); body legibility never depends
 * on the accent. Pale signatures fall through the shared `--display-seat` gate
 * (flagship.css §D), which deepens + chips the big numerals.
 *
 * MOTION (sep-consumer-template-motion-direction): motivated only. Each row is a
 * `.reveal` the shared driver keys on; the comparison-bar FILLS draw on once
 * when their row reveals (CSS `.reveal.in .fs-bar__fill { width: var(--w) }`),
 * mirroring the chart's draw-on. No gratuitous movement; reduced-motion lands
 * every bar at full width instantly.
 */
export function WhyUs({ payload }: { payload: PublicPayload }) {
  const whyUs = payload.whyUs;
  if (!whyUs) return null;

  const { differentiators, marketingApproach, howWeWork, guarantee } = whyUs;
  const { bars, bigStats } = splitStats(whyUs.performanceStats);

  return (
    <section className="fs-whyus fs-block" data-testid="fs-whyus">
      <div className="fs-wrap">
        {/* Label-only eyebrow (no index) — the same un-numbered grammar the hero
            and price sections use, so inserting this chapter leaves every
            numbered section's eyebrow untouched. */}
        <Eyebrow label="Why work with us" />
        <h2 className="fs-headline reveal">
          A few reasons to <em>list with us</em>.
        </h2>

        {differentiators.length > 0 && (
          <ul className="fs-whyus__diffs" data-testid="fs-whyus-diffs">
            {differentiators.map((d, i) => (
              <li
                className="fs-whyus__diff reveal"
                key={i}
                data-testid={`fs-whyus-diff-${i}`}
              >
                <span className="fs-whyus__diff-mark" aria-hidden="true" />
                <span className="fs-whyus__diff-text">{d}</span>
              </li>
            ))}
          </ul>
        )}

        {(bars.length > 0 || bigStats.length > 0) && (
          <div className="fs-whyus__group" data-testid="fs-whyus-stats">
            <SubHead>By the numbers</SubHead>
            {bars.length > 0 && (
              <div className="fs-bars">
                {bars.map((b, i) => (
                  <CompareBar key={i} bar={b} index={i} />
                ))}
              </div>
            )}
            {bigStats.length > 0 && (
              <div className="fs-whyus__bigstats">
                {bigStats.map((s, i) => (
                  <BigStat key={i} stat={s} index={i} />
                ))}
              </div>
            )}
          </div>
        )}

        {marketingApproach.length > 0 && (
          <div className="fs-whyus__group" data-testid="fs-whyus-mkt">
            <SubHead>How we market your home</SubHead>
            <div className="fs-whyus__mkt-list">
              {marketingApproach.map((m, i) => (
                <div
                  className="fs-whyus__mkt-row reveal"
                  key={i}
                  data-testid={`fs-whyus-mkt-${i}`}
                >
                  <div className="fs-whyus__mkt-title">{m.title}</div>
                  {m.detail && (
                    <p className="fs-whyus__mkt-detail">{m.detail}</p>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {howWeWork.length > 0 && (
          <div className="fs-whyus__group" data-testid="fs-whyus-process">
            <SubHead>How we work</SubHead>
            <ol className="fs-whyus__steps">
              {howWeWork.map((s, i) => (
                <li
                  className="fs-whyus__step reveal"
                  key={i}
                  data-testid={`fs-whyus-step-${i}`}
                >
                  <div className="fs-whyus__step-h">{s.step}</div>
                  {s.detail && (
                    <p className="fs-whyus__step-p">{s.detail}</p>
                  )}
                </li>
              ))}
            </ol>
          </div>
        )}

        {guarantee && (
          <div
            className="fs-whyus__guarantee reveal"
            data-testid="fs-whyus-guarantee"
          >
            <div className="fs-whyus__guarantee-k">Our guarantee</div>
            <p className="fs-whyus__guarantee-p">{guarantee}</p>
          </div>
        )}
      </div>
    </section>
  );
}

/** A quiet mono sub-heading that opens each why-us sub-block. */
function SubHead({ children }: { children: string }) {
  return <div className="fs-whyus__subhead reveal">{children}</div>;
}

/** A single quantified comparison row — the Beacon "we do this differently" block. */
interface BarModel {
  stat: PerformanceStat;
  your: number;
  market: number;
}

function CompareBar({ bar, index }: { bar: BarModel; index: number }) {
  const { stat, your, market } = bar;
  const max = Math.max(your, market) || 1;
  // Floor a non-zero magnitude to a visible sliver so a small-but-real value
  // never disappears; a true zero stays empty.
  const width = (v: number) => (v <= 0 ? 0 : Math.max(4, (v / max) * 100));

  return (
    <div
      className="fs-bar reveal"
      data-testid={`fs-whyus-bar-${index}`}
    >
      <div className="fs-bar__label">{stat.label}</div>

      <div className="fs-bar__row">
        <div className="fs-bar__track">
          <div
            className="fs-bar__fill"
            style={barStyle(width(your))}
            data-testid={`fs-whyus-bar-${index}-you`}
          />
        </div>
        <div className="fs-bar__val">{displayStat(stat.yourValue, stat.unit)}</div>
      </div>

      <div className="fs-bar__row fs-bar__row--market">
        <div className="fs-bar__track">
          <div
            className="fs-bar__fill fs-bar__fill--market"
            style={barStyle(width(market))}
          />
        </div>
        <div className="fs-bar__mval">
          {displayStat(stat.marketValue ?? "", stat.unit)}
          <span className="fs-bar__mtag"> market avg</span>
        </div>
      </div>
    </div>
  );
}

/** A stat with no market comparison — rendered as a single big figure. */
function BigStat({ stat, index }: { stat: PerformanceStat; index: number }) {
  const suffix = wordUnit(stat.unit);
  return (
    <div
      className="fs-whyus__bigstat reveal"
      data-testid={`fs-whyus-bigstat-${index}`}
    >
      <div className="fs-whyus__bignum">
        {stat.yourValue}
        {suffix && <span className="fs-whyus__bigunit">{suffix}</span>}
      </div>
      <div className="fs-whyus__biglabel">{stat.label}</div>
    </div>
  );
}

/**
 * Inline CSS custom property the draw-on keys on. The fill is width:0 until its
 * `.reveal` row gets `.in`, then transitions to `--w`. Typed for the style
 * prop without leaking a non-standard key into the public CSSProperties.
 */
function barStyle(pct: number): React.CSSProperties {
  return { ["--w" as string]: `${pct}%` } as React.CSSProperties;
}

/** A word unit (days / views) shown as a quiet suffix; "%" rides inside the value already. */
function wordUnit(unit?: string): string | undefined {
  if (!unit) return undefined;
  const u = unit.trim();
  return u && u !== "%" ? u : undefined;
}

/**
 * Display a stat value verbatim (PercentInput already carries its own "%",
 * NumberInput stores the comma-grouped figure), appending a word unit when one
 * applies. Never re-formats the number — the agent typed exactly this.
 */
function displayStat(value: string, unit?: string): string {
  const suffix = wordUnit(unit);
  return suffix ? `${value} ${suffix}` : value;
}

/**
 * Partition the stats into comparison bars (a market value present and both
 * sides parse to a number) vs single big stats (everything else). Keeps the
 * signature comparison block coherent and never tries to draw a bar it can't
 * measure.
 */
function splitStats(stats: PublicWhyUs["performanceStats"]): {
  bars: BarModel[];
  bigStats: PerformanceStat[];
} {
  const bars: BarModel[] = [];
  const bigStats: PerformanceStat[] = [];
  for (const stat of stats) {
    const your = parseStatNum(stat.yourValue);
    const market = stat.marketValue ? parseStatNum(stat.marketValue) : null;
    if (
      stat.marketValue &&
      your !== null &&
      market !== null &&
      (your > 0 || market > 0)
    ) {
      bars.push({ stat, your, market });
    } else {
      bigStats.push(stat);
    }
  }
  return { bars, bigStats };
}

/** Parse the leading magnitude from a display value ("98.2%" → 98.2, "1,240" → 1240). */
function parseStatNum(raw: string): number | null {
  const cleaned = raw.replace(/[^0-9.]/g, "");
  if (!cleaned) return null;
  const n = Number.parseFloat(cleaned);
  return Number.isFinite(n) ? n : null;
}
