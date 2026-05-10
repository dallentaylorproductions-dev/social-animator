/**
 * Educational tips rotated through during the long export wait.
 * Goal is to turn dead time into trust time — each tip reinforces
 * positioning (privacy, quality, platform fit) OR offers a
 * realtor-craft insight (stats, sales-cycle wisdom) without
 * sounding like marketing copy. Order is shuffled fresh per
 * export so repeat-users don't see the same tip in slot 1 every
 * time.
 *
 * H-7.2.2b: opt-in easter-egg tips ("Real Magic Tip™" branded
 * one-liners) surface at a ~10% rate per export, picked from a
 * separate pool so they feel like a delight moment rather than
 * the norm.
 */

export interface ExportTip {
  /** Lucide icon name (rendered in RotatingTip via dynamic import). */
  icon: TipIcon;
  text: string;
  /** True for the small "Real Magic Tip™" personality pool. */
  easterEgg?: boolean;
}

export type TipIcon =
  | "sparkles"
  | "lock"
  | "camera"
  | "film"
  | "palette"
  | "zap"
  | "home"
  | "smartphone"
  | "trending-up"
  | "brain"
  | "target";

export const EXPORT_TIPS: ExportTip[] = [
  // Core informational pool — surface facts about the product
  // and the realtor's craft without overclaiming.
  {
    icon: "trending-up",
    text: "Listings with a video tour sell faster on average than photo-only listings.",
  },
  {
    icon: "lock",
    text: "Your photos are processed locally — nothing is uploaded to a server.",
  },
  {
    icon: "home",
    text: "Sunday open houses typically pull stronger attendance than weekday opens.",
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
    text: "Your brand colors and logo are applied automatically.",
  },
  {
    icon: "zap",
    text: "Vertical reels get higher engagement than square posts on Instagram Stories.",
  },
  {
    icon: "smartphone",
    text: "On mobile, exports save directly to Photos via the share sheet.",
  },
  {
    icon: "brain",
    text: "The first listing photo carries most of the click-decision weight — pick it carefully.",
  },
  {
    icon: "sparkles",
    text: "Listings with a video drive longer time-on-page than photo-only listings.",
  },
  // Easter-egg pool: branded one-liners. Lighter touch, kept rare
  // so they feel like a wink rather than a habit.
  {
    icon: "target",
    text: 'Real Magic Tip™: Confidence sells. Smile in your headshot.',
    easterEgg: true,
  },
  {
    icon: "target",
    text: 'Real Magic Tip™: "Open House" outperforms "For Sale" in headline tests.',
    easterEgg: true,
  },
  {
    icon: "target",
    text: "Real Magic Tip™: Reply to DMs within an hour — leads cool fast after they ping you.",
    easterEgg: true,
  },
];

const EASTER_EGG_RATE = 0.1;

/**
 * Build a shuffled tip list for one export. Decides at the start
 * whether this export's pool includes an easter-egg tip in slot 0
 * (10% chance), then shuffles the remainder of the core pool.
 */
export function buildTipRotation(tips: ExportTip[]): ExportTip[] {
  const core = tips.filter((t) => !t.easterEgg);
  const eggs = tips.filter((t) => t.easterEgg);
  const shuffled = fisherYates(core);
  if (eggs.length > 0 && Math.random() < EASTER_EGG_RATE) {
    const egg = eggs[Math.floor(Math.random() * eggs.length)];
    // Slot the easter egg into a random position in the first
    // half so it surfaces during the user's actual wait, not at
    // the end after they've already looked away.
    const insertAt = Math.floor(Math.random() * Math.ceil(shuffled.length / 2));
    shuffled.splice(insertAt, 0, egg);
  }
  return shuffled;
}

function fisherYates<T>(arr: T[]): T[] {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** Back-compat export for any caller that still uses the old API. */
export const shuffleTips = buildTipRotation;
