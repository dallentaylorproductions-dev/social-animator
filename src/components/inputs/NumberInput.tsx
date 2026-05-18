"use client";

import { formatNumberWithCommas, stripToDigits } from "./formatHelpers";

/**
 * Integer input ("2,840") with on-blur formatting.
 *
 * Storage contract — STATE = DISPLAY post-blur: the component emits
 * the comma-grouped form on blur. Parent state holds the formatted
 * value at rest; mid-edit it holds whatever the user has typed.
 *
 * Why on-blur instead of live formatting (changed Commit 8): same
 * rationale as CurrencyInput — voice / dictation compatibility, paste
 * of word-form text, and simpler code without the focus-state
 * commas-toggle that the prior implementation needed.
 *
 * Publish / Export buttons trigger blur on the focused input
 * automatically when the user clicks them, so the formatted commit
 * fires before the action runs.
 */
export interface NumberInputProps {
  /** Comma-grouped display value post-blur (e.g. "2,840"). */
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

export function NumberInput({
  value,
  onChange,
  placeholder,
  className,
  required,
  disabled,
  "aria-label": ariaLabel,
}: NumberInputProps) {
  return (
    <input
      type="text"
      inputMode="numeric"
      autoComplete="off"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onBlur={(e) => {
        const formatted = formatNumberWithCommas(stripToDigits(e.target.value));
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
