'use client';

import Link from 'next/link';
import type { CallableSkill } from '@/skills/types';
import { StageDot, FormatChips } from './Tile';

/**
 * Social Studio flagship — Stage 3 single tile (v1.47 Lane A).
 *
 * Collapses the 10 social-animator templates behind ONE flagship tile.
 * Clicking the tile navigates DIRECTLY to /social-animator (the
 * pre-existing picker page that already lists every template with a
 * live <TemplatePreview> animation). No dashboard-side modal — the
 * /social-animator page was built for exactly this and renders the
 * same canvas-looping previews the modal would have, so the modal was
 * a redundant click.
 *
 * Visual: the f3529e6 marquee at-rest. Static SVG mini-composites
 * slide sideways inside the flagship poster, paused on hover. The
 * marquee is decorative — `templateChromeForSkillId` assigns each
 * registry skill a (kind, tint) pair so the mini-composite hints at
 * what the template renders. New social-animator-* skills default to
 * `qa / cool` chrome until the map is extended.
 *
 * Functional source of truth: ALL_SKILLS via getSkillsByCategory(
 * 'Social content'). The DashboardClient passes the resolved list in;
 * this component never imports the registry directly.
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
          <div className="photo-block" style={{ flex: 1 }}>
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

/**
 * Social Studio flagship tile — renders as an <a> so right-click /
 * cmd-click open in a new tab work, and so the link semantics are
 * announced correctly to AT. The tile click navigates to the
 * /social-animator index (the existing template picker page).
 */
export function SocialStudioTile({ skills }: { skills: CallableSkill[] }) {
  // Duplicate the row so the marquee keyframe (translateX(0) → -50%)
  // loops seamlessly. The duplicated subset stays inside the same
  // .marquee-track flex so the gap + width: max-content math works out.
  const row = [...skills, ...skills];
  return (
    <Link
      href="/social-animator"
      className="tile-flagship"
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
          {skills.length}{' '}animated social templates: Q&amp;A, Listing Card,
          Carousel, Before/After, Stat, Market Update, and more, all in one
          studio.
        </p>
      </div>
    </Link>
  );
}
