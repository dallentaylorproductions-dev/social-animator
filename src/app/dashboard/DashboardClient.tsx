'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import {
  detectActiveStates,
  hasBrandProfileConfigured,
} from './state-detection';
import { getActiveWorkflows, getWorkflowPrimarySkill } from './workflows';
import { ALL_SKILLS } from '@/skills/registry';
import { NextBestActionCard } from './components/NextBestActionCard';
import { SkillTile } from './components/SkillTile';
import type { CallableSkill, WorkflowState } from '@/skills/types';

/**
 * Client island for the state-aware dashboard surface. Reads localStorage
 * for state detection (requires `window`); the parent server component
 * handles auth + the welcome header chrome.
 */
export function DashboardClient() {
  const [activeStates, setActiveStates] = useState<WorkflowState[]>([]);
  const [brandConfigured, setBrandConfigured] = useState<boolean | null>(null);

  useEffect(() => {
    setActiveStates(detectActiveStates());
    setBrandConfigured(hasBrandProfileConfigured());
  }, []);

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
        />
      ) : (
        <NoActiveWorkflowsState />
      )}

      <AllSkillsSection />
    </div>
  );
}

function EmptyState() {
  return (
    <div className="rounded-2xl bg-neutral-900 border border-[#4ef2d9]/30 p-8 md:p-10">
      <p className="text-[11px] uppercase tracking-[0.18em] text-[#4ef2d9]">
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
        className="inline-flex items-center justify-center rounded-lg bg-[#4ef2d9] text-black text-sm font-semibold px-5 py-2.5 mt-6 transition hover:bg-[#3fd9c1]"
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

function NextBestActionSection({ workflows }: { workflows: WorkflowEntry[] }) {
  const renderable = workflows.filter(
    (w): w is { workflow: WorkflowEntry['workflow']; primarySkill: CallableSkill } =>
      w.primarySkill !== null
  );
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

function AllSkillsSection() {
  const marketingAssets = ALL_SKILLS.filter(
    (s) => s.id === 'listing-flyer' || s.id === 'open-house-promo'
  );
  const sellerPitch = ALL_SKILLS.filter((s) => s.id === 'listing-presentation');
  const socialContent = ALL_SKILLS.filter((s) =>
    s.id.startsWith('social-animator-')
  );

  return (
    <section className="flex flex-col gap-6">
      <h2 className="text-xs uppercase tracking-[0.18em] text-neutral-500">
        All skills
      </h2>

      <SkillGroup title="Marketing assets" skills={marketingAssets} />
      <SkillGroup title="Seller pitch" skills={sellerPitch} />
      <SkillGroup title="Social content" skills={socialContent} />
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
