"use client";

import {
  Document,
  Page,
  View,
  Text,
  Image,
  StyleSheet,
} from "@react-pdf/renderer";
import { type PresentationDraft } from "../engine/types";
import { type BrandSettings, formatPhone } from "@/lib/brand";
import {
  pickContrastText,
  pickContrastMuted,
} from "@/tools/listing-flyer/engine/contrast";

/**
 * Single-page Letter-portrait listing presentation. Layout (top → bottom):
 *
 *   Header band   (~70pt)  brand bg, agent + brokerage + contact
 *   Property      (~75pt)  who this is for + the homeowner's address
 *   Agent block   (~110pt) headshot (left, circle) + bio (right)
 *   Track record  (~85pt)  4 stat tiles (number + label)
 *   Strategy      (~95pt)  bulleted list (hidden if all empty)
 *   Comps         (~95pt)  3-column card grid (hidden if all empty)
 *   Why choose me (~70pt)  closing pitch paragraph (hidden if empty)
 *   Footer band   (~32pt)  brand bg, agent + contact
 *
 * Numbers add to ~632pt + footer 32pt = 664pt; Letter is 792pt — comfortable
 * slack for longer bios. Footer is absolute-positioned at bottom-of-page so
 * the body's intrinsic height can flex without pushing the footer off-page.
 *
 * Empty-section hiding (strategy / comps / why-me) reclaims vertical space
 * so a sparsely-filled draft still looks deliberate rather than airy.
 */

const PT_PER_INCH = 72;
const MARGIN = PT_PER_INCH * 0.5;

const styles = StyleSheet.create({
  page: {
    fontFamily: "Helvetica",
    fontSize: 10,
    color: "#0a0a0a",
  },

  // Header
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: MARGIN,
    paddingVertical: 14,
  },
  logo: {
    height: 36,
    width: 36,
    objectFit: "contain",
  },
  logoFallback: {
    height: 36,
    width: 36,
    backgroundColor: "#000",
    color: "#fff",
    fontSize: 8,
    fontFamily: "Helvetica-Bold",
    textAlign: "center",
    paddingTop: 14,
  },
  headerCenter: {
    flex: 1,
    paddingLeft: 12,
  },
  headerName: {
    fontSize: 14,
    fontFamily: "Helvetica-Bold",
  },
  headerBrokerage: {
    fontSize: 11,
    opacity: 0.75,
    marginTop: 1,
  },
  headerRight: {
    fontSize: 10,
    textAlign: "right",
    opacity: 0.85,
  },

  // Body wrapper — paddingBottom clears the absolute-positioned footer
  body: {
    paddingHorizontal: MARGIN,
    paddingTop: 14,
    paddingBottom: 50,
  },

  // Section headers (e.g. MEET YOUR AGENT)
  sectionLabel: {
    fontSize: 8,
    fontFamily: "Helvetica-Bold",
    letterSpacing: 1.4,
    textTransform: "uppercase",
    marginBottom: 6,
  },

  // Property block
  propertyKicker: {
    fontSize: 8,
    fontFamily: "Helvetica-Bold",
    letterSpacing: 1.4,
    textTransform: "uppercase",
    marginBottom: 4,
  },
  propertyAddress: {
    fontSize: 22,
    fontFamily: "Helvetica-Bold",
    lineHeight: 1.15,
  },
  propertyCity: {
    fontSize: 11,
    marginTop: 2,
  },
  propertyOwner: {
    fontSize: 10,
    fontFamily: "Helvetica-Oblique",
    marginTop: 6,
  },

  // Agent block
  agentRow: {
    flexDirection: "row",
    marginTop: 12,
    alignItems: "flex-start",
  },
  headshot: {
    width: 84,
    height: 84,
    borderRadius: 42,
    objectFit: "cover",
  },
  headshotPlaceholder: {
    width: 84,
    height: 84,
    borderRadius: 42,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },
  headshotInitials: {
    fontSize: 30,
    fontFamily: "Helvetica-Bold",
  },
  agentBioWrap: {
    flex: 1,
    paddingLeft: 16,
  },
  agentBio: {
    fontSize: 11,
    lineHeight: 1.5,
  },

  // Track record (4 tiles)
  trackRecordRow: {
    flexDirection: "row",
    marginTop: 12,
    gap: 10,
  },
  statTile: {
    flex: 1,
    paddingVertical: 14,
    paddingHorizontal: 10,
    borderRadius: 4,
  },
  statNumber: {
    fontSize: 26,
    fontFamily: "Helvetica-Bold",
    lineHeight: 1.05,
  },
  statLabel: {
    fontSize: 8,
    fontFamily: "Helvetica-Bold",
    letterSpacing: 0.6,
    marginTop: 4,
    textTransform: "uppercase",
  },

  // Marketing strategy bullets
  strategyList: {
    marginTop: 12,
  },
  strategyRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginBottom: 5,
  },
  strategyBullet: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    marginTop: 5,
    marginRight: 8,
  },
  strategyText: {
    fontSize: 10.5,
    lineHeight: 1.5,
    flex: 1,
  },

  // Comparable sales (3-column card grid)
  compsRow: {
    flexDirection: "row",
    marginTop: 12,
    gap: 8,
  },
  compCard: {
    flex: 1,
    padding: 10,
    borderRadius: 4,
    borderWidth: 1,
  },
  compAddress: {
    fontSize: 9.5,
    fontFamily: "Helvetica-Bold",
    lineHeight: 1.25,
    minHeight: 22,
  },
  compPrice: {
    fontSize: 18,
    fontFamily: "Helvetica-Bold",
    marginTop: 8,
  },
  compMeta: {
    fontSize: 8.5,
    marginTop: 4,
    letterSpacing: 0.4,
  },

  // Why choose me
  whySection: {
    marginTop: 12,
  },
  whyText: {
    fontSize: 11,
    lineHeight: 1.55,
  },

  // Footer band
  footer: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: MARGIN,
    paddingVertical: 10,
    flexDirection: "row",
    justifyContent: "space-between",
    color: "#fff",
  },
  footerLeft: {
    fontSize: 10,
    fontFamily: "Helvetica-Bold",
  },
  footerRight: {
    fontSize: 10,
    opacity: 0.85,
  },
});

interface PresentationDocumentProps {
  draft: PresentationDraft;
  brand: BrandSettings;
}

export function PresentationDocument({
  draft,
  brand,
}: PresentationDocumentProps) {
  const primary = brand.primaryColor || "#4ef2d9";
  const accent = brand.accentColor || "#0a0a0a";
  const background = brand.backgroundColor || "#ffffff";

  // Auto-flip text colors based on background luminance — same formula
  // PresentationPreview uses so the on-screen preview matches the PDF.
  const textPrimary = pickContrastText(background);
  const textMuted = pickContrastMuted(background);
  // Tile + card surfaces use a slight tint of the page bg so they read
  // as "boxes" without needing a separate background color in the brand
  // schema. Light-bg gets a soft grey; dark-bg gets a soft lift.
  const tileBg = pickContrastText(background) === "#ffffff"
    ? "rgba(255,255,255,0.06)"
    : "#f4f4f5";
  const tileBorder = pickContrastText(background) === "#ffffff"
    ? "rgba(255,255,255,0.12)"
    : "#e4e4e7";
  const onPrimary = pickContrastText(primary);
  const headerTextColor = pickContrastText(accent);

  // Section visibility — empty sections are hidden so a sparsely-filled
  // draft still looks deliberate.
  const strategies = draft.marketingStrategies.filter(
    (s) => s.trim().length > 0
  );
  const comps = draft.comparableSales.filter(
    (c) =>
      c.address.trim() ||
      c.soldPrice.trim() ||
      c.daysOnMarket.trim() ||
      c.saleToListPercent.trim()
  );
  const showStrategies = strategies.length > 0;
  const showComps = comps.length > 0;
  const showWhy = draft.whyChooseMe.trim().length > 0;

  // Track-record stat tiles — render whatever the agent filled in.
  // Empty tiles render with em-dash so the row maintains 4 columns
  // (visual rhythm > content density when sparsely filled).
  const stats: Array<{ value: string; label: string }> = [
    { value: draft.homesSold || "—", label: "Homes Sold This Year" },
    { value: draft.averageDaysOnMarket || "—", label: "Avg Days on Market" },
    { value: draft.saleToListRatio || "—", label: "Sale-to-List Ratio" },
    { value: draft.yearsExperience || "—", label: "Years Experience" },
  ];

  // Headshot fallback — use the first letter of agent name (or "A" if
  // unset) as a colored circle so the agent block doesn't collapse.
  const headshotInitial = (
    brand.agentName.trim().charAt(0) || "A"
  ).toUpperCase();

  return (
    <Document
      title={`Listing Presentation — ${draft.propertyAddress || "Untitled"}`}
      author={brand.agentName || undefined}
    >
      <Page
        size="LETTER"
        style={[
          styles.page,
          { backgroundColor: background, color: textPrimary },
        ]}
      >
        {/* ── Header band ───────────────────────────────────── */}
        <View style={[styles.header, { backgroundColor: accent }]}>
          {brand.logoDataUrl ? (
            <Image src={brand.logoDataUrl} style={styles.logo} />
          ) : (
            <Text
              style={[
                styles.logoFallback,
                { backgroundColor: primary, color: onPrimary },
              ]}
            >
              LOGO
            </Text>
          )}
          <View style={styles.headerCenter}>
            <Text style={[styles.headerName, { color: headerTextColor }]}>
              {brand.agentName || "Your name"}
            </Text>
            {brand.brokerage ? (
              <Text
                style={[styles.headerBrokerage, { color: headerTextColor }]}
              >
                {brand.brokerage}
              </Text>
            ) : null}
          </View>
          <View>
            {brand.contactPhone ? (
              <Text style={[styles.headerRight, { color: headerTextColor }]}>
                {formatPhone(brand.contactPhone)}
              </Text>
            ) : null}
            {brand.contactEmail ? (
              <Text style={[styles.headerRight, { color: headerTextColor }]}>
                {brand.contactEmail}
              </Text>
            ) : null}
          </View>
        </View>

        {/* ── Body ──────────────────────────────────────────── */}
        <View style={styles.body}>
          {/* Property */}
          <Text style={[styles.propertyKicker, { color: primary }]}>
            Presentation for
          </Text>
          <Text style={[styles.propertyAddress, { color: textPrimary }]}>
            {draft.propertyAddress || "Property address"}
          </Text>
          {draft.propertyCity ? (
            <Text style={[styles.propertyCity, { color: textMuted }]}>
              {draft.propertyCity}
            </Text>
          ) : null}
          {draft.ownerName ? (
            <Text style={[styles.propertyOwner, { color: textMuted }]}>
              Prepared for {draft.ownerName}
            </Text>
          ) : null}

          {/* Agent */}
          <Text
            style={[styles.sectionLabel, { color: primary, marginTop: 14 }]}
          >
            Meet your agent
          </Text>
          <View style={styles.agentRow}>
            {draft.agentHeadshot ? (
              <Image src={draft.agentHeadshot} style={styles.headshot} />
            ) : (
              <View
                style={[
                  styles.headshotPlaceholder,
                  { backgroundColor: primary },
                ]}
              >
                <Text
                  style={[styles.headshotInitials, { color: onPrimary }]}
                >
                  {headshotInitial}
                </Text>
              </View>
            )}
            <View style={styles.agentBioWrap}>
              <Text style={[styles.agentBio, { color: textPrimary }]}>
                {draft.agentBio ||
                  "Add a 3-4 sentence bio in the form. Lead with your local expertise."}
              </Text>
            </View>
          </View>

          {/* Track record */}
          <Text
            style={[styles.sectionLabel, { color: primary, marginTop: 14 }]}
          >
            Track record
          </Text>
          <View style={styles.trackRecordRow}>
            {stats.map((s, i) => (
              <View
                key={i}
                style={[
                  styles.statTile,
                  { backgroundColor: tileBg },
                ]}
              >
                <Text style={[styles.statNumber, { color: primary }]}>
                  {s.value}
                </Text>
                <Text style={[styles.statLabel, { color: textMuted }]}>
                  {s.label}
                </Text>
              </View>
            ))}
          </View>

          {/* Marketing strategy */}
          {showStrategies ? (
            <>
              <Text
                style={[
                  styles.sectionLabel,
                  { color: primary, marginTop: 14 },
                ]}
              >
                Marketing strategy
              </Text>
              <View style={styles.strategyList}>
                {strategies.map((s, i) => (
                  <View key={i} style={styles.strategyRow}>
                    <View
                      style={[
                        styles.strategyBullet,
                        { backgroundColor: primary },
                      ]}
                    />
                    <Text
                      style={[styles.strategyText, { color: textPrimary }]}
                    >
                      {s}
                    </Text>
                  </View>
                ))}
              </View>
            </>
          ) : null}

          {/* Comparable sales */}
          {showComps ? (
            <>
              <Text
                style={[
                  styles.sectionLabel,
                  { color: primary, marginTop: 14 },
                ]}
              >
                Recent comparable sales
              </Text>
              <View style={styles.compsRow}>
                {comps.map((c, i) => (
                  <View
                    key={i}
                    style={[
                      styles.compCard,
                      {
                        backgroundColor: tileBg,
                        borderColor: tileBorder,
                      },
                    ]}
                  >
                    <Text style={[styles.compAddress, { color: textPrimary }]}>
                      {c.address || "—"}
                    </Text>
                    <Text style={[styles.compPrice, { color: primary }]}>
                      {c.soldPrice || "—"}
                    </Text>
                    <Text style={[styles.compMeta, { color: textMuted }]}>
                      {[
                        c.daysOnMarket ? `${c.daysOnMarket} DOM` : null,
                        c.saleToListPercent
                          ? `${c.saleToListPercent} S/L`
                          : null,
                      ]
                        .filter(Boolean)
                        .join("  ·  ")}
                    </Text>
                  </View>
                ))}
              </View>
            </>
          ) : null}

          {/* Why choose me */}
          {showWhy ? (
            <View style={styles.whySection}>
              <Text style={[styles.sectionLabel, { color: primary }]}>
                Why choose me
              </Text>
              <Text style={[styles.whyText, { color: textPrimary }]}>
                {draft.whyChooseMe}
              </Text>
            </View>
          ) : null}
        </View>

        {/* ── Footer band ──────────────────────────────────── */}
        <View style={[styles.footer, { backgroundColor: accent }]}>
          <Text style={[styles.footerLeft, { color: headerTextColor }]}>
            {brand.agentName || "Your name"}
            {brand.licenseNumber
              ? `  ·  License #${brand.licenseNumber.replace(/^#/, "")}`
              : ""}
          </Text>
          <Text style={[styles.footerRight, { color: headerTextColor }]}>
            {[formatPhone(brand.contactPhone), brand.contactEmail]
              .filter(Boolean)
              .join("  ·  ")}
          </Text>
        </View>
      </Page>
    </Document>
  );
}
