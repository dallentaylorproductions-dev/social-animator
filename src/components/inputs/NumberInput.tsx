"use client";

import { useState } from "react";
import { formatNumberWithCommas, stripToDigits } from "./formatHelpers";

/**
 * On-blur formatted integer input ("2,840").
 *
 * Storage contract — STATE = DISPLAY (formatted): the component emits
 * the comma-grouped form, so parent state holds "2,840" directly and
 * downstream renderers receive it unchanged. See CurrencyInput's
 * comment block for why state=display beats state=raw for this phase
 * (zero downstream changes; idempotent on already-formatted input).
 *
 * UX: while focused, display strips the commas so the user can edit
 * a clean digit string. On blur the display switches back to the
 * comma-grouped form AND the parent state updates to that
 * comma-grouped form. On every keystroke the parent state also
 * receives a comma-grouped value so live previews stay in sync.
 *
 * Paste handling: "2,840", "2840", or "2.840" all normalize via
 * stripToDigits + format.
 */
export interface NumberInputProps {
  /** Formatted display string, e.g. "2,840". Accepts any input shape;
   * formatNumberWithCommas is idempotent on already-formatted values. */
  value: string;
  /** Called with the new formatted display string after every edit. */
  onChange: (formatted: string) => void;
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

  // While focused, show the raw digit string for clean editing.
  // When blurred (or in initial render), show the formatted form.
  const display = isFocused ? stripToDigits(value) : formatNumberWithCommas(value);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    // Emit the comma-grouped form so parent state stays canonical
    // even mid-edit; the display while focused continues to show raw
    // digits (read directly from `value` via stripToDigits above).
    onChange(formatNumberWithCommas(e.target.value));
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
