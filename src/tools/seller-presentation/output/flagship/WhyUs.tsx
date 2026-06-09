import type {
  PerformanceStat,
  PublicPayload,
  PublicWhyUs,
} from "../public-payload";
import { Eyebrow } from "./Eyebrow";
import { AutoIcon } from "./icons";

/**
 * B0b / D1 · Why us — the agent-constant "why list with us" chapter. The B0b
 * monolith is split into the LOCKED design's distinct banded beats so the
 * 4-dark-beat rhythm and the warm/cool tint variation land, WITHOUT changing
 * any data point or word:
 *
 *   1. Why work with us   — cream band, elevated WHITE cards w/ auto-icons (diffs)
 *   2. By the numbers     — DARK beat, the 98.3-vs-market comparison (performanceStats)
 *   3. How we market       — WARM sand band, prominent auto-icon feature cards
 *   4. How we work         — COOL mist band, horizontal stepper / vertical timeline
 *   5. Our guarantee       — quiet paper statement (preserved verbatim)
 *
 * FLEX (sep-flex-in-out-optional-blocks): every beat hides cleanly when its
 * list is empty; the whole chapter is absent when `payload.whyUs === undefined`.
 * `data-testid="fs-whyus"` rides the FIRST beat that renders, so it marks the
 * chapter's presence regardless of which blocks the agent configured.
 *
 * COLOR / LEGIBILITY: substantive numbers carry the agent `--signature` (the
 * by-the-numbers headline figure pops in `--mint` on the dark beat); ALL reading
 * text stays ink / on-dark. Body legibility never rides the accent.
 *
 * MOTION: each row is a `.reveal` the shared driver keys on; the comparison-bar
 * fills draw on once when their row reveals. Reduced-motion lands everything at
 * its final state.
 */
export function WhyUs({ payload }: { payload: PublicPayload }) {
  const whyUs = payload.whyUs;
  if (!whyUs) return null;

  const { differentiators, marketingApproach, howWeWork, guarantee } = whyUs;
  const { bars, bigStats } = splitStats(whyUs.performanceStats);

  // The flagship testid rides the first beat that actually renders, so the
  // chapter is always marked present (and absent when nothing renders).
  const present = {
    diffs: differentiators.length > 0,
    stats: bars.length > 0 || bigStats.length > 0,
    mkt: marketingApproach.length > 0,
    work: howWeWork.length > 0,
    guarantee: !!guarantee,
  };
  const firstKey = (
    ["diffs", "stats", "mkt", "work", "guarantee"] as const
  ).find((k) => present[k]);
  const chapterTid = (k: typeof firstKey) =>
    k === firstKey ? { "data-testid": "fs-whyus" } : {};

  return (
    <>
      {present.diffs && (
        <section
          className="fs-whyus fs-block"
          data-testid="fs-whyus-diffs"
          {...chapterTid("diffs")}
        >
          <div className="fs-wrap">
            <Eyebrow label="Why work with us" />
            <h2 className="fs-headline reveal">
              A few reasons to <em>list with us</em>.
            </h2>
            <div className="fs-whyus__cards">
              {differentiators.map((d, i) => (
                <div
                  className="fs-whyus__card reveal"
                  key={i}
                  data-testid={`fs-whyus-diff-${i}`}
                >
                  <span className="fs-iconmark fs-iconmark--sm" aria-hidden="true">
                    <AutoIcon title={d} />
                  </span>
                  <p className="fs-whyus__card-text">{emphasizeFigure(d)}</p>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {present.stats && (
        <section
          className="fs-bynum fs-block"
          data-testid="fs-whyus-stats"
          {...chapterTid("stats")}
        >
          <div className="fs-wrap">
            <Eyebrow label="By the numbers" onDark />
            {bars.length > 0 && (
              <div className="fs-bynum__bars">
                {bars.map((b, i) => (
                  <CompareBar key={i} bar={b} index={i} />
                ))}
              </div>
            )}
            {bigStats.length > 0 && (
              <div className="fs-bynum__big">
                {bigStats.map((s, i) => (
                  <BigStat key={i} stat={s} index={i} />
                ))}
              </div>
            )}
          </div>
        </section>
      )}

      {present.mkt && (
        <section
          className="fs-mkt fs-block tint-warm"
          data-testid="fs-whyus-mkt-sec"
          {...chapterTid("mkt")}
        >
          <div className="fs-wrap">
            <Eyebrow label="How we market your home" />
            <div className="fs-mkt__grid">
              {marketingApproach.map((m, i) => (
                <div
                  className="fs-mkt__card reveal"
                  key={i}
                  data-testid={`fs-whyus-mkt-${i}`}
                >
                  <span className="fs-iconmark fs-iconmark--lg" aria-hidden="true">
                    <AutoIcon title={m.title} body={m.detail} />
                  </span>
                  <div className="fs-mkt__title">{m.title}</div>
                  {m.detail && <p className="fs-mkt__detail">{m.detail}</p>}
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {present.work && (
        <section
          className="fs-work fs-block tint-cool"
          data-testid="fs-whyus-process"
          {...chapterTid("work")}
        >
          <div className="fs-wrap">
            <Eyebrow label="How we work" />
            <h2 className="fs-headline reveal">
              From hello to <em>handed keys</em>.
            </h2>
            <ol className="fs-stepper">
              {howWeWork.map((s, i) => (
                <li
                  className="fs-step reveal"
                  key={i}
                  data-testid={`fs-whyus-step-${i}`}
                >
                  <span className="fs-step__badge" aria-hidden="true">
                    {i + 1}
                  </span>
                  <div className="fs-step__h">{s.step}</div>
                  {s.detail && <p className="fs-step__p">{s.detail}</p>}
                </li>
              ))}
            </ol>
          </div>
        </section>
      )}

      {present.guarantee && guarantee && (
        <section
          className="fs-guarantee fs-block"
          data-testid="fs-whyus-guarantee"
          {...chapterTid("guarantee")}
        >
          <div className="fs-wrap">
            <div className="fs-guarantee__k">Our guarantee</div>
            <p className="fs-guarantee__p reveal">{guarantee}</p>
          </div>
        </section>
      )}
    </>
  );
}

/**
 * The signature "we do this differently" comparison — on the DARK by-the-numbers
 * beat. The "this home" value is the earned MINT moment (huge); the market value
 * is muted; a track fills from signature→mint to the home magnitude with a tick
 * at the market magnitude. Labels clear the numbers at every width.
 */
interface BarModel {
  stat: PerformanceStat;
  your: number;
  market: number;
}

function CompareBar({ bar, index }: { bar: BarModel; index: number }) {
  const { stat, your, market } = bar;
  const max = Math.max(your, market) || 1;
  const pct = (v: number) => (v <= 0 ? 0 : Math.max(4, (v / max) * 100));

  return (
    <div className="fs-bynum__bar reveal" data-testid={`fs-whyus-bar-${index}`}>
      <div className="fs-bynum__bar-label">{stat.label}</div>
      <div className="fs-bynum__bar-vals">
        <div className="fs-bynum__col">
          <div className="fs-bynum__home">
            {displayStat(stat.yourValue, stat.unit)}
          </div>
          <div className="fs-bynum__caption">This home</div>
        </div>
        <div className="fs-bynum__col fs-bynum__col--market">
          <div className="fs-bynum__mkt">
            {displayStat(stat.marketValue ?? "", stat.unit)}
          </div>
          <div className="fs-bynum__caption">Market avg</div>
        </div>
      </div>
      <div className="fs-bynum__track">
        <div
          className="fs-bynum__fill"
          style={barStyle(pct(your))}
          data-testid={`fs-whyus-bar-${index}-you`}
        />
        <div
          className="fs-bynum__tick"
          style={tickStyle(pct(market))}
          aria-hidden="true"
        />
      </div>
    </div>
  );
}

/** A stat with no market comparison — a single big figure on the dark beat. */
function BigStat({ stat, index }: { stat: PerformanceStat; index: number }) {
  const suffix = wordUnit(stat.unit);
  return (
    <div className="fs-bynum__bigstat reveal" data-testid={`fs-whyus-bigstat-${index}`}>
      <div className="fs-bynum__bignum">
        {stat.yourValue}
        {suffix && <span className="fs-bynum__bigunit">{suffix}</span>}
      </div>
      <div className="fs-bynum__biglabel">{stat.label}</div>
    </div>
  );
}

/**
 * Wrap the FIRST standalone figure (a number, optionally with % / a trailing
 * unit word) in `.emph` so each why-us card carries one emphasized figure (the
 * "one emphasis per block" craft) — purely presentational, the text is verbatim.
 * No figure → the string renders unchanged.
 */
function emphasizeFigure(text: string): React.ReactNode {
  const m = text.match(/(\d[\d,.]*\s?%?)/);
  if (!m || m.index === undefined) return text;
  const start = m.index;
  const end = start + m[0].length;
  return (
    <>
      {text.slice(0, start)}
      <span className="emph">{text.slice(start, end)}</span>
      {text.slice(end)}
    </>
  );
}

function barStyle(pct: number): React.CSSProperties {
  return { ["--w" as string]: `${pct}%` } as React.CSSProperties;
}
function tickStyle(pct: number): React.CSSProperties {
  return { ["--tick" as string]: `${pct}%` } as React.CSSProperties;
}

function wordUnit(unit?: string): string | undefined {
  if (!unit) return undefined;
  const u = unit.trim();
  return u && u !== "%" ? u : undefined;
}

function displayStat(value: string, unit?: string): string {
  const suffix = wordUnit(unit);
  return suffix ? `${value} ${suffix}` : value;
}

/**
 * Partition stats into comparison bars (a market value present and both sides
 * parse to a number) vs single big stats (everything else). Keeps the signature
 * comparison block coherent and never tries to draw a bar it can't measure.
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

function parseStatNum(raw: string): number | null {
  const cleaned = raw.replace(/[^0-9.]/g, "");
  if (!cleaned) return null;
  const n = Number.parseFloat(cleaned);
  return Number.isFinite(n) ? n : null;
}
