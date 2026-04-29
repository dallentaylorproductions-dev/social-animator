import { socialAnimatorManifest } from "./social-animator/manifest";
import type { ToolManifest } from "./types";

/**
 * Registry of every tool in the Studio. Order here = order on dashboard +
 * marketing landing. Live tools first, then coming-soon stubs.
 */
export const TOOLS: ToolManifest[] = [
  socialAnimatorManifest,
  {
    id: "listing-flyer",
    name: "Listing Flyer Generator",
    description:
      "Branded property flyers from a single form. PDF + JPG output, ready to print or text.",
    icon: "FileText",
    route: "/listing-flyer",
    status: "coming-soon",
  },
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
