import type { ButtonHTMLAttributes, ReactNode } from 'react';

/**
 * Pill primitive (Audit 1A §5).
 *
 * Pill-shaped tab / step / status indicator. Used for wizard step
 * indicators, status chips, filter toggles. Renders as a <button>
 * (interactive) or a <span> when used decoratively.
 */
export type PillAccent = 'mint' | 'gold' | 'brick' | 'rose' | 'neutral';

const accentActiveClasses: Record<PillAccent, string> = {
  mint: 'bg-mint text-black border-mint',
  gold: 'bg-gold text-black border-gold',
  brick: 'bg-brick text-white border-brick',
  rose: 'bg-rose text-black border-rose',
  neutral: 'bg-surface-elevated text-text-primary border-border-emphasis',
};

const baseInactiveClasses =
  'bg-transparent text-text-secondary border-border-hairline hover:text-text-primary hover:border-border-emphasis';

export interface PillProps
  extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  active?: boolean;
  accent?: PillAccent;
  /** Render as a non-interactive span instead of a button. */
  asSpan?: boolean;
  children?: ReactNode;
}

export function Pill({
  active = false,
  accent = 'mint',
  asSpan = false,
  className = '',
  children,
  ...rest
}: PillProps) {
  const stateClasses = active ? accentActiveClasses[accent] : baseInactiveClasses;
  const compositeClasses = `inline-flex items-center rounded-full border px-4 py-1.5 text-xs uppercase tracking-wider transition ${stateClasses} ${className}`;
  if (asSpan) {
    return <span className={compositeClasses}>{children}</span>;
  }
  return (
    <button type="button" {...rest} className={compositeClasses}>
      {children}
    </button>
  );
}
