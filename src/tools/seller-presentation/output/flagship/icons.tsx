import type { ReactElement } from "react";

/**
 * D1-PORT · Auto-icon system — ported VERBATIM from the locked prototype's
 * inline `icons.jsx` block (docs/design/seller-page-v2/seller-page-standalone.html):
 * the GLYPHS line-icon library + the deterministic keyword→icon `RULES`/`pickIcon`
 * map. One consistent line style (1.6 stroke, round joins, currentColor). Shared by
 * "How we market" and "Why work with us" cards. NO AI — ordered keyword rules,
 * title first then body as a tiebreaker, first/strongest match wins, neutral
 * `sparkle` fallback (never a placeholder shape).
 */

export type IconName =
  | "camera" | "target" | "broadcast" | "megaphone" | "chart" | "tag" | "key"
  | "home" | "phone" | "chat" | "people" | "doc" | "medal" | "star" | "shield"
  | "heart" | "sparkle";

const P = {
  fill: "none" as const,
  stroke: "currentColor",
  strokeWidth: 1.6,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};
const svg = (children: ReactElement): ReactElement => (
  <svg viewBox="0 0 24 24" width="100%" height="100%" {...P}>
    {children}
  </svg>
);

export const GLYPHS: Record<IconName, ReactElement> = {
  camera: svg(<><path d="M4 8h2.5L8 6h8l1.5 2H20a1 1 0 011 1v9a1 1 0 01-1 1H4a1 1 0 01-1-1V9a1 1 0 011-1z" /><circle cx="12" cy="13" r="3.2" /></>),
  target: svg(<><circle cx="12" cy="12" r="8.5" /><circle cx="12" cy="12" r="4.4" /><circle cx="12" cy="12" r="0.9" fill="currentColor" stroke="none" /></>),
  broadcast: svg(<><circle cx="12" cy="12" r="1.6" fill="currentColor" stroke="none" /><path d="M8.6 8.6a5 5 0 000 6.8" /><path d="M15.4 8.6a5 5 0 010 6.8" /><path d="M6.2 6.2a8.4 8.4 0 000 11.6" /><path d="M17.8 6.2a8.4 8.4 0 010 11.6" /></>),
  megaphone: svg(<><path d="M4 10v4h3l8 4V6L7 10H4z" /><path d="M17 9.2a4 4 0 010 5.6" /></>),
  chart: svg(<><path d="M4 4v16h16" /><path d="M8 15l3-4 3 2 4-6" /></>),
  tag: svg(<><path d="M4 4h7l9 9-7 7-9-9V4z" /><circle cx="8.2" cy="8.2" r="1.4" /></>),
  key: svg(<><circle cx="8" cy="8" r="4.2" /><path d="M11 11l8.5 8.5" /><path d="M16 16l2.2-2.2" /><path d="M18.2 18.2l2.2-2.2" /></>),
  home: svg(<><path d="M4 11l8-7 8 7" /><path d="M6 9.6V20h12V9.6" /></>),
  phone: svg(<><path d="M7 4l2.8.8 1 3.6-2 1.3a10.5 10.5 0 005 5l1.3-2 3.6 1V18a2 2 0 01-2.2 2A15 15 0 015 6.2 2 2 0 017 4z" /></>),
  chat: svg(<><path d="M4 6h16v9.5H10.5L6 20v-4.5H4z" /><path d="M8 10.5h8M8 13h5" /></>),
  people: svg(<><circle cx="9" cy="9" r="2.8" /><path d="M3.8 19a5.2 5.2 0 0110.4 0" /><circle cx="16.6" cy="10" r="2.2" /><path d="M15.6 19a5 5 0 016.6-4.4" /></>),
  doc: svg(<><path d="M6 3h8l4 4v14H6z" /><path d="M14 3v4h4" /><path d="M9 12.5h6M9 16h4" /></>),
  medal: svg(<><circle cx="12" cy="14.5" r="4.8" /><path d="M9.2 10L7 3h4l1 2.6L13 3h4l-2.2 7" /><path d="M12 12.6l.85 1.7 1.9.3-1.37 1.32.32 1.88L12 16.9l-1.7.9.32-1.88L9.25 14.6l1.9-.3z" strokeWidth="1" /></>),
  star: svg(<><path d="M12 3.6l2.6 5.3 5.8.9-4.2 4.1 1 5.8L12 17l-5.2 2.7 1-5.8-4.2-4.1 5.8-.9z" /></>),
  shield: svg(<><path d="M12 3l7 2.8V11c0 4.2-3 7.4-7 8.6-4-1.2-7-4.4-7-8.6V5.8z" /><path d="M9 11.6l2 2 4-4" /></>),
  heart: svg(<><path d="M12 20S4 15.2 4 9.4A3.8 3.8 0 0112 7.2 3.8 3.8 0 0120 9.4C20 15.2 12 20 12 20z" /></>),
  sparkle: svg(<><path d="M12 4l1.7 4.6L18 10l-4.3 1.4L12 16l-1.7-4.6L6 10l4.3-1.4z" /><path d="M18.6 4.6l.5 1.5 1.5.5-1.5.5-.5 1.5-.5-1.5-1.5-.5 1.5-.5z" strokeWidth="1.1" /></>),
};

// ordered rules — first/strongest match wins (case-insensitive)
export const RULES: ReadonlyArray<{ icon: IconName; kw: readonly string[] }> = [
  { icon: "camera", kw: ["photo", "photograph", "video", "film", "shoot", "twilight", "imagery", "drone", "media", "picture"] },
  { icon: "target", kw: ["digital ad", "targeted", "retarget", "paid", "ppc", "ad funnel", "campaign", " ads", "online ad"] },
  { icon: "broadcast", kw: ["syndicat", "portal", "mls", "feature", "placement", "feed", "distribut", "broadcast", "listing site"] },
  { icon: "megaphone", kw: ["social", "promote", "advertis", "awareness", "buzz", "exposure", "reach"] },
  { icon: "chart", kw: ["sold", "closed", "transaction", "track record", "results", "data", "trend", "analy", "statistic", "sale-to-list", "days on market"] },
  { icon: "tag", kw: ["price", "pricing", "comp", "valuation", "apprais", "cma", "list price", "number"] },
  { icon: "key", kw: ["open house", "showing", "tour", "walkthrough", "walk the home", "visit", "access", "door"] },
  { icon: "home", kw: ["stage", "staging", "prep", "declutter", "curb", "property", "home", "house", "remodel"] },
  { icon: "phone", kw: ["call", "phone", "responsive", "available", "text", "reach out", "answer"] },
  { icon: "chat", kw: ["communicat", "update", "message", "chat", "inform", "transparen", "question", "guidance"] },
  { icon: "people", kw: ["buyer", "network", "team", "client", "people", "relationship", "database", "connection", "referral"] },
  { icon: "doc", kw: ["negotiat", "offer", "contract", "paperwork", "document", "terms", "deal", "escrow", "closing", "close"] },
  { icon: "medal", kw: ["award", "recogni", "rank", "#1", "number one", "honor", "top producer", "best in"] },
  { icon: "star", kw: ["experience", "expert", "year", "decade", "proven", "seasoned", "veteran", "best", "reputation"] },
  { icon: "shield", kw: ["trust", "guarantee", "protect", "honest", "integrity", "commit", "promise", "backed", "no pressure"] },
  { icon: "heart", kw: ["hands-on", "personal", "dedicat", "attentive", "care", "boutique", "small", "one-on-one", "start to finish", "yourself"] },
];

export function pickIcon(title?: string, body?: string): IconName {
  const t = (title || "").toLowerCase();
  const b = (body || "").toLowerCase();
  for (const r of RULES) if (r.kw.some((k) => t.includes(k))) return r.icon; // title first
  for (const r of RULES) if (r.kw.some((k) => b.includes(k))) return r.icon; // body as tiebreaker
  return "sparkle"; // neutral universal fallback
}

/** Render the resolved icon glyph; picks from (title, body) unless `name` is given. */
export function AutoIcon({
  title,
  body,
  name,
}: {
  title?: string;
  body?: string;
  name?: IconName;
}) {
  const resolved = name ?? pickIcon(title, body);
  return <span data-icon={resolved} style={{ display: "contents" }}>{GLYPHS[resolved]}</span>;
}
