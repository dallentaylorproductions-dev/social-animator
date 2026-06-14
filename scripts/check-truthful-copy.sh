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

# Blank everything that is NOT user-facing copy, PRESERVING line numbers (each
# removed span becomes as many newlines as it spanned, or is blanked in place),
# so a reported `file:line` still points at the real source line. The gate is
# about the words a SELLER reads, not the words a developer types, so we drop:
#
#   1. Block + line comments (we document the auto-fill provenance in JSDoc).
#   2. import statements + path/URL/import-specifier string literals (an import
#      from ".../rentcast-autofill" or a fetch of "/api/.../autofill" is plumbing,
#      never seller copy). A path string is one that starts with / or @/ or ./
#      or a scheme:// - prose like "and/or" is left intact.
#   3. data-* attribute VALUES (data-testid="...-autofill-..." is a test hook).
#
# What survives is JSX text + user-facing attribute copy (placeholder, title,
# aria-label, alt, ...), which is exactly what the forbidden list polices.
strip_comments() {
  perl -0777 -pe '
    s{/\*.*?\*/}{"\n" x ($& =~ tr/\n//)}gse;
    s{(^|[^:])//[^\n]*}{$1}gm;
    s{^\s*import\b[^\n]*$}{}gm;
    s{"(?:/|\@/|\.\.?/|[a-z][a-z0-9+.-]*://)[^"]*"}{""}g;
    s{\bdata-[a-z-]+\s*=\s*"[^"]*"}{}g;
  ' "$1"
}

FAIL=0
for root in "${GLOB_ROOTS[@]}"; do
  [ -d "$root" ] || continue
  while IFS= read -r -d '' file; do
    stripped="$(strip_comments "$file")"
    for needle in "${FORBIDDEN[@]}"; do
      # -w: match only as a WHOLE WORD, so a code identifier like
      # `autofillStatus` (autofill + Status, no word boundary) never trips on the
      # forbidden word "autofill", but seller prose ("we'll autofill this") does.
      if matches="$(printf '%s' "$stripped" | grep -nwF "$needle")"; then
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
