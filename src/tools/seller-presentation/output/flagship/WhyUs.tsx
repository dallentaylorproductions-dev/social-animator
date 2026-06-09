import type {
  PerformanceStat,
  PublicPayload,
} from "../public-payload";
import { AutoIcon } from "./icons";

/**
 * B0b / D1-PORT · The agent-constant "why list with us" chapter, ported to the
 * locked prototype's distinct banded beats (same data + words):
 *   1. Why work with us  — cream band, elevated WHITE cards w/ auto-icons (.rcard)
 *   2. By the numbers    — DARK beat, us-vs-market comparisons (.cmp / .bynum)
 *   3. How we market     — WARM sand band, prominent auto-icon cards (.mcard)
 *   4. How we work       — COOL mist band, horizontal stepper / mobile timeline (.flow)
 *   5. Our guarantee     — preserved as a quiet statement (prototype primitives)
 *
 * LOCKED SPLIT: "By the numbers" carries ALL FOUR agent track-record stats (the
 * prototype designed one headline comparison; the real set has up to four — the
 * faithful extension stacks them in the same `.cmp` language, with the signature
 * animated track on the headline percentage). The neighborhood metrics live only
 * in §05 (no metric appears in both).
 */
export function WhyUs({ payload }: { payload: PublicPayload }) {
  const whyUs = payload.whyUs;
  if (!whyUs) return null;

  const { differentiators, marketingApproach, howWeWork, guarantee } = whyUs;
  const stats = whyUs.performanceStats;

  const present = {
    diffs: differentiators.length > 0,
    stats: stats.length > 0,
    mkt: marketingApproach.length > 0,
    work: howWeWork.length > 0,
    guarantee: !!guarantee,
  };
  const firstKey = (
    ["diffs", "stats", "mkt", "work", "guarantee"] as const
  ).find((k) => present[k]);
  const tid = (k: typeof firstKey) =>
    k === firstKey ? { "data-testid": "fs-whyus" } : {};

  // Partition into comparison bars (a market value present) vs single big stats,
  // each indexed separately so the testids are stable (bar-0/1, bigstat-0/1).
  const bars = stats.filter((s) => !!s.marketValue);
  const bigStats = stats.filter((s) => !s.marketValue);
  // headline track rides the first PERCENTAGE comparison (higher-is-better)
  const headlineBar = bars.findIndex((s) =>
    /%/.test(s.yourValue + (s.unit ?? "")),
  );

  return (
    <>
      {present.diffs && (
        <section
          className="section reasons z-offwhite"
          data-testid="fs-whyus-diffs"
          {...tid("diffs")}
        >
          <div className="reveal">
            <div className="eyebrow">
              Why Work With Us <span className="rule" aria-hidden="true" />
            </div>
            <h2 className="head">
              A few reasons to <em>list with us</em>.
            </h2>
          </div>
          <div className="rcards" data-count={differentiators.length}>
            {differentiators.map((d, i) => (
              <div
                className="rcard reveal"
                key={i}
                data-testid={`fs-whyus-diff-${i}`}
              >
                <div className="card-mark">
                  <AutoIcon title={d} />
                </div>
                <div className="rcard__title">{hl(d)}</div>
              </div>
            ))}
          </div>
        </section>
      )}

      {present.stats && (
        <section
          className="section bynum z-ink"
          data-testid="fs-whyus-stats"
          {...tid("stats")}
        >
          <div className="reveal">
            <div className="eyebrow on-dark">
              By The Numbers <span className="rule" aria-hidden="true" />
            </div>
          </div>
          {bars.map((s, i) => (
            <CmpStat
              key={`bar-${i}`}
              stat={s}
              testid={`fs-whyus-bar-${i}`}
              withTrack={i === headlineBar}
            />
          ))}
          {bigStats.map((s, i) => (
            <CmpStat
              key={`big-${i}`}
              stat={s}
              testid={`fs-whyus-bigstat-${i}`}
              withTrack={false}
            />
          ))}
        </section>
      )}

      {present.mkt && (
        <section
          className="section mkt z-sand"
          data-testid="fs-whyus-mkt-sec"
          {...tid("mkt")}
        >
          <div className="reveal">
            <div className="eyebrow">
              How We Market Your Home{" "}
              <span className="rule" aria-hidden="true" />
            </div>
          </div>
          <div className="mcards">
            {marketingApproach.map((m, i) => (
              <div
                className="mcard reveal"
                key={i}
                data-testid={`fs-whyus-mkt-${i}`}
              >
                <div className="card-mark">
                  <AutoIcon title={m.title} body={m.detail} />
                </div>
                <div className="mcard__title">{m.title}</div>
                {m.detail && <p className="mcard__body">{m.detail}</p>}
              </div>
            ))}
          </div>
        </section>
      )}

      {present.work && (
        <section
          className="section work z-mist"
          data-testid="fs-whyus-process"
          {...tid("work")}
        >
          <div className="reveal">
            <div className="eyebrow">
              How We Work <span className="rule" aria-hidden="true" />
            </div>
            <h2 className="head">
              From hello to <em>handed keys</em>.
            </h2>
          </div>
          <div className="flow" data-count={howWeWork.length}>
            {howWeWork.map((s, i) => (
              <div
                className="fstep reveal"
                key={i}
                data-testid={`fs-whyus-step-${i}`}
              >
                <div className="fstep__badge">{i + 1}</div>
                <div className="fstep__title">{s.step}</div>
                {s.detail && <p className="fstep__body">{s.detail}</p>}
              </div>
            ))}
          </div>
        </section>
      )}

      {present.guarantee && guarantee && (
        <section
          className="section z-paper"
          data-testid="fs-whyus-guarantee"
          {...tid("guarantee")}
        >
          <div className="reveal">
            <div className="eyebrow">
              Our Guarantee <span className="rule" aria-hidden="true" />
            </div>
            <p className="lede" style={{ marginTop: 18, maxWidth: "34ch" }}>
              {guarantee}
            </p>
          </div>
        </section>
      )}
    </>
  );
}

/**
 * One us-vs-market stat rendered in the prototype's `.cmp` language. The "you"
 * figure is the rare --mint `.spark`; the market figure is muted. The headline
 * percentage also gets the signature animated track + market tick.
 */
function CmpStat({
  stat,
  testid,
  withTrack,
}: {
  stat: PerformanceStat;
  testid: string;
  withTrack: boolean;
}) {
  const you = splitVal(stat.yourValue, stat.unit);
  const hasMkt = !!stat.marketValue;
  const mkt = hasMkt ? splitVal(stat.marketValue!, stat.unit) : null;

  // percentage track (higher-is-better) — floor a touch below the lower value.
  let fill = 0.5;
  let markPct = 50;
  if (withTrack && mkt) {
    const yv = parseFloat(you.num.replace(/[^0-9.]/g, ""));
    const mv = parseFloat(mkt.num.replace(/[^0-9.]/g, ""));
    if (Number.isFinite(yv) && Number.isFinite(mv)) {
      const lo = Math.min(yv, mv) - Math.max(2, Math.abs(yv - mv) * 1.5);
      const hi = /%/.test(you.unit ?? "") ? 100 : Math.max(yv, mv) + 2;
      const span = Math.max(hi - lo, 0.001);
      fill = Math.min(1, Math.max(0.04, (yv - lo) / span));
      markPct = Math.min(100, Math.max(0, ((mv - lo) / span) * 100));
    }
  }

  return (
    <div
      className="cmp reveal"
      data-testid={testid}
      style={withTrack ? ({ "--fill": fill } as React.CSSProperties) : undefined}
    >
      <div className="cmp__label">{stat.label}</div>
      <div className="cmp__row">
        <div className="cmp__col cmp__col--you">
          <span className="cmp__k">This home</span>
          <span className="cmp__v">
            <span className="spark">{you.num}</span>
            {you.unit && <i>{you.unit}</i>}
          </span>
        </div>
        {mkt && (
          <>
            <div className="cmp__vs">vs</div>
            <div className="cmp__col cmp__col--mkt">
              <span className="cmp__k">Market avg</span>
              <span className="cmp__v">
                {mkt.num}
                {mkt.unit && <i>{mkt.unit}</i>}
              </span>
            </div>
          </>
        )}
      </div>
      {withTrack && mkt && (
        <div className="bynum__track">
          <div
            className="bynum__fill"
            data-testid={`${testid}-you`}
            style={{ "--fill": fill } as React.CSSProperties}
          />
          <div className="bynum__mktmark" style={{ left: `${markPct}%` }}>
            <span>
              {mkt.num}
              {mkt.unit} market avg
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

/** Split "99.4%" → {num:"99.4", unit:"%"}; word unit from `stat.unit`. */
function splitVal(
  value: string,
  unit?: string,
): { num: string; unit?: string } {
  const v = (value ?? "").trim();
  if (v.endsWith("%")) return { num: v.slice(0, -1), unit: "%" };
  const wu = unit && unit.trim() && unit.trim() !== "%" ? unit.trim() : undefined;
  return { num: v, unit: wu };
}

/** Inline-highlight numeric figures in prose ("25 years" → emphasized 25). */
function hl(text: string): React.ReactNode {
  return String(text)
    .split(/(\d[\d,.]*%?)/g)
    .map((p, i) =>
      /\d/.test(p) ? (
        <span className="emph" key={i}>
          {p}
        </span>
      ) : (
        p
      ),
    );
}
