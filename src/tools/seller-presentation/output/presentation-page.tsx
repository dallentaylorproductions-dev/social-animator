import type { HandoutRecord } from "@/lib/share-urls";
import {
  clampPublicPayload,
  type AgentBranding,
  type PublicComp,
  type PublicPayload,
  type AreaStatsMonthly,
} from "./public-payload";
import { PresentationPageMotion } from "./motion";
import "./presentation-page.css";

/**
 * Seller Presentation — premium consumer-facing page (v1.47 / A7b + A7d.1).
 *
 * Server-rendered React component consumed by /h/[slug]/page.tsx
 * when handout.type === 'seller-presentation'. Reads `handout.data`
 * via `clampPublicPayload` (defense-at-boundary) so unknown KV keys
 * are dropped before the renderer touches them.
 *
 * A7d.1 subtraction: the personal-note, track-record, buyer-quote,
 * and editorial-photo sections were removed entirely (Dallen's
 * 2026-05-22 smoke). What remains is the tighter editorial spine.
 *
 * Graceful states for the optional blocks that survived:
 *   - video null         → video block hidden entirely
 *   - reviews null/empty → reviews block hidden entirely
 *   - reviewsOutlink null → outlink hidden (block still shows)
 *   - areaStats null     → "snapshot coming soon" treatment
 *   - agent.photoUrl null → monogram well in same dimensions
 */

export function SellerPresentationPage({
  handout,
}: {
  handout: HandoutRecord;
}) {
  const payload = clampPublicPayload(handout.data);

  return (
    <main className="sep-presentation" data-testid="seller-presentation-public">
      <article className="page" data-screen-label="Seller Presentation">
        <Hero payload={payload} />
        <CaptionCard payload={payload} />
        <PricePanel payload={payload} />
        <VideoBlock payload={payload} />
        <WhyPriceSection payload={payload} />
        <PitchSection payload={payload} />
        <ReviewsSection payload={payload} />
        <AreaSection payload={payload} />
        <AgentSection payload={payload} />
        <EndMark />
        <Foot payload={payload} />
      </article>
      <PresentationPageMotion />
    </main>
  );
}

// =====================================================================
// HERO + CAPTION
// =====================================================================

function Hero({ payload }: { payload: PublicPayload }) {
  const hero = payload.property.heroPhotoUrl;
  const preparedFor = payload.preparedFor?.trim();
  const headerLabel = preparedFor
    ? `Prepared for ${preparedFor}`
    : "A presentation for your home";

  return (
    <header className="hero" data-testid="sep-hero">
      <div
        className={`hero-photo${hero ? "" : " monogram"}`}
        aria-hidden="true"
        style={
          hero
            ? {
                backgroundImage: `url("${hero.replace(/"/g, '\\"')}")`,
              }
            : undefined
        }
      />
      <div className="appbar">
        <div className="prepared">{headerLabel}</div>
        <button
          type="button"
          className="share"
          data-share
          aria-label="Share this page"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M4 12v7a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-7" />
            <path d="M16 6l-4-4-4 4" />
            <path d="M12 2v13" />
          </svg>
        </button>
      </div>
    </header>
  );
}

function CaptionCard({ payload }: { payload: PublicPayload }) {
  const { property, preparedFor } = payload;
  const addressLine = property.address || "Your home";
  // Pull a graceful "city, state ZIP" line from whatever we have.
  const locationLine = [
    property.city,
    [property.state, property.zip].filter((v) => v?.trim()).join("  "),
  ]
    .filter((v) => v?.trim())
    .join(", ");
  const kicker = preparedFor
    ? `A Recommendation · ${property.city ?? "Your home"}`
    : "A Recommendation";

  return (
    <div className="caption-wrap">
      <div className="caption-card" data-testid="sep-caption-card">
        {preparedFor && (
          <div className="for" data-testid="sep-prepared-for">
            For {preparedFor}
          </div>
        )}
        <div className="kicker">{kicker}</div>
        <h1 className="addr">{addressLine}</h1>
        {locationLine && <div className="city">{locationLine}</div>}
      </div>
    </div>
  );
}

// =====================================================================
// PRICE PANEL — hero value moment
// =====================================================================

function PricePanel({ payload }: { payload: PublicPayload }) {
  const recommended = payload.property.recommendedList || payload.recommendedPrice;
  const rationale = payload.property.rationaleShort;
  // A7c.8: gate the scroll-triggered count-up to clean integer dollar
  // amounts (e.g. "$675,000"). Fancy inputs like "$675k", "Call for
  // price", or decimals fall through to the static SSR render — the
  // count-up enhancement is opt-in via the data-attributes below.
  const cleanInteger = /^\$?\s*\d{1,3}(?:,\d{3})*$/.test((recommended ?? "").trim());
  const finalNumeric = cleanInteger ? parsePriceToNumber(recommended) : null;
  // Need >= 100 so the start floor (10^(digits-1)) is strictly below
  // the final — otherwise the climb has zero range and is a no-op.
  const countupAttrs =
    finalNumeric !== null && finalNumeric >= 100
      ? {
          "data-price-countup": "",
          "data-price-final": String(Math.floor(finalNumeric)),
        }
      : {};
  return (
    <section className="price-panel" data-testid="sep-price-panel">
      <div className="lbl">Recommended list</div>
      <div className="price" {...countupAttrs}>
        <PriceDisplay value={recommended} />
      </div>
      {rationale && <p className="rationale">{rationale}</p>}
    </section>
  );
}

/**
 * Split a formatted price like "$675,000" into the locked-design
 * shape: small brick dollar sign + large ink digits with a muted
 * comma separator. Falls back to the raw string when the format
 * doesn't match (e.g. "Call for price").
 *
 * The digit groups are wrapped in a [data-price-digits] span so the
 * A7c.8 count-up enhancement can mutate just the digits without
 * touching the brick "$" or any trailing suffix.
 */
function PriceDisplay({ value }: { value: string }) {
  const raw = (value ?? "").trim();
  if (!raw) return <span>—</span>;
  // Match "$675,000", "$1,234,567", "$675K" (or no $ prefix).
  const match = raw.match(/^\$?\s*(\d{1,3}(?:,\d{3})*(?:\.\d+)?)(.*)$/);
  if (!match) {
    return <span>{raw}</span>;
  }
  const [, digits, tail] = match;
  const parts = digits.split(",");
  return (
    <>
      <span className="dollar">$</span>
      <span data-price-digits>
        {parts.map((part, i) => (
          <span key={i}>
            {i > 0 && <span className="sep">,</span>}
            {part}
          </span>
        ))}
      </span>
      {tail && <span>{tail}</span>}
    </>
  );
}

// =====================================================================
// VIDEO BLOCK (optional)
// =====================================================================

function VideoBlock({ payload }: { payload: PublicPayload }) {
  const v = payload.video;
  if (!v || !v.videoUrl) return null;

  return (
    <section className="video-block" data-testid="sep-video">
      <div className="sec-label reveal">
        <span className="num">01</span>
        <span className="lbl" />
        <span className="name">
          {v.title ? "A short note from your agent" : "A short note"}
        </span>
      </div>
      <h2 className="sec-title reveal">
        Two <em>minutes,</em> on your home.
      </h2>
      {/* A7d.3: inline playback.
          - `playsInline` — required so iOS Safari doesn't force
            fullscreen the moment the buyer hits play.
          - `preload="metadata"` — fetch only the moov atom on page
            load. The actual stream doesn't pull until play; protects
            bandwidth for the 99% of visits that won't tap play.
          - `poster={v.posterUrl}` — the thumbnail uploaded in the
            wizard. Renders inside the same .video-poster geometry
            (aspect-ratio 4/5 + min-height floor) so the block
            doesn't collapse before the poster loads.
          - `controls` — native browser chrome (play / scrub / mute).
            Keeps the implementation framework-free and accessible. */}
      <div className="video-poster reveal" data-testid="sep-video-player">
        <video
          className="video-player"
          src={v.videoUrl}
          poster={v.posterUrl}
          controls
          playsInline
          preload="metadata"
          aria-label={v.title ?? "Walk-through video"}
          data-testid="sep-video-el"
        />
        {(v.title || v.runtime || v.recordedOn) && (
          <span className="meta">
            {v.title && <span className="ttl">{v.title}</span>}
            {(v.runtime || v.recordedOn) && (
              <span className="runtime">
                {[v.runtime, v.recordedOn].filter(Boolean).join(" · ")}
              </span>
            )}
          </span>
        )}
      </div>
    </section>
  );
}

// =====================================================================
// WHY THIS PRICE
// =====================================================================

function WhyPriceSection({ payload }: { payload: PublicPayload }) {
  const { whyPrice } = payload;
  const rationale = whyPrice.publicRationale?.trim();
  const comps = whyPrice.comps;
  // Hide the block when both rationale AND comps are empty.
  if (!rationale && comps.length === 0) return null;

  return (
    <section className="block paper" data-testid="sep-why-price">
      <div className="sec-label reveal">
        <span className="num">02</span>
        <span className="lbl" />
        <span className="name">Why this price</span>
      </div>
      <h2 className="sec-title reveal">
        A confident, <em>defensible</em> number.
      </h2>
      {rationale && (
        <p className="sec-body drop-cap reveal">{rationale}</p>
      )}
      {comps.length > 0 && (
        <div className="comps">
          {comps.map((c, i) => (
            <CompRow key={i} comp={c} index={i} />
          ))}
        </div>
      )}
      <div className="comps-note reveal">Source · Public record</div>
    </section>
  );
}

function CompRow({ comp, index }: { comp: PublicComp; index: number }) {
  const indexLabel = String(index + 1).padStart(2, "0");
  const subline = [comp.soldDate, comp.sqft ? `${comp.sqft} sqft` : null]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="comp reveal" data-testid={`sep-comp-${index}`}>
      <div className="idx">{indexLabel}</div>
      <div className="addr">
        {comp.address || "—"}
        {subline && <small>{subline}</small>}
      </div>
      <div className="sold">
        {comp.soldPrice || "—"}
        <small>Closed</small>
      </div>
    </div>
  );
}

// =====================================================================
// PITCH POINTS
// =====================================================================

function PitchSection({ payload }: { payload: PublicPayload }) {
  const cards = payload.pitchPublicCards;
  if (cards.length === 0) return null;

  return (
    <section className="pitch" data-testid="sep-pitch">
      <div className="sec-label reveal">
        <span className="num">03</span>
        <span className="lbl" />
        <span className="name">What I&apos;ll do for you</span>
      </div>
      <h2 className="sec-title reveal">
        A quiet, <em>thorough</em> way to sell.
      </h2>
      <div className="pitches">
        {cards.map((card, i) => (
          <div className="pp reveal" key={i} data-testid={`sep-pp-${i}`}>
            <div className="n">
              <em>{i + 1}.</em>
            </div>
            <div className="t">
              {card.title}
              {card.support && <small>{card.support}</small>}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

// =====================================================================
// REVIEWS (optional)
// =====================================================================

function ReviewsSection({ payload }: { payload: PublicPayload }) {
  const reviews = payload.reviews ?? [];
  if (reviews.length === 0) return null;

  return (
    <section className="reviews" data-testid="sep-reviews">
      <div className="sec-label reveal">
        <span className="num">04</span>
        <span className="lbl" />
        <span className="name">In their words</span>
      </div>
      <h2 className="sec-title reveal">
        From families <em>like yours.</em>
      </h2>

      <div className="reviews-list">
        {reviews.map((r, i) => (
          <article className="review reveal" key={i}>
            <div className="qm">&ldquo;</div>
            <div>
              <p className="rv-body">{r.body}</p>
              <div className="att">
                <span className="nm">{r.attributionName}</span>
                {(r.attributionStreet || r.attributionYear) && (
                  <span>
                    {" "}
                    ·{" "}
                    {[
                      r.attributionStreet && `Sold on ${r.attributionStreet}`,
                      r.attributionYear,
                    ]
                      .filter(Boolean)
                      .join(", ")}
                  </span>
                )}
              </div>
            </div>
          </article>
        ))}
      </div>

      {payload.reviewsOutlink && (
        <a
          className="reviews-outlink reveal"
          href={payload.reviewsOutlink.url}
          target="_blank"
          rel="noopener noreferrer"
        >
          {payload.reviewsOutlink.label}
        </a>
      )}
    </section>
  );
}

// =====================================================================
// AREA SALES + CHART
// =====================================================================

function AreaSection({ payload }: { payload: PublicPayload }) {
  const stats = payload.areaStats;
  // No areaStats at all → "coming soon" empty treatment. We still
  // render the section so the editorial rhythm doesn't break.
  const isEmpty = !stats;
  return (
    <section
      className={isEmpty ? "area area--empty" : "area"}
      data-testid="sep-area"
    >
      <div className="area-head">
        <div className="sec-label reveal" style={{ marginBottom: 0 }}>
          <span className="num">05</span>
          <span className="lbl" />
          <span className="name">Recent area sales</span>
        </div>
      </div>
      <h2 className="sec-title reveal" style={{ marginBottom: 28 }}>
        A neighborhood that <em>moves.</em>
      </h2>

      {stats && (
        <>
          <AreaStats stats={stats} />
          <AreaChart
            series={stats.monthlySeries}
            recommended={payload.property.recommendedList || payload.recommendedPrice}
          />
        </>
      )}

      <div className="area-empty" aria-hidden={!isEmpty}>
        <div className="icon">
          <svg
            width="12"
            height="12"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth="1.6"
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M3 17l6-6 4 4 8-8" />
            <path d="M17 7h4v4" />
          </svg>
        </div>
        <div className="h">A market snapshot is on the way.</div>
        <div className="p">
          We&apos;re cross-checking the freshest closings before showing them
          here. You&apos;ll see this section update within a few days.
        </div>
      </div>
    </section>
  );
}

function AreaStats({ stats }: { stats: NonNullable<PublicPayload["areaStats"]> }) {
  // Render a 2x2 grid of the four most-load-bearing stats. Each cell
  // is optional individually — render only the present ones, padding
  // empty cells if needed isn't necessary (CSS grid handles it).
  const cells: Array<{ label: string; value: string; ctx?: string }> = [];
  if (stats.medianSale)
    cells.push({
      label: "Median sale · 90 days",
      value: stats.medianSale,
      ctx: stats.medianSaleDeltaYoy,
    });
  if (stats.daysOnMarket)
    cells.push({
      label: "Days on market",
      value: stats.daysOnMarket,
      ctx: stats.daysOnMarketZipAvg,
    });
  if (stats.closings90d)
    cells.push({
      label: "Closings · 90 days",
      value: stats.closings90d,
    });
  if (stats.listToSaleRatio)
    cells.push({
      label: "List-to-sale ratio",
      value: stats.listToSaleRatio,
    });
  if (cells.length === 0) return null;

  return (
    <div className="area-stats">
      {cells.map((c, i) => (
        <div className="as reveal" key={i}>
          <div className="l">{c.label}</div>
          <div className="v">{c.value}</div>
          {c.ctx && <div className="ctx">{c.ctx}</div>}
        </div>
      ))}
    </div>
  );
}

/**
 * Data-driven port of the locked design's 12-point area chart.
 * Computes the SVG path + circle positions from `monthlySeries`
 * (1–12 entries). Y-axis auto-scales to the data range.
 *
 * Graceful: if series is missing or empty, render nothing — the
 * area-stats block above already conveys the snapshot.
 */
function AreaChart({
  series,
  recommended,
}: {
  series?: AreaStatsMonthly[];
  recommended: string;
}) {
  if (!series || series.length === 0) return null;

  // Parse "$642,000" / "$642k" / "642000" → a numeric for scaling.
  const parsed = series
    .map((m) => parsePriceToNumber(m.medianPrice))
    .filter((n): n is number => n !== null);
  if (parsed.length === 0) return null;

  const min = Math.min(...parsed);
  const max = Math.max(...parsed);
  const range = Math.max(max - min, 1);

  // Plot area (viewBox 400x234 — match the locked design exactly).
  const X0 = 40;
  const X1 = 388;
  const Y_TOP = 104;
  const Y_BOTTOM = 184;
  const plotHeight = Y_BOTTOM - Y_TOP;

  const points = series.map((m, i) => {
    const n = parsePriceToNumber(m.medianPrice) ?? min;
    const x =
      series.length === 1
        ? (X0 + X1) / 2
        : X0 + ((X1 - X0) * i) / (series.length - 1);
    const y = Y_BOTTOM - ((n - min) / range) * (plotHeight - 6);
    return { x, y, month: m.month, value: n };
  });

  const lineD = points
    .map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)} ${p.y.toFixed(1)}`)
    .join(" ");
  const areaD = `${lineD} L${points[points.length - 1].x.toFixed(1)} ${Y_BOTTOM} L${points[0].x.toFixed(1)} ${Y_BOTTOM} Z`;

  const yLabels = [
    {
      y: 107,
      label: formatCompact(min + (range * 5) / 6),
    },
    { y: 137, label: formatCompact(min + range / 2) },
    { y: 167, label: formatCompact(min) },
  ];

  // Tick labels: first / a middle / a later / last when ≥4 points.
  const ticks =
    series.length >= 4
      ? [
          { index: 0, anchor: "start" as const },
          {
            index: Math.floor(series.length / 3),
            anchor: "middle" as const,
          },
          {
            index: Math.floor((series.length * 2) / 3),
            anchor: "middle" as const,
          },
          { index: series.length - 1, anchor: "end" as const },
        ]
      : series.map((_, i) => ({
          index: i,
          anchor: (i === 0
            ? "start"
            : i === series.length - 1
              ? "end"
              : "middle") as "start" | "middle" | "end",
        }));

  const current = points[points.length - 1];
  const recommendedNumeric = parsePriceToNumber(recommended);
  const recommendedY =
    recommendedNumeric !== null
      ? Y_BOTTOM - ((recommendedNumeric - min) / range) * (plotHeight - 6)
      : 24;
  // Clamp the recommended-line y to a visible band (don't render off-canvas).
  const recLineY = Math.max(20, Math.min(recommendedY, Y_BOTTOM - 4));

  return (
    <div className="chart-wrap reveal">
      <div className="chart-head">
        <div className="l">
          <strong>Median sale price</strong>
          {series.length} months
        </div>
      </div>
      <svg
        className="chart"
        viewBox="0 0 400 234"
        role="img"
        aria-label="Median sale price trend"
        preserveAspectRatio="none"
      >
        <defs>
          <linearGradient id="sepChartFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#3F6C8E" stopOpacity="0.30" />
            <stop offset="55%" stopColor="#3F6C8E" stopOpacity="0.10" />
            <stop offset="100%" stopColor="#3F6C8E" stopOpacity="0" />
          </linearGradient>
        </defs>

        {recommended && (
          <>
            <line
              className="rec-line"
              x1={X0}
              x2={X1}
              y1={recLineY}
              y2={recLineY}
            />
            <text className="rec-tag-text" x={X0} y={recLineY - 9}>
              Recommended
            </text>
            <text
              className="rec-tag-num"
              x={X1}
              y={recLineY - 7}
              textAnchor="end"
            >
              {formatCompact(recommendedNumeric ?? max)}
            </text>
          </>
        )}

        <text className="callout-sub" x={X1} y={52} textAnchor="end">
          {current.month} · current
        </text>
        <text className="callout-text" x={X1} y={86} textAnchor="end">
          {formatCompact(current.value)}
        </text>

        <g>
          <line className="gridline" x1={X0} x2={X1} y1={104} y2={104} />
          <line className="gridline" x1={X0} x2={X1} y1={134} y2={134} />
          <line className="gridline" x1={X0} x2={X1} y1={164} y2={164} />
          <line className="baseline" x1={X0} x2={X1} y1={184} y2={184} />
        </g>
        <g>
          {yLabels.map((y, i) => (
            <text key={i} className="y-label" x={4} y={y.y}>
              {y.label}
            </text>
          ))}
        </g>

        <g className="line-group">
          <path className="area-fill" d={areaD} />
          <path className="line-stroke" pathLength={600} d={lineD} />
          {points.slice(0, -1).map((p, i) => (
            <circle
              key={i}
              className="point"
              cx={p.x}
              cy={p.y}
              r={2.8}
            />
          ))}
          {points.length > 0 && (
            <>
              <circle
                className="point-current-pulse"
                cx={current.x}
                cy={current.y}
                r={5}
              />
              <circle
                className="point-current-pulse delay"
                cx={current.x}
                cy={current.y}
                r={5}
              />
              <circle
                className="point-current-ring"
                cx={current.x}
                cy={current.y}
                r={11}
              />
              <circle
                className="point-current"
                cx={current.x}
                cy={current.y}
                r={5}
              />
            </>
          )}
        </g>

        <g>
          {ticks.map((t, i) => {
            const p = points[t.index];
            return (
              <text
                key={i}
                className="x-label"
                x={p.x}
                y={204}
                textAnchor={t.anchor}
              >
                {p.month}
              </text>
            );
          })}
        </g>
      </svg>
    </div>
  );
}

/** Parse a price string like "$642,000" or "642000" into a number. */
function parsePriceToNumber(v: string | undefined): number | null {
  if (!v) return null;
  const stripped = v.replace(/[^0-9.kKmM]/g, "");
  if (!stripped) return null;
  const lower = stripped.toLowerCase();
  if (lower.endsWith("k")) {
    const n = parseFloat(lower.slice(0, -1));
    return Number.isFinite(n) ? n * 1000 : null;
  }
  if (lower.endsWith("m")) {
    const n = parseFloat(lower.slice(0, -1));
    return Number.isFinite(n) ? n * 1_000_000 : null;
  }
  const n = parseFloat(stripped);
  return Number.isFinite(n) ? n : null;
}

/** "642000" → "$642k", "1,200,000" → "$1.2m". */
function formatCompact(n: number): string {
  if (!Number.isFinite(n)) return "—";
  if (n >= 1_000_000) {
    return `$${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}m`;
  }
  if (n >= 1_000) {
    return `$${Math.round(n / 1_000)}k`;
  }
  return `$${Math.round(n)}`;
}

// =====================================================================
// AGENT — DARK CHAPTER
// =====================================================================

function AgentSection({ payload }: { payload: PublicPayload }) {
  const a = payload.agent;
  if (!a.name?.trim()) return null;

  const monogram = a.name
    .split(/\s+/)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <section className="agent" data-testid="sep-agent">
      <div className="sec-label reveal">
        <span className="num">06</span>
        <span className="lbl" />
        <span className="name">Your agent</span>
      </div>
      <h2 className="sec-title reveal">{a.name}.</h2>

      <div className="agent-card reveal">
        <div
          className={`agent-photo${a.photoUrl ? "" : " agent-photo--monogram"}`}
          data-monogram={monogram}
          style={
            a.photoUrl
              ? {
                  backgroundImage: `url("${a.photoUrl.replace(/"/g, '\\"')}")`,
                }
              : undefined
          }
        >
          <div className="verify" aria-label="Verified agent">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M5 12l4 4 10-10" />
            </svg>
          </div>
        </div>
        <div>
          <div className="agent-name">{a.name}</div>
          {(a.brokerage || a.areasServed) && (
            <div className="agent-role">
              {a.brokerage}
              {a.brokerage && a.areasServed && <br />}
              {a.areasServed && <em>{a.areasServed}</em>}
            </div>
          )}
        </div>
      </div>

      {a.bioShort && <p className="agent-bio reveal">&ldquo;{a.bioShort}&rdquo;</p>}

      <AgentMeta agent={a} />
      <AgentCtas agent={a} />
    </section>
  );
}

function AgentMeta({ agent }: { agent: AgentBranding }) {
  const cells: Array<{ label: string; value: string; mono?: boolean }> = [];
  if (agent.phone)
    cells.push({ label: "Direct", value: formatPhoneDisplay(agent.phone), mono: true });
  if (agent.email) cells.push({ label: "Email", value: agent.email, mono: true });
  if (agent.licenseNumber)
    cells.push({ label: "License", value: agent.licenseNumber, mono: true });
  if (agent.yearsInArea)
    cells.push({ label: "Years here", value: agent.yearsInArea });
  if (cells.length === 0) return null;
  return (
    <div className="agent-meta">
      {cells.map((c, i) => (
        <div className="am reveal" key={i}>
          <div className="l">{c.label}</div>
          <div className={c.mono ? "v mono" : "v"}>{c.value}</div>
        </div>
      ))}
    </div>
  );
}

function AgentCtas({ agent }: { agent: AgentBranding }) {
  const phone = agent.phone?.replace(/[^0-9+]/g, "");
  const email = agent.email;
  if (!phone && !email) return null;
  return (
    <div className="agent-ctas">
      {email && (
        <a
          href={`mailto:${email}?subject=${encodeURIComponent("Listing call")}`}
          className="cta primary reveal"
        >
          <span>Schedule a listing call</span>
          <span className="ar">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M5 12h14M13 6l6 6-6 6" />
            </svg>
          </span>
        </a>
      )}
      {agent.ctaReassurance && (
        <div className="cta-reassure">{agent.ctaReassurance}</div>
      )}
      {phone && (
        <a href={`tel:${phone}`} className="cta outline reveal">
          <span>
            Call {agent.name?.split(/\s+/)[0] ?? "the agent"} directly
          </span>
          <span className="ar">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.79 19.79 0 0 1 2.12 4.18 2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z" />
            </svg>
          </span>
        </a>
      )}
    </div>
  );
}

function formatPhoneDisplay(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 10) {
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)} · ${digits.slice(6)}`;
  }
  return raw;
}

// =====================================================================
// END MARK + FOOTER
// =====================================================================

function EndMark() {
  return (
    <div className="end-mark">
      <span className="rule" />
      <span className="dot" aria-hidden="true" />
      <span className="rule" />
    </div>
  );
}

function Foot({ payload }: { payload: PublicPayload }) {
  const preparedFor = payload.preparedFor?.trim();
  const disclaimer = preparedFor
    ? `Prepared privately for ${preparedFor}. The information above is drawn from public record. This page is not an advertisement and does not constitute an offer.`
    : "The information above is drawn from public record. This page is not an advertisement and does not constitute an offer.";

  return (
    <footer className="foot">
      <div className="row">
        <div className="brand">
          <div className="glyph">S</div>
          <div className="wm">
            Studio <em>SEP</em>
          </div>
        </div>
      </div>
      <div className="small">{disclaimer}</div>
    </footer>
  );
}
