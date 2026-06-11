/**
 * One-time localStorage → server draft migration planner (SP-KEYSTONE).
 *
 * PURE: data in, a plan out. No KV, no localStorage, no fetch — so the
 * lossless + idempotent + owner-scoped rules are unit-testable in the
 * node-context Playwright specs this repo uses, with nothing mocked. The
 * client orchestrator (the editor hook) feeds it the local instances + the
 * set of ids the server already has, executes the returned pushes, and only
 * then reads from the server. localStorage is NEVER deleted by migration —
 * it stays as the offline/crash fallback cache (gate 1: never lose a draft).
 *
 * Owner policy (SP-KEYSTONE decision, the "never cross agents" gate):
 *   ONLY migrate drafts the signed-in agent ALREADY owns — i.e. whose
 *   `ownerEmail` matches the session. Legacy drafts with NO `ownerEmail`
 *   (created before SP-LIB #63) are deliberately LEFT in localStorage,
 *   never claimed and never pushed. On a shared browser this guarantees one
 *   agent can never sweep a prior agent's un-owned local draft into their
 *   own server account. A legacy draft becomes cross-device the moment it is
 *   re-saved under an owner in the editor — not silently at migration time.
 *
 * Idempotency: a draft already present on the server (by `instanceId`) is
 * skipped. Re-running the migration after a partial push therefore pushes
 * only what is still missing, and a fully-migrated agent pushes nothing.
 */

import type { WorkflowInstance } from "@/skills/workflow-instance";
import { SELLER_PRESENTATION_SKILL_ID } from "./draft-store";

export interface MigrationInput {
  /** Every WorkflowInstance currently in this browser's localStorage (any skill, any owner). */
  localInstances: WorkflowInstance[];
  /** The instanceIds the server already holds for this agent (from the list route). */
  serverInstanceIds: Iterable<string>;
  /** Lowercased session email. Null/empty ⇒ nothing migrates (no owner to scope to). */
  sessionEmail: string | null | undefined;
}

export interface MigrationPlan {
  /** Drafts to PUT to the server, in localStorage order. Lossless: every owned, not-yet-server draft is here. */
  toPush: WorkflowInstance[];
  /**
   * Owned drafts already on the server (skipped). Surfaced for logging /
   * tests so "did nothing" is distinguishable from "found nothing".
   */
  alreadyOnServer: WorkflowInstance[];
  /**
   * Local SP drafts NOT migrated because they aren't owned by this session
   * (legacy no-owner, or owned by a different agent). Surfaced so the
   * orchestrator can log what it deliberately left device-local.
   */
  skippedNotOwned: WorkflowInstance[];
}

/**
 * Compute the migration plan. Considers only seller-presentation instances
 * owned by the session; partitions them into push / already-on-server, and
 * records the not-owned ones it intentionally left behind.
 */
export function planDraftMigration(input: MigrationInput): MigrationPlan {
  const email = input.sessionEmail
    ? input.sessionEmail.toLowerCase()
    : null;
  const serverIds = new Set<string>(input.serverInstanceIds);

  const toPush: WorkflowInstance[] = [];
  const alreadyOnServer: WorkflowInstance[] = [];
  const skippedNotOwned: WorkflowInstance[] = [];

  if (!email) {
    // No session ⇒ nothing is owned by anyone we can scope to.
    return { toPush, alreadyOnServer, skippedNotOwned };
  }

  for (const instance of input.localInstances) {
    if (instance.skillId !== SELLER_PRESENTATION_SKILL_ID) continue;

    const owned = instance.ownerEmail?.toLowerCase() === email;
    if (!owned) {
      // Legacy no-owner, or another agent's draft. Left in localStorage,
      // never claimed (the cross-agent gate).
      skippedNotOwned.push(instance);
      continue;
    }

    if (serverIds.has(instance.instanceId)) {
      alreadyOnServer.push(instance);
      continue;
    }

    toPush.push(instance);
  }

  return { toPush, alreadyOnServer, skippedNotOwned };
}
