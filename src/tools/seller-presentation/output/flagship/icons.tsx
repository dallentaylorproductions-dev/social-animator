import type { ReactElement, SVGProps } from "react";

/**
 * D1 · Auto-icon system — the flagship (v2) meaningful-icon library + the
 * deterministic keyword→icon map shared by BOTH the why-work-with-us cards and
 * the how-we-market feature cards.
 *
 * STYLE (Build-Handoff §7): one editorial line set — `viewBox 0 0 24 24`,
 * `stroke: currentColor`, `stroke-width 1.6`, round caps/joins, NO fill. The
 * mark's color is set by the caller (`--signature`); the icon just inherits
 * `currentColor`.
 *
 * ASSIGNMENT is a DETERMINISTIC keyword map (NOT AI — instant, predictable):
 * `RULES` is an ordered, case-insensitive list; `pickIcon` matches the item
 * TITLE first, then the body as a tiebreaker, first/strongest rule wins, and an
 * unmatched item falls through to `sparkle` (a universal mark — never a
 * placeholder shape). One map serves how-we-market AND why-work-with-us.
 */

export type IconName =
  | "camera"
  | "target"
  | "broadcast"
  | "megaphone"
  | "chart"
  | "tag"
  | "key"
  | "home"
  | "phone"
  | "chat"
  | "people"
  | "doc"
  | "medal"
  | "star"
  | "shield"
  | "heart"
  | "sparkle";

type IconNode = (props: SVGProps<SVGSVGElement>) => ReactElement;

/** Shared svg wrapper — locks the editorial line-set attributes in one place. */
function Svg({ children, ...props }: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      {children}
    </svg>
  );
}

/** The icon set (Build-Handoff §7 themes). */
export const ICONS: Record<IconName, IconNode> = {
  camera: (p) => (
    <Svg {...p}>
      <path d="M3 8.5A1.5 1.5 0 0 1 4.5 7h2l1.2-1.8A1 1 0 0 1 8.5 4.7h7a1 1 0 0 1 .8.5L17.5 7h2A1.5 1.5 0 0 1 21 8.5v9A1.5 1.5 0 0 1 19.5 19h-15A1.5 1.5 0 0 1 3 17.5z" />
      <circle cx="12" cy="13" r="3.3" />
    </Svg>
  ),
  target: (p) => (
    <Svg {...p}>
      <circle cx="12" cy="12" r="8.2" />
      <circle cx="12" cy="12" r="4.4" />
      <circle cx="12" cy="12" r="0.9" />
    </Svg>
  ),
  broadcast: (p) => (
    <Svg {...p}>
      <circle cx="12" cy="12" r="2.2" />
      <path d="M7.4 7.4a6.5 6.5 0 0 0 0 9.2M16.6 16.6a6.5 6.5 0 0 0 0-9.2M4.6 4.6a10.4 10.4 0 0 0 0 14.8M19.4 19.4a10.4 10.4 0 0 0 0-14.8" />
    </Svg>
  ),
  megaphone: (p) => (
    <Svg {...p}>
      <path d="M4 10v4a1 1 0 0 0 1 1h2l9 4V5L7 9H5a1 1 0 0 0-1 1Z" />
      <path d="M7 15v3.5a1.5 1.5 0 0 0 3 0V16M19 9.5a3 3 0 0 1 0 5" />
    </Svg>
  ),
  chart: (p) => (
    <Svg {...p}>
      <path d="M4 4v16h16" />
      <path d="M7.5 14.5 11 11l2.5 2.5L19 8" />
    </Svg>
  ),
  tag: (p) => (
    <Svg {...p}>
      <path d="M4 11.5V5a1 1 0 0 1 1-1h6.5a1 1 0 0 1 .7.3l7.2 7.2a1 1 0 0 1 0 1.4l-6.7 6.7a1 1 0 0 1-1.4 0L4.3 12.2a1 1 0 0 1-.3-.7Z" />
      <circle cx="8.2" cy="8.2" r="1.2" />
    </Svg>
  ),
  key: (p) => (
    <Svg {...p}>
      <circle cx="7.5" cy="8" r="3.6" />
      <path d="m10 10.5 8 8M15.5 16l1.7-1.7M18 18.5l1.7-1.7" />
    </Svg>
  ),
  home: (p) => (
    <Svg {...p}>
      <path d="M4 11 12 4l8 7" />
      <path d="M6 9.5V19a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1V9.5" />
      <path d="M10 20v-5h4v5" />
    </Svg>
  ),
  phone: (p) => (
    <Svg {...p}>
      <path d="M5 4h3l1.5 4.5L7.5 10a10 10 0 0 0 4.5 4.5l1.5-2L18 18v2a1 1 0 0 1-1 1A14 14 0 0 1 4 5a1 1 0 0 1 1-1Z" />
    </Svg>
  ),
  chat: (p) => (
    <Svg {...p}>
      <path d="M5 5h14a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H9l-4 3.5V6a1 1 0 0 1 1-1Z" />
      <path d="M8.5 9.5h7M8.5 12.5h4" />
    </Svg>
  ),
  people: (p) => (
    <Svg {...p}>
      <circle cx="9" cy="8.5" r="3" />
      <path d="M3.5 19a5.5 5.5 0 0 1 11 0" />
      <path d="M15.5 6.2a3 3 0 0 1 0 5.6M16.5 14.2a5.5 5.5 0 0 1 4 4.8" />
    </Svg>
  ),
  doc: (p) => (
    <Svg {...p}>
      <path d="M6 3h7l5 5v12a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z" />
      <path d="M13 3v5h5M8.5 13h7M8.5 16.5h7" />
    </Svg>
  ),
  medal: (p) => (
    <Svg {...p}>
      <circle cx="12" cy="14" r="5" />
      <path d="M9 9.2 7 3h4l1.4 3.4M15 9.2 17 3h-4l-1 2.4M12 12l.9 1.8 2 .3-1.45 1.4.35 2L12 16.5 10.2 17.5l.35-2L9.1 14.1l2-.3Z" />
    </Svg>
  ),
  star: (p) => (
    <Svg {...p}>
      <path d="M12 4l2.3 5 5.2.5-3.9 3.5 1.2 5.1L12 20.8 7.2 23.2l1.2-5.1L4.5 9.5l5.2-.5Z" transform="scale(0.9) translate(1.3 -1)" />
    </Svg>
  ),
  shield: (p) => (
    <Svg {...p}>
      <path d="M12 3.5 19 6v6c0 4.2-2.9 7.2-7 8.5-4.1-1.3-7-4.3-7-8.5V6Z" />
      <path d="m9 12 2 2 4-4" />
    </Svg>
  ),
  heart: (p) => (
    <Svg {...p}>
      <path d="M12 19.5C6.5 16 4 12.6 4 9.4A3.9 3.9 0 0 1 12 7a3.9 3.9 0 0 1 8 2.4c0 3.2-2.5 6.6-8 10.1Z" />
    </Svg>
  ),
  sparkle: (p) => (
    <Svg {...p}>
      <path d="M12 4c.6 3.7 2.3 5.4 6 6-3.7.6-5.4 2.3-6 6-.6-3.7-2.3-5.4-6-6 3.7-.6 5.4-2.3 6-6Z" />
      <path d="M18.5 4.5c.2 1.1.7 1.6 1.8 1.8-1.1.2-1.6.7-1.8 1.8-.2-1.1-.7-1.6-1.8-1.8 1.1-.2 1.6-.7 1.8-1.8Z" />
    </Svg>
  ),
};

/**
 * Ordered keyword rules. Earlier rules win, so distinctive real-estate themes
 * sit above the catch-all communication/experience/care ones. Keywords are
 * matched as case-insensitive substrings, so stems ("negotiat", "stag") cover
 * inflections.
 */
export const RULES: ReadonlyArray<{ icon: IconName; keywords: readonly string[] }> = [
  { icon: "camera", keywords: ["photo", "video", "photograph", "film", "shoot", "twilight", "drone", "imagery", "visual", "matterport", "3d tour"] },
  { icon: "target", keywords: ["targeted", "digital ad", "paid ad", "ad funnel", "ads", "ppc", "retarget", "audience", "campaign", "google", "boosted"] },
  { icon: "broadcast", keywords: ["syndicat", "portal", "zillow", "redfin", "realtor.com", "mls", "featured placement", "distribut", "syndication", "listing site"] },
  { icon: "megaphone", keywords: ["social", "instagram", "facebook", "promot", "announce", "buzz", "exposure", "reach", "marketing"] },
  { icon: "tag", keywords: ["pricing", "price", "comp", "valuation", "cma", "list price", "apprais", "value"] },
  { icon: "key", keywords: ["open house", "showing", "tour", "lockbox", "access", "walkthrough", "private showing", "buyer visit"] },
  { icon: "home", keywords: ["stag", "prep", "declutter", "repair", "curb", "ready to list", "make-ready", "improvement", "renovat"] },
  { icon: "chart", keywords: ["data", "track record", "sold", "results", "analytics", "statistic", "performance", "numbers", "average", "days on market", "sale-to-list", "sale to list"] },
  { icon: "doc", keywords: ["negotiat", "offer", "contract", "closing", "paperwork", "terms", "escrow", "sign", "inspection", "appraisal"] },
  { icon: "people", keywords: ["buyer", "network", "sphere", "connection", "relationship", "community", "agents", "referral", "database"] },
  { icon: "medal", keywords: ["award", "top ", "#1", "ranked", "recognition", "achievement", "best", "producer", "winning"] },
  { icon: "shield", keywords: ["guarantee", "protect", "trust", "security", "commitment", "promise", "no-risk", "no risk", "easy exit", "cancel anytime"] },
  { icon: "key", keywords: ["sell", "list with", "handed keys", "close"] },
  { icon: "heart", keywords: ["hands-on", "hands on", "personal", "care", "dedicat", "boutique", "attention", "family", "local", "passion", "directly", "never handed"] },
  { icon: "star", keywords: ["experience", "years", "expert", "seasoned", "veteran", "rated", "trusted", "review", "decade"] },
  { icon: "phone", keywords: ["call", "phone", "available", "response time", "reach me"] },
  { icon: "chat", keywords: ["communicat", "update", "text", "message", "responsive", "in touch", "informed"] },
];

function matchIn(haystack: string): IconName | null {
  for (const rule of RULES) {
    for (const kw of rule.keywords) {
      if (haystack.includes(kw)) return rule.icon;
    }
  }
  return null;
}

/**
 * Resolve the icon for an item: TITLE first, BODY as tiebreaker, sparkle
 * fallback. Deterministic and pure — the same (title, body) always maps to the
 * same icon, so the render is stable and snapshot-safe.
 */
export function pickIcon(title: string, body?: string): IconName {
  const t = (title ?? "").toLowerCase();
  const fromTitle = matchIn(t);
  if (fromTitle) return fromTitle;
  if (body) {
    const fromBody = matchIn(body.toLowerCase());
    if (fromBody) return fromBody;
  }
  return "sparkle";
}

/**
 * Render the resolved icon. `name` is optional — when omitted the icon is
 * picked from (title, body). The caller wraps this in the tinted square mark.
 */
export function AutoIcon({
  title,
  body,
  name,
  className,
}: {
  title?: string;
  body?: string;
  name?: IconName;
  className?: string;
}) {
  const resolved = name ?? pickIcon(title ?? "", body);
  const Node = ICONS[resolved];
  return <Node className={className} data-icon={resolved} />;
}
