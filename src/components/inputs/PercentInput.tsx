"use client";

/**
 * Percent-formatted input ("101%" / "+4.6%").
 *
 * Storage contract — STATE = DISPLAY: the value the parent receives
 * is what the user typed (digits / dot / optional sign), and on blur
 * a trailing "%" is appended if missing and the field is non-empty.
 * Empty stays empty so the renderer can hide the field cleanly.
 *
 * Numeric keypad (inputMode="decimal") — same approach as StepComps'
 * sale-to-list field, but factored into a shared component so the
 * Area-snapshot fields (list-to-sale ratio, YoY delta) get the same
 * keypad + format treatment as the rest of the wizard.
 *
 * `signed` enables a leading + / - prefix for delta-style values
 * ("+4.6%"). Without it, only digits + dot are accepted (e.g. "101%").
 */
export interface PercentInputProps {
  value: string;
  onChange: (formatted: string) => void;
  placeholder?: string;
  className?: string;
  /** Allow leading + / - sign (for YoY-style deltas). */
  signed?: boolean;
  required?: boolean;
  disabled?: boolean;
  "aria-label"?: string;
}

const DEFAULT_CLASS =
  "w-full bg-neutral-900 border border-neutral-800 rounded-md px-3 py-2 text-base lg:text-sm focus:outline-none focus:border-mint";

export function PercentInput({
  value,
  onChange,
  placeholder,
  className,
  signed,
  required,
  disabled,
  "aria-label": ariaLabel,
}: PercentInputProps) {
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    // Allow digits, single dot, percent sign, and (when signed) +/-.
    const charClass = signed ? /[^0-9.+\-%]/g : /[^0-9.%]/g;
    const cleaned = raw.replace(charClass, "");
    onChange(cleaned);
  };

  const handleBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    const raw = e.target.value.trim();
    if (!raw) {
      onChange("");
      return;
    }
    // Append "%" if the user typed a number without it.
    const next = raw.endsWith("%") ? raw : `${raw}%`;
    if (next !== raw) onChange(next);
  };

  return (
    <input
      type="text"
      inputMode="decimal"
      autoComplete="off"
      value={value}
      onChange={handleChange}
      onBlur={handleBlur}
      placeholder={placeholder}
      required={required}
      disabled={disabled}
      aria-label={ariaLabel}
      className={className ?? DEFAULT_CLASS}
    />
  );
}
