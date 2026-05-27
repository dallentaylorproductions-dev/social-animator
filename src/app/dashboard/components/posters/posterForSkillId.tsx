import type { ReactElement } from 'react';
import { DocPoster } from './DocPoster';
import { FlyerPoster } from './FlyerPoster';
import { IntelPoster } from './IntelPoster';
import { OpenHousePoster } from './OpenHousePoster';
import { PrepPoster } from './PrepPoster';
import { PresentationPoster } from './PresentationPoster';

/**
 * Map a skill ID to the poster preview that represents its output on the
 * dashboard tile (and on the Hero "Up next" card's right-side preview).
 *
 * Per-skill choice rationale:
 *   - seller-presentation: PresentationPoster — slide-stack stands in for
 *     the full seller-facing deck.
 *   - listing-presentation: DocPoster ("Listing Presentation One-Pager"
 *     legacy skill — the original prep doc the agent printed).
 *   - seller-intelligence-report: IntelPoster — bar chart + comp rows.
 *   - open-house-prep: PrepPoster — agent's day-of prep checklist.
 *   - listing-flyer: FlyerPoster — printable single-listing flyer.
 *   - open-house-promo: OpenHousePoster — event-day flyer + QR sign-in.
 *
 * Anything not in the map (e.g. a future skill that ships before its
 * poster does) renders the DocPoster fallback so the tile still has a
 * visual identity instead of an empty box.
 */
export function posterForSkillId(skillId: string): ReactElement {
  switch (skillId) {
    case 'seller-presentation':
      return <PresentationPoster />;
    case 'listing-presentation':
      return <DocPoster title="Listing Presentation" accent="cool" />;
    case 'seller-intelligence-report':
      return <IntelPoster />;
    case 'open-house-prep':
      return <PrepPoster />;
    case 'listing-flyer':
      return <FlyerPoster />;
    case 'open-house-promo':
      return <OpenHousePoster />;
    default:
      return <DocPoster title="Tool" accent="mint" />;
  }
}
