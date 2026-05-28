"use client";

import { useEffect, useState } from "react";
import { generateId } from "./ids";

/**
 * Thin addressable Client primitive (Substrate §2, v1.47 / A2).
 *
 * "Thin" — just enough to name a recipient and personalize an output
 * (a Seller Presentation rendered "for the Johnsons"). Not a CRM.
 *
 * "Addressable" — every record has a stable `clientId` (§2.3) and the
 * store holds many records keyed by id, not a single-active profile.
 * Q-1 from the A1 audit was resolved this direction so the future
 * knownClients[] orchestration surface and the eventual CRM swap don't
 * have to retrofit IDs onto string-matched records.
 *
 * Storage shape — localStorage key `socanim_clients`, JSON-encoded
 * `Record<string, Client>` (clientId → record). Single key per browser;
 * v1.47 has no multi-device sync, no cross-component subscription, and
 * no management UI. The Seller Presentation wizard is the only consumer.
 *
 * SSR-safe — initialized empty on both server and client first-render,
 * populated via useEffect post-mount. Reading localStorage in a
 * useState(() => …) initializer triggers React error #418; the existing
 * useBrandSettings comment at src/lib/brand.ts:203-216 documents the
 * regression that taught the codebase this rule.
 */

export type ClientRelationshipType =
  | "buyer"
  | "seller"
  | "past-client"
  | "lead";

export interface Client {
  clientId: string;
  name: string;
  contactEmail?: string;
  contactPhone?: string;
  relationshipType: ClientRelationshipType;
  /** ISO 8601 UTC. */
  createdAt: string;
  /** ISO 8601 UTC. */
  updatedAt: string;
}

const STORAGE_KEY = "socanim_clients";

const VALID_RELATIONSHIP_TYPES: readonly ClientRelationshipType[] = [
  "buyer",
  "seller",
  "past-client",
  "lead",
];

const str = (v: unknown, fallback = ""): string =>
  typeof v === "string" ? v : fallback;

const optionalStr = (v: unknown): string | undefined =>
  typeof v === "string" && v.length > 0 ? v : undefined;

function clampRelationshipType(v: unknown): ClientRelationshipType {
  return VALID_RELATIONSHIP_TYPES.includes(v as ClientRelationshipType)
    ? (v as ClientRelationshipType)
    : "lead";
}

function clampClient(raw: unknown, fallbackId: string): Client | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const clientId = typeof r.clientId === "string" && r.clientId.length > 0
    ? r.clientId
    : fallbackId;
  return {
    clientId,
    name: str(r.name),
    contactEmail: optionalStr(r.contactEmail),
    contactPhone: optionalStr(r.contactPhone),
    relationshipType: clampRelationshipType(r.relationshipType),
    createdAt: typeof r.createdAt === "string" ? r.createdAt : new Date().toISOString(),
    updatedAt: typeof r.updatedAt === "string" ? r.updatedAt : new Date().toISOString(),
  };
}

export function loadClients(): Record<string, Client> {
  if (typeof window === "undefined" || !window.localStorage) return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return {};
    const out: Record<string, Client> = {};
    for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
      const clamped = clampClient(value, key);
      if (clamped) out[clamped.clientId] = clamped;
    }
    return out;
  } catch {
    return {};
  }
}

export function saveClients(clients: Record<string, Client>): void {
  if (typeof window === "undefined" || !window.localStorage) return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(clients));
  } catch {
    // ignore quota / storage-disabled
  }
}

export interface CreateClientInput {
  name: string;
  contactEmail?: string;
  contactPhone?: string;
  relationshipType: ClientRelationshipType;
}

/**
 * Create + persist a new Client. Returns the materialized record so
 * callers have the assigned clientId immediately. Pure with respect to
 * the rest of the store — only the new record is added.
 */
export function createClient(input: CreateClientInput): Client {
  const now = new Date().toISOString();
  const record: Client = {
    clientId: generateId("client"),
    name: input.name,
    contactEmail: input.contactEmail,
    contactPhone: input.contactPhone,
    relationshipType: input.relationshipType,
    createdAt: now,
    updatedAt: now,
  };
  const current = loadClients();
  current[record.clientId] = record;
  saveClients(current);
  return record;
}

export function getClient(clientId: string): Client | null {
  return loadClients()[clientId] ?? null;
}

/**
 * Patch fields on an existing Client. clientId / createdAt are
 * immutable; updatedAt is refreshed. Returns the merged record or
 * null when the id doesn't exist (caller decides whether that's an
 * error or a no-op).
 */
export function updateClient(
  clientId: string,
  patch: Partial<Omit<Client, "clientId" | "createdAt" | "updatedAt">>,
): Client | null {
  const current = loadClients();
  const existing = current[clientId];
  if (!existing) return null;
  const merged: Client = {
    ...existing,
    ...patch,
    clientId: existing.clientId,
    createdAt: existing.createdAt,
    updatedAt: new Date().toISOString(),
  };
  current[clientId] = merged;
  saveClients(current);
  return merged;
}

export function removeClient(clientId: string): boolean {
  const current = loadClients();
  if (!(clientId in current)) return false;
  delete current[clientId];
  saveClients(current);
  return true;
}

/**
 * React hook over the Client store. Mirrors useBrandSettings /
 * useListingProfile in shape: empty initial state, hydrated flag,
 * useEffect-based load. Returns the current snapshot plus mutators
 * that re-read from storage after every change so the in-memory
 * state stays in sync.
 *
 * Cross-component reactivity: each call to the hook owns its own
 * useState — a mutation in one component does NOT refresh another
 * component's snapshot. Same model as the existing primitive hooks.
 * v1.47 has a single consumer (the Seller Presentation wizard); a
 * shared-store refactor lands only if the model needs it.
 */
export function useClients() {
  const [clients, setClients] = useState<Record<string, Client>>({});
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setClients(loadClients());
    setHydrated(true);
  }, []);

  const create = (input: CreateClientInput): Client => {
    const record = createClient(input);
    setClients(loadClients());
    return record;
  };

  const update = (
    clientId: string,
    patch: Partial<Omit<Client, "clientId" | "createdAt" | "updatedAt">>,
  ): Client | null => {
    const merged = updateClient(clientId, patch);
    setClients(loadClients());
    return merged;
  };

  const remove = (clientId: string): boolean => {
    const ok = removeClient(clientId);
    setClients(loadClients());
    return ok;
  };

  const getById = (clientId: string): Client | null =>
    clients[clientId] ?? null;

  return { clients, hydrated, create, update, remove, getById };
}
