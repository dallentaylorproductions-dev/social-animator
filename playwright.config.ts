import { defineConfig, devices } from '@playwright/test';

// CI is set by the GitHub Actions workflow (.github/workflows/playwright.yml)
// and any other CI runner. When true, switch on stricter defaults: GitHub-
// annotation reporter, one retry to absorb MP4 timing flake, fail on stray
// test.only(). Locally, stay terse + zero-retry so flakes surface
// immediately.
const isCI = !!process.env.CI;

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  forbidOnly: isCI,
  retries: isCI ? 1 : 0,
  workers: 1,
  reporter: isCI ? [['github'], ['html']] : 'list',
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
      // Exclude the mobile-only regression specs — they have their own
      // device-emulated project below. Without this filter chromium
      // would re-run them with a desktop UA, which both wastes time
      // and weakens the signal (the spec is designed to fail only
      // under touch/mobile-WebKit conditions).
      testIgnore: /.*\.mobile\.spec\.ts/,
    },
    // Mobile-WebKit project — narrowly scoped to the A7c.4.1 phone-only
    // regression spec. Runs in addition to chromium so the per-test
    // device emulation (touchscreen + mobile UA + small viewport)
    // matches Dallen's iOS smoke without forcing the rest of the suite
    // to recompile against WebKit. Add more specs to `testMatch` only
    // when they're meaningfully mobile-shaped — otherwise the
    // chromium project is the default home.
    {
      name: 'mobile-webkit',
      use: { ...devices['iPhone 14'] },
      testMatch: /.*\.mobile\.spec\.ts/,
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
