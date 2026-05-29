'use client';

import Link from 'next/link';
import type { ReactElement } from 'react';
import type { ResolvedSkill } from '@/lib/entitlements/types';
import { skillRoute } from './skill-route';

/**
 * SEP-S dashboard tile (v1.47 Lane A re-brand).
 *
 * Renders one skill in the warm-dark bento layout. Three concerns:
 *   1. Visual identity — poster preview + stage-tinted dot + format chips.
 *   2. Routing — Link to skillRoute(resolved.skill.id) so navigation
 *      matches the existing tool route conventions (no duplication).
 *   3. Entitlement gate — when resolved.coreAccess.state !== 'available',
 *      dim the tile + surface a small lock indicator. The link STILL
 *      navigates so the wizard's preview-but-lock flow can render its
 *      calm upgrade copy (§8.6); polished locked UX = A7f.3.
 */

export type TileStage = 'win' | 'launch' | 'visibility';
export type TileSize = 'sm' | 'md';

const STAGE_COLOR_VAR: Record<TileStage, string> = {
  win: 'var(--stage-win)',
  launch: 'var(--stage-launch)',
  visibility: 'var(--stage-visibility)',
};

export function StageDot({ stage }: { stage: TileStage }) {
  return (
    <span
      className="stage-dot"
      style={{ background: STAGE_COLOR_VAR[stage], color: STAGE_COLOR_VAR[stage] }}
      aria-hidden
    />
  );
}

export function FormatChip({ label }: { label: string }) {
  return <span className="fmt-chip">{label}</span>;
}

export function FormatChips({ formats }: { formats: readonly string[] }) {
  if (formats.length === 0) return null;
  return (
    <div className="fmt-row">
      {formats.map((f) => (
        <FormatChip key={f} label={f} />
      ))}
    </div>
  );
}

/**
 * Derive the format-chip labels from a skill's declared outputs
 * (mirror of dashboard/components/SkillTile.tsx's outputSummary, but
 * returning an array of chips instead of a single joined string).
 * Aggregates duplicates: two mp4 outputs render as "2× MP4".
 */
export function formatsForOutputs(
  outputs: ReadonlyArray<{ format: string }>,
): string[] {
  const counts: Record<string, number> = {};
  for (const out of outputs) {
    counts[out.format] = (counts[out.format] ?? 0) + 1;
  }
  return Object.entries(counts).map(([fmt, n]) =>
    n > 1 ? `${n}× ${fmt.toUpperCase()}` : fmt.toUpperCase(),
  );
}

interface TileProps {
  resolved: ResolvedSkill;
  stage: TileStage;
  poster: ReactElement;
  size?: TileSize;
  /**
   * Cohort-phase gate (NOT an entitlement gate). When true the tile is
   * dimmed, badged "Coming soon", and rendered as a plain non-interactive
   * <div> (no href, no tab stop) so the cohort sees the roadmap without a
   * dead-end click. Driven by COHORT_LIVE_SKILLS at the dashboard. The
   * tool's route still exists — this is presentational only.
   */
  comingSoon?: boolean;
}

/**
 * Tile renders one skill registry record. Title, blurb, format chips,
 * and route are ALL derived from `resolved.skill` — no per-tile copy
 * overrides. The post-rebrand fix-it removed the override props the
 * initial port carried so the design's literal copy could never drift
 * from the skill's actual `name` / `purpose`.
 */
export function Tile({ resolved, stage, poster, size = 'sm', comingSoon = false }: TileProps) {
  const { skill, coreAccess } = resolved;
  const locked = coreAccess.state !== 'available';
  const title = skill.name;
  const blurb = skill.purpose;
  const formats = formatsForOutputs(skill.outputs);

  // Body is identical in both modes — only the wrapper element and the
  // corner indicator / CTA differ. Shared so the visual card stays
  // pixel-identical whether it's clickable or "Coming soon".
  const body = (
    <>
      <div className="tile-poster">{poster}</div>
      <div className="tile-body">
        <div className="tile-meta">
          <StageDot stage={stage} />
          <FormatChips formats={formats} />
        </div>
        <h3 className="tile-title">{title}</h3>
        <p className="tile-blurb">{blurb}</p>
      </div>
    </>
  );

  // Cohort "Coming soon" tile: a plain <div> (not a Link/button) so it
  // never navigates and is skipped by keyboard focus, dimmed + badged.
  if (comingSoon) {
    return (
      <div
        className={`tile tile-${size} tile-coming-soon`}
        data-testid={`sep-tile-${skill.id}`}
        data-coming-soon="true"
        data-stage={stage}
        aria-disabled="true"
        aria-label={`${title} — coming soon`}
      >
        <span className="tile-soon" data-testid={`sep-tile-soon-${skill.id}`}>
          Coming soon
        </span>
        {body}
      </div>
    );
  }

  return (
    <Link
      href={skillRoute(skill.id)}
      className={`tile tile-${size}`}
      data-testid={`sep-tile-${skill.id}`}
      data-gate={locked ? 'locked' : 'available'}
      data-stage={stage}
      aria-label={locked ? `${title} — ${coreAccess.label}` : title}
    >
      {locked && (
        <span
          className="tile-lock"
          aria-hidden
          title={coreAccess.label}
          data-testid={`sep-tile-lock-${skill.id}`}
        >
          ▣
        </span>
      )}
      {body}
      <span className="tile-cta" aria-hidden>
        Open →
      </span>
    </Link>
  );
}
