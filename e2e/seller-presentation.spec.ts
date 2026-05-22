import { test, expect } from '@playwright/test';

/**
 * Seller Presentation — A5a spine + Step 1 + reload-by-?id= persistence.
 *
 * Smokes the new converged-storage pipeline end-to-end:
 *   - Fresh visit creates a WorkflowInstance; URL replaces to ?id=<id>.
 *   - Step 1 reads/writes the SHARED Property primitive (useListingProfile).
 *   - Next gates on a saved propertyId (auto-backfilled on first save).
 *   - Stubs (steps 2–5) traverse correctly via Prev/Next.
 *   - Reload at the same ?id= URL restores the draft + step position.
 *
 * Stubs' content is NOT asserted — A5b fills the real fields and
 * adds per-step coverage. This spec is the smallest end-to-end
 * proof that the new substrate plumbing works.
 *
 * No auth / paywall seeding: `/seller-presentation` is NOT in the
 * middleware matcher in src/middleware.ts (same Base-routing pattern
 * as the other listing tools), so tests reach it directly.
 */

test.describe('Seller Presentation — A5a spine + Step 1', () => {
  test('creates an instance, gates Step 1 on propertyId, persists via ?id= reload', async ({
    page,
  }) => {
    // Each Playwright test gets a fresh browser context by default, so
    // localStorage starts empty — no need (and dangerous) to call
    // `page.addInitScript(() => localStorage.clear())`: that init
    // script re-fires on every navigation including page.reload(),
    // which would wipe the persisted WorkflowInstance mid-test.
    await page.goto('/seller-presentation');

    // Wizard chrome present.
    await expect(
      page.getByRole('heading', { name: 'Seller Presentation' }),
    ).toBeVisible();
    await expect(page.getByText('Step 1 of 5')).toBeVisible();
    await expect(page.getByTestId('step-property')).toBeVisible();

    // The mount effect replaced the URL with ?id=<workflow_…>.
    await page.waitForURL(/\/seller-presentation\?id=workflow_[a-z0-9]+/);
    const initialUrl = new URL(page.url());
    const instanceId = initialUrl.searchParams.get('id');
    expect(instanceId).toBeTruthy();
    expect(instanceId!.startsWith('workflow_')).toBe(true);

    // Empty-state: Next disabled (no propertyId yet, no address).
    const nextButton = page.getByTestId('wizard-next');
    await expect(nextButton).toBeDisabled();
    await expect(
      page.getByText(/Enter an address to save\. A property id is assigned automatically\./),
    ).toBeVisible();

    // Type an address — useListingProfile.update persists, saveListingProfile
    // backfills propertyId (A2 wiring), the mirror effect copies into the
    // SP draft, the shell sees draft.propertyId materialize, Next enables.
    await page.getByTestId('step-property-address').fill('1234 Test Drive NE');
    await page.getByTestId('step-property-city').fill('Tacoma, WA');

    // Saved-state hint includes the assigned property_ id.
    const savedHint = page.getByTestId('step-property-saved-hint');
    await expect(savedHint).toBeVisible();
    await expect(savedHint).toContainText(/property id\s+property_[a-z0-9]+/);

    // Next is now enabled.
    await expect(nextButton).toBeEnabled();

    // Traverse all 5 steps via Next. Each stub renders its testid.
    await nextButton.click();
    await expect(page.getByTestId('step-comps')).toBeVisible();
    await expect(page.getByText('Step 2 of 5')).toBeVisible();

    await nextButton.click();
    await expect(page.getByTestId('step-strategy')).toBeVisible();
    await expect(page.getByText('Step 3 of 5')).toBeVisible();

    await nextButton.click();
    await expect(page.getByTestId('step-pitch')).toBeVisible();
    await expect(page.getByText('Step 4 of 5')).toBeVisible();

    await nextButton.click();
    await expect(page.getByTestId('step-review')).toBeVisible();
    await expect(page.getByText('Step 5 of 5')).toBeVisible();

    // Wait for the wizard's save effect to flush `currentStep: 'review'`
    // to localStorage before reloading. The DOM render of step-review
    // is committed BEFORE the save effect runs (React fires effects
    // post-commit), so a naive reload races and reads a stale record.
    // Polling the persisted record is the deterministic gate.
    await page.waitForFunction(
      (id) => {
        const raw = window.localStorage.getItem(`workflowInstance:${id}`);
        if (!raw) return false;
        try {
          const parsed = JSON.parse(raw) as { currentStep?: string };
          return parsed.currentStep === 'review';
        } catch {
          return false;
        }
      },
      instanceId,
    );

    // Reload the same URL — the converged storage should restore both
    // the saved draft AND the last visited step. `page.reload()` is
    // unambiguous about issuing a navigation (vs. `page.goto(sameUrl)`
    // which the browser may short-circuit).
    await page.reload();
    await expect(
      page.getByRole('heading', { name: 'Seller Presentation' }),
    ).toBeVisible();
    await expect(page.getByTestId('step-review')).toBeVisible();
    await expect(page.getByText('Step 5 of 5')).toBeVisible();

    // Walk back to Step 1 and confirm the address survived.
    const prevButton = page.getByTestId('wizard-prev');
    for (let i = 0; i < 4; i++) {
      await prevButton.click();
    }
    await expect(page.getByText('Step 1 of 5')).toBeVisible();
    await expect(page.getByTestId('step-property-address')).toHaveValue(
      '1234 Test Drive NE',
    );
    await expect(page.getByTestId('step-property-city')).toHaveValue(
      'Tacoma, WA',
    );
    await expect(page.getByTestId('step-property-saved-hint')).toBeVisible();
  });

  test('an unknown ?id= falls back to a fresh instance + replaces the URL', async ({
    page,
  }) => {
    // Fresh browser context per test (Playwright default) — no init-script
    // clear needed, and any clear would re-fire on a future page.reload().
    await page.goto('/seller-presentation?id=workflow_doesnotexist');

    // The mount effect's markOpened returns null → fall through to
    // createInstance + replace the URL with the fresh id. Wait for
    // step-property to appear (it only renders after the mount effect
    // has set instance state); a `waitForURL(/workflow_.+/)` would
    // match the input id and return immediately, racing the effect.
    await expect(page.getByTestId('step-property')).toBeVisible();
    const url = new URL(page.url());
    expect(url.searchParams.get('id')).not.toBe('workflow_doesnotexist');
    expect(url.searchParams.get('id')!.startsWith('workflow_')).toBe(true);
  });
});

test.describe('Seller Presentation — A5b per-step content', () => {
  test('fills all 5 steps and the per-step content survives reload', async ({
    page,
  }) => {
    // Per A5a's banked testing convention: NO localStorage.clear init
    // script — each Playwright test gets a fresh browser context, and an
    // init clear would re-fire on page.reload() mid-test and wipe the
    // persisted WorkflowInstance.

    await page.goto('/seller-presentation');
    await expect(page.getByTestId('step-property')).toBeVisible();

    await page.waitForURL(/\/seller-presentation\?id=workflow_[a-z0-9]+/);
    const instanceId = new URL(page.url()).searchParams.get('id')!;

    // ---------- Step 1: Property ----------
    await page.getByTestId('step-property-address').fill('1234 Test Drive NE');
    await page.getByTestId('step-property-city').fill('Tacoma, WA');
    await expect(page.getByTestId('step-property-saved-hint')).toBeVisible();
    const nextButton = page.getByTestId('wizard-next');
    await nextButton.click();

    // ---------- Step 2: Comps ----------
    await expect(page.getByTestId('step-comps')).toBeVisible();
    await page.getByTestId('step-comps-add').click();
    await expect(page.getByTestId('step-comps-card-0')).toBeVisible();
    await page.getByTestId('step-comps-address-0').fill('5678 Elm Ave NE');
    // CurrencyInput uses aria-label rather than data-testid (it doesn't
    // accept arbitrary HTML attributes per its typed props).
    await page.getByLabel('comp-1-sold-price').fill('685000');
    await expect(page.getByLabel('comp-1-sold-price')).toHaveValue('$685,000');
    await nextButton.click();

    // ---------- Step 3: Strategy ----------
    await expect(page.getByTestId('step-strategy')).toBeVisible();
    await page.getByLabel('recommended-price').fill('700000');
    await expect(page.getByLabel('recommended-price')).toHaveValue('$700,000');
    await page.getByTestId('step-strategy-rationale').fill(
      'Priced 2% under market median to drive multiple offers in the first 10 days.',
    );
    await page.getByTestId('step-strategy-strategy-strategic-quick-sale').check();
    // Confidence radios are visually hidden (sr-only) — the wrapper label
    // card is the user's click target. `check({ force: true })` skips
    // Playwright's visibility actionability check for the hidden input.
    await page
      .getByTestId('step-strategy-confidence-high')
      .check({ force: true });
    await nextButton.click();

    // ---------- Step 4: Pitch ----------
    // A7c.4 seeds INITIAL_VISIBLE_ROWS (3) empty pitch points on first
    // mount of the step, so the agent lands on a finite starting
    // canvas. No `step-pitch-add` clicks needed for this scenario —
    // we fill two of the seeded rows directly. The counter denominator
    // now reads filled-row count, so "1 of 2" still describes "1 of
    // the 2 rows with content is public" (the third seeded row stays
    // empty and is dropped on reload by clampPitchPoint).
    await expect(page.getByTestId('step-pitch')).toBeVisible();
    await page
      .getByTestId('step-pitch-title-0')
      .fill('Premium staging + pro photography included.');
    await page
      .getByTestId('step-pitch-title-1')
      .fill('My private internal target: net $665k after closing costs.');
    // A7c.6: points default to PUBLIC. First point keeps the default;
    // second is explicitly marked private (prep-only note).
    await page.getByTestId('step-pitch-private-1').click();
    await expect(page.getByTestId('step-pitch-counter')).toHaveText(
      '1 of 2 marked public',
    );
    await nextButton.click();

    // ---------- Step 5: Review ----------
    await expect(page.getByTestId('step-review')).toBeVisible();
    // All required fields filled → ready-to-publish banner, NOT missing.
    await expect(page.getByTestId('step-review-ready')).toBeVisible();
    await expect(page.getByTestId('step-review-missing')).toHaveCount(0);
    // Summary surfaces the public/private split.
    const summary = page.getByTestId('step-review-summary');
    await expect(summary).toContainText('$700,000');
    await expect(summary).toContainText('1 provided');
    await expect(summary).toContainText('1 🌐 public');
    await expect(summary).toContainText('1 🔒 private');

    // ---------- Persist + reload + walk back ----------
    // Wait for the wizard's save effect to flush the full draft AND
    // currentStep:'review' before reloading. The DOM-visibility
    // assertions above commit BEFORE the React save effect runs.
    await page.waitForFunction(
      (id) => {
        const raw = window.localStorage.getItem(`workflowInstance:${id}`);
        if (!raw) return false;
        try {
          const parsed = JSON.parse(raw) as {
            currentStep?: string;
            draft?: {
              recommendedPrice?: string;
              comps?: unknown[];
              pitchPoints?: { visibility?: string }[];
              pricingStrategyId?: string;
              confidence?: string;
            };
          };
          return (
            parsed.currentStep === 'review' &&
            parsed.draft?.recommendedPrice === '$700,000' &&
            (parsed.draft?.comps?.length ?? 0) === 1 &&
            // A7c.4: 2 filled rows + 1 empty seeded row → length 3.
            // The empty row is dropped by clampPitchPoint on reload.
            (parsed.draft?.pitchPoints?.length ?? 0) === 3 &&
            parsed.draft?.pitchPoints?.[0]?.visibility === 'public' &&
            parsed.draft?.pricingStrategyId === 'strategic-quick-sale' &&
            parsed.draft?.confidence === 'high'
          );
        } catch {
          return false;
        }
      },
      instanceId,
    );

    await page.reload();
    await expect(page.getByTestId('step-review')).toBeVisible();
    // Walk back to confirm each step's content survived.
    const prevButton = page.getByTestId('wizard-prev');
    await prevButton.click(); // → Step 4 Pitch
    await expect(page.getByTestId('step-pitch')).toBeVisible();
    await expect(page.getByTestId('step-pitch-title-0')).toHaveValue(
      'Premium staging + pro photography included.',
    );
    await expect(page.getByTestId('step-pitch-counter')).toHaveText(
      '1 of 2 marked public',
    );
    await prevButton.click(); // → Step 3 Strategy
    await expect(page.getByTestId('step-strategy')).toBeVisible();
    await expect(page.getByLabel('recommended-price')).toHaveValue('$700,000');
    await expect(
      page.getByTestId('step-strategy-strategy-strategic-quick-sale'),
    ).toBeChecked();
    await prevButton.click(); // → Step 2 Comps
    await expect(page.getByTestId('step-comps')).toBeVisible();
    await expect(page.getByTestId('step-comps-address-0')).toHaveValue(
      '5678 Elm Ave NE',
    );
    await expect(page.getByLabel('comp-1-sold-price')).toHaveValue('$685,000');
    await prevButton.click(); // → Step 1 Property
    await expect(page.getByTestId('step-property-address')).toHaveValue(
      '1234 Test Drive NE',
    );
  });

  test('StepReview surfaces a missing-fields blocker until export gating is satisfied', async ({
    page,
  }) => {
    await page.goto('/seller-presentation');
    await expect(page.getByTestId('step-property')).toBeVisible();

    // Satisfy Step 1 only — propertyAddress passes shell gating but
    // recommendedPrice + comps are still empty for export gating.
    await page.getByTestId('step-property-address').fill('1234 Test Drive NE');
    await expect(page.getByTestId('step-property-saved-hint')).toBeVisible();

    const nextButton = page.getByTestId('wizard-next');
    // Click through stubs straight to Review.
    for (let i = 0; i < 4; i++) {
      await nextButton.click();
    }
    await expect(page.getByTestId('step-review')).toBeVisible();

    // The missing-fields block names the first unfilled required input
    // (recommendedPrice — comes next after propertyAddress per
    // engine/types getMissingRequiredInputs order).
    const missingBlock = page.getByTestId('step-review-missing');
    await expect(missingBlock).toBeVisible();
    await expect(missingBlock).toContainText('recommended price');
    // Publish + download stay in the DOM (the buttons are always rendered
    // — graceful-fail is the design) but disable themselves until
    // validateForExport returns null.
    await expect(page.getByTestId('step-review-publish')).toBeDisabled();
    await expect(page.getByTestId('step-review-download')).toBeDisabled();
  });

  /**
   * Helper: fill the minimum-required set + drive to the Review step.
   * Used by the three publish/download specs below so each one starts
   * from a clean wizard with the export-gating satisfied.
   */
  async function fillToReview(page: import('@playwright/test').Page) {
    await page.goto('/seller-presentation');
    await expect(page.getByTestId('step-property')).toBeVisible();

    await page.getByTestId('step-property-address').fill('1234 Test Drive NE');
    const nextButton = page.getByTestId('wizard-next');
    await nextButton.click();
    await page.getByTestId('step-comps-add').click();
    await page.getByTestId('step-comps-address-0').fill('5678 Elm Ave NE');
    await page.getByLabel('comp-1-sold-price').fill('685000');
    await nextButton.click();
    await page.getByLabel('recommended-price').fill('700000');
    await nextButton.click();
    await nextButton.click(); // skip pitch — public/private toggle covered elsewhere
    await expect(page.getByTestId('step-review')).toBeVisible();
    await expect(page.getByTestId('step-review-ready')).toBeVisible();
  }

  test('StepReview publish SUCCESS: mocked 200 renders the published URL block', async ({
    page,
  }) => {
    // Intercept the publish call so the test asserts the UI state
    // transition (idle → published) without needing real auth + KV.
    // The privacy boundary itself is proven separately by
    // e2e/seller-presentation.publish-allowlist.spec.ts.
    const MOCK_SLUG = 'mockslug';
    await page.route('**/api/seller-presentation/publish', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true, slug: MOCK_SLUG }),
      });
    });

    await fillToReview(page);
    await page.getByTestId('step-review-publish').click();

    // Published-state block renders with the /h/<slug> URL + copy + revoke.
    const publishedBlock = page.getByTestId('step-review-published');
    await expect(publishedBlock).toBeVisible({ timeout: 10_000 });
    await expect(publishedBlock).toContainText(`/h/${MOCK_SLUG}`);
    await expect(publishedBlock).toContainText('Copy URL');
    await expect(publishedBlock).toContainText('Revoke this URL');
  });

  test('StepReview publish ERROR: mocked 500 surfaces a recoverable error panel', async ({
    page,
  }) => {
    // Simulate the backend being down or the request failing — the
    // ported OH Prep state machine catches it and shows a "Try again"
    // panel without crashing the wizard.
    await page.route('**/api/seller-presentation/publish', async (route) => {
      await route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ ok: false, error: 'simulated backend outage' }),
      });
    });

    await fillToReview(page);
    await page.getByTestId('step-review-publish').click();

    const errorBlock = page.getByTestId('step-review-publish-error');
    await expect(errorBlock).toBeVisible({ timeout: 10_000 });
    await expect(errorBlock).toContainText('simulated backend outage');
    // "Try again" button is present + clickable from the error state.
    await expect(
      errorBlock.getByRole('button', { name: /Try again/ }),
    ).toBeVisible();
  });

  test('StepReview prep-PDF button is DISABLED with "coming soon" copy until A7e ships', async ({
    page,
  }) => {
    // A7c.1 replaced the previous "graceful-fail against absent PDF
    // module" behavior. Dallen's mobile smoke caught the dynamic
    // import path throwing "Cannot find module '../output/prep-pdf'"
    // in the UI as an error panel, which read as broken rather than
    // intentional. The button is now hard-disabled with "coming
    // soon" copy until A7e lands the prep-PDF renderer — the
    // dynamic import path stays in handleDownloadPrep for A7e to
    // light up (its @ts-expect-error self-deletes when the file
    // arrives), but no UI route exercises it.
    await fillToReview(page);
    const button = page.getByTestId('step-review-download');
    await expect(button).toBeVisible();
    await expect(button).toBeDisabled();
    await expect(button).toContainText(/coming soon/i);
    await expect(page.getByTestId('step-review-download-error')).toHaveCount(0);
  });

  test('A7c.3: Copy URL button confirms with "Copied!" then reverts', async ({
    page,
  }) => {
    // A7c.3 — Dallen's smoke surfaced that the copy-link button gave
    // no feedback, so agents weren't sure the copy worked. The button
    // now swaps label to "Copied!" with a check icon for ~2 seconds
    // and announces it to screen readers (aria-live="polite"). The
    // clipboard call itself is best-effort; this test asserts the
    // VISIBLE state machine, since headless clipboard permissions are
    // fiddly and the user-visible affordance is what matters.
    const MOCK_SLUG = 'copyconfirm';
    await page.route('**/api/seller-presentation/publish', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true, slug: MOCK_SLUG }),
      });
    });

    await fillToReview(page);
    await page.getByTestId('step-review-publish').click();
    await expect(page.getByTestId('step-review-published')).toBeVisible({
      timeout: 10_000,
    });

    const copyUrl = page.getByTestId('step-review-copy-url');
    await expect(copyUrl).toHaveText('Copy URL');
    await expect(copyUrl).toHaveAttribute('aria-live', 'polite');

    await copyUrl.click();
    await expect(copyUrl).toContainText('Copied!');

    // Reverts back to the default label after the 2s window.
    await expect(copyUrl).toHaveText('Copy URL', { timeout: 4000 });

    // Same affordance on the sample-text copy button.
    const copySample = page.getByTestId('step-review-copy-sample');
    await expect(copySample).toHaveText('Copy sample text');
    await copySample.click();
    await expect(copySample).toContainText('Copied!');
  });
});

test.describe('Seller Presentation — A6.1 resume-on-open', () => {
  /**
   * Reproduces Dallen's smoke bug: a dashboard-tile reopen of
   * /seller-presentation (no ?id=) was losing draft state on steps
   * 2–5 because the original A5a mount logic always called
   * createInstance on an unseeded URL. A6.1 changes that branch to
   * resume the most recent in-progress instance.
   */
  test('reopening with no ?id= resumes the most recent in-progress draft', async ({
    page,
  }) => {
    // ---- Set up: create + fill a draft past Step 1 ----
    await page.goto('/seller-presentation');
    await expect(page.getByTestId('step-property')).toBeVisible();
    await page.waitForURL(/\/seller-presentation\?id=workflow_[a-z0-9]+/);
    const originalId = new URL(page.url()).searchParams.get('id')!;

    await page.getByTestId('step-property-address').fill('1234 Test Drive NE');
    const nextButton = page.getByTestId('wizard-next');
    await nextButton.click();
    await page.getByTestId('step-comps-add').click();
    await page.getByTestId('step-comps-address-0').fill('5678 Elm Ave NE');
    await page.getByLabel('comp-1-sold-price').fill('685000');
    await nextButton.click();
    await page.getByLabel('recommended-price').fill('700000');
    await nextButton.click();
    await nextButton.click(); // skip Pitch
    await expect(page.getByTestId('step-review')).toBeVisible();

    // Gate on the persisted record carrying the full state before we
    // navigate away. React commits the DOM before the save effect
    // fires; without this we'd race the localStorage write.
    await page.waitForFunction(
      (id) => {
        const raw = window.localStorage.getItem(`workflowInstance:${id}`);
        if (!raw) return false;
        try {
          const parsed = JSON.parse(raw) as {
            currentStep?: string;
            draft?: {
              recommendedPrice?: string;
              comps?: unknown[];
            };
          };
          return (
            parsed.currentStep === 'review' &&
            parsed.draft?.recommendedPrice === '$700,000' &&
            (parsed.draft?.comps?.length ?? 0) === 1
          );
        } catch {
          return false;
        }
      },
      originalId,
    );

    // ---- Repro: reopen WITHOUT ?id= (the dashboard-tile flow) ----
    await page.goto('/seller-presentation');
    // Wait for the mount effect to resolve which instance to load
    // and replace the URL accordingly. The URL eventually carries
    // the SAME id as the original draft (resume), not a new one.
    // We can't gate on a single step's testid here because the resume
    // restores `currentStep: 'review'` from the persisted record, so
    // the wizard lands on StepReview not StepProperty.
    await page.waitForFunction(
      (id) => window.location.search === `?id=${id}`,
      originalId,
    );

    // The resumed instance restored the agent's step position…
    await expect(page.getByTestId('step-review')).toBeVisible();
    await expect(page.getByText('Step 5 of 5')).toBeVisible();

    // …and the per-step content survives intact (the bug had
    // step-property restored, steps 2–5 empty).
    const prevButton = page.getByTestId('wizard-prev');
    await prevButton.click(); // → Pitch
    await prevButton.click(); // → Strategy
    await expect(page.getByLabel('recommended-price')).toHaveValue('$700,000');
    await prevButton.click(); // → Comps
    await expect(page.getByTestId('step-comps-address-0')).toHaveValue(
      '5678 Elm Ave NE',
    );
    await expect(page.getByLabel('comp-1-sold-price')).toHaveValue('$685,000');
  });

  test('"Start a new presentation" creates a fresh empty instance', async ({
    page,
  }) => {
    // Build up an existing draft first.
    await page.goto('/seller-presentation');
    await expect(page.getByTestId('step-property')).toBeVisible();
    const originalId = new URL(page.url()).searchParams.get('id')!;
    await page.getByTestId('step-property-address').fill('1234 Test Drive NE');
    await page.getByTestId('wizard-next').click();
    await page.getByTestId('step-comps-add').click();
    await page.getByTestId('step-comps-address-0').fill('5678 Elm Ave NE');

    // Click "Start a new presentation".
    await page.getByTestId('wizard-start-new').click();

    // URL now points at a different instance id, the wizard is back
    // on Step 1, and the comp from the prior draft is gone.
    await page.waitForFunction(
      (oldId) => {
        const params = new URLSearchParams(window.location.search);
        const id = params.get('id');
        return Boolean(id && id !== oldId && id.startsWith('workflow_'));
      },
      originalId,
    );
    await expect(page.getByText('Step 1 of 5')).toBeVisible();
    // Property primitive is SHARED across instances, so the address
    // legitimately persists — only the per-instance SP draft resets.
    // Verify the comps-step shows the empty-state copy.
    await page.getByTestId('wizard-next').click();
    await expect(page.getByTestId('step-comps')).toBeVisible();
    await expect(
      page.getByText(/No comps yet/),
    ).toBeVisible();
  });

  test('completed instances do NOT auto-resume — a fresh draft is created instead', async ({
    page,
  }) => {
    // Open + fill a draft, then mutate localStorage to mark it
    // complete (the wizard has no explicit "mark complete" control
    // yet — A7 work). The next no-?id= open MUST NOT resume it.
    await page.goto('/seller-presentation');
    await expect(page.getByTestId('step-property')).toBeVisible();
    const completedId = new URL(page.url()).searchParams.get('id')!;
    await page.getByTestId('step-property-address').fill('1234 Test Drive NE');
    await page.getByTestId('wizard-next').click();
    await page.getByTestId('step-comps-add').click();
    await page.getByTestId('step-comps-address-0').fill('5678 Elm Ave NE');

    // Wait for the save effect to flush before we patch the record.
    await page.waitForFunction(
      (id) => {
        const raw = window.localStorage.getItem(`workflowInstance:${id}`);
        if (!raw) return false;
        try {
          const parsed = JSON.parse(raw) as { draft?: { comps?: unknown[] } };
          return (parsed.draft?.comps?.length ?? 0) >= 1;
        } catch {
          return false;
        }
      },
      completedId,
    );

    // Mark the instance complete by patching `timestamps.completedAt`
    // directly in localStorage. (The wizard doesn't expose a
    // "mark complete" control yet; A7's dashboard polish will.)
    await page.evaluate((id) => {
      const key = `workflowInstance:${id}`;
      const raw = window.localStorage.getItem(key);
      if (!raw) return;
      const parsed = JSON.parse(raw) as {
        timestamps: { createdAt: string; updatedAt: string; completedAt?: string };
      };
      parsed.timestamps.completedAt = new Date().toISOString();
      window.localStorage.setItem(key, JSON.stringify(parsed));
    }, completedId);

    // Now reopen without ?id=. findLatestInProgress filters out the
    // completed instance → falls through to createInstance.
    await page.goto('/seller-presentation');
    await expect(page.getByTestId('step-property')).toBeVisible();
    await page.waitForURL(/\/seller-presentation\?id=workflow_[a-z0-9]+/);
    const newId = new URL(page.url()).searchParams.get('id');
    expect(newId).toBeTruthy();
    expect(newId).not.toBe(completedId);
    await expect(page.getByText('Step 1 of 5')).toBeVisible();
  });
});

test.describe('Seller Presentation — A7c wizard input round-trip', () => {
  /**
   * Drives the wizard's NEW A7c inputs end-to-end:
   *   1. Settings → fill agent-profile extensions (BrandSettings).
   *   2. Wizard Step 1 → fill structured city/state/zip + hero photo
   *      URL + preparedFor (the doubled-state cosmetic bug is gone
   *      because the renderer composes from structured fields).
   *   3. Wizard Step 4 → fill pitch points as {title, support} (the
   *      A5b legacy `text`-only shape migrated).
   *   4. Reload the wizard (banked A5a/A6.1 convention: no
   *      addInitScript clear before reload; waitForFunction on the
   *      persisted instance before navigating).
   *   5. Verify every field round-trips on resume.
   *   6. Click Publish (mocked) and assert the request body includes
   *      every new draft field + every new agentContact field.
   */
  test('property + pitch + agent extensions round-trip through resume and publish', async ({
    page,
  }) => {
    // ---- (1) Settings: agent-profile extensions ----
    await page.goto('/settings');
    // Seed the required existing brand fields so StepReview's
    // brand-incomplete warning doesn't gate publish — and so the
    // mocked publish gets a full agentContact payload to assert on.
    await page.getByPlaceholder('Aaron Thomas Home Team').fill('Marisol Reyes');
    await page.getByPlaceholder('Acme Realty').fill('Howard Hanna Real Estate');
    await page.getByPlaceholder('agent@example.com').fill('marisol@hhanna.com');
    await page.getByPlaceholder('(555) 123-4567').fill('2165550188');
    await page.getByPlaceholder('OR #...').fill('SAL.2018003412');

    // A7c agent extensions.
    await page
      .getByPlaceholder('Tacoma · Gig Harbor · Federal Way')
      .fill('Tremont · Ohio City · Detroit-Shoreway');
    // A7c.2 swapped the URL-only headshot for the shared
    // <ImageUploadField>. The URL-paste fallback is the second
    // input rendered inside it; target by test id.
    await page
      .getByTestId('brand-headshot-url')
      .fill('https://example.com/marisol.jpg');
    await page
      .getByPlaceholder(/I work with eight families/)
      .fill('I work with eight families a year, on purpose.');
    // A7c.6: years field is numeric (placeholder "11", inputMode="numeric",
    // strips non-digits on change). The stored value is a numeric string.
    await page.getByPlaceholder('11').fill('11');
    // A7c.6: CTA reassurance placeholder rewritten to fit the visible
    // width with no em-dash.
    await page
      .getByPlaceholder("No pressure. Reach out whenever you're ready.")
      .fill('A 20-minute call, no obligation.');

    // Gate on BrandSettings persisting all five extensions before
    // we leave the page — the save is debounced through useState +
    // saveBrandSettings() in BrandProfileForm.
    await page.waitForFunction(() => {
      const raw = window.localStorage.getItem('socanim_brand_settings');
      if (!raw) return false;
      try {
        const parsed = JSON.parse(raw) as Record<string, unknown>;
        return (
          parsed.agentName === 'Marisol Reyes' &&
          parsed.agentAreasServed === 'Tremont · Ohio City · Detroit-Shoreway' &&
          parsed.agentPhotoUrl === 'https://example.com/marisol.jpg' &&
          typeof parsed.agentBioShort === 'string' &&
          parsed.agentYearsInArea === '11' &&
          typeof parsed.agentCtaReassurance === 'string'
        );
      } catch {
        return false;
      }
    });

    // ---- (2) Wizard Step 1: property + personalization ----
    await page.goto('/seller-presentation');
    await expect(page.getByTestId('step-property')).toBeVisible();
    await page.waitForURL(/\/seller-presentation\?id=workflow_[a-z0-9]+/);
    const instanceId = new URL(page.url()).searchParams.get('id')!;

    await page
      .getByTestId('step-property-address')
      .fill('1742 Kenilworth Avenue');
    await page.getByTestId('step-property-city').fill('Tremont');
    await page.getByTestId('step-property-state').fill('OH');
    await page.getByTestId('step-property-zip').fill('44113');
    await page
      .getByTestId('step-property-hero-url')
      .fill('https://example.com/hero.jpg');
    await page
      .getByTestId('step-property-prepared-for')
      .fill('the Halloran family');

    await page.getByTestId('step-property-saved-hint').waitFor();

    // Click through Step 1 → Comps → fill min comp so export gating
    // can pass when we mock publish later. Then Strategy (price).
    const nextButton = page.getByTestId('wizard-next');
    await nextButton.click();
    await page.getByTestId('step-comps-add').click();
    await page.getByTestId('step-comps-address-0').fill('2218 W 14th Street');
    await page.getByLabel('comp-1-sold-price').fill('648000');
    await nextButton.click();
    await page.getByLabel('recommended-price').fill('675000');
    await nextButton.click(); // → Pitch

    // ---- (3) Wizard Step 4: pitch with title + support ----
    // A7c.4 seeds 3 empty rows on mount — fill the first two directly.
    // The third seeded-but-empty row is dropped on reload.
    await expect(page.getByTestId('step-pitch')).toBeVisible();
    await page
      .getByTestId('step-pitch-title-0')
      .fill('A photographer the magazines use.');
    await page
      .getByTestId('step-pitch-support-0')
      .fill(
        'Two-hour session, twilight pass, and a drone exterior — staged by my team the morning of.',
      );
    await page
      .getByTestId('step-pitch-title-1')
      .fill('Private prep note about pricing.');
    // A7c.6: points default to PUBLIC. Mark point 1 private explicitly
    // so it stays as a prep-only note; assert public count.
    await page.getByTestId('step-pitch-private-1').click();
    await expect(page.getByTestId('step-pitch-counter')).toHaveText(
      '1 of 2 marked public',
    );
    await nextButton.click(); // → Review

    // ---- (4) Wait for the persisted record to carry every new field
    //         BEFORE reloading. React commits the DOM before the save
    //         effect runs; without this we'd race the localStorage write. ----
    await page.waitForFunction(
      (id) => {
        const raw = window.localStorage.getItem(`workflowInstance:${id}`);
        if (!raw) return false;
        try {
          const parsed = JSON.parse(raw) as {
            currentStep?: string;
            draft?: {
              propertyAddress?: string;
              propertyCity?: string;
              propertyState?: string;
              propertyZip?: string;
              heroPhotoUrl?: string;
              preparedFor?: string;
              pitchPoints?: Array<{
                title?: string;
                support?: string;
                visibility?: string;
              }>;
            };
          };
          const d = parsed.draft;
          if (!d) return false;
          return (
            parsed.currentStep === 'review' &&
            d.propertyAddress === '1742 Kenilworth Avenue' &&
            d.propertyCity === 'Tremont' &&
            d.propertyState === 'OH' &&
            d.propertyZip === '44113' &&
            d.heroPhotoUrl === 'https://example.com/hero.jpg' &&
            d.preparedFor === 'the Halloran family' &&
            // A7c.4: 2 filled + 1 empty seeded row = 3 persisted; the
            // empty row drops out on reload via clampPitchPoint.
            (d.pitchPoints?.length ?? 0) === 3 &&
            d.pitchPoints?.[0]?.title === 'A photographer the magazines use.' &&
            d.pitchPoints?.[0]?.visibility === 'public' &&
            typeof d.pitchPoints?.[0]?.support === 'string'
          );
        } catch {
          return false;
        }
      },
      instanceId,
    );

    // ---- (5) Reload + verify every field restored ----
    await page.reload();
    await expect(page.getByTestId('step-review')).toBeVisible();
    const prev = page.getByTestId('wizard-prev');
    await prev.click(); // → Pitch
    await expect(page.getByTestId('step-pitch-title-0')).toHaveValue(
      'A photographer the magazines use.',
    );
    await expect(page.getByTestId('step-pitch-support-0')).toHaveValue(
      'Two-hour session, twilight pass, and a drone exterior — staged by my team the morning of.',
    );
    await prev.click(); // → Strategy
    await prev.click(); // → Comps
    await prev.click(); // → Property
    await expect(page.getByTestId('step-property-address')).toHaveValue(
      '1742 Kenilworth Avenue',
    );
    await expect(page.getByTestId('step-property-city')).toHaveValue('Tremont');
    await expect(page.getByTestId('step-property-state')).toHaveValue('OH');
    await expect(page.getByTestId('step-property-zip')).toHaveValue('44113');
    await expect(page.getByTestId('step-property-hero-url')).toHaveValue(
      'https://example.com/hero.jpg',
    );
    await expect(page.getByTestId('step-property-prepared-for')).toHaveValue(
      'the Halloran family',
    );

    // ---- (6) Walk forward to Review + mock publish; capture body ----
    let publishBody: unknown;
    await page.route('**/api/seller-presentation/publish', async (route) => {
      try {
        publishBody = route.request().postDataJSON();
      } catch {
        publishBody = null;
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true, slug: 'a7c-roundtrip' }),
      });
    });

    const next = page.getByTestId('wizard-next');
    await next.click();
    await next.click();
    await next.click();
    await next.click();
    await expect(page.getByTestId('step-review')).toBeVisible();
    await expect(page.getByTestId('step-review-ready')).toBeVisible();
    await page.getByTestId('step-review-publish').click();
    await expect(page.getByTestId('step-review-published')).toBeVisible({
      timeout: 10_000,
    });

    // The publish body should carry every new field — both on draft
    // and on agentContact — so the serializer + page renderer can
    // read them downstream.
    const body = publishBody as {
      draft?: Record<string, unknown>;
      agentContact?: Record<string, unknown>;
    } | null;
    expect(body).not.toBeNull();
    expect(body!.draft).toBeDefined();
    expect(body!.draft!.propertyCity).toBe('Tremont');
    expect(body!.draft!.propertyState).toBe('OH');
    expect(body!.draft!.propertyZip).toBe('44113');
    expect(body!.draft!.heroPhotoUrl).toBe('https://example.com/hero.jpg');
    expect(body!.draft!.preparedFor).toBe('the Halloran family');
    const pitchPoints = body!.draft!.pitchPoints as Array<{
      title?: string;
      support?: string;
      visibility?: string;
    }>;
    // A7c.4 seeds 3 starting rows on mount. Two get filled here; the
    // third stays empty on the wire (the server's clampDraft drops it,
    // and the public payload filters by `visibility === 'public'` AND
    // by projectPitchCard's content check — so /h/[slug] never sees
    // the empty card). The body asserts on the FILLED public point.
    expect(pitchPoints.length).toBeGreaterThanOrEqual(2);
    const firstPublic = pitchPoints.find((p) => p.visibility === 'public');
    expect(firstPublic).toBeDefined();
    expect(firstPublic!.title).toBe('A photographer the magazines use.');
    expect(typeof firstPublic!.support).toBe('string');

    expect(body!.agentContact).toBeDefined();
    expect(body!.agentContact!.name).toBe('Marisol Reyes');
    expect(body!.agentContact!.brokerage).toBe('Howard Hanna Real Estate');
    expect(body!.agentContact!.areasServed).toBe(
      'Tremont · Ohio City · Detroit-Shoreway',
    );
    expect(body!.agentContact!.photoUrl).toBe('https://example.com/marisol.jpg');
    expect(typeof body!.agentContact!.bioShort).toBe('string');
    expect(body!.agentContact!.yearsInArea).toBe('11');
    expect(typeof body!.agentContact!.ctaReassurance).toBe('string');
  });
});

/**
 * Seller Presentation — A7c.4 Pitch step guidance.
 *
 * Two distinct things to lock in:
 *
 *   (1) Per-row example placeholders ROTATE so the agent reads them
 *       as inspiration, not a canned default. Asserted by checking
 *       the first three rows carry different `placeholder` attributes.
 *
 *   (2) The strength signal — dots + one microcopy line — reads off
 *       filled rows: 0 → neutral, 1–2 → amber, ≥3 → green. The
 *       message text shifts at each threshold. Reassurance only —
 *       no publish gating, so this spec stays focused on the meter
 *       UI without touching wire/persistence behavior (covered by
 *       the round-trip tests above).
 *
 * Both rely on the seed-on-mount behavior: landing on Step 4 with an
 * empty draft puts 3 rows on screen immediately, no clicks needed.
 */
test.describe('Seller Presentation — A7c.4 Pitch step guidance', () => {
  test('per-row placeholders rotate; strength meter transitions neutral → amber → green', async ({
    page,
  }) => {
    await page.goto('/seller-presentation');
    await expect(page.getByTestId('step-property')).toBeVisible();
    await page.waitForURL(/\/seller-presentation\?id=workflow_[a-z0-9]+/);

    // Walk to Step 4. Step 1 needs a saved propertyId before Next
    // unlocks; the other steps are gate-free for traversal.
    await page.getByTestId('step-property-address').fill('1234 Test Drive NE');
    await page.getByTestId('step-property-city').fill('Tacoma, WA');
    await expect(page.getByTestId('step-property-saved-hint')).toBeVisible();
    const nextButton = page.getByTestId('wizard-next');
    await expect(nextButton).toBeEnabled();
    await nextButton.click(); // → Comps
    await nextButton.click(); // → Strategy
    await nextButton.click(); // → Pitch

    await expect(page.getByTestId('step-pitch')).toBeVisible();

    // (1) Three rows are seeded on mount (no clicks needed).
    await expect(page.getByTestId('step-pitch-card-0')).toBeVisible();
    await expect(page.getByTestId('step-pitch-card-1')).toBeVisible();
    await expect(page.getByTestId('step-pitch-card-2')).toBeVisible();

    // (1) Each row's title placeholder is DIFFERENT — varied by index.
    const placeholder0 = await page
      .getByTestId('step-pitch-title-0')
      .getAttribute('placeholder');
    const placeholder1 = await page
      .getByTestId('step-pitch-title-1')
      .getAttribute('placeholder');
    const placeholder2 = await page
      .getByTestId('step-pitch-title-2')
      .getAttribute('placeholder');
    expect(placeholder0).toBeTruthy();
    expect(placeholder1).toBeTruthy();
    expect(placeholder2).toBeTruthy();
    expect(placeholder0).not.toBe(placeholder1);
    expect(placeholder1).not.toBe(placeholder2);
    expect(placeholder0).not.toBe(placeholder2);
    // The placeholders are prefixed "e.g. " — the example body lives
    // after that, and the convention from PITCH_EXAMPLES is < ~32
    // chars so it fits on a phone.
    for (const p of [placeholder0!, placeholder1!, placeholder2!]) {
      expect(p.startsWith('e.g. ')).toBe(true);
      // Generous upper bound — guards against an accidentally
      // overlong example slipping in.
      expect(p.length).toBeLessThanOrEqual(48);
    }

    // (2) Strength meter starts at "neutral" with 0 filled rows.
    const meter = page.getByTestId('step-pitch-strength');
    await expect(meter).toHaveAttribute('data-level', 'neutral');
    await expect(meter).toHaveAttribute('data-filled', '0');
    await expect(page.getByTestId('step-pitch-strength-message')).toHaveText(
      'Add 2 to 4 selling points.',
    );

    // Fill row 0 → 1 filled → amber.
    await page.getByTestId('step-pitch-title-0').fill('Chef-grade kitchen');
    await expect(meter).toHaveAttribute('data-level', 'amber');
    await expect(meter).toHaveAttribute('data-filled', '1');
    await expect(page.getByTestId('step-pitch-strength-message')).toHaveText(
      'A couple more makes it stronger.',
    );

    // Fill row 1 → 2 filled → still amber.
    await page.getByTestId('step-pitch-title-1').fill('Walk-to-everything');
    await expect(meter).toHaveAttribute('data-level', 'amber');
    await expect(meter).toHaveAttribute('data-filled', '2');

    // Fill row 2 → 3 filled → green (sweet-spot wording, no scolding).
    await page.getByTestId('step-pitch-title-2').fill('Move-in ready');
    await expect(meter).toHaveAttribute('data-level', 'green');
    await expect(meter).toHaveAttribute('data-filled', '3');
    await expect(page.getByTestId('step-pitch-strength-message')).toHaveText(
      'Looks great. 4 strong points is plenty.',
    );

    // Add button de-emphasizes at the sweet spot (still present, but
    // styled as a ghost affordance). The test reads the data-emphasis
    // attribute the component sets so styling can evolve without
    // breaking the assertion.
    await expect(page.getByTestId('step-pitch-add')).toHaveAttribute(
      'data-emphasis',
      'ghost',
    );

    // Add a 4th row → still green; meter widens, message stays.
    await page.getByTestId('step-pitch-add').click();
    await page.getByTestId('step-pitch-title-3').fill('Top-rated schools');
    await expect(meter).toHaveAttribute('data-level', 'green');
    await expect(meter).toHaveAttribute('data-filled', '4');

    // Counter denominator reflects FILLED rows, not total slots —
    // all 4 filled, all public-by-default per A7c.6.
    await expect(page.getByTestId('step-pitch-counter')).toHaveText(
      '4 of 4 marked public',
    );

    // Soft cap: adding rows up to the cap hides the add control and
    // surfaces the "you've added the most" microcopy. Two more clicks
    // (we already have 4 rows on screen) push to 6.
    await page.getByTestId('step-pitch-add').click(); // 5
    await page.getByTestId('step-pitch-add').click(); // 6
    await expect(page.getByTestId('step-pitch-add')).toHaveCount(0);
    await expect(page.getByTestId('step-pitch-cap-reached')).toBeVisible();
  });
});

/**
 * Seller Presentation — A7c.6 Pitch default visibility.
 *
 * v1.46 defaulted new pitch points to PRIVATE. A first-time agent
 * filling points quickly expected them on the buyer's page; defaulting
 * private silently dropped them. A7c.6 flips the default to PUBLIC.
 *
 * The empty-row safeguard is unchanged: `projectPitchCard` in the
 * public-payload serializer filters out content-less rows, so a
 * seeded-but-unfilled public point still cannot render on /h/[slug].
 * The complementary unit assertion lives in
 * e2e/seller-presentation.publish-allowlist.spec.ts — this spec
 * locks in the WIZARD-side default only.
 */
test.describe('Seller Presentation — A7c.6 Pitch default visibility', () => {
  test('seeded and newly-added pitch points default to PUBLIC', async ({
    page,
  }) => {
    await page.goto('/seller-presentation');
    await expect(page.getByTestId('step-property')).toBeVisible();
    await page.waitForURL(/\/seller-presentation\?id=workflow_[a-z0-9]+/);

    // Walk to the Pitch step (Step 1 gates on a saved propertyId; the
    // others are gate-free for traversal).
    await page.getByTestId('step-property-address').fill('1234 Test Drive NE');
    await page.getByTestId('step-property-city').fill('Tacoma, WA');
    await expect(page.getByTestId('step-property-saved-hint')).toBeVisible();
    const nextButton = page.getByTestId('wizard-next');
    await expect(nextButton).toBeEnabled();
    await nextButton.click(); // → Comps
    await nextButton.click(); // → Strategy
    await nextButton.click(); // → Pitch
    await expect(page.getByTestId('step-pitch')).toBeVisible();

    // The 3 seeded rows on first mount all carry visibility:'public'
    // by default. aria-checked is the source of truth on the toggle.
    for (const idx of [0, 1, 2]) {
      await expect(
        page.getByTestId(`step-pitch-public-${idx}`),
      ).toHaveAttribute('aria-checked', 'true');
      await expect(
        page.getByTestId(`step-pitch-private-${idx}`),
      ).toHaveAttribute('aria-checked', 'false');
    }

    // A newly added row also defaults to public.
    await page.getByTestId('step-pitch-add').click();
    await expect(page.getByTestId('step-pitch-card-3')).toBeVisible();
    await expect(page.getByTestId('step-pitch-public-3')).toHaveAttribute(
      'aria-checked',
      'true',
    );
    await expect(page.getByTestId('step-pitch-private-3')).toHaveAttribute(
      'aria-checked',
      'false',
    );

    // Filling a title without touching the toggle leaves it public —
    // counter reads "1 of 1 marked public" once row 0 has content
    // (the unfilled rows don't count toward the denominator).
    await page.getByTestId('step-pitch-title-0').fill('Chef-grade kitchen');
    await expect(page.getByTestId('step-pitch-counter')).toHaveText(
      '1 of 1 marked public',
    );
  });
});
