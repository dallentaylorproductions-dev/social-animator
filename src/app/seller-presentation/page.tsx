import { auth } from "@/lib/auth";
import { SellerPresentationWizard } from "./SellerPresentationWizard";
import { PagesLibrary } from "./PagesLibrary";

/**
 * Seller Presentation — tool entry (SP-LIB landing gate).
 *
 * A thin SERVER component that chooses what the tool lands on. It does
 * NOT restructure the wizard (the editor is `SellerPresentationWizard`,
 * lifted verbatim) — it only picks between the wizard and the new "Your
 * pages" library based on the flag + URL.
 *
 *   - SELLER_PAGES_LIBRARY_ENABLED !== 'true'  → always the wizard,
 *     BYTE-IDENTICAL to the pre-SP-LIB tool landing (no ownerEmail
 *     stamping, no library link, no publish-linkage props).
 *   - flag on + `?id=` present → the wizard, resuming that instance
 *     (Open / Continue / Duplicate / New page all route here).
 *   - flag on + bare landing  → the "Your pages" library.
 *
 * Reading the flag server-side (not via the client entitlements fetch)
 * keeps the flag-off path free of any library code path or loading flash
 * — the server simply renders the same client wizard tree it always has.
 *
 * The agent's session email is resolved here once and threaded down so
 * the library can scope to the authenticated agent and the wizard can
 * stamp the instances it creates (draft scoping). It is NOT passed on
 * the flag-off path, so flag-off localStorage writes are unchanged.
 *
 * No `force-dynamic`: the flag-off branch reaches no dynamic API (no
 * auth, no searchParams), so Next can keep rendering it exactly as the
 * pre-SP-LIB client page did. The flag-on branch awaits searchParams +
 * auth, which makes that path dynamic on its own — only where it must be.
 */

export default async function SellerPresentationPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const libraryEnabled = process.env.SELLER_PAGES_LIBRARY_ENABLED === "true";

  // Flag-off: today's tool landing, byte-identical. No session read, no
  // ownerEmail, no library affordances.
  if (!libraryEnabled) {
    return <SellerPresentationWizard />;
  }

  const session = await auth();
  const ownerEmail = session?.user?.email ?? null;

  const sp = await searchParams;
  const idParam = sp?.id;
  const hasId =
    typeof idParam === "string"
      ? idParam.length > 0
      : Array.isArray(idParam) && idParam.length > 0;

  // A specific instance opens the wizard; the bare landing is the library.
  if (hasId) {
    return (
      <SellerPresentationWizard ownerEmail={ownerEmail} libraryEnabled />
    );
  }
  return <PagesLibrary ownerEmail={ownerEmail} />;
}
