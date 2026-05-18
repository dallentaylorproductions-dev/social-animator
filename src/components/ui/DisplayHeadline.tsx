import type { HTMLAttributes, ReactNode } from 'react';

/**
 * Confident headline with single-word emphasis (Audit 1A §3.3, §5).
 *
 * The reference-dashboard pattern: large title with exactly one phrase in
 * the accent color. Callers compose either via the `emphasis` prop (text +
 * highlighted phrase) or by passing pre-composed children (full control,
 * e.g., multi-line with line breaks).
 *
 * Size variants follow the Audit 1A §3.1 type scale.
 *
 *   size='display'  text-display (44px web / 32pt PDF)
 *   size='3xl'      text-3xl (30px / 22pt) — default for page H1s
 *   size='2xl'      text-2xl (24px / 18pt) — section heading
 */
export type DisplayHeadlineSize = 'display' | '3xl' | '2xl';
export type DisplayHeadlineAccent = 'mint' | 'gold' | 'brick' | 'rose';

const sizeClasses: Record<DisplayHeadlineSize, string> = {
  display: 'text-[44px] leading-[1.1] tracking-[-0.015em]',
  '3xl': 'text-3xl leading-tight tracking-[-0.01em]',
  '2xl': 'text-2xl leading-snug tracking-[-0.005em]',
};

const accentTextClasses: Record<DisplayHeadlineAccent, string> = {
  mint: 'text-mint',
  gold: 'text-gold',
  brick: 'text-brick',
  rose: 'text-rose',
};

export interface DisplayHeadlineProps
  extends HTMLAttributes<HTMLHeadingElement> {
  size?: DisplayHeadlineSize;
  accent?: DisplayHeadlineAccent;
  /** Plain headline text. The `emphasis` phrase will be split out and colored. */
  text?: string;
  /** Phrase within `text` to color with the accent. Case-sensitive substring match. */
  emphasis?: string;
  /** Override children to render any custom composition. Takes precedence over text/emphasis. */
  children?: ReactNode;
  /** Render as a different heading level (default h1). */
  as?: 'h1' | 'h2' | 'h3';
}

export function DisplayHeadline({
  size = '3xl',
  accent = 'mint',
  text,
  emphasis,
  children,
  as = 'h1',
  className = '',
  ...rest
}: DisplayHeadlineProps) {
  const Tag = as;
  const compositeClasses = `font-bold text-text-primary ${sizeClasses[size]} ${className}`;

  let inner: ReactNode;
  if (children) {
    inner = children;
  } else if (text && emphasis && text.includes(emphasis)) {
    const [before, ...rest] = text.split(emphasis);
    const after = rest.join(emphasis);
    inner = (
      <>
        {before}
        <span className={accentTextClasses[accent]}>{emphasis}</span>
        {after}
      </>
    );
  } else {
    inner = text;
  }

  return (
    <Tag {...rest} className={compositeClasses}>
      {inner}
    </Tag>
  );
}
