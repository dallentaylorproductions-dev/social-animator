import type { ButtonHTMLAttributes, ReactNode } from 'react';

/**
 * Floating action button primitive (Audit 1A §5).
 *
 * Fixed bottom-right; rounded-full; mint primary by default. Used as a
 * sticky version of an inline CTA on scrollable visitor surfaces, and
 * as a primary action affordance on tool pages.
 */
export type FabVariant = 'primary' | 'secondary';

const variantClasses: Record<FabVariant, string> = {
  primary: 'bg-mint text-black hover:bg-mint-hover',
  secondary:
    'bg-surface-elevated text-text-primary border border-border-emphasis hover:bg-surface',
};

export interface FabProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: FabVariant;
  /** Stable label for screen readers; rendered visually only if `children` is empty. */
  label: string;
  children?: ReactNode;
}

export function Fab({
  variant = 'primary',
  label,
  className = '',
  children,
  ...rest
}: FabProps) {
  return (
    <button
      type="button"
      aria-label={label}
      {...rest}
      className={`fixed bottom-6 right-6 h-14 w-14 rounded-full flex items-center justify-center font-semibold transition ${variantClasses[variant]} ${className}`}
    >
      {children ?? label}
    </button>
  );
}
