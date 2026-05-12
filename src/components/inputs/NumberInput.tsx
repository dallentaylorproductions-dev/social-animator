"use client";

import { useState } from "react";
import { formatNumberWithCommas, stripToDigits } from "./formatHelpers";

/**
 * On-blur formatted integer input ("2,840"). Stores raw digits in
 * the parent's form state. While focused the user sees the raw
 * digits (no commas) for clean editing; on blur the display switches
 * to the comma-grouped form. On focus it reverts.
 *
 * The blur-only formatting sidesteps the cursor-management gymnastics
 * needed for live currency inputs — fine for sqft and similar fields
 * where users rarely edit mid-value after committing a number.
 *
 * Paste handling: pasting "2,840" or "2840" both store raw "2840".
 * Non-digit characters are stripped on every keystroke.
 */
export interface NumberInputProps {
  /** Raw integer digits, e.g. "2840". Empty string means empty. */
  value: string;
  /** Called with the raw digit string after any edit. */
  onChange: (raw: string) => void;
  placeholder?: string;
  className?: string;
  required?: boolean;
  disabled?: boolean;
  "aria-label"?: string;
}

const DEFAULT_CLASS =
  "w-full bg-neutral-900 border border-neutral-800 rounded-md px-3 py-2 text-base lg:text-sm focus:outline-none focus:border-[#4ef2d9]";

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

  const display = isFocused ? value : formatNumberWithCommas(value);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onChange(stripToDigits(e.target.value));
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
