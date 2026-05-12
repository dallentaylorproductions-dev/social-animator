"use client";

import { useLayoutEffect, useRef } from "react";
import { extractPhoneDigits, formatPhone } from "@/lib/brand";
import { caretAfterNthDigit } from "./formatHelpers";

/**
 * Live-formatted US phone input ("(253) 555-0188"). Stores raw 10
 * digits in the parent's form state; the display string is derived
 * via the shared `formatPhone` helper.
 *
 * Live (not on-blur) is intentional — phones have a fixed digit
 * count, the formatting is industry-standard, and live caret
 * preservation is easier here than for currency because the format
 * shape is predictable. Reuses the same caret-after-nth-digit
 * strategy as CurrencyInput.
 *
 * Paste handling: any of "+1 253 555 0188", "(253) 555-0188",
 * "253-555-0188", or "12535550188" pastes into the same raw
 * "2535550188" — `extractPhoneDigits` strips non-digits and slices
 * to the last 10 (so a leading "+1" is dropped automatically).
 */
export interface PhoneInputProps {
  /** Raw digits, up to 10 (e.g., "2535550188"). Empty string = empty. */
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

export function PhoneInput({
  value,
  onChange,
  placeholder,
  className,
  required,
  disabled,
  "aria-label": ariaLabel,
}: PhoneInputProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const pendingCaretRef = useRef<number | null>(null);

  const display = formatPhone(value);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const editedDisplay = e.target.value;
    const caretInEdited = e.target.selectionStart ?? editedDisplay.length;

    // Count raw digits to the left of the caret in the post-edit string.
    const rawDigitsLeft = editedDisplay
      .slice(0, caretInEdited)
      .replace(/\D/g, "").length;

    // Normalize: keep last 10 digits (handles +1 paste, trailing
    // numbers, etc.).
    const newRaw = extractPhoneDigits(editedDisplay);

    const reformatted = formatPhone(newRaw);
    pendingCaretRef.current = caretAfterNthDigit(reformatted, rawDigitsLeft);

    onChange(newRaw);
  };

  useLayoutEffect(() => {
    if (pendingCaretRef.current !== null && inputRef.current) {
      const c = pendingCaretRef.current;
      inputRef.current.setSelectionRange(c, c);
      pendingCaretRef.current = null;
    }
  });

  return (
    <input
      ref={inputRef}
      type="tel"
      inputMode="tel"
      autoComplete="tel"
      value={display}
      onChange={handleChange}
      placeholder={placeholder}
      required={required}
      disabled={disabled}
      aria-label={ariaLabel}
      className={className ?? DEFAULT_CLASS}
    />
  );
}
