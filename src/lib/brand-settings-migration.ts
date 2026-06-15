/**
 * One-time localStorage → server brand-settings migration planner (mirrors
 * src/lib/seller-presentation/draft-migration.ts).
 *
 * PURE: data in, a decision out. No KV, no localStorage, no fetch — so the
 * lossless + only-already-owned + never-clobber rules are unit-testable in the
 * node-context Playwright specs this repo uses, with nothing mocked. The
 * `useBrandSettings` hook feeds it the loaded local settings + whether the
 * server already holds a record, executes the push if told to, and otherwise
 * lets the server copy stand. localStorage is NEVER deleted — it stays as the
 * offline/optimistic cache.
 *
 * Owner policy (the "never cross agents" hard gate, same as the draft store):
 *   ONLY claim local settings the signed-in agent ALREADY owns — i.e. whose
 *   stamped `ownerEmail` matches the session. Legacy settings with NO
 *   `ownerEmail` (saved before this feature) — and any left by a DIFFERENT
 *   agent on a shared browser — are deliberately LEFT in localStorage, never
 *   claimed and never pushed. They become server-backed the moment the
 *   signed-in agent saves under their owner (which stamps the owner), exactly
 *   like a legacy draft becomes cross-device on its next owned re-save. This
 *   guarantees one agent can never sweep another agent's local brand/proof into
 *   their own server account.
 *
 * Never-clobber: if the server already holds a record for this agent, the
 * server copy WINS and nothing is pushed — a stale local copy can never
 * overwrite settings the agent edited on another device.
 */

import type { BrandSettings } from "@/lib/brand";

export interface BrandMigrationInput {
  /**
   * The settings loaded from this browser's localStorage. `loadBrandSettings`
   * returns DEFAULT_BRAND when nothing is stored; that default carries no
   * `ownerEmail`, so it falls through to `not-owned` and is never pushed.
   */
  localSettings: BrandSettings | null | undefined;
  /** True when the server already holds a brand record for this agent. */
  serverPresent: boolean;
  /** Lowercased session email. Null/empty ⇒ nothing migrates (no owner to scope to). */
  sessionEmail: string | null | undefined;
}

export type BrandMigrationReason =
  | "no-session"
  | "server-wins"
  | "nothing-local"
  | "not-owned"
  | "claim-local";

export interface BrandMigrationPlan {
  /** Push the local settings up to the server exactly when this is true. */
  shouldPush: boolean;
  /** Why — surfaced for logging / tests so each branch is observable. */
  reason: BrandMigrationReason;
}

/**
 * Decide whether this browser's local brand settings should be claimed into
 * the server store on first authenticated load. Claims ONLY when: there is a
 * session, the server has nothing yet (never clobber), local settings exist,
 * and those settings are already owned by this session (never cross agents).
 */
export function planBrandMigration(
  input: BrandMigrationInput,
): BrandMigrationPlan {
  const email = input.sessionEmail
    ? input.sessionEmail.toLowerCase()
    : null;

  if (!email) {
    // No session ⇒ nothing is owned by anyone we can scope to.
    return { shouldPush: false, reason: "no-session" };
  }
  if (input.serverPresent) {
    // The server already has this agent's settings — it wins, never clobbered.
    return { shouldPush: false, reason: "server-wins" };
  }
  if (!input.localSettings) {
    return { shouldPush: false, reason: "nothing-local" };
  }
  const owned = input.localSettings.ownerEmail?.toLowerCase() === email;
  if (!owned) {
    // Legacy no-owner blob, or another agent's leftover — left device-local,
    // never claimed (the cross-agent gate).
    return { shouldPush: false, reason: "not-owned" };
  }
  return { shouldPush: true, reason: "claim-local" };
}
