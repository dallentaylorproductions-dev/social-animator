/**
 * Seller Presentation — publish-time template version (flagship rollout, F3).
 *
 * The consumer page (`/h/<slug>`) has a versioned visual redesign. The
 * `templateVersion` discriminator on the public payload lets already-published
 * slugs keep the current look forever (they carry no version → read as v1),
 * while NEW publishes are stamped with whatever this constant says.
 *
 * F1 laid invisible rails (every publish on v1). F3 flips this to 2: new
 * publishes are stamped v2 and render the flagship template. Already-stored
 * payloads carry no/1 version → the read clamp keeps them on v1 forever; a
 * republish re-stamps to v2 (the agent's explicit upgrade action).
 */
export const PUBLISH_TEMPLATE_VERSION = 2 as const;
