/**
 * Seller Presentation — publish-time template version (flagship rollout, F1).
 *
 * The consumer page (`/h/<slug>`) is getting a versioned visual redesign. The
 * `templateVersion` discriminator on the public payload lets already-published
 * slugs keep the current look forever (they carry no version → read as v1),
 * while NEW publishes are stamped with whatever this constant says.
 *
 * F1 keeps every publish on v1 — invisible rails only. F3 flips this to 2 to
 * start shipping the flagship (v2) template to new publishes.
 */
export const PUBLISH_TEMPLATE_VERSION = 1 as const;
