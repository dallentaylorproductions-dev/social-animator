/**
 * Stable local identifier generator (Substrate §2.3).
 *
 * Every substrate primitive instance gets a local UUID on first write
 * (clientId, propertyId, workflowInstanceId, artifactId). IDs are
 * prefixed by primitive type so a value carries its own kind in the
 * debugger/storage — `client_abc…` vs `workflow_xyz…` — without needing
 * a separate type tag at the call site.
 *
 * Implementation: Crockford base32 (no I/L/O/U for visual disambiguation,
 * mirror of the slug alphabet in src/lib/share-urls.ts) over 12 bytes of
 * CSPRNG (96 bits — collision-safe to the heat death of any user's
 * localStorage). The alphabet is duplicated rather than imported from
 * share-urls.ts because the two concerns are different: share-urls
 * mints fixed-length public-facing slugs; this mints opaque internal
 * identifiers with type prefixes. Coupling the constants would be a
 * false economy.
 *
 * SSR-safe: `globalThis.crypto.getRandomValues` is available in both
 * the Node 18+ runtime (built-in WebCrypto) and the browser. No
 * `typeof window` guard needed — this can be called from server code,
 * client code, or build-time scripts identically.
 */

const ID_ALPHABET = '0123456789abcdefghjkmnpqrstvwxyz';
const ID_BYTE_LENGTH = 12;

export type IdPrefix = 'client' | 'property' | 'workflow' | 'artifact';

export function generateId(prefix: IdPrefix): string {
  const bytes = new Uint8Array(ID_BYTE_LENGTH);
  globalThis.crypto.getRandomValues(bytes);
  let suffix = '';
  for (let i = 0; i < bytes.length; i++) {
    // 256 % 32 === 0, direct modulo is bias-free.
    suffix += ID_ALPHABET[bytes[i] % ID_ALPHABET.length];
  }
  return `${prefix}_${suffix}`;
}
