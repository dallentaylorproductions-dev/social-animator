"use client";

import { useLayoutEffect, useRef } from "react";
import {
  caretAfterNthDigit,
  formatCurrency,
  stripToDigits,
} from "./formatHelpers";

/**
 * Live-formatted currency input ("$685,000"). Stores raw digits in
 * the parent's form state; the display string is derived on every
 * render via `formatCurrency`.
 *
 * Cursor preservation: when the user types or deletes mid-string,
 * commas shift around but the caret must stay logically adjacent
 * to the digit the user just touched. The implementation:
 *
 *   1. On change, count how many raw digits sit to the LEFT of the
 *      browser-reported caret in the freshly-edited (pre-reformat)
 *      display.
 *   2. Call onChange with the stripped raw digits — React re-renders
 *      with the canonically-formatted display.
 *   3. In a useLayoutEffect (runs before the browser paints), walk
 *      the new formatted display and land the caret AFTER the same
 *      raw-digit ordinal — so commas shifted in or out are
 *      transparent to the user.
 *
 * Paste handling: a paste of "$1,234,567" or "1234567" or "1.234.567"
 * all normalize to the same raw "1234567" because stripToDigits is
 * unconditional. The display always re-formats from raw.
 */
export interface CurrencyInputProps {
  /** Raw integer digits, e.g. "685000". Empty string means empty. */
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

export function CurrencyInput({
  value,
  onChange,
  placeholder,
  className,
  required,
  disabled,
  "aria-label": ariaLabel,
}: CurrencyInputProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const pendingCaretRef = useRef<number | null>(null);

  const display = formatCurrency(value);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const editedDisplay = e.target.value;
    const caretInEdited = e.target.selectionStart ?? editedDisplay.length;

    // Count raw digits to the left of the caret in the post-edit string.
    const rawDigitsLeft = stripToDigits(
      editedDisplay.slice(0, caretInEdited)
    ).length;

    const newRaw = stripToDigits(editedDisplay);

    // Plan the post-re-render caret. The reformatted display may add
    // or drop commas, so the position can differ from caretInEdited.
    const reformatted = formatCurrency(newRaw);
    pendingCaretRef.current = caretAfterNthDigit(reformatted, rawDigitsLeft);

    onChange(newRaw);
  };

  // Restore the planned caret position after React commits the new
  // display. useLayoutEffect runs synchronously before paint, so the
  // user never sees the caret in the wrong spot.
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
      type="text"
      inputMode="numeric"
      autoComplete="off"
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
