import type {
  PerformanceStat,
  PublicPayload,
} from "../public-payload";
import { AutoIcon, iconSection, matchIcon, type IconName } from "./icons";

/**
 * B0b / D1-PORT / D1-CONSOLIDATE · The agent-constant "why list with us"
 * chapter, ported to the locked prototype's banded beats — collapsed to the
 * TWO card sections the prototype actually has (no standalone pitch grid, no
 * standalone guarantee band):
 *   1. Why work with us  — cream band, elevated WHITE cards w/ auto-icons (.rcard);
 *                          guarantee folded in as the closing line.
 *   2. By the numbers    — DARK beat, ONE big us-vs-market headline (.cmp) + a
 *                          compact supporting row (.bynum / .cmp).
 *   3. How we market     — WARM sand band, prominent auto-icon cards (.mcard).
 *   4. How we work       — COOL mist band, horizontal stepper / mobile timeline (.flow).
 *
 * D1-CONSOLIDATE routing: the per-listing PITCH cards (formerly their own
 * "A quiet, thorough way to sell" grid, which overlapped these two) are routed
 * into the two card sections by their auto-icon THEME — marketing-themed pitch
 * cards join "How we market", service/relationship-themed ones join "Why work
 * with us". A pitch card that duplicates a dedicated card (same icon via the
 * same keyword — e.g. both "photograph" → camera) is dropped in favor of the
 * dedicated card, so no point renders in both sections. Deterministic — no AI,
 * no invented copy.
 *
 * LOCKED SPLIT: "By the numbers" carries the agent's track record across PAST
 * listings (this home hasn't sold), so the comparison reads "My listings" vs
 * "Market" — never "this home". The neighborhood metrics live only in §05.
 */

const MAX_CARDS = 6; // soft cap per card section so the grids don't balloon

type SectionCard = {
  title: string;
  body?: string;
  icon: IconName;
  kw: string | null;
  testid: string;
};

export function WhyUs({ payload }: { payload: PublicPayload }) {
  const whyUs = payload.whyUs;
  // The pitch cards ride on the seller page even when the agent configured no
  // "Why us" package; build a minimal shell so routed pitch cards still render.
  const differentiators = whyUs?.differentiators ?? [];
  const marketingApproach = whyUs?.marketingApproach ?? [];
  const howWeWork = whyUs?.howWeWork ?? [];
  const guarantee = whyUs?.guarantee;
  const stats = whyUs?.performanceStats ?? [];

  // ----- Route the pitch cards into the two destination sections by theme.
  const pitch = payload.pitchPublicCards.map((c, i) => {
    const m = matchIcon(c.title, c.support);
    return {
      title: c.title,
      body: c.support || undefined,
      icon: m.icon,
      kw: m.kw,
      section: iconSection(m.icon),
      idx: i,
    };
  });

  // Dedicated cards first (they always render in their home section), then the
  // routed pitch cards for that section — de-duped against the dedicated set,
  // then capped. A pitch card duplicates a dedicated card when they share an
  // icon AND the keyword that triggered it (same point, said twice).
  const diffCards: SectionCard[] = differentiators.map((d, i) => {
    const m = matchIcon(d);
    return { title: d, icon: m.icon, kw: m.kw, testid: `fs-whyus-diff-${i}` };
  });
  const mktCards: SectionCard[] = marketingApproach.map((m, i) => {
    const mi = matchIcon(m.title, m.detail);
    return {
      title: m.title,
      body: m.detail || undefined,
      icon: mi.icon,
      kw: mi.kw,
      testid: `fs-whyus-mkt-${i}`,
    };
  });

  const routePitch = (target: "service" | "marketing", dedicated: SectionCard[]) => {
    const dupe = (p: { icon: IconName; kw: string | null }) =>
      p.kw !== null &&
      dedicated.some((d) => d.icon === p.icon && d.kw === p.kw);
    return pitch
      .filter((p) => p.section === target && !dupe(p))
      .map<SectionCard>((p) => ({
        title: p.title,
        body: p.body,
        icon: p.icon,
        kw: p.kw,
        testid: `fs-whyus-pitch-${p.idx}`,
      }));
  };

  const serviceCards = [...diffCards, ...routePitch("service", diffCards)].slice(
    0,
    MAX_CARDS,
  );
  const marketCards = [...mktCards, ...routePitch("marketing", mktCards)].slice(
    0,
    MAX_CARDS,
  );

  // Partition the track-record stats: comparison bars (a market value present)
  // vs single numbers. The headline is the first PERCENTAGE comparison (the
  // signature sale-to-list moment); everything else drops to the compact row.
  const bars = stats.filter((s) => !!s.marketValue);
  const bigStats = stats.filter((s) => !s.marketValue);
  const headlineIdx = bars.findIndex((s) =>
    /%/.test(s.yourValue + (s.unit ?? "")),
  );
  const headline =
    headlineIdx >= 0 ? bars[headlineIdx] : bars[0] ?? bigStats[0];
  const supportBars = bars.filter((s) => s !== headline);
  const supportBig = bigStats.filter((s) => s !== headline);

  const present = {
    service: serviceCards.length > 0,
    stats: stats.length > 0,
    market: marketCards.length > 0,
    work: howWeWork.length > 0,
  };
  // The whole chapter hides when nothing renderable survived (flex).
  if (!present.service && !present.stats && !present.market && !present.work) {
    return null;
  }
  const firstKey = (
    ["service", "stats", "market", "work"] as const
  ).find((k) => present[k]);
  const tid = (k: typeof firstKey) =>
    k === firstKey ? { "data-testid": "fs-whyus" } : {};

  return (
    <>
      {present.service && (
        <section
          className="section reasons z-offwhite"
          data-testid="fs-whyus-diffs"
          {...tid("service")}
        >
          <div className="reveal">
            <div className="eyebrow">
              Why Work With Us <span className="rule" aria-hidden="true" />
            </div>
            <h2 className="head">
              A few reasons to <em>list with us</em>.
            </h2>
          </div>
          <div className="rcards" data-count={serviceCards.length}>
            {serviceCards.map((c) => (
              <div className="rcard reveal" key={c.testid} data-testid={c.testid}>
                <div className="card-mark">
                  <AutoIcon name={c.icon} />
                </div>
                <div className="rcard__title">{hl(c.title)}</div>
                {c.body && <p className="rcard__body">{c.body}</p>}
              </div>
            ))}
          </div>
          {guarantee && (
            <p
              className="reasons__guarantee reveal"
              data-testid="fs-whyus-guarantee"
            >
              {guarantee}
            </p>
          )}
        </section>
      )}

      {present.stats && headline && (
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
          <HeadlineStat stat={headline} testid="fs-whyus-bar-0" />
          {(supportBars.length > 0 || supportBig.length > 0) && (
            <div className="bynum__sub reveal">
              {supportBars.map((s, i) => (
                <SubStat
                  key={`bar-${i}`}
                  stat={s}
                  testid={`fs-whyus-bar-${i + 1}`}
                />
              ))}
              {supportBig.map((s, i) => (
                <SubStat
                  key={`big-${i}`}
                  stat={s}
                  testid={`fs-whyus-bigstat-${i}`}
                />
              ))}
            </div>
          )}
        </section>
      )}

      {present.market && (
        <section
          className="section mkt z-sand"
          data-testid="fs-whyus-mkt-sec"
          {...tid("market")}
        >
          <div className="reveal">
            <div className="eyebrow">
              How We Market Your Home{" "}
              <span className="rule" aria-hidden="true" />
            </div>
          </div>
          <div className="mcards">
            {marketCards.map((c) => (
              <div className="mcard reveal" key={c.testid} data-testid={c.testid}>
                <div className="card-mark">
                  <AutoIcon name={c.icon} />
                </div>
                <div className="mcard__title">{c.title}</div>
                {c.body && <p className="mcard__body">{c.body}</p>}
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
    </>
  );
}

/**
 * The signature headline stat — the prototype's big `.cmp` with the animated
 * fill track. The agent figure is the rare --mint `.spark`; the market figure
 * is muted. Labels read "My listings" / "Market" (track record, not this home).
 */
function HeadlineStat({
  stat,
  testid,
}: {
  stat: PerformanceStat;
  testid: string;
}) {
  const you = splitVal(stat.yourValue, stat.unit);
  const hasMkt = !!stat.marketValue;
  const mkt = hasMkt ? splitVal(stat.marketValue!, stat.unit) : null;

  // percentage track (higher-is-better) — floor a touch below the lower value.
  let fill = 0.5;
  let markPct = 50;
  if (mkt) {
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
      style={{ "--fill": fill } as React.CSSProperties}
    >
      <div className="cmp__label">{stat.label}</div>
      <div className="cmp__row">
        <div className="cmp__col cmp__col--you">
          <span className="cmp__k">My listings</span>
          <span className="cmp__v">
            <span className="spark">{you.num}</span>
            {you.unit && <i>{you.unit}</i>}
          </span>
        </div>
        {mkt && (
          <>
            <div className="cmp__vs">vs</div>
            <div className="cmp__col cmp__col--mkt">
              <span className="cmp__k">Market</span>
              <span className="cmp__v">
                {mkt.num}
                {mkt.unit && <i>{mkt.unit}</i>}
              </span>
            </div>
          </>
        )}
      </div>
      {mkt && (
        <div className="bynum__track">
          <div
            className="bynum__fill"
            data-testid={`${testid}-you`}
            style={{ "--fill": fill } as React.CSSProperties}
          />
          <div className="bynum__mktmark" style={{ left: `${markPct}%` }}>
            <span>
              {mkt.num}
              {mkt.unit} market
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * A compact supporting stat beneath the headline. A comparison stat reads
 * "My listings 14 days · Market 27 days"; a standalone stat is just its label +
 * value (no fabricated market column, no "this home").
 */
function SubStat({
  stat,
  testid,
}: {
  stat: PerformanceStat;
  testid: string;
}) {
  const you = splitVal(stat.yourValue, stat.unit);
  const mkt = stat.marketValue ? splitVal(stat.marketValue, stat.unit) : null;
  return (
    <div className="substat reveal" data-testid={testid}>
      <div className="substat__label">{stat.label}</div>
      <div className="substat__v">
        <span className="substat__you">
          {mkt && <span className="substat__k">My listings</span>}
          <span className="spark">{you.num}</span>
          {you.unit && <i>{you.unit}</i>}
        </span>
        {mkt && (
          <span className="substat__mkt">
            <span className="substat__k">Market</span>
            {mkt.num}
            {mkt.unit && <i>{mkt.unit}</i>}
          </span>
        )}
      </div>
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
