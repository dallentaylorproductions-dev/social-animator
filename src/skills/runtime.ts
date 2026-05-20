import type { SkillId, SkillRuntime } from "./types";

/**
 * In-process lookup table mapping `SkillId` → `SkillRuntime` (v1.47 / A4).
 *
 * Tools register their runtime at module-load time alongside their
 * `CallableSkill` record, per audit §5.3:
 *
 *   // somewhere in src/tools/seller-presentation/runtime.ts (A5)
 *   import { registerRuntime } from '@/skills/runtime';
 *   import { SELLER_PRESENTATION_SKILL } from './skill';
 *
 *   registerRuntime(SELLER_PRESENTATION_SKILL.id, {
 *     getStatus(instance) { … },
 *   });
 *
 * Side-effecting registration relies on the module being imported
 * before the dashboard tries to look up a runtime. The existing
 * `src/skills/registry.ts` imports each skill's `*_SKILL` constant
 * eagerly, so registering in the same file (or a sibling pulled in
 * by it) is sufficient — A5 will set that wire-up.
 *
 * Absence of a runtime for a given skill is a VALID state (pinned
 * decision A4.4): `getRuntime` returns `undefined`, callers treat
 * that as "no computable status, render the skill without a resume
 * card." Skills that haven't been ported to the converged shape yet
 * (SIR, OH Prep, etc.) live in this state across the entire v1.47
 * lane — by design.
 *
 * Concurrency / re-registration: module-level state, single registry
 * per process. Re-registering the same skillId silently overwrites
 * (last-write-wins); a console.warn fires in non-production builds
 * to surface accidental double-registration during development.
 * `unregisterRuntime` exists for test cleanup and any future
 * deliberate teardown path.
 *
 * No persistence — registry is rebuilt from module-load each time
 * the process starts. There's no scenario where a runtime should
 * survive a restart but the registering module doesn't.
 */

const REGISTRY = new Map<SkillId, SkillRuntime<unknown>>();

/**
 * Register a runtime for a skill. The generic param lets the caller
 * type their runtime against the skill's per-draft shape; internally
 * the registry stores as `SkillRuntime<unknown>` because the lookup
 * table is heterogeneous over per-skill draft types.
 *
 * Re-registration overwrites (last-write-wins) with a dev-mode
 * console.warn — production silently overwrites.
 */
export function registerRuntime<TDraft>(
  skillId: SkillId,
  runtime: SkillRuntime<TDraft>,
): void {
  if (REGISTRY.has(skillId) && process.env.NODE_ENV !== "production") {
    // eslint-disable-next-line no-console
    console.warn(
      `[skills/runtime] re-registering runtime for skill "${skillId}" — last-write-wins`,
    );
  }
  REGISTRY.set(skillId, runtime as SkillRuntime<unknown>);
}

/**
 * Look up the registered runtime for a skill. Returns `undefined`
 * cleanly (NOT an error) when no runtime is registered — callers
 * treat the absence as "no computable status" per pinned A4.4.
 *
 * Cast at the boundary: the caller knows the per-skill draft shape
 * and narrows the generic. The registry treats every entry as
 * `SkillRuntime<unknown>`; the cast back to `SkillRuntime<TDraft>`
 * is unchecked at the persistence/registry boundary, mirroring how
 * `loadInstance<TDraft>` narrows.
 */
export function getRuntime<TDraft = unknown>(
  skillId: SkillId,
): SkillRuntime<TDraft> | undefined {
  return REGISTRY.get(skillId) as SkillRuntime<TDraft> | undefined;
}

/**
 * Remove a previously-registered runtime. Returns `true` if a runtime
 * was removed, `false` if none was registered. Test-mostly — the
 * production path registers at module-load and never tears down.
 */
export function unregisterRuntime(skillId: SkillId): boolean {
  return REGISTRY.delete(skillId);
}
