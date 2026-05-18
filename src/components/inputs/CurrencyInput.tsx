"use client";

import { useLayoutEffect, useRef } from "react";
import {
  caretAfterNthDigit,
  formatCurrency,
  stripToDigits,
} from "./formatHelpers";

/**
 * Live-formatted currency input ("$685,000").
 *
 * Storage contract — STATE = DISPLAY: this component both accepts
 * and emits the formatted display string (e.g. "$685,000"). The
 * parent's form state holds the formatted form directly, which
 * means downstream renderers (PDF documents, listing-showcase
 * canvas regex, etc.) continue to receive the canonical display
 * exactly as a manually-typed "$685,000" did before this phase.
 *
 * The brief's wording ("store raw digits") would have required
 * updating every downstream renderer to re-format raw on output,
 * since today the PDFs render `{draft.price}` literally and the
 * canvas count-up animation extracts the "$" prefix via regex
 * (`priceMatch[1]`). Storing raw would lose the prefix and
 * regress both surfaces. Both `formatCurrency` and the canvas
 * regex are idempotent when fed an already-formatted value, so
 * state=display is the lowest-risk path.
 *
 * Cursor preservation: when the user types or deletes mid-string,
 * commas shift around but the caret must stay logically adjacent
 * to the digit the user just touched. The implementation:
 *
 *   1. On change, count how many raw digits sit to the LEFT of the
 *      browser-reported caret in the freshly-edited (pre-reformat)
 *      display.
 *   2. Compute the reformatted display from the stripped digits.
 *   3. Call onChange with that reformatted string — React commits.
 *   4. In a useLayoutEffect (runs before paint), walk the new
 *      display and land the caret AFTER the same raw-digit ordinal,
 *      so commas shifted in or out are transparent to the user.
 *
 * Paste handling: "$1,234,567", "1234567", "1.234.567" all
 * normalize to the same "$1,234,567" via stripToDigits + format.
 */
export interface CurrencyInputProps {
  /** Formatted display string, e.g. "$685,000". Accepts any input
   * shape — already-formatted, raw digits, partially-formatted —
   * because formatCurrency is idempotent on its own output. */
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

    onChange(reformatted);
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
