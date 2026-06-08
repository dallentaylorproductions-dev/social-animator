import { spawnSync } from "node:child_process";
import { createSerwistRoute } from "@serwist/turbopack";

/**
 * Serves the compiled service worker at /serwist/sw.js. @serwist/turbopack
 * bundles app/sw.ts with esbuild at build time, injects the precache
 * manifest, and serves the output with a `Service-Worker-Allowed: /` header —
 * which (paired with SerwistProvider registering at scope "/") lets a worker
 * served from /serwist/ control navigations across the whole origin.
 *
 * `revision` busts the precached /~offline entry per deploy. Prefer Vercel's
 * commit SHA; fall back to a local `git rev-parse` for non-Vercel builds.
 */
const revision =
  process.env.VERCEL_GIT_COMMIT_SHA ||
  spawnSync("git", ["rev-parse", "HEAD"], { encoding: "utf-8" }).stdout?.trim() ||
  "dev";

export const { dynamic, dynamicParams, revalidate, generateStaticParams, GET } =
  createSerwistRoute({
    additionalPrecacheEntries: [{ url: "/~offline", revision }],
    swSrc: "src/app/sw.ts",
    useNativeEsbuild: true,
  });
