import { socialAnimatorManifest } from "./social-animator/manifest";
import { listingFlyerManifest } from "./listing-flyer/manifest";
import { listingPresentationManifest } from "./listing-presentation/manifest";
import type { ToolManifest } from "./types";

/**
 * Registry of every tool in the Studio. Order here = order on dashboard +
 * marketing landing.
 */
export const TOOLS: ToolManifest[] = [
  socialAnimatorManifest,
  listingFlyerManifest,
  listingPresentationManifest,
];

export type { ToolManifest };
