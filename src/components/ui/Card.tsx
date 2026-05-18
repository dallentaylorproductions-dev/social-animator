import type { HTMLAttributes, ReactNode } from 'react';

/**
 * Card surface primitive (Audit 1A §5).
 *
 * Elevation comes from surface tint + hairline border, never drop shadows
 * (dark mode reads better with surface lifts than blur halos).
 *
 *   default     elev-1   bg-surface  + hairline border
 *   emphasis    elev-3   bg-surface-elevated + mint/30 border (workflow-card / focused)
 *   interactive elev-2   default → elev-2 on hover (tiles, clickable cards)
 */
export type CardVariant = 'default' | 'emphasis' | 'interactive';

const variantClasses: Record<CardVariant, string> = {
  default: 'bg-surface border-border-hairline',
  emphasis: 'bg-surface-elevated border-border-emphasis',
  interactive:
    'bg-surface border-border-hairline transition hover:bg-surface-elevated hover:border-border-emphasis',
};

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  variant?: CardVariant;
  children?: ReactNode;
}

export function Card({
  variant = 'default',
  className = '',
  children,
  ...rest
}: CardProps) {
  return (
    <div
      {...rest}
      className={`rounded-2xl border p-6 ${variantClasses[variant]} ${className}`}
    >
      {children}
    </div>
  );
}
