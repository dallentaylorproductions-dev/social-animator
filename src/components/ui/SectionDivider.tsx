import type { HTMLAttributes, ReactNode } from 'react';

/**
 * Editorial section divider (Audit 1A §5, §7.5).
 *
 * A hairline rule for separating content sections. The `label` variant
 * inlines a centered StatLabel-style eyebrow over the rule — used between
 * major zones on the visitor handout ("About the home", "About the agent").
 */
export interface SectionDividerProps extends HTMLAttributes<HTMLDivElement> {
  label?: ReactNode;
}

export function SectionDivider({
  label,
  className = '',
  ...rest
}: SectionDividerProps) {
  if (!label) {
    return (
      <hr
        className={`border-0 border-t border-border-hairline my-12 ${className}`}
        aria-hidden="true"
      />
    );
  }
  return (
    <div
      {...rest}
      className={`relative my-12 flex items-center justify-center ${className}`}
    >
      <span className="absolute inset-x-0 top-1/2 -translate-y-1/2 border-t border-border-hairline" />
      <span className="relative bg-canvas px-4 text-xs uppercase tracking-[0.18em] text-text-muted font-medium">
        {label}
      </span>
    </div>
  );
}
