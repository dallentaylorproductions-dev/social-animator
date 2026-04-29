/**
 * Tool registration manifest. Each tool in the Studio declares one of these,
 * and the dashboard + marketing landing render from the registry. Adding a
 * new tool = adding a manifest + flipping `status: "live"`.
 */
export interface ToolManifest {
  id: string;
  name: string;
  /** 1–2 sentence summary, shown on dashboard + marketing landing. */
  description: string;
  /** Lucide icon name — see https://lucide.dev/icons */
  icon: string;
  /** Internal route, e.g. "/social-animator". */
  route: string;
  status: "live" | "coming-soon";
}
