"use client";

import { useLayoutEffect, useRef } from "react";
import { extractPhoneDigits, formatPhone } from "@/lib/brand";
import { caretAfterNthDigit } from "./formatHelpers";

/**
 * Live-formatted US phone input ("(253) 555-0188").
 *
 * Storage contract — STATE = DISPLAY (formatted): the component
 * emits the formatted display string, so most callers will store
 * "(253) 555-0188" directly. `formatPhone` is idempotent on its
 * own output, so a caller that prefers raw digits in state (e.g.,
 * Settings/BrandProfileForm's existing pattern) can wrap onChange:
 *
 *     onChange={(v) => update("contactPhone", extractPhoneDigits(v))}
 *
 * Live (not on-blur) is intentional — phones have a fixed digit
 * count, the formatting is industry-standard, and live caret
 * preservation is easier here than for currency because the format
 * shape is predictable. Reuses the same caret-after-nth-digit
 * strategy as CurrencyInput.
 *
 * Paste handling: "+1 253 555 0188", "(253) 555-0188",
 * "253-555-0188", or "12535550188" all normalize to "(253) 555-0188"
 * via `extractPhoneDigits` (strips non-digits and slices to the last
 * 10, so a leading "+1" is dropped automatically).
 */
export interface PhoneInputProps {
  /** Formatted display string ("(253) 555-0188"), or any input shape
   * that `formatPhone` can normalize (raw "2535550188", partial,
   * already-formatted). */
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

    onChange(reformatted);
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
