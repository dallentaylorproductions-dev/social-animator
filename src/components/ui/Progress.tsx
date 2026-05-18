import type { HTMLAttributes } from 'react';

/**
 * Slim rounded progress bar (Audit 1A §5).
 *
 * Accent variants map to the four palette accents. `value` is 0-100.
 */
export type ProgressAccent = 'mint' | 'gold' | 'brick' | 'rose';

const fillClasses: Record<ProgressAccent, string> = {
  mint: 'bg-mint',
  gold: 'bg-gold',
  brick: 'bg-brick',
  rose: 'bg-rose',
};

export interface ProgressProps extends HTMLAttributes<HTMLDivElement> {
  /** 0-100; clamped on render. */
  value: number;
  accent?: ProgressAccent;
  label?: string;
}

export function Progress({
  value,
  accent = 'mint',
  label,
  className = '',
  ...rest
}: ProgressProps) {
  const pct = Math.max(0, Math.min(100, value));
  return (
    <div
      {...rest}
      className={`relative h-1.5 w-full rounded-full overflow-hidden bg-surface-elevated ${className}`}
      role="progressbar"
      aria-valuenow={pct}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label}
    >
      <div
        className={`h-full rounded-full transition-[width] duration-300 ${fillClasses[accent]}`}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}
