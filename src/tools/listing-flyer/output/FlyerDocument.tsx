"use client";

import {
  Document,
  Page,
  View,
  Text,
  Image,
  StyleSheet,
} from "@react-pdf/renderer";
import { type FlyerDraft } from "../engine/types";
import { type BrandSettings } from "@/lib/brand";
import { pickContrastText, pickContrastMuted } from "../engine/contrast";

interface FlyerDocumentProps {
  draft: FlyerDraft;
  /** Photo URLs (object URLs or data URLs). First entry is the hero. */
  photoUrls: string[];
  brand: BrandSettings;
}

const PT_PER_INCH = 72;
const MARGIN = PT_PER_INCH * 0.5;

const styles = StyleSheet.create({
  page: {
    fontFamily: "Helvetica",
    fontSize: 10,
    color: "#0a0a0a",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: MARGIN,
    paddingVertical: 18,
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
    fontSize: 12,
    fontFamily: "Helvetica-Bold",
  },
  headerBrokerage: {
    fontSize: 9,
    opacity: 0.7,
  },
  headerRight: {
    fontSize: 8,
    textAlign: "right",
    opacity: 0.85,
  },
  body: {
    paddingHorizontal: MARGIN,
    paddingTop: 12,
    paddingBottom: 12,
  },
  statusBadge: {
    alignSelf: "flex-start",
    fontSize: 8,
    fontFamily: "Helvetica-Bold",
    color: "#000",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    marginBottom: 12,
    textTransform: "uppercase",
    letterSpacing: 1.2,
  },
  hero: {
    width: "100%",
    height: 252, // ~3.5 inches at 72dpi
    objectFit: "cover",
    borderRadius: 4,
    backgroundColor: "#e5e5e5",
  },
  addressRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    marginTop: 16,
  },
  addressBlock: {
    flex: 1,
    paddingRight: 16,
  },
  addressLine1: {
    fontSize: 22,
    fontFamily: "Helvetica-Bold",
    lineHeight: 1.15,
  },
  addressLine2: {
    fontSize: 11,
    color: "#525252",
    marginTop: 2,
  },
  price: {
    fontSize: 32,
    fontFamily: "Helvetica-Bold",
  },
  stats: {
    fontSize: 11,
    fontFamily: "Helvetica-Bold",
    color: "#404040",
    letterSpacing: 0.6,
    marginTop: 8,
  },
  features: {
    marginTop: 14,
  },
  featureRow: {
    flexDirection: "row",
    marginBottom: 4,
    alignItems: "flex-start",
  },
  featureBullet: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    marginTop: 4,
    marginRight: 8,
  },
  featureText: {
    fontSize: 10,
    color: "#262626",
    lineHeight: 1.4,
    flex: 1,
  },
  photoGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginTop: 14,
    gap: 6,
  },
  gridPhoto: {
    width: "49%",
    height: 110,
    objectFit: "cover",
    borderRadius: 3,
    backgroundColor: "#e5e5e5",
  },
  footer: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: MARGIN,
    paddingVertical: 12,
    flexDirection: "row",
    justifyContent: "space-between",
    color: "#fff",
  },
  footerLeft: {
    fontSize: 8,
    fontFamily: "Helvetica-Bold",
  },
  footerRight: {
    fontSize: 8,
    opacity: 0.8,
  },
});

export function FlyerDocument({ draft, photoUrls, brand }: FlyerDocumentProps) {
  const heroUrl = photoUrls[0];
  const additionalUrls = photoUrls.slice(1);
  const primary = brand.primaryColor || "#4ef2d9";
  const accent = brand.accentColor || "#0a0a0a";
  const background = brand.backgroundColor || "#ffffff";

  // Auto-flip text colors based on background luminance so the page remains
  // readable across light/dark backgrounds. Same formula used by FlyerPreview
  // so the on-screen preview matches the PDF.
  const textPrimary = pickContrastText(background);
  const textMuted = pickContrastMuted(background);
  // Status badge sits on `primary`, not the page bg — separate contrast check.
  const badgeTextColor = pickContrastText(primary);

  const statsParts: string[] = [];
  if (draft.beds)
    statsParts.push(`${draft.beds} BED${draft.beds === "1" ? "" : "S"}`);
  if (draft.baths)
    statsParts.push(`${draft.baths} BATH${draft.baths === "1" ? "" : "S"}`);
  if (draft.sqft) statsParts.push(`${draft.sqft} SQ FT`);

  const features = draft.features.filter((f) => f.trim().length > 0);

  return (
    <Document
      title={`Listing Flyer — ${draft.addressLine1 || "Untitled"}`}
      author={brand.agentName || undefined}
    >
      <Page
        size="LETTER"
        style={[styles.page, { backgroundColor: background, color: textPrimary }]}
      >
        {/* Header band */}
        <View style={[styles.header, { backgroundColor: accent, color: "#fff" }]}>
          {brand.logoDataUrl ? (
            <Image src={brand.logoDataUrl} style={styles.logo} />
          ) : (
            <Text style={[styles.logoFallback, { backgroundColor: primary, color: "#000" }]}>
              LOGO
            </Text>
          )}
          <View style={styles.headerCenter}>
            <Text style={[styles.headerName, { color: "#fff" }]}>
              {brand.agentName || "Your name"}
            </Text>
            {brand.brokerage ? (
              <Text style={[styles.headerBrokerage, { color: "#fff" }]}>
                {brand.brokerage}
              </Text>
            ) : null}
          </View>
          <View>
            {brand.contactPhone ? (
              <Text style={[styles.headerRight, { color: "#fff" }]}>
                {brand.contactPhone}
              </Text>
            ) : null}
            {brand.contactEmail ? (
              <Text style={[styles.headerRight, { color: "#fff" }]}>
                {brand.contactEmail}
              </Text>
            ) : null}
          </View>
        </View>

        {/* Body */}
        <View style={styles.body}>
          {draft.status ? (
            <Text
              style={[
                styles.statusBadge,
                { backgroundColor: primary, color: badgeTextColor },
              ]}
            >
              {draft.status}
            </Text>
          ) : null}

          {heroUrl ? <Image src={heroUrl} style={styles.hero} /> : null}

          <View style={styles.addressRow}>
            <View style={styles.addressBlock}>
              <Text style={styles.addressLine1}>
                {draft.addressLine1 || "Street address"}
              </Text>
              {draft.addressLine2 ? (
                <Text style={[styles.addressLine2, { color: textMuted }]}>
                  {draft.addressLine2}
                </Text>
              ) : null}
            </View>
            <Text style={[styles.price, { color: primary }]}>
              {draft.price || "$—"}
            </Text>
          </View>

          {statsParts.length > 0 ? (
            <Text style={[styles.stats, { color: textPrimary }]}>
              {statsParts.join("    •    ")}
            </Text>
          ) : null}

          {features.length > 0 ? (
            <View style={styles.features}>
              {features.map((feature, i) => (
                <View key={i} style={styles.featureRow}>
                  <View
                    style={[
                      styles.featureBullet,
                      { backgroundColor: primary },
                    ]}
                  />
                  <Text style={[styles.featureText, { color: textPrimary }]}>
                    {feature}
                  </Text>
                </View>
              ))}
            </View>
          ) : null}

          {additionalUrls.length > 0 ? (
            <View style={styles.photoGrid}>
              {additionalUrls.map((url, i) => (
                <Image key={i} src={url} style={styles.gridPhoto} />
              ))}
            </View>
          ) : null}
        </View>

        {/* Footer band — pinned to page bottom via absolute positioning */}
        <View style={[styles.footer, { backgroundColor: accent }]}>
          <Text style={styles.footerLeft}>
            {brand.agentName || "Your name"}
            {brand.licenseNumber
              ? `  ·  License #${brand.licenseNumber.replace(/^#/, "")}`
              : ""}
          </Text>
          <Text style={styles.footerRight}>
            {[brand.contactPhone, brand.contactEmail]
              .filter(Boolean)
              .join("  ·  ")}
          </Text>
        </View>
      </Page>
    </Document>
  );
}
