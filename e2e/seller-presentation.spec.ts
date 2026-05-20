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
    await expect(page.getByTestId('step-pitch')).toBeVisible();
    await page.getByTestId('step-pitch-add').click();
    await page.getByTestId('step-pitch-add').click();
    await page
      .getByTestId('step-pitch-text-0')
      .fill('Premium staging + pro photography included.');
    await page
      .getByTestId('step-pitch-text-1')
      .fill('My private internal target: net $665k after closing costs.');
    // First point: public. Second: stays private (default).
    await page.getByTestId('step-pitch-public-0').click();
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
            (parsed.draft?.pitchPoints?.length ?? 0) === 2 &&
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
    await expect(page.getByTestId('step-pitch-text-0')).toHaveValue(
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

  test('StepReview download: graceful-fail against absent PDF module (A7 lands it)', async ({
    page,
  }) => {
    // The prep-PDF dynamic import targets ../output/prep-pdf, which
    // A7 ships. Until then the import throws ModuleNotFoundError and
    // the catch surfaces the download-error message. The publish
    // mock isn't needed here — the download path is independent.
    await fillToReview(page);
    await page.getByTestId('step-review-download').click();
    await expect(page.getByTestId('step-review-download-error')).toBeVisible({
      timeout: 10_000,
    });
  });
});
