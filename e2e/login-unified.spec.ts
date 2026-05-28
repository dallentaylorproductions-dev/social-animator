import { test, expect } from "@playwright/test";

/**
 * v1.47 Lane A polish — unified sign-in surface with DIRECT cohort
 * sign-in.
 *
 * /login holds a collapsible "Have a beta access code?" link. When the
 * code field has a value, submit calls Auth.js `signIn('beta-code', …)`
 * (Credentials provider) and on success navigates straight to
 * /dashboard — no magic-link intermediate. When empty, it goes through
 * the standard Auth.js Resend signIn (paid-user magic-link path,
 * unchanged). /access keeps working as a 308 redirect.
 *
 * The middleware E2E bypass (E2E_TESTING=1) lets us reach both /login
 * and /dashboard unauthenticated; we don't actually hit Auth.js or KV —
 * the Auth.js endpoints are intercepted with page.route() so the form's
 * branching logic is what's under test.
 */

/**
 * Stub /api/auth/providers + /api/auth/csrf for next-auth/react's
 * signIn() preamble. Returns counters for the per-provider callback so
 * tests can assert which path the form took.
 */
function stubAuthEnvelope(page: import("@playwright/test").Page) {
  const counts = { betaCodeCalls: 0, resendCalls: 0 };
  const lastBetaCodeBody: { email?: string; code?: string } = {};

  return {
    counts,
    lastBetaCodeBody,
    install: async (
      handler: (kind: "beta-code" | "resend", body: URLSearchParams) =>
        | { ok: true; url?: string }
        | { ok: false; errorUrl: string },
    ) => {
      // Patterns end in `**` so they match the trailing `?` next-auth/react
      // appends even when authorizationParams is empty (signin/resend, callback/beta-code).
      await page.route("**/api/auth/providers**", async (route) => {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            "beta-code": {
              id: "beta-code",
              name: "Beta access code",
              type: "credentials",
              signinUrl: "http://localhost:3000/api/auth/signin/beta-code",
              callbackUrl: "http://localhost:3000/api/auth/callback/beta-code",
            },
            resend: {
              id: "resend",
              name: "Resend",
              type: "email",
              signinUrl: "http://localhost:3000/api/auth/signin/resend",
              callbackUrl: "http://localhost:3000/api/auth/callback/resend",
            },
          }),
        });
      });
      await page.route("**/api/auth/csrf**", async (route) => {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ csrfToken: "test-csrf-token" }),
        });
      });
      await page.route("**/api/auth/session**", async (route) => {
        // signIn() pings /session via storage event after a successful
        // credentials POST. Return an empty session — the form just
        // discards the result before navigating.
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({}),
        });
      });
      await page.route("**/api/auth/callback/beta-code**", async (route) => {
        counts.betaCodeCalls += 1;
        const body = new URLSearchParams(route.request().postData() ?? "");
        Object.assign(lastBetaCodeBody, {
          email: body.get("email") ?? undefined,
          code: body.get("code") ?? undefined,
        });
        const result = handler("beta-code", body);
        // Auth.js wraps the response as JSON `{ url }` when the client
        // sends X-Auth-Return-Redirect (which next-auth/react does).
        // Success: url is the callbackUrl; failure: url carries
        // ?error=CredentialsSignin&code=… so the client can read it.
        const url = result.ok
          ? result.url ?? "http://localhost:3000/dashboard"
          : result.errorUrl;
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ url }),
        });
      });
      await page.route("**/api/auth/signin/resend**", async (route) => {
        counts.resendCalls += 1;
        const result = handler("resend", new URLSearchParams());
        const url = result.ok
          ? result.url ??
            "http://localhost:3000/api/auth/verify-request?provider=resend"
          : result.errorUrl;
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ url }),
        });
      });
    },
  };
}

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

  test("shows the 'we'll save your work to this email' confirmation copy under the email field", async ({
    page,
  }) => {
    await page.goto("/login");
    await expect(
      page.getByText(/we'll save your work to this email/i),
    ).toBeVisible();
  });

  test("no-code submit goes through the standard resend signIn (no beta-code call)", async ({
    page,
  }) => {
    const env = stubAuthEnvelope(page);
    await env.install(() => ({ ok: true }));

    await page.goto("/login");
    await page
      .getByRole("textbox", { name: /email/i })
      .fill("paid-user@example.com");
    await page.getByRole("button", { name: /send sign-in link/i }).click();

    await expect(page.getByText("Check your email")).toBeVisible();
    await expect(page.getByText("paid-user@example.com")).toBeVisible();

    expect(env.counts.betaCodeCalls).toBe(0);
    expect(env.counts.resendCalls).toBeGreaterThanOrEqual(1);
  });

  test("code-valid submit signs in directly and lands on /dashboard (no 'Check your email' detour)", async ({
    page,
  }) => {
    const env = stubAuthEnvelope(page);
    await env.install((kind) => {
      if (kind === "beta-code") {
        return { ok: true, url: "http://localhost:3000/dashboard" };
      }
      return { ok: true };
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

    // Direct sign-in: no email-check screen, lands on /dashboard. The
    // middleware E2E_TESTING bypass lets the dashboard render without a
    // real session.
    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(page.getByText("Check your email")).toHaveCount(0);

    expect(env.counts.betaCodeCalls).toBe(1);
    expect(env.lastBetaCodeBody).toMatchObject({
      email: "dallen.pace6@gmail.com",
      code: "ATHT2026",
    });
    expect(env.counts.resendCalls).toBe(0);
  });

  test("code-invalid submit surfaces 'Code not recognized.' inline and does not navigate", async ({
    page,
  }) => {
    const env = stubAuthEnvelope(page);
    await env.install((kind) => {
      if (kind === "beta-code") {
        // Mirrors what @auth/core does on CredentialsSignin: returns
        // JSON `{ url }` with ?error=CredentialsSignin&code=credentials
        // in the URL. The client signIn() reads those params back.
        return {
          ok: false,
          errorUrl:
            "http://localhost:3000/login?error=CredentialsSignin&code=credentials",
        };
      }
      return { ok: true };
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
    // Stayed on the form — no navigation, no "Check your email" view.
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByText("Check your email")).toHaveCount(0);
    // Submit button is back to enabled state, not stuck on "Sending…".
    await expect(
      page.getByRole("button", { name: /^get access$/i }),
    ).toBeEnabled();
  });

  test("code-rate-limited submit surfaces the rate-limit copy", async ({
    page,
  }) => {
    const env = stubAuthEnvelope(page);
    await env.install((kind) => {
      if (kind === "beta-code") {
        return {
          ok: false,
          errorUrl:
            "http://localhost:3000/login?error=CredentialsSignin&code=rate_limit",
        };
      }
      return { ok: true };
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

    await expect(
      page.getByText(/too many attempts/i),
    ).toBeVisible();
    await expect(page).toHaveURL(/\/login$/);
    expect(env.counts.betaCodeCalls).toBe(1);
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
