import type { NextConfig } from "next";
import { withSerwist } from "@serwist/turbopack";

const nextConfig: NextConfig = {
  async redirects() {
    return [
      // v1.47: /access was the beta-cohort sign-in URL. Unified into
      // /login (collapsible code field). 308 keeps already-shared links
      // working without an entitlement implication.
      {
        source: "/access",
        destination: "/login",
        permanent: true,
      },
    ];
  },
};

// withSerwist only appends esbuild to serverExternalPackages (the SW is
// bundled on-demand by the /serwist route handler) — it does NOT switch the
// bundler, so the Turbopack prod build stays Turbopack.
export default withSerwist(nextConfig);
