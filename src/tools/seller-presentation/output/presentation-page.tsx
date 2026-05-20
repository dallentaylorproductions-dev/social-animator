import type { HandoutRecord } from "@/lib/share-urls";
import {
  clampPublicPayload,
  type AgentBranding,
  type PublicComp,
  type PublicPayload,
} from "./public-payload";

/**
 * Seller Presentation — consumer-facing page (v1.47 / A6, FUNCTIONAL).
 *
 * Server-rendered React component consumed by /h/[slug]/page.tsx
 * when `handout.type === 'seller-presentation'`. Structure modeled on
 * src/tools/open-house-prep/output/handout-page.tsx — the same
 * mobile-first layout, the same "valuable things in the front"
 * section ordering, the same "Your agent" CTA pattern. Per A6
 * scope: this is the FUNCTIONAL renderer; the PREMIUM design +
 * themes are A7, mocked up in chat first.
 *
 * Privacy posture: reads `record.data` as `PublicPayload` (the
 * already-allowlisted shape from `toPublicPayload`). `clampPublicPayload`
 * provides defense-at-boundary — any rogue keys (e.g. if a record was
 * hand-edited in KV with private fields glued on) get silently
 * dropped. The renderer literally cannot reach into a private field
 * because the typed view doesn't include any.
 *
 * Sections (4, plus footer):
 *   1. Hero        — address + city + recommended price
 *   2. Why this price — agent-voice priceRationale (omitted when empty)
 *   3. What I'll do — public pitchPublicPoints (omitted when empty)
 *   4. Recent sales — comps.public[] (omitted when empty)
 *   5. Your agent  — agentBranding + contact CTAs (hidden when name empty)
 *   Footer         — last-updated timestamp
 *
 * No PDF download button (the agent prep PDF is private to the
 * agent, not for sellers — distinct from OH Prep where the visitor
 * downloads a take-home handout).
 */

export function SellerPresentationPage({
  handout,
}: {
  handout: HandoutRecord;
}) {
  const payload = clampPublicPayload(handout.data);
  const hasAgentInfo = Boolean(payload.agentBranding.name?.trim());

  return (
    <main
      className="min-h-screen bg-canvas text-text-primary"
      data-testid="seller-presentation-public"
    >
      <div className="mx-auto flex max-w-2xl flex-col gap-16 px-4 py-8 sm:px-6 sm:py-12">
        <Section1Hero payload={payload} />
        <Section2WhyThisPrice rationale={payload.priceRationale} />
        <Section3WhatIllDo points={payload.pitchPublicPoints} />
        <Section4RecentSales comps={payload.comps} />
        {hasAgentInfo && (
          <Section5YourAgent agentBranding={payload.agentBranding} />
        )}
        <FooterTimestamp
          createdAt={handout.createdAt}
          updatedAt={handout.updatedAt}
        />
      </div>
    </main>
  );
}

// ---------- Section 1: Hero ----------

function Section1Hero({ payload }: { payload: PublicPayload }) {
  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <p className="text-xs font-medium uppercase tracking-[0.18em] text-mint">
          Seller presentation
        </p>
        <h1 className="text-3xl font-bold leading-tight tracking-tight sm:text-4xl">
          {payload.propertyAddress || "Your home"}
        </h1>
        {payload.propertyCity && (
          <p className="text-sm text-text-secondary">{payload.propertyCity}</p>
        )}
      </div>
      <div className="flex flex-col gap-1">
        <span className="text-xs uppercase tracking-[0.18em] text-text-muted">
          Recommended price
        </span>
        <span className="text-3xl font-bold text-mint sm:text-4xl">
          {payload.recommendedPrice || "—"}
        </span>
      </div>
    </section>
  );
}

// ---------- Section 2: Why this price ----------

function Section2WhyThisPrice({ rationale }: { rationale?: string }) {
  if (!rationale || !rationale.trim()) return null;
  return (
    <section className="flex flex-col gap-3">
      <p className="text-xs font-medium uppercase tracking-[0.18em] text-mint">
        Why this price
      </p>
      <p className="whitespace-pre-wrap text-base leading-relaxed text-text-primary">
        {rationale}
      </p>
    </section>
  );
}

// ---------- Section 3: What I'll do ----------

function Section3WhatIllDo({ points }: { points: string[] }) {
  if (!points || points.length === 0) return null;
  return (
    <section className="flex flex-col gap-3">
      <p className="text-xs font-medium uppercase tracking-[0.18em] text-mint">
        What I&apos;ll do
      </p>
      <ul className="flex flex-col gap-3">
        {points.map((text, i) => (
          <li
            key={i}
            className="flex items-start gap-3 rounded-xl border border-border-hairline bg-surface p-4"
          >
            <span
              aria-hidden
              className="mt-1 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-mint"
            />
            <p className="text-base leading-relaxed text-text-primary">{text}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}

// ---------- Section 4: Recent area sales ----------

function Section4RecentSales({ comps }: { comps: PublicComp[] }) {
  if (!comps || comps.length === 0) return null;
  return (
    <section className="flex flex-col gap-3">
      <p className="text-xs font-medium uppercase tracking-[0.18em] text-mint">
        Recent area sales
      </p>
      <div className="flex flex-col gap-3">
        {comps.map((comp, i) => (
          <div
            key={i}
            className="flex flex-col gap-2 rounded-xl border border-border-hairline bg-surface p-4"
          >
            <div className="flex flex-wrap items-baseline justify-between gap-3">
              <span className="text-sm font-semibold text-text-primary">
                {comp.address || "—"}
              </span>
              <span className="text-base font-semibold text-mint">
                {comp.soldPrice || "—"}
              </span>
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-text-muted">
              {comp.daysOnMarket && <span>{comp.daysOnMarket} DOM</span>}
              {comp.saleToListPercent && (
                <span>{comp.saleToListPercent} S/L</span>
              )}
              {comp.squareFeet && <span>{comp.squareFeet} sq ft</span>}
              {comp.distanceMiles && <span>{comp.distanceMiles} mi</span>}
              {comp.soldDate && <span>{comp.soldDate}</span>}
            </div>
            {/* No notes field rendered — public-payload allowlist drops
                comp[].notes / source / fieldConfidence before persistence,
                and the typed PublicComp doesn't expose them anyway. */}
          </div>
        ))}
      </div>
    </section>
  );
}

// ---------- Section 5: Your agent ----------

function Section5YourAgent({
  agentBranding,
}: {
  agentBranding: AgentBranding;
}) {
  const phone = agentBranding.phone?.replace(/[^0-9+]/g, "");
  const email = agentBranding.email;
  const hasCtas = Boolean(phone) || Boolean(email);

  return (
    <section className="flex flex-col gap-3">
      <p className="text-xs font-medium uppercase tracking-[0.18em] text-mint">
        Your agent
      </p>
      <div className="flex flex-col gap-4 rounded-2xl border border-border-emphasis bg-surface-elevated p-6">
        <div className="flex flex-col gap-2">
          <h2 className="text-xl font-bold text-text-primary">
            {agentBranding.name}
          </h2>
          {agentBranding.brokerage && (
            <p className="text-sm text-text-secondary">
              {agentBranding.brokerage}
            </p>
          )}
          {agentBranding.licenseNumber && (
            <p className="text-xs text-text-muted">
              License {agentBranding.licenseNumber}
            </p>
          )}
        </div>
        {hasCtas && (
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
            {phone && (
              <a
                href={`sms:${phone}`}
                className="inline-flex items-center justify-center rounded-full bg-mint px-6 py-4 text-base font-semibold text-black transition hover:bg-mint-hover"
              >
                Text the agent
              </a>
            )}
            {phone && (
              <a
                href={`tel:${phone}`}
                className="inline-flex items-center justify-center rounded-full border border-border-emphasis px-6 py-4 text-base font-medium text-text-primary transition hover:bg-surface-elevated"
              >
                Call
              </a>
            )}
            {email && (
              <a
                href={`mailto:${email}?subject=${encodeURIComponent("Listing presentation follow-up")}`}
                className="inline-flex items-center justify-center rounded-full border border-border-emphasis px-6 py-4 text-base font-medium text-text-primary transition hover:bg-surface-elevated"
              >
                Email
              </a>
            )}
          </div>
        )}
      </div>
    </section>
  );
}

// ---------- Footer ----------

function FooterTimestamp({
  createdAt,
  updatedAt,
}: {
  createdAt: string;
  updatedAt: string;
}) {
  const updated = updatedAt || createdAt;
  let label = updated;
  try {
    label = new Date(updated).toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  } catch {
    /* fall through to raw string */
  }
  return (
    <p className="mt-4 text-center text-xs text-text-muted">
      Last updated {label}
    </p>
  );
}
