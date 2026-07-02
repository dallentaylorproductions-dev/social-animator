/**
 * Buyer Tour Brief — first-party engagement instrumentation, the PURE core
 * (BUYER_TOUR_ANALYTICS).
 *
 * This module is deliberately framework-free and side-effect-free: no KV, no React,
 * no `navigator`. It defines the event vocabulary, the strict NO-PII payload shape,
 * the validation/allow-list boundary the `/api/buyer-tour/track` route enforces, the
 * per-load de-dupe key, the aggregate store shape, the pure fold that applies an
 * event to a store, the readout summarizer the agent sees, and the mapping to a
 * future Follow Up Boss "viewed / engaged" push. Everything here is unit-testable
 * without a browser or a network.
 *
 * PRIVACY POSTURE (baked in, not optional):
 *   • First-party only. No third-party trackers, pixels, or cross-site cookies.
 *   • NO PII is ever accepted or stored: no buyer name/email/phone, no IP, no user
 *     agent, no fingerprint. The payload allow-list below is the whole surface; the
 *     validator REJECTS any object carrying an unknown key, so PII cannot ride along
 *     even by accident.
 *   • `sessionId` is an anonymous, per-page-load random id (not persisted across
 *     loads, not a cookie, not tied to identity). This is a 1:1 page for a known
 *     buyer, so per-tour aggregation IS that buyer — no per-user identity is needed
 *     or wanted. `sessionId` is validated for SHAPE and used only as an abuse/
 *     dedupe signal; it is intentionally NOT persisted in the aggregate store.
 */

/**
 * The engagement funnel. A small, fixed vocabulary — the steps that answer "did the
 * buyer engage." This array IS the allow-list: an event name not in it is rejected
 * by the route. Add a step here (and, if per-home, to PER_HOME_EVENTS) to extend the
 * funnel; never accept a free-form string.
 */
export const BUYER_TOUR_EVENTS = [
  "tour_opened",
  "reached_comparison",
  "home_expander_opened",
  "school_section_viewed",
  "school_link_clicked",
  "map_pin_tapped",
  "pin_summary_opened",
  "cta_clicked",
  "reached_end",
] as const;

export type BuyerTourEvent = (typeof BUYER_TOUR_EVENTS)[number];

/**
 * Events that carry a per-home identity (A/B/C). For these, `homeLetter` is meaningful
 * and counted per-home; for all others it must be absent. The validator enforces this
 * both ways (a per-home event may omit the letter; a non-per-home event may not carry
 * one).
 */
export const PER_HOME_EVENTS = new Set<BuyerTourEvent>([
  "home_expander_opened",
  "map_pin_tapped",
  "pin_summary_opened",
]);

/** Home identity letters used across the V1 context hub (A/B/C … up to F for 6 homes). */
export const HOME_LETTERS = ["A", "B", "C", "D", "E", "F"] as const;
export type HomeLetter = (typeof HOME_LETTERS)[number];

/**
 * The wire payload — the COMPLETE set of fields a track request may carry. This is
 * the NO-PII allow-list. `ts` is a client clock stamp (advisory only; the store uses
 * server time for firstSeen/lastSeen so a lying client can't poison ordering).
 */
export interface BuyerTourTrackPayload {
  tourSlug: string;
  event: BuyerTourEvent;
  /** A/B/C… — present only for PER_HOME_EVENTS. */
  homeLetter?: HomeLetter;
  /** Anonymous per-page-load id (uuid-shaped). Abuse/dedupe signal only; NOT stored. */
  sessionId: string;
  /** Client-side millisecond timestamp. Advisory; server time is authoritative. */
  ts: number;
}

/** The exact set of keys a payload may contain. Any extra key => reject (no PII smuggling). */
const ALLOWED_PAYLOAD_KEYS = new Set([
  "tourSlug",
  "event",
  "homeLetter",
  "sessionId",
  "ts",
]);

/** Tour slugs are 8-char Crockford base32 (see share-urls.ts generateSlug). */
const SLUG_RE = /^[0-9abcdefghjkmnpqrstvwxyz]{8}$/;
/** sessionId is a client-generated uuid (crypto.randomUUID); accept the canonical shape. */
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isBuyerTourEvent(v: unknown): v is BuyerTourEvent {
  return (
    typeof v === "string" &&
    (BUYER_TOUR_EVENTS as readonly string[]).includes(v)
  );
}

export function isHomeLetter(v: unknown): v is HomeLetter {
  return (
    typeof v === "string" && (HOME_LETTERS as readonly string[]).includes(v)
  );
}

export type ValidationResult =
  | { ok: true; payload: BuyerTourTrackPayload }
  | { ok: false; reason: string };

/**
 * Validate + normalize a raw track body into a safe payload, or reject it. This is
 * the security boundary: it accepts ONLY the allow-listed keys with well-formed
 * values, and returns a payload containing ONLY those fields. Anything else — an
 * unknown event name, a malformed slug, a stray key (a PII smuggling attempt), a
 * per-home letter on a non-per-home event — is rejected. Never throws.
 */
export function validateTrackPayload(raw: unknown): ValidationResult {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { ok: false, reason: "not-an-object" };
  }
  const obj = raw as Record<string, unknown>;

  // Reject ANY key outside the allow-list — this is how PII (name/email/phone/ip/ua)
  // is kept out even if a client tries to attach it.
  for (const key of Object.keys(obj)) {
    if (!ALLOWED_PAYLOAD_KEYS.has(key)) {
      return { ok: false, reason: `unknown-field:${key}` };
    }
  }

  if (typeof obj.tourSlug !== "string" || !SLUG_RE.test(obj.tourSlug)) {
    return { ok: false, reason: "bad-tourSlug" };
  }
  if (!isBuyerTourEvent(obj.event)) {
    return { ok: false, reason: "bad-event" };
  }
  if (typeof obj.sessionId !== "string" || !UUID_RE.test(obj.sessionId)) {
    return { ok: false, reason: "bad-sessionId" };
  }
  if (typeof obj.ts !== "number" || !Number.isFinite(obj.ts)) {
    return { ok: false, reason: "bad-ts" };
  }

  const perHome = PER_HOME_EVENTS.has(obj.event);
  let homeLetter: HomeLetter | undefined;
  if (obj.homeLetter !== undefined) {
    if (!perHome) return { ok: false, reason: "unexpected-homeLetter" };
    if (!isHomeLetter(obj.homeLetter)) {
      return { ok: false, reason: "bad-homeLetter" };
    }
    homeLetter = obj.homeLetter;
  }

  const payload: BuyerTourTrackPayload = {
    tourSlug: obj.tourSlug,
    event: obj.event,
    sessionId: obj.sessionId,
    ts: obj.ts,
    ...(homeLetter ? { homeLetter } : {}),
  };
  return { ok: true, payload };
}

/**
 * The per-load de-dupe key. The client fires each meaningful step ONCE per page load
 * (one scroll must not spam `reached_comparison`), so a step is keyed by its event +
 * (for per-home steps) the home letter. Different homes count separately; the same
 * home's expander opening twice in one load counts once.
 */
export function dedupeKey(event: BuyerTourEvent, homeLetter?: HomeLetter): string {
  return homeLetter ? `${event}:${homeLetter}` : event;
}

// ---------------------------------------------------------------------------
// Aggregate store shape + fold. First-party, keyed by tour slug. Deliberately an
// append/counter-friendly shape (per-tour counters + last-seen), NOT a raw event
// log, so it stays cheap and bounded and never accumulates per-user rows.
// ---------------------------------------------------------------------------

/**
 * The stored per-tour aggregate. NO PII by construction — only counters, per-home
 * counters, and timestamps. `firstSeen`/`lastSeen` are server ISO stamps.
 * `totalWrites` is the abuse cap counter. This shape is reusable for a future FUB
 * push (see toFollowUpBossSignal) without a rewrite.
 */
export interface TourEngagement {
  slug: string;
  firstSeen: string;
  lastSeen: string;
  /** Global per-event counters (every fire increments; deduped per load client-side). */
  events: Partial<Record<BuyerTourEvent, number>>;
  /** Per-home per-event counters for PER_HOME_EVENTS. */
  homeEvents: Partial<Record<HomeLetter, Partial<Record<BuyerTourEvent, number>>>>;
  /** Total accepted writes — the per-tour cap guard. */
  totalWrites: number;
}

export function emptyEngagement(slug: string, nowIso: string): TourEngagement {
  return {
    slug,
    firstSeen: nowIso,
    lastSeen: nowIso,
    events: {},
    homeEvents: {},
    totalWrites: 0,
  };
}

/**
 * Fold one validated event into an aggregate, returning a NEW aggregate (pure — the
 * store layer reads, applies this, and writes back). `nowIso` is the server clock.
 */
export function applyEvent(
  current: TourEngagement | null,
  payload: BuyerTourTrackPayload,
  nowIso: string,
): TourEngagement {
  const base = current ?? emptyEngagement(payload.tourSlug, nowIso);
  const events = { ...base.events };
  events[payload.event] = (events[payload.event] ?? 0) + 1;

  const homeEvents = { ...base.homeEvents };
  if (payload.homeLetter) {
    const prior = { ...(homeEvents[payload.homeLetter] ?? {}) };
    prior[payload.event] = (prior[payload.event] ?? 0) + 1;
    homeEvents[payload.homeLetter] = prior;
  }

  return {
    slug: base.slug,
    firstSeen: base.firstSeen,
    lastSeen: nowIso,
    events,
    homeEvents,
    totalWrites: base.totalWrites + 1,
  };
}

/** Per-tour write cap — a coarse abuse guard so one tour can't be spammed unbounded. */
export const TOUR_ENGAGEMENT_WRITE_CAP = 5000;

/**
 * Whether a tour has hit its write cap and further events must be dropped. Pure so the
 * store's abuse guard is unit-testable without KV. Null (no aggregate yet) is never
 * over cap.
 */
export function isOverWriteCap(current: TourEngagement | null): boolean {
  return !!current && current.totalWrites >= TOUR_ENGAGEMENT_WRITE_CAP;
}

// ---------------------------------------------------------------------------
// Agent readout — a calm, factual per-tour summary derived from the counters. No
// hype, no "your buyer is very interested!!" — consistent with the product's quiet,
// never-surveillance voice.
// ---------------------------------------------------------------------------

export interface EngagementSummary {
  /** True when there's nothing to show yet (the calm empty state). */
  empty: boolean;
  /** How many times the page was opened (distinct loads ≈ tour_opened count). */
  opens: number;
  /** Calm factual lines, in funnel order. Empty when `empty`. */
  lines: string[];
  /** The letters whose expander/pin the buyer engaged, sorted (for phrasing/UI). */
  homesTouched: HomeLetter[];
}

function count(e: TourEngagement, ev: BuyerTourEvent): number {
  return e.events[ev] ?? 0;
}

/**
 * Summarize an aggregate into calm agent-facing lines. Derives strictly from the
 * stored counters. Returns an empty summary (empty: true) when the tour has no opens
 * yet, so the readout can render a quiet "No views yet." Phrasing is factual and
 * quiet by design.
 */
export function summarizeEngagement(
  engagement: TourEngagement | null,
): EngagementSummary {
  const opens = engagement ? count(engagement, "tour_opened") : 0;
  if (!engagement || opens === 0) {
    return { empty: true, opens: 0, lines: [], homesTouched: [] };
  }

  const lines: string[] = [];
  lines.push(opens === 1 ? "Opened once." : `Opened ${opens} times.`);

  if (count(engagement, "reached_comparison") > 0) {
    lines.push("Reached the comparison.");
  }

  const homesTouched = HOME_LETTERS.filter((letter) => {
    const he = engagement.homeEvents[letter];
    if (!he) return false;
    return (
      (he.home_expander_opened ?? 0) > 0 ||
      (he.map_pin_tapped ?? 0) > 0 ||
      (he.pin_summary_opened ?? 0) > 0
    );
  });
  if (homesTouched.length === 1) {
    lines.push(`Tapped Home ${homesTouched[0]}.`);
  } else if (homesTouched.length > 1) {
    const last = homesTouched[homesTouched.length - 1];
    const head = homesTouched.slice(0, -1).map((l) => `Home ${l}`).join(", ");
    lines.push(`Tapped ${head} and Home ${last}.`);
  }

  if (
    count(engagement, "school_section_viewed") > 0 ||
    count(engagement, "school_link_clicked") > 0
  ) {
    lines.push(
      count(engagement, "school_link_clicked") > 0
        ? "Viewed a school and opened a school link."
        : "Viewed a school.",
    );
  }

  if (count(engagement, "cta_clicked") > 0) {
    lines.push("Tapped your contact button.");
  } else if (count(engagement, "reached_end") > 0) {
    lines.push("Read to the end.");
  }

  return { empty: false, opens, lines, homesTouched };
}

// ---------------------------------------------------------------------------
// Future Follow Up Boss mapping (NOTE ONLY — not built here). The aggregate above is
// intentionally shaped so a future FUB push can derive "buyer viewed / engaged"
// WITHOUT a schema rewrite: `viewed` = any open; `engaged` = any deeper funnel step.
// A future worker would read the aggregate, call this, and push the two booleans (+
// lastSeen) to FUB. No PII crosses — the tour is 1:1 with a known buyer already in
// the agent's CRM, so the CRM record, not our store, carries identity.
// ---------------------------------------------------------------------------

export interface FollowUpBossSignal {
  tourSlug: string;
  viewed: boolean;
  engaged: boolean;
  lastSeen: string;
}

const ENGAGED_EVENTS: BuyerTourEvent[] = [
  "reached_comparison",
  "home_expander_opened",
  "school_section_viewed",
  "school_link_clicked",
  "map_pin_tapped",
  "pin_summary_opened",
  "cta_clicked",
  "reached_end",
];

/** Derive the future FUB "viewed / engaged" signal from an aggregate. Pure; unused today. */
export function toFollowUpBossSignal(
  engagement: TourEngagement | null,
): FollowUpBossSignal | null {
  if (!engagement) return null;
  const viewed = count(engagement, "tour_opened") > 0;
  const engaged = ENGAGED_EVENTS.some((ev) => count(engagement, ev) > 0);
  return {
    tourSlug: engagement.slug,
    viewed,
    engaged,
    lastSeen: engagement.lastSeen,
  };
}
