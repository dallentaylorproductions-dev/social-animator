/**
 * Seller State A — appointment date+time helpers.
 *
 * The agent picks the appointment with an `<input type="datetime-local">`,
 * which yields a wall-clock string WITHOUT a timezone: "YYYY-MM-DDTHH:MM"
 * (e.g. "2026-06-20T14:00"). We store and render that verbatim — the moment
 * is the agent's local wall clock, the same one the seller reads off the page.
 *
 * SSR-safe by construction: `new Date("2026-06-20T14:00")` parses as LOCAL
 * time, so a server (UTC) and a client (PT) can disagree on the weekday near
 * midnight and produce a hydration mismatch. Every formatter here builds the
 * Date from explicit parts via `Date.UTC` and reads it back with UTC getters,
 * so the output is identical on both sides and never timezone-shifts. The
 * month/weekday names are fixed arrays (not `toLocaleDateString`) so the
 * output is deterministic regardless of the runtime's locale.
 *
 * No em-dash anywhere (LS-1 truthful-copy gate).
 */

const WEEKDAYS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
] as const;

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

/** The shape an `<input type="datetime-local">` emits: "YYYY-MM-DDTHH:MM". */
const APPOINTMENT_RE = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/;

interface AppointmentParts {
  year: number;
  month: number; // 1-12
  day: number;
  hour: number; // 0-23
  minute: number;
}

/**
 * Parse + range-validate a datetime-local string. Returns null when the shape
 * is wrong OR the components don't form a real calendar moment (so a tampered
 * "2026-13-40T99:99" is rejected rather than rendered as a rolled-over date).
 */
function parseParts(value: string | undefined): AppointmentParts | null {
  if (typeof value !== "string") return null;
  const m = APPOINTMENT_RE.exec(value.trim());
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  const hour = Number(m[4]);
  const minute = Number(m[5]);
  if (month < 1 || month > 12) return null;
  if (day < 1 || day > 31) return null;
  if (hour > 23 || minute > 59) return null;
  // Reject impossible day-of-month (e.g. Feb 30): build a UTC date and verify
  // the components survive the round-trip unchanged (no silent rollover).
  const d = new Date(Date.UTC(year, month - 1, day, hour, minute));
  if (
    d.getUTCFullYear() !== year ||
    d.getUTCMonth() !== month - 1 ||
    d.getUTCDate() !== day
  ) {
    return null;
  }
  return { year, month, day, hour, minute };
}

/** True iff `value` is a well-formed, real datetime-local moment. */
export function isValidAppointmentAt(value: string | undefined): boolean {
  return parseParts(value) !== null;
}

/**
 * Normalize a candidate appointment value: returns the trimmed string when it
 * is a valid datetime-local moment, else undefined. Used at the clamp + projection
 * boundaries so only a real moment ever reaches storage or the rendered page.
 */
export function clampAppointmentAt(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return isValidAppointmentAt(trimmed) ? trimmed : undefined;
}

/** "2:00 PM" from 24h parts (no leading zero on the hour, per US convention). */
function formatTime(hour: number, minute: number): string {
  const period = hour < 12 ? "AM" : "PM";
  const h12 = hour % 12 === 0 ? 12 : hour % 12;
  const mm = String(minute).padStart(2, "0");
  return `${h12}:${mm} ${period}`;
}

export interface FormattedAppointment {
  /** "Saturday" — for "prepared for [day]" copy. */
  weekday: string;
  /** "June 20" — month + day, no year. */
  date: string;
  /** "2:00 PM". */
  time: string;
  /** "Saturday, June 20 at 2:00 PM" — the full named, dated moment. */
  full: string;
}

/**
 * Format an appointment value for display. Returns null when the value is
 * missing / invalid so callers can flex the appointment line out cleanly.
 */
export function formatAppointment(
  value: string | undefined,
): FormattedAppointment | null {
  const p = parseParts(value);
  if (!p) return null;
  // Weekday from a UTC date built from the exact parts — deterministic on
  // server + client (no local-timezone drift).
  const weekdayIdx = new Date(
    Date.UTC(p.year, p.month - 1, p.day),
  ).getUTCDay();
  const weekday = WEEKDAYS[weekdayIdx];
  const date = `${MONTHS[p.month - 1]} ${p.day}`;
  const time = formatTime(p.hour, p.minute);
  return {
    weekday,
    date,
    time,
    full: `${weekday}, ${date} at ${time}`,
  };
}
