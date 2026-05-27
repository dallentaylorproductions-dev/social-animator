'use client';

import Link from 'next/link';
import { useEffect } from 'react';
import type { CallableSkill } from '@/skills/types';
import { StageDot, FormatChips, formatsForOutputs } from './Tile';
import { skillRoute } from './skill-route';
import { SocialThumbnail } from './posters/SocialThumbnail';

/**
 * Social Studio flagship + modal (v1.47 Lane A polish — restore).
 *
 * Stage 3 collapses the 10 social-animator templates behind ONE
 * flagship tile. Clicking the tile opens a modal listing all 10 as
 * navigable cards. Restored from the f3529e6 pattern (the 397fc80
 * 10-tile grid put the clutter back); now uses the registry-binding
 * + shared TemplatePreview pieces 397fc80 introduced.
 *
 * Two upgrades on top of the f3529e6 reference:
 *
 *   1. Calm flagship poster — a SINGLE representative <SocialThumbnail>
 *      centered, not a 10-card marquee. Less at-rest motion, less code,
 *      cleaner read. The marquee CSS still lives in sep-studio.css
 *      (dormant) in case A7f.3 wants to revisit.
 *
 *   2. Modal cards use the real <SocialThumbnail> (canvas-rendered,
 *      IntersectionObserver-paused, brand-color-aware) instead of the
 *      hand-built static SVG mini-composites the original modal shipped.
 *      Card click navigates via Next.js Link to skillRoute(skill.id);
 *      the modal subtree unmounts on close, killing every preview's
 *      RAF loop cleanly (TemplatePreview's effect cleanup cancels the
 *      animation frame + disconnects its observer).
 */

const FEATURED_FLAGSHIP_SKILL_ID = 'social-animator-listing-showcase';

export function SocialStudioTile({
  skills,
  onClick,
}: {
  skills: CallableSkill[];
  onClick: () => void;
}) {
  const count = skills.length;
  return (
    <button
      type="button"
      className="tile-flagship"
      onClick={onClick}
      data-testid="sep-flagship-social"
    >
      <div className="flagship-poster">
        <div className="flagship-feature">
          <SocialThumbnail skillId={FEATURED_FLAGSHIP_SKILL_ID} />
        </div>
      </div>
      <div className="flagship-body">
        <div className="tile-meta">
          <StageDot stage="visibility" />
          <FormatChips formats={['MP4', `${count} TEMPLATES`]} />
        </div>
        <div className="flagship-headline">
          <h3 className="tile-title flagship-title">Social Studio</h3>
          <span className="tile-cta flagship-cta">Open studio →</span>
        </div>
        <p className="tile-blurb flagship-blurb">
          {count} animated templates — Q&amp;A, Listing Card, Carousel,
          Before/After, Stat, Market Update and more — picked in one studio.
        </p>
      </div>
    </button>
  );
}

export function SocialStudioModal({
  open,
  onClose,
  skills,
}: {
  open: boolean;
  onClose: () => void;
  skills: CallableSkill[];
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="modal-scrim"
      onClick={onClose}
      data-testid="sep-studio-modal"
    >
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="sep-studio-modal-title"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="modal-head">
          <div>
            <div className="modal-eyebrow">SOCIAL STUDIO</div>
            <h2 id="sep-studio-modal-title" className="modal-title">
              Pick a template
            </h2>
            <p className="modal-sub">
              {skills.length} animated formats. All export as MP4, 9×16 and
              1×1.
            </p>
          </div>
          <button
            type="button"
            className="modal-x"
            onClick={onClose}
            aria-label="Close"
            data-testid="sep-studio-modal-close"
          >
            ✕
          </button>
        </header>
        <div className="modal-grid">
          {skills.map((s) => {
            const formats = formatsForOutputs(s.outputs);
            return (
              <Link
                key={s.id}
                href={skillRoute(s.id)}
                className="tmpl-card"
                data-testid={`sep-studio-modal-tile-${s.id}`}
              >
                <div className="tmpl-preview">
                  <SocialThumbnail skillId={s.id} />
                </div>
                <div className="tmpl-foot">
                  <div className="tmpl-name">{s.name}</div>
                  <div className="tmpl-tag">{formats[0] ?? 'MP4'}</div>
                </div>
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}
