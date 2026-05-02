import { socialAnimatorManifest } from "./social-animator/manifest";
import { listingFlyerManifest } from "./listing-flyer/manifest";
import type { ToolManifest } from "./types";

/**
 * Registry of every tool in the Studio. Order here = order on dashboard +
 * marketing landing.
 */
export const TOOLS: ToolManifest[] = [
  socialAnimatorManifest,
  listingFlyerManifest,
  {
    id: "listing-presentation",
    name: "Listing Presentation One-Pager",
    description:
      "Polished pre-listing presentation page that makes you look like the obvious choice.",
    icon: "Presentation",
    route: "/listing-presentation",
    status: "coming-soon",
  },
];

export type { ToolManifest };
