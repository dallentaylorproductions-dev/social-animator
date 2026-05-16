# Regression Testing

Studio SEP uses Playwright for automated end-to-end testing. Tests run locally
during development and automatically on every PR via GitHub Actions.

## What's covered

14 tests across 4 tools:

- **Smoke test** — marketing page loads (`e2e/smoke.spec.ts`)
- **Listing Flyer** — PDF + JPEG (visual snapshots), MP4 reel + MP4 square (file-level)
- **Open House Promo** — PDF + JPEG + QR PNG (visual snapshots), MP4 reel + MP4 square (file-level)
- **Listing Presentation** — PDF + JPEG (visual snapshots)
- **Social Animator** — `listing-carousel` + `listing-showcase` template MP4 exports (file-level)

The visual snapshot tests catch output drift (e.g., bullets disappearing,
colors changing, layout shifting) on every commit. File-level tests catch
broken downloads, wrong file formats, or extreme size deviations.

## Running tests locally

```bash
# Full suite (~8-9 minutes — MP4 tests are slow)
npx playwright test

# Fast iteration (~30-60s — skips @slow MP4 tests)
npx playwright test --grep-invert "@slow"

# Run a specific tool's tests
npx playwright test e2e/listing-flyer.spec.ts

# View the last HTML report
npx playwright show-report
```

## CI run

GitHub Actions runs the full suite on every PR to `main` and every push to
`main`. The workflow file is [.github/workflows/playwright.yml](../.github/workflows/playwright.yml).

If a test fails in CI:
1. The PR check turns red
2. Click "Details" on the failing check to see the test output
3. Download the `playwright-report` artifact for the full HTML report
4. Download `test-results` for screenshots, traces, and snapshot diff
   images (`<name>-actual.png`, `<name>-expected.png`, `<name>-diff.png`)

## Snapshot updates

Snapshot files live in `e2e/<tool>.spec.ts-snapshots/`. They're separated by
platform:
- `*-chromium-darwin.png` — generated on macOS, used for local Mac development
- `*-chromium-linux.png` — generated on Linux, used by CI

Each platform compares against its own snapshot set. Playwright picks the
right one automatically based on `process.platform`.

### When you change a design intentionally

If you intentionally redesign part of an export (e.g., change hero photo
styling, modify feature list layout), the existing snapshots become wrong.
You need to regenerate them:

**Local (Mac) snapshots:**
```bash
npx playwright test --update-snapshots
git add e2e/*-snapshots/
git commit -m "test: regenerate snapshots after [design change description]"
```

**Linux (CI) snapshots:** see the bootstrap section below.

### Linux snapshot bootstrap (one-time setup)

The first CI run after W-2.7 merges will fail because Linux snapshots don't
exist yet. Two ways to bootstrap:

**Option A — Via Docker locally (preferred):**

```bash
# Match the Playwright version in your package.json — check with:
#   npm list @playwright/test
# Then plug that into the image tag below.
docker run --rm -v "$(pwd)":/work -w /work \
  mcr.microsoft.com/playwright:v1.60.0-jammy \
  /bin/bash -c "npm ci && npx playwright test --update-snapshots"

git add e2e/*-snapshots/*-chromium-linux.png
git commit -m "test: bootstrap Linux snapshot baselines"
git push
```

**Option B — Via GitHub Actions (no Docker needed):**

1. Temporarily edit `.github/workflows/playwright.yml` and change
   `npx playwright test` to `npx playwright test --update-snapshots`
2. Push the edited workflow
3. CI runs, generates snapshots. Even though the test step writes to
   `test-results/`, the actual snapshot files end up in
   `e2e/<spec>.spec.ts-snapshots/` inside the runner — they won't auto-
   commit, but they get bundled into the `test-results` artifact (since
   Playwright reports them as "written" on first generation).
4. Download the `test-results` artifact, extract the new
   `*-chromium-linux.png` files, copy them into the matching snapshot
   directories locally
5. Restore the workflow YAML, commit + push the snapshot files and the
   restored workflow

Option A is cleaner if you have Docker installed; Option B works without.

## When tests fail unexpectedly

If a test fails in CI but passes locally, the most likely causes:

- **Linux snapshot doesn't exist yet** — see the bootstrap section above
- **MP4 timing flake** — Playwright auto-retries once in CI; if it still
  fails consistently, the file-size assertion may be too tight for CI's
  slower environment. Loosen the bound; document the change in the commit.
- **Auth bypass leaked into the wrong env** — verify `E2E_TESTING` is set
  only in `.github/workflows/playwright.yml` and `playwright.config.ts`'s
  `webServer.env`, NOT in Vercel production env vars. The middleware
  bypass requires BOTH `E2E_TESTING === '1'` AND
  `NODE_ENV !== 'production'`, so a leak still wouldn't activate the
  bypass in prod — but it could activate it in a preview environment if
  preview deploys had `NODE_ENV` other than `production`.

## Adding new tests

When adding a new tool or new export format:

1. Create `e2e/<tool>.spec.ts` following the patterns from existing tests
2. Reuse the helpers in `e2e/fixtures/seed-helpers.ts`:
   - `seedBrandProfile(page)` — agent identity, brand colors
   - `seedListingFlyerDraft(page)` / `seedOpenHousePromoDraft(page)` /
     `seedListingPresentationDraft(page)` — tool-specific localStorage seeds
   - `seedListingProfile(page, profile)` — cross-template listing data
     consumed by Social Animator's `listing-card` + `listing-showcase`
   - `uploadTestPhoto(page, fileName?)` — file-chooser-event photo upload
     that works for Listing Flyer + OH Promo (waits on `Photos (N / 5)`
     counter)
   - `bufferToScreenshotPng(page, buffer, mimeType)` — convert JPEG/PNG
     buffer to a PNG screenshot buffer that `toMatchSnapshot` can diff
   - `testPhotoDataUri(fileName?)` — synchronous read of a perf-test photo
     into a JPEG data URL string (for embedding into seed payloads)
3. Run locally with `--update-snapshots` to generate the Mac baseline
4. Push; CI will fail until the Linux baseline is bootstrapped (same
   procedure as the initial bootstrap above)
5. Subsequent runs do strict comparison on both platforms

## Tagging slow tests

MP4 export tests are tagged `@slow` in their test names so the fast iteration
loop (`--grep-invert "@slow"`) can skip them. The full suite still runs them.
If you add a new test that takes more than ~5 seconds, follow the same
convention.

## Middleware bypass (`E2E_TESTING`)

`/listing-flyer`, `/social-animator/*`, `/settings`, and `/dashboard` are
gated by [src/middleware.ts](../src/middleware.ts). Tests reach these
routes via a dual-condition bypass:

```ts
if (
  process.env.NODE_ENV !== "production" &&
  process.env.E2E_TESTING === "1"
) {
  return NextResponse.next();
}
```

`E2E_TESTING` is set automatically by `playwright.config.ts`'s `webServer.env`
locally, and by the workflow's top-level `env` in CI. The NODE_ENV check
prevents the bypass from ever activating in a Vercel production build, even
under env misconfiguration.

`/open-house-promo` and `/listing-presentation` are NOT in the matcher;
their tests reach those routes directly without the bypass.

## Branch protection (manual repo setting)

Once the Playwright workflow is reliably green, enable required status checks
in the GitHub repo's branch protection rules for `main`:

1. GitHub → Settings → Branches → Add branch protection rule for `main`
2. Enable "Require status checks to pass before merging"
3. Select `Run Playwright e2e tests` from the list of checks

This is a manual step — not configurable from this repo's code. Skip it
until the first few CI runs have stabilized.
