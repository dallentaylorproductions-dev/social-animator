import type {
  PerformanceStat,
  PublicPayload,
} from "../public-payload";
import { AutoIcon, iconSection, matchIcon, type IconName } from "./icons";

/**
 * B0b / D1-PORT / D1-CONSOLIDATE / D1-CLEANUP · The agent-constant "why list
 * with us" chapter, shared by the v2 SELLER page (FlagshipPage) and the
 * standalone PRE-LISTING pitch page (PrelistingPage). Two variants:
 *
 *   variant="constant" (DEFAULT — prelisting): the full why-us pitch. Sections:
 *     1. Why work with us  — cream band, the agent's differentiators (.rcard)
 *                            with the guarantee folded in as the closing line.
 *     2. By the numbers    — DARK beat, us-vs-market headline + supporting row.
 *     3. How we market     — WARM sand band, auto-icon cards (.mcard).
 *     4. How we work       — COOL mist band, stepper / timeline (.flow).
 *     Per-listing PITCH cards route into §1/§3 by auto-icon THEME (D1-CONSOLIDATE).
 *
 *   variant="seller" (D1-CLEANUP — the v2 seller page): the redundant "Why work
 *     with us" differentiators wall is DROPPED (it read as a near-twin of "How
 *     we market"; the "why choose me" story is already carried by By-the-numbers,
 *     Reviews, and the Agent block). In its place, the agent's NON-marketing
 *     pitch cards — the authored selling points about THIS home — get their own
 *     "Selling points" section (reusing the .reasons / .rcard treatment, locked
 *     v1 copy), so removing the wall never silently drops authored content.
 *     Marketing-themed pitch cards still join "How we market" (capped at 4). The
 *     guarantee moves to the Agent block. `whyUs.differentiators` and
 *     `whyUs.guarantee` stay in the payload (serializer untouched).
 *
 * De-dup is deterministic (no AI, no invented copy): a pitch card duplicates a
 * dedicated card when they share an icon AND the keyword that triggered it; in
 * the seller variant a selling point that merely restates a How-we-work STEP
 * (e.g. "Negotiation handled in person" vs the "Negotiate and close" step) is
 * the same point twice and drops.
 *
 * LOCKED SPLIT: "By the numbers" carries the agent's track record across PAST
 * listings (this home hasn't sold), so the comparison reads "My listings" vs
 * "Market" — never "this home". The neighborhood metrics live only in §05.
 */

const SERVICE_MAX = 6; // soft cap on the differentiators / selling-points grid
const MARKET_MAX_DEFAULT = 6; // "How we market" cap on the prelisting pitch page
const MARKET_MAX_SELLER = 4; // tighter cap on the seller page (visual balance)

type SectionCard = {
  title: string;
  body?: string;
  icon: IconName;
  kw: string | null;
  testid: string;
};

export function WhyUs({
  payload,
  variant = "constant",
}: {
  payload: PublicPayload;
  /**
   * "constant" = the agent-constant why-us pitch (prelisting): differentiators
   * wall + guarantee, pitch routed by theme into both card sections.
   * "seller" = D1-CLEANUP: differentiators dropped; non-marketing pitch becomes
   * its own "Selling points" section; marketing capped at 4; guarantee moves to
   * the Agent block.
   */
  variant?: "constant" | "seller";
}) {
  const seller = variant === "seller";
  const whyUs = payload.whyUs;
  const differentiators = whyUs?.differentiators ?? [];
  const marketingApproach = whyUs?.marketingApproach ?? [];
  const howWeWork = whyUs?.howWeWork ?? [];
  // The guarantee renders here (constant) or in the Agent block (seller).
  const guarantee = whyUs?.guarantee;
  const stats = whyUs?.performanceStats ?? [];
  // PREVIEW-ONLY honest sample: the wizard live preview keeps the band visible
  // with sample figures before the agent fills their own. Set ONLY by
  // `draftPreviewPayload`; the published payload never carries it, so the tag
  // never renders on a real page (byte-identical).
  const statsAreSample = payload.whyUsStatsSample === true;

  // ----- Route the per-listing pitch cards by their auto-icon theme.
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

  // A pitch card duplicates a dedicated card when they share an icon AND the
  // keyword that triggered it (same point, said twice).
  const dupeAgainst =
    (dedicated: ReadonlyArray<{ icon: IconName; kw: string | null }>) =>
    (p: { icon: IconName; kw: string | null }) =>
      p.kw !== null &&
      dedicated.some((d) => d.icon === p.icon && d.kw === p.kw);

  const routePitch = (
    target: "service" | "marketing",
    skip: (p: { icon: IconName; kw: string | null }) => boolean,
  ): SectionCard[] =>
    pitch
      .filter((p) => p.section === target && !skip(p))
      .map<SectionCard>((p) => ({
        title: p.title,
        body: p.body,
        icon: p.icon,
        kw: p.kw,
        testid: `fs-whyus-pitch-${p.idx}`,
      }));

  // Dedicated marketing items first, then routed marketing pitch cards (de-duped
  // against the dedicated set), then capped — 4 on the seller page, 6 elsewhere.
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
  const marketCards = [
    ...mktCards,
    ...routePitch("marketing", dupeAgainst(mktCards)),
  ].slice(0, seller ? MARKET_MAX_SELLER : MARKET_MAX_DEFAULT);

  // The first cream card section differs by variant:
  //   constant → the differentiators wall + service-themed pitch (de-duped vs
  //              the differentiators), guarantee folded in.
  //   seller   → the authored selling points = non-marketing pitch, de-duped
  //              against the How-we-work steps (a selling point that restates a
  //              process step is redundant).
  const diffCards: SectionCard[] = differentiators.map((d, i) => {
    const m = matchIcon(d);
    return { title: d, icon: m.icon, kw: m.kw, testid: `fs-whyus-diff-${i}` };
  });
  const stepMatches = howWeWork.map((s) => matchIcon(s.step, s.detail));
  const serviceCards: SectionCard[] = seller
    ? routePitch("service", dupeAgainst(stepMatches)).slice(0, SERVICE_MAX)
    : [...diffCards, ...routePitch("service", dupeAgainst(diffCards))].slice(
        0,
        SERVICE_MAX,
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
  // The `fs-whyus` chapter anchor rides the first present section — but only in
  // the constant variant (the seller variant gives each section its own testid
  // so removing the differentiators wall can't clobber `fs-whyus-stats`).
  const firstKey = (
    ["service", "stats", "market", "work"] as const
  ).find((k) => present[k]);
  const tid = (k: typeof firstKey) =>
    !seller && k === firstKey ? { "data-testid": "fs-whyus" } : {};

  return (
    <>
      {present.service &&
        (seller ? (
          <section className="section reasons z-offwhite" data-testid="fs-whyus-selling">
            <div className="reveal">
              <div className="eyebrow">
                What I&apos;ll Do For You{" "}
                <span className="rule" aria-hidden="true" />
              </div>
              <h2 className="head">
                A quiet, <em>thorough</em> way to sell.
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
          </section>
        ) : (
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
        ))}

      {present.stats && headline && (
        <section
          className="section bynum z-ink"
          data-testid="fs-whyus-stats"
          {...tid("stats")}
        >
          <div className="reveal">
            <div className="eyebrow on-dark">
              By The Numbers <span className="rule" aria-hidden="true" />
              {statsAreSample && (
                <span
                  className="bynum__sample"
                  data-testid="fs-whyus-stats-sample"
                >
                  Sample
                </span>
              )}
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
          <div className="mcards" data-count={marketCards.length}>
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
