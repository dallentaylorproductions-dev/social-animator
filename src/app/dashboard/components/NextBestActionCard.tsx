'use client';

import Link from 'next/link';
import type { CallableSkill } from '@/skills/types';
import { getRecommendedNextSkills } from '@/skills/registry';
import type { Workflow } from '../workflows';
import { skillRoute } from './skill-route';

interface NextBestActionCardProps {
  workflow: Workflow;
  primarySkill: CallableSkill;
}

export function NextBestActionCard({
  workflow,
  primarySkill,
}: NextBestActionCardProps) {
  const nextSkills = getRecommendedNextSkills(primarySkill.id);

  return (
    <div className="rounded-2xl bg-neutral-900 border border-[#4ef2d9]/30 p-6 md:p-7 transition hover:border-[#4ef2d9]/60">
      <p className="text-[11px] uppercase tracking-[0.18em] text-[#4ef2d9]">
        Next best action
      </p>
      <h2 className="text-2xl font-semibold mt-2 leading-tight">
        {workflow.name}
      </h2>
      <p className="text-sm text-neutral-400 mt-2 leading-relaxed">
        {workflow.emotionalDriver}
      </p>

      <p className="text-[13px] text-neutral-300 mt-5 leading-relaxed">
        {primarySkill.purpose}
      </p>

      <div className="mt-6 flex flex-col sm:flex-row sm:items-center gap-3">
        <Link
          href={skillRoute(primarySkill.id)}
          className="inline-flex items-center justify-center rounded-lg bg-[#4ef2d9] text-black text-sm font-semibold px-5 py-2.5 transition hover:bg-[#3fd9c1]"
        >
          {primarySkill.name} →
        </Link>
        {nextSkills.length > 0 && (
          <p className="text-[11px] text-neutral-500 leading-relaxed">
            After this: {nextSkills.map((s) => s.name).join(' · ')}
          </p>
        )}
      </div>
    </div>
  );
}
