/**
 * PREPARED_NEXT — output validator (the gate; the model is not trusted).
 *
 * Runs BEFORE any draft is ever shown. Any failure → the draft is rejected to
 * `failed` and NEVER shown. Operates on the RAW model variants, before the code-
 * constant FALLBACK_CTA is appended — so the CTA is exempt from (b) + (c) by
 * construction (it is never part of what gets scanned).
 *
 * Layers:
 *   (a) Input clip — applied at GENERATION (generate.ts): the model only ever
 *       sees the <=3 clipped public sections + agent voice/identity. This is the
 *       PRIMARY honesty guarantee.
 *   (b) Denylist scan of the OUTPUT for verbatim leaks of private values:
 *       static known-private field tokens + a dynamic per-page set the route
 *       builds from payload values OUTSIDE the clip.
 *   (c) Em-dash scan (em dash U+2014 / horizontal bar U+2015) → fail.
 *   (d) Truncation check (cut at the token cap / no terminal punctuation) → fail.
 *
 * KNOWN v0 LIMITATION (do not try to fix): the denylist catches VERBATIM leaks,
 * not semantic paraphrase. The input clip is the real guarantee; the denylist is
 * a backstop. A semantic-paraphrase guard is future hardening, out of v0 scope.
 * Also: the private DRAFT record is not server-visible (KV holds only the public
 * payload), so the dynamic set is built from un-clipped PUBLIC values — a verbatim
 * over-reach backstop, again behind the input clip as the true guarantee.
 */

/** Static known-private field tokens that must never surface in a draft. */
const STATIC_DENY_TOKENS: readonly string[] = [
  "soldprice",
  "solddate",
  "daysonmarket",
  "saletolistpercent",
  "squarefeet",
  "distancemiles",
  "editorialphotourl",
  "agentnote",
  "trackrecord",
  "buyerquote",
  "seller motivation",
  "agent only",
  "agent-only",
  "internal note",
];

/** Em dash (U+2014) and horizontal bar (U+2015). En dash is intentionally allowed. */
const EM_DASH_RE = /[—―]/;

export type ValidationFailure =
  | "denylist"
  | "em-dash"
  | "truncated"
  | "empty";

export type ValidationResult =
  | { ok: true }
  | { ok: false; reason: ValidationFailure; detail?: string };

export interface ValidateInput {
  textVariant: string;
  emailVariant: string;
  /** Dynamic per-page private/over-reach values to reject verbatim (route-built). */
  denyValues?: string[];
  /** True iff generation stopped at the token cap (stop_reason === "max_tokens"). */
  tokenCapHit?: boolean;
}

/** Does a variant end on terminal sentence punctuation (not cut mid-sentence)? */
function endsCleanly(text: string): boolean {
  const t = text.trim();
  if (!t) return false;
  return /[.!?)"']$/.test(t);
}

/**
 * Validate both variants. Returns the FIRST failure found (order: empty →
 * truncation → em-dash → denylist), or { ok: true }. PURE.
 */
export function validatePreparedOutput(input: ValidateInput): ValidationResult {
  const variants = [input.textVariant ?? "", input.emailVariant ?? ""];

  // (empty) — a variant the model returned blank is never shown.
  if (variants.some((v) => v.trim().length === 0)) {
    return { ok: false, reason: "empty" };
  }

  // (d) truncation — an explicit cap hit, or a variant cut mid-sentence.
  if (input.tokenCapHit || variants.some((v) => !endsCleanly(v))) {
    return { ok: false, reason: "truncated" };
  }

  // (c) em-dash.
  for (const v of variants) {
    if (EM_DASH_RE.test(v)) return { ok: false, reason: "em-dash" };
  }

  // (b) denylist — static tokens + dynamic per-page values, case-insensitive.
  const haystack = variants.join("\n").toLowerCase();
  for (const token of STATIC_DENY_TOKENS) {
    if (haystack.includes(token)) {
      return { ok: false, reason: "denylist", detail: token };
    }
  }
  for (const raw of input.denyValues ?? []) {
    const needle = raw.trim().toLowerCase();
    // Only meaningful strings are scanned; short values cause false positives.
    if (needle.length >= 8 && haystack.includes(needle)) {
      return { ok: false, reason: "denylist", detail: needle };
    }
  }

  return { ok: true };
}
