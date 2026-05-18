/**
 * SEP design language primitives (Audit 1A §5, OH Prep Commit 1).
 *
 * Barrel export for the 7 primitives + their prop types. Consumed by
 * dashboard / tool / visitor surfaces from Commit 3 onwards. Marketing-
 * page mockup files alongside in this directory are kept untouched and
 * are not re-exported here (they're internal to the marketing route).
 */

export { Card } from './Card';
export type { CardProps, CardVariant } from './Card';

export { Pill } from './Pill';
export type { PillProps, PillAccent } from './Pill';

export { Fab } from './Fab';
export type { FabProps, FabVariant } from './Fab';

export { Progress } from './Progress';
export type { ProgressProps, ProgressAccent } from './Progress';

export { StatLabel } from './StatLabel';
export type { StatLabelProps, StatLabelAccent } from './StatLabel';

export { DisplayHeadline } from './DisplayHeadline';
export type {
  DisplayHeadlineProps,
  DisplayHeadlineSize,
  DisplayHeadlineAccent,
} from './DisplayHeadline';

export { SectionDivider } from './SectionDivider';
export type { SectionDividerProps } from './SectionDivider';
