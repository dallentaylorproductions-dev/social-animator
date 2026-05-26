'use client';

import Link from 'next/link';
import type { CallableSkill } from '@/skills/types';
import { getRecommendedNextSkills } from '@/skills/registry';
import type { Workflow } from '../workflows';
import { skillRoute } from './skill-route';

interface NextBestActionCardProps {
  workflow: Workflow;
  primarySkill: CallableSkill;
  /**
   * Set by DashboardClient when an in-flight converged WorkflowInstance for
   * `primarySkill.id` exists. When true, the primary CTA relabels to
   * "Resume your draft →"; the href is unchanged because the wizard's
   * mount effect auto-resumes the latest in-progress instance on a bare
   * skill URL (see src/skills/workflow-instance-storage.ts:findLatestInProgress
   * and src/app/seller-presentation/page.tsx). Optional — older workflows
   * without a converged store leave this unset and the card behaves as before.
   */
  resumeAvailable?: boolean;
}

export function NextBestActionCard({
  workflow,
  primarySkill,
  resumeAvailable = false,
}: NextBestActionCardProps) {
  const nextSkills = getRecommendedNextSkills(primarySkill.id);
  const primaryLabel = resumeAvailable
    ? 'Resume your draft'
    : primarySkill.name;

  return (
    <div className="rounded-2xl bg-neutral-900 border border-mint/30 p-6 md:p-7 transition hover:border-mint/60">
      <p className="text-[11px] uppercase tracking-[0.18em] text-mint">
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
          className="inline-flex items-center justify-center rounded-lg bg-mint text-black text-sm font-semibold px-5 py-2.5 transition hover:bg-mint-hover"
        >
          {primaryLabel} →
        </Link>
        {nextSkills.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[11px] text-neutral-500 leading-relaxed">After this:</span>
            {nextSkills.map((s) => (
              <Link
                key={s.id}
                href={skillRoute(s.id)}
                className="inline-flex items-center rounded-full border border-neutral-700 px-3 py-1 text-[11px] text-neutral-300 hover:border-mint/60 hover:text-mint transition"
              >
                {s.name}
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
