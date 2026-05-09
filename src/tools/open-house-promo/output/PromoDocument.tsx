"use client";

import {
  Document,
  Page,
  View,
  Text,
  Image,
  StyleSheet,
} from "@react-pdf/renderer";
import {
  type PromoDraft,
  formatTimeRange,
  formatEventDate,
} from "../engine/types";
import { type BrandSettings, formatPhone } from "@/lib/brand";
import {
  pickContrastText,
  pickContrastMuted,
} from "@/tools/listing-flyer/engine/contrast";

interface PromoDocumentProps {
  draft: PromoDraft;
  brand: BrandSettings;
  /** Pre-generated QR code data URL (PNG) sized for embedding —
   *  caller passes null when qrTargetUrl is empty so the document
   *  knows to hide the QR block and expand the agent block. Generated
   *  outside the document so the qrcode async API doesn't need to
   *  participate in react-pdf's render lifecycle. */
  qrDataUrl: string | null;
}

/**
 * Letter-portrait open-house promo flyer. Eight stacked blocks:
 *
 *   Header band   (~80pt)  primary-bg, centered "OPEN HOUSE" + date + time
 *   Hero photo    (~240pt) cover-cropped first photo, or stencil placeholder
 *   Property      (~95pt)  "Presenting" label + address + city + price
 *   Highlights    (~80pt)  bullet list, hidden if all empty
 *   Description   (~60pt)  paragraph, hidden if empty
 *   Agent + QR    (~120pt) two-column row; QR right side hidden if no URL
 *   Notes         (varies) optional block above footer if eventNotes present
 *   Footer band   (~36pt)  primary-bg, centered URL or notes echo
 *
 * Vertical totals: header 80 + hero 240 + property 95 + highlights 80
 * + description 60 + agent+QR 120 + footer 36 = 711pt at full bleed,
 * comfortably under Letter's 792pt. Compression mitigations from the
 * H-7b brief (hero 280→240, description 80→60, agent row 120→100) give
 * ~80pt slack so a maximally-filled draft still fits one page.
 *
 * Footer is absolute-positioned at page-bottom; body paddingBottom
 * clears it.
 */

const PT_PER_INCH = 72;
const MARGIN = PT_PER_INCH * 0.5;

const styles = StyleSheet.create({
  page: {
    fontFamily: "Helvetica",
    fontSize: 10,
    color: "#0a0a0a",
  },

  // Header band
  header: {
    paddingHorizontal: MARGIN,
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    fontSize: 28,
    fontFamily: "Helvetica-Bold",
    letterSpacing: 4,
    textTransform: "uppercase",
  },
  headerDate: {
    fontSize: 12,
    fontFamily: "Helvetica-Bold",
    marginTop: 4,
    letterSpacing: 0.6,
  },
  headerTime: {
    fontSize: 11,
    marginTop: 1,
    opacity: 0.92,
  },

  // Hero photo
  heroWrap: {
    height: 240,
    width: "100%",
    overflow: "hidden",
    backgroundColor: "#1f2937",
  },
  hero: {
    width: "100%",
    height: 240,
    objectFit: "cover",
  },
  heroPlaceholder: {
    height: 240,
    width: "100%",
    alignItems: "center",
    justifyContent: "center",
  },
  heroStencil: {
    fontSize: 44,
    fontFamily: "Helvetica-Bold",
    letterSpacing: 8,
    textTransform: "uppercase",
    opacity: 0.55,
  },

  // Body wrapper
  body: {
    paddingHorizontal: MARGIN,
    paddingTop: 16,
    paddingBottom: 50,
  },

  // Property block
  propertyKicker: {
    fontSize: 8,
    fontFamily: "Helvetica-Bold",
    letterSpacing: 1.4,
    textTransform: "uppercase",
    marginBottom: 4,
  },
  propertyRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
  },
  propertyLeft: {
    flex: 1,
    paddingRight: 16,
  },
  propertyAddress: {
    fontSize: 24,
    fontFamily: "Helvetica-Bold",
    lineHeight: 1.15,
  },
  propertyCity: {
    fontSize: 12,
    marginTop: 3,
  },
  propertyPrice: {
    fontSize: 22,
    fontFamily: "Helvetica-Bold",
  },

  // Section labels (FEATURES, etc.)
  sectionLabel: {
    fontSize: 8,
    fontFamily: "Helvetica-Bold",
    letterSpacing: 1.4,
    textTransform: "uppercase",
    marginBottom: 6,
    marginTop: 16,
  },

  // Highlights
  highlightsList: {
    flexDirection: "row",
  },
  highlightCol: {
    flex: 1,
  },
  highlightColGap: {
    width: 24,
  },
  highlightRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginBottom: 4,
  },
  highlightBullet: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    marginTop: 4,
    marginRight: 8,
  },
  highlightText: {
    fontSize: 11,
    lineHeight: 1.4,
    flex: 1,
  },

  // Description
  descriptionText: {
    fontSize: 11,
    lineHeight: 1.55,
  },

  // Agent + QR row
  agentQrRow: {
    flexDirection: "row",
    marginTop: 18,
    alignItems: "stretch",
  },
  agentBlock: {
    flex: 1,
    paddingRight: 16,
    justifyContent: "center",
  },
  agentTopRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 8,
  },
  agentLogo: {
    height: 36,
    width: 36,
    objectFit: "contain",
    marginRight: 10,
  },
  agentLogoFallback: {
    height: 36,
    width: 36,
    fontSize: 8,
    fontFamily: "Helvetica-Bold",
    textAlign: "center",
    paddingTop: 14,
    marginRight: 10,
  },
  agentName: {
    fontSize: 14,
    fontFamily: "Helvetica-Bold",
    lineHeight: 1.2,
  },
  agentBrokerage: {
    fontSize: 11,
    marginTop: 1,
  },
  agentContactLine: {
    fontSize: 10,
    lineHeight: 1.45,
  },

  qrBlock: {
    width: 110,
    alignItems: "center",
    justifyContent: "flex-start",
  },
  qrImage: {
    width: 100,
    height: 100,
    objectFit: "contain",
  },
  qrLabel: {
    fontSize: 7,
    fontFamily: "Helvetica-Bold",
    letterSpacing: 1.2,
    textTransform: "uppercase",
    marginTop: 6,
    textAlign: "center",
  },

  // Optional notes block above footer
  notesText: {
    fontSize: 10.5,
    lineHeight: 1.5,
    marginTop: 16,
    fontFamily: "Helvetica-Oblique",
  },

  // Footer band
  footer: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: MARGIN,
    paddingVertical: 9,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  footerCenter: {
    fontSize: 10,
    fontFamily: "Helvetica-Bold",
    flex: 1,
    textAlign: "center",
  },
  footerLicense: {
    fontSize: 8,
    opacity: 0.85,
  },
});

export function PromoDocument({ draft, brand, qrDataUrl }: PromoDocumentProps) {
  const primary = brand.primaryColor || "#4ef2d9";
  const accent = brand.accentColor || "#0a0a0a";
  const background = brand.backgroundColor || "#ffffff";

  // Auto-flip text colors so the page stays readable on any
  // background luminance — same formula PromoPreview uses.
  const textPrimary = pickContrastText(background);
  const textMuted = pickContrastMuted(background);
  const onPrimary = pickContrastText(primary);

  // Section visibility
  const highlights = draft.propertyHighlights.filter(
    (h) => h.trim().length > 0
  );
  const showHighlights = highlights.length > 0;
  const showDescription = draft.description.trim().length > 0;
  const showQr = !!qrDataUrl;
  const hasNotes = draft.eventNotes.trim().length > 0;
  const useTwoColHighlights = highlights.length >= 4;
  const splitAt = useTwoColHighlights
    ? Math.ceil(highlights.length / 2)
    : highlights.length;
  const leftHighlights = highlights.slice(0, splitAt);
  const rightHighlights = highlights.slice(splitAt);

  const hero = draft.photos[0];
  const hasHero = !!hero;

  const dateLabel = draft.eventDate ? formatEventDate(draft.eventDate) : "";
  const timeLabel = formatTimeRange(draft.eventStartTime, draft.eventEndTime);

  // Footer center text — prefers eventNotes, then qrTargetUrl
  // (without scheme), then property address echo.
  const footerCenter = (() => {
    if (draft.qrTargetUrl) {
      return draft.qrTargetUrl.replace(/^https?:\/\//i, "");
    }
    return draft.propertyAddress || "Open House";
  })();

  return (
    <Document
      title={`Open House — ${draft.propertyAddress || "Untitled"}`}
      author={brand.agentName || undefined}
    >
      <Page
        size="LETTER"
        style={[
          styles.page,
          { backgroundColor: background, color: textPrimary },
        ]}
      >
        {/* ── Header band ──────────────────────────────────── */}
        <View
          style={[
            styles.header,
            { backgroundColor: primary, color: onPrimary },
          ]}
        >
          <Text style={[styles.headerTitle, { color: onPrimary }]}>
            Open House
          </Text>
          {dateLabel ? (
            <Text style={[styles.headerDate, { color: onPrimary }]}>
              {dateLabel}
            </Text>
          ) : null}
          <Text style={[styles.headerTime, { color: onPrimary }]}>
            {timeLabel}
          </Text>
        </View>

        {/* ── Hero photo ──────────────────────────────────── */}
        {hasHero ? (
          <View style={styles.heroWrap}>
            <Image src={hero} style={styles.hero} />
          </View>
        ) : (
          <View
            style={[
              styles.heroPlaceholder,
              { backgroundColor: "#1f2937" },
            ]}
          >
            <Text
              style={[
                styles.heroStencil,
                { color: primary },
              ]}
            >
              Open House
            </Text>
          </View>
        )}

        {/* ── Body ──────────────────────────────────────── */}
        <View style={styles.body}>
          {/* Property */}
          <Text style={[styles.propertyKicker, { color: primary }]}>
            Presenting
          </Text>
          <View style={styles.propertyRow}>
            <View style={styles.propertyLeft}>
              <Text
                style={[styles.propertyAddress, { color: textPrimary }]}
              >
                {draft.propertyAddress || "Property address"}
              </Text>
              {draft.propertyCity ? (
                <Text style={[styles.propertyCity, { color: textMuted }]}>
                  {draft.propertyCity}
                </Text>
              ) : null}
            </View>
            {draft.listingPrice ? (
              <Text style={[styles.propertyPrice, { color: primary }]}>
                {draft.listingPrice}
              </Text>
            ) : null}
          </View>

          {/* Highlights */}
          {showHighlights ? (
            <>
              <Text style={[styles.sectionLabel, { color: primary }]}>
                Features
              </Text>
              <View style={styles.highlightsList}>
                <View style={styles.highlightCol}>
                  {leftHighlights.map((h, i) => (
                    <View key={i} style={styles.highlightRow}>
                      <View
                        style={[
                          styles.highlightBullet,
                          { backgroundColor: primary },
                        ]}
                      />
                      <Text
                        style={[
                          styles.highlightText,
                          { color: textPrimary },
                        ]}
                      >
                        {h}
                      </Text>
                    </View>
                  ))}
                </View>
                {useTwoColHighlights ? (
                  <>
                    <View style={styles.highlightColGap} />
                    <View style={styles.highlightCol}>
                      {rightHighlights.map((h, i) => (
                        <View key={i} style={styles.highlightRow}>
                          <View
                            style={[
                              styles.highlightBullet,
                              { backgroundColor: primary },
                            ]}
                          />
                          <Text
                            style={[
                              styles.highlightText,
                              { color: textPrimary },
                            ]}
                          >
                            {h}
                          </Text>
                        </View>
                      ))}
                    </View>
                  </>
                ) : null}
              </View>
            </>
          ) : null}

          {/* Description */}
          {showDescription ? (
            <Text
              style={[
                styles.descriptionText,
                { color: textPrimary, marginTop: 16 },
              ]}
            >
              {draft.description}
            </Text>
          ) : null}

          {/* Agent + QR row */}
          <View style={styles.agentQrRow}>
            <View
              style={[
                styles.agentBlock,
                { paddingRight: showQr ? 16 : 0 },
              ]}
            >
              <View style={styles.agentTopRow}>
                {brand.logoDataUrl ? (
                  <Image src={brand.logoDataUrl} style={styles.agentLogo} />
                ) : (
                  <Text
                    style={[
                      styles.agentLogoFallback,
                      { backgroundColor: primary, color: onPrimary },
                    ]}
                  >
                    LOGO
                  </Text>
                )}
                <View>
                  <Text
                    style={[styles.agentName, { color: textPrimary }]}
                  >
                    {brand.agentName || "Your name"}
                  </Text>
                  {brand.brokerage ? (
                    <Text
                      style={[styles.agentBrokerage, { color: textMuted }]}
                    >
                      {brand.brokerage}
                    </Text>
                  ) : null}
                </View>
              </View>
              {brand.contactPhone ? (
                <Text
                  style={[styles.agentContactLine, { color: textPrimary }]}
                >
                  {formatPhone(brand.contactPhone)}
                </Text>
              ) : null}
              {brand.contactEmail ? (
                <Text
                  style={[styles.agentContactLine, { color: textPrimary }]}
                >
                  {brand.contactEmail}
                </Text>
              ) : null}
            </View>

            {showQr ? (
              <View style={styles.qrBlock}>
                <Image src={qrDataUrl!} style={styles.qrImage} />
                <Text style={[styles.qrLabel, { color: primary }]}>
                  Scan for details
                </Text>
              </View>
            ) : null}
          </View>

          {/* Optional notes */}
          {hasNotes ? (
            <Text
              style={[styles.notesText, { color: textMuted }]}
            >
              {draft.eventNotes}
            </Text>
          ) : null}
        </View>

        {/* ── Footer band ─────────────────────────────────── */}
        <View
          style={[
            styles.footer,
            { backgroundColor: primary, color: onPrimary },
          ]}
        >
          <Text style={[styles.footerCenter, { color: onPrimary }]}>
            {footerCenter}
          </Text>
          {brand.licenseNumber ? (
            <Text style={[styles.footerLicense, { color: onPrimary }]}>
              License #{brand.licenseNumber.replace(/^#/, "")}
            </Text>
          ) : null}
        </View>
      </Page>
    </Document>
  );
}
