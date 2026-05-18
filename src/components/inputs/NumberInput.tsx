"use client";

import { useState } from "react";
import {
  formatNumberWithCommas,
  looksLikeWordNumber,
  stripToDigits,
  wordsToNumber,
} from "./formatHelpers";

/**
 * Live-formatted integer input ("2,840").
 *
 * Storage contract — STATE = DISPLAY: the component emits the
 * comma-grouped form on every keystroke. Parent state is canonical
 * at all times.
 *
 * UX: while focused, display strips commas so the user can edit a
 * clean digit string. On blur, display switches back to the comma-
 * grouped form. Parent state also receives a comma-grouped value
 * on every keystroke so live previews stay in sync.
 *
 * Voice-input compat (Commit 9): same wordsToNumber pre-strip as
 * CurrencyInput. Word-form input like "two thousand eight hundred
 * forty" converts to digits before formatting.
 *
 * Paste handling: "2,840", "2840", or "2.840" all normalize via
 * stripToDigits + format.
 */
export interface NumberInputProps {
  value: string;
  onChange: (formatted: string) => void;
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
  const [isFocused, setIsFocused] = useState(false);

  const display = isFocused
    ? stripToDigits(value)
    : formatNumberWithCommas(value);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    if (looksLikeWordNumber(raw)) {
      const n = wordsToNumber(raw);
      if (n !== null && n > 0) {
        onChange(formatNumberWithCommas(String(n)));
        return;
      }
      onChange(raw);
      return;
    }
    onChange(formatNumberWithCommas(raw));
  };

  return (
    <input
      type="text"
      inputMode="numeric"
      autoComplete="off"
      value={display}
      onChange={handleChange}
      onFocus={() => setIsFocused(true)}
      onBlur={() => setIsFocused(false)}
      placeholder={placeholder}
      required={required}
      disabled={disabled}
      aria-label={ariaLabel}
      className={className ?? DEFAULT_CLASS}
    />
  );
}
