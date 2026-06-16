import type { CSSProperties } from "react";
import type { PublicPayload } from "../public-payload";
import {
  streetViewStaticUrl,
  STREET_VIEW_IMG_SIZE,
  STREET_VIEW_FOV,
  STREET_VIEW_PITCH,
} from "@/lib/seller-presentation/street-view";
import { compHasPhoto } from "@/lib/seller-presentation/rentcast-autofill";
import { CompPhotoPlaceholder } from "./CompPhotoPlaceholder";
import { ProofPanel } from "./ProofPanel";
import { credibilityStat } from "./credibility-stat";
import {
  PROOF_NEIGHBORHOOD_CAPTION,
  PROOF_NEIGHBORHOOD_LABEL,
} from "./state-a-copy";

/**
 * Seller State A · Signature A.2 - the Appointment Brief (the flagship moment).
 *
 * A curated FILE, not dashboard widgets: a header strip ("APPOINTMENT BRIEF" +
 * the agent's initials + the prepared date) over three evidence artifacts that
 * each prove preparation by showing the work, never by claiming it. Every
 * artifact flexes out when its backing data is absent, and the whole file
 * flexes out when none of the three are backed (no hollow item, no empty file):
 *
 *   1. Nearby sales reviewed - compact mini property cards (Street View thumb +
 *      street name + a SOLD tag). NO prices, no analysis (that is State B).
 *   2. Neighborhood activity - an editorial row: a mini sparkline of the area
 *      trend + a calm serif line ("Up about 6% this year.").
 *   3. Launch strategy - a sharp margin note (not a card).
 *
 * Reuses the comp + Street View data and the area-chart series the revealed
 * page already carries; invents only the file framing.
 */
export function AppointmentBrief({
  payload,
  preparedAt,
}: {
  payload: PublicPayload;
  /** HandoutRecord.createdAt (ISO) - the truthful, republish-stable prepared date. */
  preparedAt?: string;
}) {
  // Source the comps from whyPrice.comps (NOT the top-level payload.comps): the
  // Street View aiming data the flagship CompCard renders - pano id, heading,
  // hasStreetView - lives ONLY on whyPrice.comps. Reading payload.comps would
  // give addresses with no pano, so the thumbnails would never resolve.
  //
  // THE PHOTO IS THE EVIDENCE: render only comps that actually have a photo
  // (agent upload or resolved Street View). A comp with no photo would be an
  // empty frame - which reads as unfinished - so it does not earn a slot in the
  // seller-facing brief. The set was already photographed-first at authoring
  // time; this filter is the render-time guarantee that no blank ever ships,
  // and it flexes gracefully (shows what is available) when fewer than four
  // resolved.
  const comps = payload.whyPrice.comps
    .filter((c) => compHasPhoto(c))
    .slice(0, 4);
  const hasNearby = comps.length > 0;

  // Keep the month label paired with each parseable price, so the sparkline's
  // axis endpoints stay aligned with the points it actually draws.
  const points = (payload.areaStats?.monthlySeries ?? [])
    .map((m) => ({ month: m.month?.trim() || "", price: parseNum(m.medianPrice) }))
    .filter((p): p is { month: string; price: number } => p.price != null);
  const series = points.map((p) => p.price);
  const months = points.map((p) => p.month);
  const hasSpark = series.length >= 2;
  const activityLine = neighborhoodActivityLine(payload, series);
  // The coordinated `+X%` MARKET proof number: the agent-stamped trailing-12-month
  // YoY delta (the same source the activity line prefers), formatted as a number.
  const delta = trendDeltaPercent(payload);
  const deltaLabel =
    delta != null ? `${delta >= 0 ? "+" : "-"}${Math.round(Math.abs(delta))}%` : null;
  // v1.5x — the AGENT track-record stat (e.g. 101.3% sale-to-list), relocated
  // here from the trust strip so the two proofs (market trend over agent record)
  // read as one stacked block beside the chart. Reads the same existing payload
  // field; flexes out when unbacked.
  const stat = credibilityStat(payload);
  const hasProofs = !!deltaLabel || !!stat;
  const hasActivity = hasSpark || !!activityLine;

  const hasLaunch = (payload.whyUs?.marketingApproach?.length ?? 0) > 0;

  if (!hasNearby && !hasActivity && !hasLaunch) return null;

  const initials = agentInitials(payload.agent.name);
  const prepared = formatPreparedDate(preparedAt);

  return (
    <section className="section sa-brief z-paper" data-testid="fs-sa-brief">
      <div className="sa-brief__file reveal">
        <div className="sa-brief__strip">
          <span className="sa-brief__strip-title">Appointment Brief</span>
          {(initials || prepared) && (
            <span className="sa-brief__strip-meta">
              {[initials, prepared ? `Prepared ${prepared}` : null]
                .filter(Boolean)
                .join(" · ")}
            </span>
          )}
        </div>
        <p className="sa-brief__lede">
          What I have already pulled together before we meet.
        </p>

        {/* GUARDRAIL: exactly three artifacts - nearby sales, neighborhood
            activity, launch strategy. Do NOT add a fourth/fifth: more tips this
            from a concierge brief into a dashboard. */}
        {hasNearby && (
          <div className="sa-brief__art" data-testid="fs-sa-brief-nearby">
            <div className="sa-brief__art-head">
              <span className="sa-brief__art-k">Nearby sales reviewed</span>
            </div>
            <div className="sa-brief__sales">
              {comps.map((c, i) => {
                const sv = c.hasStreetView
                  ? streetViewStaticUrl(c.streetViewPanoId, {
                      size: STREET_VIEW_IMG_SIZE,
                      heading: c.streetViewHeading,
                      fov: STREET_VIEW_FOV,
                      pitch: STREET_VIEW_PITCH,
                    })
                  : null;
                const photo = c.photoUrl?.trim() || sv;
                return (
                  <div
                    className="sa-sale"
                    key={i}
                    data-testid={`fs-sa-brief-sale-${i}`}
                  >
                    <div className="sa-sale__photo">
                      {photo ? (
                        c.photoUrl?.trim() ? (
                          <span
                            className="sa-sale__img"
                            aria-hidden="true"
                            style={{
                              backgroundImage: `url("${photo.replace(/"/g, '\\"')}")`,
                            }}
                          />
                        ) : (
                          /* eslint-disable-next-line @next/next/no-img-element -- fetched fresh from Google in the buyer's browser, never proxied or stored (same compliance path as the flagship comp card) */
                          <img
                            src={photo}
                            alt=""
                            aria-hidden="true"
                            loading="lazy"
                            decoding="async"
                            data-testid={`fs-sa-brief-sale-${i}-streetview`}
                          />
                        )
                      ) : (
                        // Defensive: the set is filtered to photographed comps,
                        // so this only fires if a pano resolved but its image
                        // URL can't be built (e.g. missing browser key). Never a
                        // blank box.
                        <CompPhotoPlaceholder />
                      )}
                      <span className="sa-sale__tag" aria-hidden="true">
                        Sold
                      </span>
                    </div>
                    <div className="sa-sale__addr">{c.address || "Nearby"}</div>
                  </div>
                );
              })}
            </div>
            <p className="sa-brief__cap">
              {capitalize(countWord(comps.length))} recent{" "}
              {comps.length === 1 ? "closing" : "closings"} within a few blocks
              of you.
            </p>
          </div>
        )}

        {hasActivity && (
          <div className="sa-brief__art" data-testid="fs-sa-brief-activity">
            <div className="sa-brief__art-head">
              <span className="sa-brief__art-k">Neighborhood activity</span>
            </div>
            {/* The fuller neighborhood chart (the §05 chart vocabulary — light
                gridlines, a $k y-axis, month x-labels, a subtle teal area fill,
                and the current-point halo) over the calm serif takeaway, paired
                with a STACKED two-stat proof column: the market `+X%` trend over
                the agent's relocated track-record figure, both in the one shared
                proof treatment. FLEX-OUT: neither stat backed -> the column drops
                and the chart panel runs full-width (sa-trend--solo). */}
            <div className={`sa-trend${hasProofs ? "" : " sa-trend--solo"}`}>
              <div className="sa-trend__panel">
                {hasSpark && (
                  <AreaTrendChart series={series} months={months} />
                )}
                {activityLine && (
                  <p className="sa-brief__activity-line">{activityLine}</p>
                )}
              </div>
              {hasProofs && (
                <div className="sa-trend__proofs">
                  {deltaLabel && (
                    <ProofPanel
                      variant="light"
                      label={PROOF_NEIGHBORHOOD_LABEL}
                      caption={PROOF_NEIGHBORHOOD_CAPTION}
                      testid="fs-sa-proof-z2"
                    >
                      {deltaLabel}
                    </ProofPanel>
                  )}
                  {stat && (
                    <ProofPanel
                      variant="light"
                      label={stat.label}
                      testid="fs-sa-credibility"
                    >
                      {stat.value}
                    </ProofPanel>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {hasLaunch && (
          <div
            className="sa-brief__art sa-brief__art--note"
            data-testid="fs-sa-brief-launch"
          >
            <span className="sa-brief__note-k" aria-hidden="true">
              Launch strategy
            </span>
            <p className="sa-brief__note">
              Built around first-week momentum, buyer visibility, and the
              strongest features buyers notice first.
            </p>
          </div>
        )}

        <p className="sa-brief__close">
          I like to understand the market first, so our walkthrough can focus on
          what actually shapes your value.
        </p>
      </div>
    </section>
  );
}

/**
 * The fuller neighborhood-trend chart (v1.5x). Borrows the page's own §05
 * AreaChart vocabulary — light gridlines, a $k y-axis, month x-labels, a subtle
 * teal area fill, and a current-point halo — so the trend reads as real DATA, not
 * a hand-drawn line, while staying a calm 1:1-page chart (hairline grid, muted
 * labels, low-opacity fill — no dashboard noise). It plots the SAME real
 * `monthlySeries` median values the axis-less sparkline did; the y-axis shows the
 * neighborhood median PRICE (public market data, never the subject home's number).
 *
 * The line keeps the existing `.sa-spark__line` draw-on (state-a.css): undrawn
 * until the brief's `.reveal` enters, then the dash retracts; `--len` is the
 * polyline length, computed SSR-stable here. Reduced motion lands it drawn.
 */
function AreaTrendChart({
  series,
  months,
}: {
  series: number[];
  months: string[];
}) {
  const W = 420,
    H = 210,
    padL = 46,
    padR = 14,
    padT = 18,
    padB = 30;
  const minV = Math.min(...series);
  const maxV = Math.max(...series);
  // Breathing room above/below the series so the line never kisses the edges.
  const pad = (maxV - minV) * 0.12 || maxV * 0.04 || 1;
  const min = minV - pad;
  const max = maxV + pad;
  const span = max - min || 1;
  const lastI = series.length - 1;
  const x = (i: number) =>
    padL + (lastI === 0 ? 0.5 : i / lastI) * (W - padL - padR);
  const y = (v: number) => padT + (1 - (v - min) / span) * (H - padT - padB);
  const coords = series.map((v, i): [number, number] => [x(i), y(v)]);
  const linePts = coords
    .map((c) => `${c[0].toFixed(1)},${c[1].toFixed(1)}`)
    .join(" ");
  let len = 0;
  for (let i = 1; i < coords.length; i++) {
    len += Math.hypot(coords[i][0] - coords[i - 1][0], coords[i][1] - coords[i - 1][1]);
  }
  const baseY = H - padB;
  const areaPath =
    `M ${x(0).toFixed(1)},${y(series[0]).toFixed(1)} ` +
    series.map((v, i) => `L ${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ") +
    ` L ${x(lastI).toFixed(1)},${baseY.toFixed(1)} L ${x(0).toFixed(1)},${baseY.toFixed(1)} Z`;
  // Three clean value ticks spread across the domain (the §05 formula), labeled
  // in $k from the raw median dollars.
  const ticks = [max - span * 0.18, min + span * 0.5, min + span * 0.16].map((t) =>
    Math.round(t),
  );
  // A few evenly-spaced month labels (never all of them — that reads busy).
  const xCount = Math.min(series.length, 5);
  const xIdx = Array.from(
    new Set(
      Array.from({ length: xCount }, (_, k) =>
        Math.round((k / (xCount - 1 || 1)) * lastI),
      ),
    ),
  );
  return (
    <svg
      className="sa-chart"
      viewBox={`0 0 ${W} ${H}`}
      role="img"
      aria-label="Neighborhood median sale price, trailing 12 months"
      data-testid="fs-sa-brief-spark"
      style={{ "--len": Math.ceil(len) } as CSSProperties}
    >
      {ticks.map((tv, i) => (
        <g key={`t${i}`}>
          <line
            className="sa-chart__grid"
            x1={padL}
            x2={W - padR}
            y1={y(tv)}
            y2={y(tv)}
          />
          <text
            className="sa-chart__ylabel"
            x={padL - 8}
            y={y(tv) + 3}
            textAnchor="end"
          >
            ${Math.round(tv / 1000)}k
          </text>
        </g>
      ))}
      <path className="sa-chart__area" d={areaPath} />
      <circle
        className="sa-chart__halo"
        cx={x(lastI)}
        cy={y(series[lastI])}
        r="9"
      />
      <polyline className="sa-spark__line" points={linePts} />
      <circle
        className="sa-spark__dot sa-chart__cur"
        cx={x(lastI)}
        cy={y(series[lastI])}
        r="4"
      />
      {xIdx.map((i) => (
        <text
          key={`x${i}`}
          className="sa-chart__xlabel"
          x={x(i)}
          y={H - 9}
          textAnchor={i === 0 ? "start" : i === lastI ? "end" : "middle"}
        >
          {months[i]}
        </text>
      ))}
    </svg>
  );
}

/**
 * The calm activity sentence. Prefers the agent-stamped YoY delta
 * ("+6.2% vs prior year" -> "Up about 6% this year."); falls back to the series
 * endpoints when the delta is absent but a trend exists. Returns null when
 * neither yields a truthful direction, so the line flexes out.
 */
function neighborhoodActivityLine(
  payload: PublicPayload,
  series: number[],
): string | null {
  const yoy = parsePercent(payload.areaStats?.medianSaleDeltaYoy);
  const pct =
    yoy ??
    (series.length >= 2 && series[0] > 0
      ? ((series[series.length - 1] - series[0]) / series[0]) * 100
      : null);
  if (pct == null || !Number.isFinite(pct)) return null;
  const whole = Math.round(Math.abs(pct));
  if (whole === 0) return "Holding steady over the past year.";
  return `${pct >= 0 ? "Up" : "Down"} about ${whole}% this year.`;
}

/**
 * The signed trend delta for the coordinated `+6%` proof number — the agent-
 * stamped YoY delta (the SAME value the activity sentence prefers, so the pair
 * reads "+6%" / "Up about 6%" in lockstep). Returns null when no explicit delta
 * is stamped, so the proof panel flexes out and the trend panel runs full-width
 * (the activity line still narrates the trend from its endpoint fallback).
 */
function trendDeltaPercent(payload: PublicPayload): number | null {
  return parsePercent(payload.areaStats?.medianSaleDeltaYoy);
}

/** "+6.2% vs prior year" / "-3%" -> 6.2 / -3 (first signed percentage); else null. */
function parsePercent(raw?: string): number | null {
  if (!raw) return null;
  const m = raw.match(/-?\d+(\.\d+)?/);
  if (!m) return null;
  const n = parseFloat(m[0]);
  return Number.isFinite(n) ? n : null;
}

/** "612000" / "$612k" -> 612000; "$0.6m" -> 600000. */
function parseNum(raw?: string): number | null {
  if (!raw) return null;
  const s = raw.trim().toLowerCase();
  const k = /k$/.test(s);
  const m = /m$/.test(s);
  const n = parseFloat(s.replace(/[^0-9.]/g, ""));
  if (!Number.isFinite(n)) return null;
  if (m) return Math.round(n * 1_000_000);
  if (k) return Math.round(n * 1000);
  return Math.round(n);
}

const WORDS = [
  "zero",
  "one",
  "two",
  "three",
  "four",
  "five",
  "six",
  "seven",
  "eight",
  "nine",
  "ten",
];
function countWord(n: number): string {
  return n >= 0 && n <= 10 ? WORDS[n] : String(n);
}
function capitalize(s: string): string {
  return s ? s[0].toUpperCase() + s.slice(1) : s;
}

function agentInitials(name?: string): string {
  const n = name?.trim();
  if (!n) return "";
  return n
    .split(/\s+/)
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

/**
 * SSR-safe "MON D" from an ISO timestamp, formatted with UTC getters so the
 * server and client agree (no local-timezone day drift, same posture as
 * engine/appointment.ts). Returns "" for a missing / unparseable value.
 */
const MONTHS_ABBR = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];
function formatPreparedDate(iso?: string): string {
  if (!iso) return "";
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "";
  const d = new Date(t);
  return `${MONTHS_ABBR[d.getUTCMonth()]} ${d.getUTCDate()}`;
}
