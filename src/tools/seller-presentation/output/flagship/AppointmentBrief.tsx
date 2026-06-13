import type { PublicPayload } from "../public-payload";
import {
  streetViewStaticUrl,
  STREET_VIEW_IMG_SIZE,
  STREET_VIEW_FOV,
  STREET_VIEW_PITCH,
} from "@/lib/seller-presentation/street-view";

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
  const comps = payload.whyPrice.comps;
  const hasNearby = comps.length > 0;

  const series = (payload.areaStats?.monthlySeries ?? [])
    .map((m) => parseNum(m.medianPrice))
    .filter((n): n is number => n != null);
  const hasSpark = series.length >= 2;
  const activityLine = neighborhoodActivityLine(payload, series);
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
              {comps.slice(0, 4).map((c, i) => {
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
                      ) : null}
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
            <div className="sa-brief__activity">
              {hasSpark && <Sparkline series={series} />}
              {activityLine && (
                <p className="sa-brief__activity-line">{activityLine}</p>
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

/** Compact, axis-less sparkline of the area median trend (editorial, not a chart widget). */
function Sparkline({ series }: { series: number[] }) {
  const W = 132,
    H = 38,
    pad = 3;
  const min = Math.min(...series);
  const max = Math.max(...series);
  const span = max - min || 1;
  const x = (i: number) =>
    pad + (i / (series.length - 1)) * (W - pad * 2);
  const y = (v: number) => pad + (1 - (v - min) / span) * (H - pad * 2);
  const pts = series.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`);
  const lastI = series.length - 1;
  return (
    <svg
      className="sa-spark"
      viewBox={`0 0 ${W} ${H}`}
      role="img"
      aria-label="Neighborhood price trend"
      data-testid="fs-sa-brief-spark"
    >
      <polyline className="sa-spark__line" points={pts.join(" ")} />
      <circle
        className="sa-spark__dot"
        cx={x(lastI)}
        cy={y(series[lastI])}
        r="2.6"
      />
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
