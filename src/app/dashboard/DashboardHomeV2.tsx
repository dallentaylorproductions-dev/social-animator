'use client';

import Link from 'next/link';
import type { CallableSkill } from '@/skills/types';
import { StageHeader } from './components/StageHeader';
import { StageDot, FormatChips, formatsForOutputs } from './components/Tile';
import { SocialStudioTile } from './components/SocialStudio';
import { posterForSkillId } from './components/posters/posterForSkillId';
import { getSkillById } from '@/skills/registry';
import { flagshipTool, type DashboardTool } from './tool-registry';
import {
  useOwnerPagesActivity,
  type OwnerPagesActivity,
} from './use-owner-pages-activity';
import {
  deriveTodayState,
  previewTodayView,
  type TodayState,
} from './today-state';
import { useTodaySeamSignals } from './use-today-seam-signals';

/**
 * DASHBOARD_HOME_V2 — the launch operating home.
 *
 * The launch home is three things, in this order, and nothing else
 * (this supersedes the earlier four-tier "Quick Outputs visible tier" plan):
 *   1. Today      — dynamic top card (returning → needs-attention into
 *                   Your pages + Create; new → create-first-page).
 *   2. Flagship   — the prominent Seller Presentation hero card with live
 *                   activity (N active · N worth a follow-up) from the SAME
 *                   owner-scoped source as Your pages.
 *   3. Stay       — Social Studio as a calmer SECONDARY section beneath the
 *      visible     hero (the daily-use anchor, not a co-equal flagship).
 *
 * Removed at launch: the Quick Outputs tier and every "Coming soon" tile.
 * The other built tools are `hidden` in the registry — out of the nav
 * entirely, no greyed cards, no graveyard. They return later as
 * anticipation-layer moments via a registry data flip.
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
  /**
   * DASHBOARD_TODAY_SEAM (Pass 3) — server-resolved. When false (default), the
   * Today card derives only the Pass-1 new/returning states and renders
   * byte-identical to today. When true, it reflects the full onboarding state
   * set (adds sample-only + partial). Only the Today card changes.
   */
  todaySeam?: boolean;
  /**
   * QA display override (preview/dev only) — forces which Today-card state
   * renders, or null for normal derivation. Already gated server-side.
   */
  todaySeamPreview?: TodayState | null;
}

export function DashboardHomeV2({
  welcomeFirstName,
  welcomeSubtitle,
  dateEyebrow,
  visibilitySkills,
  todaySeam = false,
  todaySeamPreview = null,
}: DashboardHomeV2Props) {
  const activity = useOwnerPagesActivity();
  const flagship = flagshipTool();

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
      <TodayCard
        activity={activity}
        seamEnabled={todaySeam}
        previewState={todaySeamPreview}
      />

      {/* HERO — FLAGSHIP (Seller Presentation, live activity) */}
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

      {/* SECONDARY — STAY VISIBLE (Social Studio, calmer daily-use anchor).
          Deliberately NOT a numbered StageHeader: Stay-visible is not step 2
          of winning a listing, so it reads as a quieter secondary subhead
          beneath the hero, not a co-equal "Stage 02". The Seller Presentation
          hero above stays the single numbered primary stage. */}
      <section
        className="stage stage-secondary"
        id="stage-visibility"
        data-testid="sep-stage-visibility"
      >
        <header
          className="stage-head stage-head-secondary"
          data-stage="visibility"
          data-testid="sep-stage-head-visibility"
        >
          <div className="stage-text">
            <div className="stage-label">Stay visible</div>
            <div className="stage-hint">
              Cadence content. One studio, ten formats.
            </div>
          </div>
          <div className="stage-rule" />
        </header>
        <SocialStudioTile skills={visibilitySkills} />
      </section>

      <footer className="bottom">
        <span>SEP-S · Dashboard Home v2</span>
      </footer>
    </>
  );
}

/* ───────────────────────────────────────────────────────────────────────── */
/* TIER 1 — Today card                                                        */

const SELLER_PRESENTATION_HREF = '/seller-presentation';
/** The real onboarding path entry (address-start flow). */
const ONBOARDING_HREF = '/welcome';
/** Read-only example page (the "View an example" target). Mints nothing. */
const EXAMPLE_HREF = '/seller-presentation-preview?fixture=full';

function plural(n: number, one: string, many: string): string {
  return n === 1 ? one : many;
}

/**
 * Today card — the single dynamic "what to do now" surface.
 *
 * Pass 1 derived `returning` vs `new` only. Pass 3 (DASHBOARD_TODAY_SEAM,
 * `seamEnabled`) adds the two mid-onboarding states an agent can now be in, so
 * the dashboard continues onboarding instead of cold-starting it:
 *   - `partial`      — an in-progress, never-published draft → RESUME that
 *                      exact page (deep-link `?id=`), per the converged-instance
 *                      resume-on-open pattern.
 *   - `sample-only`  — walked the sample, made nothing → a prominent convert
 *                      card into the real onboarding path.
 * Precedence (most-advanced actionable state): returning > partial >
 * sample-only > new. When the seam is OFF the card derives only new/returning
 * and is byte-identical to Pass 1.
 *
 * The card stays a thin POINTER, never a second inbox: the needs-attention
 * line and the count both resolve from the one owner-scoped pages source, and
 * the resume deep-links into the draft the wizard already owns.
 */
function TodayCard({
  activity,
  seamEnabled,
  previewState = null,
}: {
  activity: OwnerPagesActivity;
  seamEnabled: boolean;
  /**
   * QA display override (preview/dev only, already gated server-side). When
   * set, the card renders this state from a fully synthetic view instead of
   * the derived one — no real page/draft is read. null in production.
   */
  previewState?: TodayState | null;
}) {
  // undefined when the seam is off (or still resolving) → the deriver produces
  // the byte-identical Pass-1 state set.
  const seamSignals = useTodaySeamSignals(seamEnabled);
  const derived = deriveTodayState(activity, seamSignals);
  // The QA override wins when present (synthetic display data); otherwise the
  // real derivation drives the card.
  const { state, needsAttention, worthFollowUpCount, partialInstanceId, partialLabel } =
    previewState ? previewTodayView(previewState) : derived;

  const isNew = state === 'new';
  const isReturning = state === 'returning';
  const isPartial = state === 'partial';
  const isSampleOnly = state === 'sample-only';
  const isProfileReady = state === 'profile-ready';

  let headline: string;
  if (isPartial) {
    headline = partialLabel
      ? `Pick up where you left off on ${partialLabel}.`
      : 'Pick up where you left off.';
  } else if (isProfileReady) {
    headline = 'Your seller page details are ready.';
  } else if (isSampleOnly) {
    headline = 'You have seen what it does. Now make one for your listing.';
  } else if (isNew) {
    headline = 'Create your first seller page.';
  } else {
    headline = 'Pick up where you left off.';
  }

  // The primary action. Non-seam states keep the Pass-1 target (the cockpit)
  // so flag-off stays byte-identical; partial deep-links the exact draft and
  // sample-only opens the real onboarding path.
  let primaryHref = SELLER_PRESENTATION_HREF;
  let ctaLabel = isNew ? 'Create your first seller page' : 'Create seller page';
  if (isPartial) {
    primaryHref = `${SELLER_PRESENTATION_HREF}?id=${partialInstanceId}`;
    ctaLabel = 'Resume your page';
  } else if (isProfileReady) {
    // The §10 climax: the Agent Layer is already populated, so the wizard opens
    // with the hero/agent band/marketing pre-filled — the first real page is
    // genuinely half-built.
    primaryHref = SELLER_PRESENTATION_HREF;
    ctaLabel = 'Create your first seller page';
  } else if (isSampleOnly) {
    primaryHref = ONBOARDING_HREF;
    ctaLabel = 'Make one for your listing';
  }

  return (
    <section
      className="today"
      data-testid="sep-today"
      data-today-state={state}
      data-today-preview={previewState ? '1' : undefined}
    >
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

      {isPartial && (
        <p className="today-sub" data-testid="sep-today-sub">
          Your in-progress page is saved. Finish it whenever you are ready.
        </p>
      )}

      {isProfileReady && (
        <p className="today-sub" data-testid="sep-today-sub">
          When you have an address, Studio uses your photo, contact, review, and
          marketing approach automatically.
        </p>
      )}

      {isSampleOnly && (
        <p className="today-sub" data-testid="sep-today-sub">
          Start with your address and build the page for your real listing.
        </p>
      )}

      {isNew && (
        <p className="today-sub" data-testid="sep-today-sub">
          Win your next listing appointment with a premium seller-facing page.
        </p>
      )}

      <div className="today-actions">
        <Link
          href={primaryHref}
          className="btn btn-primary"
          data-testid="sep-today-primary"
        >
          {ctaLabel}
          <span className="btn-arrow">→</span>
        </Link>
        {isProfileReady ? (
          <Link
            href={EXAMPLE_HREF}
            className="today-setup"
            data-testid="sep-today-setup"
          >
            View an example →
          </Link>
        ) : (
          <Link
            href="/settings"
            className="today-setup"
            data-testid="sep-today-setup"
          >
            Personalize your brand kit →
          </Link>
        )}
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
