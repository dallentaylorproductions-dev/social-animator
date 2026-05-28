'use client';

import Link from 'next/link';
import type { CallableSkill } from '@/skills/types';
import { getRecommendedNextSkills } from '@/skills/registry';
import type { Workflow } from '../workflows';
import { skillRoute } from './skill-route';
import { posterForSkillId } from './posters/posterForSkillId';

/**
 * Hero "Up next" card (v1.47 Lane A re-brand).
 *
 * Functionally the same surface as the old NextBestActionCard — driven by
 * the active Workflow + its primary skill + recommendedNextSkills chips +
 * the resumable flag. New visual shell: warm-dark hero card with a
 * poster preview on the right, primary CTA on the left, "Then queue"
 * chips below.
 *
 * The poster on the right is picked from posterForSkillId(primarySkill.id)
 * so the preview matches what the agent will actually generate.
 *
 * The "Skip · pick another tool" ghost button is an anchor to
 * `#stage-launch` so the agent can browse the alternatives directly
 * (the LAUNCH section is where most marketing-asset tools live).
 */
export function HeroNextAction({
  workflow,
  primarySkill,
  resumeAvailable = false,
}: {
  workflow: Workflow;
  primarySkill: CallableSkill;
  resumeAvailable?: boolean;
}) {
  const nextSkills = getRecommendedNextSkills(primarySkill.id);
  const primaryLabel = resumeAvailable ? 'Resume your draft' : primarySkill.name;

  return (
    <div className="hero-card" data-testid="sep-hero">
      <div className="hero-left">
        <div className="hero-eyebrow">
          <span className="hero-dot" />
          UP NEXT · BASED ON YOUR ACTIVITY
        </div>
        <h2 className="hero-title" data-testid="sep-hero-title">
          {workflow.name}
        </h2>
        <p className="hero-sub">{workflow.emotionalDriver}</p>
        <p className="hero-sub">{primarySkill.purpose}</p>
        <div className="hero-actions">
          <Link
            href={skillRoute(primarySkill.id)}
            className="btn btn-primary"
            data-testid="sep-hero-primary"
          >
            {primaryLabel}
            <span className="btn-arrow">→</span>
          </Link>
          <a
            href="#stage-launch"
            className="btn btn-ghost"
            data-testid="sep-hero-secondary"
          >
            Skip · pick another tool
          </a>
        </div>
        {nextSkills.length > 0 && (
          <div className="hero-after">
            <span className="hero-after-label">Then queue</span>
            {nextSkills.map((s) => (
              <Link
                key={s.id}
                href={skillRoute(s.id)}
                className="hero-chip"
                data-testid={`sep-hero-chip-${s.id}`}
              >
                {s.name}
              </Link>
            ))}
          </div>
        )}
      </div>
      <div className="hero-right">
        <div className="hero-poster-wrap">
          {posterForSkillId(primarySkill.id)}
          <div className="hero-poster-tag">PREVIEW · YOUR OUTPUT</div>
        </div>
      </div>
    </div>
  );
}

/**
 * Empty-state hero — surfaced when no workflow is active (fresh account,
 * brand profile configured but no listing / open house / SIR draft yet).
 * Calm CTA that points the agent at the next thing that always makes
 * sense: making the brand kit feel theirs.
 */
export function HeroEmptyState() {
  return (
    <div className="hero-card" data-testid="sep-hero-empty">
      <div className="hero-left">
        <div className="hero-eyebrow">
          <span className="hero-dot" />
          UP NEXT · GETTING STARTED
        </div>
        <h2 className="hero-title">Ready when you are.</h2>
        <p className="hero-sub">
          Pick a tool below to start. The first asset you generate sets the
          tone for everything that follows.
        </p>
        <div className="hero-actions">
          <Link
            href="/settings"
            className="btn btn-primary"
            data-testid="sep-hero-primary"
          >
            Open brand kit
            <span className="btn-arrow">→</span>
          </Link>
          <a
            href="#stage-launch"
            className="btn btn-ghost"
            data-testid="sep-hero-secondary"
          >
            Skip · browse tools
          </a>
        </div>
      </div>
      <div className="hero-right">
        <div className="hero-poster-wrap">
          {posterForSkillId('listing-flyer')}
          <div className="hero-poster-tag">PREVIEW · YOUR OUTPUT</div>
        </div>
      </div>
    </div>
  );
}
