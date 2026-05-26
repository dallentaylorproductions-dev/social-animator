'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import {
  detectActiveStates,
  hasBrandProfileConfigured,
} from './state-detection';
import { getActiveWorkflows, getWorkflowPrimarySkill } from './workflows';
import { getCategorizedSkills } from '@/skills/registry';
import { findLatestInProgress } from '@/skills/workflow-instance-storage';
import { resolveEntitlements, resolveSkill } from '@/lib/entitlements/resolver';
import type {
  AgentProfile,
  EntitlementContext,
} from '@/lib/entitlements/types';
import { NextBestActionCard } from './components/NextBestActionCard';
import { SkillTile } from './components/SkillTile';
import type { CallableSkill, WorkflowState } from '@/skills/types';

/**
 * Client island for the state-aware dashboard surface. Reads localStorage
 * for state detection (requires `window`); the parent server component
 * handles auth + the welcome header chrome AND resolves the AgentProfile
 * (KV reads).
 *
 * v1.47 / A7f.2: the resolver runs HERE (synchronous, over the
 * materialized AgentProfile). Both the Next Best Action card and the
 * All Skills tiles consume `ResolvedSkill` — no surface re-derives
 * gating from the agent profile or hardcodes per-skill access logic.
 */
export function DashboardClient({ agentProfile }: { agentProfile: AgentProfile }) {
  const [activeStates, setActiveStates] = useState<WorkflowState[]>([]);
  const [brandConfigured, setBrandConfigured] = useState<boolean | null>(null);
  // A7f.1: which primary-skill ids have an in-flight converged
  // WorkflowInstance the agent can resume from the dashboard. Populated in
  // the same useEffect as the rest of localStorage-derived state so the
  // SSR-empty / browser-populated contract is preserved (the watch-out the
  // brief flagged from the v1.44 hydration class).
  const [resumableSkillIds, setResumableSkillIds] = useState<Set<string>>(
    () => new Set(),
  );

  useEffect(() => {
    setActiveStates(detectActiveStates());
    setBrandConfigured(hasBrandProfileConfigured());
    const resumable = new Set<string>();
    if (findLatestInProgress('seller-presentation')) {
      resumable.add('seller-presentation');
    }
    setResumableSkillIds(resumable);
  }, []);

  // A7f.2: resolve entitlements ONCE per render, then resolve each skill
  // through the same context. Memoized on the AgentProfile reference —
  // the server passes a fresh object per request, so this recomputes on
  // a sub change / dev-access flip but is stable within a render.
  const entitlement: EntitlementContext = useMemo(
    () => resolveEntitlements(agentProfile),
    [agentProfile],
  );

  // Hydrating — render a minimal placeholder to avoid layout shift.
  if (brandConfigured === null) {
    return <div data-testid="dashboard-loading" className="h-32" aria-hidden />;
  }

  if (!brandConfigured) {
    return <EmptyState />;
  }

  const activeWorkflows = getActiveWorkflows(activeStates);

  return (
    <div className="flex flex-col gap-10">
      {activeWorkflows.length > 0 ? (
        <NextBestActionSection
          workflows={activeWorkflows.map((w) => ({
            workflow: w,
            primarySkill: getWorkflowPrimarySkill(w),
          }))}
          resumableSkillIds={resumableSkillIds}
          entitlement={entitlement}
        />
      ) : (
        <NoActiveWorkflowsState />
      )}

      <AllSkillsSection entitlement={entitlement} />
    </div>
  );
}

function EmptyState() {
  return (
    <div className="rounded-2xl bg-neutral-900 border border-mint/30 p-8 md:p-10">
      <p className="text-[11px] uppercase tracking-[0.18em] text-mint">
        Welcome to Studio
      </p>
      <h2 className="text-2xl font-semibold mt-2 leading-tight">
        Set up your brand profile to unlock skills.
      </h2>
      <p className="text-sm text-neutral-400 mt-3 max-w-xl leading-relaxed">
        Your logo, name, contact info, and brand colors flow into every
        marketing asset Studio generates. It takes about a minute.
      </p>
      <Link
        href="/settings"
        className="inline-flex items-center justify-center rounded-lg bg-mint text-black text-sm font-semibold px-5 py-2.5 mt-6 transition hover:bg-mint-hover"
      >
        Set up brand profile →
      </Link>
    </div>
  );
}

interface WorkflowEntry {
  workflow: ReturnType<typeof getActiveWorkflows>[number];
  primarySkill: CallableSkill | null;
}

function NextBestActionSection({
  workflows,
  resumableSkillIds,
  entitlement,
}: {
  workflows: WorkflowEntry[];
  resumableSkillIds: Set<string>;
  entitlement: EntitlementContext;
}) {
  // A7f.2: filter by `coreAccess.state === 'available'` BEFORE rendering
  // the card. Today this is a no-op (every skill's baseWorkflow is
  // 'base' or undefined, so core is always available); when a skill
  // lands whose entire workflow lives at a higher tier, this drops it
  // out of Next Best Action without per-surface gating logic.
  const renderable = workflows
    .filter(
      (w): w is { workflow: WorkflowEntry['workflow']; primarySkill: CallableSkill } =>
        w.primarySkill !== null,
    )
    .map(({ workflow, primarySkill }) => ({
      workflow,
      primarySkill,
      resolved: resolveSkill(primarySkill, entitlement),
    }))
    .filter(({ resolved }) => resolved.coreAccess.state === 'available');
  if (renderable.length === 0) return <NoActiveWorkflowsState />;

  return (
    <section className="flex flex-col gap-4">
      <h2 className="text-xs uppercase tracking-[0.18em] text-neutral-500">
        What to do next
      </h2>
      <div className="grid gap-4 md:grid-cols-2">
        {renderable.map(({ workflow, primarySkill }) => (
          <NextBestActionCard
            key={workflow.id}
            workflow={workflow}
            primarySkill={primarySkill}
            resumeAvailable={resumableSkillIds.has(primarySkill.id)}
          />
        ))}
      </div>
    </section>
  );
}

function NoActiveWorkflowsState() {
  return (
    <div className="rounded-xl bg-neutral-900 border border-neutral-800 p-6">
      <p className="text-sm text-neutral-300">
        You're all set up. Pick a tool below to start.
      </p>
    </div>
  );
}

function AllSkillsSection({ entitlement }: { entitlement: EntitlementContext }) {
  // Commit 3 refactor: buckets derived from each skill's required `category`
  // field (declared at the skill record's spec site) instead of hardcoded
  // ID-match filters here. Adding a new skill no longer requires editing
  // this file — declaring `category` on its CallableSkill is sufficient.
  // Root-cause fix for the v1.44.1 SIR-dropout bug class.
  //
  // A7f.2: each bucket runs through the resolver and drops tiles whose
  // `coreAccess` isn't available. Today everything is `available` (Base
  // workflows or undeclared), so this is a no-op — but proves the wiring.
  const buckets = getCategorizedSkills();

  return (
    <section className="flex flex-col gap-6">
      <h2 className="text-xs uppercase tracking-[0.18em] text-neutral-500">
        All skills
      </h2>

      {buckets.map(({ category, skills }) => {
        const accessible = skills.filter(
          (s) => resolveSkill(s, entitlement).coreAccess.state === 'available',
        );
        return <SkillGroup key={category} title={category} skills={accessible} />;
      })}
    </section>
  );
}

function SkillGroup({
  title,
  skills,
}: {
  title: string;
  skills: CallableSkill[];
}) {
  if (skills.length === 0) return null;
  return (
    <div className="flex flex-col gap-3">
      <h3 className="text-[11px] uppercase tracking-wider text-neutral-600">
        {title}
      </h3>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {skills.map((skill) => (
          <SkillTile key={skill.id} skill={skill} />
        ))}
      </div>
    </div>
  );
}
