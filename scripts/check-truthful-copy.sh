#!/usr/bin/env bash
# Fails the build if any user-facing TSX in the Seller Presentation surface
# contains a substring from the forbidden list. Phase 0 Section 4.
#
# The Seller Presentation copy makes a truthful-substrate promise: the
# wizard never claims the agent's content was AI-written, auto-filled, or
# fetched on their behalf. This gate keeps that promise enforceable as the
# B-phase UI lands new copy.

set -euo pipefail

FORBIDDEN=(
  "we pulled"
  "we fetched"
  "drafted in your voice"
  "in your voice"
  "AI magic"
  "we wrote"
  "we drafted"
  "AI-drafted"
  "AI-generated"
  "autofill"
  "auto-fill"
  "magically"
)

GLOB_ROOTS=(
  "src/app/seller-presentation"
  "src/tools/seller-presentation/components"
)

# Also check for `\bsummarize\b` (verb form only), not `summary` (noun).
SUMMARIZE_REGEX="\\bsummariz(e|es|ed|ing)\\b"

FAIL=0
for root in "${GLOB_ROOTS[@]}"; do
  for needle in "${FORBIDDEN[@]}"; do
    if grep -rIn --include="*.tsx" --exclude="*.test.tsx" --exclude="*.spec.tsx" -F "$needle" "$root" 2>/dev/null; then
      echo "::error::Truthful-copy violation: '$needle' found in $root"
      FAIL=1
    fi
  done
  if grep -rIn --include="*.tsx" --exclude="*.test.tsx" --exclude="*.spec.tsx" -E "$SUMMARIZE_REGEX" "$root" 2>/dev/null; then
    echo "::error::Truthful-copy violation: 'summarize' (verb) found in $root. Use 'summary' (noun) instead."
    FAIL=1
  fi
done

exit $FAIL
