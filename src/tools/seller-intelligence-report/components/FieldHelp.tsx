'use client';

import type { ReactNode } from 'react';

interface FieldHelpProps {
  label: string;
  required?: boolean;
  helpText?: string;
  children: ReactNode;
}

/**
 * Shared field wrapper for the SIR wizard.
 *
 * Refinement #15: every field gets a label, a required/optional indicator,
 * and a one-line help-text underneath. Required fields show a red asterisk;
 * optional fields show a muted "(optional)" tag so the agent can scan a
 * step and skip what they don't have.
 */
export function FieldHelp({ label, required, helpText, children }: FieldHelpProps) {
  return (
    <div className="space-y-1">
      <label className="text-sm font-medium flex items-center gap-1">
        {label}
        {required ? (
          <span className="text-red-400 text-xs" aria-label="required">
            *
          </span>
        ) : (
          <span className="text-gray-500 text-xs">(optional)</span>
        )}
      </label>
      {children}
      {helpText && <p className="text-xs text-gray-500">{helpText}</p>}
    </div>
  );
}
