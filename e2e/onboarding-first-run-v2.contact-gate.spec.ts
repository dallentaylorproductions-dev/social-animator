import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { withAccountEmailFallback } from '../src/tools/seller-presentation/output/public-payload';

/**
 * ONBOARDING_FIRST_RUN_V2 · phase 3d - Q3 silent confirms + Q4 contact soft-gate.
 *
 * Q4: a LIVE seller page is never unreachable. The agent's chosen contact wins;
 * with neither email nor phone, the account email is folded in as the reach of
 * last resort. The framing is "save as draft" / "add later", NEVER "publish
 * without it". Q3: an account that already carries a headshot / contact collapses
 * those invites to a quiet silent confirm.
 *
 * Pure-Node: the reach-fallback contract + source-contract on the flow wiring +
 * a copy guard. The flag-on render is a Cowork preview check.
 */

test.describe('Q4 reach fallback - a live page is never unreachable', () => {
  test('no email and no phone -> the account email becomes the contact', () => {
    const out = withAccountEmailFallback(
      { name: 'Sarah' },
      'sarah@account.com',
    );
    expect(out.email).toBe('sarah@account.com');
  });

  test("the agent's chosen email wins over the account email", () => {
    const out = withAccountEmailFallback(
      { name: 'Sarah', email: 'sarah@brokerage.com' },
      'sarah@account.com',
    );
    expect(out.email).toBe('sarah@brokerage.com');
  });

  test('a phone-only contact is already reachable - no account email folded in', () => {
    const out = withAccountEmailFallback(
      { name: 'Sarah', phone: '555-0100' },
      'sarah@account.com',
    );
    expect(out.email).toBeUndefined();
    expect(out.phone).toBe('555-0100');
  });

  test('no contact AND no account email -> nothing fabricated', () => {
    const out = withAccountEmailFallback({ name: 'Sarah' }, '');
    expect(out.email).toBeUndefined();
  });
});

/* ───────────────── source contract: the flow wires Q3 + Q4 ──────────────── */

const FLOW = readFileSync(
  path.resolve(__dirname, '../src/app/welcome/WelcomeFlowV2.tsx'),
  'utf8',
);

test.describe('contact gate + silent confirms (source contract)', () => {
  test('finish() applies the account-email reach fallback before publish', () => {
    expect(FLOW).toContain('withAccountEmailFallback(');
    // It folds in the account email (ownerEmail), not a fabricated string.
    expect(FLOW).toMatch(/withAccountEmailFallback\(\s*baseContact,\s*ownerEmail/);
  });

  test('Q3: an existing headshot / contact collapses to a silent confirm', () => {
    expect(FLOW).toContain('data-testid="onbv2-headshot-confirm"');
    expect(FLOW).toContain('data-testid="onbv2-contact-confirm"');
    // The contact FIELDS only render when there is no contact on file.
    expect(FLOW).toMatch(/p\.hasContact \?[\s\S]*onbv2-contact-confirm/);
  });

  test('Q4: soft "save as draft" framing + the account-email reassurance', () => {
    expect(FLOW).toContain("'Save as draft'");
    expect(FLOW).toContain('data-testid="onbv2-contact-fallback"');
    expect(FLOW).toContain('account email');
  });
});

/* ───────────────── copy guard: never "publish without it" ───────────────── */

test.describe('contact copy - never normalizes a contactless publish', () => {
  test('neither welcome flow says "publish without it"', () => {
    const dir = path.resolve(__dirname, '../src/app/welcome');
    const forbidden = /publish without it/i;
    for (const f of ['WelcomeFlowV2.tsx', 'WelcomeFlow.tsx']) {
      const src = readFileSync(path.join(dir, f), 'utf8');
      expect(forbidden.test(src), `"publish without it" in ${f}`).toBe(false);
    }
  });
});
