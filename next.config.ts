import type { NextConfig } from "next";

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

export default nextConfig;
