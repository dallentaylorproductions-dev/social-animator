#!/usr/bin/env bash
# Fails the build if any user-facing TSX in the Seller Presentation surface
# contains a substring from the forbidden list. Phase 0 Section 4.
#
# The Seller Presentation copy makes a truthful-substrate promise: the
# wizard never claims the agent's content was AI-written, auto-filled, or
# fetched on their behalf. This gate keeps that promise enforceable as the
# B-phase UI lands new copy.
#
# Comments are stripped before scanning (FR-2 follow-up): the forbidden
# words describe behaviour we routinely document in code comments/JSDoc
# (e.g. "auto-fill provenance"), which are NOT user-facing. Stripping is
# line-number-preserving — a block comment collapses to blank lines — so a
# reported `file:line` still points at the real source line. The strip
# mirrors the em-dash gate's stripComments() in truthful-copy.spec.ts.

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

# Strip block + line comments while PRESERVING line numbers: each block
# comment becomes as many newlines as it spanned, so following lines keep
# their position; line comments are blanked, but the "://" in a URL is
# preserved (the [^:] guard). Whole-file slurp via perl -0777.
strip_comments() {
  perl -0777 -pe '
    s{/\*.*?\*/}{"\n" x ($& =~ tr/\n//)}gse;
    s{(^|[^:])//[^\n]*}{$1}gm;
  ' "$1"
}

FAIL=0
for root in "${GLOB_ROOTS[@]}"; do
  [ -d "$root" ] || continue
  while IFS= read -r -d '' file; do
    stripped="$(strip_comments "$file")"
    for needle in "${FORBIDDEN[@]}"; do
      if matches="$(printf '%s' "$stripped" | grep -nF "$needle")"; then
        printf '%s\n' "$matches" | sed "s|^|$file:|"
        echo "::error::Truthful-copy violation: '$needle' found in $file"
        FAIL=1
      fi
    done
    if matches="$(printf '%s' "$stripped" | grep -nE "$SUMMARIZE_REGEX")"; then
      printf '%s\n' "$matches" | sed "s|^|$file:|"
      echo "::error::Truthful-copy violation: 'summarize' (verb) found in $file. Use 'summary' (noun) instead."
      FAIL=1
    fi
  done < <(find "$root" -type f -name "*.tsx" ! -name "*.test.tsx" ! -name "*.spec.tsx" -print0)
done

exit $FAIL
