import type { HandoutRecord } from '@/lib/share-urls';
import {
  clampDraft,
  type Comp,
  type NeighborhoodFact,
  type OpenHousePrepDraft,
} from '../engine/types';
import { clampPublicHandoutData } from './public-payload';
import { HandoutDownloadButton } from './HandoutDownloadButton';

/**
 * Visitor-facing handout page (OH Prep Commit 5 / Audit 1C §3).
 *
 * Server-rendered React component consumed by /h/[slug]/page.tsx when
 * handout.type === 'open-house-handout'. NO react-pdf imports — keeps
 * react-pdf out of the server bundle. The "Download PDF" button is a
 * separate client component (HandoutDownloadButton) that dynamic-imports
 * the PDF renderer browser-side.
 *
 * 6 sections per D11, ordered "valuable things in the front" per
 * Aaron's 2026-05-14 framing. v1.45.2 removed the standalone
 * "What to do next" section and merged its text/call/email CTAs into
 * the "Your agent" section. The whole "Your agent" section is hidden
 * when the publishing agent's brand profile has no agentName (no
 * "Your agent" placeholder text on public URLs).
 */

export interface HandoutAgentContact {
  name?: string;
  brokerage?: string;
  phone?: string;
  email?: string;
  licenseNumber?: string;
}

export function OpenHouseHandoutPage({ handout }: { handout: HandoutRecord }) {
  // Read-time data-minimization clamp: re-run the publish-time allowlist on
  // the stored record so a pre-fix / hand-edited record that still carries
  // private fields (e.g. preEventNotes) has them dropped here — they never
  // reach the renderer OR get serialized to the client via the download
  // button's props. New records are already minimal, so this is a no-op.
  const publicData = clampPublicHandoutData(handout.data);
  const draft = clampDraft(publicData);
  const agentContact: HandoutAgentContact =
    publicData.agentContact ?? { email: handout.ownerEmail };
  // v1.45.2 P3-NEW03: only render the "Your agent" section when the
  // publishing agent has populated their brand profile. Otherwise the
  // visitor sees literal placeholder text ("Your agent") which reads
  // generic / unbranded. StepReview shows a warning banner pre-publish
  // when brand profile is incomplete.
  const hasAgentInfo = Boolean(agentContact.name?.trim());

  return (
    <main className="min-h-screen bg-canvas text-text-primary">
      <div className="mx-auto max-w-2xl px-4 sm:px-6 py-8 sm:py-12 flex flex-col gap-16">
        <Section1Hero draft={draft} />
        <Section2WhyThisHome draft={draft} />
        <Section3RecentSales comps={draft.comps} />
        <Section4Neighborhood facts={draft.neighborhoodFacts} />
        <Section5MarketContext text={draft.marketContext} />
        {hasAgentInfo && <Section6YourAgent agentContact={agentContact} />}
        <HandoutDownloadButton draft={draft} agentContact={agentContact} />
        <FooterTimestamp createdAt={handout.createdAt} updatedAt={handout.updatedAt} />
      </div>
    </main>
  );
}

// ---------- Section 1: Hero ----------

function Section1Hero({ draft }: { draft: OpenHousePrepDraft }) {
  return (
    <section className="flex flex-col gap-4">
      {draft.propertyPhotoUrl && (
        <div className="relative rounded-2xl overflow-hidden border border-border-hairline">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={draft.propertyPhotoUrl}
            alt={draft.propertyAddress}
            className="w-full h-auto aspect-[4/3] object-cover"
          />
        </div>
      )}
      <div className="flex flex-col gap-2">
        <p className="text-xs uppercase tracking-[0.18em] text-mint font-medium">
          Open house
        </p>
        <h1 className="text-3xl sm:text-4xl font-bold leading-tight tracking-tight">
          {draft.propertyAddress || 'Open house'}
        </h1>
        {draft.propertyCity && (
          <p className="text-sm text-text-secondary">{draft.propertyCity}</p>
        )}
      </div>
      <div className="flex items-baseline gap-3 flex-wrap">
        <span className="text-3xl sm:text-4xl font-bold text-mint">
          {draft.listPrice || '—'}
        </span>
        {(draft.beds || draft.baths || draft.squareFeet) && (
          <span className="text-sm text-text-secondary">
            {[
              draft.beds && `${draft.beds} BR`,
              draft.baths && `${draft.baths} BA`,
              draft.squareFeet && `${draft.squareFeet} sq ft`,
            ]
              .filter(Boolean)
              .join(' · ')}
          </span>
        )}
      </div>
      {(draft.eventDate || draft.eventStartTime) && (
        <p className="text-xs uppercase tracking-[0.18em] text-text-muted">
          {draft.eventDate}
          {draft.eventStartTime
            ? ` · ${draft.eventStartTime}${draft.eventEndTime ? ` – ${draft.eventEndTime}` : ''}`
            : ''}
        </p>
      )}
    </section>
  );
}

// ---------- Section 2: Why this home ----------

function Section2WhyThisHome({ draft }: { draft: OpenHousePrepDraft }) {
  if (!draft.positioningNarrative || !draft.positioningNarrative.trim()) return null;
  return (
    <section className="flex flex-col gap-3">
      <p className="text-xs uppercase tracking-[0.18em] text-mint font-medium">
        Why this home
      </p>
      <p className="text-base leading-relaxed text-text-primary whitespace-pre-wrap">
        {draft.positioningNarrative}
      </p>
    </section>
  );
}

// ---------- Section 3: Recent area sales ----------

function Section3RecentSales({ comps }: { comps: Comp[] }) {
  if (!comps || comps.length === 0) return null;
  return (
    <section className="flex flex-col gap-3">
      <p className="text-xs uppercase tracking-[0.18em] text-mint font-medium">
        Recent area sales
      </p>
      <div className="flex flex-col gap-3">
        {comps.map((comp, i) => (
          <div
            key={i}
            className="rounded-xl border border-border-hairline bg-surface p-4 flex flex-col gap-2"
          >
            <div className="flex items-baseline justify-between gap-3 flex-wrap">
              <span className="text-sm font-semibold text-text-primary">
                {comp.address || '—'}
              </span>
              <span className="text-base font-semibold text-mint">
                {comp.soldPrice || '—'}
              </span>
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-text-muted">
              {comp.daysOnMarket && <span>{comp.daysOnMarket} DOM</span>}
              {comp.saleToListPercent && <span>{comp.saleToListPercent} S/L</span>}
              {comp.squareFeet && <span>{comp.squareFeet} sq ft</span>}
              {comp.distanceMiles && <span>{comp.distanceMiles} mi</span>}
              {comp.soldDate && <span>{comp.soldDate}</span>}
            </div>
            {comp.notes && comp.notes.trim() && (
              <p className="text-xs text-text-secondary leading-relaxed italic">
                {comp.notes}
              </p>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}

// ---------- Section 4: Neighborhood at a glance ----------

function Section4Neighborhood({ facts }: { facts: NeighborhoodFact[] }) {
  if (!facts || facts.length === 0) return null;
  return (
    <section className="flex flex-col gap-3">
      <p className="text-xs uppercase tracking-[0.18em] text-mint font-medium">
        Neighborhood at a glance
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        {facts.map((fact, i) => (
          <div
            key={i}
            className="rounded-xl border border-border-hairline bg-surface p-4 flex flex-col gap-1"
          >
            <span className="text-xs uppercase tracking-[0.18em] text-text-muted">
              {fact.label}
            </span>
            <span className="text-base font-semibold text-text-primary">
              {fact.value}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}

// ---------- Section 5: Market context ----------

function Section5MarketContext({ text }: { text: string | undefined }) {
  if (!text || !text.trim()) return null;
  return (
    <section className="flex flex-col gap-3">
      <p className="text-xs uppercase tracking-[0.18em] text-mint font-medium">
        Market context
      </p>
      <p className="text-base leading-relaxed text-text-secondary whitespace-pre-wrap">
        {text}
      </p>
    </section>
  );
}

// ---------- Section 6: Your agent (with contact CTAs) ----------

/**
 * "Your agent" + contact CTAs combined. v1.45.2 merged the standalone
 * Section 7 ("What to do next") CTAs into this section — the section
 * heading "What to do next" rendered as an empty heading on prior
 * deploys when phone/email were absent, and the visitor's "what to do
 * next" is conceptually how-to-reach-the-agent. One section.
 *
 * Only rendered by the parent when agentContact.name is non-empty
 * (P3-NEW03 — no "Your agent" placeholder text on public URLs).
 */
function Section6YourAgent({ agentContact }: { agentContact: HandoutAgentContact }) {
  const phone = agentContact.phone?.replace(/[^0-9+]/g, '');
  const email = agentContact.email;
  const hasCtas = Boolean(phone) || Boolean(email);

  return (
    <section className="flex flex-col gap-3">
      <p className="text-xs uppercase tracking-[0.18em] text-mint font-medium">
        Your agent
      </p>
      <div className="rounded-2xl border border-border-emphasis bg-surface-elevated p-6 flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <h2 className="text-xl font-bold text-text-primary">
            {agentContact.name}
          </h2>
          {agentContact.brokerage && (
            <p className="text-sm text-text-secondary">{agentContact.brokerage}</p>
          )}
          {agentContact.licenseNumber && (
            <p className="text-xs text-text-muted">License {agentContact.licenseNumber}</p>
          )}
        </div>
        {hasCtas && (
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
            {phone && (
              <a
                href={`sms:${phone}`}
                className="inline-flex items-center justify-center rounded-full bg-mint text-black text-base font-semibold px-6 py-4 transition hover:bg-mint-hover"
              >
                Text the agent
              </a>
            )}
            {phone && (
              <a
                href={`tel:${phone}`}
                className="inline-flex items-center justify-center rounded-full border border-border-emphasis text-text-primary text-base font-medium px-6 py-4 transition hover:bg-surface-elevated"
              >
                Call
              </a>
            )}
            {email && (
              <a
                href={`mailto:${email}?subject=${encodeURIComponent('Open house inquiry')}`}
                className="inline-flex items-center justify-center rounded-full border border-border-emphasis text-text-primary text-base font-medium px-6 py-4 transition hover:bg-surface-elevated"
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
    label = new Date(updated).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  } catch {
    /* fall through to raw string */
  }
  return (
    <p className="text-xs text-text-muted text-center mt-4">Last updated {label}</p>
  );
}
