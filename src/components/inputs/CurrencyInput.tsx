"use client";

import { formatCurrency } from "./formatHelpers";

/**
 * Currency input ("$685,000") with on-blur formatting.
 *
 * Storage contract — STATE = DISPLAY post-blur: the component emits
 * the formatted display string (e.g. "$685,000") to the parent on
 * blur, so downstream renderers (PDF documents, listing-showcase
 * canvas regex, etc.) continue to receive the canonical display
 * exactly as before. Mid-edit, the parent state holds whatever the
 * user has typed verbatim — formatting fires on blur, not on every
 * keystroke.
 *
 * Why on-blur instead of live formatting (changed Commit 8):
 *
 *   1. Voice / dictation compatibility — iOS and Android speech-to-text
 *      writes typed characters into the field with a delay-and-replace
 *      pattern. Live formatting fights the dictation engine
 *      mid-stream, producing malformed input. Format-on-blur lets the
 *      voice engine commit, then the user reviews + tabs out for the
 *      canonical formatted value.
 *   2. Paste of word-form text ("six hundred eighty five thousand
 *      dollars") shows the typed words until blur, letting the user
 *      see what came in before stripToDigits collapses it to "".
 *   3. Simpler code — drops the cursor-preservation gymnastics that
 *      live formatting required. The browser handles caret naturally
 *      because the display string doesn't shift mid-keystroke.
 *
 * Publish / Export buttons trigger blur on the focused input
 * automatically when the user clicks them (focus moves to the
 * button), so the formatted commit fires before the action runs.
 */
export interface CurrencyInputProps {
  /** Formatted display value post-blur (e.g. "$685,000"). Accepts any
   * input shape on initial mount — formatCurrency is idempotent. */
  value: string;
  /** Emits raw typed text on every keystroke, formatted text on blur. */
  onChange: (next: string) => void;
  placeholder?: string;
  className?: string;
  required?: boolean;
  disabled?: boolean;
  "aria-label"?: string;
}

const DEFAULT_CLASS =
  "w-full bg-neutral-900 border border-neutral-800 rounded-md px-3 py-2 text-base lg:text-sm focus:outline-none focus:border-mint";

export function CurrencyInput({
  value,
  onChange,
  placeholder,
  className,
  required,
  disabled,
  "aria-label": ariaLabel,
}: CurrencyInputProps) {
  return (
    <input
      type="text"
      inputMode="numeric"
      autoComplete="off"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onBlur={(e) => {
        const formatted = formatCurrency(e.target.value);
        if (formatted !== e.target.value) onChange(formatted);
      }}
      placeholder={placeholder}
      required={required}
      disabled={disabled}
      aria-label={ariaLabel}
      className={className ?? DEFAULT_CLASS}
    />
  );
}
