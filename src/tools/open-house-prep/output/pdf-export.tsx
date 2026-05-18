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
  PDF_COLORS,
  PDF_FONT_FAMILY,
  PDF_FONT_SIZES,
  PDF_FONT_WEIGHTS,
  PDF_SPACING,
  PDF_BORDER_WIDTHS,
} from '@/lib/pdf-theme';
import {
  addressSlug,
  clampDraft,
  type OpenHousePrepDraft,
} from '../engine/types';
import {
  getTalkingPointById,
  TALKING_POINTS,
} from '../content/talking-points';
import {
  COMMON_QUESTIONS,
  getQuestionById,
} from '../content/common-questions';
import {
  CONVERSION_PROMPTS,
  getPromptById,
} from '../content/conversion-prompts';

/**
 * Two react-pdf <Document>s in one file:
 *
 *   OpenHousePrepAgentPdf — the agent's private prep document. Walks
 *     through talking points, common questions, conversion prompts,
 *     comp reference, neighborhood facts, pre-event notes, follow-up
 *     commitments. Letter portrait, dense.
 *
 *   OpenHouseHandoutPdf — visitor-facing portable copy of the web
 *     handout. Same 7-section structure as handout-page.tsx but
 *     rendered to PDF. Letter portrait; printable.
 *
 * Both consume pdf-theme tokens (no literal hex). Defense-at-boundary
 * via clampDraft at the Document entry point; optional fields fall
 * back to em-dash via dash() rather than 'undefined'.
 *
 * Download helpers below; each does the @react-pdf/renderer pdf()
 * call + URL.createObjectURL + anchor click + revoke pattern that
 * LP / SIR already use.
 */

const dash = (v: string | undefined): string =>
  v && v.trim() ? v : '—';

const styles = StyleSheet.create({
  page: {
    paddingHorizontal: 36,
    paddingVertical: 32,
    fontFamily: PDF_FONT_FAMILY,
    fontSize: PDF_FONT_SIZES.base,
    color: PDF_COLORS.text,
  },

  // Shared header band
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingBottom: PDF_SPACING['3'],
    marginBottom: PDF_SPACING['4'],
    borderBottomWidth: PDF_BORDER_WIDTHS.emphasis,
    borderBottomColor: PDF_COLORS.ruleEmphasis,
  },
  headerLeftTitle: { fontSize: PDF_FONT_SIZES.xl, fontWeight: PDF_FONT_WEIGHTS.bold },
  headerLeftSub: { fontSize: PDF_FONT_SIZES.xs, color: PDF_COLORS.textMuted, marginTop: 2 },
  headerRightTop: { fontSize: PDF_FONT_SIZES.xs, color: PDF_COLORS.textMuted, textAlign: 'right' },
  headerRightSub: {
    fontSize: PDF_FONT_SIZES.xs,
    color: PDF_COLORS.textMuted,
    textAlign: 'right',
    marginTop: 2,
  },

  sectionHeading: {
    fontSize: PDF_FONT_SIZES.xs,
    fontWeight: PDF_FONT_WEIGHTS.bold,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    color: PDF_COLORS.textMuted,
    marginBottom: PDF_SPACING['2'],
    marginTop: PDF_SPACING['3'],
  },
  body: { fontSize: PDF_FONT_SIZES.sm, lineHeight: 1.45, marginBottom: PDF_SPACING['2'] },
  italicMuted: { fontSize: PDF_FONT_SIZES.sm, fontStyle: 'italic', color: PDF_COLORS.textMuted },

  // Logistics row
  logisticsRow: { flexDirection: 'row', gap: PDF_SPACING['6'], marginBottom: PDF_SPACING['3'] },
  logisticsKey: { fontSize: PDF_FONT_SIZES.xs, color: PDF_COLORS.textMuted, textTransform: 'uppercase', letterSpacing: 0.8 },
  logisticsValue: { fontSize: PDF_FONT_SIZES.base, fontWeight: PDF_FONT_WEIGHTS.medium, marginTop: 2 },

  // Talking point / question / prompt items
  triggerLabel: { fontSize: PDF_FONT_SIZES.sm, fontStyle: 'italic', color: PDF_COLORS.text },
  responseBody: { fontSize: PDF_FONT_SIZES.sm, marginTop: 3, lineHeight: 1.4, color: '#333333' },
  contentItem: { marginBottom: PDF_SPACING['3'] },

  // Comp table
  compTableHeaderRow: {
    flexDirection: 'row',
    borderBottomWidth: PDF_BORDER_WIDTHS.hairline,
    borderBottomColor: PDF_COLORS.rule,
    paddingVertical: 4,
  },
  compRow: { flexDirection: 'row', paddingVertical: 4, paddingHorizontal: 2 },
  compRowAlt: { backgroundColor: PDF_COLORS.paperMuted },
  compHeaderCell: {
    fontSize: PDF_FONT_SIZES.xs,
    fontWeight: PDF_FONT_WEIGHTS.bold,
    color: PDF_COLORS.textMuted,
    paddingHorizontal: 2,
  },
  compCell: { fontSize: 9, paddingHorizontal: 2 },
  // Audit 1C §10 / SIR precedent: Address >=120pt, Notes >=140pt
  colAddress: { width: 140 },
  colSoldPrice: { width: 70 },
  colDom: { width: 40 },
  colRatio: { width: 50 },
  colSqft: { width: 50 },
  colDist: { width: 40 },
  colNotes: { width: 150 },

  // Bullets
  bulletLine: { fontSize: PDF_FONT_SIZES.sm, marginTop: 3, lineHeight: 1.35 },

  // Visitor PDF hero
  heroBlock: {
    paddingVertical: PDF_SPACING['4'],
    paddingHorizontal: PDF_SPACING['4'],
    marginBottom: PDF_SPACING['4'],
    borderWidth: PDF_BORDER_WIDTHS.default,
    borderColor: PDF_COLORS.ruleEmphasis,
    borderRadius: 4,
  },
  heroEyebrow: {
    fontSize: PDF_FONT_SIZES.xs,
    letterSpacing: 1.2,
    color: PDF_COLORS.mint,
    textTransform: 'uppercase',
    fontWeight: PDF_FONT_WEIGHTS.semibold,
  },
  heroAddress: {
    fontSize: PDF_FONT_SIZES.display,
    fontWeight: PDF_FONT_WEIGHTS.bold,
    marginTop: 6,
    lineHeight: 1.1,
  },
  heroCity: { fontSize: PDF_FONT_SIZES.base, color: PDF_COLORS.textMuted, marginTop: 4 },
  heroPrice: { fontSize: PDF_FONT_SIZES['3xl'], fontWeight: PDF_FONT_WEIGHTS.bold, marginTop: 10, color: PDF_COLORS.mint },
  heroStatsRow: { flexDirection: 'row', gap: PDF_SPACING['4'], marginTop: 8 },
  heroStat: { fontSize: PDF_FONT_SIZES.sm, color: PDF_COLORS.textMuted },

  // Two-column
  twoCol: { flexDirection: 'row', gap: PDF_SPACING['4'], marginTop: 4 },
  twoColColumn: { flex: 1 },

  // Footer
  footer: {
    fontSize: PDF_FONT_SIZES.xs,
    color: PDF_COLORS.textMuted,
    marginTop: PDF_SPACING['6'],
    paddingTop: PDF_SPACING['3'],
    borderTopWidth: PDF_BORDER_WIDTHS.hairline,
    borderTopColor: PDF_COLORS.rule,
  },
});

function todayLabel(): string {
  return new Date().toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

interface AgentContact {
  name?: string;
  brokerage?: string;
  phone?: string;
  email?: string;
  licenseNumber?: string;
}

interface AgentPdfProps {
  draft: OpenHousePrepDraft;
  agentContact?: AgentContact;
}

// =====================================================================
// Agent prep PDF — private working doc
// =====================================================================

export function OpenHousePrepAgentPdf({ draft: rawDraft, agentContact }: AgentPdfProps) {
  const draft = clampDraft(rawDraft);
  const talkingPoints = (draft.selectedTalkingPointIds ?? [])
    .map((id) => ({
      id,
      entry: getTalkingPointById(id),
      override: draft.talkingPointOverrides?.[id],
    }))
    .filter((x): x is { id: string; entry: NonNullable<ReturnType<typeof getTalkingPointById>>; override: string | undefined } => Boolean(x.entry));
  const questions = (draft.selectedCommonQuestionIds ?? [])
    .map((id) => ({
      id,
      entry: getQuestionById(id),
      override: draft.commonQuestionOverrides?.[id],
    }))
    .filter((x): x is { id: string; entry: NonNullable<ReturnType<typeof getQuestionById>>; override: string | undefined } => Boolean(x.entry));
  const prompts = (draft.selectedConversionPromptIds ?? [])
    .map((id) => ({ id, entry: getPromptById(id) }))
    .filter((x): x is { id: string; entry: NonNullable<ReturnType<typeof getPromptById>> } => Boolean(x.entry));
  const commitments = (draft.followUpCommitments ?? []).filter((c) => c.trim());
  const facts = draft.neighborhoodFacts ?? [];
  const comps = draft.comps ?? [];

  // Group questions by category (preserves library declaration order).
  const questionsByCategory = new Map<string, typeof questions>();
  for (const q of questions) {
    const arr = questionsByCategory.get(q.entry.category) ?? [];
    arr.push(q);
    questionsByCategory.set(q.entry.category, arr);
  }

  return (
    <Document>
      <Page size="LETTER" style={styles.page}>
        <View style={styles.header}>
          <View>
            <Text style={styles.headerLeftTitle}>{dash(draft.propertyAddress)}</Text>
            {draft.propertyCity && <Text style={styles.headerLeftSub}>{draft.propertyCity}</Text>}
            <Text style={styles.headerLeftSub}>List price: {dash(draft.listPrice)}</Text>
          </View>
          <View>
            <Text style={styles.headerRightTop}>Open House Prep</Text>
            <Text style={styles.headerRightSub}>{draft.eventDate || todayLabel()}</Text>
            {agentContact?.name && (
              <Text style={styles.headerRightSub}>{agentContact.name}</Text>
            )}
          </View>
        </View>

        {/* Logistics */}
        <View style={styles.logisticsRow}>
          <View>
            <Text style={styles.logisticsKey}>Date</Text>
            <Text style={styles.logisticsValue}>{dash(draft.eventDate)}</Text>
          </View>
          <View>
            <Text style={styles.logisticsKey}>Window</Text>
            <Text style={styles.logisticsValue}>
              {draft.eventStartTime || draft.eventEndTime
                ? `${dash(draft.eventStartTime)} – ${dash(draft.eventEndTime)}`
                : '—'}
            </Text>
          </View>
        </View>

        {/* Talking points */}
        {talkingPoints.length > 0 && (
          <>
            <Text style={styles.sectionHeading}>Lead with these talking points</Text>
            <View>
              {talkingPoints.map(({ id, entry, override }) => (
                <View key={id} style={styles.contentItem}>
                  <Text style={styles.triggerLabel}>▸ {entry.trigger}</Text>
                  <Text style={styles.responseBody}>
                    {override && override.trim() ? override : entry.text}
                  </Text>
                </View>
              ))}
            </View>
          </>
        )}

        {/* Common questions, grouped */}
        {questions.length > 0 && (
          <>
            <Text style={styles.sectionHeading}>If they ask…</Text>
            {Array.from(questionsByCategory.entries()).map(([category, items]) => (
              <View key={category}>
                <Text
                  style={{
                    fontSize: PDF_FONT_SIZES.xs,
                    fontWeight: PDF_FONT_WEIGHTS.semibold,
                    color: PDF_COLORS.text,
                    marginTop: PDF_SPACING['3'],
                    marginBottom: PDF_SPACING['2'],
                  }}
                >
                  {category}
                </Text>
                {items.map(({ id, entry, override }) => (
                  <View key={id} style={styles.contentItem}>
                    <Text style={styles.triggerLabel}>{entry.trigger}</Text>
                    <Text style={styles.responseBody}>
                      {override && override.trim() ? override : entry.response}
                    </Text>
                  </View>
                ))}
              </View>
            ))}
          </>
        )}

        {/* Conversion prompts */}
        {prompts.length > 0 && (
          <>
            <Text style={styles.sectionHeading}>Conversion prompts</Text>
            <View>
              {prompts.map(({ id, entry }) => (
                <View key={id} style={styles.contentItem}>
                  <Text style={styles.triggerLabel}>{entry.context}</Text>
                  <Text style={styles.responseBody}>{entry.prompt}</Text>
                </View>
              ))}
            </View>
          </>
        )}

        {/* Comp reference */}
        {comps.length > 0 && (
          <>
            <Text style={styles.sectionHeading}>Recent area sales reference</Text>
            <View>
              <View style={styles.compTableHeaderRow}>
                <Text style={[styles.compHeaderCell, styles.colAddress]}>Address</Text>
                <Text style={[styles.compHeaderCell, styles.colSoldPrice]}>Sold</Text>
                <Text style={[styles.compHeaderCell, styles.colDom]}>DOM</Text>
                <Text style={[styles.compHeaderCell, styles.colRatio]}>S/L %</Text>
                <Text style={[styles.compHeaderCell, styles.colSqft]}>Sq Ft</Text>
                <Text style={[styles.compHeaderCell, styles.colDist]}>Dist</Text>
                <Text style={[styles.compHeaderCell, styles.colNotes]}>Notes</Text>
              </View>
              {comps.map((comp, i) => (
                <View key={i} style={[styles.compRow, i % 2 === 1 ? styles.compRowAlt : {}]}>
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
          </>
        )}

        {/* Neighborhood facts */}
        {facts.length > 0 && (
          <>
            <Text style={styles.sectionHeading}>Neighborhood at a glance</Text>
            <View>
              {facts.map((f, i) => (
                <Text key={i} style={styles.bulletLine}>
                  • {f.label}: {f.value}
                </Text>
              ))}
            </View>
          </>
        )}

        {/* Market context */}
        {draft.marketContext && draft.marketContext.trim() && (
          <>
            <Text style={styles.sectionHeading}>Market context</Text>
            <Text style={styles.body}>{draft.marketContext}</Text>
          </>
        )}

        {/* Pre-event notes */}
        {draft.preEventNotes && draft.preEventNotes.trim() && (
          <>
            <Text style={styles.sectionHeading}>Pre-event notes (private)</Text>
            {draft.preEventNotes.split('\n').map((line, i) => (
              <Text key={i} style={styles.body}>
                {line || ' '}
              </Text>
            ))}
          </>
        )}

        {/* Follow-up commitments */}
        {commitments.length > 0 && (
          <>
            <Text style={styles.sectionHeading}>Follow-up commitments</Text>
            <View>
              {commitments.map((c, i) => (
                <Text key={i} style={styles.bulletLine}>
                  • {c}
                </Text>
              ))}
            </View>
          </>
        )}

        {/* Footer */}
        {(agentContact?.name || agentContact?.brokerage || agentContact?.phone) && (
          <Text style={styles.footer}>
            {[agentContact?.name, agentContact?.brokerage, agentContact?.phone]
              .filter(Boolean)
              .join(' · ')}
            {agentContact?.licenseNumber ? ` · License ${agentContact.licenseNumber}` : ''}
          </Text>
        )}
      </Page>
    </Document>
  );
}

// =====================================================================
// Visitor handout PDF — portable copy of the web /h/[slug] surface
// =====================================================================

export function OpenHouseHandoutPdf({ draft: rawDraft, agentContact }: AgentPdfProps) {
  const draft = clampDraft(rawDraft);
  const comps = draft.comps ?? [];
  const facts = draft.neighborhoodFacts ?? [];

  return (
    <Document>
      <Page size="LETTER" style={styles.page}>
        {/* Hero */}
        <View style={styles.heroBlock}>
          <Text style={styles.heroEyebrow}>Open house</Text>
          <Text style={styles.heroAddress}>{dash(draft.propertyAddress)}</Text>
          {draft.propertyCity && <Text style={styles.heroCity}>{draft.propertyCity}</Text>}
          <Text style={styles.heroPrice}>{dash(draft.listPrice)}</Text>
          {(draft.beds || draft.baths || draft.squareFeet) && (
            <View style={styles.heroStatsRow}>
              {draft.beds && <Text style={styles.heroStat}>{draft.beds} BR</Text>}
              {draft.baths && <Text style={styles.heroStat}>{draft.baths} BA</Text>}
              {draft.squareFeet && <Text style={styles.heroStat}>{draft.squareFeet} sq ft</Text>}
            </View>
          )}
        </View>

        {/* Why this home */}
        {draft.positioningNarrative && draft.positioningNarrative.trim() && (
          <>
            <Text style={styles.sectionHeading}>Why this home</Text>
            <Text style={styles.body}>{draft.positioningNarrative}</Text>
          </>
        )}

        {/* Recent area sales */}
        {comps.length > 0 && (
          <>
            <Text style={styles.sectionHeading}>Recent area sales</Text>
            <View>
              <View style={styles.compTableHeaderRow}>
                <Text style={[styles.compHeaderCell, styles.colAddress]}>Address</Text>
                <Text style={[styles.compHeaderCell, styles.colSoldPrice]}>Sold</Text>
                <Text style={[styles.compHeaderCell, styles.colDom]}>DOM</Text>
                <Text style={[styles.compHeaderCell, styles.colSqft]}>Sq Ft</Text>
                <Text style={[styles.compHeaderCell, styles.colDist]}>Dist</Text>
                <Text style={[styles.compHeaderCell, styles.colNotes]}>Notes</Text>
              </View>
              {comps.map((comp, i) => (
                <View key={i} style={[styles.compRow, i % 2 === 1 ? styles.compRowAlt : {}]}>
                  <Text style={[styles.compCell, styles.colAddress]}>{dash(comp.address)}</Text>
                  <Text style={[styles.compCell, styles.colSoldPrice]}>{dash(comp.soldPrice)}</Text>
                  <Text style={[styles.compCell, styles.colDom]}>{dash(comp.daysOnMarket)}</Text>
                  <Text style={[styles.compCell, styles.colSqft]}>{dash(comp.squareFeet)}</Text>
                  <Text style={[styles.compCell, styles.colDist]}>{dash(comp.distanceMiles)}</Text>
                  <Text style={[styles.compCell, styles.colNotes]}>{dash(comp.notes)}</Text>
                </View>
              ))}
            </View>
          </>
        )}

        {/* Neighborhood */}
        {facts.length > 0 && (
          <>
            <Text style={styles.sectionHeading}>Neighborhood at a glance</Text>
            <View>
              {facts.map((f, i) => (
                <Text key={i} style={styles.bulletLine}>
                  • {f.label}: {f.value}
                </Text>
              ))}
            </View>
          </>
        )}

        {/* Market context */}
        {draft.marketContext && draft.marketContext.trim() && (
          <>
            <Text style={styles.sectionHeading}>Market context</Text>
            <Text style={styles.body}>{draft.marketContext}</Text>
          </>
        )}

        {/* Your agent */}
        {(agentContact?.name || agentContact?.brokerage || agentContact?.phone) && (
          <>
            <Text style={styles.sectionHeading}>Your agent</Text>
            <Text style={styles.body}>
              {agentContact?.name ?? ''}
              {agentContact?.brokerage ? ` · ${agentContact.brokerage}` : ''}
              {agentContact?.phone ? ` · ${agentContact.phone}` : ''}
              {agentContact?.email ? ` · ${agentContact.email}` : ''}
              {agentContact?.licenseNumber ? ` · License ${agentContact.licenseNumber}` : ''}
            </Text>
          </>
        )}
      </Page>
    </Document>
  );
}

// =====================================================================
// Download helpers
// =====================================================================

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

export async function downloadOpenHousePrepPdf(
  draft: OpenHousePrepDraft,
  agentContact?: AgentContact,
  filename?: string,
): Promise<void> {
  const blob = await pdf(
    <OpenHousePrepAgentPdf draft={draft} agentContact={agentContact} />,
  ).toBlob();
  await triggerDownload(
    blob,
    filename ?? `OH-Prep-${addressSlug(draft.propertyAddress) || 'untitled'}.pdf`,
  );
}

export async function downloadOpenHouseHandoutPdf(
  draft: OpenHousePrepDraft,
  agentContact?: AgentContact,
  filename?: string,
): Promise<void> {
  const blob = await pdf(
    <OpenHouseHandoutPdf draft={draft} agentContact={agentContact} />,
  ).toBlob();
  await triggerDownload(
    blob,
    filename ?? `Open-House-${addressSlug(draft.propertyAddress) || 'handout'}.pdf`,
  );
}

// References imported but conditionally unused (e.g., bulk filter against library):
void TALKING_POINTS;
void COMMON_QUESTIONS;
void CONVERSION_PROMPTS;
