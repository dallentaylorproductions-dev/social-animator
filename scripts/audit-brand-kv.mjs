#!/usr/bin/env node
/**
 * Brand-KV audit + targeted purge (v1.6x contamination cleanup).
 *
 * WHY: the /welcome brand-contamination bug (PR #114) could push a FOREIGN
 * brand UP into a fresh account's `brand:<email>` server record while
 * SERVER_BRAND_SETTINGS_ENABLED was on. The prod test account
 * `dallentaylorproductions+onbprodsmoke@gmail.com` is the known-likely victim;
 * other prod test accounts need an audit for the same signature.
 *
 * CONTAMINATION SIGNATURES this flags on each `brand:<email>` record:
 *   1. embedded `ownerEmail` !== the email in the KEY (the record claims a
 *      different owner than its key — the clearest tell), and
 *   2. an embedded `ownerEmail`/agentName/contact that looks like it belongs to
 *      a different real agent than the key's account.
 *
 * SAFETY:
 *   - DEFAULT mode is READ-ONLY audit. It never writes or deletes.
 *   - `--purge <email>` is a DRY RUN unless `--yes` is ALSO passed. Even with
 *     `--yes` it deletes exactly ONE key (`brand:<lowercased email>`) and prints
 *     the record it removed first.
 *
 * CREDENTIALS: reads KV_REST_API_URL + KV_REST_API_TOKEN from the environment
 * (the @vercel/kv defaults). Pull them for the target env first, e.g.:
 *     vercel link            # once, to associate this dir with the project
 *     vercel env pull .env.kv --environment=production
 *     set -a; . ./.env.kv; set +a
 *     node scripts/audit-brand-kv.mjs                       # audit all
 *     node scripts/audit-brand-kv.mjs --purge <email>       # dry-run purge
 *     node scripts/audit-brand-kv.mjs --purge <email> --yes # real purge
 *
 * `.env*` is gitignored, so pulled prod creds never get committed.
 */

import { createClient } from "@vercel/kv";

function getClient() {
  const url = process.env.KV_REST_API_URL;
  const token = process.env.KV_REST_API_TOKEN;
  if (!url || !token) {
    console.error(
      "Missing KV_REST_API_URL / KV_REST_API_TOKEN. Pull them first:\n" +
        "  vercel env pull .env.kv --environment=production\n" +
        "  set -a; . ./.env.kv; set +a",
    );
    process.exit(2);
  }
  return createClient({ url, token });
}

function emailFromKey(key) {
  return key.startsWith("brand:") ? key.slice("brand:".length) : null;
}

/** Returns a list of human-readable contamination reasons (empty = clean). */
function diagnose(key, record) {
  const reasons = [];
  const keyEmail = (emailFromKey(key) || "").toLowerCase();
  if (!record || typeof record !== "object") {
    reasons.push("record is not an object");
    return reasons;
  }
  const owner = String(record.ownerEmail || "").toLowerCase();
  if (!owner) {
    reasons.push("record has no ownerEmail (owned by nobody)");
  } else if (owner !== keyEmail) {
    reasons.push(`ownerEmail "${owner}" != key email "${keyEmail}"`);
  }
  return reasons;
}

async function listBrandKeys(kv) {
  const keys = [];
  let cursor = 0;
  do {
    // SCAN is non-destructive; MATCH limits to the brand namespace.
    const [next, batch] = await kv.scan(cursor, { match: "brand:*", count: 200 });
    keys.push(...batch);
    cursor = Number(next);
  } while (cursor !== 0);
  return Array.from(new Set(keys)).sort();
}

async function audit(kv) {
  const keys = await listBrandKeys(kv);
  console.log(`Found ${keys.length} brand:* record(s).\n`);
  let flagged = 0;
  for (const key of keys) {
    const record = await kv.get(key);
    const reasons = diagnose(key, record);
    const name = record?.settings?.agentName ?? record?.agentName ?? "(no name)";
    const contact = record?.settings?.contactEmail ?? "(no contact)";
    if (reasons.length) {
      flagged++;
      console.log(`⚠️  ${key}`);
      console.log(`     agentName: ${name}`);
      console.log(`     contact:   ${contact}`);
      console.log(`     updatedAt: ${record?.updatedAt ?? "(none)"}`);
      for (const r of reasons) console.log(`     → ${r}`);
      console.log("");
    } else {
      console.log(`✓  ${key}  (${name})`);
    }
  }
  console.log(`\n${flagged} record(s) flagged for review.`);
  if (flagged) {
    console.log("Purge one with: node scripts/audit-brand-kv.mjs --purge <email> --yes");
  }
}

async function purge(kv, email, confirmed) {
  const key = `brand:${email.toLowerCase()}`;
  const record = await kv.get(key);
  if (!record) {
    console.log(`No record at ${key} — nothing to purge.`);
    return;
  }
  console.log(`Record at ${key}:`);
  console.log(JSON.stringify(record, null, 2));
  const reasons = diagnose(key, record);
  console.log(reasons.length ? `\nContamination: ${reasons.join("; ")}` : "\nNote: record looks self-consistent (owner matches key).");
  if (!confirmed) {
    console.log("\nDRY RUN — pass --yes to actually delete this key.");
    return;
  }
  await kv.del(key);
  console.log(`\nDELETED ${key}.`);
}

async function main() {
  const args = process.argv.slice(2);
  const kv = getClient();
  const purgeIdx = args.indexOf("--purge");
  if (purgeIdx !== -1) {
    const email = args[purgeIdx + 1];
    if (!email || email.startsWith("--")) {
      console.error("Usage: --purge <email> [--yes]");
      process.exit(2);
    }
    await purge(kv, email, args.includes("--yes"));
  } else {
    await audit(kv);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
