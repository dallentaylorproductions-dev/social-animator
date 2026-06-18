'use client';

import Link from 'next/link';
import type { CallableSkill } from '@/skills/types';
import { StageHeader } from './components/StageHeader';
import { StageDot, FormatChips, formatsForOutputs } from './components/Tile';
import { SocialStudioTile } from './components/SocialStudio';
import { posterForSkillId } from './components/posters/posterForSkillId';
import { getSkillById } from '@/skills/registry';
import {
  flagshipTool,
  quickOutputTools,
  comingNextTools,
  type DashboardTool,
} from './tool-registry';
import {
  useOwnerPagesActivity,
  type OwnerPagesActivity,
} from './use-owner-pages-activity';
import { deriveTodayState } from './today-state';

/**
 * DASHBOARD_HOME_V2 — the progressive operating home (Pass 1).
 *
 * Renders the four tiers from the dashboard tool registry, top to bottom:
 *   1. Today      — dynamic top card (returning → needs-attention into
 *                   Your pages + Create; new → create-first-page).
 *   2. Flagship   — ONE Seller Presentation card with live activity
 *                   (N active · N worth a follow-up) from the SAME
 *                   owner-scoped source as Your pages.
 *   3. Quick      — the built smaller tools, reframed by their job.
 *      outputs
 *   4. Stay       — Social Studio as its own section (the existing
 *      visible     flagship marquee).
 *   + Coming next — a small, quiet area (never greyed flagship cards).
 *
 * Availability MODE drives the treatment; promoting a tool is a registry
 * data change, not a layout change. Brand kit is no longer the perpetual
 * primary CTA — it lives as a quiet setup affordance under Today.
 *
 * Mounted ONLY when DASHBOARD_HOME_V2 is on (DashboardClient branches on
 * the server-resolved prop). Flag-off never renders a line of this tree.
 */

interface DashboardHomeV2Props {
  welcomeFirstName: string;
  welcomeSubtitle: string;
  dateEyebrow: string;
  /** Pre-resolved 'Social content' skills (for the Social Studio marquee). */
  visibilitySkills: CallableSkill[];
}

export function DashboardHomeV2({
  welcomeFirstName,
  welcomeSubtitle,
  dateEyebrow,
  visibilitySkills,
}: DashboardHomeV2Props) {
  const activity = useOwnerPagesActivity();
  const flagship = flagshipTool();
  const quick = quickOutputTools();
  const comingNext = comingNextTools();

  return (
    <>
      {/* WELCOME (reused derivation — greeting stays; Today replaces hero) */}
      <section className="welcome">
        <div className="welcome-left">
          <div className="welcome-eyebrow">
            <span className="live-dot" />
            DASHBOARD{dateEyebrow ? ` · ${dateEyebrow}` : ''}
          </div>
          <h1 className="welcome-title">
            Welcome back,
            <br />
            <span className="welcome-name" data-testid="sep-welcome-name">
              {welcomeFirstName}.
            </span>
          </h1>
          <p className="welcome-sub" data-testid="sep-welcome-sub">
            {welcomeSubtitle}
          </p>
        </div>
      </section>

      {/* TIER 1 — TODAY (dynamic top card; replaces the brand-kit hero) */}
      <TodayCard activity={activity} />

      {/* TIER 2 — FLAGSHIP (Seller Presentation, live activity) */}
      {flagship && (
        <section className="stage" id="stage-win" data-testid="sep-stage-win">
          <StageHeader
            index={1}
            label="Win the listing"
            hint="Show up prepared. Close the appointment."
            stage="win"
          />
          <FlagshipCard tool={flagship} activity={activity} />
        </section>
      )}

      {/* TIER 3 — QUICK OUTPUTS (built tools, reframed by job) */}
      {quick.length > 0 && (
        <section className="stage" id="stage-launch" data-testid="sep-stage-launch">
          <StageHeader
            index={2}
            label="Launch the marketing"
            hint="Quick assets the listing creates around it."
            stage="launch"
          />
          <div className="grid grid-quick" data-testid="sep-quick-grid">
            {quick.map((tool) => (
              <QuickOutputCard key={tool.id} tool={tool} />
            ))}
          </div>
        </section>
      )}

      {/* TIER 4 — STAY VISIBLE (Social Studio, its own section) */}
      <section className="stage" id="stage-visibility" data-testid="sep-stage-visibility">
        <StageHeader
          index={3}
          label="Stay visible"
          hint="Cadence content. One studio, ten formats."
          stage="visibility"
        />
        <SocialStudioTile skills={visibilitySkills} />
      </section>

      {/* COMING NEXT (quiet; never a greyed flagship card) */}
      {comingNext.length > 0 && (
        <section className="coming-next" data-testid="sep-coming-next">
          <div className="coming-next-head">Coming next</div>
          <ul className="coming-next-list">
            {comingNext.map((tool) => (
              <li
                key={tool.id}
                className="coming-next-item"
                data-testid={`sep-coming-${tool.id}`}
              >
                <span className="coming-next-name">{tool.name}</span>
                <span className="coming-next-desc">{tool.description}</span>
                {tool.statusLabel && (
                  <span className="coming-next-tag">{tool.statusLabel}</span>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      <footer className="bottom">
        <span>SEP-S · Dashboard Home v2</span>
      </footer>
    </>
  );
}

/* ───────────────────────────────────────────────────────────────────────── */
/* TIER 1 — Today card                                                        */

const SELLER_PRESENTATION_HREF = '/seller-presentation';

function plural(n: number, one: string, many: string): string {
  return n === 1 ? one : many;
}

/**
 * Today card — the single dynamic "what to do now" surface. Pass-1 scope:
 * returning vs basic-empty only (the richer new/sample/partial onboarding
 * states are the Pass-2 seam). The needs-attention line POINTS INTO Your
 * pages (it is not a second follow-up inbox), so the count + Review link
 * both resolve from the one owner-scoped source.
 */
function TodayCard({ activity }: { activity: OwnerPagesActivity }) {
  const { state, needsAttention, worthFollowUpCount } = deriveTodayState(activity);
  const isNew = state === 'new';
  const isReturning = state === 'returning';

  const headline = isNew
    ? 'Create your first seller page.'
    : 'Pick up where you left off.';
  const ctaLabel = isNew ? 'Create your first seller page' : 'Create seller page';

  return (
    <section className="today" data-testid="sep-today" data-today-state={state}>
      <div className="today-eyebrow">
        <span className="today-dot" />
        TODAY
      </div>

      <h2 className="today-title" data-testid="sep-today-title">
        {headline}
      </h2>

      {needsAttention && (
        <Link
          href={SELLER_PRESENTATION_HREF}
          className="today-attention"
          data-testid="sep-today-attention"
        >
          <span className="today-attention-count">{worthFollowUpCount}</span>
          {` ${plural(worthFollowUpCount, 'page', 'pages')} worth a follow-up`}
          <span className="today-attention-cta">Review →</span>
        </Link>
      )}

      {isReturning && !needsAttention && (
        <p className="today-sub" data-testid="sep-today-sub">
          You are all caught up. Start your next listing when you are ready.
        </p>
      )}

      {isNew && (
        <p className="today-sub" data-testid="sep-today-sub">
          Win your next listing appointment with a premium seller-facing page.
        </p>
      )}

      <div className="today-actions">
        <Link
          href={SELLER_PRESENTATION_HREF}
          className="btn btn-primary"
          data-testid="sep-today-primary"
        >
          {ctaLabel}
          <span className="btn-arrow">→</span>
        </Link>
        <Link
          href="/settings"
          className="today-setup"
          data-testid="sep-today-setup"
        >
          Personalize your brand kit →
        </Link>
      </div>
    </section>
  );
}

/* ───────────────────────────────────────────────────────────────────────── */
/* TIER 2 — Flagship card                                                     */

/**
 * Seller Presentation flagship — ONE prominent card showing live activity
 * (N active · N worth a follow-up) from the owner-scoped pages source, with
 * a primary "Create seller page" and a secondary "Open Your pages". Not four
 * equal sibling cards; not a greyed roadmap tile.
 */
function FlagshipCard({
  tool,
  activity,
}: {
  tool: DashboardTool;
  activity: OwnerPagesActivity;
}) {
  const skill = getSkillById(tool.id);
  const formats = skill ? formatsForOutputs(skill.outputs) : [];
  const showActivity = activity.status === 'ready' && activity.totalPages > 0;

  return (
    <div className="flagship-card" data-testid="sep-flagship-seller">
      <div className="flagship-card-body">
        <div className="tile-meta">
          <StageDot stage="win" />
          {formats.length > 0 && <FormatChips formats={formats} />}
        </div>

        <h3 className="flagship-card-title">{tool.name}</h3>
        <p className="flagship-card-blurb">{tool.description}</p>

        {showActivity && (
          <div className="flagship-activity" data-testid="sep-flagship-activity">
            <span className="flagship-stat">
              <span className="flagship-stat-num">{activity.activeCount}</span>
              {` active ${plural(activity.activeCount, 'page', 'pages')}`}
            </span>
            <span className="flagship-stat-sep" aria-hidden>
              ·
            </span>
            <span className="flagship-stat">
              <span className="flagship-stat-num">
                {activity.worthFollowUpCount}
              </span>
              {' worth a follow-up'}
            </span>
          </div>
        )}

        <div className="flagship-card-actions">
          <Link
            href={tool.primaryHref}
            className="btn btn-primary"
            data-testid="sep-flagship-primary"
          >
            {tool.primaryActionLabel}
            <span className="btn-arrow">→</span>
          </Link>
          <Link
            href={SELLER_PRESENTATION_HREF}
            className="btn btn-ghost"
            data-testid="sep-flagship-secondary"
          >
            Open Your pages
          </Link>
        </div>
      </div>

      <div className="flagship-card-poster">
        <div className="flagship-card-poster-wrap">
          {posterForSkillId(tool.id)}
        </div>
      </div>
    </div>
  );
}

/* ───────────────────────────────────────────────────────────────────────── */
/* TIER 3 — Quick output card                                                 */

/**
 * Quick output card — a built smaller tool, framed by its JOB. Clickable
 * (active, not a coming-soon roadmap tile): the whole card is the link to
 * the tool route declared in the registry. Title / blurb / CTA come from
 * the registry's job reframe, not the skill's raw name.
 */
function QuickOutputCard({ tool }: { tool: DashboardTool }) {
  const skill = getSkillById(tool.id);
  const formats = skill ? formatsForOutputs(skill.outputs) : [];

  return (
    <Link
      href={tool.primaryHref}
      className="quick-card"
      data-testid={`sep-quick-${tool.id}`}
    >
      <div className="quick-card-poster">{posterForSkillId(tool.id)}</div>
      <div className="quick-card-body">
        <div className="tile-meta">
          <StageDot stage={tool.category === 'Win the listing' ? 'win' : 'launch'} />
          {formats.length > 0 && <FormatChips formats={formats} />}
        </div>
        <h3 className="quick-card-title">{tool.name}</h3>
        <p className="quick-card-blurb">{tool.description}</p>
        <span className="quick-card-cta" aria-hidden>
          {tool.primaryActionLabel} →
        </span>
      </div>
    </Link>
  );
}
