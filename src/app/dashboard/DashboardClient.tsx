'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  detectActiveStates,
  hasBrandProfileConfigured,
} from './state-detection';
import { getActiveWorkflows, getWorkflowPrimarySkill } from './workflows';
import { ALL_SKILLS, getSkillsByCategory } from '@/skills/registry';
import { findLatestInProgress } from '@/skills/workflow-instance-storage';
import { resolveEntitlements, resolveSkill } from '@/lib/entitlements/resolver';
import type {
  AgentProfile,
  EntitlementContext,
} from '@/lib/entitlements/types';
import type { CallableSkill, WorkflowState } from '@/skills/types';
import { HeroNextAction, HeroEmptyState } from './components/HeroNextAction';
import { StageHeader } from './components/StageHeader';
import { Tile, type TileStage } from './components/Tile';
import { posterForSkillId } from './components/posters/posterForSkillId';
import {
  SocialStudioTile,
  SocialStudioModal,
} from './components/SocialStudio';

/**
 * Dashboard client island (v1.47 Lane A re-brand — SEP-S Studio shell).
 *
 * Replaces the prior NextBestAction + AllSkillsSection structure with a
 * magazine-style bento: welcome → hero "Up next" → three stage sections
 * (Win → Launch → Stay visible) → footer. Three concerns kept clean:
 *
 *   1. Composition (this file): topbar lives in page.tsx (sign-out is
 *      a server action); everything below — welcome, hero, stages,
 *      flagship, footer — composes here from a small set of typed
 *      primitives in ./components/.
 *
 *   2. State detection (./state-detection.ts) — unchanged. Same
 *      localStorage reads, same activeStates union.
 *
 *   3. Entitlement resolution (../../lib/entitlements/resolver) —
 *      unchanged. resolveEntitlements(agentProfile) runs once per render
 *      via useMemo; resolveSkill(...) lifts each registry record into a
 *      ResolvedSkill the tile then consumes. The ?testTier= URL knob
 *      flows in via the AgentProfile that page.tsx passes — preserved
 *      by construction.
 *
 * Stage assignment (registry-driven — derive don't hardcode, per the
 * v1.44 lesson):
 *
 *   - WIN     = SkillCategory ∈ { 'Seller pitch', 'Open house' }
 *   - LAUNCH  = SkillCategory  =  'Marketing assets'
 *   - VISIBILITY = SkillCategory = 'Social content' (rendered as ONE
 *     flagship tile + modal picker, not individual tiles)
 *
 * The seller-presentation skill renders TWO tiles' worth of visual
 * identity per the packet's stop-condition: the design's "Listing
 * Presentation" title + blurb is the title-overrode wrapper around the
 * SAME skill record. The legacy listing-presentation skill renders its
 * own tile (registry-truth: surface a category-matching skill even if
 * the design didn't show it).
 */

/* ───────────────────────────────────────────────────────────────────────── */
/* TILE CONFIG — design-driven copy overrides + poster pinning              */

interface WinTileConfig {
  skillId: string;
  /** Tile title to render (overrides the skill's `name` for design copy). */
  titleOverride?: string;
  /** Tile blurb to render (overrides the skill's `purpose` for design copy). */
  blurbOverride?: string;
}

/**
 * Win-stage tile order. Hand-curated so the design's intended hierarchy
 * surfaces (Seller Presentation lead → SIR prep → legacy one-pager →
 * OH Prep), but EACH tile resolves to a real ALL_SKILLS record — no
 * design-fixture tiles ship. The title/blurb overrides for the lead
 * tile match the design exactly per the stop-condition resolution:
 * "Listing Presentation" with the "Full seller-facing deck" copy IS
 * the seller-presentation skill.
 */
const WIN_TILE_ORDER: WinTileConfig[] = [
  {
    skillId: 'seller-presentation',
    titleOverride: 'Listing Presentation',
    blurbOverride:
      'Full seller-facing deck. Agent prep + premium presentation page.',
  },
  { skillId: 'seller-intelligence-report' },
  { skillId: 'listing-presentation' }, // legacy "Listing Presentation One-Pager" — still surfaced
  { skillId: 'open-house-prep' },
];

const LAUNCH_TILE_ORDER: string[] = ['listing-flyer', 'open-house-promo'];

/* ───────────────────────────────────────────────────────────────────────── */

interface ResolvedWinTile {
  config: WinTileConfig;
  skill: CallableSkill;
}

function resolveWinTiles(): ResolvedWinTile[] {
  const ordered: ResolvedWinTile[] = [];
  for (const config of WIN_TILE_ORDER) {
    const skill = ALL_SKILLS.find((s) => s.id === config.skillId);
    if (skill) ordered.push({ config, skill });
  }
  // Surface ANY OTHER skill in Seller pitch / Open house that the
  // curated order missed — keeps the registry as ground truth (the
  // packet's "if the registry has a skill in a stage's category that
  // the design doesn't show, STILL surface it" rule).
  const orderedIds = new Set(ordered.map((t) => t.skill.id));
  const extras = [
    ...getSkillsByCategory('Seller pitch'),
    ...getSkillsByCategory('Open house'),
  ].filter((s) => !orderedIds.has(s.id));
  for (const skill of extras) {
    ordered.push({ config: { skillId: skill.id }, skill });
  }
  return ordered;
}

function resolveLaunchTiles(): CallableSkill[] {
  const orderedIds = new Set(LAUNCH_TILE_ORDER);
  const inOrder: CallableSkill[] = [];
  for (const id of LAUNCH_TILE_ORDER) {
    const skill = ALL_SKILLS.find((s) => s.id === id);
    if (skill) inOrder.push(skill);
  }
  const extras = getSkillsByCategory('Marketing assets').filter(
    (s) => !orderedIds.has(s.id),
  );
  return [...inOrder, ...extras];
}

function resolveVisibilitySkills(): CallableSkill[] {
  return getSkillsByCategory('Social content');
}

/* ───────────────────────────────────────────────────────────────────────── */
/* Welcome derivations (subtitle from active listing + OH; first name)      */

function readJson<T>(key: string): T | null {
  if (typeof window === 'undefined' || !window.localStorage) return null;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

interface WelcomeSnapshot {
  firstName: string;
  subtitle: string;
}

function readWelcomeSnapshot(): WelcomeSnapshot {
  const brand = readJson<{ agentName?: string }>('socanim_brand_settings');
  const fullName = brand?.agentName?.trim() ?? '';
  const firstName = fullName ? fullName.split(/\s+/)[0] : 'there';

  const parts: string[] = [];
  const listing = readJson<{ address?: string }>('socanim_listing_profile');
  if (listing?.address?.trim()) {
    parts.push(`${listing.address.trim()} is live`);
  }

  // Open house upcoming in the next 7 days (across prep + promo drafts).
  const candidates: Array<{ eventDate?: string } | null> = [
    readJson<{ eventDate?: string }>('openHousePromo:draft'),
    readJson<{ eventDate?: string }>('openHousePrep:draft'),
  ];
  const now = Date.now();
  const weekMs = 7 * 24 * 60 * 60 * 1000;
  const hasUpcomingOh = candidates.some((c) => {
    if (!c?.eventDate) return false;
    const ts = new Date(c.eventDate).getTime();
    return Number.isFinite(ts) && ts >= now && ts <= now + weekMs;
  });
  if (hasUpcomingOh) parts.push('one open house this week');

  const subtitle = parts.length > 0 ? `${parts.join(' · ')}.` : 'Ready when you are.';

  return { firstName, subtitle };
}

/* ───────────────────────────────────────────────────────────────────────── */

export function DashboardClient({ agentProfile }: { agentProfile: AgentProfile }) {
  const [activeStates, setActiveStates] = useState<WorkflowState[]>([]);
  const [brandConfigured, setBrandConfigured] = useState<boolean | null>(null);
  const [welcome, setWelcome] = useState<WelcomeSnapshot>({
    firstName: 'there',
    subtitle: 'Ready when you are.',
  });
  const [resumableSkillIds, setResumableSkillIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [studioOpen, setStudioOpen] = useState(false);
  /**
   * SSR-safe date eyebrow per sep-nextjs-hydration-pattern. Initialized
   * empty so SSR + first client paint match; populated in useEffect so
   * the date string differs between server time and the agent's locale
   * without throwing a hydration warning.
   */
  const [dateEyebrow, setDateEyebrow] = useState<string>('');

  useEffect(() => {
    setActiveStates(detectActiveStates());
    setBrandConfigured(hasBrandProfileConfigured());
    setWelcome(readWelcomeSnapshot());

    const resumable = new Set<string>();
    if (findLatestInProgress('seller-presentation')) {
      resumable.add('seller-presentation');
    }
    setResumableSkillIds(resumable);

    setDateEyebrow(
      new Date()
        .toLocaleDateString('en-US', {
          weekday: 'long',
          month: 'long',
          day: 'numeric',
        })
        .toUpperCase(),
    );
  }, []);

  const entitlement: EntitlementContext = useMemo(
    () => resolveEntitlements(agentProfile),
    [agentProfile],
  );

  // First active workflow (priority-ordered) drives the hero card.
  const activeWorkflows = getActiveWorkflows(activeStates);
  const heroPair = useMemo(() => {
    for (const w of activeWorkflows) {
      const skill = getWorkflowPrimarySkill(w);
      if (!skill) continue;
      const resolved = resolveSkill(skill, entitlement);
      if (resolved.coreAccess.state !== 'available') continue;
      return { workflow: w, primarySkill: skill };
    }
    return null;
  }, [activeWorkflows, entitlement]);

  // Pre-resolve tile data once per render.
  const winTiles = useMemo(
    () =>
      resolveWinTiles().map(({ config, skill }) => ({
        config,
        resolved: resolveSkill(skill, entitlement),
      })),
    [entitlement],
  );
  const launchTiles = useMemo(
    () =>
      resolveLaunchTiles().map((skill) => ({
        skill,
        resolved: resolveSkill(skill, entitlement),
      })),
    [entitlement],
  );
  const visibilitySkills = useMemo(resolveVisibilitySkills, []);

  // Hydrating — show a minimal placeholder for the dynamic blocks.
  // The shell (topbar) already rendered server-side, so this is just for
  // the welcome + hero + tile content. Mirrors the prior loading testid
  // so existing test infra keeps working.
  if (brandConfigured === null) {
    return (
      <div data-testid="dashboard-loading" className="dashboard-loading">
        {/* Reserve hero-sized vertical space to minimize layout shift. */}
        <div style={{ minHeight: '480px' }} aria-hidden />
      </div>
    );
  }

  return (
    <>
      {/* WELCOME */}
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
              {welcome.firstName}.
            </span>
          </h1>
          <p className="welcome-sub" data-testid="sep-welcome-sub">
            {welcome.subtitle}
          </p>
        </div>
        {/* welcome-stats intentionally hidden in MVP — wiring real counters
            is a phase-2 ticket; "0 / 0 / 0" reads worse than nothing. */}
      </section>

      {/* HERO "UP NEXT" — brand-not-configured wins over any matched
          workflow (cadence states like visibility_gap_state are always
          on, so without this gate a fresh account would jump straight
          to a Social-template recommendation before brand setup). */}
      {brandConfigured && heroPair ? (
        <HeroNextAction
          workflow={heroPair.workflow}
          primarySkill={heroPair.primarySkill}
          resumeAvailable={resumableSkillIds.has(heroPair.primarySkill.id)}
        />
      ) : (
        <HeroEmptyState />
      )}

      {/* STAGE 01 — WIN */}
      <section className="stage" id="stage-win" data-testid="sep-stage-win">
        <StageHeader
          index={1}
          label="Win the listing"
          hint="Show up prepared. Close the appointment."
          stage="win"
        />
        <div className="grid grid-4" data-testid="sep-stage-win-grid">
          {winTiles.map(({ config, resolved }) => (
            <Tile
              key={config.skillId}
              resolved={resolved}
              stage="win"
              poster={posterForSkillId(config.skillId)}
              titleOverride={config.titleOverride}
              blurbOverride={config.blurbOverride}
            />
          ))}
        </div>
      </section>

      {/* STAGE 02 — LAUNCH */}
      <section
        className="stage"
        id="stage-launch"
        data-testid="sep-stage-launch"
      >
        <StageHeader
          index={2}
          label="Launch the marketing"
          hint="Branded assets, ready in a minute."
          stage="launch"
        />
        <div className="grid grid-2" data-testid="sep-stage-launch-grid">
          {launchTiles.map(({ skill, resolved }) => (
            <Tile
              key={skill.id}
              resolved={resolved}
              stage={'launch' satisfies TileStage}
              poster={posterForSkillId(skill.id)}
              size="md"
            />
          ))}
        </div>
      </section>

      {/* STAGE 03 — VISIBILITY (flagship) */}
      <section
        className="stage"
        id="stage-visibility"
        data-testid="sep-stage-visibility"
      >
        <StageHeader
          index={3}
          label="Stay visible"
          hint="Cadence content. One studio, ten formats."
          stage="visibility"
        />
        <SocialStudioTile
          skills={visibilitySkills}
          onClick={() => setStudioOpen(true)}
        />
      </section>

      {/* FOOTER */}
      <footer className="bottom">
        <span>SEP-S v1.47 · Lane A re-brand</span>
      </footer>

      {/* MODAL */}
      <SocialStudioModal
        open={studioOpen}
        onClose={() => setStudioOpen(false)}
        skills={visibilitySkills}
      />
    </>
  );
}
