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
  addressSlug,
  clampDraft,
  type SellerIntelligenceReportDraft,
} from '../engine/types';
import {
  getObjectionById,
  type ObjectionEntry,
} from '../content/objections';
import {
  getPricingStrategyById,
  type PricingStrategy,
} from '../content/pricing-strategies';
import { computeRangeFromConfidence } from '../content/range-confidence';

/**
 * Seller Intelligence Report — agent-facing PDF.
 *
 * Defense-at-boundary (Refinement #12): clampDraft is invoked at the top
 * of the Document so historical / partial draft shapes render without
 * crashing. Optional fields fall back to '—' rather than 'undefined'.
 *
 * Column widths (Refinement #6): address >=120pt, notes >=140pt. Total
 * comp-table width fits Letter content area (612pt page - 72pt total
 * horizontal margins = 540pt available).
 */

const PRIMARY_DEFAULT = '#0a0a0a';
const ACCENT_DEFAULT = '#4ef2d9';
const TEXT_PRIMARY = '#0a0a0a';
const TEXT_MUTED = '#666666';
const RULE = '#d4d4d4';
const ROW_ALT = '#f6f6f6';

const styles = StyleSheet.create({
  page: {
    paddingHorizontal: 36,
    paddingVertical: 32,
    fontFamily: 'Helvetica',
    fontSize: 10,
    color: TEXT_PRIMARY,
  },

  // Header band
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingBottom: 12,
    marginBottom: 16,
    borderBottomWidth: 2,
  },
  headerLeftTitle: { fontSize: 14, fontWeight: 'bold' },
  headerLeftSub: { fontSize: 9, color: TEXT_MUTED, marginTop: 2 },
  headerRightTop: { fontSize: 9, color: TEXT_MUTED, textAlign: 'right' },
  headerRightSub: { fontSize: 9, color: TEXT_MUTED, textAlign: 'right', marginTop: 2 },

  // Price hero
  priceHero: {
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginBottom: 14,
    borderWidth: 1,
    borderRadius: 4,
  },
  priceEyebrow: {
    fontSize: 8,
    letterSpacing: 1.2,
    color: TEXT_MUTED,
  },
  priceBig: { fontSize: 28, fontWeight: 'bold', marginTop: 4 },
  priceRange: { fontSize: 10, color: TEXT_MUTED, marginTop: 4 },

  // Section
  sectionHeading: {
    fontSize: 10,
    fontWeight: 'bold',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    color: TEXT_MUTED,
    marginBottom: 6,
    marginTop: 10,
  },
  transparencyBody: { fontSize: 10, lineHeight: 1.45, marginBottom: 6 },

  // Comp table
  compTableHeaderRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    paddingVertical: 4,
  },
  compRow: {
    flexDirection: 'row',
    paddingVertical: 4,
    paddingHorizontal: 2,
  },
  compRowAlt: { backgroundColor: ROW_ALT },
  compHeaderCell: { fontSize: 8, fontWeight: 'bold', color: TEXT_MUTED, paddingHorizontal: 2 },
  compCell: { fontSize: 9, paddingHorizontal: 2 },
  // Column widths (Refinement #6) — totals to 540pt of Letter content
  colAddress: { width: 140 },
  colSoldPrice: { width: 70 },
  colDom: { width: 40 },
  colRatio: { width: 50 },
  colSqft: { width: 50 },
  colDist: { width: 40 },
  colNotes: { width: 150 },

  // Strategy box
  strategyBox: {
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderLeftWidth: 3,
    marginBottom: 4,
  },
  strategyName: { fontSize: 11, fontWeight: 'bold' },
  strategyDesc: { fontSize: 10, marginTop: 4, color: TEXT_MUTED },
  strategyBullet: { fontSize: 10, marginTop: 3 },

  // Notes / objections
  notesBody: { fontSize: 10, lineHeight: 1.45 },
  objectionItem: { marginBottom: 8 },
  objectionTrigger: { fontSize: 10, fontStyle: 'italic', color: TEXT_PRIMARY },
  objectionResponse: { fontSize: 10, marginTop: 3, lineHeight: 1.4, color: '#333' },

  // Two-column commitments + asks
  twoCol: { flexDirection: 'row', gap: 14, marginTop: 4 },
  twoColColumn: { flex: 1 },
  bulletLine: { fontSize: 10, marginTop: 3, lineHeight: 1.35 },

  italicMuted: { fontSize: 10, fontStyle: 'italic', color: TEXT_MUTED },
});

function todayIso(): string {
  const d = new Date();
  return d.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

interface ResolvedObjection {
  id: string;
  entry: ObjectionEntry;
  responseText: string;
}

function resolveObjections(
  selectedIds: string[],
  overrides: Record<string, string> | undefined,
): ResolvedObjection[] {
  const result: ResolvedObjection[] = [];
  for (const id of selectedIds) {
    const entry = getObjectionById(id);
    if (!entry) continue;
    const override = overrides?.[id]?.trim();
    result.push({
      id,
      entry,
      responseText: override && override.length > 0 ? override : entry.response,
    });
  }
  return result;
}

function dash(value: string | undefined): string {
  if (!value || !value.trim()) return '—';
  return value;
}

function confidenceWording(c: 'high' | 'medium' | 'low' | undefined): string {
  switch (c) {
    case 'high':
      return "a high-confidence comp set — a tighter range reflects how well the data anchors the price";
    case 'low':
      return "a thinner comp set — a wider range signals real uncertainty in the data";
    case 'medium':
    default:
      return "a typical comp set — the range reflects normal market variance";
  }
}

function buildTransparencyLines(
  draft: SellerIntelligenceReportDraft,
  comps: ReturnType<typeof clampDraft>['comps'],
  strategy: PricingStrategy | undefined,
): string[] {
  const lines: string[] = [];

  // Sentence 1: comp count + distance summary
  const n = comps.length;
  if (n > 0) {
    const distances = comps
      .map((c) => parseFloat((c.distanceMiles ?? '').replace(/[^0-9.]/g, '')))
      .filter((d) => Number.isFinite(d) && d > 0);
    if (distances.length === comps.length && distances.length > 0) {
      const avg = distances.reduce((a, b) => a + b, 0) / distances.length;
      lines.push(
        `Based on ${n} recent comparable ${n === 1 ? 'sale' : 'sales'} within an average distance of ${avg.toFixed(1)} miles.`,
      );
    } else {
      lines.push(
        `Based on ${n} recent comparable ${n === 1 ? 'sale' : 'sales'} drawn from the local market.`,
      );
    }
  }

  // Sentence 2: sale-to-list median
  const ratios = comps
    .map((c) => parseFloat((c.saleToListPercent ?? '').replace(/[^0-9.]/g, '')))
    .filter((r) => Number.isFinite(r) && r > 0);
  if (ratios.length === comps.length && ratios.length > 0) {
    const sorted = [...ratios].sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)];
    lines.push(`Median sale-to-list ratio across these comps: ${median.toFixed(0)}%.`);
  }

  // Sentence 3: strategy
  if (strategy) {
    lines.push(
      `Recommended strategy: ${strategy.name}. ${strategy.talkingPoints[0] ?? strategy.oneLineDescription}`,
    );
  }

  // Sentence 4: confidence framing
  lines.push(`Confidence in this price is ${draft.confidence ?? 'medium'} — ${confidenceWording(draft.confidence)}.`);

  return lines;
}

export function SellerIntelligenceReportPdf({
  draft: rawDraft,
}: {
  draft: SellerIntelligenceReportDraft;
}) {
  const draft = clampDraft(rawDraft);
  const comps = draft.comps ?? [];
  const objections = resolveObjections(
    draft.selectedObjectionIds ?? [],
    draft.objectionOverrides,
  );
  const commitments = (draft.commitments ?? []).filter((s) => s.trim());
  const asks = (draft.asks ?? []).filter((s) => s.trim());
  const strategy = draft.pricingStrategyId
    ? getPricingStrategyById(draft.pricingStrategyId)
    : undefined;
  const range = computeRangeFromConfidence(draft.recommendedListPrice, draft.confidence);
  const primary = draft.primaryColor || PRIMARY_DEFAULT;
  const accent = draft.accentColor || ACCENT_DEFAULT;
  const transparencyLines = buildTransparencyLines(draft, comps, strategy);

  return (
    <Document>
      <Page size="LETTER" style={styles.page}>
        {/* Header band */}
        <View style={[styles.header, { borderBottomColor: primary }]}>
          <View>
            <Text style={styles.headerLeftTitle}>
              {dash(draft.propertyAddress)}
            </Text>
            {draft.propertyCity && (
              <Text style={styles.headerLeftSub}>{draft.propertyCity}</Text>
            )}
            {draft.ownerName && (
              <Text style={styles.headerLeftSub}>Owner: {draft.ownerName}</Text>
            )}
          </View>
          <View>
            <Text style={styles.headerRightTop}>Seller Intelligence Report</Text>
            <Text style={styles.headerRightSub}>Listing appointment — {todayIso()}</Text>
          </View>
        </View>

        {/* Price hero */}
        <View style={[styles.priceHero, { borderColor: accent }]}>
          <Text style={styles.priceEyebrow}>RECOMMENDED LIST PRICE</Text>
          <Text style={styles.priceBig}>{dash(draft.recommendedListPrice)}</Text>
          {range && (
            <Text style={styles.priceRange}>
              Range: {range.low} – {range.high}  (confidence: {draft.confidence ?? 'medium'})
            </Text>
          )}
        </View>

        {/* How we got to this price */}
        <Text style={styles.sectionHeading}>How we got to this price</Text>
        {transparencyLines.map((line, i) => (
          <Text key={i} style={styles.transparencyBody}>
            {line}
          </Text>
        ))}

        {/* Comp analysis */}
        <Text style={styles.sectionHeading}>
          Comparable sales ({comps.length})
        </Text>
        {comps.length === 0 ? (
          <Text style={styles.italicMuted}>No comps provided.</Text>
        ) : (
          <View>
            <View style={[styles.compTableHeaderRow, { borderBottomColor: primary }]}>
              <Text style={[styles.compHeaderCell, styles.colAddress]}>Address</Text>
              <Text style={[styles.compHeaderCell, styles.colSoldPrice]}>Sold</Text>
              <Text style={[styles.compHeaderCell, styles.colDom]}>DOM</Text>
              <Text style={[styles.compHeaderCell, styles.colRatio]}>S/L %</Text>
              <Text style={[styles.compHeaderCell, styles.colSqft]}>Sq Ft</Text>
              <Text style={[styles.compHeaderCell, styles.colDist]}>Dist</Text>
              <Text style={[styles.compHeaderCell, styles.colNotes]}>Notes</Text>
            </View>
            {comps.map((comp, i) => (
              <View
                key={i}
                style={[styles.compRow, i % 2 === 1 ? styles.compRowAlt : {}]}
              >
                <Text style={[styles.compCell, styles.colAddress]}>{dash(comp.address)}</Text>
                <Text style={[styles.compCell, styles.colSoldPrice]}>{dash(comp.soldPrice)}</Text>
                <Text style={[styles.compCell, styles.colDom]}>{dash(comp.daysOnMarket)}</Text>
                <Text style={[styles.compCell, styles.colRatio]}>{dash(comp.saleToListPercent)}</Text>
                <Text style={[styles.compCell, styles.colSqft]}>{dash(comp.squareFeet)}</Text>
                <Text style={[styles.compCell, styles.colDist]}>{dash(comp.distanceMiles)}</Text>
                <Text style={[styles.compCell, styles.colNotes]}>{dash(comp.notes)}</Text>
              </View>
            ))}
          </View>
        )}

        {/* Pricing strategy */}
        <Text style={styles.sectionHeading}>Pricing strategy</Text>
        {strategy ? (
          <View style={[styles.strategyBox, { borderLeftColor: accent }]}>
            <Text style={styles.strategyName}>{strategy.name}</Text>
            <Text style={styles.strategyDesc}>{strategy.detailedDescription}</Text>
            {strategy.talkingPoints.map((tp, i) => (
              <Text key={i} style={styles.strategyBullet}>
                • {tp}
              </Text>
            ))}
          </View>
        ) : (
          <Text style={styles.italicMuted}>Strategy not selected.</Text>
        )}

        {/* Pre-appointment notes */}
        {draft.preAppointmentNotes && draft.preAppointmentNotes.trim() && (
          <>
            <Text style={styles.sectionHeading}>Pre-appointment notes</Text>
            {draft.preAppointmentNotes.split('\n').map((line, i) => (
              <Text key={i} style={styles.notesBody}>
                {line || ' '}
              </Text>
            ))}
          </>
        )}

        {/* Objections */}
        {objections.length > 0 && (
          <>
            <Text style={styles.sectionHeading}>If they bring up…</Text>
            <View>
              {objections.map(({ id, entry, responseText }) => (
                <View key={id} style={styles.objectionItem}>
                  <Text style={styles.objectionTrigger}>▸ {entry.trigger}</Text>
                  <Text style={styles.objectionResponse}>{responseText}</Text>
                </View>
              ))}
            </View>
          </>
        )}

        {/* Commitments + asks */}
        {(commitments.length > 0 || asks.length > 0) && (
          <>
            <Text style={styles.sectionHeading}>Commitments & asks</Text>
            <View style={styles.twoCol}>
              {commitments.length > 0 && (
                <View style={styles.twoColColumn}>
                  <Text style={styles.strategyName}>What I&apos;ll do</Text>
                  {commitments.map((c, i) => (
                    <Text key={i} style={styles.bulletLine}>
                      • {c}
                    </Text>
                  ))}
                </View>
              )}
              {asks.length > 0 && (
                <View style={styles.twoColColumn}>
                  <Text style={styles.strategyName}>What I need from you</Text>
                  {asks.map((a, i) => (
                    <Text key={i} style={styles.bulletLine}>
                      • {a}
                    </Text>
                  ))}
                </View>
              )}
            </View>
          </>
        )}
      </Page>
    </Document>
  );
}

export async function downloadSellerIntelligenceReportPdf(
  draft: SellerIntelligenceReportDraft,
  filename?: string,
): Promise<void> {
  const blob = await pdf(<SellerIntelligenceReportPdf draft={draft} />).toBlob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename ?? `SIR-${addressSlug(draft.propertyAddress) || 'untitled'}.pdf`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

void RULE; // imported color constant reserved for future divider use
