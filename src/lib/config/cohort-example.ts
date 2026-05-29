/**
 * The canonical cohort example seller presentation.
 *
 * This is the example for the current cohort phase — swappable when the
 * user base broadens. MUST be a PRODUCTION URL
 * (studio.simplyeditpro.com/h/...), never a *.vercel.app preview hash
 * (preview deployments get garbage-collected; the production domain
 * reading the shared KV slug is durable).
 *
 * To swap the demo: change this one line + redeploy. (We chose a code
 * constant over an env var deliberately — avoids the Vercel
 * Sensitive-flag trap, and a URL changes rarely.)
 *
 * NOTE: when v1.48 link-lifecycle ships, the artifact this points to
 * must be pinned no-expire.
 */
export const COHORT_EXAMPLE_URL = "https://studio.simplyeditpro.com/h/zgasxyb2";
export const COHORT_EXAMPLE_LABEL = "See what your seller receives";
