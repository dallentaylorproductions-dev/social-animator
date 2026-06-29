/**
 * In-memory fake of `getOwnedBrandSettings` for the voice-source unit lane.
 *
 * Redirected in via `tsconfig.unit.json` paths so `voice-source.ts` (which imports
 * `getOwnedBrandSettings` from "@/lib/brand-settings-store") reads a canned record
 * instead of touching Vercel KV. Only the one function voice-source consumes is
 * faked; the spec drives it with the `__`-prefixed controls (shared singleton).
 */

export interface FakeBrandRecord {
  ownerEmail: string;
  updatedAt: string;
  // Loose on purpose: voice-source reads agentName / brokerage / agentTagline /
  // signatureLine / whyUs.guarantee off `record.settings`.
  settings: Record<string, unknown>;
}

let fixture: FakeBrandRecord | null = null;
let shouldThrow = false;

export async function getOwnedBrandSettings(
  _email: string,
): Promise<FakeBrandRecord | null> {
  if (shouldThrow) throw new Error("brand store unavailable (fake)");
  return fixture;
}

// ---- test controls ----
export function __setBrandFixture(record: FakeBrandRecord | null): void {
  fixture = record;
  shouldThrow = false;
}
export function __setBrandThrows(): void {
  shouldThrow = true;
}
export function __resetBrand(): void {
  fixture = null;
  shouldThrow = false;
}
