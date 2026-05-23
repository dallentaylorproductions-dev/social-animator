"use client";

/**
 * Percent-formatted input ("101%" / "+4.6%" / "−2.1%").
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
 * `signed` enables a leading + / − prefix for delta-style values.
 * Because the iOS decimal keypad has no minus key, signed mode
 * renders a tappable +/− toggle next to the magnitude input — the
 * toggle controls the SIGN, the keypad fills in the MAGNITUDE, and
 * the parent always receives the recomposed signed value. Stored
 * (and displayed) sign uses the UNICODE MINUS GLYPH (−, U+2212), not
 * a hyphen, so the seller page reads as designed. Without `signed`,
 * only digits + dot are accepted (e.g. "101%").
 */
export interface PercentInputProps {
  value: string;
  onChange: (formatted: string) => void;
  placeholder?: string;
  className?: string;
  /** Render the +/− toggle and round-trip a signed value. */
  signed?: boolean;
  required?: boolean;
  disabled?: boolean;
  "aria-label"?: string;
}

const DEFAULT_CLASS =
  "w-full bg-neutral-900 border border-neutral-800 rounded-md px-3 py-2 text-base lg:text-sm focus:outline-none focus:border-mint";

const MINUS_GLYPH = "−";

type Sign = "+" | "-";

/** Split a stored signed value (e.g. "+4.6%" / "−2.1%" / "4.6%") into its parts. */
function parseSignedValue(raw: string): { sign: Sign; magnitude: string } {
  const v = raw ?? "";
  if (v.startsWith("-") || v.startsWith(MINUS_GLYPH)) {
    return { sign: "-", magnitude: v.slice(1) };
  }
  if (v.startsWith("+")) {
    return { sign: "+", magnitude: v.slice(1) };
  }
  return { sign: "+", magnitude: v };
}

/** Recompose a stored signed value. Empty magnitude → empty (hides on render). */
function composeSignedValue(sign: Sign, magnitude: string): string {
  const trimmed = magnitude.trim();
  if (!trimmed) return "";
  const prefix = sign === "-" ? MINUS_GLYPH : "+";
  return `${prefix}${trimmed}`;
}

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
  if (signed) {
    const { sign, magnitude } = parseSignedValue(value);

    const handleMagChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      // Strip any sign characters from the magnitude input — sign lives
      // on the toggle, not in the typed text.
      const cleaned = e.target.value.replace(/[^0-9.%]/g, "");
      onChange(composeSignedValue(sign, cleaned));
    };

    const handleMagBlur = (e: React.FocusEvent<HTMLInputElement>) => {
      const raw = e.target.value.trim();
      if (!raw) {
        onChange("");
        return;
      }
      const next = raw.endsWith("%") ? raw : `${raw}%`;
      onChange(composeSignedValue(sign, next));
    };

    const toggleSign = () => {
      const nextSign: Sign = sign === "-" ? "+" : "-";
      onChange(composeSignedValue(nextSign, magnitude));
    };

    // Inline `padding: 0` overrides the caller's `px-3 py-2` so the
    // wrapper can host the sign-toggle + magnitude input compactly. The
    // toggle and the input each carry their own padding inside.
    return (
      <div
        className={`${className ?? DEFAULT_CLASS} flex items-stretch overflow-hidden`}
        style={{ padding: 0 }}
        data-signed-percent
        data-sign={sign === "-" ? "negative" : "positive"}
      >
        <button
          type="button"
          onClick={toggleSign}
          disabled={disabled}
          aria-label={`Toggle sign (currently ${sign === "-" ? "negative" : "positive"})`}
          aria-pressed={sign === "-"}
          data-testid="percent-input-sign-toggle"
          className="shrink-0 w-10 border-r border-neutral-800 text-base lg:text-sm text-text-primary hover:bg-neutral-800/40 active:bg-neutral-800/60 focus:outline-none focus:bg-mint/10"
        >
          {sign === "-" ? MINUS_GLYPH : "+"}
        </button>
        <input
          type="text"
          inputMode="decimal"
          autoComplete="off"
          value={magnitude}
          onChange={handleMagChange}
          onBlur={handleMagBlur}
          placeholder={placeholder}
          required={required}
          disabled={disabled}
          aria-label={ariaLabel}
          className="flex-1 min-w-0 bg-transparent px-3 py-2 text-base lg:text-sm focus:outline-none"
        />
      </div>
    );
  }

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    const cleaned = raw.replace(/[^0-9.%]/g, "");
    onChange(cleaned);
  };

  const handleBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    const raw = e.target.value.trim();
    if (!raw) {
      onChange("");
      return;
    }
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
