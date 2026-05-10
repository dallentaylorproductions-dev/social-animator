/**
 * Educational tips rotated through during the long export wait.
 * Goal is to turn dead time into trust time — each tip reinforces
 * one of the studio's positioning beats (privacy, quality,
 * platform fit) without sounding like marketing copy. Order is
 * shuffled fresh per export so users running multiple exports in
 * a session don't see the same tip in slot 1 every time.
 */

export interface ExportTip {
  /** Lucide icon name (rendered in ExportLoader via dynamic import). */
  icon: TipIcon;
  text: string;
}

export type TipIcon =
  | "sparkles"
  | "lock"
  | "camera"
  | "film"
  | "palette"
  | "zap"
  | "home"
  | "smartphone";

export const EXPORT_TIPS: ExportTip[] = [
  {
    icon: "sparkles",
    text: "Vertical reels get higher engagement than square posts on Instagram Stories.",
  },
  {
    icon: "lock",
    text: "Your photos are processed locally — nothing is uploaded to a server.",
  },
  {
    icon: "camera",
    text: "Each frame is rendered at full 1080p resolution for crisp playback.",
  },
  {
    icon: "film",
    text: "Encoded at the bitrate that survives Instagram and TikTok recompression.",
  },
  {
    icon: "palette",
    text: "Your brand colors and logo are baked into every export automatically.",
  },
  {
    icon: "zap",
    text: "The first export of each session takes a moment longer — subsequent exports are faster.",
  },
  {
    icon: "home",
    text: "Open House Promo videos work great as Stories teasers or Listing Reels.",
  },
  {
    icon: "smartphone",
    text: "On mobile, your export saves directly to Photos via the share sheet.",
  },
];

/** Fisher-Yates shuffle producing a fresh tip order each export. */
export function shuffleTips(tips: ExportTip[]): ExportTip[] {
  const out = [...tips];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}
