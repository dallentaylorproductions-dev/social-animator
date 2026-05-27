'use client';

import Link from 'next/link';
import { useEffect } from 'react';
import type { CallableSkill } from '@/skills/types';
import { StageDot, FormatChips } from './Tile';
import { skillRoute } from './skill-route';

/**
 * Social Studio — flagship "Stay visible" tile + modal picker
 * (v1.47 Lane A re-brand).
 *
 * Functional contract:
 *   - The marquee inside the flagship tile previews ALL real Social
 *     Animator templates (derived from SOCIAL_ANIMATOR_SKILLS, NOT the
 *     design's hand-built SOCIAL_TEMPLATES list). The row is duplicated
 *     so the CSS keyframe loops seamlessly.
 *   - The modal renders the same set as a navigable grid; each card is
 *     a Next.js <Link> to skillRoute(skill.id) (e.g. /social-animator/qa-card).
 *
 * The design fixture had `kind` (which mini-composition to render) and
 * `tint` (which gradient) per template — both decorative. The
 * `templateChromeForSkillId` map below assigns chrome to each REAL skill
 * id so the kinds line up with the design's intent (Q&A card → 'qa'
 * mini-composition, etc.). New social-animator skills that ship later
 * get a default 'qa' chrome until the map is extended.
 */

type Tint = 'cool' | 'warm' | 'mint' | 'rose';
type MiniKind =
  | 'qa'
  | 'listing'
  | 'showcase'
  | 'carousel'
  | 'beforeafter'
  | 'testimonial'
  | 'numbered'
  | 'grid'
  | 'stat'
  | 'market';

interface TemplateChrome {
  kind: MiniKind;
  tint: Tint;
}

/**
 * Decorative-only mapping. Drives the marquee mini-preview only; never
 * affects what the template actually generates (the real Social Animator
 * template owns its output shape).
 */
function templateChromeForSkillId(id: string): TemplateChrome {
  switch (id) {
    case 'social-animator-qa-card':
      return { kind: 'qa', tint: 'cool' };
    case 'social-animator-listing-card':
      return { kind: 'listing', tint: 'mint' };
    case 'social-animator-listing-showcase':
      return { kind: 'showcase', tint: 'warm' };
    case 'social-animator-listing-carousel':
      return { kind: 'carousel', tint: 'cool' };
    case 'social-animator-before-after':
      return { kind: 'beforeafter', tint: 'rose' };
    case 'social-animator-testimonial-card':
      return { kind: 'testimonial', tint: 'mint' };
    case 'social-animator-numbered-process':
      return { kind: 'numbered', tint: 'warm' };
    case 'social-animator-grid-comparison':
      return { kind: 'grid', tint: 'cool' };
    case 'social-animator-stat-highlight':
      return { kind: 'stat', tint: 'mint' };
    case 'social-animator-market-update':
      return { kind: 'market', tint: 'rose' };
    default:
      return { kind: 'qa', tint: 'cool' };
  }
}

function MiniInner({ kind, tint }: { kind: MiniKind; tint: Tint }) {
  switch (kind) {
    case 'qa':
      return (
        <div className="mini-qa">
          <span className="mini-q">Q</span>
          <div className="mini-bars">
            <span />
            <span style={{ width: '60%' }} />
          </div>
        </div>
      );
    case 'listing':
      return (
        <div className="mini-listing">
          <div className={`photo-block`} style={{ flex: 1 }}>
            <div className="photo-stripes" />
          </div>
          <div className="mini-price">$1.24M</div>
        </div>
      );
    case 'showcase':
      return (
        <div className="mini-showcase">
          <div
            className="photo-block"
            style={{ position: 'absolute', inset: 0, height: '100%' }}
          >
            <div className="photo-stripes" />
          </div>
          <div className="mini-play" />
        </div>
      );
    case 'carousel':
      return (
        <div className="mini-carousel">
          <span />
          <span />
          <span />
        </div>
      );
    case 'beforeafter':
      return (
        <div className="mini-ba">
          <div className="mini-ba-l" />
          <div className="mini-ba-r" />
          <div className="mini-ba-line" />
        </div>
      );
    case 'testimonial':
      return (
        <div className="mini-test">
          <div className="mini-stars">★★★★★</div>
          <div className="mini-bars">
            <span />
            <span style={{ width: '80%' }} />
            <span style={{ width: '50%' }} />
          </div>
        </div>
      );
    case 'numbered':
      return (
        <div className="mini-num">
          {[1, 2, 3, 4, 5].map((n) => (
            <span key={n}>{n}</span>
          ))}
        </div>
      );
    case 'grid':
      return (
        <div className="mini-grid">
          <span />
          <span />
          <span />
          <span />
        </div>
      );
    case 'stat':
      return (
        <div className="mini-stat">
          <div className="mini-stat-num">42%</div>
          <div className="mini-bars">
            <span style={{ width: '70%' }} />
          </div>
        </div>
      );
    case 'market':
      return (
        <div className="mini-market">
          <div className="mini-spark">
            <svg viewBox="0 0 100 30" preserveAspectRatio="none">
              <polyline
                points="0,22 14,18 28,20 42,12 56,14 70,8 84,10 100,4"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              />
            </svg>
          </div>
          <div className="mini-bars">
            <span style={{ width: '40%' }} />
          </div>
        </div>
      );
    default:
      // Tint shouldn't strictly be ignored — kept on the wrapper class
      // above. The unused-var hint here is intentional; the switch is
      // total over MiniKind.
      void tint;
      return null;
  }
}

function SocialMini({ skill }: { skill: CallableSkill }) {
  const { kind, tint } = templateChromeForSkillId(skill.id);
  return (
    <div className={`social-mini tint-${tint}`}>
      <div className="social-mini-inner">
        <MiniInner kind={kind} tint={tint} />
      </div>
      <div className="social-mini-name">{skill.name}</div>
    </div>
  );
}

/* ─── flagship tile ─────────────────────────────────────────────────────── */

export function SocialStudioTile({
  skills,
  onClick,
}: {
  skills: CallableSkill[];
  onClick: () => void;
}) {
  // Duplicate the row so the marquee keyframe (translateX(0) → -50%)
  // loops seamlessly. The duplicated subset stays inside the same
  // .marquee-track flex so the gap + width: max-content math works out.
  const row = [...skills, ...skills];
  return (
    <button
      type="button"
      className="tile-flagship"
      onClick={onClick}
      data-testid="sep-flagship-social"
    >
      <div className="flagship-poster">
        <div className="marquee">
          <div className="marquee-track">
            {row.map((s, i) => (
              <SocialMini key={`${s.id}-${i}`} skill={s} />
            ))}
          </div>
        </div>
      </div>
      <div className="flagship-body">
        <div className="tile-meta">
          <StageDot stage="visibility" />
          <FormatChips formats={['MP4', `${skills.length} TEMPLATES`]} />
        </div>
        <div className="flagship-headline">
          <h3 className="tile-title flagship-title">Social Studio</h3>
          <span className="tile-cta flagship-cta">Open studio →</span>
        </div>
        <p className="tile-blurb flagship-blurb">
          {skills.length} animated social templates — Q&amp;A, Listing Card,
          Carousel, Before/After, Stat, Market Update and more — all in one
          studio.
        </p>
      </div>
    </button>
  );
}

/* ─── modal ─────────────────────────────────────────────────────────────── */

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
            const { tint } = templateChromeForSkillId(s.id);
            return (
              <Link
                key={s.id}
                href={skillRoute(s.id)}
                className={`tmpl-card tint-${tint}`}
                data-testid={`sep-studio-modal-tile-${s.id}`}
              >
                <div className="tmpl-preview">
                  <SocialMini skill={s} />
                </div>
                <div className="tmpl-foot">
                  <div className="tmpl-name">{s.name}</div>
                  <div className="tmpl-tag">MP4</div>
                </div>
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}
