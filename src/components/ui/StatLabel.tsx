import type { HTMLAttributes, ReactNode } from 'react';

/**
 * All-caps tracked label primitive (Audit 1A §3.2, §5).
 *
 * Editorial eyebrow used at the top of cards, above section headings,
 * inline before stats. Accent color maps to the palette's four secondaries
 * plus a muted variant for neutral framing.
 */
export type StatLabelAccent = 'mint' | 'gold' | 'brick' | 'rose' | 'muted';

const accentClasses: Record<StatLabelAccent, string> = {
  mint: 'text-mint',
  gold: 'text-gold',
  brick: 'text-brick',
  rose: 'text-rose',
  muted: 'text-text-muted',
};

export interface StatLabelProps extends HTMLAttributes<HTMLParagraphElement> {
  accent?: StatLabelAccent;
  children?: ReactNode;
}

export function StatLabel({
  accent = 'mint',
  className = '',
  children,
  ...rest
}: StatLabelProps) {
  return (
    <p
      {...rest}
      className={`text-xs uppercase tracking-[0.18em] font-medium ${accentClasses[accent]} ${className}`}
    >
      {children}
    </p>
  );
}
