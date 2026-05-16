import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    // 5 min — Next.js cold first-compile on this codebase (heavy deps:
    // pdfjs, ffmpeg.wasm, react-pdf) can exceed the Playwright default
    // of 60-120s. Warm restarts are <2s, so this cap is only consumed
    // on the first run after a clean `.next/`.
    timeout: 300_000,
    env: {
      // Activates the middleware's E2E bypass (src/middleware.ts) so tests
      // can reach gated routes (/listing-flyer, /social-animator, /settings,
      // /dashboard) without a real auth session. The bypass also requires
      // NODE_ENV !== 'production' — production builds are never affected.
      E2E_TESTING: '1',
    },
  },
});
