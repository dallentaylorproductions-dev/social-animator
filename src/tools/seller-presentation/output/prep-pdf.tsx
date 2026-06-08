'use client';

import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  pdf,
} from '@react-pdf/renderer';
import {
  PDF_BORDER_WIDTHS,
  PDF_COLORS,
  PDF_FONT_FAMILY,
  PDF_FONT_SIZES,
  PDF_FONT_WEIGHTS,
  PDF_SPACING,
} from '@/lib/pdf-theme';
import {
  clampDraft,
  type Comp,
  type PitchPoint,
  type SellerPresentationDraft,
} from '../engine/types';
import {
  formatPriceRangeDisplay,
  isPriceRangeActive,
} from '../engine/price-range';
import {
  getPricingStrategyById,
  type PricingStrategy,
} from '@/tools/seller-intelligence-report/content/pricing-strategies';
import type { AgentBranding } from './public-payload';

/**
 * Seller Presentation — agent-only prep PDF (v1.47 / A7e).
 *
 * The PRIVATE companion to the public seller page (/h/[slug]). The
 * seller page hides every private field the wizard captures; this
 * PDF surfaces them so the agent walks into the listing appointment
 * with their full strategy in one printable doc.
 *
 * Privacy boundary: this module reads the raw `SellerPresentationDraft`
 * directly (the wizard already lives behind auth — there is no public
 * API route for this PDF). It is intentionally NOT routed through
 * `toPublicPayload`; if it were, the private content would be filtered
 * out. The publish path is the only thing that touches the public
 * payload, and a regression test (publish-allowlist spec, plus the
 * new prep-pdf companion spec) verifies private fields never leak the
 * other direction either.
 *
 * Design language: matches the rest of the SEP PDF family (OH Prep,
 * SIR, Listing Presentation, Listing Flyer, Open House Promo) — uses
 * `pdf-theme.ts` tokens, Helvetica family (the documented house
 * default), and the established design DNA: rule-emphasis header
 * band, uppercase-tracked section headings, mint accent for the
 * "designed number moment" on the recommended price, alternating-row
 * comp table, dense letter-portrait layout. The seller page's
 * Instrument Serif display heading can't be reproduced without
 * adding TTFs (react-pdf doesn't consume WOFF2); the closest
 * equivalent here is Helvetica-Bold at display size + the SEP mint.
 */

const dash = (v: string | undefined): string => (v && v.trim() ? v : '—');

function addressSlug(address: string | undefined): string {
  if (!address) return 'untitled';
  return (
    address
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 64) || 'untitled'
  );
}

function todayLabel(): string {
  return new Date().toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

const CONFIDENCE_LABEL: Record<'high' | 'medium' | 'low', string> = {
  high: 'High confidence',
  medium: 'Medium confidence',
  low: 'Low confidence',
};

const styles = StyleSheet.create({
  page: {
    paddingHorizontal: 36,
    paddingVertical: 32,
    fontFamily: PDF_FONT_FAMILY,
    fontSize: PDF_FONT_SIZES.base,
    color: PDF_COLORS.text,
  },

  // Header band
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingBottom: PDF_SPACING['3'],
    marginBottom: PDF_SPACING['4'],
    borderBottomWidth: PDF_BORDER_WIDTHS.emphasis,
    borderBottomColor: PDF_COLORS.ruleEmphasis,
  },
  headerEyebrow: {
    fontSize: PDF_FONT_SIZES.xs,
    fontWeight: PDF_FONT_WEIGHTS.semibold,
    letterSpacing: 1.4,
    textTransform: 'uppercase',
    color: PDF_COLORS.mint,
  },
  headerAgentName: {
    fontSize: PDF_FONT_SIZES.xl,
    fontWeight: PDF_FONT_WEIGHTS.bold,
    marginTop: 3,
  },
  headerBrokerage: {
    fontSize: PDF_FONT_SIZES.xs,
    color: PDF_COLORS.textMuted,
    marginTop: 2,
  },
  headerRightTop: {
    fontSize: PDF_FONT_SIZES.xs,
    color: PDF_COLORS.textMuted,
    textAlign: 'right',
  },
  headerRightSub: {
    fontSize: PDF_FONT_SIZES.xs,
    color: PDF_COLORS.textMuted,
    textAlign: 'right',
    marginTop: 2,
  },

  // Property identity block
  identityKicker: {
    fontSize: PDF_FONT_SIZES.xs,
    fontWeight: PDF_FONT_WEIGHTS.semibold,
    letterSpacing: 1.4,
    textTransform: 'uppercase',
    color: PDF_COLORS.textMuted,
    marginBottom: 4,
  },
  identityPreparedFor: {
    fontSize: PDF_FONT_SIZES.sm,
    fontStyle: 'italic',
    color: PDF_COLORS.textMuted,
    marginBottom: 6,
  },
  identityAddress: {
    fontSize: PDF_FONT_SIZES['2xl'],
    fontWeight: PDF_FONT_WEIGHTS.bold,
    lineHeight: 1.15,
  },
  identityCity: {
    fontSize: PDF_FONT_SIZES.base,
    color: PDF_COLORS.textMuted,
    marginTop: 3,
  },

  // The designed number moment — recommended price
  priceHero: {
    marginTop: PDF_SPACING['6'],
    paddingVertical: PDF_SPACING['4'],
    paddingHorizontal: PDF_SPACING['4'],
    borderLeftWidth: PDF_BORDER_WIDTHS.emphasis,
    borderLeftColor: PDF_COLORS.ruleEmphasis,
    backgroundColor: PDF_COLORS.paperMuted,
  },
  priceEyebrow: {
    fontSize: PDF_FONT_SIZES.xs,
    fontWeight: PDF_FONT_WEIGHTS.semibold,
    letterSpacing: 1.4,
    textTransform: 'uppercase',
    color: PDF_COLORS.textMuted,
  },
  priceBig: {
    fontSize: PDF_FONT_SIZES.display,
    fontWeight: PDF_FONT_WEIGHTS.bold,
    color: PDF_COLORS.text,
    marginTop: 4,
    lineHeight: 1.05,
  },
  priceMeta: {
    flexDirection: 'row',
    gap: PDF_SPACING['4'],
    marginTop: PDF_SPACING['3'],
    flexWrap: 'wrap',
  },
  priceMetaItem: {
    flexDirection: 'column',
  },
  priceMetaLabel: {
    fontSize: PDF_FONT_SIZES.xs,
    color: PDF_COLORS.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  priceMetaValue: {
    fontSize: PDF_FONT_SIZES.sm,
    fontWeight: PDF_FONT_WEIGHTS.semibold,
    marginTop: 2,
  },
  rationaleBlock: {
    marginTop: PDF_SPACING['3'],
    paddingTop: PDF_SPACING['3'],
    borderTopWidth: PDF_BORDER_WIDTHS.hairline,
    borderTopColor: PDF_COLORS.rule,
  },
  rationaleHeading: {
    fontSize: PDF_FONT_SIZES.xs,
    fontWeight: PDF_FONT_WEIGHTS.semibold,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    color: PDF_COLORS.textMuted,
    marginBottom: 4,
  },
  rationaleBody: {
    fontSize: PDF_FONT_SIZES.sm,
    lineHeight: 1.5,
    color: PDF_COLORS.text,
  },

  // Section heading
  sectionHeading: {
    fontSize: PDF_FONT_SIZES.xs,
    fontWeight: PDF_FONT_WEIGHTS.bold,
    textTransform: 'uppercase',
    letterSpacing: 1.2,
    color: PDF_COLORS.textMuted,
    marginBottom: PDF_SPACING['2'],
    marginTop: PDF_SPACING['6'],
  },
  sectionLead: {
    fontSize: PDF_FONT_SIZES.sm,
    color: PDF_COLORS.textMuted,
    fontStyle: 'italic',
    marginBottom: PDF_SPACING['2'],
  },
  body: {
    fontSize: PDF_FONT_SIZES.sm,
    lineHeight: 1.5,
    marginBottom: PDF_SPACING['2'],
  },

  // Strategy detail block (named framework + detail + talking points)
  strategyTitle: {
    fontSize: PDF_FONT_SIZES.base,
    fontWeight: PDF_FONT_WEIGHTS.semibold,
    marginBottom: 4,
  },
  strategyBestFor: {
    fontSize: PDF_FONT_SIZES.xs,
    color: PDF_COLORS.textMuted,
    fontStyle: 'italic',
    marginTop: PDF_SPACING['2'],
  },
  bulletRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginTop: 4,
  },
  bulletDot: {
    width: 3,
    height: 3,
    borderRadius: 1.5,
    backgroundColor: PDF_COLORS.mint,
    marginTop: 6,
    marginRight: 8,
  },
  bulletText: {
    flex: 1,
    fontSize: PDF_FONT_SIZES.sm,
    lineHeight: 1.45,
  },

  // Pitch-point card
  pitchCard: {
    marginTop: PDF_SPACING['2'],
    paddingVertical: PDF_SPACING['2'],
    paddingHorizontal: PDF_SPACING['3'],
    borderLeftWidth: PDF_BORDER_WIDTHS.default,
    borderLeftColor: PDF_COLORS.rule,
  },
  pitchCardPrivate: {
    borderLeftColor: PDF_COLORS.mint,
  },
  pitchTitle: {
    fontSize: PDF_FONT_SIZES.sm,
    fontWeight: PDF_FONT_WEIGHTS.semibold,
  },
  pitchSupport: {
    fontSize: PDF_FONT_SIZES.sm,
    color: PDF_COLORS.textMuted,
    marginTop: 3,
    lineHeight: 1.4,
  },

  // Comp card
  compCard: {
    marginTop: PDF_SPACING['2'],
    paddingVertical: PDF_SPACING['3'],
    paddingHorizontal: PDF_SPACING['3'],
    borderWidth: PDF_BORDER_WIDTHS.hairline,
    borderColor: PDF_COLORS.rule,
  },
  compTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  compAddress: {
    fontSize: PDF_FONT_SIZES.sm,
    fontWeight: PDF_FONT_WEIGHTS.semibold,
    flex: 1,
    paddingRight: PDF_SPACING['3'],
  },
  compPrice: {
    fontSize: PDF_FONT_SIZES.lg,
    fontWeight: PDF_FONT_WEIGHTS.bold,
    color: PDF_COLORS.text,
  },
  compMetaRow: {
    flexDirection: 'row',
    gap: PDF_SPACING['3'],
    marginTop: 4,
    flexWrap: 'wrap',
  },
  compMetaItem: {
    fontSize: PDF_FONT_SIZES.xs,
    color: PDF_COLORS.textMuted,
  },
  compPrivateBlock: {
    marginTop: PDF_SPACING['2'],
    paddingTop: PDF_SPACING['2'],
    borderTopWidth: PDF_BORDER_WIDTHS.hairline,
    borderTopColor: PDF_COLORS.rule,
  },
  compPrivateLabel: {
    fontSize: PDF_FONT_SIZES.xs,
    fontWeight: PDF_FONT_WEIGHTS.semibold,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    color: PDF_COLORS.mint,
    marginBottom: 3,
  },
  compPrivateNotes: {
    fontSize: PDF_FONT_SIZES.sm,
    color: PDF_COLORS.text,
    lineHeight: 1.4,
  },
  compPrivateMeta: {
    fontSize: PDF_FONT_SIZES.xs,
    color: PDF_COLORS.textMuted,
    marginTop: 3,
  },

  // Two-column list (commitments / asks)
  twoColRow: {
    flexDirection: 'row',
    gap: PDF_SPACING['6'],
    marginTop: PDF_SPACING['2'],
  },
  twoColColumn: {
    flex: 1,
  },
  listLabel: {
    fontSize: PDF_FONT_SIZES.xs,
    fontWeight: PDF_FONT_WEIGHTS.semibold,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    color: PDF_COLORS.text,
    marginBottom: 4,
  },

  // Pre-appointment notes block
  notesBlock: {
    marginTop: PDF_SPACING['2'],
    paddingVertical: PDF_SPACING['3'],
    paddingHorizontal: PDF_SPACING['3'],
    backgroundColor: PDF_COLORS.paperMuted,
    borderLeftWidth: PDF_BORDER_WIDTHS.default,
    borderLeftColor: PDF_COLORS.gold,
  },
  notesLine: {
    fontSize: PDF_FONT_SIZES.sm,
    lineHeight: 1.5,
  },

  // Footer
  footer: {
    marginTop: PDF_SPACING['8'],
    paddingTop: PDF_SPACING['3'],
    borderTopWidth: PDF_BORDER_WIDTHS.hairline,
    borderTopColor: PDF_COLORS.rule,
    fontSize: PDF_FONT_SIZES.xs,
    color: PDF_COLORS.textMuted,
  },
});

interface PrepPdfProps {
  draft: SellerPresentationDraft;
  agentContact?: AgentBranding;
}

/**
 * Has-content checks reused throughout. A pitch point with neither
 * title nor text is a wizard-default empty row (StepPitch seeds
 * INITIAL_VISIBLE_ROWS empties); skip them so the PDF doesn't render
 * blank cards. Mirrors StepReview's `hasContent` and the public-
 * payload projector's drop rule for empty rows.
 */
function pitchHasContent(p: PitchPoint): boolean {
  return ((p.title ?? p.text ?? '').trim()).length > 0;
}

function compHasPrivateDetail(c: Comp): boolean {
  if (c.notes && c.notes.trim()) return true;
  if (c.source && c.source.trim()) return true;
  if (c.fieldConfidence && Object.keys(c.fieldConfidence).length > 0) {
    return true;
  }
  return false;
}

function formatFieldConfidence(fc: Comp['fieldConfidence']): string {
  if (!fc) return '';
  const entries = Object.entries(fc).filter(([, level]) => Boolean(level));
  if (entries.length === 0) return '';
  return entries.map(([field, level]) => `${field}: ${level}`).join(' · ');
}

export function SellerPresentationPrepPdf({
  draft: rawDraft,
  agentContact,
}: PrepPdfProps) {
  const draft = clampDraft(rawDraft);
  const strategy: PricingStrategy | undefined = draft.pricingStrategyId
    ? getPricingStrategyById(draft.pricingStrategyId)
    : undefined;
  const confidenceLabel = draft.confidence
    ? CONFIDENCE_LABEL[draft.confidence]
    : undefined;

  const privatePitchPoints = draft.pitchPoints.filter(
    (p) => p.visibility === 'private' && pitchHasContent(p),
  );
  const publicPitchPoints = draft.pitchPoints.filter(
    (p) => p.visibility === 'public' && pitchHasContent(p),
  );

  const comps = draft.comps;
  const preAppointmentNotes = (draft.preAppointmentNotes ?? '').trim();
  const commitments = draft.commitments.filter((c) => c.trim());
  const asks = draft.asks.filter((a) => a.trim());

  const cityLine = [draft.propertyCity, draft.propertyState, draft.propertyZip]
    .filter((s) => s && s.trim())
    .join(', ');

  return (
    <Document
      title={`Listing Prep — ${draft.propertyAddress || 'Untitled'}`}
      author={agentContact?.name || undefined}
    >
      <Page size="LETTER" style={styles.page}>
        {/* Header band */}
        <View style={styles.header}>
          <View>
            <Text style={styles.headerEyebrow}>Listing Appointment Prep</Text>
            <Text style={styles.headerAgentName}>
              {agentContact?.name || 'Agent prep document'}
            </Text>
            {agentContact?.brokerage ? (
              <Text style={styles.headerBrokerage}>{agentContact.brokerage}</Text>
            ) : null}
          </View>
          <View>
            <Text style={styles.headerRightTop}>{todayLabel()}</Text>
            <Text style={styles.headerRightSub}>Private — agent only</Text>
          </View>
        </View>

        {/* Property identity */}
        <Text style={styles.identityKicker}>Property</Text>
        {draft.preparedFor ? (
          <Text style={styles.identityPreparedFor}>
            Prepared for {draft.preparedFor}
          </Text>
        ) : null}
        <Text style={styles.identityAddress}>
          {dash(draft.propertyAddress)}
        </Text>
        {cityLine ? <Text style={styles.identityCity}>{cityLine}</Text> : null}

        {/* The designed number moment */}
        <View style={styles.priceHero}>
          <Text style={styles.priceEyebrow}>Recommended list price</Text>
          {/* UX-2a — show the low–high range when set; else the single price. */}
          <Text style={styles.priceBig}>
            {isPriceRangeActive(
              draft.recommendedPriceLow,
              draft.recommendedPriceHigh,
            )
              ? formatPriceRangeDisplay(
                  draft.recommendedPriceLow!,
                  draft.recommendedPriceHigh!,
                )
              : dash(draft.recommendedPrice)}
          </Text>
          <View style={styles.priceMeta}>
            <View style={styles.priceMetaItem}>
              <Text style={styles.priceMetaLabel}>Strategy</Text>
              <Text style={styles.priceMetaValue}>
                {strategy?.name ?? dash(draft.pricingStrategyId)}
              </Text>
            </View>
            <View style={styles.priceMetaItem}>
              <Text style={styles.priceMetaLabel}>Comp-set confidence</Text>
              <Text style={styles.priceMetaValue}>
                {confidenceLabel ?? '—'}
              </Text>
            </View>
          </View>
          {draft.priceRationale && draft.priceRationale.trim() ? (
            <View style={styles.rationaleBlock}>
              <Text style={styles.rationaleHeading}>Rationale</Text>
              <Text style={styles.rationaleBody}>{draft.priceRationale}</Text>
            </View>
          ) : null}
        </View>

        {/* Strategy framework detail (from the SIR catalog) */}
        {strategy ? (
          <>
            <Text style={styles.sectionHeading}>Strategy framework</Text>
            <Text style={styles.strategyTitle}>{strategy.name}</Text>
            <Text style={styles.body}>{strategy.detailedDescription}</Text>
            {strategy.talkingPoints.length > 0 ? (
              <View>
                {strategy.talkingPoints.map((tp, i) => (
                  <View key={i} style={styles.bulletRow}>
                    <View style={styles.bulletDot} />
                    <Text style={styles.bulletText}>{tp}</Text>
                  </View>
                ))}
              </View>
            ) : null}
            <Text style={styles.strategyBestFor}>Best for: {strategy.bestFor}</Text>
          </>
        ) : null}

        {/* Comps with private detail */}
        {comps.length > 0 ? (
          <>
            <Text style={styles.sectionHeading}>Comparable sales reference</Text>
            <Text style={styles.sectionLead}>
              Public per-comp fields render on the seller page. Private notes,
              source, and field-level confidence below stay in this document.
            </Text>
            {comps.map((comp, i) => {
              const metaItems = [
                comp.soldDate ? `Sold ${comp.soldDate}` : null,
                comp.squareFeet ? `${comp.squareFeet} sq ft` : null,
                comp.daysOnMarket ? `${comp.daysOnMarket} DOM` : null,
                comp.saleToListPercent ? `${comp.saleToListPercent} S/L` : null,
                comp.distanceMiles ? `${comp.distanceMiles} mi` : null,
              ].filter((s): s is string => Boolean(s));
              const hasPrivate = compHasPrivateDetail(comp);
              const confidenceLine = formatFieldConfidence(comp.fieldConfidence);
              return (
                <View key={i} style={styles.compCard}>
                  <View style={styles.compTopRow}>
                    <Text style={styles.compAddress}>{dash(comp.address)}</Text>
                    <Text style={styles.compPrice}>{dash(comp.soldPrice)}</Text>
                  </View>
                  {metaItems.length > 0 ? (
                    <View style={styles.compMetaRow}>
                      {metaItems.map((m, j) => (
                        <Text key={j} style={styles.compMetaItem}>
                          {m}
                        </Text>
                      ))}
                    </View>
                  ) : null}
                  {hasPrivate ? (
                    <View style={styles.compPrivateBlock}>
                      <Text style={styles.compPrivateLabel}>Private detail</Text>
                      {comp.notes && comp.notes.trim() ? (
                        <Text style={styles.compPrivateNotes}>{comp.notes}</Text>
                      ) : null}
                      {comp.source && comp.source.trim() ? (
                        <Text style={styles.compPrivateMeta}>
                          Source: {comp.source}
                        </Text>
                      ) : null}
                      {confidenceLine ? (
                        <Text style={styles.compPrivateMeta}>
                          Field confidence: {confidenceLine}
                        </Text>
                      ) : null}
                    </View>
                  ) : null}
                </View>
              );
            })}
          </>
        ) : null}

        {/* Private pitch points — the agent-only talking points */}
        {privatePitchPoints.length > 0 ? (
          <>
            <Text style={styles.sectionHeading}>Private talking points</Text>
            <Text style={styles.sectionLead}>
              Not published to the seller page. Keep these in your pocket for
              the conversation.
            </Text>
            {privatePitchPoints.map((p) => (
              <View
                key={p.id}
                style={[styles.pitchCard, styles.pitchCardPrivate]}
              >
                <Text style={styles.pitchTitle}>
                  {(p.title ?? p.text ?? '').trim()}
                </Text>
                {p.support && p.support.trim() ? (
                  <Text style={styles.pitchSupport}>{p.support}</Text>
                ) : null}
              </View>
            ))}
          </>
        ) : null}

        {/* Public pitch points — reference (they're on the seller page too) */}
        {publicPitchPoints.length > 0 ? (
          <>
            <Text style={styles.sectionHeading}>
              Public talking points (also on the seller page)
            </Text>
            {publicPitchPoints.map((p) => (
              <View key={p.id} style={styles.pitchCard}>
                <Text style={styles.pitchTitle}>
                  {(p.title ?? p.text ?? '').trim()}
                </Text>
                {p.support && p.support.trim() ? (
                  <Text style={styles.pitchSupport}>{p.support}</Text>
                ) : null}
              </View>
            ))}
          </>
        ) : null}

        {/* Pre-appointment notes */}
        {preAppointmentNotes ? (
          <>
            <Text style={styles.sectionHeading}>Pre-appointment notes</Text>
            <View style={styles.notesBlock}>
              {preAppointmentNotes.split('\n').map((line, i) => (
                <Text key={i} style={styles.notesLine}>
                  {line || ' '}
                </Text>
              ))}
            </View>
          </>
        ) : null}

        {/* Commitments + Asks */}
        {(commitments.length > 0 || asks.length > 0) ? (
          <>
            <Text style={styles.sectionHeading}>Commitments &amp; asks</Text>
            <View style={styles.twoColRow}>
              <View style={styles.twoColColumn}>
                <Text style={styles.listLabel}>I commit to</Text>
                {commitments.length > 0 ? (
                  commitments.map((c, i) => (
                    <View key={i} style={styles.bulletRow}>
                      <View style={styles.bulletDot} />
                      <Text style={styles.bulletText}>{c}</Text>
                    </View>
                  ))
                ) : (
                  <Text style={styles.body}>—</Text>
                )}
              </View>
              <View style={styles.twoColColumn}>
                <Text style={styles.listLabel}>I need from you</Text>
                {asks.length > 0 ? (
                  asks.map((a, i) => (
                    <View key={i} style={styles.bulletRow}>
                      <View style={styles.bulletDot} />
                      <Text style={styles.bulletText}>{a}</Text>
                    </View>
                  ))
                ) : (
                  <Text style={styles.body}>—</Text>
                )}
              </View>
            </View>
          </>
        ) : null}

        {/* Footer */}
        {agentContact &&
        (agentContact.name ||
          agentContact.brokerage ||
          agentContact.phone ||
          agentContact.email) ? (
          <Text style={styles.footer}>
            {[
              agentContact.name,
              agentContact.brokerage,
              agentContact.phone,
              agentContact.email,
            ]
              .filter(Boolean)
              .join(' · ')}
            {agentContact.licenseNumber
              ? ` · License ${agentContact.licenseNumber}`
              : ''}
          </Text>
        ) : null}
      </Page>
    </Document>
  );
}

async function triggerDownload(blob: Blob, filename: string): Promise<void> {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export async function downloadSellerPresentationPrepPdf(
  draft: SellerPresentationDraft,
  agentContact?: AgentBranding,
  filename?: string,
): Promise<void> {
  const blob = await pdf(
    <SellerPresentationPrepPdf draft={draft} agentContact={agentContact} />,
  ).toBlob();
  await triggerDownload(
    blob,
    filename ?? `Listing-Prep-${addressSlug(draft.propertyAddress)}.pdf`,
  );
}
