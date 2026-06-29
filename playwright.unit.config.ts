import { defineConfig, devices } from '@playwright/test';

/**
 * PURE-UNIT lane for the prepared-next safety modules (validate / voice-source /
 * work-order). These specs run in Playwright's Node worker and NEVER navigate, so
 * there is no `webServer` and no dependency on :3000 (the default config's full
 * browser suite is unaffected and unchanged).
 *
 * External deps are redirected to in-memory fakes via `tsconfig.unit.json`
 * (`@vercel/kv` and `@/lib/brand-settings-store`), so the lane is deterministic
 * and needs no network. The new specs live in ./tests-unit, deliberately OUTSIDE
 * ./e2e, so the default config / CI suite does not pick them up and run them
 * against a real KV (which would throw). The existing pure prepared-next.bullets
 * spec is included here too so the lane reports the full prepared-next unit set.
 *
 * Run: npx playwright test --config=playwright.unit.config.ts
 */
export default defineConfig({
  testDir: '.',
  tsconfig: './tsconfig.unit.json',
  testMatch: ['tests-unit/**/*.spec.ts', 'e2e/prepared-next.bullets.spec.ts'],
  fullyParallel: false,
  workers: 1,
  reporter: 'list',
  projects: [{ name: 'unit', use: { ...devices['Desktop Chrome'] } }],
});
