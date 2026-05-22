"use client";

import { useLayoutEffect, useRef } from "react";
import {
  caretAfterNthDigit,
  formatCurrency,
  looksLikeWordNumber,
  stripToDigits,
  wordsToNumber,
} from "./formatHelpers";

/**
 * Live-formatted currency input ("$685,000").
 *
 * Storage contract — STATE = DISPLAY: the component emits the
 * formatted display string on every keystroke. Downstream renderers
 * (PDF documents, listing-showcase canvas regex, etc.) keep receiving
 * the canonical display unchanged.
 *
 * Cursor preservation: when the user types or deletes mid-string,
 * commas shift but the caret stays logically adjacent to the digit
 * the user just touched.
 *
 *   1. On change, count raw digits to the LEFT of the caret in the
 *      pre-reformat display.
 *   2. Compute the reformatted display from the stripped digits.
 *   3. Call onChange with the reformatted string.
 *   4. In a useLayoutEffect (runs before paint), land the caret
 *      AFTER the same raw-digit ordinal so comma shifts are
 *      transparent.
 *
 * Voice-input compat (Commit 9): when the input text contains
 * alphabetic tokens (word-form numbers from iOS / Android dictation
 * e.g. "six hundred eighty five thousand dollars"), the change
 * handler runs wordsToNumber() before stripToDigits, converting
 * the spoken phrase to digits before format. The caret jumps to
 * end-of-string in this path — acceptable because dictation
 * naturally finishes the input.
 *
 * Paste handling: "$1,234,567", "1234567", "1.234.567" all
 * normalize to the same "$1,234,567" via stripToDigits + format.
 */
export interface CurrencyInputProps {
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

    // Voice/dictation path: if the input contains alphabetic word-form
    // numbers (from iOS / Android speech-to-text), convert to digits
    // before formatting. Cursor lands at end of formatted string.
    if (looksLikeWordNumber(editedDisplay)) {
      const n = wordsToNumber(editedDisplay);
      if (n !== null && n > 0) {
        const reformatted = formatCurrency(String(n));
        pendingCaretRef.current = reformatted.length;
        onChange(reformatted);
        return;
      }
      // Unrecognized words — show what the user typed verbatim so they
      // can correct it before tabbing away.
      pendingCaretRef.current = caretInEdited;
      onChange(editedDisplay);
      return;
    }

    // Normal typed-digit path with cursor preservation.
    const rawDigitsLeft = stripToDigits(
      editedDisplay.slice(0, caretInEdited)
    ).length;
    const newRaw = stripToDigits(editedDisplay);
    const reformatted = formatCurrency(newRaw);
    pendingCaretRef.current = caretAfterNthDigit(reformatted, rawDigitsLeft);
    onChange(reformatted);
  };

  useLayoutEffect(() => {
    // Only restore the caret on inputs the user is actively editing.
    // A7c.4.1: the prior version called setSelectionRange on every
    // render — including renders triggered by SIBLING components
    // (e.g., a new comp row being added). Mobile WebKit can react
    // to setSelectionRange on a non-focused element by re-focusing
    // it or by scrolling the viewport, which on phones reads as the
    // page "freezing." Gating on activeElement keeps the caret-
    // preservation behavior for the focused input while leaving
    // unfocused inputs untouched on unrelated re-renders.
    if (pendingCaretRef.current === null || !inputRef.current) return;
    if (document.activeElement !== inputRef.current) {
      pendingCaretRef.current = null;
      return;
    }
    const c = pendingCaretRef.current;
    inputRef.current.setSelectionRange(c, c);
    pendingCaretRef.current = null;
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
