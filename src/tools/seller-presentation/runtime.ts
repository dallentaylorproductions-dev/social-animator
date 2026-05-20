import { registerRuntime } from "@/skills/runtime";
import type { SkillRuntime, SkillStatus } from "@/skills/types";
import type { WorkflowInstance } from "@/skills/workflow-instance";
import {
  isStepPropertyComplete,
  type SellerPresentationDraft,
} from "./engine/types";

/**
 * Seller Presentation — SkillRuntime (v1.47 / A5a).
 *
 * First per-skill runtime registered via src/skills/runtime.ts's
 * lookup table. Self-registers as a module-load side-effect; the
 * registry (src/skills/registry.ts) imports this module for that
 * side-effect — `import '@/tools/seller-presentation/runtime'` is
 * the entire wire-up.
 *
 * A5a scope: getStatus is real but minimal. Step 1 (Property) is the
 * only live step, so `missingRequiredInputs` only checks property
 * fields; steps 2–5 are stubs whose required fields land in A5b
 * (StepComps, StepStrategy, StepPitch, StepReview will extend the
 * `requiredFields` array below).
 *
 * canRun derivation per A5a pin: the core SP workflow is Base-tier
 * (substrate §3.4 — `baseWorkflow: 'base'`), so the effectiveTier
 * stub from A2 (src/lib/skill-entitlement.ts) doesn't gate canRun
 * here in v1.47. canRun is simply `runBlockers.length === 0 && state
 * !== 'complete'`. A7 (premium themes / AI plug-points) is where
 * tier-aware blockers join the list.
 *
 * recommendedNextActions = {} for v1: the cross-tool graph the
 * dashboard would consume isn't built yet. The static
 * SELLER_PRESENTATION_SKILL.recommendedNextSkills (['listing-flyer'])
 * is what the dashboard's NextBestActionCard chip currently reads.
 *
 * Validation cache (instance.validation) is intentionally NOT
 * populated — computation is cheap (a few string checks) and the
 * stale-vs-fresh contract becomes load-bearing only when the
 * dashboard reads SkillStatus on every render. We can opt in when
 * that consumer lands.
 *
 * Skill-id coupling: the string `'seller-presentation'` is duplicated
 * here and in ./skill.ts (SELLER_PRESENTATION_SKILL.id). Keeping the
 * registration independent of skill.ts avoids a load-order cycle
 * (runtime.ts → skill.ts → runtime.ts) and trades a one-line
 * duplication for clearer module graph. If the id ever changes, both
 * files have to update — that's a trivial grep.
 */

function deriveMissingRequiredInputs(
  draft: SellerPresentationDraft,
): string[] {
  const missing: string[] = [];
  if (!draft.propertyAddress?.trim()) missing.push("propertyAddress");
  // A5b extends this list — recommendedPrice, comps[0], etc.
  return missing;
}

export const sellerPresentationRuntime: SkillRuntime<SellerPresentationDraft> =
  {
    getStatus(instance: WorkflowInstance<SellerPresentationDraft>): SkillStatus {
      const { draft, currentStep, timestamps, resolvedPrimitives } = instance;
      const missingRequiredInputs = deriveMissingRequiredInputs(draft);
      const stepPropertyComplete = isStepPropertyComplete(draft);

      const state: SkillStatus["state"] = timestamps.completedAt
        ? "complete"
        : missingRequiredInputs.length === 0 && stepPropertyComplete
          ? "in-progress"
          : "blocked";

      const runBlockers: SkillStatus["runBlockers"] = missingRequiredInputs.map(
        (field) => ({
          type: "missing-input",
          label: `Required field empty: ${field}`,
          resolutionAction: {
            label: "Fix on Step 1",
            targetStepId: "property",
          },
        }),
      );

      return {
        state,
        currentStep,
        missingRequiredInputs,
        resolvedPrimitives: { ...resolvedPrimitives },
        // A6 populates after the publish endpoint exists — until then the
        // SP produces no addressable artifacts.
        producedArtifacts: [],
        timestamps: { ...timestamps },
        canRun: runBlockers.length === 0 && state !== "complete",
        runBlockers,
        // Cross-tool graph not wired in v1 (per A5a pin). The dashboard
        // reads SELLER_PRESENTATION_SKILL.recommendedNextSkills for the
        // static "After this:" chip.
        recommendedNextActions: {},
      };
    },
  };

// Side-effect registration. Importing this module is the entire
// wire-up — see src/skills/registry.ts. The string id duplicates
// SELLER_PRESENTATION_SKILL.id (see header comment for the rationale).
registerRuntime<SellerPresentationDraft>(
  "seller-presentation",
  sellerPresentationRuntime,
);
