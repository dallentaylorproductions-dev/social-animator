import { test, expect } from "@playwright/test";

/**
 * v1.47 Lane A — unified sign-in surface.
 *
 * /login holds a collapsible "Have a beta access code?" link. When the
 * code field has a value, submit POSTs to /api/access/grant (dev-access
 * promotion path). When empty, it goes through the standard Auth.js
 * resend signIn. /access keeps working as a 308 redirect.
 *
 * The middleware E2E bypass (E2E_TESTING=1) lets us reach /login
 * unauthenticated; we don't actually hit Auth.js or KV — both submit
 * paths are intercepted with page.route() so the form's branching logic
 * is what's under test.
 */

test.describe("/login unified form", () => {
  test("renders email field and collapsed beta-code affordance", async ({
    page,
  }) => {
    await page.goto("/login");

    await expect(
      page.getByRole("textbox", { name: /email/i }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: /send sign-in link/i }),
    ).toBeVisible();
    // Toggle is present but code field starts collapsed.
    await expect(
      page.getByRole("button", { name: /have a beta access code/i }),
    ).toBeVisible();
    await expect(
      page.getByRole("textbox", { name: /beta access code/i }),
    ).toHaveCount(0);
  });

  test("clicking the toggle reveals the code field and renames the submit button", async ({
    page,
  }) => {
    await page.goto("/login");

    await page
      .getByRole("button", { name: /have a beta access code/i })
      .click();

    const codeInput = page.getByRole("textbox", { name: /beta access code/i });
    await expect(codeInput).toBeVisible();
    await expect(codeInput).toHaveAttribute(
      "placeholder",
      "Code from your invite email",
    );

    // Before typing, submit button still says "Send sign-in link"
    // (code field open but empty → no-code path).
    await expect(
      page.getByRole("button", { name: /send sign-in link/i }),
    ).toBeVisible();

    // Type a code → label flips to "Get access".
    await codeInput.fill("SOMECODE");
    await expect(
      page.getByRole("button", { name: /^get access$/i }),
    ).toBeVisible();

    // Hide toggle is also present once expanded.
    await expect(
      page.getByRole("button", { name: /hide beta access code/i }),
    ).toBeVisible();
  });

  test("no-code submit goes through the standard resend signIn (no /api/access/grant)", async ({
    page,
  }) => {
    let grantCalls = 0;
    let resendCalls = 0;

    await page.route("**/api/access/grant", async (route) => {
      grantCalls += 1;
      await route.fulfill({ status: 500, body: "should not be called" });
    });
    // next-auth/react's signIn() does, in order:
    //   1. GET /api/auth/providers  → { resend: {...} }
    //   2. GET /api/auth/csrf       → { csrfToken }
    //   3. POST /api/auth/signin/resend → { url }
    // Stub all three so we exercise the form's branching logic without
    // sending mail or touching KV.
    await page.route("**/api/auth/**", async (route) => {
      const url = route.request().url();
      if (url.includes("/api/auth/providers")) {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            resend: {
              id: "resend",
              name: "Resend",
              type: "email",
              signinUrl: "http://localhost:3000/api/auth/signin/resend",
              callbackUrl: "http://localhost:3000/api/auth/callback/resend",
            },
          }),
        });
        return;
      }
      if (url.includes("/api/auth/csrf")) {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ csrfToken: "test-csrf-token" }),
        });
        return;
      }
      if (url.includes("/api/auth/signin/resend")) {
        resendCalls += 1;
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            url: "http://localhost:3000/api/auth/verify-request?provider=resend",
          }),
        });
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({}),
      });
    });

    await page.goto("/login");
    await page
      .getByRole("textbox", { name: /email/i })
      .fill("paid-user@example.com");
    await page.getByRole("button", { name: /send sign-in link/i }).click();

    await expect(page.getByText("Check your email")).toBeVisible();
    await expect(page.getByText("paid-user@example.com")).toBeVisible();

    expect(grantCalls).toBe(0);
    expect(resendCalls).toBeGreaterThanOrEqual(1);
  });

  test("code-valid submit posts to /api/access/grant and shows the email confirmation screen", async ({
    page,
  }) => {
    let grantPayload: { email?: string; code?: string } | null = null;

    await page.route("**/api/access/grant", async (route) => {
      const req = route.request();
      grantPayload = JSON.parse(req.postData() ?? "{}");
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ok: true }),
      });
    });
    await page.route("**/api/auth/**", async (route) => {
      // Should not be called in the code path — the grant endpoint
      // triggers signIn server-side. Fail loudly if it is.
      await route.fulfill({ status: 500, body: "should not be called" });
    });

    await page.goto("/login");
    await page
      .getByRole("textbox", { name: /email/i })
      .fill("dallen.pace6@gmail.com");
    await page
      .getByRole("button", { name: /have a beta access code/i })
      .click();
    await page
      .getByRole("textbox", { name: /beta access code/i })
      .fill("ATHT2026");
    await page.getByRole("button", { name: /^get access$/i }).click();

    await expect(page.getByText("Check your email")).toBeVisible();
    await expect(page.getByText("dallen.pace6@gmail.com")).toBeVisible();

    expect(grantPayload).toEqual({
      email: "dallen.pace6@gmail.com",
      code: "ATHT2026",
    });
  });

  test("code-invalid submit surfaces the API error inline and does not advance", async ({
    page,
  }) => {
    await page.route("**/api/access/grant", async (route) => {
      await route.fulfill({
        status: 401,
        contentType: "application/json",
        body: JSON.stringify({ ok: false, error: "Code not recognized." }),
      });
    });

    await page.goto("/login");
    await page
      .getByRole("textbox", { name: /email/i })
      .fill("invited@example.com");
    await page
      .getByRole("button", { name: /have a beta access code/i })
      .click();
    await page
      .getByRole("textbox", { name: /beta access code/i })
      .fill("WRONG-CODE");
    await page.getByRole("button", { name: /^get access$/i }).click();

    await expect(page.getByText("Code not recognized.")).toBeVisible();
    // We stayed on the form — no "Check your email" view.
    await expect(page.getByText("Check your email")).toHaveCount(0);
    // Submit button is back to enabled state, not stuck on "Sending…".
    await expect(
      page.getByRole("button", { name: /^get access$/i }),
    ).toBeEnabled();
  });
});

test.describe("/access legacy URL", () => {
  test("redirects to /login with HTTP 308 and lands on the unified form", async ({
    page,
  }) => {
    // Capture the raw redirect response with redirects disabled, then
    // navigate via the browser to confirm the landing surface.
    const headRes = await page.request.fetch("/access", {
      maxRedirects: 0,
    });
    expect(headRes.status()).toBe(308);
    expect(headRes.headers()["location"]).toContain("/login");

    await page.goto("/access");
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByRole("textbox", { name: /email/i })).toBeVisible();
  });
});
