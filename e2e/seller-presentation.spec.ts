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

    // Traverse all 6 steps via Next. Each stub renders its testid.
    await nextButton.click();
    await expect(page.getByTestId('step-comps')).toBeVisible();

    await nextButton.click();
    await expect(page.getByTestId('step-strategy')).toBeVisible();

    await nextButton.click();
    await expect(page.getByTestId('step-pitch')).toBeVisible();

    // A7d — fully optional Editorial step sits between Pitch and Review.
    await nextButton.click();
    await expect(page.getByTestId('step-editorial')).toBeVisible();

    await nextButton.click();
    await expect(page.getByTestId('step-review')).toBeVisible();

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

    // Walk back to Step 1 and confirm the address survived. A7d adds
    // the optional editorial step between Pitch and Review, so it now
    // takes 5 prev clicks (Review → Editorial → Pitch → Strategy →
    // Comps → Property).
    const prevButton = page.getByTestId('wizard-prev');
    for (let i = 0; i < 5; i++) {
      await prevButton.click();
    }
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

    // ---------- Step 5: Editorial (skip — fully optional, A7d) ----------
    await expect(page.getByTestId('step-editorial')).toBeVisible();
    await nextButton.click();

    // ---------- Step 6: Review ----------
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
    await prevButton.click(); // → Step 5 Editorial (A7d, fully optional)
    await expect(page.getByTestId('step-editorial')).toBeVisible();
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
    // Click through stubs straight to Review. A7d added the optional
    // Editorial step between Pitch and Review, so it now takes 5
    // clicks (Property → Comps → Strategy → Pitch → Editorial → Review).
    for (let i = 0; i < 5; i++) {
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
    await nextButton.click(); // skip editorial — fully optional (A7d)
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

  test('A7e — StepReview prep-PDF button is LIVE and enabled when the draft is complete', async ({
    page,
  }) => {
    // A7c.1 had this button hard-disabled with "coming soon" copy
    // until A7e shipped the prep-PDF renderer. A7e lands
    // ../output/prep-pdf, removes the disabled state, and gives the
    // button its agent-only label. The download itself is a binary
    // PDF blob — verifying the file content lives in the dedicated
    // prep-pdf spec (e2e/seller-presentation.prep-pdf.spec.ts); here
    // we only assert the UI state.
    await fillToReview(page);
    const button = page.getByTestId('step-review-download');
    await expect(button).toBeVisible();
    await expect(button).toBeEnabled();
    await expect(button).toContainText(/download prep pdf/i);
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

  /**
   * A7c.5 — the post-publish "sample text to send" used to be a single
   * generic line ("Hey, here's the listing presentation for…"). It now
   * threads in the seller's name, the property, the live URL, and the
   * agent's signature so the agent can paste it straight into iMessage
   * without editing. Two scenarios cover both the happy path and the
   * graceful-fallback contract: a missing seller name must become
   * "Hi there," (not a literal `{{seller_name}}`), and no input
   * combination is allowed to leak a `{{` into the rendered copy.
   */
  test('A7c.5: sample text fills tokens from draft + brand and never leaks {{', async ({
    page,
    context,
  }) => {
    const MOCK_SLUG = 'sampletoken';
    await page.route('**/api/seller-presentation/publish', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true, slug: MOCK_SLUG }),
      });
    });

    // Seed brand settings so brand.agentName feeds the signature line.
    // addInitScript fires on every navigation — that's fine here, the
    // seed is idempotent and we never mutate it mid-test.
    await context.addInitScript(() => {
      window.localStorage.setItem(
        'socanim_brand_settings',
        JSON.stringify({
          agentName: 'Aaron Thomas',
          brokerage: '',
          contactPhone: '',
          contactEmail: '',
          licenseNumber: '',
          logoDataUrl: '',
          agentPhotoUrl: '',
          agentBioShort: '',
          agentAreasServed: '',
          agentYearsInArea: '',
          agentCtaReassurance: '',
        }),
      );
    });

    await page.goto('/seller-presentation');
    await expect(page.getByTestId('step-property')).toBeVisible();

    await page.getByTestId('step-property-address').fill('1234 Test Drive NE');
    await page.getByTestId('step-property-city').fill('Tacoma, WA');
    await page
      .getByTestId('step-property-prepared-for')
      .fill('the Halloran family');

    const nextButton = page.getByTestId('wizard-next');
    await nextButton.click();
    await page.getByTestId('step-comps-add').click();
    await page.getByTestId('step-comps-address-0').fill('5678 Elm Ave NE');
    await page.getByLabel('comp-1-sold-price').fill('685000');
    await nextButton.click();
    await page.getByLabel('recommended-price').fill('700000');
    await nextButton.click();
    await nextButton.click(); // skip pitch
    await nextButton.click(); // skip editorial (A7d, fully optional)
    await expect(page.getByTestId('step-review')).toBeVisible();
    await expect(page.getByTestId('step-review-ready')).toBeVisible();

    await page.getByTestId('step-review-publish').click();
    await expect(page.getByTestId('step-review-published')).toBeVisible({
      timeout: 10_000,
    });

    const sample = page.getByTestId('step-review-sample-text');
    const sampleText = (await sample.textContent()) ?? '';

    // No literal token survives token-fill — regardless of which path
    // (filled or fallback) was taken for any individual field.
    expect(sampleText).not.toContain('{{');
    expect(sampleText).not.toContain('}}');
    // Em-dash sweep: the whole codebase is being scrubbed of them.
    expect(sampleText).not.toContain('—');

    // Greeting threads in the preparedFor phrase verbatim (the leading
    // "the " phrasing reads as a greeting subject — "Hi the Halloran
    // family,").
    expect(sampleText).toContain('Hi the Halloran family,');
    // Address + city compose into one human-readable line.
    expect(sampleText).toContain(
      'I put together the presentation for 1234 Test Drive NE, Tacoma, WA so you can review',
    );
    // The published /h/<slug> URL is in the link line.
    expect(sampleText).toMatch(/Here's the link: https?:\/\/[^\s]+\/h\/sampletoken/);
    // Signature line is the agent's name from brand settings.
    expect(sampleText.trim().split('\n').slice(-1)[0]).toBe('Aaron Thomas');
  });

  test('A7c.5: missing seller name falls back to "Hi there,"', async ({
    page,
  }) => {
    // No preparedFor entered + no brand.agentName seeded. The greeting
    // must drop to "Hi there," and the signature line must be omitted
    // entirely (no trailing blank, no literal token).
    await page.route('**/api/seller-presentation/publish', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true, slug: 'fallback' }),
      });
    });

    await page.goto('/seller-presentation');
    await expect(page.getByTestId('step-property')).toBeVisible();

    await page.getByTestId('step-property-address').fill('99 Anonymous Lane');
    // Intentionally skip city + preparedFor.
    const nextButton = page.getByTestId('wizard-next');
    await nextButton.click();
    await page.getByTestId('step-comps-add').click();
    await page.getByTestId('step-comps-address-0').fill('5678 Elm Ave NE');
    await page.getByLabel('comp-1-sold-price').fill('685000');
    await nextButton.click();
    await page.getByLabel('recommended-price').fill('700000');
    await nextButton.click();
    await nextButton.click(); // skip pitch
    await nextButton.click(); // skip editorial (A7d, fully optional)
    await expect(page.getByTestId('step-review')).toBeVisible();

    await page.getByTestId('step-review-publish').click();
    await expect(page.getByTestId('step-review-published')).toBeVisible({
      timeout: 10_000,
    });

    const sample = page.getByTestId('step-review-sample-text');
    const sampleText = (await sample.textContent()) ?? '';

    expect(sampleText).not.toContain('{{');
    expect(sampleText).not.toContain('}}');
    expect(sampleText).toContain('Hi there,');
    // Address with no city = street only (no trailing comma).
    expect(sampleText).toContain(
      'I put together the presentation for 99 Anonymous Lane so you can review',
    );
    // Signature line omitted entirely — last non-link line is the
    // closing sentence, not a stray blank or agent token.
    const lines = sampleText
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l.length > 0);
    expect(lines[lines.length - 1]).toMatch(/walk through it with you\.$/);
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
    await nextButton.click(); // skip Editorial (A7d, fully optional)
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

    // …and the per-step content survives intact (the bug had
    // step-property restored, steps 2–5 empty).
    const prevButton = page.getByTestId('wizard-prev');
    await prevButton.click(); // → Editorial (A7d, fully optional)
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
    await nextButton.click(); // → Editorial (A7d, fully optional — skip)
    await expect(page.getByTestId('step-editorial')).toBeVisible();
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
    await prev.click(); // → Editorial (A7d)
    await expect(page.getByTestId('step-editorial')).toBeVisible();
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
    // A7c.7: the paste-URL fallback unmounts once a value is set
    // (post-upload URL readout is suppressed). On reload, the value
    // is rehydrated and the preview takes over — the persisted URL
    // is asserted on the preview's src instead.
    await expect(page.getByTestId('step-property-hero-preview')).toHaveAttribute(
      'src',
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
    // Property → Comps → Strategy → Pitch → Editorial (A7d) → Review.
    await next.click();
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

/**
 * Seller Presentation — A7d editorial extras (the optional step, after
 * A7d.1's subtraction).
 *
 * A7d.1 removed agentNote, trackRecord, buyerQuote, and editorialPhoto
 * from the wizard entirely. What remains is video, reviews, and the
 * area-stats snapshot (the chart). The two scenarios here mirror the
 * surviving surface:
 *
 *   1. ROUND-TRIP. Fill video + reviews + areaStats (incl. a monthly
 *      series entry). Wait for persistence, reload, walk back to the
 *      editorial step, confirm values restored. Publish (mocked) and
 *      assert the wire carries each surviving field.
 *
 *   2. SKIP-ALL. Walk straight through the editorial step untouched,
 *      publish (mocked), and assert no editorial content on the wire.
 *
 * No assertions about the consumer-page renderer here — A7b's render
 * spec covers hide-when-empty for every block. This file owns only the
 * wizard input + the publish wire.
 */
test.describe('Seller Presentation — A7d editorial extras', () => {
  test('round-trip: surviving editorial blocks fill, persist, resume, and reach publish', async ({
    page,
  }) => {
    // A7d.3 → A7d.3.1: the video field is now a camera-roll upload
    // that pushes the file BROWSER → Vercel Blob directly (bypassing
    // the Function's ~4.5 MB request-body cap). The round-trip test
    // still drives the field end-to-end, with three layers
    // short-circuited so no real Blob endpoint is touched:
    //
    //   1. HTMLVideoElement.src setter → after the real assignment,
    //      stamps duration + fires loadedmetadata so the field's
    //      duration-cap check passes without a real MP4 container.
    //   2. globalThis.fetch override → intercepts both calls the
    //      `@vercel/blob/client` SDK makes during upload():
    //         - POST /api/upload-video (token handshake) returns a
    //           well-shaped `clientToken`.
    //         - POST to the Blob API URL (file body) returns a
    //           PutBlobResult with our MOCK_VIDEO_URL.
    //      Without the fetch override the SDK's real upload would
    //      fail (no real BLOB_READ_WRITE_TOKEN in test), which would
    //      abort the field BEFORE onChange fires and the localStorage
    //      assertion would never be reachable.
    const MOCK_VIDEO_URL = 'https://blob.example.com/video/mock-walkthrough.mp4';
    await page.addInitScript(
      ({ MOCK_VIDEO_URL }) => {
        // Duration probe stub — only mutates DETACHED <video>
        // elements (the field's probe element has no parent yet) so
        // an in-document <video> on the seller page is unaffected.
        const stubStore = new WeakMap<HTMLVideoElement, string>();
        Object.defineProperty(HTMLVideoElement.prototype, 'src', {
          configurable: true,
          get(this: HTMLVideoElement) {
            return stubStore.get(this) ?? '';
          },
          set(this: HTMLVideoElement, value: string) {
            stubStore.set(this, value);
            Object.defineProperty(this, 'duration', {
              configurable: true,
              value: 14,
            });
            queueMicrotask(() =>
              this.dispatchEvent(new Event('loadedmetadata')),
            );
          },
        });

        // SDK call interceptor — sits in front of every fetch the
        // page makes, but only returns canned responses for the two
        // call shapes the @vercel/blob/client upload() flow uses.
        // Everything else (auth, persistence, etc.) falls through to
        // the real fetch.
        const origFetch = globalThis.fetch.bind(globalThis);
        globalThis.fetch = async (
          input: RequestInfo | URL,
          init?: RequestInit,
        ): Promise<Response> => {
          const url =
            typeof input === 'string'
              ? input
              : input instanceof URL
                ? input.href
                : input.url;
          // Token handshake + upload-completed both POST to the
          // route. Branch on the body's discriminator.
          if (
            url.includes('/api/upload-video') &&
            (init?.method || '').toUpperCase() === 'POST'
          ) {
            const bodyStr =
              typeof init?.body === 'string' ? init.body : '';
            try {
              const parsed = JSON.parse(bodyStr) as { type?: string };
              if (parsed.type === 'blob.generate-client-token') {
                return new Response(
                  JSON.stringify({
                    type: 'blob.generate-client-token',
                    // Token format expected by the SDK is split on
                    // "_" with index 3 being the storeId. The SDK
                    // never validates the signature client-side — it
                    // just decomposes the string to find the storeId
                    // and forwards the rest as a Bearer header.
                    clientToken:
                      'vercel_blob_client_storeFakeE2E_fakeSignature',
                  }),
                  {
                    status: 200,
                    headers: { 'content-type': 'application/json' },
                  },
                );
              }
              if (parsed.type === 'blob.upload-completed') {
                return new Response(
                  JSON.stringify({
                    type: 'blob.upload-completed',
                    response: 'ok',
                  }),
                  {
                    status: 200,
                    headers: { 'content-type': 'application/json' },
                  },
                );
              }
            } catch {
              /* falls through to real fetch */
            }
          }

          // Actual file upload — the SDK posts to the Blob API URL
          // (defaultVercelBlobApiUrl = "https://vercel.com/api/blob"
          // unless NEXT_PUBLIC_VERCEL_BLOB_API_URL overrides it).
          // Return a PutBlobResult shape that resolves upload() with
          // our mock URL.
          if (
            url.startsWith('https://vercel.com/api/blob') ||
            url.includes('blob.vercel-storage.com')
          ) {
            return new Response(
              JSON.stringify({
                url: MOCK_VIDEO_URL,
                downloadUrl: MOCK_VIDEO_URL,
                pathname: 'seller-presentation-video/mock.mp4',
                contentType: 'video/mp4',
                contentDisposition:
                  'attachment; filename="mock.mp4"',
              }),
              {
                status: 200,
                headers: { 'content-type': 'application/json' },
              },
            );
          }

          return origFetch(input, init);
        };
      },
      { MOCK_VIDEO_URL },
    );

    await page.goto('/seller-presentation');
    await expect(page.getByTestId('step-property')).toBeVisible();
    await page.waitForURL(/\/seller-presentation\?id=workflow_[a-z0-9]+/);
    const instanceId = new URL(page.url()).searchParams.get('id')!;

    // Walk through Steps 1–4 with the minimum-required + drive into
    // the editorial step.
    await page.getByTestId('step-property-address').fill('1742 Kenilworth Avenue');
    await page.getByTestId('step-property-city').fill('Tremont');
    await page.getByTestId('step-property-state').fill('OH');
    await page.getByTestId('step-property-zip').fill('44113');
    const nextButton = page.getByTestId('wizard-next');
    await nextButton.click();
    await page.getByTestId('step-comps-add').click();
    await page.getByTestId('step-comps-address-0').fill('2218 W 14th Street');
    await page.getByLabel('comp-1-sold-price').fill('648000');
    await nextButton.click();
    await page.getByLabel('recommended-price').fill('675000');
    await nextButton.click();
    await nextButton.click(); // skip pitch — covered elsewhere
    await expect(page.getByTestId('step-editorial')).toBeVisible();

    // (a) Video — drive the new VideoUploadField. Mocked
    // /api/upload-video returns MOCK_VIDEO_URL; the stubbed
    // HTMLVideoElement.src setter resolves the duration probe so
    // the upload proceeds.
    await page.getByTestId('step-editorial-video-add').click();
    const fakeBuffer = Buffer.alloc(2048, 0);
    const [chooser] = await Promise.all([
      page.waitForEvent('filechooser'),
      page.getByTestId('step-editorial-video-upload').click(),
    ]);
    await chooser.setFiles([
      { name: 'walkthrough.mp4', mimeType: 'video/mp4', buffer: fakeBuffer },
    ]);
    // Wait for the preview <video> to materialize.
    //
    // A7d.8.3: the wizard preview now sources from the LOCAL objectURL
    // while available (`blob:…`) and falls back to the hosted URL after
    // reload. That swap lets the slider seek the preview with fast
    // random-access on iOS instead of fetching hosted-video chunks
    // per seek. So immediately after upload we expect a blob: src
    // here, NOT the hosted URL. The hosted-URL round-trip contract is
    // still proven below by the localStorage assertion
    // (`d.video?.videoUrl === MOCK_VIDEO_URL`) and by the post-reload
    // assertion further down (after reload the local File is gone, so
    // the preview falls back to the hosted URL).
    const videoPreview = page.getByTestId('step-editorial-video-preview');
    await expect(videoPreview).toBeVisible({ timeout: 10_000 });
    const previewSrc = await videoPreview.getAttribute('src');
    expect(previewSrc).toMatch(/^blob:/);

    await page
      .getByTestId('step-editorial-video-title')
      .fill('A walk-through of your plan.');
    // Runtime is auto-filled from the (stubbed) 14-second duration —
    // "0:14". The test asserts the format below in the localStorage
    // wait. The field stays editable as a fallback per the brief.
    await page
      .getByTestId('step-editorial-video-recorded-on')
      .fill('2026-05-19');

    // A7d.2 — reviews relocated out of the editorial step into brand
    // Settings. The reviews card no longer exists here; the
    // editorial-step covers video + areaStats only.

    // (b) Area stats — one median sale, one delta, one month entry.
    // The month entry is what feeds the neighborhood chart on the
    // published page.
    //
    // A7d.4: every Area-snapshot field now uses the formatted-input
    // family (currency keypad + $ formatting, percent input with
    // auto-% on blur, native month picker). The test drives the
    // post-A7d.4 controls and asserts the post-format storage values.
    await page.getByTestId('step-editorial-areaStats-add').click();
    // Median sale → CurrencyInput. Type raw digits; the component
    // formats to "$642,000" on every keystroke.
    // (Formatted inputs are reached by aria-label, matching the comps
    // step pattern — they don't expose data-testid passthroughs.)
    await page.getByLabel('area-median-sale').fill('642000');
    // YoY → PercentInput (signed). Type "+4.6"; "%" appended on blur.
    await page.getByLabel('area-yoy').fill('+4.6');
    await page.getByLabel('area-yoy').blur();
    // DOM → NumberInput (numeric keypad + commas on blur).
    await page.getByLabel('area-dom').fill('14');
    // DOM comparison stays as text — short usable example placeholder.
    await page
      .getByTestId('step-editorial-area-dom-comp')
      .fill('vs Tremont avg 21');
    // Closings → NumberInput.
    await page.getByLabel('area-closings').fill('38');
    // List-to-sale ratio → PercentInput.
    await page.getByLabel('area-ratio').fill('101');
    await page.getByLabel('area-ratio').blur();
    // Month chart input — A7d.4 redesign: native month picker for the
    // anchor + count stepper for how many months back, auto-generated
    // labels, one CurrencyInput per row. Agent only enters prices.
    await page
      .getByTestId('step-editorial-area-latest-month')
      .fill('2026-05');
    await page.getByTestId('step-editorial-area-month-count').fill('1');
    await page
      .getByLabel('area-month-0-price')
      .fill('642000');

    // Advance to Review so currentStep persists past 'editorial'.
    await nextButton.click();
    await expect(page.getByTestId('step-review')).toBeVisible();

    // ---- Wait for persistence before reload ----
    await page.waitForFunction(
      ({ id, url }) => {
        const raw = window.localStorage.getItem(`workflowInstance:${id}`);
        if (!raw) return false;
        try {
          const parsed = JSON.parse(raw) as {
            currentStep?: string;
            draft?: {
              video?: {
                videoUrl?: string;
                title?: string;
                runtime?: string;
                recordedOn?: string;
              };
              areaStats?: {
                medianSale?: string;
                monthlySeries?: Array<{ month?: string; medianPrice?: string }>;
              };
            };
          };
          const d = parsed.draft;
          if (!d) return false;
          return (
            parsed.currentStep === 'review' &&
            d.video?.videoUrl === url &&
            d.video?.title === 'A walk-through of your plan.' &&
            // Runtime is auto-filled from the stubbed 14-second
            // duration → "0:14" via the new formatter.
            d.video?.runtime === '0:14' &&
            d.video?.recordedOn === '2026-05-19' &&
            // A7d.4: CurrencyInput formats "642000" → "$642,000",
            // PercentInput's blur appends "%" → "+4.6%", and the
            // auto-month editor labels "2026-05" as "May '26".
            d.areaStats?.medianSale === '$642,000' &&
            (d.areaStats?.monthlySeries?.length ?? 0) === 1 &&
            d.areaStats?.monthlySeries?.[0]?.month === "May '26"
          );
        } catch {
          return false;
        }
      },
      { id: instanceId, url: MOCK_VIDEO_URL },
    );

    // ---- Reload + walk back to Editorial; resume restores each value ----
    await page.reload();
    await expect(page.getByTestId('step-review')).toBeVisible();
    await page.getByTestId('wizard-prev').click(); // → Editorial
    await expect(page.getByTestId('step-editorial')).toBeVisible();

    // The video preview re-renders from the persisted hosted URL —
    // proves draft.video.videoUrl round-tripped through localStorage
    // back into the VideoUploadField's state.
    await expect(
      page.getByTestId('step-editorial-video-preview'),
    ).toHaveAttribute('src', MOCK_VIDEO_URL);
    // A7d.4: CurrencyInput restores from the persisted "$642,000".
    await expect(page.getByLabel('area-median-sale')).toHaveValue(
      '$642,000',
    );
    // The month editor derives the latest-month + count from the persisted
    // series. Row 0's label (a non-input <div>) reads back "May '26".
    await expect(
      page.getByTestId('step-editorial-area-month-label-0'),
    ).toHaveText("May '26");

    // ---- Walk forward, mock publish, capture body ----
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
        body: JSON.stringify({ ok: true, slug: 'a7d-roundtrip' }),
      });
    });

    await page.getByTestId('wizard-next').click(); // → Review
    await expect(page.getByTestId('step-review')).toBeVisible();
    await expect(page.getByTestId('step-review-ready')).toBeVisible();
    await page.getByTestId('step-review-publish').click();
    await expect(page.getByTestId('step-review-published')).toBeVisible({
      timeout: 10_000,
    });

    const body = publishBody as { draft?: Record<string, unknown> } | null;
    expect(body).not.toBeNull();
    const d = body!.draft as Record<string, unknown>;
    expect((d.video as { videoUrl?: string })?.videoUrl).toBe(MOCK_VIDEO_URL);
    const stats = d.areaStats as {
      medianSale?: string;
      medianSaleDeltaYoy?: string;
      daysOnMarket?: string;
      daysOnMarketZipAvg?: string;
      closings90d?: string;
      listToSaleRatio?: string;
      monthlySeries?: Array<{ month?: string; medianPrice?: string }>;
    };
    // A7d.4: every Area-snapshot field now stores its post-format value
    // (currency keypad → $-formatted, percent input → trailing %, number
    // input → comma-grouped).
    expect(stats.medianSale).toBe('$642,000');
    expect(stats.medianSaleDeltaYoy).toBe('+4.6%');
    expect(stats.daysOnMarket).toBe('14');
    expect(stats.daysOnMarketZipAvg).toBe('vs Tremont avg 21');
    expect(stats.closings90d).toBe('38');
    expect(stats.listToSaleRatio).toBe('101%');
    expect(stats.monthlySeries?.[0]?.month).toBe("May '26");
    expect(stats.monthlySeries?.[0]?.medianPrice).toBe('$642,000');

    // A7d.4 — chart-data-shape regression guard. The neighborhood chart
    // on the published page consumes `monthlySeries: [{month, medianPrice}]`
    // and parses prices via parsePriceToNumber (which accepts "$642,000",
    // "$642k", and bare "642000"). Confirm every published entry is
    // chart-compatible: a non-empty month label + a numerically parseable
    // medianPrice. If the input layer ever drifts off this contract the
    // chart silently degrades to a flat line, so we lock the shape here.
    for (const entry of stats.monthlySeries ?? []) {
      expect(entry.month?.trim().length ?? 0).toBeGreaterThan(0);
      const numeric = Number(
        (entry.medianPrice ?? '').replace(/[^0-9.]/g, ''),
      );
      expect(Number.isFinite(numeric) && numeric > 0).toBe(true);
    }

    // A7d.1 removed fields must NOT appear on the wire — even when the
    // wizard never offered an input. Locks the subtraction in place.
    expect(d.agentNote).toBeUndefined();
    expect(d.trackRecord).toBeUndefined();
    expect(d.buyerQuote).toBeUndefined();
    expect(d.editorialPhotoUrl).toBeUndefined();
    // A7d.2 — reviews + outlink moved to Settings; the editorial step
    // no longer captures them so the draft side of the publish body is
    // clean. The wire still carries `brandReviews` (sourced separately
    // from Settings) — covered by the dedicated A7d.2 spec.
    expect(d.reviews).toBeUndefined();
    expect(d.reviewsOutlink).toBeUndefined();
  });

  test('skip-all: untouched editorial step publishes with no editorial fields on the draft', async ({
    page,
  }) => {
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
        body: JSON.stringify({ ok: true, slug: 'a7d-skipall' }),
      });
    });

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
    await nextButton.click(); // through Pitch (untouched)

    // Land on Editorial; every card is closed by default for a fresh
    // draft because `sectionsWithContent(EMPTY_DRAFT)` returns nothing.
    await expect(page.getByTestId('step-editorial')).toBeVisible();
    for (const key of ['video', 'areaStats']) {
      await expect(
        page.getByTestId(`step-editorial-${key}-card`),
      ).toHaveAttribute('data-state', 'closed');
    }
    // A7d.1 + A7d.2 — removed/relocated cards must not exist in the
    // DOM at all. Reviews moved to brand Settings (A7d.2); the others
    // were subtracted entirely (A7d.1).
    for (const removedKey of [
      'agentNote',
      'trackRecord',
      'buyerQuote',
      'editorialPhoto',
      'reviews',
    ]) {
      await expect(
        page.getByTestId(`step-editorial-${removedKey}-card`),
      ).toHaveCount(0);
    }
    await nextButton.click(); // straight through to Review

    await expect(page.getByTestId('step-review')).toBeVisible();
    await expect(page.getByTestId('step-review-ready')).toBeVisible();
    await page.getByTestId('step-review-publish').click();
    await expect(page.getByTestId('step-review-published')).toBeVisible({
      timeout: 10_000,
    });

    const body = publishBody as { draft?: Record<string, unknown> } | null;
    expect(body).not.toBeNull();
    const d = body!.draft!;
    // None of the surviving editorial blocks reach the wire when the
    // step was skipped.
    expect(d.video).toBeUndefined();
    expect(d.reviews).toBeUndefined();
    expect(d.reviewsOutlink).toBeUndefined();
    expect(d.areaStats).toBeUndefined();
    // A7d.1 removed fields are absent by construction.
    expect(d.agentNote).toBeUndefined();
    expect(d.trackRecord).toBeUndefined();
    expect(d.buyerQuote).toBeUndefined();
    expect(d.editorialPhotoUrl).toBeUndefined();
  });

  test('A7d.2 — reviews entered in brand Settings flow into the publish body via brandReviews', async ({
    page,
  }) => {
    // Seed brand Settings directly via localStorage so the test stays
    // focused on the Settings → publish path (the Settings UI itself
    // is covered by its own spec). One curated review + a Zillow
    // outlink URL — both should round-trip through the publish body
    // as `brandReviews`, NOT as draft fields.
    await page.addInitScript(() => {
      const settings = {
        agentName: 'Marisol Reyes',
        primaryColor: '#4ef2d9',
        accentColor: '#ffffff',
        backgroundColor: '',
        contactEmail: 'marisol@example.com',
        contactPhone: '2165550188',
        licenseNumber: 'SAL.2018003412',
        brokerage: 'Howard Hanna',
        logoDataUrl: null,
        agentReviews: [
          {
            body: 'She walked us through every offer in plain English.',
            attributionName: 'The Halloran family',
            attributionYear: '2025',
            attributionStreet: 'Tremont',
          },
        ],
        reviewsOutlinkUrl: 'https://www.zillow.com/profile/marisolreyes',
      };
      window.localStorage.setItem(
        'socanim_brand_settings',
        JSON.stringify(settings),
      );
    });

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
        body: JSON.stringify({ ok: true, slug: 'a7d2-brand-reviews' }),
      });
    });

    await page.goto('/seller-presentation');
    await expect(page.getByTestId('step-property')).toBeVisible();
    await page.getByTestId('step-property-address').fill('1742 Kenilworth Avenue');
    const nextButton = page.getByTestId('wizard-next');
    await nextButton.click();
    await page.getByTestId('step-comps-add').click();
    await page.getByTestId('step-comps-address-0').fill('2218 W 14th Street');
    await page.getByLabel('comp-1-sold-price').fill('648000');
    await nextButton.click();
    await page.getByLabel('recommended-price').fill('675000');
    await nextButton.click();
    await nextButton.click(); // Pitch (untouched)
    await expect(page.getByTestId('step-editorial')).toBeVisible();
    await nextButton.click(); // Editorial (skip — reviews live in Settings now)

    await expect(page.getByTestId('step-review')).toBeVisible();
    await expect(page.getByTestId('step-review-ready')).toBeVisible();
    await page.getByTestId('step-review-publish').click();
    await expect(page.getByTestId('step-review-published')).toBeVisible({
      timeout: 10_000,
    });

    const body = publishBody as {
      draft?: Record<string, unknown>;
      brandReviews?: {
        reviews?: Array<{
          body?: string;
          attributionName?: string;
        }>;
        reviewsOutlinkUrl?: string;
      };
    } | null;
    expect(body).not.toBeNull();

    // The Settings-sourced reviews ride on `brandReviews`, not the
    // draft. This is the wire-shape contract the publish route relies
    // on to feed `toPublicPayload`'s third arg.
    expect(body!.brandReviews).toBeDefined();
    expect(body!.brandReviews?.reviews).toHaveLength(1);
    expect(body!.brandReviews?.reviews?.[0]?.body).toBe(
      'She walked us through every offer in plain English.',
    );
    expect(body!.brandReviews?.reviews?.[0]?.attributionName).toBe(
      'The Halloran family',
    );
    expect(body!.brandReviews?.reviewsOutlinkUrl).toBe(
      'https://www.zillow.com/profile/marisolreyes',
    );

    // Draft side stays clean — reviews + outlink no longer ride there.
    expect(body!.draft?.reviews).toBeUndefined();
    expect(body!.draft?.reviewsOutlink).toBeUndefined();
  });

  test('A7d.2 — no reviews in Settings → brandReviews carries no rows + the published page block hides', async ({
    page,
  }) => {
    // Settings has the agent profile filled in, but agentReviews is
    // empty / undefined. The publish body's brandReviews block must
    // either be absent or carry no `reviews` array — the renderer
    // then hides the "From families like yours" block cleanly.
    await page.addInitScript(() => {
      const settings = {
        agentName: 'Marisol Reyes',
        primaryColor: '#4ef2d9',
        accentColor: '#ffffff',
        backgroundColor: '',
        contactEmail: '',
        contactPhone: '',
        licenseNumber: '',
        brokerage: '',
        logoDataUrl: null,
        // No agentReviews, no reviewsOutlinkUrl.
      };
      window.localStorage.setItem(
        'socanim_brand_settings',
        JSON.stringify(settings),
      );
    });

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
        body: JSON.stringify({ ok: true, slug: 'a7d2-no-reviews' }),
      });
    });

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
    await nextButton.click(); // pitch
    await nextButton.click(); // editorial

    await expect(page.getByTestId('step-review')).toBeVisible();
    await page.getByTestId('step-review-publish').click();
    await expect(page.getByTestId('step-review-published')).toBeVisible({
      timeout: 10_000,
    });

    const body = publishBody as {
      brandReviews?: { reviews?: unknown; reviewsOutlinkUrl?: string };
    } | null;
    expect(body).not.toBeNull();

    // brandReviews is allowed to be present but with no rows + no
    // outlink URL — same effect as the projector dropping the block.
    const brandReviews = body!.brandReviews;
    const hasReviewRows =
      Array.isArray(brandReviews?.reviews) &&
      (brandReviews!.reviews as unknown[]).length > 0;
    expect(hasReviewRows).toBe(false);
    expect(brandReviews?.reviewsOutlinkUrl ?? '').toBe('');
  });
});
