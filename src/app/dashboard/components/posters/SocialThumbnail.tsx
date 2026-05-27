'use client';

import { TemplatePreview } from '@/components/TemplatePreview';

/**
 * Dashboard-side wrapper around the existing TemplatePreview the
 * /social-animator picker page already uses. Same canvas-rendered
 * looping animation, same brand-color resolution, same auto-pause
 * (IntersectionObserver + visibilitychange). Mounting it inside the
 * Stage 3 `.tile-poster` means the dashboard shows the SAME live
 * thumbnail buyers / agents see on the picker — no static SVG
 * approximation, no second source of truth.
 *
 * Skill id → template id mapping: the social skills are id'd as
 * `social-animator-<template-id>` so stripping the prefix yields the
 * template id TemplatePreview expects. Skills without the prefix fall
 * through to the raw value (defensive — should never fire today).
 *
 * startOffsetMs is deterministic from the skill id so a grid of 10
 * thumbnails doesn't visually phase-lock (TemplatePreview hands its
 * own clock the offset; the picker page seeds it as `index * 500`,
 * which is identical in shape to this hash-based offset).
 */
const SOCIAL_PREFIX = 'social-animator-';

function hashOffsetMs(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  // Spread 0–4750ms in 250ms buckets — matches the picker's index*500
  // cadence without colliding when two skills hash adjacent.
  return Math.abs(h) % 5000;
}

export function SocialThumbnail({ skillId }: { skillId: string }) {
  const templateId = skillId.startsWith(SOCIAL_PREFIX)
    ? skillId.slice(SOCIAL_PREFIX.length)
    : skillId;
  return (
    <TemplatePreview
      templateId={templateId}
      startOffsetMs={hashOffsetMs(skillId)}
    />
  );
}
