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
 *
 *   CONTAMINATED (a delete-candidate class — eyeball, then purge per-key):
 *     1. embedded `ownerEmail` !== the email in the KEY (the record claims a
 *        different owner than its key). Still valid for NON-re-stamped cases.
 *     2. `agentName` that looks like TWO names jammed together
 *        ("Morgan LeeDallen Taylor"). This is the ONLY tell that surfaced the
 *        real breach: the contaminating edit RE-STAMPS `ownerEmail` to the new
 *        owner, so owner==key stays self-consistent and signature #1 can't see
 *        it — but the merged name survives in the CONTENT.
 *
 *   REVIEW (soft, advisory — NEVER an auto-purge target):
 *     3. content that looks internally inconsistent (e.g. a contact email whose
 *        domain differs from the account AND whose local-part shares no token
 *        with the agent name). Labeled "review manually," not "contaminated";
 *        false positives are fine here because it never drives a delete.
 *
 * SAFETY:
 *   - DEFAULT mode is READ-ONLY audit. It never writes or deletes.
 *   - The content checks only ADD FLAGS to the report — they never auto-delete,
 *     and a soft "review" flag is never treated as a purge target.
 *   - `--purge <email>` is a DRY RUN unless `--yes` is ALSO passed. Even with
 *     `--yes` it deletes exactly ONE key (`brand:<lowercased email>`) and prints
 *     the record it removed first. Purge stays an explicit per-key human call.
 *
 * CREDENTIALS: reads KV_REST_API_URL + KV_REST_API_TOKEN from the environment
 * (the @vercel/kv defaults). Pull them for the target env first, e.g.:
 *     vercel link            # once, to associate this dir with the project
 *     vercel env pull .env.kv --environment=production
 *     set -a; . ./.env.kv; set +a
 *     node scripts/audit-brand-kv.mjs                       # audit all
 *     node scripts/audit-brand-kv.mjs --self-test           # pin the heuristics (no creds)
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

function getName(record) {
  return String(record?.settings?.agentName ?? record?.agentName ?? "");
}
function getContact(record) {
  return String(record?.settings?.contactEmail ?? record?.contactEmail ?? "");
}
function emailDomain(email) {
  const m = /@(.+)$/.exec(String(email || ""));
  return m ? m[1].toLowerCase() : "";
}
function emailLocal(email) {
  const m = /^([^@]+)@/.exec(String(email || ""));
  return m ? m[1].toLowerCase() : "";
}
/** Name tokens of length >= 3 (short particles/initials ignored). */
function nameTokens(name) {
  return String(name || "").toLowerCase().match(/[a-z]{3,}/g) || [];
}

/**
 * Surname/prefix particles that legitimately produce an internal
 * lowercase→uppercase seam (Mc, Mac, De, La, Van, …). These are NOT a
 * concatenation tell — without this allowlist "McDonald"/"MacArthur" would
 * false-positive.
 */
const NAME_PARTICLES = new Set([
  "mc", "mac", "de", "del", "della", "di", "da", "du", "dos", "das",
  "la", "le", "van", "von", "der", "den", "st", "ben", "bin", "al", "af",
]);

/**
 * Concatenated-name tell (PRIMARY content signature).
 *
 * The contaminating merge jammed two full names with no separator
 * ("Morgan LeeDallen Taylor" → the middle space-token "LeeDallen"). The tell is
 * an internal lowercase→uppercase seam INSIDE a whitespace token where BOTH
 * sides are full-length name words (>= 3 letters) and the left side is not a
 * known particle — so "Jordan Rivera", "Ronald McDonald", "JoAnne Smith",
 * "DeShawn", "Vincent van Gogh" do NOT trip, but "Morgan LeeDallen Taylor" and
 * "Sarah JohnsonMike Brown" do. Returns { token, left, right } or null.
 */
function concatenatedNameTell(name) {
  if (!name || typeof name !== "string") return null;
  for (const token of name.trim().split(/\s+/)) {
    for (let i = 1; i < token.length; i++) {
      const a = token[i - 1];
      const b = token[i];
      const lcToUc = a >= "a" && a <= "z" && b >= "A" && b <= "Z";
      if (!lcToUc) continue;
      const left = (token.slice(0, i).match(/[A-Za-z]+$/) || [""])[0];
      const right = (token.slice(i).match(/^[A-Za-z]+/) || [""])[0];
      if (
        left.length >= 3 &&
        right.length >= 3 &&
        !NAME_PARTICLES.has(left.toLowerCase()) &&
        /^[A-Z][a-z]/.test(right)
      ) {
        return { token, left, right };
      }
    }
  }
  return null;
}

/**
 * Soft consistency tells (SECONDARY — advisory, report-only). Returns flags
 * labeled "review manually," never "contaminated"; false positives are
 * acceptable because these never drive a purge.
 */
function softConsistencyTells(key, record) {
  const tells = [];
  const contact = getContact(record);
  if (contact) {
    const keyDomain = emailDomain(emailFromKey(key));
    const cDomain = emailDomain(contact);
    const cLocal = emailLocal(contact);
    const tokens = nameTokens(getName(record));
    const domainMismatch = !!keyDomain && !!cDomain && cDomain !== keyDomain;
    const nameShared = tokens.some(
      (t) => cLocal.includes(t) || (cLocal.length >= 3 && t.includes(cLocal)),
    );
    if (domainMismatch && tokens.length > 0 && !nameShared) {
      tells.push({
        severity: "review",
        label: "contact looks unrelated to the account",
        field: "contactEmail",
        value: contact,
        detail: `domain "${cDomain}" != account "${keyDomain}" and local-part shares no name token`,
      });
    }
  }
  return tells;
}

/**
 * Returns structured flags for a record (empty = clean). Each flag has a
 * `severity`: "contaminated" (a delete-candidate signature) or "review" (soft,
 * advisory). The caller decides what to do — this never deletes.
 */
function diagnose(key, record) {
  const flags = [];
  const keyEmail = (emailFromKey(key) || "").toLowerCase();
  if (!record || typeof record !== "object") {
    flags.push({ severity: "contaminated", label: "record is not an object" });
    return flags;
  }

  // (1) owner-mismatch — still valid for non-re-stamped cases.
  const owner = String(record.ownerEmail || "").toLowerCase();
  if (!owner) {
    flags.push({
      severity: "contaminated",
      label: "record has no ownerEmail (owned by nobody)",
      field: "ownerEmail",
      value: "(empty)",
    });
  } else if (owner !== keyEmail) {
    flags.push({
      severity: "contaminated",
      label: "ownerEmail != key email",
      field: "ownerEmail",
      value: owner,
      detail: `key email "${keyEmail}"`,
    });
  }

  // (2) concatenated-name — the re-stamped-owner class the mismatch can't see.
  const name = getName(record);
  const glue = concatenatedNameTell(name);
  if (glue) {
    flags.push({
      severity: "contaminated",
      label: "agentName looks like two names concatenated",
      field: "agentName",
      value: name,
      detail: `"${glue.left}" + "${glue.right}" (missing separator)`,
    });
  }

  // (3) soft consistency tells — advisory only.
  flags.push(...softConsistencyTells(key, record));

  return flags;
}

/** True if any flag is a delete-candidate signature (not a soft "review"). */
function isContaminated(flags) {
  return flags.some((f) => f.severity === "contaminated");
}

function printFlags(flags, indent = "     ") {
  for (const f of flags) {
    const tag = f.severity === "contaminated" ? "[contaminated]" : "[review]";
    const field = f.field ? ` ${f.field}="${f.value}"` : "";
    const detail = f.detail ? ` (${f.detail})` : "";
    console.log(`${indent}→ ${tag} ${f.label}:${field}${detail}`);
  }
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
  let contaminated = 0;
  let reviewOnly = 0;
  for (const key of keys) {
    const record = await kv.get(key);
    const flags = diagnose(key, record);
    const name = getName(record) || "(no name)";
    const contact = getContact(record) || "(no contact)";
    if (flags.length) {
      const hot = isContaminated(flags);
      if (hot) contaminated++;
      else reviewOnly++;
      console.log(`${hot ? "⚠️ " : "🔎"} ${key}`);
      console.log(`     agentName: ${name}`);
      console.log(`     contact:   ${contact}`);
      console.log(`     updatedAt: ${record?.updatedAt ?? "(none)"}`);
      printFlags(flags);
      console.log("");
    } else {
      console.log(`✓  ${key}  (${name})`);
    }
  }
  console.log(
    `\n${contaminated} record(s) flagged CONTAMINATED, ${reviewOnly} for manual REVIEW.`,
  );
  if (contaminated) {
    console.log(
      "Eyeball each, then purge one with: node scripts/audit-brand-kv.mjs --purge <email> --yes",
    );
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
  const flags = diagnose(key, record);
  if (flags.length) {
    console.log("\nFlags:");
    printFlags(flags, "  ");
    if (!isContaminated(flags)) {
      console.log(
        "\nNOTE: only soft 'review' flag(s) — not a confirmed contamination. Confirm by eye before --yes.",
      );
    }
  } else {
    console.log("\nNote: record looks self-consistent (owner matches key, no content tell).");
  }
  if (!confirmed) {
    console.log("\nDRY RUN — pass --yes to actually delete this key.");
    return;
  }
  await kv.del(key);
  console.log(`\nDELETED ${key}.`);
}

/**
 * Credentials-free self-test pinning the heuristics. Inline assertions so the
 * regex can't silently drift — run with `node scripts/audit-brand-kv.mjs --self-test`.
 */
function runSelfTest() {
  let pass = 0;
  let fail = 0;
  const check = (desc, cond) => {
    if (cond) pass++;
    else {
      fail++;
      console.error(`FAIL: ${desc}`);
    }
  };

  // Concatenated-name tell — MUST flag two-names-jammed.
  for (const n of ["Morgan LeeDallen Taylor", "Sarah JohnsonMike Brown"]) {
    check(`flags concatenated "${n}"`, concatenatedNameTell(n) !== null);
  }
  // …and MUST NOT flag legit names (single, two-word, particles, stylistic caps).
  for (const n of [
    "Jordan Rivera", "Alice Anderson", "Morgan Lee", "Ronald McDonald",
    "Mary MacArthur", "DeShawn Jackson", "Vincent van Gogh", "JoAnne Smith",
    "Jean-Luc Picard", "Lee", "",
  ]) {
    check(`ignores legit "${n}"`, concatenatedNameTell(n) === null);
  }

  // Soft consistency tell — advisory "review" flag.
  check(
    "review-flags an unrelated contact (different domain + no name token)",
    softConsistencyTells("brand:dallentaylorproductions+onbprodsmoke@gmail.com", {
      settings: { agentName: "Dallen Taylor", contactEmail: "aaron@aaronthomashometeam.com" },
    }).length > 0,
  );
  check(
    "no review-flag when contact domain matches the account",
    softConsistencyTells("brand:morgan@maplerealty.com", {
      settings: { agentName: "Morgan Lee", contactEmail: "morgan@maplerealty.com" },
    }).length === 0,
  );
  check(
    "no review-flag when a name token is in the contact local-part",
    softConsistencyTells("brand:morgan@gmail.com", {
      settings: { agentName: "Morgan Lee", contactEmail: "mlee@maplerealty.com" },
    }).length === 0,
  );

  // Owner-mismatch still works; clean record stays clean.
  check(
    "owner-mismatch flagged",
    diagnose("brand:a@x.com", { ownerEmail: "b@y.com" }).some(
      (f) => f.severity === "contaminated" && f.label.includes("ownerEmail"),
    ),
  );
  check(
    "self-consistent record is not flagged",
    diagnose("brand:a@x.com", {
      ownerEmail: "a@x.com",
      settings: { agentName: "Jordan Rivera", contactEmail: "a@x.com" },
    }).length === 0,
  );

  console.log(`\nself-test: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}

async function main() {
  const args = process.argv.slice(2);
  if (args.includes("--self-test")) {
    runSelfTest();
    return;
  }
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
